const test = require('node:test');
const assert = require('node:assert/strict');
const {
  computeInitialPurchasePayment,
  computePurchaseBalance,
  planPurchaseReceipt,
  resolvePurchaseDueDate,
  summarizePayables,
} = require('../src/utils/purchasePipeline');

test('supplier bill supports an initial partial payment', () => {
  assert.deepEqual(computeInitialPurchasePayment({
    grand_total: 1000,
    paid_amount: 250,
    payment_type: 'cash',
  }), { payment_type: 'cash', paid_amount: 250, payment_status: 'partial' });
});

test('credit supplier bill defaults to unpaid and receives a due date', () => {
  const payment = computeInitialPurchasePayment({ grand_total: 5000, payment_type: 'credit' });
  assert.equal(payment.payment_status, 'unpaid');
  assert.equal(resolvePurchaseDueDate({
    purchase_date: '2026-08-17',
    payment_status: payment.payment_status,
    payment_terms_days: 30,
  }), '2026-09-16');
});

test('purchase receipt can be partial and never exceeds ordered quantity', () => {
  const items = [{ id: 9, product_id: 3, quantity: 10, received_quantity: 2 }];
  const plan = planPurchaseReceipt(items, [{ purchase_item_id: 9, quantity: 4 }]);
  assert.equal(plan.status, 'partially_received');
  assert.equal(plan.increments[0].new_received_quantity, 6);
  assert.throws(
    () => planPurchaseReceipt(items, [{ purchase_item_id: 9, quantity: 9 }]),
    /exceeds the remaining/
  );
});

test('final purchase receipt marks the bill received', () => {
  const plan = planPurchaseReceipt(
    [{ id: 1, product_id: 7, quantity: 5, received_quantity: 2 }],
    [{ purchase_item_id: 1, quantity: 3 }]
  );
  assert.equal(plan.status, 'received');
});

test('payables summary separates outstanding and overdue bills', () => {
  const summary = summarizePayables([
    { grand_total: 1000, returned_amount: 100, paid_amount: 250, due_date: '2026-08-01', status: 'received' },
    { grand_total: 800, paid_amount: 800, due_date: null, status: 'received' },
    { grand_total: 200, paid_amount: 0, due_date: '2026-09-01', status: 'ordered' },
    { grand_total: 999, paid_amount: 0, due_date: '2026-01-01', status: 'cancelled' },
  ], '2026-08-17');
  assert.equal(summary.billed_total, 2000);
  assert.equal(summary.returned_total, 100);
  assert.equal(summary.net_billed_total, 1900);
  assert.equal(summary.outstanding_total, 850);
  assert.equal(summary.overdue_total, 650);
  assert.equal(summary.unpaid_bill_count, 2);
});

test('supplier return credit reduces payable and exposes overpayment', () => {
  assert.deepEqual(computePurchaseBalance({ grand_total: 1000, returned_amount: 300, paid_amount: 800 }), {
    grand_total: 1000,
    returned_amount: 300,
    net_total: 700,
    paid_amount: 800,
    outstanding: 0,
    supplier_credit: 100,
    payment_status: 'paid',
  });
});
