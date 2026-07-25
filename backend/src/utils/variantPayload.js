const HttpError = require('./httpError');
const { finiteNumber, normalizeInitialStock } = require('./productPayload');
const { normalizeBarcodeInput } = require('./barcode');

function cleanText(value, label, { required = false, max = 255 } = {}) {
  const text = String(value ?? '').trim();
  if (required && !text) throw new HttpError(422, `${label} is required.`);
  if (text.length > max) throw new HttpError(422, `${label} must not exceed ${max} characters.`);
  return text;
}

function normalizeAttributes(value, rowNumber = 1) {
  if (value === undefined || value === null || value === '') return {};
  if (typeof value !== 'object' || Array.isArray(value)) {
    throw new HttpError(422, `Variant attributes at row ${rowNumber} must be an object.`);
  }

  const output = {};
  for (const [rawName, rawValue] of Object.entries(value)) {
    const name = cleanText(rawName, `Attribute name at row ${rowNumber}`, { required: true, max: 80 });
    const option = cleanText(rawValue, `${name} option at row ${rowNumber}`, { required: true, max: 120 });
    output[name] = option;
  }

  if (Object.keys(output).length > 5) {
    throw new HttpError(422, `Variant row ${rowNumber} has more than 5 attributes.`);
  }
  return output;
}

function variantKey(attributes, label = '') {
  const entries = Object.entries(attributes || {})
    .map(([name, value]) => [String(name).trim().toLowerCase(), String(value).trim().toLowerCase()])
    .sort(([a], [b]) => a.localeCompare(b));
  return entries.length ? JSON.stringify(entries) : String(label || '').trim().toLowerCase();
}

function normalizeVariantRows(rows, { maxRows = 100 } = {}) {
  if (!Array.isArray(rows) || rows.length === 0) {
    throw new HttpError(422, 'Add at least one product variant.');
  }
  if (rows.length > maxRows) {
    throw new HttpError(422, `A product family can contain at most ${maxRows} variants in one request.`);
  }

  const seenLabels = new Set();
  const seenKeys = new Set();
  const seenCodes = new Set();

  return rows.map((row, index) => {
    const rowNumber = index + 1;
    const attributes = normalizeAttributes(row?.attributes, rowNumber);
    const inferredLabel = Object.values(attributes).join(' / ');
    const label = cleanText(row?.label || row?.variant_name || inferredLabel, `Variant name at row ${rowNumber}`, {
      required: true,
      max: 180,
    });

    const labelKey = label.toLowerCase();
    if (seenLabels.has(labelKey)) throw new HttpError(422, `Variant name "${label}" appears more than once.`);
    seenLabels.add(labelKey);

    const key = variantKey(attributes, label);
    if (seenKeys.has(key)) throw new HttpError(422, `Variant combination "${label}" appears more than once.`);
    seenKeys.add(key);

    const code = normalizeBarcodeInput(row?.code);
    if (code) {
      const codeKey = code.toLowerCase();
      if (seenCodes.has(codeKey)) throw new HttpError(422, `Barcode/SKU "${code}" appears more than once.`);
      seenCodes.add(codeKey);
    }

    return {
      label,
      attributes,
      code: code || null,
      barcode_symbol: cleanText(row?.barcode_symbol || '', 'Barcode type', { max: 50 }) || null,
      product_cost: finiteNumber(row?.product_cost, `Cost price at row ${rowNumber}`, { required: true, min: 0 }),
      product_price: finiteNumber(row?.product_price, `Selling price at row ${rowNumber}`, { required: true, min: 0 }),
      stock_alert: finiteNumber(row?.stock_alert, `Low-stock alert at row ${rowNumber}`, { min: 0, fallback: 5 }),
      quantity_limit: finiteNumber(row?.quantity_limit, `Quantity limit at row ${rowNumber}`, { min: 0, fallback: null }),
      initial_stock: normalizeInitialStock(row?.initial_stock),
      sort_order: Number.isInteger(Number(row?.sort_order)) ? Number(row.sort_order) : index,
    };
  });
}

function buildCombinations(axes, { maxRows = 100 } = {}) {
  if (!Array.isArray(axes)) return [];
  const normalized = axes
    .map((axis, index) => ({
      name: cleanText(axis?.name, `Attribute ${index + 1} name`, { required: true, max: 80 }),
      values: Array.isArray(axis?.values)
        ? [...new Set(axis.values.map((value) => cleanText(value, 'Attribute option', { required: true, max: 120 })))]
        : [],
    }))
    .filter((axis) => axis.values.length);

  if (!normalized.length) return [];
  let combinations = [{ attributes: {}, label: '' }];
  for (const axis of normalized) {
    combinations = combinations.flatMap((combination) => axis.values.map((value) => ({
      attributes: { ...combination.attributes, [axis.name]: value },
      label: [...(combination.label ? [combination.label] : []), value].join(' / '),
    })));
    if (combinations.length > maxRows) {
      throw new HttpError(422, `The selected attributes create more than ${maxRows} variants. Remove some options.`);
    }
  }
  return combinations;
}

module.exports = {
  normalizeAttributes,
  normalizeVariantRows,
  variantKey,
  buildCombinations,
};
