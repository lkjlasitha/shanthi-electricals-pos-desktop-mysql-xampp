const test = require('node:test');
const assert = require('node:assert/strict');
const { planStockReconciliation } = require('../src/utils/stockReconciliation');

test('stock reconciliation plans additions and subtractions per warehouse', () => {
  const changes = planStockReconciliation(
    [{ warehouse_id: 1, quantity: 10 }, { warehouse_id: 2, quantity: 4 }],
    [{ warehouse_id: 1, quantity: 7 }, { warehouse_id: 2, quantity: 9 }]
  );
  assert.deepEqual(changes.map((row) => ({ id: row.warehouse_id, delta: row.delta, type: row.type })), [
    { id: 1, delta: -3, type: 'subtraction' },
    { id: 2, delta: 5, type: 'addition' },
  ]);
});

test('stock reconciliation ignores unchanged rows and rejects duplicates', () => {
  assert.deepEqual(planStockReconciliation([{ warehouse_id: 1, quantity: 2 }], [{ warehouse_id: 1, quantity: 2 }]), []);
  assert.throws(
    () => planStockReconciliation([], [{ warehouse_id: 1, quantity: 2 }, { warehouse_id: 1, quantity: 3 }]),
    /only appear once/
  );
});
