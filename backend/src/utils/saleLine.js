const HttpError = require('./httpError');

const DISCOUNT_TYPES = new Set(['none', 'percentage', 'fixed']);
const TAX_TYPES = new Set(['none', 'exclusive', 'inclusive']);

function nonNegativeNumber(value, label) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) {
    throw new HttpError(422, `${label} must be a valid number greater than or equal to zero.`);
  }
  return number;
}

function positiveNumber(value, label) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) {
    throw new HttpError(422, `${label} must be greater than zero.`);
  }
  return number;
}

function isManualSaleItem(item = {}) {
  return Boolean(item.is_manual) || item.product_id === null || item.product_id === undefined || item.product_id === '';
}

function cleanOptionalText(value, maxLength, label) {
  const text = String(value || '').trim();
  if (text.length > maxLength) throw new HttpError(422, `${label} must not exceed ${maxLength} characters.`);
  return text || null;
}

function computeSaleLine(item = {}, index = 0) {
  const itemNumber = index + 1;
  const manual = isManualSaleItem(item);
  const quantity = positiveNumber(item.quantity, `Quantity for item ${itemNumber}`);
  const price = nonNegativeNumber(item.product_price, `Selling price for item ${itemNumber}`);
  const lineTotal = quantity * price;

  let productId = null;
  if (!manual) {
    productId = Number(item.product_id);
    if (!Number.isInteger(productId) || productId <= 0) {
      throw new HttpError(422, `Item ${itemNumber} has an invalid product.`);
    }
  }

  const itemName = cleanOptionalText(item.item_name, 191, `Item name for item ${itemNumber}`);
  const itemCode = cleanOptionalText(item.item_code, 100, `Item code for item ${itemNumber}`);
  if (manual && !itemName) {
    throw new HttpError(422, `Enter a name for manual item ${itemNumber}.`);
  }

  const discountType = DISCOUNT_TYPES.has(item.discount_type) ? item.discount_type : 'none';
  const discountValue = discountType === 'none'
    ? 0
    : nonNegativeNumber(item.discount_value || 0, `Discount for item ${itemNumber}`);

  if (discountType === 'percentage' && discountValue > 100) {
    throw new HttpError(422, `Percentage discount for item ${itemNumber} cannot exceed 100%.`);
  }

  const discountAmount = discountType === 'percentage'
    ? (lineTotal * discountValue) / 100
    : discountType === 'fixed' ? discountValue : 0;

  if (discountAmount > lineTotal) {
    throw new HttpError(422, `Discount for item ${itemNumber} cannot exceed the line total.`);
  }

  const taxType = TAX_TYPES.has(item.tax_type) ? item.tax_type : 'none';
  const taxValue = taxType === 'none'
    ? 0
    : nonNegativeNumber(item.tax_value || 0, `Tax percentage for item ${itemNumber}`);
  const taxedBase = lineTotal - discountAmount;

  let taxAmount = 0;
  if (taxType === 'exclusive') taxAmount = (taxedBase * taxValue) / 100;
  else if (taxType === 'inclusive' && taxValue > 0) {
    taxAmount = taxedBase - taxedBase / (1 + taxValue / 100);
  }

  const netUnitPrice = price - discountAmount / quantity + (taxType === 'exclusive' ? taxAmount / quantity : 0);
  const subTotal = taxedBase + (taxType === 'exclusive' ? taxAmount : 0);

  return {
    product_id: productId,
    item_name: itemName,
    item_code: itemCode,
    is_manual: manual,
    product_price: price,
    net_unit_price: netUnitPrice,
    tax_type: taxType,
    tax_value: taxValue,
    tax_amount: taxAmount,
    discount_type: discountType,
    discount_value: discountValue,
    discount_amount: discountAmount,
    sale_unit_id: item.sale_unit_id || null,
    // Quantity as typed by the cashier in the chosen display unit (e.g. "5"
    // for 5 feet of wire). Purely a display snapshot; `quantity` above is
    // always already converted to the product's stock unit for pricing/stock.
    unit_quantity: item.unit_quantity === undefined || item.unit_quantity === null || item.unit_quantity === ''
      ? null
      : Number(item.unit_quantity),
    quantity,
    sub_total: subTotal,
  };
}

function applyProductFinancialSnapshot(line, product = {}) {
  if (!line || !line.product_id) return {
    ...line,
    standard_price: null,
    product_cost: null,
    profit_amount: null,
  };

  const standardPrice = nonNegativeNumber(product.product_price || 0, 'Standard selling price');
  const productCost = nonNegativeNumber(product.product_cost || 0, 'Product cost');
  // sub_total includes exclusive tax and contains inclusive tax. Removing the
  // line tax gives sale revenue excluding tax and after the item discount.
  const revenueBeforeTax = Number(line.sub_total || 0) - Number(line.tax_amount || 0);
  const profitAmount = revenueBeforeTax - productCost * Number(line.quantity || 0);

  return {
    ...line,
    standard_price: standardPrice,
    product_cost: productCost,
    profit_amount: profitAmount,
  };
}

module.exports = {
  computeSaleLine,
  isManualSaleItem,
  nonNegativeNumber,
  positiveNumber,
  applyProductFinancialSnapshot,
};
