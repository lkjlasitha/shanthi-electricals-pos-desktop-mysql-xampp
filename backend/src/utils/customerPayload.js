const HttpError = require('./httpError');

const CUSTOMER_TYPES = new Set(['retail', 'wholesale', 'credit']);
const TEXT_FIELDS = {
  name: 191,
  email: 191,
  phone: 100,
  country: 100,
  city: 100,
  address: 2000,
  tax_number: 100,
  notes: 5000,
};

function cleanText(value, field, maxLength, { required = false } = {}) {
  const text = String(value ?? '').trim();
  if (required && !text) throw new HttpError(422, `${field} is required.`);
  if (text.length > maxLength) throw new HttpError(422, `${field} must not exceed ${maxLength} characters.`);
  return text || null;
}

function optionalMoney(value, label, { nullable = false } = {}) {
  if (nullable && (value === null || value === undefined || value === '')) return null;
  const number = Number(value ?? 0);
  if (!Number.isFinite(number) || number < 0) {
    throw new HttpError(422, `${label} must be a valid amount greater than or equal to zero.`);
  }
  return number;
}

function normalizeCustomerPayload(source = {}, { partial = false } = {}) {
  const data = {};

  for (const [field, maxLength] of Object.entries(TEXT_FIELDS)) {
    if (partial && !Object.prototype.hasOwnProperty.call(source, field)) continue;
    const required = field === 'name' || field === 'phone';
    data[field] = cleanText(source[field], field === 'name' ? 'Name' : field === 'phone' ? 'Phone number' : field.replace('_', ' '), maxLength, { required });
  }

  if (!partial || Object.prototype.hasOwnProperty.call(source, 'customer_type')) {
    const type = String(source.customer_type || 'retail').trim().toLowerCase();
    if (!CUSTOMER_TYPES.has(type)) throw new HttpError(422, 'Customer type must be retail, wholesale, or credit.');
    data.customer_type = type;
  }

  if (!partial || Object.prototype.hasOwnProperty.call(source, 'opening_balance')) {
    data.opening_balance = optionalMoney(source.opening_balance, 'Opening balance');
  }
  if (!partial || Object.prototype.hasOwnProperty.call(source, 'credit_limit')) {
    data.credit_limit = optionalMoney(source.credit_limit, 'Credit limit', { nullable: true });
  }
  if (!partial || Object.prototype.hasOwnProperty.call(source, 'payment_terms_days')) {
    const days = Number(source.payment_terms_days ?? 30);
    if (!Number.isInteger(days) || days < 0 || days > 3650) {
      throw new HttpError(422, 'Payment terms must be a whole number from 0 to 3650 days.');
    }
    data.payment_terms_days = days;
  }
  if (!partial || Object.prototype.hasOwnProperty.call(source, 'is_active')) {
    data.is_active = source.is_active === undefined ? true : Boolean(source.is_active);
  }

  return data;
}

module.exports = { normalizeCustomerPayload, optionalMoney };
