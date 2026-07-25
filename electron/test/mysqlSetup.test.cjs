const test = require('node:test');
const assert = require('node:assert/strict');
const {
  normalizePort,
  validateDatabaseName,
  validateUsername,
  normalizeServerConfig,
  quoteIdentifier,
  isLocalHost,
  formatMysqlError,
} = require('../services/mysqlSetup.cjs');

test('normalizes MySQL port and connection fields', () => {
  assert.equal(normalizePort('3307'), 3307);
  assert.deepEqual(
    normalizeServerConfig({ host: ' 127.0.0.1 ', port: '3306', username: ' root ', password: 'secret' }),
    { host: '127.0.0.1', port: 3306, username: 'root', password: 'secret' }
  );
});

test('rejects unsafe database and user names', () => {
  assert.equal(validateDatabaseName('electro_pos-2'), 'electro_pos-2');
  assert.equal(validateUsername('shanthi.pos_user'), 'shanthi.pos_user');
  assert.throws(() => validateDatabaseName('electro pos'), /Database name/);
  assert.throws(() => validateUsername("root'@'%"), /MySQL username/);
  assert.throws(() => normalizePort(70000), /between 1 and 65535/);
});

test('quotes database identifiers and identifies local hosts', () => {
  assert.equal(quoteIdentifier('pos`data'), '`pos``data`');
  assert.equal(isLocalHost('LOCALHOST'), true);
  assert.equal(isLocalHost('192.168.1.20'), false);
});

test('converts common MySQL errors into setup guidance', () => {
  assert.match(
    formatMysqlError({ code: 'ECONNREFUSED' }, { host: '127.0.0.1', port: 3306 }),
    /not running or cannot be reached/
  );
  assert.match(formatMysqlError({ code: 'ER_ACCESS_DENIED_ERROR' }), /username or password/);
  assert.match(
    formatMysqlError({ code: 'ER_BAD_DB_ERROR' }, { database: 'electro_pos' }),
    /electro_pos/
  );
  assert.match(
    formatMysqlError({ code: 'ER_SPECIFIC_ACCESS_DENIED_ERROR' }),
    /cannot create or grant/
  );
});
