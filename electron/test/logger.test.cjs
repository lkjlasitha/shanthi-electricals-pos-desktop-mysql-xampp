const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { MAX_LOG_BYTES, rotateLog } = require('../services/logger.cjs');

test('desktop logger rotates a large log instead of growing without limit', () => {
  const directory = fs.mkdtempSync(path.join(__dirname, 'logger-'));
  const log = path.join(directory, 'desktop.log');
  try {
    fs.writeFileSync(log, '');
    fs.truncateSync(log, MAX_LOG_BYTES);
    rotateLog(log);
    assert.equal(fs.existsSync(log), false);
    assert.equal(fs.statSync(`${log}.1`).size, MAX_LOG_BYTES);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
