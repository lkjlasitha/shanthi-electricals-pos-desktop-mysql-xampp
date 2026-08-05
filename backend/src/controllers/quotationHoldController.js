const {
  Quotation, QuotationItem, Hold, HoldItem, Customer, Warehouse, Product, sequelize,
} = require('../models/associations');
const { asyncHandler, generateReferenceCode } = require('../utils/helpers');
const HttpError = require('../utils/httpError');
const { Op } = require('sequelize');
const { todayISO, isValidISODate } = require('../utils/date');
const {
  computeQuotationLine, applyQuotationProductSnapshot, computeQuotationTotals,
} = require('../utils/quotationLine');

/* ---------------- Quotations ---------------- */

const quotationInclude = [Customer, Warehouse, { model: QuotationItem, as: 'items', include: [Product] }];

const listQuotations = asyncHandler(async (req, res) => {
  const page = Math.max(1, parseInt(req.query.page || '1', 10) || 1);
  const perPage = Math.min(200, Math.max(1, parseInt(req.query.per_page || '50', 10) || 50));
  const where = {};
  if (req.query.status) where.status = req.query.status;
  if (req.query.search) where.reference_code = { [Op.like]: `%${String(req.query.search).trim()}%` };
  const { rows, count } = await Quotation.findAndCountAll({
    where, include: quotationInclude, order: [['id', 'DESC']], distinct: true,
    limit: perPage, offset: (page - 1) * perPage,
  });
  res.json({ data: rows, total: count, page, per_page: perPage, total_pages: Math.ceil(count / perPage) });
});

const getQuotation = asyncHandler(async (req, res) => {
  const quotation = await Quotation.findByPk(req.params.id, { include: quotationInclude });
  if (!quotation) throw new HttpError(404, 'Quotation not found');
  res.json({ data: quotation });
});

async function prepareQuotation(body, transaction) {
  if (!Array.isArray(body.items) || !body.items.length) throw new HttpError(400, 'At least one item is required');
  if (!body.customer_id) throw new HttpError(422, 'Select a customer.');
  if (!body.warehouse_id) throw new HttpError(422, 'Select a warehouse.');
  if (body.date && !isValidISODate(body.date)) throw new HttpError(422, 'Quotation date must be a valid date.');

  const lines = body.items.map((item, index) => computeQuotationLine(item, index));
  const productIds = [...new Set(lines.map((line) => line.product_id))];
  const products = await Product.findAll({
    where: { id: { [Op.in]: productIds }, is_active: true },
    transaction,
  });
  if (products.length !== productIds.length) {
    throw new HttpError(422, 'One or more quotation products no longer exists or is inactive. Refresh and try again.');
  }
  const productsById = new Map(products.map((product) => [Number(product.id), product]));
  const snapshottedLines = lines.map((line) => applyQuotationProductSnapshot(line, productsById.get(Number(line.product_id))));
  return { lines: snapshottedLines, totals: computeQuotationTotals(snapshottedLines, body) };
}

const createQuotation = asyncHandler(async (req, res) => {
  const body = req.body || {};

  const result = await sequelize.transaction(async (t) => {
    const { lines, totals } = await prepareQuotation(body, t);

    const quotation = await Quotation.create({
      date: body.date || todayISO(),
      customer_id: body.customer_id,
      warehouse_id: body.warehouse_id,
      tax_rate: totals.tax_rate,
      tax_amount: totals.tax_amount,
      discount: totals.discount,
      shipping: totals.shipping,
      sub_total: totals.sub_total,
      grand_total: totals.grand_total,
      profit_amount: totals.profit_amount,
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

const updateQuotation = asyncHandler(async (req, res) => {
  const body = req.body || {};
  const result = await sequelize.transaction(async (transaction) => {
    const quotation = await Quotation.findByPk(req.params.id, { transaction, lock: transaction.LOCK.UPDATE });
    if (!quotation) throw new HttpError(404, 'Quotation not found');
    if (quotation.status !== 'sent') throw new HttpError(409, 'Only active quotations can be edited.');

    const { lines, totals } = await prepareQuotation(body, transaction);
    await quotation.update({
      date: body.date || todayISO(),
      customer_id: body.customer_id,
      warehouse_id: body.warehouse_id,
      tax_rate: totals.tax_rate,
      tax_amount: totals.tax_amount,
      discount: totals.discount,
      shipping: totals.shipping,
      sub_total: totals.sub_total,
      grand_total: totals.grand_total,
      profit_amount: totals.profit_amount,
      note: body.note || null,
    }, { transaction });
    await QuotationItem.destroy({ where: { quotation_id: quotation.id }, transaction });
    await QuotationItem.bulkCreate(lines.map((line) => ({ ...line, quotation_id: quotation.id })), { transaction });
    return quotation;
  });

  const full = await Quotation.findByPk(result.id, { include: quotationInclude });
  res.json({ data: full });
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

module.exports = {
  listQuotations, getQuotation, createQuotation, updateQuotation,
  listHolds, createHold, deleteHold,
};
