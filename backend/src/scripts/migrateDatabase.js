require('dotenv').config();
const { connect, disconnect, MONGODB_URI } = require('../config/db');
const { formatDatabaseError } = require('../config/databaseSetup');
require('../models/associations'); // register all models before loading the migrator
const { migrateSchema } = require('../config/schemaMigrator');

async function run() {
  try {
    await connect();
    await migrateSchema({ verbose: true });
    console.log(`Database migration successful: ${MONGODB_URI}`);
  } catch (error) {
    console.error(`Database migration failed: ${formatDatabaseError(error)}`);
    process.exitCode = 1;
  } finally {
    await disconnect().catch(() => {});
  }
}

run();
