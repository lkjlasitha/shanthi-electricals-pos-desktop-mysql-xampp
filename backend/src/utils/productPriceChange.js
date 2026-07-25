const HttpError = require('./httpError');

function priceNumber(value, currentValue, label) {
  if (value === undefined || value === null || value === '') return Number(currentValue || 0);
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new HttpError(422, `${label} must be a valid number greater than or equal to zero.`);
  }
  return parsed;
}

function resolvePriceChange({ oldCost, oldPrice, newCost, newPrice }) {
  const currentCost = Number(oldCost || 0);
  const currentPrice = Number(oldPrice || 0);
  const resolvedCost = priceNumber(newCost, currentCost, 'Cost price');
  const resolvedPrice = priceNumber(newPrice, currentPrice, 'Selling price');

  return {
    oldCost: currentCost,
    oldPrice: currentPrice,
    newCost: resolvedCost,
    newPrice: resolvedPrice,
    costChanged: resolvedCost !== currentCost,
    priceChanged: resolvedPrice !== currentPrice,
    changed: resolvedCost !== currentCost || resolvedPrice !== currentPrice,
  };
}

module.exports = { resolvePriceChange };
