const { Op } = require('sequelize');
const {
  Quotation, QuotationItem, Hold, HoldItem, Customer, Warehouse, Product,
  Sale, SaleItem, SalesPayment, sequelize,
} = require('../models/associations');
const { asyncHandler, generateReferenceCode } = require('../utils/helpers');
const { adjustStock } = require('../utils/stockService');
const { todayISO } = require('../utils/date');
const HttpError = require('../utils/httpError');
const {
  computeSaleLine,
  nonNegativeNumber,
  applyProductFinancialSnapshot,
} = require('../utils/saleLine');

/* ---------------- Quotations ---------------- */

const quotationInclude = [Customer, Warehouse, { model: QuotationItem, as: 'items', include: [Product] }];

const listQuotations = asyncHandler(async (req, res) => {
  const where = {};
  if (req.query.customer_id) where.customer_id = req.query.customer_id;
  if (req.query.warehouse_id) where.warehouse_id = req.query.warehouse_id;
  if (req.query.status) where.status = req.query.status;
  const quotations = await Quotation.findAll({ where, include: quotationInclude, order: [['id', 'DESC']] });
  res.json({ data: quotations });
});

const getQuotation = asyncHandler(async (req, res) => {
  const quotation = await Quotation.findByPk(req.params.id, { include: quotationInclude });
  if (!quotation) return res.status(404).json({ message: 'Quotation not found' });
  res.json({ data: quotation });
});

// Builds and validates quotation line items using the same trusted-server
// computation as POS sales, so a quotation can never be saved with NaN
// totals, an over-100% discount, or a discount that exceeds the line total.
// It also snapshots the product's current cost/standard price so the shop
// owner can see quoted profit even if the catalogue changes later.
async function buildQuotationLines(items, transaction) {
  if (!Array.isArray(items) || !items.length) {
    throw new HttpError(400, 'Add at least one item to the quotation.');
  }

  const computedItems = items.map((item, index) => computeSaleLine({ ...item, is_manual: false }, index));
  const productIds = [...new Set(computedItems.map((item) => item.product_id).filter(Boolean))];

  const products = productIds.length
    ? await Product.findAll({ where: { id: { [Op.in]: productIds } }, transaction })
    : [];

  if (products.length !== productIds.length) {
    throw new HttpError(422, 'One or more selected products no longer exists. Refresh and try again.');
  }

  const productsById = new Map(products.map((product) => [Number(product.id), product]));
  let subTotal = 0;

  for (const item of computedItems) {
    const product = productsById.get(Number(item.product_id));
    item.item_name = product.name;
    item.item_code = product.code || null;
    Object.assign(item, applyProductFinancialSnapshot(item, product));
    subTotal += item.sub_total;
  }

  return { computedItems, subTotal };
}

function computeOrderTotals(body, subTotal) {
  const discount = nonNegativeNumber(body.discount || 0, 'Discount');
  const shipping = nonNegativeNumber(body.shipping || 0, 'Shipping');
  const taxRate = nonNegativeNumber(body.tax_rate || 0, 'Tax rate');
  if (discount > subTotal) throw new HttpError(422, 'Discount cannot exceed the items subtotal.');
  const taxAmount = ((subTotal - discount) * taxRate) / 100;
  const grandTotal = subTotal - discount + shipping + taxAmount;
  return { discount, shipping, taxRate, taxAmount, grandTotal };
}

const createQuotation = asyncHandler(async (req, res) => {
  const body = req.body || {};
  if (!body.customer_id) throw new HttpError(422, 'Select a customer for this quotation.');
  if (!body.warehouse_id) throw new HttpError(422, 'Select a warehouse for this quotation.');

  const result = await sequelize.transaction(async (t) => {
    const { computedItems, subTotal } = await buildQuotationLines(body.items, t);
    const { discount, shipping, taxRate, taxAmount, grandTotal } = computeOrderTotals(body, subTotal);

    const quotation = await Quotation.create({
      date: body.date || todayISO(),
      customer_id: body.customer_id,
      warehouse_id: body.warehouse_id,
      valid_until: body.valid_until || null,
      tax_rate: taxRate,
      tax_amount: taxAmount,
      discount,
      shipping,
      grand_total: grandTotal,
      note: body.note || null,
      reference_code: generateReferenceCode('QUO'),
      status: 'sent',
      created_by: req.user ? req.user.id : null,
    }, { transaction: t });

    for (const item of computedItems) {
      await QuotationItem.create({ ...item, quotation_id: quotation.id }, { transaction: t });
    }
    return quotation;
  });

  const full = await Quotation.findByPk(result.id, { include: quotationInclude });
  res.status(201).json({ data: full });
});

