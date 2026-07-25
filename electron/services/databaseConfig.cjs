const fs = require('node:fs');
const path = require('node:path');
const { app, safeStorage } = require('electron');

function getConfigDirectory() {
  return path.join(app.getPath('userData'), 'config');
}

function getConfigPath() {
  return path.join(getConfigDirectory(), 'database.json');
}

function encrypt(value) {
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error('Windows credential encryption is not available for this user account.');
  }
  return safeStorage.encryptString(String(value || '')).toString('base64');
}

function decrypt(value) {
  if (!value) return '';
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error('Windows credential encryption is not available for this user account.');
  }
  return safeStorage.decryptString(Buffer.from(value, 'base64'));
}

function saveDatabaseConfig(config) {
  const configDirectory = getConfigDirectory();
  fs.mkdirSync(configDirectory, { recursive: true });

  const payload = {
    schemaVersion: 1,
    mode: config.mode === 'xampp' ? 'xampp' : 'mysql',
    host: String(config.host),
    port: Number(config.port),
    database: String(config.database),
    username: String(config.username),
    encryptedPassword: encrypt(config.password),
    encryptedJwtSecret: encrypt(config.jwtSecret),
    savedAt: new Date().toISOString(),
  };

  const target = getConfigPath();
  const temporary = `${target}.tmp`;
  fs.writeFileSync(temporary, JSON.stringify(payload, null, 2), { encoding: 'utf8', mode: 0o600 });
  if (fs.existsSync(target)) fs.unlinkSync(target);
  fs.renameSync(temporary, target);
  return target;
}

function loadDatabaseConfig() {
  const target = getConfigPath();
  if (!fs.existsSync(target)) return null;
  const saved = JSON.parse(fs.readFileSync(target, 'utf8'));

  if (Number(saved.schemaVersion || 0) !== 1) {
    throw new Error('The saved database configuration format is not supported.');
  }

  return {
    schemaVersion: 1,
    mode: saved.mode === 'xampp' ? 'xampp' : 'mysql',
    host: saved.host,
    port: Number(saved.port || 3306),
    database: saved.database,
    username: saved.username,
    password: decrypt(saved.encryptedPassword),
    jwtSecret: decrypt(saved.encryptedJwtSecret),
  };
}

function getPublicDatabaseConfig() {
  const config = loadDatabaseConfig();
  if (!config) return null;
  return {
    mode: config.mode,
    host: config.host,
    port: config.port,
    database: config.database,
    username: config.username,
  };
}

function deleteDatabaseConfig() {
  const target = getConfigPath();
  if (fs.existsSync(target)) fs.unlinkSync(target);
}

module.exports = {
  getConfigDirectory,
  getConfigPath,
  saveDatabaseConfig,
  loadDatabaseConfig,
  getPublicDatabaseConfig,
  deleteDatabaseConfig,
};
