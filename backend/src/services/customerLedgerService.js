const { Customer, CustomerPayment, Sale } = require('../models/associations');
const { todayISO } = require('../utils/date');

function asNumber(value) {
  const number = Number(value || 0);
  return Number.isFinite(number) ? number : 0;
}

function computeCustomerDue({ opening_balance, sales_due, account_payments, opening_payments }) {
  const salesDue = asNumber(sales_due);
  const openingPayments = opening_payments ?? account_payments;
  const openingRemaining = Math.max(0, asNumber(opening_balance) - asNumber(openingPayments));
  return { sales_due: salesDue, opening_balance_due: openingRemaining, total_due: salesDue + openingRemaining };
}

function planCustomerPayment({ amount, opening_balance_due, sales = [] }) {
  const paymentAmount = asNumber(amount);
  if (paymentAmount <= 0) throw new Error('Payment amount must be greater than zero.');
  const openingDue = Math.max(0, asNumber(opening_balance_due));
  const invoiceRows = sales.map((sale) => ({
    sale_id: Number(sale.sale_id ?? sale.id),
    due_amount: Math.max(0, asNumber(sale.due_amount ?? (asNumber(sale.grand_total) - asNumber(sale.paid_amount)))),
  })).filter((sale) => sale.sale_id > 0 && sale.due_amount > 0.005);
  const totalDue = openingDue + invoiceRows.reduce((sum, sale) => sum + sale.due_amount, 0);
  if (paymentAmount - totalDue > 0.005) {
    const error = new Error(`Payment of ${paymentAmount.toFixed(2)} is more than the customer balance of ${totalDue.toFixed(2)}.`);
    error.status = 422;
    throw error;
  }
  let remaining = Math.min(paymentAmount, totalDue);
  const openingBalanceAmount = Math.min(openingDue, remaining);
  remaining -= openingBalanceAmount;
  const allocations = [];
  for (const sale of invoiceRows) {
    if (remaining <= 0.005) break;
    const allocationAmount = Math.min(sale.due_amount, remaining);
    allocations.push({ sale_id: sale.sale_id, amount: allocationAmount });
    remaining -= allocationAmount;
  }
  return {
    amount: paymentAmount,
    total_due_before: totalDue,
    opening_balance_amount: openingBalanceAmount,
    invoice_amount: allocations.reduce((sum, allocation) => sum + allocation.amount, 0),
    allocations,
  };
}

async function listCustomerBalances({ onlyOutstanding = false } = {}) {
  const [customers, sales, payments] = await Promise.all([
    Customer.findAll({ order: [['name', 'ASC']] }),
    Sale.findAll(),
    CustomerPayment.findAll(),
  ]);
  const today = todayISO();
  const salesByCustomer = new Map();
  for (const sale of sales) {
    const row = salesByCustomer.get(Number(sale.customer_id)) || {
      sales_due: 0, total_purchases: 0, invoice_count: 0, unpaid_invoice_count: 0,
      overdue_due: 0, oldest_due_date: null, last_purchase_date: null,
    };
    const due = Math.max(0, asNumber(sale.grand_total) - asNumber(sale.paid_amount));
    row.sales_due += due;
    row.total_purchases += asNumber(sale.grand_total);
    row.invoice_count += 1;
    if (due > 0.005) {
      row.unpaid_invoice_count += 1;
      if (sale.due_date && sale.due_date < today) row.overdue_due += due;
      if (sale.due_date && (!row.oldest_due_date || sale.due_date < row.oldest_due_date)) row.oldest_due_date = sale.due_date;
    }
    if (!row.last_purchase_date || sale.date > row.last_purchase_date) row.last_purchase_date = sale.date;
    salesByCustomer.set(Number(sale.customer_id), row);
  }
  const paymentsByCustomer = new Map();
  for (const payment of payments) {
    const row = paymentsByCustomer.get(Number(payment.customer_id)) || { account_payments: 0, opening_payments: 0, last_account_payment_date: null };
    row.account_payments += asNumber(payment.amount);
    row.opening_payments += asNumber(payment.opening_balance_amount ?? payment.amount);
    if (!row.last_account_payment_date || payment.paid_on > row.last_account_payment_date) row.last_account_payment_date = payment.paid_on;
    paymentsByCustomer.set(Number(payment.customer_id), row);
  }
  const rows = customers.map((customer) => ({
    ...customer.toJSON(),
    ...(salesByCustomer.get(Number(customer.id)) || {}),
    ...(paymentsByCustomer.get(Number(customer.id)) || {}),
  })).map((row) => {
    const due = computeCustomerDue(row);
    return {
      ...row,
      credit_limit: row.credit_limit === null ? null : asNumber(row.credit_limit),
      opening_balance: asNumber(row.opening_balance),
      total_purchases: asNumber(row.total_purchases),
      invoice_count: Number(row.invoice_count || 0),
      unpaid_invoice_count: Number(row.unpaid_invoice_count || 0),
      sales_due: due.sales_due,
      opening_balance_due: due.opening_balance_due,
      total_due: due.total_due,
      overdue_due: asNumber(row.overdue_due),
      current_due: Math.max(0, due.total_due - asNumber(row.overdue_due)),
      over_credit_limit: asNumber(row.credit_limit) > 0 && due.total_due > asNumber(row.credit_limit),
    };
  });
  return onlyOutstanding ? rows.filter((row) => row.total_due > 0.005) : rows;
}

async function getReceivablesTotals() {
  const balances = await listCustomerBalances();
  const openCustomers = new Set();
  let salesDue = 0;
  let openingDue = 0;
  let overdueDue = 0;
  for (const row of balances) {
    salesDue += row.sales_due;
    openingDue += row.opening_balance_due;
    overdueDue += row.overdue_due;
    if (row.sales_due > 0.005) openCustomers.add(row.id);
  }
  return {
    outstanding_receivables: salesDue + openingDue,
    outstanding_from_sales: salesDue,
    outstanding_from_opening_balance: openingDue,
    overdue_receivables: overdueDue,
    current_receivables: Math.max(0, salesDue + openingDue - overdueDue),
    customers_with_open_sales: openCustomers.size,
  };
}

module.exports = { computeCustomerDue, planCustomerPayment, listCustomerBalances, getReceivablesTotals, asNumber };
