require('dotenv').config();
const { connect, disconnect, MONGODB_URI } = require('../config/db');
const { formatDatabaseError } = require('../config/databaseSetup');

async function run() {
  try {
    await connect();
    console.log(`Database connection successful: ${MONGODB_URI}`);
  } catch (error) {
    console.error(`Database check failed: ${formatDatabaseError(error)}`);
    process.exitCode = 1;
  } finally {
    await disconnect().catch(() => {});
  }
}

run();
