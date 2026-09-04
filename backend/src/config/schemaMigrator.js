const database = require('./db');

function getRegisteredModels() {
  return [...new Set(database.modelManager?.models || Object.values(database.models || {}))];
}

async function alignCounters() {
  for (const model of getRegisteredModels()) {
    const maximum = await model.max('id');
    if (maximum == null) continue;
    await database.db.collection('_counters').updateOne(
      { _id: model.tableName },
      { $max: { sequence: Number(maximum) } },
      { upsert: true }
    );
  }
}

async function applyDocumentDefaults() {
  for (const model of getRegisteredModels()) {
    for (const [field, definition] of Object.entries(model.attributes || {})) {
      if (field === 'id' || definition.defaultValue === undefined) continue;
      const value = typeof definition.defaultValue === 'function' ? definition.defaultValue() : definition.defaultValue;
      await model._collection().updateMany(
        { [field]: { $exists: false } },
        { $set: { [field]: value, updated_at: new Date() } }
      );
    }
  }
}

async function migrateSchema({ verbose = true } = {}) {
  await database.sync();
  await alignCounters();
  await applyDocumentDefaults();
  if (verbose) console.log(`[db:migrate] MongoDB collections and indexes ready (${getRegisteredModels().length} models)`);
  return { models: getRegisteredModels().length };
}

module.exports = { getRegisteredModels, alignCounters, applyDocumentDefaults, migrateSchema };
