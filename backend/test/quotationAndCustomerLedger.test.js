const test = require('node:test');
const assert = require('node:assert/strict');
const { computeOrderTotals } = require('../src/controllers/quotationHoldController');
const { computeCustomerDue, planCustomerPayment } = require('../src/services/customerLedgerService');

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

test('customer-level payment clears opening debt then oldest invoices', () => {
  const plan = planCustomerPayment({
    amount: 1000,
    opening_balance_due: 250,
    sales: [
      { id: 11, due_amount: 500 },
      { id: 12, due_amount: 700 },
    ],
  });
  assert.equal(plan.opening_balance_amount, 250);
  assert.deepEqual(plan.allocations, [
    { sale_id: 11, amount: 500 },
    { sale_id: 12, amount: 250 },
  ]);
});

test('customer-level payment cannot exceed the full customer balance', () => {
  assert.throws(() => planCustomerPayment({ amount: 501, opening_balance_due: 100, sales: [{ id: 1, due_amount: 400 }] }));
});

test('new invoice allocations are not subtracted twice from opening balance', () => {
  const due = computeCustomerDue({ opening_balance: 1000, opening_payments: 200, account_payments: 700, sales_due: 300 });
  assert.equal(due.opening_balance_due, 800);
  assert.equal(due.total_due, 1100);
});
