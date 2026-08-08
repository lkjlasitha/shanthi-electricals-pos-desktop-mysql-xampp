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

module.exports = { dateISOInTimeZone, todayISO };
