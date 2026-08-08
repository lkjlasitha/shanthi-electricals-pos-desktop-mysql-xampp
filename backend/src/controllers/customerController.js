const {
  Customer, Sale, SaleItem, SalesPayment, Warehouse, Product, CustomerPayment, Quotation, QuotationItem,
} = require('../models/associations');
const { asyncHandler } = require('../utils/helpers');
const { todayISO } = require('../utils/date');
const HttpError = require('../utils/httpError');
const { listCustomerBalances, computeCustomerDue, getReceivablesTotals } = require('../services/customerLedgerService');

// Accounts-receivable view: every customer who currently owes the shop
// money, most owed first. This is the "who do we need to collect from"
// screen that advanced POS systems ship as a dedicated pipeline.
const receivables = asyncHandler(async (req, res) => {
  const balances = await listCustomerBalances({ onlyOutstanding: true });
  balances.sort((a, b) => b.total_due - a.total_due);
  const totals = await getReceivablesTotals();
  res.json({ data: balances, totals });
});

// List endpoint used by the Customers page — same rows as the plain CRUD
// list, but with the due/credit badges already computed so the UI does not
// need a second round trip per row.
const listWithBalances = asyncHandler(async (req, res) => {
  const balances = await listCustomerBalances({ onlyOutstanding: false });
  const search = String(req.query.search || '').trim().toLowerCase();
  const filtered = search
    ? balances.filter((row) => [row.name, row.phone, row.email].filter(Boolean).some((value) => String(value).toLowerCase().includes(search)))
    : balances;
  res.json({ data: filtered, total: filtered.length });
});

// Full 360° profile for one customer: contact info, running balance, every
// bill (with its own due amount), every quotation, and the account-level
// payment history. This is the screen a shop owner opens to answer
// "how much does this regular customer owe me, and for what."
const profile = asyncHandler(async (req, res) => {
  const customer = await Customer.findByPk(req.params.id);
  if (!customer) return res.status(404).json({ message: 'Customer not found' });

  const [sales, quotations, accountPayments] = await Promise.all([
    Sale.findAll({
      where: { customer_id: customer.id },
      include: [
        Warehouse,
        { model: SaleItem, as: 'items', include: [Product] },
        { model: SalesPayment, as: 'payments' },
      ],
      order: [['id', 'DESC']],
    }),
    Quotation.findAll({
      where: { customer_id: customer.id },
      include: [{ model: QuotationItem, as: 'items', include: [Product] }],
      order: [['id', 'DESC']],
      limit: 25,
    }),
    CustomerPayment.findAll({ where: { customer_id: customer.id }, order: [['paid_on', 'DESC'], ['id', 'DESC']] }),
  ]);

  const salesDue = sales.reduce((sum, sale) => (
    sale.payment_status !== 'paid' ? sum + (Number(sale.grand_total) - Number(sale.paid_amount)) : sum
  ), 0);
  const accountPaymentsTotal = accountPayments.reduce((sum, payment) => sum + Number(payment.amount), 0);
  const due = computeCustomerDue({
    opening_balance: customer.opening_balance,
    sales_due: salesDue,
    account_payments: accountPaymentsTotal,
  });

  res.json({
    data: {
      customer,
      sales,
      quotations,
      account_payments: accountPayments,
      summary: {
        total_purchases: sales.reduce((sum, sale) => sum + Number(sale.grand_total), 0),
        invoice_count: sales.length,
        unpaid_invoice_count: sales.filter((sale) => sale.payment_status !== 'paid').length,
        last_purchase_date: sales[0]?.date || null,
        ...due,
        over_credit_limit: Boolean(customer.credit_limit) && due.total_due > Number(customer.credit_limit),
      },
    },
  });
});

// Records a payment "on account" — money the customer pays down against
// their general/opening balance rather than one specific invoice (e.g. a
// regular customer settling part of an old running tab).
const addAccountPayment = asyncHandler(async (req, res) => {
  const customer = await Customer.findByPk(req.params.id);
  if (!customer) return res.status(404).json({ message: 'Customer not found' });

  const amount = Number(req.body.amount);
  if (!Number.isFinite(amount) || amount <= 0) throw new HttpError(422, 'Enter a valid payment amount greater than zero.');

  const payment = await CustomerPayment.create({
    customer_id: customer.id,
    amount,
    paying_method: req.body.paying_method || 'cash',
    reference: req.body.reference || null,
    note: req.body.note || null,
    paid_on: req.body.paid_on || todayISO(),
    created_by: req.user ? req.user.id : null,
  });

  res.status(201).json({ data: payment });
});

module.exports = { receivables, listWithBalances, profile, addAccountPayment };
