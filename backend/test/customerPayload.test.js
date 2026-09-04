const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeCustomerPayload } = require('../src/utils/customerPayload');

test('customer payload keeps credit terms and normalized balances', () => {
  const value = normalizeCustomerPayload({
    name: '  Nimal Stores ', phone: ' 0771234567 ', customer_type: 'credit',
    opening_balance: '500', credit_limit: '10000', payment_terms_days: '30',
  });
  assert.equal(value.name, 'Nimal Stores');
  assert.equal(value.opening_balance, 500);
  assert.equal(value.credit_limit, 10000);
  assert.equal(value.payment_terms_days, 30);
});

test('customer payload rejects negative money and invalid payment terms', () => {
  assert.throws(() => normalizeCustomerPayload({ name: 'A', phone: '1', opening_balance: -1 }));
  assert.throws(() => normalizeCustomerPayload({ name: 'A', phone: '1', payment_terms_days: 12.5 }));
});

test('partial customer payload does not blank omitted required fields', () => {
  assert.deepEqual(normalizeCustomerPayload({ notes: 'Regular account' }, { partial: true }), { notes: 'Regular account' });
});
