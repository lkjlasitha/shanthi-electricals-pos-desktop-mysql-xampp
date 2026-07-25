const test = require('node:test');
const assert = require('node:assert/strict');
const {
  normalizeVariantRows, buildCombinations, variantKey,
} = require('../src/utils/variantPayload');

test('buildCombinations creates electrical product attribute combinations', () => {
  const rows = buildCombinations([
    { name: 'Length', values: ['50m', '100m'] },
    { name: 'Colour', values: ['Red', 'Brown'] },
  ]);
  assert.equal(rows.length, 4);
  assert.deepEqual(rows[0], {
    label: '50m / Red',
    attributes: { Length: '50m', Colour: 'Red' },
  });
});

test('normalizeVariantRows accepts different costs, prices, barcodes and stock', () => {
  const rows = normalizeVariantRows([
    {
      label: '12W',
      attributes: { Wattage: '12W' },
      code: '',
      product_cost: 100,
      product_price: 150,
      initial_stock: [{ warehouse_id: 1, quantity: 12 }],
    },
    {
      label: '50W',
      attributes: { Wattage: '50W' },
      code: 'DIMO-50W',
      product_cost: 400,
      product_price: 550,
      initial_stock: [],
    },
  ]);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].code, null);
  assert.equal(rows[1].code, 'DIMO-50W');
  assert.equal(rows[0].initial_stock[0].quantity, 12);
});

test('duplicate variant combinations are rejected', () => {
  assert.throws(() => normalizeVariantRows([
    { label: 'Red 50m', attributes: { Colour: 'Red', Length: '50m' }, product_cost: 1, product_price: 2 },
    { label: '50m Red', attributes: { Length: '50m', Colour: 'Red' }, product_cost: 1, product_price: 2 },
  ]), /appears more than once/);
});

test('variantKey is independent of attribute order', () => {
  assert.equal(
    variantKey({ Colour: 'Red', Length: '50m' }),
    variantKey({ Length: '50m', Colour: 'Red' })
  );
});
