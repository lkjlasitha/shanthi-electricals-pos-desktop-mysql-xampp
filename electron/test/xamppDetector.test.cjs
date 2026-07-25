const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {
  candidateXamppDirectories,
  readMysqlPortFromIni,
} = require('../services/xamppDetector.cjs');

test('includes the Windows system drive in XAMPP candidates', () => {
  const rows = candidateXamppDirectories({ SystemDrive: 'Z:' });
  assert.ok(rows.includes('Z:\\xampp'));
  assert.ok(rows.includes('C:\\xampp'));
});

test('reads the configured MySQL port from my.ini', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'shanthi-xampp-'));
  const ini = path.join(directory, 'my.ini');
  fs.writeFileSync(ini, '[client]\nport=3310\n[mysqld]\nport = 3308\n', 'utf8');
  assert.equal(readMysqlPortFromIni(ini), 3308);
  fs.rmSync(directory, { recursive: true, force: true });
});

test('returns null for an unavailable my.ini', () => {
  assert.equal(readMysqlPortFromIni(path.join(os.tmpdir(), 'missing-shanthi-my.ini')), null);
});
