const { customAlphabet } = require('nanoid');
const nanoid = customAlphabet('0123456789', 6);

// Generates a human-friendly reference code, e.g. SL-2026-000123
function generateReferenceCode(prefix = 'SL') {
  const year = new Date().getFullYear();
  return `${prefix}-${year}-${nanoid()}`;
}

// Wraps an async express handler so thrown errors reach the error middleware.
const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

module.exports = { generateReferenceCode, asyncHandler };
