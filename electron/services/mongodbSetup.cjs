const crypto = require('node:crypto');

function mongoClient() { return require('mongodb').MongoClient; }
const DATABASE_NAME_PATTERN = /^[A-Za-z0-9_$-]+$/;

function validateDatabaseName(value) {
  const database = String(value || '').trim();
  if (!database || !DATABASE_NAME_PATTERN.test(database)) throw new Error('Database name may contain only letters, numbers, underscores, dollar signs, and hyphens.');
  return database;
}

function normalizeMongoConfig(input = {}) {
  const uri = String(input.uri || '').trim();
  if (!/^mongodb(?:\+srv)?:\/\//i.test(uri)) throw new Error('Enter a valid MongoDB URI beginning with mongodb:// or mongodb+srv://.');
  return { uri, database: validateDatabaseName(input.database || 'electro_pos') };
}

function formatMongoError(error) {
  const message = error?.message || String(error);
  if (/authentication failed|bad auth/i.test(message) || error?.code === 18) return 'MongoDB rejected the username or password. Check the URI and authentication database.';
  if (/ECONNREFUSED|server selection/i.test(message)) return 'MongoDB could not be reached. Start the server or check the URI, DNS, TLS, network, and firewall settings.';
  if (/IP.*access list|not authorized/i.test(message)) return 'MongoDB denied access. Check the Atlas IP access list and the database user permissions.';
  return message;
}

function generateSecret(bytes = 48) { return crypto.randomBytes(bytes).toString('base64url'); }

async function testMongoConnection(input) {
  const config = normalizeMongoConfig(input);
  const MongoClient = mongoClient();
  const client = new MongoClient(config.uri, { serverSelectionTimeoutMS: 10000 });
  try {
    await client.connect();
    const db = client.db(config.database);
    await db.command({ ping: 1 });
    const hello = await db.admin().command({ hello: 1 });
    const transactionsSupported = Boolean(hello.setName || hello.msg === 'isdbgrid');
    if (!transactionsSupported) throw new Error('This POS requires MongoDB transaction support. Use MongoDB Atlas or configure the server as a replica set.');
    const version = await db.command({ buildInfo: 1 }).then((info) => info.version).catch(() => 'compatible');
    return { success: true, engine: 'MongoDB', version, transactionsSupported };
  } catch (error) {
    const wrapped = new Error(formatMongoError(error));
    wrapped.code = error?.code;
    throw wrapped;
  } finally {
    await client.close().catch(() => {});
  }
}

async function provisionDatabase(input = {}) {
  const config = normalizeMongoConfig(input);
  const server = await testMongoConnection(config);
  return { success: true, server, appConfig: { ...config, jwtSecret: generateSecret() } };
}

module.exports = { DATABASE_NAME_PATTERN, validateDatabaseName, normalizeMongoConfig, formatMongoError, testMongoConnection, provisionDatabase, generateSecret };
