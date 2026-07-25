require('dotenv').config();
const sequelize = require('../config/db');
const { ensureDatabaseExists, formatDatabaseError, getDatabaseConfig } = require('../config/databaseSetup');
require('../models/associations'); // register all models before loading the migrator
const { migrateSchema } = require('../config/schemaMigrator');

async function run() {
  const config = getDatabaseConfig();
  try {
    await ensureDatabaseExists();
    await sequelize.authenticate();
    // Create tables that do not exist, but do not destructively alter existing ones.
    await sequelize.sync({ alter: false });
    await migrateSchema({ verbose: true });
    console.log(`Database migration successful: ${config.host}:${config.port}/${config.database}`);
  } catch (error) {
    console.error(`Database migration failed: ${formatDatabaseError(error)}`);
    process.exitCode = 1;
  } finally {
    await sequelize.close().catch(() => {});
  }
}

run();
