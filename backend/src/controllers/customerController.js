const { Op } = require('sequelize');
const {
  Customer, Sale, SaleItem, SalesPayment, SaleReturn, Product, Warehouse,
  CustomerAccountPayment, User, sequelize,
} = require('../models/associations');
const { asyncHandler, generateReferenceCode } = require('../utils/helpers');
const HttpError = require('../utils/httpError');
const { todayISO, isValidISODate } = require('../utils/date');
const {
  money, sum, invoiceSnapshot, allocateOldestFirst, buildAccountSummary,
} = require('../utils/customerAccount');

const CUSTOMER_FIELDS = [
  'name', 'customer_code', 'email', 'phone', 'country', 'city', 'address', 'tax_number',
  'opening_balance', 'allow_credit', 'credit_limit', 'payment_terms_days', 'status', 'notes',
];
const PAYMENT_METHODS = new Set(['cash', 'card', 'bank_transfer']);

function cleanCustomerPayload(body = {}) {
  const data = Object.fromEntries(CUSTOMER_FIELDS
    .filter((field) => Object.prototype.hasOwnProperty.call(body, field))
    .map((field) => [field, body[field]]));

  if (Object.prototype.hasOwnProperty.call(data, 'name')) data.name = String(data.name || '').trim();
  if (Object.prototype.hasOwnProperty.call(data, 'phone')) data.phone = String(data.phone || '').trim();
  if (Object.prototype.hasOwnProperty.call(data, 'customer_code')) data.customer_code = String(data.customer_code || '').trim() || null;
  if (Object.prototype.hasOwnProperty.call(data, 'email')) data.email = String(data.email || '').trim() || null;
  if (Object.prototype.hasOwnProperty.call(data, 'allow_credit')) data.allow_credit = Boolean(data.allow_credit);

  for (const field of ['opening_balance', 'credit_limit', 'payment_terms_days']) {
    if (!Object.prototype.hasOwnProperty.call(data, field)) continue;
    const value = Number(data[field] || 0);
    if (!Number.isFinite(value) || value < 0) throw new HttpError(422, `${field.replaceAll('_', ' ')} cannot be negative.`);
    data[field] = field === 'payment_terms_days' ? Math.trunc(value) : value;
  }

  return data;
}

async function loadCustomerInvoices(customerId, options = {}) {
  const sales = await Sale.findAll({
    where: { customer_id: customerId },
    include: [
      { model: SaleItem, as: 'items', include: [Product] },
      { model: SalesPayment, as: 'payments' },
      { model: SaleReturn, as: 'returns' },
      Warehouse,
    ],
    order: [['date', 'DESC'], ['id', 'DESC']],
    transaction: options.transaction,
  });
  return sales;
}

