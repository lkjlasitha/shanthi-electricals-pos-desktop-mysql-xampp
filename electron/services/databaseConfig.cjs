const fs = require('node:fs');
const path = require('node:path');
const { app, safeStorage } = require('electron');

function getConfigDirectory() { return path.join(app.getPath('userData'), 'config'); }
function getConfigPath() { return path.join(getConfigDirectory(), 'database.json'); }
function encrypt(value) {
  if (!safeStorage.isEncryptionAvailable()) throw new Error('Windows credential encryption is not available for this user account.');
  return safeStorage.encryptString(String(value || '')).toString('base64');
}
function decrypt(value) {
  if (!value) return '';
  if (!safeStorage.isEncryptionAvailable()) throw new Error('Windows credential encryption is not available for this user account.');
  return safeStorage.decryptString(Buffer.from(value, 'base64'));
}
function saveDatabaseConfig(config) {
  fs.mkdirSync(getConfigDirectory(), { recursive: true });
  const payload = {
    schemaVersion: 2,
    database: String(config.database),
    encryptedUri: encrypt(config.uri),
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
  if (Number(saved.schemaVersion || 0) !== 2) return null;
  return { schemaVersion: 2, database: saved.database, uri: decrypt(saved.encryptedUri), jwtSecret: decrypt(saved.encryptedJwtSecret) };
}
function getPublicDatabaseConfig() {
  const config = loadDatabaseConfig();
  return config ? { engine: 'MongoDB', database: config.database } : null;
}
function deleteDatabaseConfig() {
  const target = getConfigPath();
  if (fs.existsSync(target)) fs.unlinkSync(target);
}
module.exports = { getConfigDirectory, getConfigPath, saveDatabaseConfig, loadDatabaseConfig, getPublicDatabaseConfig, deleteDatabaseConfig };
