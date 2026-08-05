const test = require('node:test');
const assert = require('node:assert/strict');
const { dateISOInTimeZone, addDaysISO, isValidISODate } = require('../src/utils/date');

test('Sri Lankan transaction date does not use the previous UTC day', () => {
  const lateUtc = new Date('2026-07-21T20:00:00.000Z');
  assert.equal(dateISOInTimeZone(lateUtc, 'Asia/Colombo'), '2026-07-22');
});

test('customer due dates do not drift with the local timezone', () => {
  assert.equal(addDaysISO('2026-08-05', 30), '2026-09-04');
  assert.equal(addDaysISO('2024-02-28', 1), '2024-02-29');
});

test('transaction dates reject impossible calendar values', () => {
  assert.equal(isValidISODate('2026-08-05'), true);
  assert.equal(isValidISODate('2026-02-30'), false);
  assert.equal(isValidISODate('05/08/2026'), false);
});
