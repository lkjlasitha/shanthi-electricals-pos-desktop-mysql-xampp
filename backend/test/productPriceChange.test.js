const test = require('node:test');
const assert = require('node:assert/strict');
const { resolvePriceChange } = require('../src/utils/productPriceChange');

test('cost and selling price can increase together', () => {
  const result = resolvePriceChange({ oldCost: 100, oldPrice: 120, newCost: 150, newPrice: 190 });
  assert.equal(result.costChanged, true);
  assert.equal(result.priceChanged, true);
  assert.equal(result.newCost, 150);
  assert.equal(result.newPrice, 190);
});

test('only cost can change while selling price remains unchanged', () => {
  const result = resolvePriceChange({ oldCost: 100, oldPrice: 120, newCost: 90 });
  assert.equal(result.costChanged, true);
  assert.equal(result.priceChanged, false);
  assert.equal(result.newPrice, 120);
});

test('only selling price can change while cost remains unchanged', () => {
  const result = resolvePriceChange({ oldCost: 100, oldPrice: 120, newPrice: 135 });
  assert.equal(result.costChanged, false);
  assert.equal(result.priceChanged, true);
  assert.equal(result.newCost, 100);
});

test('negative prices are rejected', () => {
  assert.throws(() => resolvePriceChange({ oldCost: 100, oldPrice: 120, newCost: -1 }), /Cost price must be/);
});
