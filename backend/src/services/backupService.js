const ExcelJS = require('exceljs');
const fs = require('fs/promises');
const path = require('path');
const database = require('../config/db');

const BACKUP_APPLICATION = 'Shanthi Electricals POS';
const BACKUP_FORMAT_VERSION = '2';
const ACCEPTED_FORMAT_VERSIONS = new Set(['1', '2']);
const REBUILDABLE_TABLES = new Set(['purchase_payments']);
const METADATA_SHEET = '_shanthi_backup';
const BACKUP_DIR = process.env.POS_DATA_DIR ? path.join(process.env.POS_DATA_DIR, 'backups') : path.resolve(__dirname, '../../backups');

function modelByCollection() {
  return new Map(database.modelManager.models.map((model) => [model.tableName, model]));
}

async function listDatabaseTables() {
  return [...modelByCollection().keys()].sort((a, b) => a.localeCompare(b));
}

function sheetNameFor(table, usedNames) {
  const cleaned = String(table).replace(/[\\/?*\[\]:]/g, '_').slice(0, 31) || 'collection';
  let candidate = cleaned;
  let suffix = 1;
  while (usedNames.has(candidate.toLowerCase())) {
    const extra = `_${suffix++}`;
    candidate = `${cleaned.slice(0, 31 - extra.length)}${extra}`;
  }
  usedNames.add(candidate.toLowerCase());
  return candidate;
}

function exportValue(value) {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value.toISOString();
  if (Buffer.isBuffer(value)) return `__BASE64__:${value.toString('base64')}`;
  if (typeof value === 'object') return `__JSON__:${JSON.stringify(value)}`;
  if (typeof value === 'bigint') return value.toString();
  return value;
}

function importCellValue(value) {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value;
  if (typeof value === 'object') {
    if (Object.prototype.hasOwnProperty.call(value, 'result')) return importCellValue(value.result);
    if (Object.prototype.hasOwnProperty.call(value, 'text')) return value.text;
    if (Array.isArray(value.richText)) return value.richText.map((part) => part.text).join('');
    return JSON.stringify(value);
  }
  if (typeof value === 'string' && value.startsWith('__BASE64__:')) return Buffer.from(value.slice('__BASE64__:'.length), 'base64');
  if (typeof value === 'string' && value.startsWith('__JSON__:')) {
    const json = value.slice('__JSON__:'.length);
    try { return JSON.parse(json); } catch { return json; }
  }
  return value;
}

async function buildBackupWorkbook(options = {}) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = BACKUP_APPLICATION;
  workbook.company = 'Shanthi Electricals';
  workbook.created = new Date();
  workbook.modified = new Date();
  const tables = await listDatabaseTables();
  const usedNames = new Set([METADATA_SHEET.toLowerCase()]);
  const tableSheets = tables.map((table) => ({ table, sheet: sheetNameFor(table, usedNames) }));
  const metadata = workbook.addWorksheet(METADATA_SHEET, { state: 'visible' });
  metadata.columns = [{ header: 'Key', key: 'key', width: 26 }, { header: 'Value', key: 'value', width: 90 }];
  metadata.addRows([
    { key: 'application', value: BACKUP_APPLICATION },
    { key: 'format_version', value: BACKUP_FORMAT_VERSION },
    { key: 'database_engine', value: 'MongoDB' },
    { key: 'created_at', value: new Date().toISOString() },
    { key: 'database', value: process.env.MONGODB_DB || '' },
    { key: 'table_count', value: tables.length },
    { key: 'table_map', value: JSON.stringify(tableSheets) },
    { key: 'warning', value: 'Contains complete business data and password hashes. Store securely.' },
  ]);
  metadata.getRow(1).font = { bold: true };
  metadata.views = [{ state: 'frozen', ySplit: 1 }];
  const models = modelByCollection();
  for (const mapping of tableSheets) {
    const model = models.get(mapping.table);
    const session = options.transaction?.session;
    const rows = await model._collection().find({}, session ? { session } : {}).sort({ id: 1 }).toArray();
    const columns = ['id', ...Object.keys(model.attributes).filter((field) => field !== 'id'), 'created_at', 'updated_at'];
    const worksheet = workbook.addWorksheet(mapping.sheet);
    worksheet.views = [{ state: 'frozen', ySplit: 1 }];
    worksheet.columns = columns.map((column) => ({ header: column, key: column, width: Math.min(Math.max(column.length + 2, 12), 32) }));
    worksheet.getRow(1).font = { bold: true };
    worksheet.autoFilter = { from: 'A1', to: `${worksheet.getColumn(columns.length).letter}1` };
    for (const row of rows) {
      const output = {};
      for (const column of columns) output[column] = exportValue(row[column]);
      worksheet.addRow(output);
    }
  }
  return { workbook, tables, tableSheets };
}

async function backupBuffer(options = {}) {
  const { workbook, tables } = await buildBackupWorkbook(options);
  return { buffer: Buffer.from(await workbook.xlsx.writeBuffer()), tables };
}

