const HttpError = require('./httpError');

const EMPTY_VALUES = new Set(['', null, undefined]);

function isEmpty(value) {
  return EMPTY_VALUES.has(value) || (typeof value === 'string' && value.trim() === '');
}

function nullablePositiveInteger(value, fieldName) {
  if (isEmpty(value)) return null;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new HttpError(422, `${fieldName} must be a valid record ID.`);
  }
  return parsed;
}

function requiredPositiveInteger(value, fieldName) {
  const parsed = nullablePositiveInteger(value, fieldName);
  if (parsed === null) {
    throw new HttpError(422, `${fieldName} is required.`);
  }
  return parsed;
}

function finiteNumber(value, fieldName, { required = false, min = undefined, max = undefined, fallback = undefined } = {}) {
  if (isEmpty(value)) {
    if (required) throw new HttpError(422, `${fieldName} is required.`);
    return fallback;
  }

  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw new HttpError(422, `${fieldName} must be a valid number.`);
  }
  if (min !== undefined && parsed < min) {
    throw new HttpError(422, `${fieldName} must be at least ${min}.`);
  }
  if (max !== undefined && parsed > max) {
    throw new HttpError(422, `${fieldName} must not be greater than ${max}.`);
  }
  return parsed;
}

function cleanString(value, fieldName, { required = false, maxLength = undefined, fallback = undefined } = {}) {
  if (isEmpty(value)) {
    if (required) throw new HttpError(422, `${fieldName} is required.`);
    return fallback;
  }
  const cleaned = String(value).trim();
  if (maxLength && cleaned.length > maxLength) {
    throw new HttpError(422, `${fieldName} must not exceed ${maxLength} characters.`);
  }
  return cleaned;
}

function normalizeProductPayload(input = {}, { partial = false } = {}) {
  const output = {};
  const has = (key) => Object.prototype.hasOwnProperty.call(input, key);

  const assignString = (key, label, options) => {
    if (!partial || has(key)) output[key] = cleanString(input[key], label, options);
  };
  const assignNumber = (key, label, options) => {
    if (!partial || has(key)) output[key] = finiteNumber(input[key], label, options);
  };

  assignString('name', 'Product name', { required: !partial, maxLength: 255 });
  assignString('code', 'Product code/barcode', { required: !partial, maxLength: 255 });

  if (!partial || has('barcode_symbol')) {
    output.barcode_symbol = cleanString(input.barcode_symbol, 'Barcode symbol', { fallback: 'CODE128', maxLength: 50 });
  }

  if (!partial || has('product_category_id')) {
    output.product_category_id = requiredPositiveInteger(input.product_category_id, 'Product category');
  }
  if (!partial || has('brand_id')) {
    output.brand_id = nullablePositiveInteger(input.brand_id, 'Brand');
  }
  if (!partial || has('main_product_id')) {
    output.main_product_id = nullablePositiveInteger(input.main_product_id, 'Main product');
  }

  assignNumber('product_cost', 'Cost price', { required: !partial, min: 0, fallback: 0 });
  assignNumber('product_price', 'Selling price', { required: !partial, min: 0, fallback: 0 });
  assignNumber('stock_alert', 'Low-stock alert', { min: 0, fallback: 5 });
  assignNumber('quantity_limit', 'Quantity limit', { min: 0, fallback: null });
  assignNumber('order_tax', 'Tax percentage', { min: 0, max: 100, fallback: 0 });

  const productUnitProvided = !partial || has('product_unit');
  const saleUnitProvided = !partial || has('sale_unit');
  const purchaseUnitProvided = !partial || has('purchase_unit');

  if (productUnitProvided) {
    output.product_unit = nullablePositiveInteger(input.product_unit, 'Stock unit');
  }

  if (saleUnitProvided) {
    output.sale_unit = nullablePositiveInteger(input.sale_unit, 'Sale unit');
  }

  if (purchaseUnitProvided) {
    output.purchase_unit = nullablePositiveInteger(input.purchase_unit, 'Purchase unit');
  }

  // The UI may only select a stock unit. In that case, use it for both sale
  // and purchase units instead of passing an empty string into FK columns.
  const baseUnit = Object.prototype.hasOwnProperty.call(output, 'product_unit')
    ? output.product_unit
    : nullablePositiveInteger(input.product_unit, 'Stock unit');

  if (saleUnitProvided && output.sale_unit === null && baseUnit !== null) {
    output.sale_unit = baseUnit;
  }
  if (purchaseUnitProvided && output.purchase_unit === null && baseUnit !== null) {
    output.purchase_unit = baseUnit;
  }

  if (!partial && baseUnit === null) {
    output.sale_unit = null;
    output.purchase_unit = null;
  }

  if (!partial || has('tax_type')) {
    const taxType = cleanString(input.tax_type, 'Tax type', { fallback: 'exclusive' });
    if (!['exclusive', 'inclusive'].includes(taxType)) {
      throw new HttpError(422, 'Tax type must be either exclusive or inclusive.');
    }
    output.tax_type = taxType;
  }

  if (!partial || has('notes')) {
    output.notes = cleanString(input.notes, 'Notes', { fallback: null });
  }

  if (has('is_active')) output.is_active = Boolean(input.is_active);

  return output;
}

function normalizeInitialStock(entries) {
  if (entries === undefined || entries === null) return [];
  if (!Array.isArray(entries)) {
    throw new HttpError(422, 'Initial stock must be an array of warehouse quantities.');
  }

  const seen = new Set();
  return entries.map((entry, index) => {
    const warehouseId = requiredPositiveInteger(entry?.warehouse_id, `Initial stock warehouse at row ${index + 1}`);
    if (seen.has(warehouseId)) {
      throw new HttpError(422, `Warehouse ${warehouseId} appears more than once in initial stock.`);
    }
    seen.add(warehouseId);

    return {
      warehouse_id: warehouseId,
      quantity: finiteNumber(entry?.quantity, `Initial stock quantity at row ${index + 1}`, { min: 0, fallback: 0 }),
    };
  });
}

module.exports = {
  normalizeProductPayload,
  normalizeInitialStock,
  nullablePositiveInteger,
  requiredPositiveInteger,
  finiteNumber,
};