async function buildProfile(customerId) {
  const customer = await Customer.findByPk(customerId);
  if (!customer) throw new HttpError(404, 'Customer not found');

  const [sales, accountPayments] = await Promise.all([
    loadCustomerInvoices(customer.id),
    CustomerAccountPayment.findAll({
      where: { customer_id: customer.id },
      include: [
        { model: SalesPayment, as: 'allocations', include: [{ model: Sale, attributes: ['id', 'reference_code'] }] },
        { model: User, as: 'createdBy', attributes: ['id', 'name'] },
      ],
      order: [['date', 'DESC'], ['id', 'DESC']],
    }),
  ]);

  const invoices = sales.map((sale) => ({ ...invoiceSnapshot(sale), sale }));
  const unallocatedCredit = sum(accountPayments, 'unallocated_amount');
  const summary = buildAccountSummary({ customer, invoices, unallocatedCredit, today: todayISO() });
  const directPayments = sales.flatMap((sale) => (sale.payments || [])
    .filter((payment) => !payment.customer_account_payment_id)
    .map((payment) => ({ ...payment.toJSON(), sale })));
  const returns = sales.flatMap((sale) => (sale.returns || []).map((entry) => ({ ...entry.toJSON(), sale })));

  const statement = [];
  if (Number(customer.opening_balance || 0) !== 0) {
    statement.push({ id: 'opening', date: null, type: 'opening_balance', reference: 'Opening balance', debit: money(customer.opening_balance), credit: 0 });
  }
  sales.forEach((sale) => statement.push({
    id: `sale-${sale.id}`, date: sale.date, created_at: sale.createdAt, type: 'sale',
    reference: sale.reference_code, debit: money(sale.grand_total), credit: 0, sale_id: sale.id,
  }));
  returns.forEach((entry) => statement.push({
    id: `return-${entry.id}`, date: entry.date, created_at: entry.createdAt, type: 'return',
    reference: entry.reference_code || `Return for ${entry.sale.reference_code}`, debit: 0,
    credit: money(entry.grand_total), sale_id: entry.sale.id,
  }));
  directPayments.forEach((payment) => statement.push({
    id: `sale-payment-${payment.id}`, date: payment.paid_on, created_at: payment.createdAt, type: 'payment',
    reference: payment.reference || `Payment for ${payment.sale.reference_code}`, debit: 0,
    credit: money(payment.amount), sale_id: payment.sale.id, payment_method: payment.paying_method,
  }));
  accountPayments.forEach((payment) => statement.push({
    id: `account-payment-${payment.id}`, date: payment.date, created_at: payment.createdAt, type: 'account_payment',
    reference: payment.receipt_code, debit: 0, credit: money(payment.amount), payment_method: payment.payment_method,
  }));

  statement.sort((a, b) => {
    if (!a.date) return -1;
    if (!b.date) return 1;
    return `${a.date}-${a.created_at || ''}-${a.id}`.localeCompare(`${b.date}-${b.created_at || ''}-${b.id}`);
  });
  let runningBalance = 0;
  statement.forEach((entry) => {
    runningBalance = money(runningBalance + entry.debit - entry.credit);
    entry.balance = runningBalance;
  });

  const purchasedMap = new Map();
  sales.forEach((sale) => (sale.items || []).forEach((item) => {
    const key = item.product_id ? `product-${item.product_id}` : `manual-${item.item_name}`;
    const current = purchasedMap.get(key) || {
      product_id: item.product_id, name: item.item_name || item.Product?.name || 'Item',
      code: item.item_code || item.Product?.code || '', quantity: 0, amount: 0, last_purchased: sale.date,
    };
    current.quantity = money(current.quantity + Number(item.quantity || 0));
    current.amount = money(current.amount + Number(item.sub_total || 0));
    if (sale.date > current.last_purchased) current.last_purchased = sale.date;
    purchasedMap.set(key, current);
  }));

  const totalSales = sum(sales, 'grand_total');
  const totalReturns = sum(returns, 'grand_total');
  const totalDirectPayments = sum(directPayments, 'amount');
  const totalAccountPayments = sum(accountPayments, 'amount');

  return {
    customer,
    summary,
    metrics: {
      invoice_count: sales.length,
      total_sales: totalSales,
      total_returns: totalReturns,
      total_paid: money(totalDirectPayments + totalAccountPayments),
      average_sale: sales.length ? money(totalSales / sales.length) : 0,
      last_purchase_date: sales[0]?.date || null,
    },
    invoices,
    statement,
    purchased_items: [...purchasedMap.values()].sort((a, b) => b.amount - a.amount),
    account_payments: accountPayments,
  };
}

const list = asyncHandler(async (req, res) => {
  const page = Math.max(1, parseInt(req.query.page || '1', 10) || 1);
  const perPage = Math.min(200, Math.max(1, parseInt(req.query.per_page || '30', 10) || 30));
  const where = {};
  if (req.query.search) {
    const query = `%${String(req.query.search).trim()}%`;
    where[Op.or] = ['name', 'phone', 'email', 'customer_code'].map((field) => ({ [field]: { [Op.like]: query } }));
  }
  if (req.query.status) where.status = req.query.status;

  const { rows, count } = await Customer.findAndCountAll({
    where, order: [['name', 'ASC']], limit: perPage, offset: (page - 1) * perPage,
  });
  const customerIds = rows.map((customer) => customer.id);
  let sales = [];
  let payments = [];
  if (customerIds.length) {
    [sales, payments] = await Promise.all([
      Sale.findAll({
        where: { customer_id: { [Op.in]: customerIds } },
        include: [
          { model: SalesPayment, as: 'payments', attributes: ['amount'] },
          { model: SaleReturn, as: 'returns', attributes: ['grand_total'] },
        ],
      }),
      CustomerAccountPayment.findAll({ where: { customer_id: { [Op.in]: customerIds } } }),
    ]);
  }
  const salesByCustomer = new Map();
  sales.forEach((sale) => {
    const values = salesByCustomer.get(sale.customer_id) || [];
    values.push(invoiceSnapshot(sale));
    salesByCustomer.set(sale.customer_id, values);
  });
  const creditsByCustomer = new Map();
  payments.forEach((payment) => creditsByCustomer.set(
    payment.customer_id,
    money((creditsByCustomer.get(payment.customer_id) || 0) + Number(payment.unallocated_amount || 0))
  ));

  const data = rows.map((customer) => {
    const plain = customer.toJSON();
    const invoices = salesByCustomer.get(customer.id) || [];
    return {
      ...plain,
      account: buildAccountSummary({
        customer, invoices, unallocatedCredit: creditsByCustomer.get(customer.id) || 0, today: todayISO(),
      }),
      invoice_count: invoices.length,
      last_purchase_date: invoices.reduce((latest, invoice) => !latest || invoice.date > latest ? invoice.date : latest, null),
    };
  });
  res.json({ data, total: count, page, per_page: perPage, total_pages: Math.ceil(count / perPage) });
});

