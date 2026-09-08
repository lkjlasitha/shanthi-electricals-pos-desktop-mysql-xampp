const database = require('../config/db');
const { formatDatabaseError, getDatabaseConfig } = require('../config/databaseSetup');
require('../models/associations');

async function run() {
  try {
    const config = getDatabaseConfig();
    console.log(`MongoDB configuration source: ${config.source}`);
    console.log(`MongoDB target: ${config.target}`);
    for (const warning of config.warnings) console.warn(`Configuration warning: ${warning}`);
    await database.authenticate();
    const { database: name } = config;
    console.log(`MongoDB database: ${name}`);
    for (const model of database.modelManager.models) {
      const [count, indexes] = await Promise.all([model.collection.countDocuments(), model.collection.indexes()]);
      console.log(`${model.tableName}: ${count} document(s), ${indexes.length} index(es)`);
    }
    const hello = await database.mongoose.connection.db.admin().command({ hello: 1 });
    console.log(hello.setName || hello.msg === 'isdbgrid' ? 'Transaction-capable deployment detected.' : 'Warning: standalone MongoDB detected; use a replica set for transactional POS writes.');
  } catch (error) { console.error(`Database diagnosis failed: ${formatDatabaseError(error)}`); process.exitCode = 1; }
  finally { await database.close().catch(() => {}); }
}
run();
