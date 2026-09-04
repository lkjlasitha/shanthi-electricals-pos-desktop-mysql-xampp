const HttpError = require('./httpError');
const { addDaysISO } = require('./date');

const PURCHASE_STATUSES = new Set(['pending', 'ordered', 'partially_received', 'received', 'cancelled']);
const PURCHASE_PAYMENT_METHODS = new Set(['cash', 'card', 'bank_transfer', 'cheque', 'credit', 'other']);

function nonNegativeNumber(value, label) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) {
    throw new HttpError(422, `${label} must be a valid number greater than or equal to zero.`);
  }
  return number;
}

function positiveNumber(value, label) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) {
    throw new HttpError(422, `${label} must be greater than zero.`);
  }
  return number;
}

function positiveInteger(value, label) {
  const number = Number(value);
  if (!Number.isInteger(number) || number <= 0) {
    throw new HttpError(422, `${label} must be a valid record ID.`);
  }
  return number;
}

function cleanDate(value, label, { required = false } = {}) {
  if (value === undefined || value === null || value === '') {
    if (required) throw new HttpError(422, `${label} is required.`);
    return null;
  }
  const date = String(value);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(new Date(`${date}T00:00:00Z`).getTime())) {
    throw new HttpError(422, `${label} must be a valid date.`);
  }
  return date;
}

function normalizePurchaseStatus(value, { forCreate = false } = {}) {
  const status = String(value || 'received').trim().toLowerCase();
  if (!PURCHASE_STATUSES.has(status) || (forCreate && !['pending', 'ordered', 'received'].includes(status))) {
    throw new HttpError(422, 'Select a valid purchase receiving status.');
  }
  return status;
}

function normalizePurchasePaymentMethod(value, { allowCredit = true } = {}) {
  const method = String(value || 'cash').trim().toLowerCase();
  if (!PURCHASE_PAYMENT_METHODS.has(method) || (!allowCredit && method === 'credit')) {
    throw new HttpError(422, 'Select a valid supplier payment method.');
  }
  return method;
}

function computeInitialPurchasePayment({ grand_total, paid_amount, payment_type }) {
  const grandTotal = nonNegativeNumber(grand_total, 'Grand total');
  const method = normalizePurchasePaymentMethod(payment_type);
  if (method === 'other') throw new HttpError(422, 'Initial supplier payment method must be cash, card, bank transfer, cheque, or credit.');
  const defaultPaid = method === 'credit' ? 0 : grandTotal;
  const paid = paid_amount === undefined || paid_amount === null || paid_amount === ''
    ? defaultPaid
    : nonNegativeNumber(paid_amount, 'Paid amount');

  if (method === 'credit' && paid > 0.005) {
    throw new HttpError(422, 'Select the actual payment method when recording an initial paid amount.');
  }

  if (paid - grandTotal > 0.005) {
    throw new HttpError(422, `Paid amount cannot be more than the bill total of ${grandTotal.toFixed(2)}.`);
  }

  return {
    payment_type: method,
    paid_amount: Math.min(paid, grandTotal),
    payment_status: paid >= grandTotal - 0.005 ? 'paid' : paid > 0 ? 'partial' : 'unpaid',
  };
}

function resolvePurchaseDueDate({ purchase_date, due_date, payment_status, payment_terms_days = 30 }) {
  if (payment_status === 'paid') return null;
  const supplied = cleanDate(due_date, 'Due date');
  if (supplied) return supplied;
  const days = Number(payment_terms_days);
  return addDaysISO(purchase_date, Number.isInteger(days) && days >= 0 && days <= 3650 ? days : 30);
}

function receiptStatus(items) {
  const ordered = items.reduce((sum, item) => sum + nonNegativeNumber(item.quantity || 0, 'Ordered quantity'), 0);
  const received = items.reduce((sum, item) => sum + nonNegativeNumber(item.received_quantity || 0, 'Received quantity'), 0);
  if (ordered > 0 && received >= ordered - 0.000001) return 'received';
  if (received > 0) return 'partially_received';
  return 'ordered';
}