// Replaces a quotation's items/pricing while it is still open (not yet
// converted or cancelled) — lets the shop person revise prices/discounts
// from the full-page quotation builder without creating a duplicate record.
const updateQuotation = asyncHandler(async (req, res) => {
  const body = req.body || {};
  const existing = await Quotation.findByPk(req.params.id);
  if (!existing) return res.status(404).json({ message: 'Quotation not found' });
  if (existing.status === 'converted') throw new HttpError(409, 'This quotation was already converted to a sale and can no longer be edited.');

  const result = await sequelize.transaction(async (t) => {
    const { computedItems, subTotal } = await buildQuotationLines(body.items, t);
    const { discount, shipping, taxRate, taxAmount, grandTotal } = computeOrderTotals(body, subTotal);

    await existing.update({
      date: body.date || existing.date,
      customer_id: body.customer_id || existing.customer_id,
      warehouse_id: body.warehouse_id || existing.warehouse_id,
      valid_until: body.valid_until || null,
      tax_rate: taxRate,
      tax_amount: taxAmount,
      discount,
      shipping,
      grand_total: grandTotal,
      note: body.note || null,
      status: body.status && ['sent', 'expired', 'cancelled'].includes(body.status) ? body.status : existing.status,
    }, { transaction: t });

    await QuotationItem.destroy({ where: { quotation_id: existing.id }, transaction: t });
    for (const item of computedItems) {
      await QuotationItem.create({ ...item, quotation_id: existing.id }, { transaction: t });
    }
    return existing;
  });

  const full = await Quotation.findByPk(result.id, { include: quotationInclude });
  res.json({ data: full });
});

// Turns an open quotation directly into a real sale/invoice: recomputes
// current product cost for an accurate profit snapshot, deducts stock, and
// records payment exactly like a normal POS checkout.
const convertQuotationToSale = asyncHandler(async (req, res) => {
  const body = req.body || {};
  const quotation = await Quotation.findByPk(req.params.id, {
    include: [{ model: QuotationItem, as: 'items' }],
  });
  if (!quotation) return res.status(404).json({ message: 'Quotation not found' });
  if (quotation.status === 'converted') throw new HttpError(409, 'This quotation has already been converted to a sale.');
  if (quotation.status === 'cancelled') throw new HttpError(409, 'This quotation was cancelled and cannot be converted.');
  if (!quotation.items || !quotation.items.length) throw new HttpError(422, 'This quotation has no items to convert.');

  const result = await sequelize.transaction(async (t) => {
    const productIds = [...new Set(quotation.items.map((item) => item.product_id).filter(Boolean))];
    const products = await Product.findAll({
      where: { id: { [Op.in]: productIds }, is_active: true },
      transaction: t,
      lock: t.LOCK.UPDATE,
    });
    if (products.length !== productIds.length) {
      throw new HttpError(422, 'One or more quoted products no longer exists or is inactive. Edit the quotation and try again.');
    }
    const productsById = new Map(products.map((product) => [Number(product.id), product]));

    let subTotal = 0;
    const computedItems = quotation.items.map((quotationItem, index) => {
      const product = productsById.get(Number(quotationItem.product_id));
      const line = computeSaleLine({
        product_id: quotationItem.product_id,
        quantity: quotationItem.quantity,
        product_price: quotationItem.product_price,
        discount_type: quotationItem.discount_type || 'none',
        discount_value: quotationItem.discount_value || 0,
        tax_type: quotationItem.tax_type || 'none',
        tax_value: quotationItem.tax_value || 0,
      }, index);
      line.item_name = product.name;
      line.item_code = product.code || null;
      line.is_manual = false;
      Object.assign(line, applyProductFinancialSnapshot(line, product));
      subTotal += line.sub_total;
      return line;
    });

    const discount = nonNegativeNumber(quotation.discount || 0, 'Discount');
    const shipping = nonNegativeNumber(quotation.shipping || 0, 'Shipping');
    const taxRate = nonNegativeNumber(quotation.tax_rate || 0, 'Tax rate');
    const cappedDiscount = Math.min(discount, subTotal);
    const orderTaxAmount = ((subTotal - cappedDiscount) * taxRate) / 100;
    const grandTotal = subTotal - cappedDiscount + shipping + orderTaxAmount;

    const paymentType = body.payment_type || 'cash';
    const paidAmount = body.paid_amount === undefined || body.paid_amount === null || body.paid_amount === ''
      ? grandTotal
      : nonNegativeNumber(body.paid_amount, 'Paid amount');
    const paymentStatus = paidAmount >= grandTotal ? 'paid' : paidAmount > 0 ? 'partial' : 'unpaid';

    const sale = await Sale.create({
      date: todayISO(),
      customer_id: quotation.customer_id,
      warehouse_id: quotation.warehouse_id,
      pos_register_id: body.pos_register_id || null,
      tax_rate: taxRate,
      tax_amount: orderTaxAmount,
      discount: cappedDiscount,
      shipping,
      grand_total: grandTotal,
      received_amount: paidAmount,
      paid_amount: paidAmount,
      payment_type: paymentType,
      payment_status: paymentStatus,
      note: `Converted from quotation ${quotation.reference_code}.${quotation.note ? ` ${quotation.note}` : ''}`,
      reference_code: generateReferenceCode('INV'),
      created_by: req.user ? req.user.id : null,
    }, { transaction: t });

    for (const item of computedItems) {
      await SaleItem.create({ ...item, sale_id: sale.id }, { transaction: t });
      await adjustStock({
        productId: item.product_id,
        warehouseId: quotation.warehouse_id,
        delta: -item.quantity,
        transaction: t,
      });
    }

    if (paidAmount > 0) {
      await SalesPayment.create({
        sale_id: sale.id,
        amount: paidAmount,
        paying_method: paymentType,
        received_amount: paidAmount,
        paid_on: todayISO(),
      }, { transaction: t });
    }

    quotation.status = 'converted';
    quotation.converted_sale_id = sale.id;
    await quotation.save({ transaction: t });

    return sale;
  });

  const full = await Sale.findByPk(result.id, {
    include: [Customer, Warehouse, { model: SaleItem, as: 'items', include: [Product] }, { model: SalesPayment, as: 'payments' }],
  });
  res.status(201).json({ data: full });
});

