const test = require('node:test');
const assert = require('node:assert/strict');
const { computeInitialPayment, resolveDueDate } = require('../src/utils/payment');

test('cash tender above total records change without overstating paid amount', () => {
  const payment = computeInitialPayment({ grand_total: 950, paid_amount: 1000, received_amount: 1000, payment_type: 'cash' });
  assert.equal(payment.paid_amount, 950);
  assert.equal(payment.received_amount, 1000);
  assert.equal(payment.payment_status, 'paid');
});

test('credit sale defaults to unpaid instead of silently fully paid', () => {
  const payment = computeInitialPayment({ grand_total: 950, payment_type: 'credit' });
  assert.equal(payment.paid_amount, 0);
  assert.equal(payment.payment_status, 'unpaid');
});

test('partial sale receives a due date from customer terms', () => {
  assert.equal(resolveDueDate({ sale_date: '2026-08-17', payment_status: 'partial', payment_terms_days: 14 }), '2026-08-31');
  assert.equal(resolveDueDate({ sale_date: '2026-08-17', payment_status: 'paid', payment_terms_days: 14 }), null);
});
