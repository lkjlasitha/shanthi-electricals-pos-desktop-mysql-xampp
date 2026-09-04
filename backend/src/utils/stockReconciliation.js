const HttpError = require('./httpError');

function normalizeStockLevels(rows) {
  if (rows === undefined) return null;
  if (!Array.isArray(rows)) throw new HttpError(422, 'Stock levels must be a list of warehouse quantities.');
  const seen = new Set();
  return rows.map((row, index) => {
    const warehouseId = Number(row.warehouse_id);
    const quantity = Number(row.quantity);
    if (!Number.isInteger(warehouseId) || warehouseId <= 0) {
      throw new HttpError(422, `Warehouse for stock row ${index + 1} is invalid.`);
    }
    if (!Number.isFinite(quantity) || quantity < 0) {
      throw new HttpError(422, `Stock quantity for row ${index + 1} must be zero or greater.`);
    }
    if (seen.has(warehouseId)) throw new HttpError(422, 'Each warehouse can only appear once in a stock edit.');
    seen.add(warehouseId);
    return { warehouse_id: warehouseId, quantity };
  });
}

function planStockReconciliation(currentRows, requestedRows) {
  const requested = normalizeStockLevels(requestedRows) || [];
  const current = new Map((currentRows || []).map((row) => [
    Number(row.warehouse_id),
    Number(row.quantity || 0),
  ]));
  return requested.map((row) => {
    const oldQuantity = current.get(row.warehouse_id) || 0;
    return {
      ...row,
      old_quantity: oldQuantity,
      delta: row.quantity - oldQuantity,
      type: row.quantity >= oldQuantity ? 'addition' : 'subtraction',
    };
  }).filter((row) => Math.abs(row.delta) > 0.000001);
}

module.exports = { normalizeStockLevels, planStockReconciliation };