function planPurchaseReceipt(items, requestedRows) {
  if (!Array.isArray(requestedRows) || requestedRows.length === 0) {
    throw new HttpError(422, 'Enter a received quantity for at least one item.');
  }

  const source = new Map(items.map((item) => [Number(item.id), item]));
  const seen = new Set();
  const increments = [];

  requestedRows.forEach((row, index) => {
    const purchaseItemId = positiveInteger(row.purchase_item_id, `Purchase item ${index + 1}`);
    if (seen.has(purchaseItemId)) throw new HttpError(422, 'A purchase item can only appear once in a receipt.');
    seen.add(purchaseItemId);
    const item = source.get(purchaseItemId);
    if (!item) throw new HttpError(422, 'One of the selected items does not belong to this purchase.');

    const quantity = positiveNumber(row.quantity, `Received quantity for item ${index + 1}`);
    const ordered = nonNegativeNumber(item.quantity, 'Ordered quantity');
    const alreadyReceived = nonNegativeNumber(item.received_quantity || 0, 'Previously received quantity');
    const remaining = Math.max(0, ordered - alreadyReceived);
    if (quantity - remaining > 0.000001) {
      throw new HttpError(422, `Received quantity for item ${index + 1} exceeds the remaining ${remaining}.`);
    }
    increments.push({
      purchase_item_id: purchaseItemId,
      product_id: Number(item.product_id),
      quantity,
      new_received_quantity: alreadyReceived + quantity,
    });
  });

  const projected = items.map((item) => {
    const increment = increments.find((row) => row.purchase_item_id === Number(item.id));
    return {
      quantity: Number(item.quantity || 0),
      received_quantity: increment ? increment.new_received_quantity : Number(item.received_quantity || 0),
    };
  });

  return { increments, status: receiptStatus(projected) };
}

function computePurchaseBalance({ grand_total, returned_amount, paid_amount }) {
  const grandTotal = nonNegativeNumber(grand_total || 0, 'Grand total');
  const returnedAmount = Math.min(grandTotal, nonNegativeNumber(returned_amount || 0, 'Returned amount'));
  const paidAmount = nonNegativeNumber(paid_amount || 0, 'Paid amount');
  const netTotal = Math.max(0, grandTotal - returnedAmount);
  const outstanding = Math.max(0, netTotal - paidAmount);
  const supplierCredit = Math.max(0, paidAmount - netTotal);
  return {
    grand_total: grandTotal,
    returned_amount: returnedAmount,
    net_total: netTotal,
    paid_amount: paidAmount,
    outstanding,
    supplier_credit: supplierCredit,
    payment_status: outstanding <= 0.005 ? 'paid' : paidAmount > 0 ? 'partial' : 'unpaid',
  };
}

function summarizePayables(purchases, today) {
  const summary = {
    bill_count: 0,
    billed_total: 0,
    returned_total: 0,
    net_billed_total: 0,
    paid_total: 0,
    outstanding_total: 0,
    overdue_total: 0,
    unpaid_bill_count: 0,
    overdue_bill_count: 0,
    supplier_credit_total: 0,
  };

  for (const purchase of purchases || []) {
    if (purchase.status === 'cancelled') continue;
    const balance = computePurchaseBalance(purchase);
    const { grand_total: total, returned_amount: returned, net_total: netTotal, paid_amount: paid, outstanding } = balance;
    const overdue = outstanding > 0.005 && purchase.due_date && purchase.due_date < today;
    summary.bill_count += 1;
    summary.billed_total += total;
    summary.returned_total += returned;
    summary.net_billed_total += netTotal;
    summary.paid_total += paid;
    summary.outstanding_total += outstanding;
    summary.supplier_credit_total += balance.supplier_credit;
    if (outstanding > 0.005) summary.unpaid_bill_count += 1;
    if (overdue) {
      summary.overdue_total += outstanding;
      summary.overdue_bill_count += 1;
    }
  }
  return summary;
}

module.exports = {
  cleanDate,
  computePurchaseBalance,
  computeInitialPurchasePayment,
  nonNegativeNumber,
  normalizePurchasePaymentMethod,
  normalizePurchaseStatus,
  planPurchaseReceipt,
  positiveInteger,
  positiveNumber,
  receiptStatus,
  resolvePurchaseDueDate,
  summarizePayables,
};
