require('dotenv').config();
const sequelize = require('../config/db');
const {
  ensureDatabaseExists,
  formatDatabaseError,
  getDatabaseConfig,
} = require('../config/databaseSetup');

async function run() {
  const config = getDatabaseConfig();
  try {
    await ensureDatabaseExists();
    await sequelize.authenticate();
    console.log(`Database connection successful: ${config.host}:${config.port}/${config.database}`);
  } catch (error) {
    console.error(`Database check failed: ${formatDatabaseError(error)}`);
    process.exitCode = 1;
  } finally {
    await sequelize.close().catch(() => {});
  }
}

run();