function metadataFromWorkbook(workbook) {
  const worksheet = workbook.getWorksheet(METADATA_SHEET);
  if (!worksheet) throw new Error('This is not a Shanthi Electricals backup workbook. Metadata sheet is missing.');
  const metadata = {};
  worksheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    const key = row.getCell(1).value;
    if (key) metadata[String(key)] = importCellValue(row.getCell(2).value);
  });
  if (metadata.application !== BACKUP_APPLICATION) throw new Error('Backup application identifier is invalid.');
  if (!ACCEPTED_FORMAT_VERSIONS.has(String(metadata.format_version))) throw new Error(`Unsupported backup format version: ${metadata.format_version}`);
  return metadata;
}

function rowsFromWorksheet(worksheet) {
  const headers = [];
  worksheet.getRow(1).eachCell({ includeEmpty: false }, (cell, column) => { headers[column - 1] = String(cell.value || '').trim(); });
  const rows = [];
  worksheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (rowNumber === 1) return;
    const output = {};
    let hasValue = false;
    headers.forEach((header, index) => {
      if (!header) return;
      const value = importCellValue(row.getCell(index + 1).value);
      output[header] = value;
      if (value !== null && value !== '') hasValue = true;
    });
    if (hasValue) rows.push(output);
  });
  return rows;
}

async function parseBackupBuffer(buffer) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  const metadata = metadataFromWorkbook(workbook);
  let tableMap;
  try { tableMap = JSON.parse(metadata.table_map || '[]'); } catch { throw new Error('Backup table map is invalid.'); }
  if (!Array.isArray(tableMap) || !tableMap.length) throw new Error('Backup contains no database collections.');
  const tables = tableMap.map((mapping) => {
    if (!mapping || typeof mapping.table !== 'string' || typeof mapping.sheet !== 'string') throw new Error('Backup table map contains an invalid entry.');
    const worksheet = workbook.getWorksheet(mapping.sheet);
    if (!worksheet) throw new Error(`Backup worksheet is missing for collection ${mapping.table}.`);
    return { table: mapping.table, rows: rowsFromWorksheet(worksheet) };
  });
  return { metadata, tables };
}

async function saveSafetyBackup() {
  await fs.mkdir(BACKUP_DIR, { recursive: true });
  const { buffer } = await backupBuffer();
  const filename = `pre-restore-${new Date().toISOString().replace(/[:.]/g, '-')}.xlsx`;
  const filepath = path.join(BACKUP_DIR, filename);
  await fs.writeFile(filepath, buffer);
  return { filename, filepath };
}

async function restoreBackup(buffer, options = {}) {
  const parsed = await parseBackupBuffer(buffer);
  const currentTableList = await listDatabaseTables();
  const currentTables = new Set(currentTableList);
  const backupTables = new Set(parsed.tables.map((entry) => entry.table));
  const unknownTables = parsed.tables.filter((entry) => !currentTables.has(entry.table)).map((entry) => entry.table);
  if (unknownTables.length) throw new Error(`Backup contains collections that do not exist in this application: ${unknownTables.join(', ')}`);
  const missingTables = currentTableList.filter((table) => !backupTables.has(table) && !REBUILDABLE_TABLES.has(table));
  if (missingTables.length) throw new Error(`Backup is incomplete for the current database schema. Missing collections: ${missingTables.join(', ')}`);
  const safetyBackup = options.skipSafetyBackup ? null : await saveSafetyBackup();
  const restored = [];
  const models = modelByCollection();
  await database.transaction(async (transaction) => {
    const session = transaction.session;
    for (const table of currentTableList) await models.get(table)._collection().deleteMany({}, { session });
    for (const entry of parsed.tables) {
      const model = models.get(entry.table);
      const documents = entry.rows.map((row) => {
        const normalized = model._coerce(row);
        const id = Number(normalized.id);
        if (!Number.isInteger(id) || id < 1) throw new Error(`Collection ${entry.table} contains an invalid id.`);
        if (normalized.created_at && !(normalized.created_at instanceof Date)) normalized.created_at = new Date(normalized.created_at);
        if (normalized.updated_at && !(normalized.updated_at instanceof Date)) normalized.updated_at = new Date(normalized.updated_at);
        return { ...normalized, id, _id: id };
      });
      if (documents.length) await model._collection().insertMany(documents, { session, ordered: true });
      restored.push({ table: entry.table, rows: documents.length });
    }
  });
  const { migrateSchema } = require('../config/schemaMigrator');
  await migrateSchema({ verbose: false });
  return { metadata: parsed.metadata, restored, safetyBackup };
}

module.exports = { BACKUP_APPLICATION, BACKUP_FORMAT_VERSION, METADATA_SHEET, BACKUP_DIR, listDatabaseTables, backupBuffer, parseBackupBuffer, restoreBackup };
