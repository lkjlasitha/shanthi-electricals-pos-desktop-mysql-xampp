const test = require('node:test');
const assert = require('node:assert/strict');

test('MongoDB facade exposes the operators used by controllers', () => {
  const database = require('../src/config/db');
  for (const key of ['or', 'in', 'ne', 'like', 'between', 'gte', 'lt', 'lte']) assert.equal(typeof database.Op[key], 'symbol');
  assert.equal(database.getDialect(), 'mongodb');
});

test('all application models use MongoDB collections and numeric public ids', () => {
  const database = require('../src/config/db');
  require('../src/models/associations');
  assert.ok(database.modelManager.models.length > 20);
  for (const model of database.modelManager.models) {
    assert.ok(model.collection?.name);
    assert.equal(model.schema.path('id').instance, 'Number');
    for (const field of Object.keys(model.rawAttributes)) {
      assert.ok(model.schema.path(field), `${model.modelName}.${field} is missing from its MongoDB schema`);
    }
    for (const method of ['findAll', 'findOne', 'findByPk', 'findAndCountAll', 'findOrCreate', 'create', 'bulkCreate', 'upsert', 'update', 'destroy', 'count', 'sum']) {
      assert.equal(typeof model[method], 'function', `${model.modelName}.${method}`);
    }
  }
});

test('query compatibility casts array and LIKE filters and keeps association keys in projections', async () => {
  const database = require('../src/config/db');
  const { Product, ProductCategory } = require('../src/models/associations');
  const originalFind = Product.find;
  const originalCategoryFindOne = ProductCategory.findOne;
  let capturedFilter; let capturedProjection = '';
  Product.find = (filter) => {
    capturedFilter = filter;
    const query = {
      select(value) { capturedProjection = value; return this; }, sort() { return this; }, skip() { return this; }, limit() { return this; }, session() { return this; },
      async exec() { return [new Product({ id: 7, name: 'LED Bulb', code: 'LED-7', product_category_id: 3 })]; },
    };
    return query;
  };
  ProductCategory.findOne = async () => new ProductCategory({ id: 3, name: 'Lighting' });
  try {
    const rows = await Product.findAll({
      where: { id: [7, 8], name: { [database.Op.like]: '%bulb%' } },
      attributes: ['id', 'name'], include: [ProductCategory],
    });
    assert.deepEqual(capturedFilter.id, { $in: [7, 8] });
    assert.equal(capturedFilter.name.$regex.test('LED Bulb 9W'), true);
    assert.match(capturedProjection, /product_category_id/);
    assert.equal(rows[0].ProductCategory.name, 'Lighting');
    assert.equal(rows[0].toJSON().ProductCategory.name, 'Lighting');
  } finally { Product.find = originalFind; ProductCategory.findOne = originalCategoryFindOne; }
});

test('grouped reports translate required associations into MongoDB lookup pipelines', async () => {
  const database = require('../src/config/db');
  const { Sale, SaleItem } = require('../src/models/associations');
  const originalAggregate = SaleItem.aggregate; let pipeline;
  SaleItem.aggregate = (value) => ({ session() { pipeline = value; return Promise.resolve([{ product_id: 4, total: 25 }]); } });
  try {
    await SaleItem.findAll({
      where: { product_id: { [database.Op.ne]: null } },
      include: [{ model: Sale, where: { warehouse_id: 2 }, required: true }],
      attributes: ['product_id', [database.fn('SUM', database.col('sub_total')), 'total']],
      group: ['product_id'], raw: true,
    });
    assert.ok(pipeline.some((stage) => stage.$lookup?.from === 'sales'));
    assert.ok(pipeline.some((stage) => stage.$match?.['__joined.warehouse_id'] === 2));
    assert.ok(pipeline.some((stage) => stage.$group?.total));
  } finally { SaleItem.aggregate = originalAggregate; }
});
