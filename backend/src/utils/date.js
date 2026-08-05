function dateISOInTimeZone(date = new Date(), timeZone = process.env.DEFAULT_TIMEZONE || 'Asia/Colombo') {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date).reduce((result, part) => ({ ...result, [part.type]: part.value }), {});

  return `${parts.year}-${parts.month}-${parts.day}`;
}

function todayISO() {
  return dateISOInTimeZone();
}

function addDaysISO(dateISO, days) {
  const safeDays = Number.isFinite(Number(days)) ? Math.max(0, Math.trunc(Number(days))) : 0;
  const date = new Date(`${dateISO}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return dateISO;
  date.setUTCDate(date.getUTCDate() + safeDays);
  return date.toISOString().slice(0, 10);
}

function isValidISODate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ''))) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

module.exports = { dateISOInTimeZone, todayISO, addDaysISO, isValidISODate };
