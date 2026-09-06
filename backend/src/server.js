require('dotenv').config();
const { connect } = require('./config/db');
const { formatDatabaseError } = require('./config/databaseSetup');
require('./models/associations');
const { migrateSchema } = require('./config/schemaMigrator');
const { ensureDefaultSettings } = require('./services/settingsService');
const { createApp } = require('./app');

const PORT = Number(process.env.PORT || 4000);

async function start() {
  try {
    await connect();
    console.log('Database connected');
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
