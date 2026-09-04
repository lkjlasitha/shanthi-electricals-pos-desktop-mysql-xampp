const { getMongoConfig } = require('../database/mongoOrm');

function getDatabaseConfig() {
  return getMongoConfig();
}

function formatDatabaseError(error) {
  const config = getDatabaseConfig();
  const message = error?.message || String(error);
  const code = error?.code || error?.codeName;
  if (code === 'ECONNREFUSED' || /ECONNREFUSED|server selection/i.test(message)) {
    return `MongoDB is not reachable using MONGODB_URI. Start MongoDB or check the URI, network, TLS, and firewall settings. Database: ${config.database}.`;
  }
  if (code === 18 || /Authentication failed/i.test(message)) {
    return 'MongoDB rejected the supplied credentials. Check the username, password, authentication database, and user permissions.';
  }
  if (/Transaction numbers are only allowed|replica set|Transaction support/i.test(message)) {
    return 'This POS requires MongoDB transaction support. Use MongoDB Atlas, a replica set, or a mongos deployment.';
  }
  return message;
}

// MongoDB creates a database on its first write. The startup sync creates the
// collections and indexes, so this compatibility hook intentionally does not
// perform a separate provisioning query.
async function ensureDatabaseExists() {}

module.exports = { ensureDatabaseExists, formatDatabaseError, getDatabaseConfig };
