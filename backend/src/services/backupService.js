const ExcelJS = require('exceljs');
const fs = require('fs/promises');
const path = require('path');
const sequelize = require('../config/db');

const BACKUP_APPLICATION = 'Shanthi Electricals POS';
const BACKUP_FORMAT_VERSION = '1';
const METADATA_SHEET = '_shanthi_backup';
const BACKUP_DIR = process.env.POS_DATA_DIR
  ? path.join(process.env.POS_DATA_DIR, 'backups')
  : path.resolve(__dirname, '../../backups');

function mysqlTableNames(rows) {
  return rows
    .map((row) => Object.values(row).find((value) => typeof value === 'string' && !['BASE TABLE', 'VIEW'].includes(value.toUpperCase())))
    .filter((value) => typeof value === 'string' && value.length > 0);
}

async function listDatabaseTables(options = {}) {
  const [rows] = await sequelize.query("SHOW FULL TABLES WHERE Table_type = 'BASE TABLE'", options);
  return mysqlTableNames(rows).sort((a, b) => a.localeCompare(b));
}

function sheetNameFor(table, usedNames) {
  const cleaned = String(table).replace(/[\\/?*\[\]:]/g, '_').slice(0, 31) || 'table';
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
  if (value instanceof Date) return value.toISOString().slice(0, 23).replace('T', ' ');
  if (typeof value === 'object') {
    if (Object.prototype.hasOwnProperty.call(value, 'result')) return importCellValue(value.result);
    if (Object.prototype.hasOwnProperty.call(value, 'text')) return value.text;
    if (Array.isArray(value.richText)) return value.richText.map((part) => part.text).join('');
    return JSON.stringify(value);
  }
  if (typeof value === 'string' && value.startsWith('__BASE64__:')) {
    return Buffer.from(value.slice('__BASE64__:'.length), 'base64');
  }
  if (typeof value === 'string' && value.startsWith('__JSON__:')) {
    return value.slice('__JSON__:'.length);
  }
  return value;
}

async function buildBackupWorkbook(options = {}) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = BACKUP_APPLICATION;
  workbook.company = 'Shanthi Electricals';
  workbook.created = new Date();
  workbook.modified = new Date();
  workbook.properties.date1904 = false;

  const tables = await listDatabaseTables(options);
  const usedNames = new Set([METADATA_SHEET.toLowerCase()]);
  const tableSheets = [];

  for (const table of tables) {
    const sheetName = sheetNameFor(table, usedNames);
    tableSheets.push({ table, sheet: sheetName });
  }

  const metadata = workbook.addWorksheet(METADATA_SHEET, { state: 'visible' });
  metadata.columns = [{ header: 'Key', key: 'key', width: 26 }, { header: 'Value', key: 'value', width: 90 }];
  metadata.addRows([
    { key: 'application', value: BACKUP_APPLICATION },
    { key: 'format_version', value: BACKUP_FORMAT_VERSION },
    { key: 'created_at', value: new Date().toISOString() },
    { key: 'database', value: process.env.DB_NAME || '' },
    { key: 'table_count', value: tables.length },
    { key: 'table_map', value: JSON.stringify(tableSheets) },
    { key: 'warning', value: 'Contains complete business data and password hashes. Store securely.' },
  ]);
  metadata.getRow(1).font = { bold: true };
  metadata.views = [{ state: 'frozen', ySplit: 1 }];

  for (const mapping of tableSheets) {
    const quotedTable = sequelize.getQueryInterface().quoteTable(mapping.table);
    const [rows] = await sequelize.query(`SELECT * FROM ${quotedTable}`, options);
    const description = await sequelize.getQueryInterface().describeTable(mapping.table, options);
    const columns = Object.keys(description);
    const worksheet = workbook.addWorksheet(mapping.sheet);
    worksheet.views = [{ state: 'frozen', ySplit: 1 }];
    worksheet.columns = columns.map((column) => ({ header: column, key: column, width: Math.min(Math.max(column.length + 2, 12), 32) }));
    worksheet.getRow(1).font = { bold: true };
    worksheet.autoFilter = columns.length ? { from: 'A1', to: `${worksheet.getColumn(columns.length).letter}1` } : undefined;

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
  const buffer = Buffer.from(await workbook.xlsx.writeBuffer());
  return { buffer, tables };
}

