const { ProductPriceHistory } = require('../models/associations');
const { resolvePriceChange } = require('../utils/productPriceChange');
const HttpError = require('../utils/httpError');

async function applyProductPriceChange({
  product,
  newCost,
  newPrice,
  reason,
  source = 'manual',
  changedBy = null,
  purchaseId = null,
  transaction,
}) {
  if (!product) throw new HttpError(404, 'Product not found');

  const change = resolvePriceChange({
    oldCost: product.product_cost,
    oldPrice: product.product_price,
    newCost,
    newPrice,
  });

  if (!change.changed) return { changed: false, product, history: null, ...change };

  await product.update({
    product_cost: change.newCost,
    product_price: change.newPrice,
  }, { transaction });

  const history = await ProductPriceHistory.create({
    product_id: product.id,
    old_cost: change.oldCost,
    new_cost: change.newCost,
    old_price: change.oldPrice,
    new_price: change.newPrice,
    source,
    reason: String(reason || '').trim() || null,
    purchase_id: purchaseId || null,
    changed_by: changedBy || null,
  }, { transaction });

  return { changed: true, product, history, ...change };
}

module.exports = { applyProductPriceChange };
