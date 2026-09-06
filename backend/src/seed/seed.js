require('dotenv').config();
const { connect, disconnect } = require('../config/db');
const { formatDatabaseError } = require('../config/databaseSetup');
require('../models/associations');
const { migrateSchema } = require('../config/schemaMigrator');
const { bootstrapShopData } = require('../services/bootstrapService');

async function run() {
  await connect();
  await migrateSchema({ verbose: true });

  const result = await bootstrapShopData({
    admin: {
      name: process.env.SEED_ADMIN_NAME || 'Shop Owner',
      email: process.env.SEED_ADMIN_EMAIL || 'admin@example.com',
      password: process.env.SEED_ADMIN_PASSWORD || 'Admin@12345',
      phone: process.env.SEED_ADMIN_PHONE || '+94 77 123 4567',
    },
  });

  if (result.administrator.created) {
    console.log(`Admin user created: ${result.administrator.email}`);
  } else {
    console.log('Admin user already exists, skipping.');
  }

  console.log('Seed complete.');
}

run()
  .then(async () => {
    await disconnect();
    process.exit(0);
  })
  .catch(async (error) => {
    console.error(`Seed failed: ${formatDatabaseError(error)}`);
    try {
      await disconnect();
    } catch {
      // Ignore close errors after a failed connection.
    }
    process.exit(1);
  });
