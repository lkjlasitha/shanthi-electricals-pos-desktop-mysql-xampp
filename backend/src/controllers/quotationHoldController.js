const {
  Quotation, QuotationItem, Hold, HoldItem, Customer, Warehouse, Product, sequelize,
} = require('../models/associations');
const { asyncHandler, generateReferenceCode } = require('../utils/helpers');

/* ---------------- Quotations ---------------- */

const quotationInclude = [Customer, Warehouse, { model: QuotationItem, as: 'items', include: [Product] }];

const listQuotations = asyncHandler(async (req, res) => {
  const quotations = await Quotation.findAll({ include: quotationInclude, order: [['id', 'DESC']] });
  res.json({ data: quotations });
});

const createQuotation = asyncHandler(async (req, res) => {
  const body = req.body;
  if (!body.items || !body.items.length) return res.status(400).json({ message: 'At least one item is required' });

  const result = await sequelize.transaction(async (t) => {
    let subTotal = 0;
    const lines = body.items.map((item) => {
      const lineTotal = Number(item.quantity) * Number(item.product_price) - Number(item.discount_amount || 0) + Number(item.tax_amount || 0);
      subTotal += lineTotal;
      return { ...item, sub_total: lineTotal };
    });
    const discount = Number(body.discount || 0);
    const shipping = Number(body.shipping || 0);
    const taxRate = Number(body.tax_rate || 0);
    const taxAmount = ((subTotal - discount) * taxRate) / 100;
    const grandTotal = subTotal - discount + shipping + taxAmount;

    const quotation = await Quotation.create({
      date: body.date,
      customer_id: body.customer_id,
      warehouse_id: body.warehouse_id,
      tax_rate: taxRate,
      tax_amount: taxAmount,
      discount,
      shipping,
      grand_total: grandTotal,
      note: body.note || null,
      reference_code: generateReferenceCode('QUO'),
    }, { transaction: t });

    for (const line of lines) {
      await QuotationItem.create({ ...line, quotation_id: quotation.id }, { transaction: t });
    }
    return quotation;
  });

  const full = await Quotation.findByPk(result.id, { include: quotationInclude });
  res.status(201).json({ data: full });
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
  const body = req.body;
  if (!body.items || !body.items.length) return res.status(400).json({ message: 'Nothing to hold' });

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

module.exports = { listQuotations, createQuotation, listHolds, createHold, deleteHold };
