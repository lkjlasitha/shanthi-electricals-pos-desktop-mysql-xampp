const test = require('node:test');
const assert = require('node:assert/strict');
const {
  invoiceSnapshot, allocateOldestFirst, buildAccountSummary,
} = require('../src/utils/customerAccount');

test('invoice balance uses actual payments and returns', () => {
  const invoice = invoiceSnapshot({
    id: 10, grand_total: 1000,
    payments: [{ amount: 250 }, { amount: 100 }],
    returns: [{ grand_total: 50 }],
  });
  assert.equal(invoice.paid_amount, 350);
  assert.equal(invoice.return_amount, 50);
  assert.equal(invoice.balance, 600);
  assert.equal(invoice.payment_status, 'partial');
});

test('receipts allocate oldest invoices first and retain excess credit', () => {
  const result = allocateOldestFirst(800, [
    { id: 1, balance: 300 }, { id: 2, balance: 400 },
  ]);
  assert.deepEqual(result.allocations, [
    { sale_id: 1, amount: 300 }, { sale_id: 2, amount: 400 },
  ]);
  assert.equal(result.unallocated_amount, 100);
});

test('account summary separates receivable, overdue and available credit', () => {
  const summary = buildAccountSummary({
    customer: { opening_balance: 100, allow_credit: true, credit_limit: 2000 },
    invoices: [
      { balance: 500, due_date: '2026-07-01' },
      { balance: 200, due_date: '2026-09-01' },
    ],
    unallocatedCredit: 50,
    today: '2026-08-05',
  });
  assert.equal(summary.outstanding, 750);
  assert.equal(summary.amount_due, 750);
  assert.equal(summary.overdue, 500);
  assert.equal(summary.available_credit, 1250);
});

test('excess customer payment becomes a credit balance', () => {
  const summary = buildAccountSummary({
    customer: { opening_balance: 0, allow_credit: true, credit_limit: 1000 },
    invoices: [], unallocatedCredit: 125, today: '2026-08-05',
  });
  assert.equal(summary.outstanding, -125);
  assert.equal(summary.amount_due, 0);
  assert.equal(summary.credit_balance, 125);
});
