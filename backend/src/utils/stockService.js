const { ManageStock } = require('../models/associations');

/**
 * Adjusts stock for a product in a warehouse by `delta` (positive to add,
 * negative to deduct) inside the given transaction. Throws if a deduction
 * would push stock below zero, unless allowNegative is true.
 */
async function adjustStock({ productId, warehouseId, delta, transaction, allowNegative = false }) {
  const [stock] = await ManageStock.findOrCreate({
    where: { product_id: productId, warehouse_id: warehouseId },
    defaults: { quantity: 0 },
    transaction,
    lock: transaction ? transaction.LOCK.UPDATE : undefined,
  });

  const newQuantity = Number(stock.quantity) + Number(delta);
  if (!allowNegative && newQuantity < 0) {
    const err = new Error(`Insufficient stock for product ${productId} in warehouse ${warehouseId}`);
    err.status = 422;
    throw err;
  }
  stock.quantity = newQuantity;
  await stock.save({ session: transaction.session });
  return stock;
}

module.exports = { adjustStock };
