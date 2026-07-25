class HttpError extends Error {
  constructor(status, message, details = undefined) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
    this.details = details;
    Error.captureStackTrace?.(this, HttpError);
  }
}

module.exports = HttpError;