const getOne = asyncHandler(async (req, res) => {
  const customer = await Customer.findByPk(req.params.id);
  if (!customer) throw new HttpError(404, 'Customer not found');
  res.json({ data: customer });
});

const getProfile = asyncHandler(async (req, res) => {
  res.json({ data: await buildProfile(req.params.id) });
});

const create = asyncHandler(async (req, res) => {
  const data = cleanCustomerPayload(req.body);
  if (!data.name) throw new HttpError(422, 'Customer name is required.');
  if (!data.phone) throw new HttpError(422, 'Customer phone is required.');
  if (data.customer_code && await Customer.count({ where: { customer_code: data.customer_code } })) {
    throw new HttpError(409, 'That customer code is already in use.');
  }
  const customer = await Customer.create(data);
  res.status(201).json({ data: customer });
});

const update = asyncHandler(async (req, res) => {
  const customer = await Customer.findByPk(req.params.id);
  if (!customer) throw new HttpError(404, 'Customer not found');
  const data = cleanCustomerPayload(req.body);
  if (Object.prototype.hasOwnProperty.call(data, 'name') && !data.name) throw new HttpError(422, 'Customer name is required.');
  if (Object.prototype.hasOwnProperty.call(data, 'phone') && !data.phone) throw new HttpError(422, 'Customer phone is required.');
  if (data.customer_code && await Customer.count({
    where: { customer_code: data.customer_code, id: { [Op.ne]: customer.id } },
  })) {
    throw new HttpError(409, 'That customer code is already in use.');
  }
  if (
    Object.prototype.hasOwnProperty.call(data, 'opening_balance')
    && Math.abs(Number(data.opening_balance) - Number(customer.opening_balance || 0)) > 0.001
  ) {
    const [saleCount, paymentCount] = await Promise.all([
      Sale.count({ where: { customer_id: customer.id } }),
      CustomerAccountPayment.count({ where: { customer_id: customer.id } }),
    ]);
    if (saleCount || paymentCount) {
      throw new HttpError(409, 'Opening balance cannot be changed after account activity has started. Record a customer payment or create a correcting sale/return instead.');
    }
  }
  await customer.update(data);
  res.json({ data: customer });
});

const remove = asyncHandler(async (req, res) => {
  const customer = await Customer.findByPk(req.params.id);
  if (!customer) throw new HttpError(404, 'Customer not found');
  const linked = await Sale.count({ where: { customer_id: customer.id } });
  if (linked) throw new HttpError(409, 'This customer has sales history and cannot be deleted. Set the profile to inactive instead.');
  await customer.destroy();
  res.json({ message: 'Deleted' });
});

const recordPayment = asyncHandler(async (req, res) => {
  const amount = Number(req.body.amount);
  if (!Number.isFinite(amount) || amount <= 0) throw new HttpError(422, 'Payment amount must be greater than zero.');
  const paymentMethod = PAYMENT_METHODS.has(req.body.payment_method) ? req.body.payment_method : 'cash';
  const date = req.body.date || todayISO();
  if (!isValidISODate(date)) throw new HttpError(422, 'Payment date must be a valid date.');

  await sequelize.transaction(async (transaction) => {
    const customer = await Customer.findByPk(req.params.id, { transaction, lock: transaction.LOCK.UPDATE });
    if (!customer) throw new HttpError(404, 'Customer not found');

    const sales = await loadCustomerInvoices(customer.id, { transaction });
    const oldestFirst = sales.map((sale) => ({ ...invoiceSnapshot(sale), sale })).reverse();
    const plan = allocateOldestFirst(amount, oldestFirst);
    const payment = await CustomerAccountPayment.create({
      customer_id: customer.id,
      date,
      amount: money(amount),
      unallocated_amount: plan.unallocated_amount,
      payment_method: paymentMethod,
      reference: String(req.body.reference || '').trim() || null,
      receipt_code: generateReferenceCode('PAY'),
      note: String(req.body.note || '').trim() || null,
      pos_register_id: req.body.pos_register_id || null,
      created_by: req.user?.id || null,
    }, { transaction });

    for (const allocation of plan.allocations) {
      const invoice = oldestFirst.find((entry) => Number(entry.id) === Number(allocation.sale_id));
      await SalesPayment.create({
        sale_id: allocation.sale_id,
        customer_account_payment_id: payment.id,
        amount: allocation.amount,
        paying_method: paymentMethod,
        received_amount: allocation.amount,
        reference: payment.receipt_code,
        note: 'Allocated from customer account payment',
        paid_on: date,
      }, { transaction });

      const newPaid = money(invoice.paid_amount + allocation.amount);
      await invoice.sale.update({
        paid_amount: newPaid,
        payment_status: newPaid + invoice.return_amount >= invoice.grand_total ? 'paid' : 'partial',
      }, { transaction });
    }
  });

  res.status(201).json({ data: await buildProfile(req.params.id) });
});

module.exports = { list, getOne, getProfile, create, update, remove, recordPayment, buildProfile };
