// MongoDB creates its database and collections automatically on first write,
// so there is no MySQL-style "CREATE DATABASE IF NOT EXISTS" step needed.
// This module is kept (with the same exported shape) so callers elsewhere
// don't need to change, and so connection errors still get a helpful,
// specific message instead of a raw driver stack trace.
const { MONGODB_URI } = require('./db');

async function ensureDatabaseExists() {
  // No-op for MongoDB.
}

function formatDatabaseError(error) {
  const message = String(error?.message || error || '');

  if (error?.name === 'MongoServerSelectionError' || /ECONNREFUSED/.test(message)) {
    return [
      `MongoDB is not reachable at ${MONGODB_URI}.`,
      'If you are running MongoDB locally, make sure it is started.',
      'If you are using MongoDB Atlas, confirm MONGODB_URI in backend/.env and that your IP is allowed in Atlas Network Access.',
    ].join(' ');
  }

  if (/Authentication failed/i.test(message) || error?.code === 18) {
    return [
      'MongoDB rejected the connection credentials.',
      'Check the username and password inside MONGODB_URI in backend/.env.',
    ].join(' ');
  }

  if (/replica set|Transaction numbers/i.test(message)) {
    return [
      'This MongoDB server does not support transactions (it is not running as a replica set).',
      'Use a MongoDB Atlas cluster (even the free tier is a replica set) or a local replica set for development.',
    ].join(' ');
  }

  return message || String(error);
}

function shouldAutoCreateDatabase() {
  return true; // Always true for MongoDB; kept for API compatibility.
}

function getDatabaseConfig() {
  return { uri: MONGODB_URI };
}

module.exports = {
  ensureDatabaseExists,
  formatDatabaseError,
  getDatabaseConfig,
  shouldAutoCreateDatabase,
};
