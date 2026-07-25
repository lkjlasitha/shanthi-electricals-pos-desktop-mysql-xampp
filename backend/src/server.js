require('dotenv').config();
const sequelize = require('./config/db');
const { ensureDatabaseExists, formatDatabaseError } = require('./config/databaseSetup');
require('./models/associations');
const { migrateSchema } = require('./config/schemaMigrator');
const { ensureDefaultSettings } = require('./services/settingsService');
const { createApp } = require('./app');

const PORT = Number(process.env.PORT || 4000);

async function start() {
  try {
    await ensureDatabaseExists();
    await sequelize.authenticate();
    console.log('Database connected');
    await sequelize.sync({ alter: false });
    await migrateSchema({ verbose: true });
    await ensureDefaultSettings();

    const app = createApp({ enableCors: true, logFormat: 'dev' });
    app.listen(PORT, () => {
      console.log(`Shanthi Electricals backend running on port ${PORT}`);
    });
  } catch (error) {
    console.error(`Failed to start server: ${formatDatabaseError(error)}`);
    process.exit(1);
  }
}

start();
