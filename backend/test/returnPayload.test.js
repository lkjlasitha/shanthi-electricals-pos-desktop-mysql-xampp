const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeRequestedItems, prepareReturnItems } = require('../src/utils/returnPayload');

test('return item quantities are grouped per product', () => {
  const result = normalizeRequestedItems([
    { product_id: 4, quantity: 1 },
    { product_id: '4', quantity: '2.5' },
  ]);
  assert.equal(result.get(4), 3.5);
});

test('return item quantity must be positive', () => {
  assert.throws(() => normalizeRequestedItems([{ product_id: 4, quantity: 0 }]), /greater than zero/);
});

test('return is priced from the original document value', () => {
  const requested = normalizeRequestedItems([{ product_id: 4, quantity: 2 }]);
  const rows = prepareReturnItems(requested, [{
    product_id: 4,
    product_name: 'LED bulb',
    returnable_quantity: 3,
    unit_price: 150,
  }], 'unit_price');
  assert.equal(rows[0].sub_total, 300);
});

test('return cannot contain a product outside the original document', () => {
  const requested = normalizeRequestedItems([{ product_id: 7, quantity: 1 }]);
  assert.throws(() => prepareReturnItems(requested, [], 'unit_price'), /not part of the original document/);
});

test('return cannot exceed the remaining returnable quantity', () => {
  const requested = normalizeRequestedItems([{ product_id: 4, quantity: 2.1 }]);
  assert.throws(() => prepareReturnItems(requested, [{
    product_id: 4,
    product_name: 'LED bulb',
    returnable_quantity: 2,
    unit_price: 150,
  }], 'unit_price'), /only 2 can still be returned/);
});
