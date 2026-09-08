const sequelize = require('../config/db');
const { ensureDatabaseExists, formatDatabaseError, getDatabaseConfig } = require('../config/databaseSetup');
require('../models/associations'); // register all models before loading the migrator
const { migrateSchema } = require('../config/schemaMigrator');

async function run() {
  try {
    const config = getDatabaseConfig();
    console.log(`MongoDB configuration source: ${config.source}`);
    console.log(`MongoDB target: ${config.target}`);
    for (const warning of config.warnings) console.warn(`Configuration warning: ${warning}`);
    await ensureDatabaseExists();
    await sequelize.authenticate();
    // Create collections/indexes and synchronize numeric id counters.
    await sequelize.sync({ alter: false });
    await migrateSchema({ verbose: true });
    console.log(`MongoDB initialization successful: ${config.database}`);
  } catch (error) {
    console.error(`Database migration failed: ${formatDatabaseError(error)}`);
    process.exitCode = 1;
  } finally {
    await sequelize.close().catch(() => {});
  }
}

run();
