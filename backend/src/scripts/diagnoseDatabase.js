require('dotenv').config();
const database = require('../config/db');
const { formatDatabaseError, getDatabaseConfig } = require('../config/databaseSetup');
require('../models/associations');

async function run() {
  try {
    await database.authenticate();
    await database.sync();
    const config = getDatabaseConfig();
    const collections = new Set((await database.db.listCollections({}, { nameOnly: true }).toArray()).map((item) => item.name));
    let issues = 0;
    console.log(`MongoDB database: ${config.database}`);
    for (const model of database.modelManager.models) {
      const exists = collections.has(model.tableName);
      const indexes = exists ? await model._collection().indexes() : [];
      console.log(`${model.tableName}: ${exists ? `${indexes.length} index(es)` : 'missing collection'}`);
      if (!exists) issues += 1;
    }
    if (issues) {
      console.log(`Database doctor found ${issues} issue(s). Run: npm run db:migrate`);
      process.exitCode = 2;
    } else console.log('MongoDB collection and index check passed.');
  } catch (error) {
    console.error(`Database diagnosis failed: ${formatDatabaseError(error)}`);
    process.exitCode = 1;
  } finally {
    await database.close().catch(() => {});
  }
}

run();
