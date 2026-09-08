const ExcelJS = require('exceljs');
const fs = require('fs/promises');
const path = require('path');
const database = require('../config/db');

const BACKUP_APPLICATION = 'Shanthi Electricals POS';
const BACKUP_FORMAT_VERSION = '2';
const LEGACY_FORMAT_VERSION = '1';
const REBUILDABLE_TABLES = new Set(['purchase_payments']);
const METADATA_SHEET = '_shanthi_backup';
const BACKUP_DIR = process.env.POS_DATA_DIR ? path.join(process.env.POS_DATA_DIR, 'backups') : path.resolve(__dirname, '../../backups');

function modelMappings() {
  return database.modelManager.models.map((model) => ({ table: model.tableName, model })).sort((a, b) => a.table.localeCompare(b.table));
}

async function listDatabaseTables() { return modelMappings().map((entry) => entry.table); }

function sheetNameFor(table, usedNames) {
  const cleaned = String(table).replace(/[\\/?*\[\]:]/g, '_').slice(0, 31) || 'collection';
  let candidate = cleaned; let suffix = 1;
  while (usedNames.has(candidate.toLowerCase())) { const extra = `_${suffix++}`; candidate = `${cleaned.slice(0, 31 - extra.length)}${extra}`; }
  usedNames.add(candidate.toLowerCase()); return candidate;
}

function exportValue(value) {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value.toISOString();
  if (Buffer.isBuffer(value)) return `__BASE64__:${value.toString('base64')}`;
  if (typeof value === 'object') return `__JSON__:${JSON.stringify(value)}`;
  return value;
}

function importCellValue(value) {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'object') {
    if (Object.prototype.hasOwnProperty.call(value, 'result')) return importCellValue(value.result);
    if (Object.prototype.hasOwnProperty.call(value, 'text')) return value.text;
    if (Array.isArray(value.richText)) return value.richText.map((part) => part.text).join('');
    return JSON.stringify(value);
  }
  if (typeof value === 'string' && value.startsWith('__BASE64__:')) return Buffer.from(value.slice('__BASE64__:'.length), 'base64');
  if (typeof value === 'string' && value.startsWith('__JSON__:')) {
    try { return JSON.parse(value.slice('__JSON__:'.length)); } catch { return value.slice('__JSON__:'.length); }
  }
  return value;
}

async function buildBackupWorkbook(options = {}) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = BACKUP_APPLICATION; workbook.company = 'Shanthi Electricals'; workbook.created = new Date();
  const usedNames = new Set([METADATA_SHEET.toLowerCase()]);
  const tableSheets = modelMappings().map(({ table }) => ({ table, sheet: sheetNameFor(table, usedNames) }));
  const metadata = workbook.addWorksheet(METADATA_SHEET);
  metadata.columns = [{ header: 'Key', key: 'key', width: 26 }, { header: 'Value', key: 'value', width: 90 }];
  metadata.addRows([
    { key: 'application', value: BACKUP_APPLICATION }, { key: 'format_version', value: BACKUP_FORMAT_VERSION },
    { key: 'database_engine', value: 'MongoDB' }, { key: 'created_at', value: new Date().toISOString() },
    { key: 'database', value: database.mongoose.connection.name || '' }, { key: 'table_count', value: tableSheets.length },
    { key: 'table_map', value: JSON.stringify(tableSheets) },
    { key: 'warning', value: 'Contains complete business data and password hashes. Store securely.' },
  ]);
  metadata.getRow(1).font = { bold: true }; metadata.views = [{ state: 'frozen', ySplit: 1 }];
  for (const mapping of tableSheets) {
    const model = modelMappings().find((entry) => entry.table === mapping.table).model;
    const rows = await model.collection.find({}, options.transaction?.session ? { session: options.transaction.session } : {}).toArray();
    const columns = ['id', ...Object.keys(model.rawAttributes), 'created_at', 'updated_at'];
    const sheet = workbook.addWorksheet(mapping.sheet);
    sheet.columns = columns.map((column) => ({ header: column, key: column, width: Math.min(Math.max(column.length + 2, 12), 32) }));
    sheet.getRow(1).font = { bold: true }; sheet.views = [{ state: 'frozen', ySplit: 1 }];
    for (const row of rows) sheet.addRow(Object.fromEntries(columns.map((column) => [column, exportValue(row[column])])));
  }
  return { workbook, tables: tableSheets.map((row) => row.table), tableSheets };
}

async function backupBuffer(options = {}) {
  const { workbook, tables } = await buildBackupWorkbook(options);
  return { buffer: Buffer.from(await workbook.xlsx.writeBuffer()), tables };
}

