const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeConfig, publicServer, formatMongoError } = require('../services/mongoSetup.cjs');

test('accepts standard and SRV MongoDB URIs', () => {
  assert.equal(normalizeConfig({ uri: 'mongodb://127.0.0.1:27017/electro_pos' }).uri, 'mongodb://127.0.0.1:27017/electro_pos');
  assert.equal(normalizeConfig({ uri: 'mongodb+srv://user:pass@example.test/electro_pos' }).uri, 'mongodb+srv://user:pass@example.test/electro_pos');
  assert.throws(() => normalizeConfig({ uri: 'mysql://localhost/shop' }), /MongoDB/);
});

test('returns only non-secret server information', () => {
  assert.deepEqual(publicServer('mongodb://secret:password@db.local:27017/shop'), { engine: 'MongoDB', host: 'db.local:27017', database: 'shop' });
});

test('formats MongoDB connection failures', () => {
  assert.match(formatMongoError({ name: 'MongoServerSelectionError' }), /selection timed out/i);
  assert.match(formatMongoError({ name: 'MongooseServerSelectionError' }), /selection timed out/i);
  assert.match(formatMongoError({ code: 18 }), /credentials/i);
  assert.match(formatMongoError({ message: 'querySrv ENOTFOUND _mongodb._tcp.cluster.test' }), /DNS lookup failed/i);
});
