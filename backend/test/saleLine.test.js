const test = require('node:test');
const assert = require('node:assert/strict');
const { computeSaleLine, isManualSaleItem, applyProductFinancialSnapshot } = require('../src/utils/saleLine');

test('percentage discount is calculated per sale item', () => {
  const line = computeSaleLine({
    product_id: 7,
    quantity: 2,
    product_price: 100,
    discount_type: 'percentage',
    discount_value: 10,
    tax_type: 'none',
  });

  assert.equal(line.discount_amount, 20);
  assert.equal(line.sub_total, 180);
  assert.equal(line.net_unit_price, 90);
});

test('fixed discount cannot exceed the line total', () => {
  assert.throws(() => computeSaleLine({
    product_id: 7,
    quantity: 1,
    product_price: 100,
    discount_type: 'fixed',
    discount_value: 101,
  }), /cannot exceed the line total/);
});

test('manual item keeps its bill name and does not require a product id', () => {
  const line = computeSaleLine({
    is_manual: true,
    item_name: 'Emergency cable repair item',
    quantity: 1,
    product_price: 250,
  });

  assert.equal(line.product_id, null);
  assert.equal(line.item_name, 'Emergency cable repair item');
  assert.equal(line.is_manual, true);
  assert.equal(line.sub_total, 250);
});

test('manual item requires a name', () => {
  assert.throws(() => computeSaleLine({
    is_manual: true,
    item_name: ' ',
    quantity: 1,
    product_price: 250,
  }), /Enter a name/);
});

test('empty product id is treated as a manual sale item', () => {
  assert.equal(isManualSaleItem({ product_id: '' }), true);
});


test('temporary sale price keeps the catalogue price and cost as server snapshots', () => {
  const line = computeSaleLine({
    product_id: 7,
    quantity: 2,
    product_price: 95,
    discount_type: 'none',
    tax_type: 'none',
  });

  const snapshot = applyProductFinancialSnapshot({
    ...line,
    standard_price: 1,
    product_cost: 1,
    profit_amount: 9999,
  }, {
    product_price: 100,
    product_cost: 70,
  });

  assert.equal(snapshot.product_price, 95);
  assert.equal(snapshot.standard_price, 100);
  assert.equal(snapshot.product_cost, 70);
  assert.equal(snapshot.profit_amount, 50);
});

test('profit snapshot uses revenue after item discount and excluding tax', () => {
  const line = computeSaleLine({
    product_id: 8,
    quantity: 1,
    product_price: 118,
    discount_type: 'percentage',
    discount_value: 10,
    tax_type: 'inclusive',
    tax_value: 18,
  });

  const snapshot = applyProductFinancialSnapshot(line, {
    product_price: 120,
    product_cost: 80,
  });

  // Rs. 118 less 10% = Rs. 106.20 inclusive. Ex-tax revenue is Rs. 90.
  assert.ok(Math.abs(snapshot.profit_amount - 10) < 0.000001);
});

test('manual bill items do not invent a cost or profit snapshot', () => {
  const line = computeSaleLine({
    is_manual: true,
    item_name: 'One-off item',
    quantity: 1,
    product_price: 150,
  });
  const snapshot = applyProductFinancialSnapshot(line);

  assert.equal(snapshot.standard_price, null);
  assert.equal(snapshot.product_cost, null);
  assert.equal(snapshot.profit_amount, null);
});
