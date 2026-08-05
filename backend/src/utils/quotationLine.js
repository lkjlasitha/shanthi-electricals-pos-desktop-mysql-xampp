const HttpError = require('./httpError');
const { computeSaleLine, applyProductFinancialSnapshot, nonNegativeNumber } = require('./saleLine');

function computeQuotationLine(item = {}, index = 0) {
  if (item.product_id === null || item.product_id === undefined || item.product_id === '') {
    throw new HttpError(422, `Item ${index + 1} must be an active catalogue product.`);
  }

  const line = computeSaleLine({ ...item, is_manual: false }, index);
  return {
    product_id: line.product_id,
    product_price: line.product_price,
    quantity: line.quantity,
    discount_type: line.discount_type,
    discount_value: line.discount_value,
    discount_amount: line.discount_amount,
    tax_type: line.tax_type,
    tax_value: line.tax_value,
    tax_amount: line.tax_amount,
    sub_total: line.sub_total,
  };
}

function applyQuotationProductSnapshot(line, product) {
  const snapshot = applyProductFinancialSnapshot(line, product);
  return {
    ...line,
    standard_price: snapshot.standard_price,
    product_cost: snapshot.product_cost,
    profit_amount: snapshot.profit_amount,
  };
}

function computeQuotationTotals(lines, body = {}) {
  const subTotal = lines.reduce((sum, line) => sum + Number(line.sub_total || 0), 0);
  const discount = nonNegativeNumber(body.discount || 0, 'Quotation discount');
  const shipping = nonNegativeNumber(body.shipping || 0, 'Shipping');
  const taxRate = nonNegativeNumber(body.tax_rate || 0, 'Quotation tax');

  if (discount > subTotal) {
    throw new HttpError(422, 'Quotation discount cannot exceed the items subtotal.');
  }

  const taxAmount = ((subTotal - discount) * taxRate) / 100;
  return {
    sub_total: subTotal,
    discount,
    shipping,
    tax_rate: taxRate,
    tax_amount: taxAmount,
    grand_total: subTotal - discount + shipping + taxAmount,
    profit_amount: lines.reduce((sum, line) => sum + Number(line.profit_amount || 0), 0) - discount,
  };
}

module.exports = {
  computeQuotationLine,
  applyQuotationProductSnapshot,
  computeQuotationTotals,
};