function metadataFromWorkbook(workbook) {
  const worksheet = workbook.getWorksheet(METADATA_SHEET);
  if (!worksheet) throw new Error('This is not a Shanthi Electricals backup workbook. Metadata sheet is missing.');
  const metadata = {};
  worksheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    const key = row.getCell(1).value;
    const value = row.getCell(2).value;
    if (key) metadata[String(key)] = importCellValue(value);
  });
  if (metadata.application !== BACKUP_APPLICATION) throw new Error('Backup application identifier is invalid.');
  if (String(metadata.format_version) !== BACKUP_FORMAT_VERSION) throw new Error(`Unsupported backup format version: ${metadata.format_version}`);
  return metadata;
}

function rowsFromWorksheet(worksheet) {
  const headers = [];
  worksheet.getRow(1).eachCell({ includeEmpty: false }, (cell, colNumber) => {
    headers[colNumber - 1] = String(cell.value || '').trim();
  });
  if (!headers.some(Boolean)) return [];

  const rows = [];
  worksheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (rowNumber === 1) return;
    const output = {};
    let hasValue = false;
    headers.forEach((header, index) => {
      if (!header) return;
      const raw = row.getCell(index + 1).value;
      const value = importCellValue(raw);
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
  try {
    tableMap = JSON.parse(metadata.table_map || '[]');
  } catch {
    throw new Error('Backup table map is invalid.');
  }
  if (!Array.isArray(tableMap) || tableMap.length === 0) throw new Error('Backup contains no database tables.');
  const tables = tableMap.map((mapping) => {
    if (!mapping || typeof mapping.table !== 'string' || typeof mapping.sheet !== 'string') throw new Error('Backup table map contains an invalid entry.');
    const worksheet = workbook.getWorksheet(mapping.sheet);
    if (!worksheet) throw new Error(`Backup worksheet is missing for table ${mapping.table}.`);
    return { table: mapping.table, rows: rowsFromWorksheet(worksheet) };
  });
  return { metadata, tables };
}

async function saveSafetyBackup() {
  await fs.mkdir(BACKUP_DIR, { recursive: true });
  const { buffer } = await backupBuffer();
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = `pre-restore-${stamp}.xlsx`;
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
  if (unknownTables.length) throw new Error(`Backup contains tables that do not exist in this database: ${unknownTables.join(', ')}`);

  // A full restore must be all-or-nothing. Refuse edited, partial, or schema-incompatible
  // workbooks instead of silently leaving a mixture of old and restored records.
  const missingTables = currentTableList.filter((table) => !backupTables.has(table));
  if (missingTables.length) {
    throw new Error(`Backup is incomplete for the current database schema. Missing tables: ${missingTables.join(', ')}`);
  }

  const safetyBackup = options.skipSafetyBackup ? null : await saveSafetyBackup();
  const restored = [];

  await sequelize.transaction(async (transaction) => {
    await sequelize.query('SET FOREIGN_KEY_CHECKS = 0', { transaction });
    try {
      // Delete children and parents safely while FK checks are disabled.
      for (const entry of [...parsed.tables].reverse()) {
        const quoted = sequelize.getQueryInterface().quoteTable(entry.table);
        await sequelize.query(`DELETE FROM ${quoted}`, { transaction });
      }

      for (const entry of parsed.tables) {
        if (entry.rows.length) {
          await sequelize.getQueryInterface().bulkInsert(entry.table, entry.rows, { transaction });
        }
        restored.push({ table: entry.table, rows: entry.rows.length });
      }
    } finally {
      await sequelize.query('SET FOREIGN_KEY_CHECKS = 1', { transaction });
    }
  });

  return { metadata: parsed.metadata, restored, safetyBackup };
}

module.exports = {
  BACKUP_APPLICATION,
  BACKUP_FORMAT_VERSION,
  METADATA_SHEET,
  BACKUP_DIR,
  listDatabaseTables,
  backupBuffer,
  parseBackupBuffer,
  restoreBackup,
};
