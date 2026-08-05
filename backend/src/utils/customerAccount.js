function money(value) {
  const number = Number(value || 0);
  return Number.isFinite(number) ? Math.round((number + Number.EPSILON) * 100) / 100 : 0;
}

function sum(records, field) {
  return money((records || []).reduce((total, record) => total + Number(record?.[field] || 0), 0));
}

function invoiceSnapshot(sale) {
  const grandTotal = money(sale.grand_total);
  const paid = sum(sale.payments, 'amount');
  const returned = sum(sale.returns, 'grand_total');
  const balance = money(Math.max(0, grandTotal - paid - returned));

  return {
    id: sale.id,
    reference_code: sale.reference_code,
    date: sale.date,
    due_date: sale.due_date,
    grand_total: grandTotal,
    paid_amount: paid,
    return_amount: returned,
    balance,
    payment_status: balance <= 0 ? 'paid' : paid > 0 || returned > 0 ? 'partial' : 'unpaid',
  };
}

function allocateOldestFirst(amount, invoices) {
  let remaining = money(amount);
  const allocations = [];

  for (const invoice of invoices || []) {
    if (remaining <= 0) break;
    const balance = money(invoice.balance);
    if (balance <= 0) continue;
    const allocated = money(Math.min(remaining, balance));
    allocations.push({ sale_id: invoice.id, amount: allocated });
    remaining = money(remaining - allocated);
  }

  return { allocations, unallocated_amount: remaining };
}

function buildAccountSummary({ customer, invoices = [], unallocatedCredit = 0, today }) {
  const openingBalance = money(customer?.opening_balance);
  const invoiceBalance = money(invoices.reduce((total, invoice) => total + Number(invoice.balance || 0), 0));
  const outstanding = money(openingBalance + invoiceBalance - Number(unallocatedCredit || 0));
  const overdue = money(invoices.reduce((total, invoice) => {
    if (!invoice.due_date || !today || invoice.due_date >= today) return total;
    return total + Number(invoice.balance || 0);
  }, 0));
  const creditLimit = money(customer?.credit_limit);

  return {
    opening_balance: openingBalance,
    invoice_balance: invoiceBalance,
    unallocated_credit: money(unallocatedCredit),
    outstanding,
    amount_due: Math.max(0, outstanding),
    credit_balance: Math.max(0, money(-outstanding)),
    overdue,
    credit_limit: creditLimit,
    available_credit: customer?.allow_credit
      ? Math.max(0, money(creditLimit - Math.max(0, outstanding)))
      : 0,
  };
}

module.exports = { money, sum, invoiceSnapshot, allocateOldestFirst, buildAccountSummary };
