const test = require('node:test');
const assert = require('node:assert/strict');
const {
  computeQuotationLine, applyQuotationProductSnapshot, computeQuotationTotals,
} = require('../src/utils/quotationLine');

test('quotation line stores actual price, discount, cost and profit snapshots', () => {
  const line = computeQuotationLine({
    product_id: 7, quantity: 2, product_price: 100,
    discount_type: 'percentage', discount_value: 10, tax_type: 'none',
  });
  const snapshot = applyQuotationProductSnapshot(line, { product_price: 120, product_cost: 60 });
  assert.equal(snapshot.product_price, 100);
  assert.equal(snapshot.standard_price, 120);
  assert.equal(snapshot.product_cost, 60);
  assert.equal(snapshot.discount_amount, 20);
  assert.equal(snapshot.sub_total, 180);
  assert.equal(snapshot.profit_amount, 60);
});

test('quotation totals apply document discount and tax once', () => {
  const totals = computeQuotationTotals([{ sub_total: 180, profit_amount: 60 }], {
    discount: 20, shipping: 5, tax_rate: 10,
  });
  assert.equal(totals.sub_total, 180);
  assert.equal(totals.tax_amount, 16);
  assert.equal(totals.grand_total, 181);
  assert.equal(totals.profit_amount, 40);
});

test('quotation rejects discounts larger than the items subtotal', () => {
  assert.throws(
    () => computeQuotationTotals([{ sub_total: 50, profit_amount: 10 }], { discount: 51 }),
    /cannot exceed/i
  );
});
