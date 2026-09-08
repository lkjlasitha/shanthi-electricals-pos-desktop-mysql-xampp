const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { parseMongoDnsServers, readEnvironmentFile, selectEnvironmentSource } = require('../src/config/environment');

test('validates an optional Node MongoDB DNS override', () => {
  assert.deepEqual(parseMongoDnsServers('8.8.8.8, 1.1.1.1,8.8.8.8'), ['8.8.8.8', '1.1.1.1']);
  assert.deepEqual(parseMongoDnsServers(''), []);
  assert.throws(() => parseMongoDnsServers('dns.example.com'), /invalid IP address/i);
});

test('uses deterministic MongoDB environment precedence', () => {
  assert.equal(selectEnvironmentSource('MONGODB_URI', new Set(['MONGODB_URI']), { MONGODB_URI: 'backend' }, { MONGODB_URI: 'root' }), 'process environment');
  assert.equal(selectEnvironmentSource('MONGODB_URI', new Set(), { MONGODB_URI: 'backend' }, { MONGODB_URI: 'root' }), 'backend/.env');
  assert.equal(selectEnvironmentSource('MONGODB_URI', new Set(), {}, { MONGODB_URI: 'root' }), 'project-root .env');
  assert.equal(selectEnvironmentSource('MONGODB_URI', new Set(), {}, {}), 'built-in local default');
});

test('detects an unquoted hash that dotenv would treat as a comment', () => {
  const directory = fs.mkdtempSync(path.join(__dirname, 'pos-env-'));
  const file = path.join(directory, 'sample.env');
  try {
    fs.writeFileSync(file, 'MONGODB_URI=mongodb+srv://user:pa#ss@cluster.test/shop\n');
    const result = readEnvironmentFile(file);
    assert.equal(result.parsed.MONGODB_URI, 'mongodb+srv://user:pa');
    assert.match(result.warnings[0], /unquoted #/i);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('accepts a quoted URI with a percent-encoded password', () => {
  const directory = fs.mkdtempSync(path.join(__dirname, 'pos-env-'));
  const file = path.join(directory, 'sample.env');
  try {
    fs.writeFileSync(file, 'MONGODB_URI="mongodb+srv://user:pa%23ss@cluster.test/shop"\n');
    const result = readEnvironmentFile(file);
    assert.equal(result.parsed.MONGODB_URI, 'mongodb+srv://user:pa%23ss@cluster.test/shop');
    assert.deepEqual(result.warnings, []);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
