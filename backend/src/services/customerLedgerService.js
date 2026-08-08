const { QueryTypes } = require('sequelize');
const { sequelize } = require('../models/associations');

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
function computeCustomerDue({ opening_balance, sales_due, account_payments }) {
  const salesDue = asNumber(sales_due);
  const openingRemaining = Math.max(0, asNumber(opening_balance) - asNumber(account_payments));
  return {
    sales_due: salesDue,
    opening_balance_due: openingRemaining,
    total_due: salesDue + openingRemaining,
  };
}

// Returns every customer with their aggregated balances. Used for the
// Customers list (badges) and the Accounts Receivable view.
async function listCustomerBalances({ onlyOutstanding = false } = {}) {
  const rows = await sequelize.query(
    `SELECT
       c.id, c.name, c.phone, c.email, c.city, c.customer_type, c.credit_limit,
       c.opening_balance, c.is_active,
       COALESCE(sales.sales_due, 0) AS sales_due,
       COALESCE(payments.account_payments, 0) AS account_payments,
       COALESCE(sales.total_purchases, 0) AS total_purchases,
       COALESCE(sales.invoice_count, 0) AS invoice_count,
       sales.last_purchase_date
     FROM customers c
     LEFT JOIN (
       SELECT
         customer_id,
         SUM(grand_total) AS total_purchases,
         COUNT(*) AS invoice_count,
         MAX(date) AS last_purchase_date,
         SUM(CASE WHEN payment_status != 'paid' THEN grand_total - paid_amount ELSE 0 END) AS sales_due
       FROM sales
       GROUP BY customer_id
     ) sales ON sales.customer_id = c.id
     LEFT JOIN (
       SELECT customer_id, SUM(amount) AS account_payments
       FROM customer_payments
       GROUP BY customer_id
     ) payments ON payments.customer_id = c.id
     ORDER BY c.name ASC`,
    { type: QueryTypes.SELECT }
  );

  const withDue = rows.map((row) => {
    const due = computeCustomerDue(row);
    return {
      ...row,
      credit_limit: row.credit_limit === null ? null : asNumber(row.credit_limit),
      opening_balance: asNumber(row.opening_balance),
      total_purchases: asNumber(row.total_purchases),
      invoice_count: Number(row.invoice_count || 0),
      sales_due: due.sales_due,
      opening_balance_due: due.opening_balance_due,
      total_due: due.total_due,
      over_credit_limit: Boolean(row.credit_limit) && due.total_due > asNumber(row.credit_limit),
    };
  });

  return onlyOutstanding ? withDue.filter((row) => row.total_due > 0.005) : withDue;
}

// Aggregate totals for the dashboard (fast, single-row query — no per-customer detail).
async function getReceivablesTotals() {
  const [row] = await sequelize.query(
    `SELECT
       COALESCE(SUM(CASE WHEN s.payment_status != 'paid' THEN s.grand_total - s.paid_amount ELSE 0 END), 0) AS sales_due,
       COALESCE((SELECT SUM(GREATEST(c.opening_balance - COALESCE(cp.total_paid, 0), 0))
                 FROM customers c
                 LEFT JOIN (SELECT customer_id, SUM(amount) AS total_paid FROM customer_payments GROUP BY customer_id) cp
                   ON cp.customer_id = c.id), 0) AS opening_balance_due,
       COUNT(DISTINCT CASE WHEN s.payment_status != 'paid' THEN s.customer_id END) AS customers_with_open_sales
     FROM sales s`,
    { type: QueryTypes.SELECT }
  );

  const salesDue = asNumber(row?.sales_due);
  const openingDue = asNumber(row?.opening_balance_due);
  return {
    outstanding_receivables: salesDue + openingDue,
    outstanding_from_sales: salesDue,
    outstanding_from_opening_balance: openingDue,
    customers_with_open_sales: Number(row?.customers_with_open_sales || 0),
  };
}

module.exports = { computeCustomerDue, listCustomerBalances, getReceivablesTotals, asNumber };
