const test = require('node:test');
const assert = require('node:assert/strict');
const ExcelJS = require('exceljs');
require('../src/models/associations');
const { parseBackupBuffer, METADATA_SHEET } = require('../src/services/backupService');

test('MongoDB restore parser accepts a legacy format-v1 workbook and decodes JSON', async () => {
  const workbook = new ExcelJS.Workbook();
  const metadata = workbook.addWorksheet(METADATA_SHEET);
  metadata.addRow(['Key', 'Value']);
  metadata.addRow(['application', 'Shanthi Electricals POS']);
  metadata.addRow(['format_version', '1']);
  metadata.addRow(['table_map', JSON.stringify([{ table: 'settings', sheet: 'settings' }])]);
  const settings = workbook.addWorksheet('settings');
  settings.addRow(['id', 'key', 'value']);
  settings.addRow([1, 'sample', '__JSON__:{"enabled":true}']);
  const parsed = await parseBackupBuffer(Buffer.from(await workbook.xlsx.writeBuffer()));
  assert.equal(parsed.metadata.format_version, '1');
  assert.deepEqual(parsed.tables[0].rows[0].value, { enabled: true });
});
