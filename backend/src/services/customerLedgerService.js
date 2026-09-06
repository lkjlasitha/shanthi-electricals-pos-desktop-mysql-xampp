const { getRawCollection } = require('../config/sequelizeCompat');

function asNumber(value) {
  const number = Number(value || 0);
  return Number.isFinite(number) ? number : 0;
}

// A customer's total outstanding balance has two sources:
//  1. Unpaid/partially-paid sales (grand_total - paid_amount), which is the
//     normal "buy now, pay later" credit trail.
//  2. Any pre-existing opening_balance (debt that predates the system),
//     reduced by generic account payments recorded against it directly.
// This mirrors how advanced POS/ERP systems separate invoice-level dues from
// a general running account balance.
function computeCustomerDue({ opening_balance, sales_due, account_payments, opening_payments }) {
  const salesDue = asNumber(sales_due);
  const openingPayments = opening_payments ?? account_payments;
  const openingRemaining = Math.max(0, asNumber(opening_balance) - asNumber(openingPayments));
  return {
    sales_due: salesDue,
    opening_balance_due: openingRemaining,
    total_due: salesDue + openingRemaining,
  };
}

// Plans one customer-level receipt against the oldest debt first: historical
// opening balance, then open invoices in date/id order. The controller applies
// this plan inside a locked database transaction. Keeping the calculation pure
// makes overpayment and multi-invoice edge cases easy to test.
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

// Returns every customer with their aggregated balances. Used for the
// Customers list (badges) and the Accounts Receivable view.
//
// This pulls all sales and all customer_payments once and aggregates them in
// plain JS rather than as a single database-side join/group query. At the
// scale of a single shop's transaction history that's negligible work, and
// it sidesteps having to hand-translate a fairly intricate multi-join SQL
// query (with CASE WHEN / CURDATE() comparisons) into an equivalent Mongo
// aggregation pipeline, which would be far harder to read and verify.
async function listCustomerBalances({ onlyOutstanding = false } = {}) {
  const [customers, sales, payments] = await Promise.all([
    (await getRawCollection('customers')).find({}).sort({ name: 1 }).toArray(),
    (await getRawCollection('sales')).find({}, {
      projection: { customer_id: 1, grand_total: 1, paid_amount: 1, due_date: 1, date: 1 },
    }).toArray(),
    (await getRawCollection('customer_payments')).find({}, {
      projection: { customer_id: 1, amount: 1, opening_balance_amount: 1, paid_on: 1 },
    }).toArray(),
  ]);

  const today = new Date().toISOString().slice(0, 10);
  const salesByCustomer = new Map();
  for (const sale of sales) {
    const key = Number(sale.customer_id);
    const due = Math.max(asNumber(sale.grand_total) - asNumber(sale.paid_amount), 0);
    const bucket = salesByCustomer.get(key) || {
      total_purchases: 0, invoice_count: 0, last_purchase_date: null,
      sales_due: 0, unpaid_invoice_count: 0, overdue_due: 0, oldest_due_date: null,
    };
    bucket.total_purchases += asNumber(sale.grand_total);
    bucket.invoice_count += 1;
    if (!bucket.last_purchase_date || sale.date > bucket.last_purchase_date) bucket.last_purchase_date = sale.date;
    bucket.sales_due += due;
    if (due > 0.005) {
      bucket.unpaid_invoice_count += 1;
      if (sale.due_date && sale.due_date < today) bucket.overdue_due += due;
      if (sale.due_date && (!bucket.oldest_due_date || sale.due_date < bucket.oldest_due_date)) {
        bucket.oldest_due_date = sale.due_date;
      }
    }
    salesByCustomer.set(key, bucket);
  }

  const paymentsByCustomer = new Map();
  for (const payment of payments) {
    const key = Number(payment.customer_id);
    const amount = asNumber(payment.amount);
    const openingPortion = payment.opening_balance_amount === null || payment.opening_balance_amount === undefined
      ? amount
      : asNumber(payment.opening_balance_amount);
    const bucket = paymentsByCustomer.get(key) || { account_payments: 0, opening_payments: 0, last_account_payment_date: null };
    bucket.account_payments += amount;
    bucket.opening_payments += openingPortion;
    if (!bucket.last_account_payment_date || payment.paid_on > bucket.last_account_payment_date) {
      bucket.last_account_payment_date = payment.paid_on;
    }
    paymentsByCustomer.set(key, bucket);
  }

  const withDue = customers.map((customer) => {
    const salesBucket = salesByCustomer.get(Number(customer.id)) || {
      total_purchases: 0, invoice_count: 0, last_purchase_date: null,
      sales_due: 0, unpaid_invoice_count: 0, overdue_due: 0, oldest_due_date: null,
    };
    const paymentsBucket = paymentsByCustomer.get(Number(customer.id)) || {
      account_payments: 0, opening_payments: 0, last_account_payment_date: null,
    };
    const due = computeCustomerDue({
      opening_balance: customer.opening_balance,
      sales_due: salesBucket.sales_due,
      account_payments: paymentsBucket.account_payments,
      opening_payments: paymentsBucket.opening_payments,
    });
    return {
      id: customer.id,
      name: customer.name,
      phone: customer.phone,
      email: customer.email,
      city: customer.city,
      customer_type: customer.customer_type,
      credit_limit: customer.credit_limit === null || customer.credit_limit === undefined ? null : asNumber(customer.credit_limit),
      payment_terms_days: customer.payment_terms_days,
      opening_balance: asNumber(customer.opening_balance),
      is_active: customer.is_active,
      total_purchases: asNumber(salesBucket.total_purchases),
      invoice_count: salesBucket.invoice_count,
      unpaid_invoice_count: salesBucket.unpaid_invoice_count,
      oldest_due_date: salesBucket.oldest_due_date,
      last_purchase_date: salesBucket.last_purchase_date,
      last_account_payment_date: paymentsBucket.last_account_payment_date,
      sales_due: due.sales_due,
      opening_balance_due: due.opening_balance_due,
      total_due: due.total_due,
      overdue_due: asNumber(salesBucket.overdue_due),
      current_due: Math.max(0, due.total_due - asNumber(salesBucket.overdue_due)),
      over_credit_limit: asNumber(customer.credit_limit) > 0 && due.total_due > asNumber(customer.credit_limit),
    };
  });

  return onlyOutstanding ? withDue.filter((row) => row.total_due > 0.005) : withDue;
}

// Aggregate totals for the dashboard (a handful of numbers, no per-customer detail).
async function getReceivablesTotals() {
  const balances = await listCustomerBalances();
  const salesDue = balances.reduce((sum, row) => sum + row.sales_due, 0);
  const openingDue = balances.reduce((sum, row) => sum + row.opening_balance_due, 0);
  const overdueDue = balances.reduce((sum, row) => sum + row.overdue_due, 0);
  const customersWithOpenSales = balances.filter((row) => row.sales_due > 0.005).length;

  return {
    outstanding_receivables: salesDue + openingDue,
    outstanding_from_sales: salesDue,
    outstanding_from_opening_balance: openingDue,
    overdue_receivables: overdueDue,
    current_receivables: Math.max(0, salesDue + openingDue - overdueDue),
    customers_with_open_sales: customersWithOpenSales,
  };
}

module.exports = { computeCustomerDue, planCustomerPayment, listCustomerBalances, getReceivablesTotals, asNumber };
