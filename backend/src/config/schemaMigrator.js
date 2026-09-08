const database = require('./db');

function getRegisteredModels() { return database.modelManager.models; }

async function repairMissingNumericIds(model) {
  const latest = await model.collection.findOne(
    { id: { $type: 'number' } },
    { sort: { id: -1 }, projection: { id: 1 } }
  );
  await database.resetCounter(model.tableName, latest?.id || 0);

  const missing = await model.collection.find(
    { $or: [{ id: { $exists: false } }, { id: null }] },
    { projection: { _id: 1 } }
  ).toArray();

  let repaired = 0;
  for (const document of missing) {
    const id = await database.nextNumericId(model.tableName);
    const result = await model.collection.updateOne(
      { _id: document._id, $or: [{ id: { $exists: false } }, { id: null }] },
      { $set: { id } }
    );
    repaired += result.modifiedCount || 0;
  }
  return repaired;
}

async function migrateSchema({ verbose = false } = {}) {
  for (const model of getRegisteredModels()) {
    const repaired = await repairMissingNumericIds(model);
    await model.createIndexes();
    const latest = await model.collection.findOne({}, { sort: { id: -1 }, projection: { id: 1 } });
    await database.resetCounter(model.tableName, latest?.id || 0);
    if (verbose) {
      const repairMessage = repaired ? `; repaired ${repaired} missing numeric id(s)` : '';
      console.log(`[mongodb] ${model.tableName}: indexes and numeric id counter ready${repairMessage}`);
    }
  }
}

// Kept as harmless exports so older integrations which imported individual
// migration helpers continue to load. MongoDB has no ALTER TABLE phase.
async function noOp() {}

module.exports = {
  migrateSchema,
  getRegisteredModels,
  repairMissingNumericIds,
  addCriticalColumns: noOp,
  makeSaleItemProductOptional: noOp,
  normalizePaymentMethodColumns: noOp,
};
