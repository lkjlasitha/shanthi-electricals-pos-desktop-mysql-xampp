// Central API error formatter. It keeps database details in the server log while
// returning messages that explain what the user can fix.
function errorHandler(err, req, res, next) { // eslint-disable-line no-unused-vars
  console.error(err);

  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ message: 'The request contains invalid JSON.' });
  }
  if (err.type === 'entity.too.large') {
    return res.status(413).json({ message: 'The request is larger than the 15 MB limit.' });
  }


  if (err.message === 'Only .xlsx backup files are accepted.') {
    return res.status(422).json({ message: err.message });
  }

  if (err.name === 'MulterError') {
    return res.status(422).json({
      message: err.code === 'LIMIT_FILE_SIZE'
        ? 'The backup file is larger than the 50 MB upload limit.'
        : err.message || 'Backup upload failed.',
    });
  }

  if (err.name === 'HttpError' || err.status) {
    return res.status(err.status || 500).json({
      message: err.message || 'Request failed',
      ...(err.details ? { details: err.details } : {}),
    });
  }

  if (err.name === 'SequelizeUniqueConstraintError') {
    return res.status(409).json({
      message: 'A record with this value already exists.',
      fields: err.fields,
    });
  }

  if (err.name === 'SequelizeValidationError') {
    return res.status(422).json({
      message: err.errors.map((error) => error.message).join(', '),
      fields: err.errors.map((error) => error.path).filter(Boolean),
    });
  }

  if (err.name === 'SequelizeForeignKeyConstraintError') {
    const code = err.parent?.code || err.original?.code;
    const field = Array.isArray(err.fields) ? err.fields[0] : Object.keys(err.fields || {})[0] || null;

    if (code === 'ER_NO_REFERENCED_ROW_2') {
      return res.status(422).json({
        message: field
          ? `The selected value for "${field}" does not exist. Refresh the page and select a valid option.`
          : 'One of the selected category, brand, unit, warehouse, customer, or supplier records does not exist.',
        field,
      });
    }

    return res.status(409).json({
      message: 'This record is already used elsewhere and cannot be deleted.',
      field,
    });
  }

  if (err.name === 'SequelizeDatabaseError') {
    const code = err.parent?.code || err.original?.code;
    if (code === 'ER_BAD_FIELD_ERROR') {
      return res.status(500).json({
        message: 'The database schema is out of date. Stop the app, run "npm run db:migrate", and start it again.',
      });
    }
  }

  const connectionCode = err.original?.code || err.parent?.code || err.code;
  if (['ER_LOCK_DEADLOCK', 'ER_LOCK_WAIT_TIMEOUT'].includes(connectionCode)) {
    return res.status(409).json({ message: 'Another stock or payment update was happening at the same time. Please try again.' });
  }
  if (['ECONNREFUSED', 'ETIMEDOUT', 'PROTOCOL_CONNECTION_LOST', 'EPIPE', 'ENOTFOUND'].includes(connectionCode)
      || String(err.name || '').startsWith('SequelizeConnection')) {
    return res.status(503).json({ message: 'The database server is temporarily unreachable. Check MySQL and try again.' });
  }

  res.status(500).json({ message: 'Something went wrong on the server.' });
}

module.exports = errorHandler;
