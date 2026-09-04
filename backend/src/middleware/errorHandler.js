function errorHandler(err, req, res, next) { // eslint-disable-line no-unused-vars
  console.error(err);
  if (err.type === 'entity.parse.failed') return res.status(400).json({ message: 'The request contains invalid JSON.' });
  if (err.type === 'entity.too.large') return res.status(413).json({ message: 'The request is larger than the 15 MB limit.' });
  if (err.message === 'Only .xlsx backup files are accepted.') return res.status(422).json({ message: err.message });
  if (err.name === 'MulterError') {
    return res.status(422).json({ message: err.code === 'LIMIT_FILE_SIZE' ? 'The backup file is larger than the 50 MB upload limit.' : err.message || 'Backup upload failed.' });
  }
  if (err.name === 'HttpError' || err.status) {
    return res.status(err.status || 500).json({ message: err.message || 'Request failed', ...(err.details ? { details: err.details } : {}) });
  }
  if (err.code === 11000) {
    return res.status(409).json({ message: 'A record with this value already exists.', fields: Object.keys(err.keyPattern || err.keyValue || {}) });
  }
  if (err.name === 'MongoValidationError') return res.status(422).json({ message: err.message });
  if (['MongoWriteConcernError', 'MongoTransactionError'].includes(err.name) || /TransientTransactionError/.test(String(err.errorLabels || ''))) {
    return res.status(409).json({ message: 'Another stock or payment update was happening at the same time. Please try again.' });
  }
  const connectionCode = err.code;
  if (['ECONNREFUSED', 'ETIMEDOUT', 'EHOSTUNREACH', 'ENETUNREACH', 'ENOTFOUND'].includes(connectionCode)
      || ['MongoNetworkError', 'MongoServerSelectionError'].includes(String(err.name || ''))) {
    return res.status(503).json({ message: 'The database server is temporarily unreachable. Check MongoDB and try again.' });
  }
  if (/Transaction numbers are only allowed|replica set/i.test(String(err.message || ''))) {
    return res.status(503).json({ message: 'MongoDB transaction support is required. Use Atlas or configure a replica set.' });
  }
  res.status(500).json({ message: 'Something went wrong on the server.' });
}
module.exports = errorHandler;