// Marks a quotation as cancelled/expired without deleting its history.
const setQuotationStatus = asyncHandler(async (req, res) => {
  const quotation = await Quotation.findByPk(req.params.id);
  if (!quotation) return res.status(404).json({ message: 'Quotation not found' });
  if (quotation.status === 'converted') throw new HttpError(409, 'A converted quotation cannot change status.');
  const status = req.body?.status;
  if (!['sent', 'expired', 'cancelled'].includes(status)) {
    throw new HttpError(422, 'Status must be one of: sent, expired, cancelled.');
  }
  quotation.status = status;
  await quotation.save();
  res.json({ data: quotation });
});

/* ---------------- Holds (park a cart mid-sale, e.g. customer stepped out) ---------------- */

const holdInclude = [Warehouse, Customer, { model: HoldItem, as: 'items', include: [Product] }];

const listHolds = asyncHandler(async (req, res) => {
  const where = {};
  if (req.query.warehouse_id) where.warehouse_id = req.query.warehouse_id;
  const holds = await Hold.findAll({ where, include: holdInclude, order: [['id', 'DESC']] });
  res.json({ data: holds });
});

const createHold = asyncHandler(async (req, res) => {
  const body = req.body || {};
  if (!body.warehouse_id) throw new HttpError(422, 'Select a warehouse before holding a cart.');
  if (!body.items || !body.items.length) throw new HttpError(400, 'Nothing to hold.');

  for (const [index, item] of body.items.entries()) {
    const quantity = Number(item.quantity);
    const price = Number(item.price);
    if (!item.product_id) throw new HttpError(422, `Held item ${index + 1} is missing a product.`);
    if (!Number.isFinite(quantity) || quantity <= 0) throw new HttpError(422, `Held item ${index + 1} needs a quantity greater than zero.`);
    if (!Number.isFinite(price) || price < 0) throw new HttpError(422, `Held item ${index + 1} needs a valid price.`);
  }

  const result = await sequelize.transaction(async (t) => {
    const hold = await Hold.create({
      warehouse_id: body.warehouse_id,
      customer_id: body.customer_id || null,
      note: body.note || null,
      reference_code: generateReferenceCode('HLD'),
      created_by: req.user ? req.user.id : null,
    }, { transaction: t });

    for (const item of body.items) {
      await HoldItem.create({ hold_id: hold.id, product_id: item.product_id, quantity: item.quantity, price: item.price }, { transaction: t });
    }
    return hold;
  });

  const full = await Hold.findByPk(result.id, { include: holdInclude });
  res.status(201).json({ data: full });
});

const deleteHold = asyncHandler(async (req, res) => {
  const hold = await Hold.findByPk(req.params.id);
  if (!hold) return res.status(404).json({ message: 'Not found' });
  await hold.destroy(); // cart resumed on the POS screen and turned into a real sale by the frontend
  res.json({ message: 'Hold resumed/removed' });
});

module.exports = {
  listQuotations,
  getQuotation,
  createQuotation,
  updateQuotation,
  convertQuotationToSale,
  setQuotationStatus,
  listHolds,
  createHold,
  deleteHold,
  // exported for unit testing only
  computeOrderTotals,
};
