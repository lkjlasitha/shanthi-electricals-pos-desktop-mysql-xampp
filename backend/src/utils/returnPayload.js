const HttpError = require('./httpError');

function positiveInteger(value, label) {
  const number = Number(value);
  if (!Number.isInteger(number) || number <= 0) throw new HttpError(422, `${label} is required.`);
  return number;
}

function positiveQuantity(value, label) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) throw new HttpError(422, `${label} must be greater than zero.`);
  return number;
}

function normalizeRequestedItems(rawItems) {
  if (!Array.isArray(rawItems) || !rawItems.length) throw new HttpError(422, 'Select at least one item to return.');
  const quantities = new Map();
  rawItems.forEach((item, index) => {
    const productId = positiveInteger(item?.product_id, `Product at row ${index + 1}`);
    const quantity = positiveQuantity(item?.quantity, `Return quantity at row ${index + 1}`);
    quantities.set(productId, (quantities.get(productId) || 0) + quantity);
  });
  return quantities;
}

function prepareReturnItems(requested, returnableItems, valueField) {
  const availableByProduct = new Map(returnableItems.map((item) => [Number(item.product_id), item]));
  const prepared = [];

  for (const [productId, quantity] of requested) {
    const available = availableByProduct.get(productId);
    if (!available) throw new HttpError(422, `Product ${productId} is not part of the original document.`);

    const remaining = Number(available.returnable_quantity || 0);
    if (quantity > remaining + 1e-9) {
      throw new HttpError(422, `${available.product_name}: only ${remaining} can still be returned.`);
    }

    const unitValue = Number(available[valueField] || 0);
    prepared.push({ ...available, quantity, sub_total: quantity * unitValue });
  }

  return prepared;
}

module.exports = {
  positiveInteger,
  positiveQuantity,
  normalizeRequestedItems,
  prepareReturnItems,
};
