const crypto = require('crypto');

function normalizeBarcodeInput(value) {
  return String(value ?? '').replace(/[\r\n\t]/g, '').trim();
}

function ean13CheckDigit(firstTwelveDigits) {
  const digits = String(firstTwelveDigits || '').replace(/\D/g, '');
  if (digits.length !== 12) {
    throw new Error('EAN-13 requires exactly 12 digits before the check digit.');
  }

  const sum = digits.split('').reduce((total, digit, index) => {
    const value = Number(digit);
    return total + value * (index % 2 === 0 ? 1 : 3);
  }, 0);

  return String((10 - (sum % 10)) % 10);
}

function makeEan13Candidate() {
  // Prefix 20 is used here for an internal shop barcode range. The remaining
  // digits combine the current time and secure random data to avoid collisions.
  const timePart = String(Date.now()).slice(-7);
  const randomPart = String(crypto.randomInt(0, 1000)).padStart(3, '0');
  const firstTwelve = `20${timePart}${randomPart}`;
  return `${firstTwelve}${ean13CheckDigit(firstTwelve)}`;
}

async function generateUniqueProductCode(Product, { transaction, attempts = 30 } = {}) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const code = makeEan13Candidate();
    const exists = await Product.count({ where: { code }, transaction });
    if (!exists) return code;
  }

  throw new Error('Could not generate a unique product barcode. Please try again.');
}

function isValidEan13(value) {
  const digits = normalizeBarcodeInput(value);
  if (!/^\d{13}$/.test(digits)) return false;
  return ean13CheckDigit(digits.slice(0, 12)) === digits.slice(-1);
}

function barcodeSymbolFor(value, requested = 'CODE128') {
  const code = normalizeBarcodeInput(value);
  const preferred = String(requested || '').toUpperCase();
  return preferred === 'EAN13' && isValidEan13(code) ? 'EAN13' : 'CODE128';
}

module.exports = {
  normalizeBarcodeInput,
  barcodeSymbolFor,
  ean13CheckDigit,
  makeEan13Candidate,
  generateUniqueProductCode,
  isValidEan13,
};