function metadataFromWorkbook(workbook) {
  const sheet = workbook.getWorksheet(METADATA_SHEET);
  if (!sheet) throw new Error('This is not a Shanthi Electricals backup workbook. Metadata sheet is missing.');
  const metadata = {};
  sheet.eachRow((row, number) => { if (number > 1 && row.getCell(1).value) metadata[String(row.getCell(1).value)] = importCellValue(row.getCell(2).value); });
  if (metadata.application !== BACKUP_APPLICATION) throw new Error('Backup application identifier is invalid.');
  if (![BACKUP_FORMAT_VERSION, LEGACY_FORMAT_VERSION].includes(String(metadata.format_version))) throw new Error(`Unsupported backup format version: ${metadata.format_version}`);
  return metadata;
}

function rowsFromWorksheet(sheet) {
  const headers = []; sheet.getRow(1).eachCell({ includeEmpty: false }, (cell, column) => { headers[column - 1] = String(cell.value || '').trim(); });
  const rows = [];
  sheet.eachRow({ includeEmpty: false }, (row, number) => {
    if (number === 1) return;
    const output = {}; let populated = false;
    headers.forEach((header, index) => { if (!header) return; const value = importCellValue(row.getCell(index + 1).value); output[header] = value; if (value !== null && value !== '') populated = true; });
    if (populated) rows.push(output);
  });
  return rows;
}

async function parseBackupBuffer(buffer) {
  const workbook = new ExcelJS.Workbook(); await workbook.xlsx.load(buffer);
  const metadata = metadataFromWorkbook(workbook);
  let tableMap; try { tableMap = JSON.parse(metadata.table_map || '[]'); } catch { throw new Error('Backup table map is invalid.'); }
  if (!Array.isArray(tableMap) || !tableMap.length) throw new Error('Backup contains no database collections.');
  return { metadata, tables: tableMap.map((mapping) => {
    const sheet = workbook.getWorksheet(mapping.sheet); if (!sheet) throw new Error(`Backup worksheet is missing for collection ${mapping.table}.`);
    return { table: mapping.table, rows: rowsFromWorksheet(sheet) };
  }) };
}

async function saveSafetyBackup() {
  await fs.mkdir(BACKUP_DIR, { recursive: true }); const { buffer } = await backupBuffer();
  const filename = `pre-restore-${new Date().toISOString().replace(/[:.]/g, '-')}.xlsx`; const filepath = path.join(BACKUP_DIR, filename);
  await fs.writeFile(filepath, buffer); return { filename, filepath };
}

async function restoreBackup(buffer, options = {}) {
  const parsed = await parseBackupBuffer(buffer); const mappings = modelMappings(); const currentTables = new Set(mappings.map((row) => row.table));
  const unknown = parsed.tables.filter((row) => !currentTables.has(row.table)).map((row) => row.table);
  if (unknown.length) throw new Error(`Backup contains collections that do not exist: ${unknown.join(', ')}`);
  const backupTables = new Set(parsed.tables.map((row) => row.table));
  const missing = [...currentTables].filter((table) => !backupTables.has(table) && !REBUILDABLE_TABLES.has(table));
  if (missing.length) throw new Error(`Backup is incomplete. Missing collections: ${missing.join(', ')}`);
  const safetyBackup = options.skipSafetyBackup ? null : await saveSafetyBackup(); const restored = [];
  await database.transaction(async (transaction) => {
    for (const { model } of mappings) await model.collection.deleteMany({}, { session: transaction.session });
    for (const entry of parsed.tables) {
      const model = mappings.find((row) => row.table === entry.table).model;
      const rows = entry.rows.map((row) => { const result = { ...row }; delete result._id; return result; });
      if (rows.length) await model.collection.insertMany(rows, { session: transaction.session, ordered: true });
      await database.resetCounter(entry.table, Math.max(0, ...rows.map((row) => Number(row.id || 0))), transaction.session);
      restored.push({ table: entry.table, rows: rows.length });
    }
    if (!backupTables.has('purchase_payments')) {
      const purchaseModel = mappings.find((row) => row.table === 'purchases').model;
      const paymentModel = mappings.find((row) => row.table === 'purchase_payments').model;
      const purchases = await purchaseModel.collection.find({ paid_amount: { $gt: 0 } }, { session: transaction.session }).toArray();
      let rebuilt = 0;
      for (const purchase of purchases) {
        await paymentModel.create({
          purchase_id: purchase.id, amount: purchase.paid_amount,
          paying_method: purchase.payment_type || 'cash', paid_on: purchase.date,
          note: 'Rebuilt while importing a legacy backup', created_by: purchase.created_by || null,
        }, { transaction });
        rebuilt += 1;
      }
      restored.push({ table: 'purchase_payments', rows: rebuilt, rebuilt: true });
    }
  });
  return { metadata: parsed.metadata, restored, safetyBackup };
}

module.exports = { BACKUP_APPLICATION, BACKUP_FORMAT_VERSION, METADATA_SHEET, BACKUP_DIR, listDatabaseTables, backupBuffer, parseBackupBuffer, restoreBackup };
