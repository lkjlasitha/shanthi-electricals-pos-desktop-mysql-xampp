const {
  configuredMongoDnsServers,
  dnsConfigurationError,
  sourceFor,
  environmentWarnings,
} = require('./environment');
const {
  DEFAULT_MONGODB_URI,
  formatMongoError,
  parseMongoUri,
  publicMongoTarget,
} = require('./mongoConnection');

function getDatabaseConfig() {
  if (dnsConfigurationError) throw dnsConfigurationError;
  const source = sourceFor('MONGODB_URI');
  const uri = source === 'built-in local default' ? DEFAULT_MONGODB_URI : process.env.MONGODB_URI;
  const parsed = parseMongoUri(uri);
  return {
    uri: parsed.uri,
    database: parsed.database,
    source,
    target: publicMongoTarget(parsed.uri),
    warnings: environmentWarnings(),
    dnsServers: configuredMongoDnsServers,
  };
}

function formatDatabaseError(error) { return formatMongoError(error, process.env.MONGODB_URI); }

// MongoDB creates the database and collections on first write.
async function ensureDatabaseExists() {}
function shouldAutoCreateDatabase() { return true; }

module.exports = { ensureDatabaseExists, formatDatabaseError, getDatabaseConfig, shouldAutoCreateDatabase };
