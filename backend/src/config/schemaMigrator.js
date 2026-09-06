// MongoDB is schemaless, so the old MySQL "add missing column" / "widen this
// column" migration logic (schemaMigrator.js under Sequelize) no longer
// applies -- new fields on a model just start appearing on new documents.
// What this file does instead, every time the server boots:
//   1. Make sure every model's indexes exist (unique constraints, etc).
//   2. Seed a few pieces of data the app assumes exist: the Meter/Foot/
//      Yard/Inch length units, and default business settings.
// Both steps are idempotent -- safe to run on every boot, including on a
// database that already has this data from a previous boot.
const { registry } = require('./sequelizeCompat');

async function ensureAllIndexes({ verbose = true } = {}) {
  const changes = [];
  for (const model of registry.values()) {
    try {
      await model.ensureIndexes();
    } catch (error) {
      changes.push(`WARNING: could not ensure indexes for ${model.modelName}: ${error.message}`);
    }
  }
  if (verbose) console.log(`[db:migrate] ensured indexes for ${registry.size} model(s)`);
  return changes;
}

// Adds Foot/Yard/Inch alongside the existing Meter unit so length-based
// products (wire, cable, conduit) can be sold in the customer's preferred
// unit while stock/pricing stay accurate per meter. Idempotent.
async function ensureLengthUnits({ verbose = true } = {}) {
  const { BaseUnit, Unit } = require('../models/associations');
  const changes = [];

  const [meterBase] = await BaseUnit.findOrCreate({ where: { name: 'Meter' } });

  const definitions = [
    { name: 'Meter', short_name: 'm', operator: '*', operation_value: 1 },
    { name: 'Foot', short_name: 'ft', operator: '*', operation_value: 0.3048 },
    { name: 'Yard', short_name: 'yd', operator: '*', operation_value: 0.9144 },
    { name: 'Inch', short_name: 'in', operator: '*', operation_value: 0.0254 },
  ];

  for (const definition of definitions) {
    const [, created] = await Unit.findOrCreate({
      where: { name: definition.name, base_unit_id: meterBase.id },
      defaults: {
        short_name: definition.short_name,
        operator: definition.operator,
        operation_value: definition.operation_value,
      },
    });
    if (created) changes.push(`added length unit "${definition.name}"`);
  }

  if (verbose && changes.length) changes.forEach((line) => console.log(`[db:migrate] ${line}`));
  return changes;
}

async function migrateSchema(options = {}) {
  const { verbose = true } = options;
  const changes = [];
  changes.push(...await ensureAllIndexes(options));
  changes.push(...await ensureLengthUnits(options));
  if (verbose) console.log(`[db:migrate] completed with ${changes.length} change(s)`);
  return changes;
}

module.exports = {
  migrateSchema,
  ensureAllIndexes,
  ensureLengthUnits,
};
