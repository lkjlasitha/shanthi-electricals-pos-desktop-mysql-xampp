const { Op } = require('sequelize');
const { todayISO } = require('../utils/date');
const {
  Sale, SaleItem, Product, Customer, Warehouse, SalesPayment, sequelize,
} = require('../models/associations');
const { asyncHandler, generateReferenceCode } = require('../utils/helpers');
const { adjustStock } = require('../utils/stockService');

const includeGraph = [
  Customer, Warehouse,
  { model: SaleItem, as: 'items', include: [Product] },
  { model: SalesPayment, as: 'payments' },
];

const list = asyncHandler(async (req, res) => {
  const page = parseInt(req.query.page || '1', 10);
  const perPage = Math.min(parseInt(req.query.per_page || '20', 10), 200);
  const where = {};
  if (req.query.warehouse_id) where.warehouse_id = req.query.warehouse_id;
  if (req.query.customer_id) where.customer_id = req.query.customer_id;
  if (req.query.reference_code) where.reference_code = { [Op.like]: `%${req.query.reference_code}%` };
  if (req.query.from_date && req.query.to_date) where.date = { [Op.between]: [req.query.from_date, req.query.to_date] };

  const { rows, count } = await Sale.findAndCountAll({
    where, include: includeGraph, order: [['id', 'DESC']],
    limit: perPage, offset: (page - 1) * perPage, distinct: true,
  });
  res.json({ data: rows, total: count, page, per_page: perPage, total_pages: Math.ceil(count / perPage) });
});

const getOne = asyncHandler(async (req, res) => {
  const sale = await Sale.findByPk(req.params.id, { include: includeGraph });
  if (!sale) return res.status(404).json({ message: 'Not found' });
  res.json({ data: sale });
});

function computeLine(item) {
  const qty = Number(item.quantity);
  const price = Number(item.product_price);
  let lineTotal = qty * price;

  let discountAmount = 0;
  if (item.discount_type === 'percentage') discountAmount = (lineTotal * Number(item.discount_value || 0)) / 100;
  else if (item.discount_type === 'fixed') discountAmount = Number(item.discount_value || 0);

  const taxedBase = lineTotal - discountAmount;
  let taxAmount = 0;
  if (item.tax_type === 'exclusive') taxAmount = (taxedBase * Number(item.tax_value || 0)) / 100;
  else if (item.tax_type === 'inclusive') taxAmount = taxedBase - taxedBase / (1 + Number(item.tax_value || 0) / 100);

  const netUnitPrice = price - discountAmount / (qty || 1) + (item.tax_type === 'exclusive' ? taxAmount / (qty || 1) : 0);
  const subTotal = taxedBase + (item.tax_type === 'exclusive' ? taxAmount : 0);

  return {
    product_id: item.product_id,
    product_price: price,
    net_unit_price: netUnitPrice,
    tax_type: item.tax_type || 'none',
    tax_value: item.tax_value || 0,
    tax_amount: taxAmount,
    discount_type: item.discount_type || 'none',
    discount_value: item.discount_value || 0,
    discount_amount: discountAmount,
    sale_unit_id: item.sale_unit_id || null,
    quantity: qty,
    sub_total: subTotal,
  };
}

// This is the POS checkout endpoint.
// body: { date, customer_id, warehouse_id, discount, shipping, tax_rate, payment_type,
//         paid_amount, note, pos_register_id, items: [...] }
const create = asyncHandler(async (req, res) => {
  const body = req.body;
  if (!body.items || !body.items.length) return res.status(400).json({ message: 'Cart is empty' });
  if (!body.warehouse_id) return res.status(400).json({ message: 'warehouse_id is required' });

  const result = await sequelize.transaction(async (t) => {
    let subTotal = 0;
    const computedItems = body.items.map((item) => {
      const line = computeLine(item);
      subTotal += line.sub_total;
      return line;
    });

    const discount = Number(body.discount || 0);
    const shipping = Number(body.shipping || 0);
    const taxRate = Number(body.tax_rate || 0);
    const orderTaxAmount = ((subTotal - discount) * taxRate) / 100;
    const grandTotal = subTotal - discount + shipping + orderTaxAmount;
    const paidAmount = Number(body.paid_amount != null ? body.paid_amount : grandTotal);
    const paymentStatus = paidAmount >= grandTotal ? 'paid' : paidAmount > 0 ? 'partial' : 'unpaid';

    const sale = await Sale.create({
      date: body.date || todayISO(),
      customer_id: body.customer_id,
      warehouse_id: body.warehouse_id,
      pos_register_id: body.pos_register_id || null,
      tax_rate: taxRate,
      tax_amount: orderTaxAmount,
      discount,
      shipping,
      grand_total: grandTotal,
      received_amount: body.received_amount || paidAmount,
      paid_amount: paidAmount,
      payment_type: body.payment_type || 'cash',
      payment_status: paymentStatus,
      note: body.note || null,
      reference_code: generateReferenceCode('INV'),
      created_by: req.user ? req.user.id : null,
    }, { transaction: t });

    for (const item of computedItems) {
      await SaleItem.create({ ...item, sale_id: sale.id }, { transaction: t });
      // Selling reduces warehouse stock; throws (422) if not enough stock available
      await adjustStock({
        productId: item.product_id,
        warehouseId: body.warehouse_id,
        delta: -item.quantity,
        transaction: t,
      });
    }

    if (paidAmount > 0) {
      await SalesPayment.create({
        sale_id: sale.id,
        amount: paidAmount,
        paying_method: body.payment_type || 'cash',
        received_amount: body.received_amount || paidAmount,
        paid_on: body.date || todayISO(),
      }, { transaction: t });
    }

    return sale;
  });

  const full = await Sale.findByPk(result.id, { include: includeGraph });
  res.status(201).json({ data: full });
});

// Record an additional payment against a partially-paid / credit sale
const addPayment = asyncHandler(async (req, res) => {
  const sale = await Sale.findByPk(req.params.id);
  if (!sale) return res.status(404).json({ message: 'Not found' });
  const amount = Number(req.body.amount);
  if (!amount || amount <= 0) return res.status(400).json({ message: 'A positive amount is required' });

  await SalesPayment.create({
    sale_id: sale.id,
    amount,
    paying_method: req.body.paying_method || 'cash',
    received_amount: req.body.received_amount || amount,
    reference: req.body.reference || null,
    note: req.body.note || null,
    paid_on: req.body.paid_on || todayISO(),
  });

  const newPaidTotal = Number(sale.paid_amount) + amount;
  sale.paid_amount = newPaidTotal;
  sale.payment_status = newPaidTotal >= Number(sale.grand_total) ? 'paid' : 'partial';
  await sale.save();

  const full = await Sale.findByPk(sale.id, { include: includeGraph });
  res.json({ data: full });
});

module.exports = { list, getOne, create, addPayment };
