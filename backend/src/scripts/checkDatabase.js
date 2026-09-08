const sequelize = require('../config/db');
const {
  ensureDatabaseExists,
  formatDatabaseError,
  getDatabaseConfig,
} = require('../config/databaseSetup');

async function run() {
  try {
    const config = getDatabaseConfig();
    console.log(`MongoDB configuration source: ${config.source}`);
    console.log(`MongoDB target: ${config.target}`);
    for (const warning of config.warnings) console.warn(`Configuration warning: ${warning}`);
    await ensureDatabaseExists();
    await sequelize.authenticate();
    console.log(`MongoDB connection successful: ${config.database}`);
  } catch (error) {
    console.error(`Database check failed: ${formatDatabaseError(error)}`);
    process.exitCode = 1;
  } finally {
    await sequelize.close().catch(() => {});
  }
}

run();
