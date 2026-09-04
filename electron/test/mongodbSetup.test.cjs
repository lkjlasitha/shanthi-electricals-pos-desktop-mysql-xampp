const test = require('node:test');
const assert = require('node:assert/strict');
const { validateDatabaseName, normalizeMongoConfig, formatMongoError } = require('../services/mongodbSetup.cjs');

test('normalizes MongoDB URI and database name', () => {
  assert.deepEqual(normalizeMongoConfig({ uri: ' mongodb://localhost:27017/?replicaSet=rs0 ', database: ' electro_pos ' }), {
    uri: 'mongodb://localhost:27017/?replicaSet=rs0', database: 'electro_pos',
  });
});

test('validates MongoDB connection fields', () => {
  assert.throws(() => normalizeMongoConfig({ uri: 'http://localhost', database: 'electro_pos' }), /MongoDB URI/);
  assert.throws(() => validateDatabaseName('bad name'), /Database name/);
});

test('converts common MongoDB errors into setup guidance', () => {
  assert.match(formatMongoError({ code: 18, message: 'Authentication failed' }), /username or password/);
  assert.match(formatMongoError({ message: 'server selection timed out' }), /could not be reached/);
});
