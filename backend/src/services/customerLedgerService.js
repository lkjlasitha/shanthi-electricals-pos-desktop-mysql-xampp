const { Customer, Sale, CustomerPayment } = require('../models/associations');

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
async function listCustomerBalances({ onlyOutstanding = false } = {}) {
  const [customers, sales, payments] = await Promise.all([
    Customer.findAll({ order: [['name', 'ASC']] }), Sale.findAll(), CustomerPayment.findAll(),
  ]);
  const today = new Date().toISOString().slice(0, 10);
  const rows = customers.map((customer) => {
    const customerSales = sales.filter((sale) => Number(sale.customer_id) === Number(customer.id));
    const customerPayments = payments.filter((payment) => Number(payment.customer_id) === Number(customer.id));
    const openSales = customerSales.map((sale) => ({ sale, due: Math.max(0, asNumber(sale.grand_total) - asNumber(sale.paid_amount)) })).filter((row) => row.due > 0.005);
    return {
      ...customer.toJSON(),
      sales_due: openSales.reduce((sum, row) => sum + row.due, 0),
      account_payments: customerPayments.reduce((sum, row) => sum + asNumber(row.amount), 0),
      opening_payments: customerPayments.reduce((sum, row) => sum + asNumber(row.opening_balance_amount ?? row.amount), 0),
      total_purchases: customerSales.reduce((sum, sale) => sum + asNumber(sale.grand_total), 0),
      invoice_count: customerSales.length,
      unpaid_invoice_count: openSales.length,
      overdue_due: openSales.filter(({ sale }) => sale.due_date && sale.due_date < today).reduce((sum, row) => sum + row.due, 0),
      oldest_due_date: openSales.map(({ sale }) => sale.due_date).filter(Boolean).sort()[0] || null,
      last_purchase_date: customerSales.map((sale) => sale.date).filter(Boolean).sort().at(-1) || null,
      last_account_payment_date: customerPayments.map((payment) => payment.paid_on).filter(Boolean).sort().at(-1) || null,
    };
  });

  const withDue = rows.map((row) => {
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

  return onlyOutstanding ? withDue.filter((row) => row.total_due > 0.005) : withDue;
}

// Aggregate totals for the dashboard (fast, single-row query — no per-customer detail).
async function getReceivablesTotals() {
  const balances = await listCustomerBalances();
  const salesDue = balances.reduce((sum, row) => sum + row.sales_due, 0);
  const openingDue = balances.reduce((sum, row) => sum + row.opening_balance_due, 0);
  const overdueDue = balances.reduce((sum, row) => sum + row.overdue_due, 0);
  return {
    outstanding_receivables: salesDue + openingDue,
    outstanding_from_sales: salesDue,
    outstanding_from_opening_balance: openingDue,
    overdue_receivables: overdueDue,
    current_receivables: Math.max(0, salesDue + openingDue - overdueDue),
    customers_with_open_sales: balances.filter((row) => row.sales_due > 0.005).length,
  };
}

module.exports = { computeCustomerDue, planCustomerPayment, listCustomerBalances, getReceivablesTotals, asNumber };
