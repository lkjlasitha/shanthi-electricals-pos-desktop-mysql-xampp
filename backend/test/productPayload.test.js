const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeProductPayload, normalizeInitialStock } = require('../src/utils/productPayload');

test('empty optional unit values become null', () => {
  const result = normalizeProductPayload({
    name: 'Bulb', code: 'BULB-01', product_category_id: '4', brand_id: '',
    product_cost: '100', product_price: '120', product_unit: '', sale_unit: '', purchase_unit: '',
    stock_alert: '5', order_tax: '3.5', tax_type: 'exclusive', notes: '',
  });

  assert.equal(result.product_category_id, 4);
  assert.equal(result.brand_id, null);
  assert.equal(result.product_unit, null);
  assert.equal(result.sale_unit, null);
  assert.equal(result.purchase_unit, null);
  assert.equal(result.order_tax, 3.5);
});

test('sale and purchase units default to stock unit', () => {
  const result = normalizeProductPayload({
    name: 'Bulb', code: 'BULB-01', product_category_id: 4, brand_id: 1,
    product_cost: 100, product_price: 120, product_unit: '7', sale_unit: '', purchase_unit: '',
    stock_alert: 5, order_tax: 0, tax_type: 'exclusive', notes: '',
  });

  assert.equal(result.product_unit, 7);
  assert.equal(result.sale_unit, 7);
  assert.equal(result.purchase_unit, 7);
});

test('negative tax is rejected', () => {
  assert.throws(() => normalizeProductPayload({
    name: 'Bulb', code: 'BULB-01', product_category_id: 4,
    product_cost: 100, product_price: 120, product_unit: null,
    stock_alert: 5, order_tax: -0.5, tax_type: 'exclusive',
  }), /Tax percentage must be at least 0/);
});

test('initial stock validates warehouses and quantities', () => {
  assert.deepEqual(normalizeInitialStock([{ warehouse_id: '1', quantity: '100' }]), [
    { warehouse_id: 1, quantity: 100 },
  ]);
  assert.throws(() => normalizeInitialStock([{ warehouse_id: 1, quantity: -1 }]), /must be at least 0/);
});
