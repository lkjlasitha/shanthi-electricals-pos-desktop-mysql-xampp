const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

function loadMigratorWith(fakeSequelize) {
  const dbPath = require.resolve('../src/config/db');
  const migratorPath = require.resolve('../src/config/schemaMigrator');

  const oldDb = require.cache[dbPath];
  const oldMigrator = require.cache[migratorPath];
  require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: fakeSequelize };
  delete require.cache[migratorPath];

  const migrator = require(migratorPath);

  if (oldDb) require.cache[dbPath] = oldDb;
  else delete require.cache[dbPath];
  if (oldMigrator) require.cache[migratorPath] = oldMigrator;
  else delete require.cache[migratorPath];

  return migrator;
}

test('model discovery uses Sequelize modelManager when sequelize.models is not enumerable', () => {
  const saleModel = {
    getTableName: () => 'sales',
    getAttributes: () => ({}),
  };
  const fakeSequelize = {
    modelManager: { models: [saleModel] },
    models: Object.create(null),
  };

  const { getRegisteredModels } = loadMigratorWith(fakeSequelize);
  assert.deepEqual(getRegisteredModels(), [saleModel]);
});

test('model discovery removes duplicate model references', () => {
  const productModel = {
    getTableName: () => 'products',
    getAttributes: () => ({}),
  };
  const fakeSequelize = {
    modelManager: { models: [productModel] },
    models: { Product: productModel },
  };

  const { getRegisteredModels } = loadMigratorWith(fakeSequelize);
  assert.deepEqual(getRegisteredModels(), [productModel]);
});

test('critical report columns are added independently of the model registry', async () => {
  const tables = {
    sales: { id: {} },
    purchases: { id: {} },
    sale_items: { id: {} },
    purchase_items: { id: {} },
    main_products: { id: {} },
    products: { id: {} },
    variation_products: { id: {} },
    expenses: { id: {} },
  };
  const added = [];
  const queryInterface = {
    async describeTable(tableName) {
      return { ...tables[tableName] };
    },
    async addColumn(tableName, columnName, definition) {
      tables[tableName][columnName] = definition;
      added.push(`${tableName}.${columnName}`);
    },
  };
  const fakeSequelize = {
    modelManager: { models: [] },
    models: {},
    getQueryInterface: () => queryInterface,
  };

  const { addCriticalColumns } = loadMigratorWith(fakeSequelize);
  await addCriticalColumns({ verbose: false });

  assert.ok(added.includes('sales.grand_total'));
  assert.ok(added.includes('sales.paid_amount'));
  assert.ok(added.includes('purchases.grand_total'));
  assert.ok(added.includes('sale_items.sub_total'));
  assert.ok(added.includes('purchase_items.sub_total'));
  assert.ok(added.includes('expenses.amount'));
  assert.ok(added.includes('main_products.variant_config'));
  assert.ok(added.includes('products.variant_attributes'));
  assert.ok(added.includes('variation_products.main_product_id'));
});
