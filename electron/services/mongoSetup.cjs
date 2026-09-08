const crypto = require('node:crypto');
const { dnsConfigurationError } = require('../../backend/src/config/environment');
const {
  formatMongoError,
  parseMongoUri,
  publicMongoTarget,
} = require('../../backend/src/config/mongoConnection');

function mongooseClient() { return require('mongoose'); }

function normalizeConfig(input = {}) {
  if (dnsConfigurationError) throw dnsConfigurationError;
  const uri = String(input.uri || '').trim();
  parseMongoUri(uri);
  return { uri };
}

function publicServer(uri) {
  try {
    const parsed = parseMongoUri(uri);
    return { engine: 'MongoDB', host: parsed.hosts, database: parsed.database || '(default)' };
  } catch { return { engine: 'MongoDB', host: 'configured server', database: '(default)' }; }
}

async function testServerConnection(input = {}) {
  const config = normalizeConfig(input); const mongoose = mongooseClient(); let connection;
  try {
    const { database: dbName } = parseMongoUri(config.uri);
    connection = await mongoose.createConnection(config.uri, { dbName, serverSelectionTimeoutMS: 10000 }).asPromise();
    const [buildInfo, hello] = await Promise.all([
      connection.db.admin().command({ buildInfo: 1 }),
      connection.db.admin().command({ hello: 1 }),
    ]);
    return { success: true, ...publicServer(config.uri), version: buildInfo.version, transactionCapable: Boolean(hello.setName || hello.msg === 'isdbgrid') };
  } catch (error) { const wrapped = new Error(formatMongoError(error, config.uri)); wrapped.code = error.code; throw wrapped; }
  finally { if (connection) await connection.close().catch(() => {}); }
}

async function provisionDatabase(input = {}) {
  const config = normalizeConfig(input); const result = await testServerConnection(config);
  if (!result.transactionCapable) throw new Error('This MongoDB server is standalone. Configure a replica set or use MongoDB Atlas so POS transactions are safe.');
  return { server: result, appConfig: { mode: 'mongodb', uri: config.uri, jwtSecret: crypto.randomBytes(48).toString('hex') } };
}

module.exports = { normalizeConfig, formatMongoError, testServerConnection, provisionDatabase, publicServer, publicMongoTarget };
