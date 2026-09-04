const HttpError = require('./httpError');
const { addDaysISO } = require('./date');

const PAYMENT_METHODS = new Set(['cash', 'card', 'bank_transfer', 'cheque', 'other', 'credit']);
const INITIAL_SALE_METHODS = new Set(['cash', 'card', 'bank_transfer', 'credit']);

function nonNegative(value, label) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) throw new HttpError(422, `${label} must be zero or greater.`);
  return number;
}

function normalizePaymentMethod(value, { allowCredit = true } = {}) {
  const method = String(value || 'cash').trim().toLowerCase();
  if (!PAYMENT_METHODS.has(method) || (!allowCredit && method === 'credit')) {
    throw new HttpError(422, 'Select a valid payment method.');
  }
  return method;
}

function computeInitialPayment({ grand_total, paid_amount, received_amount, payment_type }) {
  const grandTotal = nonNegative(grand_total, 'Grand total');
  const method = normalizePaymentMethod(payment_type);
  if (!INITIAL_SALE_METHODS.has(method)) {
    throw new HttpError(422, 'Initial sale payment method must be cash, card, bank transfer, or credit.');
  }
  const defaultPaid = method === 'credit' ? 0 : grandTotal;
  const requestedPaid = paid_amount === undefined || paid_amount === null || paid_amount === ''
    ? defaultPaid
    : nonNegative(paid_amount, 'Paid amount');
  const receivedAmount = received_amount === undefined || received_amount === null || received_amount === ''
    ? requestedPaid
    : nonNegative(received_amount, 'Received amount');
  const paidAmount = Math.min(requestedPaid, grandTotal);

  if (receivedAmount + 0.005 < paidAmount) {
    throw new HttpError(422, 'Received amount cannot be less than the amount being recorded as paid.');
  }

  return {
    payment_type: method,
    paid_amount: paidAmount,
    received_amount: receivedAmount,
    payment_status: paidAmount >= grandTotal - 0.005 ? 'paid' : paidAmount > 0 ? 'partial' : 'unpaid',
  };
}

function resolveDueDate({ sale_date, due_date, payment_status, payment_terms_days = 30 }) {
  if (payment_status === 'paid') return null;
  if (due_date !== undefined && due_date !== null && due_date !== '') {
    const value = String(due_date);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(new Date(`${value}T00:00:00Z`).getTime())) {
      throw new HttpError(422, 'Due date must be a valid date.');
    }
    return value;
  }
  const terms = Number(payment_terms_days ?? 30);
  return addDaysISO(sale_date, Number.isInteger(terms) && terms >= 0 ? terms : 30);
}

module.exports = { normalizePaymentMethod, computeInitialPayment, resolveDueDate };
