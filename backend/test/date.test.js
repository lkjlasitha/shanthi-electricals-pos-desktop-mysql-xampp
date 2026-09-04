const test = require('node:test');
const assert = require('node:assert/strict');
const { dateISOInTimeZone, addDaysISO, daysBetweenISO } = require('../src/utils/date');

test('Sri Lankan transaction date does not use the previous UTC day', () => {
  const lateUtc = new Date('2026-07-21T20:00:00.000Z');
  assert.equal(dateISOInTimeZone(lateUtc, 'Asia/Colombo'), '2026-07-22');
});

test('credit due dates add calendar days without timezone drift', () => {
  assert.equal(addDaysISO('2026-01-31', 30), '2026-03-02');
  assert.equal(daysBetweenISO('2026-03-01', '2026-03-05'), 4);
});
