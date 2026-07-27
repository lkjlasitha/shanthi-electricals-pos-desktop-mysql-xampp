const test = require('node:test');
const assert = require('node:assert/strict');
const { computeSaleLine, isManualSaleItem } = require('../src/utils/saleLine');

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
