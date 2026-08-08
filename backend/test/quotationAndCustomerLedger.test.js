const test = require('node:test');
const assert = require('node:assert/strict');
const { computeOrderTotals } = require('../src/controllers/quotationHoldController');
const { computeCustomerDue } = require('../src/services/customerLedgerService');

test('quotation order totals apply discount before tax and add shipping after', () => {
  const totals = computeOrderTotals({ discount: 100, shipping: 50, tax_rate: 10 }, 1000);
  // (1000 - 100) * 10% = 90 tax; grand total = 1000 - 100 + 50 + 90
  assert.equal(totals.taxAmount, 90);
  assert.equal(totals.grandTotal, 1040);
});

test('quotation order totals reject a discount larger than the items subtotal', () => {
  assert.throws(() => computeOrderTotals({ discount: 500 }, 100));
});

test('quotation order totals reject a negative shipping value', () => {
  assert.throws(() => computeOrderTotals({ shipping: -10 }, 100));
});

test('quotation order totals default missing fields to zero without crashing', () => {
  const totals = computeOrderTotals({}, 200);
  assert.equal(totals.grandTotal, 200);
});

test('customer due combines unpaid sales with any remaining opening balance', () => {
  const due = computeCustomerDue({ opening_balance: 5000, sales_due: 1200, account_payments: 2000 });
  assert.equal(due.opening_balance_due, 3000); // 5000 - 2000
  assert.equal(due.sales_due, 1200);
  assert.equal(due.total_due, 4200);
});

test('customer due never goes negative when account payments exceed the opening balance', () => {
  const due = computeCustomerDue({ opening_balance: 1000, sales_due: 0, account_payments: 5000 });
  assert.equal(due.opening_balance_due, 0);
  assert.equal(due.total_due, 0);
});

test('customer due tolerates missing/undefined inputs', () => {
  const due = computeCustomerDue({});
  assert.equal(due.total_due, 0);
});
