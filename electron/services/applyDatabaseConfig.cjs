function applyDatabaseConfig(config, { dataDirectory } = {}) {
  process.env.NODE_ENV = 'production';
  process.env.MONGODB_URI = String(config.uri);
  process.env.JWT_SECRET = String(config.jwtSecret || '');
  process.env.JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '12h';
  process.env.DEFAULT_TIMEZONE = process.env.DEFAULT_TIMEZONE || 'Asia/Colombo';
  if (dataDirectory) process.env.POS_DATA_DIR = dataDirectory;
}

module.exports = { applyDatabaseConfig };
