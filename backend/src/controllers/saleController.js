const { Op } = require('../config/db');
const { todayISO } = require('../utils/date');
const {
  Sale, SaleItem, Product, Customer, Warehouse, SalesPayment, POSRegister, sequelize,
} = require('../models/associations');
const { asyncHandler, generateReferenceCode } = require('../utils/helpers');
const { adjustStock } = require('../utils/stockService');
const HttpError = require('../utils/httpError');
const {
  computeSaleLine,
  nonNegativeNumber,
  applyProductFinancialSnapshot,
} = require('../utils/saleLine');
const { normalizePaymentMethod, computeInitialPayment, resolveDueDate } = require('../utils/payment');
// HttpError is already imported above for the create() handler; addPayment reuses it.

const includeGraph = [
  Customer, Warehouse,
  { model: SaleItem, as: 'items', include: [Product] },
  { model: SalesPayment, as: 'payments' },
];

const list = asyncHandler(async (req, res) => {
  const rawPage = Number(req.query.page || 1);
  const rawPerPage = Number(req.query.per_page || 20);
  const page = Number.isInteger(rawPage) && rawPage > 0 ? rawPage : 1;
  const perPage = Number.isInteger(rawPerPage) && rawPerPage > 0 ? Math.min(rawPerPage, 200) : 20;
  const where = {};
  if (req.query.warehouse_id) where.warehouse_id = req.query.warehouse_id;
  if (req.query.customer_id) where.customer_id = req.query.customer_id;
  if (req.query.reference_code) where.reference_code = { [Op.like]: `%${req.query.reference_code}%` };
  if (req.query.payment_status) where.payment_status = req.query.payment_status;
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

// POS checkout supports both catalogue products and one-off manual bill items.
// Manual items have product_id=null, keep an item_name snapshot, and never change stock.
const create = asyncHandler(async (req, res) => {
  const body = req.body || {};
  if (!Array.isArray(body.items) || !body.items.length) throw new HttpError(400, 'Cart is empty');
  if (!body.warehouse_id) throw new HttpError(422, 'Select a warehouse first.');
  if (!body.customer_id) throw new HttpError(422, 'Select a customer first.');

  const result = await sequelize.transaction(async (transaction) => {
    const computedItems = body.items.map((item, index) => computeSaleLine(item, index));
    const productIds = [...new Set(computedItems.map((item) => item.product_id).filter(Boolean))];

    const customer = await Customer.findByPk(body.customer_id, { transaction, lock: transaction.LOCK.SHARE });
    if (!customer || customer.is_active === false) {
      throw new HttpError(422, 'The selected customer no longer exists or is inactive. Select an active customer.');
    }
    const activeRegister = req.user ? await POSRegister.findOne({
      where: { user_id: req.user.id, warehouse_id: body.warehouse_id, status: 'open' },
      transaction,
    }) : null;

    const products = productIds.length
      ? await Product.findAll({
        where: { id: { [Op.in]: productIds }, is_active: true },
        transaction,
        lock: transaction.LOCK.UPDATE,
      })
      : [];

    if (products.length !== productIds.length) {
      throw new HttpError(422, 'One or more selected products no longer exists or is inactive. Refresh the POS and try again.');
    }

    const productsById = new Map(products.map((product) => [Number(product.id), product]));
    let subTotal = 0;

    for (const item of computedItems) {
      if (item.product_id) {
        const product = productsById.get(Number(item.product_id));
        // Save a historical name/code snapshot so old receipts remain understandable
        // even when the catalogue entry is renamed later.
        item.item_name = product.name;
        item.item_code = product.code || null;
        item.is_manual = false;
        Object.assign(item, applyProductFinancialSnapshot(item, product));
      } else {
        Object.assign(item, applyProductFinancialSnapshot(item));
      }
      subTotal += item.sub_total;
    }

    const discount = nonNegativeNumber(body.discount || 0, 'Order discount');
    const shipping = nonNegativeNumber(body.shipping || 0, 'Shipping');
    const taxRate = nonNegativeNumber(body.tax_rate || 0, 'Order tax');
    if (discount > subTotal) throw new HttpError(422, 'Order discount cannot exceed the sale subtotal.');

    const orderTaxAmount = ((subTotal - discount) * taxRate) / 100;
    const grandTotal = subTotal - discount + shipping + orderTaxAmount;
    const payment = computeInitialPayment({
      grand_total: grandTotal,
      paid_amount: body.paid_amount,
      received_amount: body.received_amount,
      payment_type: body.payment_type,
    });
    const saleDate = body.date || todayISO();
    const dueDate = resolveDueDate({
      sale_date: saleDate,
      due_date: body.due_date,
      payment_status: payment.payment_status,
      payment_terms_days: customer.payment_terms_days,
    });

    const sale = await Sale.create({
      date: saleDate,
      customer_id: body.customer_id,
      warehouse_id: body.warehouse_id,
      pos_register_id: activeRegister?.id || null,
      tax_rate: taxRate,
      tax_amount: orderTaxAmount,
      discount,
      shipping,
      grand_total: grandTotal,
      received_amount: payment.received_amount,
      paid_amount: payment.paid_amount,
      payment_type: payment.payment_type,
      payment_status: payment.payment_status,
      due_date: dueDate,
      note: body.note || null,
      reference_code: generateReferenceCode('INV'),
      created_by: req.user ? req.user.id : null,
    }, { transaction });

    for (const item of computedItems) {
      await SaleItem.create({ ...item, sale_id: sale.id }, { transaction });

      if (item.product_id) {
        // Only catalogue products are inventory-controlled. Manual bill items are
        // intentionally excluded from stock so a quick sale cannot create fake stock.
        await adjustStock({
          productId: item.product_id,
          warehouseId: body.warehouse_id,
          delta: -item.quantity,
          transaction,
        });
      }
    }

    if (payment.paid_amount > 0) {
      await SalesPayment.create({
        sale_id: sale.id,
        pos_register_id: activeRegister?.id || null,
        amount: payment.paid_amount,
        paying_method: payment.payment_type,
        received_amount: payment.received_amount,
        paid_on: saleDate,
      }, { transaction });
    }

    return sale;
  });

  const full = await Sale.findByPk(result.id, { include: includeGraph });
  res.status(201).json({ data: full });
});

// Record an additional payment against a partially-paid / credit sale
const addPayment = asyncHandler(async (req, res) => {
  const body = req.body || {};
  const result = await sequelize.transaction(async (transaction) => {
    // Lock the row so two cashiers recording a payment for the same credit
    // sale at the same moment cannot both read a stale paid_amount and
    // silently overwrite each other's payment.
    const sale = await Sale.findByPk(req.params.id, { transaction, lock: transaction.LOCK.UPDATE });
    if (!sale) throw new HttpError(404, 'Sale not found');
    if (sale.payment_status === 'paid') {
      throw new HttpError(422, 'This sale is already fully paid.');
    }

    const amount = Number(body.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new HttpError(422, 'Enter a valid payment amount greater than zero.');
    }

    const outstanding = Number(sale.grand_total) - Number(sale.paid_amount);
    if (amount - outstanding > 0.005) {
      throw new HttpError(422, `Payment of ${amount.toFixed(2)} is more than the outstanding balance of ${outstanding.toFixed(2)}.`);
    }

    const method = normalizePaymentMethod(body.paying_method, { allowCredit: false });
    const receivedAmount = body.received_amount === undefined || body.received_amount === null || body.received_amount === ''
      ? amount
      : nonNegativeNumber(body.received_amount, 'Received amount');
    if (receivedAmount + 0.005 < amount) {
      throw new HttpError(422, 'Received amount cannot be less than the payment amount.');
    }
    const activeRegister = req.user ? await POSRegister.findOne({
      where: { user_id: req.user.id, warehouse_id: sale.warehouse_id, status: 'open' }, transaction,
    }) : null;

    await SalesPayment.create({
      sale_id: sale.id,
      pos_register_id: activeRegister?.id || null,
      amount,
      paying_method: method,
      received_amount: receivedAmount,
      reference: body.reference || null,
      note: body.note || null,
      paid_on: body.paid_on || todayISO(),
    }, { transaction });

    const newPaidTotal = Number(sale.paid_amount) + amount;
    sale.paid_amount = newPaidTotal;
    sale.payment_status = newPaidTotal >= Number(sale.grand_total) - 0.005 ? 'paid' : 'partial';
    await sale.save({ session: transaction.session });
    return sale;
  });

  const full = await Sale.findByPk(result.id, { include: includeGraph });
  res.json({ data: full });
});

module.exports = { list, getOne, create, addPayment };
