const test = require('node:test');
const assert = require('node:assert/strict');
const { dateISOInTimeZone } = require('../src/utils/date');

test('Sri Lankan transaction date does not use the previous UTC day', () => {
  const lateUtc = new Date('2026-07-21T20:00:00.000Z');
  assert.equal(dateISOInTimeZone(lateUtc, 'Asia/Colombo'), '2026-07-22');
});
