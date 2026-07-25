function applyDatabaseConfig(config, { dataDirectory } = {}) {
  process.env.NODE_ENV = 'production';
  process.env.DB_HOST = String(config.host);
  process.env.DB_PORT = String(config.port || 3306);
  process.env.DB_NAME = String(config.database);
  process.env.DB_USER = String(config.username);
  process.env.DB_PASSWORD = String(config.password || '');
  process.env.JWT_SECRET = String(config.jwtSecret || '');
  process.env.JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '12h';
  process.env.DEFAULT_TIMEZONE = process.env.DEFAULT_TIMEZONE || 'Asia/Colombo';
  process.env.AUTO_CREATE_DATABASE = 'false';
  if (dataDirectory) process.env.POS_DATA_DIR = dataDirectory;
}

module.exports = { applyDatabaseConfig };
