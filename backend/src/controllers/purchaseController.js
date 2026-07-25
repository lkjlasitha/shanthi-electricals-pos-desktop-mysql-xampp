const { Op } = require('sequelize');
const { Purchase, PurchaseItem, Product, Supplier, Warehouse, sequelize } = require('../models/associations');
const { asyncHandler, generateReferenceCode } = require('../utils/helpers');
const { adjustStock } = require('../utils/stockService');
const { applyProductPriceChange } = require('../services/productPriceService');
const HttpError = require('../utils/httpError');

const includeGraph = [
  Supplier, Warehouse,
  { model: PurchaseItem, as: 'items', include: [Product] },
];

function userCanManagePrices(user) {
  const role = user?.Role;
  return role?.name === 'admin' || (role?.permissions || []).includes('products.manage');
}

function nonNegativeNumber(value, label) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) throw new HttpError(422, `${label} must be a valid number greater than or equal to zero.`);
  return number;
}

function positiveNumber(value, label) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) throw new HttpError(422, `${label} must be greater than zero.`);
  return number;
}

const list = asyncHandler(async (req, res) => {
  const page = parseInt(req.query.page || '1', 10);
  const perPage = Math.min(parseInt(req.query.per_page || '20', 10), 200);
  const where = {};
  if (req.query.warehouse_id) where.warehouse_id = req.query.warehouse_id;
  if (req.query.supplier_id) where.supplier_id = req.query.supplier_id;
  if (req.query.from_date && req.query.to_date) {
    where.date = { [Op.between]: [req.query.from_date, req.query.to_date] };
  }

  const { rows, count } = await Purchase.findAndCountAll({
    where, include: includeGraph, order: [['id', 'DESC']],
    limit: perPage, offset: (page - 1) * perPage, distinct: true,
  });
  res.json({ data: rows, total: count, page, per_page: perPage, total_pages: Math.ceil(count / perPage) });
});

const getOne = asyncHandler(async (req, res) => {
  const purchase = await Purchase.findByPk(req.params.id, { include: includeGraph });
  if (!purchase) return res.status(404).json({ message: 'Not found' });
  res.json({ data: purchase });
});

