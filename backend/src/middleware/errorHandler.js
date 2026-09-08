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

  if (err.name === 'MongoReferenceConstraintError') {
    return res.status(409).json({ message: err.message, field: err.field || null });
  }

  if (err.name === 'HttpError' || err.status) {
    return res.status(err.status || 500).json({
      message: err.message || 'Request failed',
      ...(err.details ? { details: err.details } : {}),
    });
  }

  if (err.code === 11000) {
    return res.status(409).json({
      message: 'A record with this value already exists.',
      fields: Object.keys(err.keyPattern || {}),
    });
  }

  if (err.name === 'ValidationError') {
    return res.status(422).json({
      message: Object.values(err.errors || {}).map((error) => error.message).join(', '),
      fields: Object.values(err.errors || {}).map((error) => error.path).filter(Boolean),
    });
  }

  const connectionCode = err.code;
  if (['TransientTransactionError', 112, 251].includes(connectionCode) || err.hasErrorLabel?.('TransientTransactionError')) {
    return res.status(409).json({ message: 'Another stock or payment update was happening at the same time. Please try again.' });
  }
  if (['ECONNREFUSED', 'ETIMEDOUT', 'EPIPE', 'ENOTFOUND'].includes(connectionCode)
      || /ServerSelectionError$/.test(err.name || '') || err.name === 'MongoNetworkError') {
    return res.status(503).json({ message: 'MongoDB is temporarily unreachable. Check the database server and try again.' });
  }

  res.status(500).json({ message: 'Something went wrong on the server.' });
}

module.exports = errorHandler;
