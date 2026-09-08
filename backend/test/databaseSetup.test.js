const test = require('node:test');
const assert = require('node:assert/strict');
const { formatDatabaseError } = require('../src/config/databaseSetup');
const {
  formatMongoError,
  parseMongoUri,
  publicMongoTarget,
  redactSecrets,
} = require('../src/config/mongoConnection');

test('formats selection errors with actionable underlying details', () => {
  assert.match(formatDatabaseError({ name: 'MongoServerSelectionError' }), /selection timed out/i);
  assert.match(formatDatabaseError({ name: 'MongooseServerSelectionError' }), /selection timed out/i);
  assert.match(formatDatabaseError({ message: 'connect ECONNREFUSED 127.0.0.1:27017' }), /refused the connection/i);
  assert.match(formatMongoError({ message: 'querySrv ENOTFOUND _mongodb._tcp.bad.test' }, 'mongodb+srv://u:p@bad.test/shop'), /DNS lookup failed.*bad\.test\/shop/i);
  assert.match(formatMongoError({ message: 'self signed certificate in certificate chain' }, 'mongodb://db.test/shop'), /TLS negotiation failed/i);
  assert.match(formatMongoError({ code: 18, message: 'Authentication failed' }, 'mongodb://u:p@db.test/shop'), /rejected the credentials/i);
});

test('parses multi-host and SRV connection targets without exposing credentials', () => {
  assert.deepEqual(parseMongoUri('mongodb://u:p@one:27017,two:27017/shop?replicaSet=rs0'), {
    uri: 'mongodb://u:p@one:27017,two:27017/shop?replicaSet=rs0',
    scheme: 'mongodb',
    hosts: 'one:27017,two:27017',
    database: 'shop',
  });
  assert.equal(publicMongoTarget('mongodb+srv://u:p@cluster.test/electro_pos?retryWrites=true'), 'mongodb+srv://cluster.test/electro_pos');
  assert.doesNotMatch(redactSecrets('failed mongodb://secret:password@db.test/shop?x=1'), /secret|password/);
});

test('rejects common invalid MongoDB URI configurations before connecting', () => {
  assert.throws(() => parseMongoUri('mysql://localhost/shop'), /mongodb:\/\//i);
  assert.throws(() => parseMongoUri('mongodb+srv://cluster.test:27017/shop'), /must not specify a port/i);
  assert.throws(() => parseMongoUri('mongodb+srv://user:<password>@cluster.test/shop'), /placeholder/i);
  assert.throws(() => parseMongoUri('mongodb://db.test/bad%ZZ'), /percent encoding/i);
});
