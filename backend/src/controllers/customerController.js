const {
  Customer, Sale, SaleItem, SalesPayment, Warehouse, Product, CustomerPayment, Quotation, QuotationItem, POSRegister, sequelize,
} = require('../models/associations');
const { asyncHandler } = require('../utils/helpers');
const { todayISO, daysBetweenISO } = require('../utils/date');
const HttpError = require('../utils/httpError');
const {
  listCustomerBalances, computeCustomerDue, getReceivablesTotals, planCustomerPayment,
} = require('../services/customerLedgerService');

const PAYMENT_METHODS = new Set(['cash', 'card', 'bank_transfer', 'cheque', 'other']);

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
    CustomerPayment.findAll({
      where: { customer_id: customer.id },
      include: [{
        model: SalesPayment,
        as: 'allocations',
        include: [{ model: Sale, attributes: ['id', 'reference_code', 'date', 'grand_total'] }],
      }],
      order: [['paid_on', 'DESC'], ['id', 'DESC']],
    }),
  ]);

  const today = todayISO();
  const salesWithBalances = sales.map((sale) => {
    const row = sale.toJSON();
    const dueAmount = Math.max(0, Number(row.grand_total || 0) - Number(row.paid_amount || 0));
    const isOverdue = dueAmount > 0.005 && Boolean(row.due_date) && row.due_date < today;
    return {
      ...row,
      due_amount: dueAmount,
      is_overdue: isOverdue,
      days_overdue: isOverdue ? daysBetweenISO(row.due_date, today) : 0,
    };
  });
  const salesDue = salesWithBalances.reduce((sum, sale) => sum + sale.due_amount, 0);
  const openingPaymentsTotal = accountPayments.reduce((sum, payment) => (
    sum + Number(payment.opening_balance_amount === null ? payment.amount : payment.opening_balance_amount || 0)
  ), 0);
  const due = computeCustomerDue({
    opening_balance: customer.opening_balance,
    sales_due: salesDue,
    opening_payments: openingPaymentsTotal,
  });
  const overdueDue = salesWithBalances.reduce((sum, sale) => sum + (sale.is_overdue ? sale.due_amount : 0), 0);
  const unpaidSales = salesWithBalances.filter((sale) => sale.due_amount > 0.005);
  const paymentDates = [
    ...accountPayments.map((payment) => payment.paid_on),
    ...salesWithBalances.flatMap((sale) => (sale.payments || []).map((payment) => payment.paid_on)),
  ].filter(Boolean).sort().reverse();

  res.json({
    data: {
      customer,
      sales: salesWithBalances,
      quotations,
      account_payments: accountPayments,
      summary: {
        total_purchases: salesWithBalances.reduce((sum, sale) => sum + Number(sale.grand_total), 0),
        total_paid: salesWithBalances.reduce((sum, sale) => sum + Number(sale.paid_amount || 0), 0) + openingPaymentsTotal,
        invoice_count: salesWithBalances.length,
        unpaid_invoice_count: unpaidSales.length,
        overdue_invoice_count: unpaidSales.filter((sale) => sale.is_overdue).length,
        overdue_due: overdueDue,
        current_due: Math.max(0, due.total_due - overdueDue),
        next_due_date: unpaidSales.map((sale) => sale.due_date).filter(Boolean).sort()[0] || null,
        last_purchase_date: salesWithBalances[0]?.date || null,
        last_payment_date: paymentDates[0] || null,
        ...due,
        over_credit_limit: Number(customer.credit_limit || 0) > 0 && due.total_due > Number(customer.credit_limit),
      },
    },
  });
});

// Records one customer-level receipt and allocates it oldest-debt-first:
// opening balance, then invoice balances. Each invoice allocation also creates
// a SalesPayment row, so the related bill and every other screen remain exact.
const addAccountPayment = asyncHandler(async (req, res) => {
  const body = req.body || {};
  const amount = Number(body.amount);
  if (!Number.isFinite(amount) || amount <= 0) throw new HttpError(422, 'Enter a valid payment amount greater than zero.');
  const method = String(body.paying_method || 'cash');
  if (!PAYMENT_METHODS.has(method)) throw new HttpError(422, 'Select a valid payment method.');

  const paymentId = await sequelize.transaction(async (transaction) => {
    const customer = await Customer.findByPk(req.params.id, { transaction, lock: transaction.LOCK.UPDATE });
    if (!customer) throw new HttpError(404, 'Customer not found');

    const oldAccountPayments = await CustomerPayment.findAll({
      where: { customer_id: customer.id },
      attributes: ['amount', 'opening_balance_amount'],
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    const openSales = await Sale.findAll({
      where: { customer_id: customer.id },
      order: [['date', 'ASC'], ['id', 'ASC']],
      transaction,
      lock: transaction.LOCK.UPDATE,
    });

    const openingPaid = oldAccountPayments.reduce((sum, payment) => (
      sum + Number(payment.opening_balance_amount === null ? payment.amount : payment.opening_balance_amount || 0)
    ), 0);
    const plan = planCustomerPayment({
      amount,
      opening_balance_due: Math.max(0, Number(customer.opening_balance || 0) - openingPaid),
      sales: openSales.map((sale) => ({
        id: sale.id,
        due_amount: Math.max(0, Number(sale.grand_total || 0) - Number(sale.paid_amount || 0)),
      })),
    });
    const activeRegister = req.user ? await POSRegister.findOne({
      where: { user_id: req.user.id, status: 'open' }, transaction,
    }) : null;

    const payment = await CustomerPayment.create({
      customer_id: customer.id,
      pos_register_id: activeRegister?.id || null,
      amount,
      paying_method: method,
      opening_balance_amount: plan.opening_balance_amount,
      reference: String(body.reference || '').trim() || null,
      note: String(body.note || '').trim() || null,
      paid_on: body.paid_on || todayISO(),
      created_by: req.user ? req.user.id : null,
    }, { transaction });

    const salesById = new Map(openSales.map((sale) => [Number(sale.id), sale]));
    for (const allocation of plan.allocations) {
      const sale = salesById.get(Number(allocation.sale_id));
      await SalesPayment.create({
        sale_id: sale.id,
        pos_register_id: activeRegister?.id || null,
        customer_payment_id: payment.id,
        amount: allocation.amount,
        paying_method: method,
        received_amount: allocation.amount,
        reference: String(body.reference || '').trim() || null,
        note: `Allocated from customer account payment #${payment.id}`,
        paid_on: body.paid_on || todayISO(),
      }, { transaction });

      sale.paid_amount = Math.min(Number(sale.grand_total), Number(sale.paid_amount || 0) + allocation.amount);
      sale.payment_status = sale.paid_amount >= Number(sale.grand_total) - 0.005 ? 'paid' : 'partial';
      await sale.save({ transaction });
    }

    return payment.id;
  });

  const payment = await CustomerPayment.findByPk(paymentId, {
    include: [{ model: SalesPayment, as: 'allocations', include: [Sale] }],
  });
  res.status(201).json({ data: payment });
});

module.exports = { receivables, listWithBalances, profile, addAccountPayment };
