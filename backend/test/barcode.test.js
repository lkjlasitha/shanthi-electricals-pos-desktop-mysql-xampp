const test = require('node:test');
const assert = require('node:assert/strict');
const { ean13CheckDigit, makeEan13Candidate, isValidEan13, normalizeBarcodeInput, barcodeSymbolFor } = require('../src/utils/barcode');

test('EAN-13 check digit matches a known example', () => {
  assert.equal(ean13CheckDigit('400638133393'), '1');
  assert.equal(isValidEan13('4006381333931'), true);
});

test('generated internal barcode is a valid EAN-13 value', () => {
  const code = makeEan13Candidate();
  assert.match(code, /^\d{13}$/);
  assert.equal(code.startsWith('20'), true);
  assert.equal(isValidEan13(code), true);
});


test('scanner suffix characters are removed from barcode input', () => {
  assert.equal(normalizeBarcodeInput(' 4791234567890\r\n'), '4791234567890');
});

test('invalid EAN-13 values safely fall back to CODE128', () => {
  assert.equal(barcodeSymbolFor('ABC-123', 'EAN13'), 'CODE128');
  const generated = makeEan13Candidate();
  assert.equal(barcodeSymbolFor(generated, 'EAN13'), 'EAN13');
});
