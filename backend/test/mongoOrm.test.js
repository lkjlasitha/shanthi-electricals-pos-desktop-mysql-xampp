const test = require('node:test');
const assert = require('node:assert/strict');
const { Op, translateWhere, getMongoConfig } = require('../src/database/mongoOrm');

test('translates POS filters to MongoDB queries', () => {
  const result = translateWhere({
    [Op.or]: [{ name: { [Op.like]: '%wire%' } }, { id: { [Op.in]: ['1', 2] } }],
    date: { [Op.between]: ['2026-01-01', '2026-01-31'] },
  });
  assert.deepEqual(result.date, { $gte: '2026-01-01', $lte: '2026-01-31' });
  assert.deepEqual(result.$or[1].id, { $in: [1, 2] });
  assert.equal(result.$or[0].name.$regex.test('Copper WIRE roll'), true);
});

test('reads database name from MongoDB URI', () => {
  const oldUri = process.env.MONGODB_URI;
  const oldDb = process.env.MONGODB_DB;
  process.env.MONGODB_URI = 'mongodb://localhost:27017/shanthi_test';
  delete process.env.MONGODB_DB;
  assert.equal(getMongoConfig().database, 'shanthi_test');
  if (oldUri === undefined) delete process.env.MONGODB_URI; else process.env.MONGODB_URI = oldUri;
  if (oldDb === undefined) delete process.env.MONGODB_DB; else process.env.MONGODB_DB = oldDb;
});
