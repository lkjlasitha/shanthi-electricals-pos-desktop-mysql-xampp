require('dotenv').config();
const { connect, disconnect, mongoose, MONGODB_URI } = require('../config/db');
const { formatDatabaseError } = require('../config/databaseSetup');
const { registry } = require('../config/sequelizeCompat');
require('../models/associations'); // register all models

// MongoDB is schemaless, so there is no "missing column" concept to check.
// This instead reports, per model, whether its backing collection exists and
// how many documents it holds -- a quick sanity check that migrations/seed
// have run and the app is pointed at the database you expect.
async function run() {
  try {
    await connect();
    console.log(`Database: ${MONGODB_URI}`);

    const existingCollections = new Set(
      (await mongoose.connection.db.listCollections().toArray()).map((c) => c.name)
    );

    let missingCount = 0;
    for (const model of [...registry.values()].sort((a, b) => a.collectionName.localeCompare(b.collectionName))) {
      if (!existingCollections.has(model.collectionName)) {
        console.log(`[not created yet] ${model.collectionName} (${model.modelName}) -- normal before first write`);
        continue;
      }
      const count = await model.count();
      console.log(`${model.collectionName}: ${count} document(s)`);
    }

    if (!existingCollections.has('counters')) {
      console.log('[missing] counters collection -- run: npm run db:migrate');
      missingCount += 1;
    }

    if (missingCount) {
      console.log(`Database diagnosis found ${missingCount} issue(s). Run: npm run db:migrate`);
      process.exitCode = 2;
    } else {
      console.log('Database diagnosis passed.');
    }
  } catch (error) {
    console.error(`Database diagnosis failed: ${formatDatabaseError(error)}`);
    process.exitCode = 1;
  } finally {
    await disconnect().catch(() => {});
  }
}

run();