// Each item may request a catalogue price update:
// update_product_cost: true -> save the entered purchase cost as the product's new cost
// update_selling_price: true + new_selling_price -> save a new selling price
const create = asyncHandler(async (req, res) => {
  const body = req.body || {};
  if (!Array.isArray(body.items) || !body.items.length) throw new HttpError(400, 'At least one item is required');

  const wantsPriceUpdate = body.items.some((item) => item.update_product_cost || item.update_selling_price);
  if (wantsPriceUpdate && !userCanManagePrices(req.user)) {
    throw new HttpError(403, 'You do not have permission to change product prices from a purchase.');
  }

  const result = await sequelize.transaction(async (t) => {
    const productIds = [...new Set(body.items.map((item) => Number(item.product_id)).filter(Number.isInteger))];
    if (productIds.length !== new Set(body.items.map((item) => String(item.product_id))).size) {
      throw new HttpError(422, 'One or more purchase items has an invalid product.');
    }

    const products = await Product.findAll({
      where: { id: { [Op.in]: productIds }, is_active: true },
      transaction: t,
      lock: t.LOCK.UPDATE,
    });
    if (products.length !== productIds.length) {
      throw new HttpError(422, 'One or more selected products no longer exists or is inactive. Refresh the page and try again.');
    }
    const productsById = new Map(products.map((product) => [product.id, product]));

    let subTotal = 0;
    const computedItems = body.items.map((item, index) => {
      const productId = Number(item.product_id);
      const qty = positiveNumber(item.quantity, `Quantity for item ${index + 1}`);
      const cost = nonNegativeNumber(item.product_cost, `Purchase cost for item ${index + 1}`);
      let lineTotal = qty * cost;

      let discountAmount = 0;
      if (item.discount_type === 'percentage') discountAmount = (lineTotal * nonNegativeNumber(item.discount_value || 0, 'Discount')) / 100;
      else if (item.discount_type === 'fixed') discountAmount = nonNegativeNumber(item.discount_value || 0, 'Discount');
      if (discountAmount > lineTotal) throw new HttpError(422, `Discount for item ${index + 1} cannot exceed the line total.`);

      let taxAmount = 0;
      const taxedBase = lineTotal - discountAmount;
      const taxValue = nonNegativeNumber(item.tax_value || 0, 'Tax percentage');
      if (item.tax_type === 'exclusive') taxAmount = (taxedBase * taxValue) / 100;
      else if (item.tax_type === 'inclusive' && taxValue > 0) taxAmount = taxedBase - taxedBase / (1 + taxValue / 100);

      const netUnitCost = cost - discountAmount / qty + taxAmount / qty;
      const itemSubTotal = taxedBase + (item.tax_type === 'exclusive' ? taxAmount : 0);
      subTotal += itemSubTotal;

      return {
        product_id: productId,
        product_cost: cost,
        net_unit_cost: netUnitCost,
        tax_type: item.tax_type || 'none',
        tax_value: taxValue,
        tax_amount: taxAmount,
        discount_type: item.discount_type || 'none',
        discount_value: Number(item.discount_value || 0),
        discount_amount: discountAmount,
        purchase_unit_id: item.purchase_unit_id || null,
        quantity: qty,
        sub_total: itemSubTotal,
        update_product_cost: Boolean(item.update_product_cost),
        update_selling_price: Boolean(item.update_selling_price),
        new_selling_price: item.update_selling_price
          ? nonNegativeNumber(item.new_selling_price, `New selling price for item ${index + 1}`)
          : undefined,
      };
    });

    const discount = nonNegativeNumber(body.discount || 0, 'Order discount');
    const shipping = nonNegativeNumber(body.shipping || 0, 'Shipping');
    const taxRate = nonNegativeNumber(body.tax_rate || 0, 'Order tax');
    if (discount > subTotal) throw new HttpError(422, 'Order discount cannot exceed the purchase subtotal.');
    const orderTaxAmount = ((subTotal - discount) * taxRate) / 100;
    const grandTotal = subTotal - discount + shipping + orderTaxAmount;
    const paidAmount = nonNegativeNumber(body.paid_amount || 0, 'Paid amount');
    const paymentStatus = paidAmount >= grandTotal ? 'paid' : paidAmount > 0 ? 'partial' : 'unpaid';
    const status = body.status || 'received';

    const purchase = await Purchase.create({
      date: body.date,
      supplier_id: body.supplier_id,
      warehouse_id: body.warehouse_id,
      tax_rate: taxRate,
      tax_amount: orderTaxAmount,
      discount,
      shipping,
      grand_total: grandTotal,
      received_amount: paidAmount,
      paid_amount: paidAmount,
      payment_type: body.payment_type || 'cash',
      payment_status: paymentStatus,
      status,
      notes: body.notes || null,
      reference_code: generateReferenceCode('PO'),
      created_by: req.user?.id || null,
    }, { transaction: t });

    for (const item of computedItems) {
      const {
        update_product_cost: updateProductCost,
        update_selling_price: updateSellingPrice,
        new_selling_price: newSellingPrice,
        ...purchaseItemData
      } = item;

      await PurchaseItem.create({ ...purchaseItemData, purchase_id: purchase.id }, { transaction: t });

      if (status === 'received') {
        await adjustStock({
          productId: item.product_id,
          warehouseId: body.warehouse_id,
          delta: item.quantity,
          transaction: t,
        });

        if (updateProductCost || updateSellingPrice) {
          const product = productsById.get(item.product_id);
          await applyProductPriceChange({
            product,
            newCost: updateProductCost ? item.product_cost : undefined,
            newPrice: updateSellingPrice ? newSellingPrice : undefined,
            reason: `Updated while receiving purchase ${purchase.reference_code}`,
            source: 'purchase',
            changedBy: req.user?.id,
            purchaseId: purchase.id,
            transaction: t,
          });
        }
      }
    }

    return purchase;
  });

  const full = await Purchase.findByPk(result.id, { include: includeGraph });
  res.status(201).json({ data: full });
});

module.exports = { list, getOne, create };
