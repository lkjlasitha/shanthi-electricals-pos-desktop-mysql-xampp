const ExcelJS = require('exceljs');
const fs = require('fs/promises');
const path = require('path');
const { mongoose } = require('../config/db');
const { registry, sequelize, ensureSequenceAtLeast, getRawCollection } = require('../config/sequelizeCompat');

const BACKUP_APPLICATION = 'Shanthi Electricals POS';
const BACKUP_FORMAT_VERSION = '2'; // v2 = MongoDB-backed backups (v1 backups were MySQL/Sequelize)
// The counters collection is an implementation detail of id allocation, not
// business data -- it is always rebuilt after a restore from whatever ids
// actually ended up in each collection, rather than being backed up/restored
// itself. Older (format v1 / MySQL-era) backups never had this table at all.
const REBUILDABLE_TABLES = new Set(['counters']);
const METADATA_SHEET = '_shanthi_backup';
const BACKUP_DIR = process.env.POS_DATA_DIR
  ? path.join(process.env.POS_DATA_DIR, 'backups')
  : path.resolve(__dirname, '../../backups');

// The full set of collections the app knows about: every registered model,
// plus the counters collection. Listed this way (rather than only what
// `listCollections` currently reports) so a collection that legitimately has
// zero documents yet still round-trips correctly through backup/restore.
function knownCollectionNames() {
  const names = [...registry.values()].map((model) => model.collectionName);
  names.push('counters');
  return [...new Set(names)].sort((a, b) => a.localeCompare(b));
}

async function listDatabaseTables() {
  return knownCollectionNames();
}

function sheetNameFor(table, usedNames) {
  const cleaned = String(table).replace(/[\\/?*[\]:]/g, '_').slice(0, 31) || 'table';
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
  if (value instanceof Date) return value.toISOString();
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
    try { return JSON.parse(value.slice('__JSON__:'.length)); } catch { return value.slice('__JSON__:'.length); }
  }
  return value;
}

// Stable column order for a collection: the model's own declared fields (so
// the spreadsheet reads naturally) plus id/createdAt/updatedAt, falling back
// to scanning the documents themselves for collections with no registered
// model (only `counters`).
function columnsForCollection(table, sampleDocs) {
  const model = [...registry.values()].find((m) => m.collectionName === table);
  if (model) return ['id', ...Object.keys(model.fields), 'createdAt', 'updatedAt'];
  const columns = new Set();
  for (const doc of sampleDocs) Object.keys(doc).forEach((key) => { if (key !== '_id') columns.add(key); });
  return [...columns];
}

async function buildBackupWorkbook() {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = BACKUP_APPLICATION;
  workbook.company = 'Shanthi Electricals';
  workbook.created = new Date();
  workbook.modified = new Date();
  workbook.properties.date1904 = false;

  const tables = knownCollectionNames();
  const usedNames = new Set([METADATA_SHEET.toLowerCase()]);
  const tableSheets = tables.map((table) => ({ table, sheet: sheetNameFor(table, usedNames) }));

  const metadata = workbook.addWorksheet(METADATA_SHEET, { state: 'visible' });
  metadata.columns = [{ header: 'Key', key: 'key', width: 26 }, { header: 'Value', key: 'value', width: 90 }];
  metadata.addRows([
    { key: 'application', value: BACKUP_APPLICATION },
    { key: 'format_version', value: BACKUP_FORMAT_VERSION },
    { key: 'created_at', value: new Date().toISOString() },
    { key: 'database', value: mongoose.connection.name || '' },
    { key: 'table_count', value: tables.length },
    { key: 'table_map', value: JSON.stringify(tableSheets) },
    { key: 'warning', value: 'Contains complete business data and password hashes. Store securely.' },
  ]);
  metadata.getRow(1).font = { bold: true };
  metadata.views = [{ state: 'frozen', ySplit: 1 }];

  for (const mapping of tableSheets) {
    const collection = await getRawCollection(mapping.table);
    const rows = await collection.find({}).sort({ id: 1 }).toArray();
    const columns = columnsForCollection(mapping.table, rows.slice(0, 20));
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

async function backupBuffer() {
  const { workbook, tables } = await buildBackupWorkbook();
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

// Coerces spreadsheet cell values (everything from Excel arrives as strings,
// numbers, or the special __BASE64__/__JSON__ markers already unwrapped by
// importCellValue) back into the types each field actually expects, using
// the model's own field descriptors as the source of truth.
function coerceRowTypes(table, row) {
  const model = [...registry.values()].find((m) => m.collectionName === table);
  if (!model) return row; // e.g. counters: {_id, seq} -- no declared fields, kept as-is
  const output = {};
  for (const [key, value] of Object.entries(row)) {
    const descriptor = model.fields[key];
    if (value === null || value === '') {
      // A unique field backs a *sparse* index, which only excludes documents
      // where the field is entirely absent -- not documents where it is
      // explicitly null. An unset optional field (e.g. a product category's
      // unset `code`) round-trips through the spreadsheet as an empty cell
      // for every row, so writing it back as an explicit null would make
      // every restored row collide on that index. Omit the key instead,
      // which restores the original "field was never set" state.
      if (!(descriptor?.unique)) output[key] = null;
      continue;
    }
    if (key === 'id') { output[key] = Number(value); continue; }
    if (!descriptor) { output[key] = value; continue; }
    if (descriptor.kind === 'number') output[key] = Number(value);
    else if (descriptor.kind === 'boolean') output[key] = value === true || value === 'true' || value === 1 || value === '1';
    else if (descriptor.kind === 'date' || descriptor.kind === 'dateonly') output[key] = descriptor.kind === 'dateonly' ? String(value).slice(0, 10) : new Date(value);
    else output[key] = value;
  }
  if (output.createdAt) output.createdAt = new Date(output.createdAt);
  if (output.updatedAt) output.updatedAt = new Date(output.updatedAt);
  return output;
}

async function restoreBackup(buffer, options = {}) {
  const parsed = await parseBackupBuffer(buffer);
  const currentTableList = knownCollectionNames();
  const currentTables = new Set(currentTableList);
  const backupTables = new Set(parsed.tables.map((entry) => entry.table));
  const unknownTables = parsed.tables.filter((entry) => !currentTables.has(entry.table)).map((entry) => entry.table);
  if (unknownTables.length) throw new Error(`Backup contains tables that do not exist in this database: ${unknownTables.join(', ')}`);

  // A full restore must be all-or-nothing. Refuse edited, partial, or schema-incompatible
  // workbooks instead of silently leaving a mixture of old and restored records.
  const missingTables = currentTableList.filter((table) => !backupTables.has(table) && !REBUILDABLE_TABLES.has(table));
  if (missingTables.length) {
    throw new Error(`Backup is incomplete for the current database schema. Missing tables: ${missingTables.join(', ')}`);
  }

  const safetyBackup = options.skipSafetyBackup ? null : await saveSafetyBackup();
  const restored = [];

  await sequelize.transaction(async (t) => {
    for (const table of parsed.tables) {
      if (REBUILDABLE_TABLES.has(table.table)) continue; // never restore counters from a backup
      const collection = await getRawCollection(table.table);
      await collection.deleteMany({}, { session: t.session });
      if (table.rows.length) {
        const docs = table.rows.map((row) => coerceRowTypes(table.table, row));
        await collection.insertMany(docs, { session: t.session });
      }
      restored.push({ table: table.table, rows: table.rows.length });
    }

    // Any collection the app knows about but the backup didn't mention
    // (currently only `counters`) is cleared so it gets rebuilt below.
    for (const table of REBUILDABLE_TABLES) {
      const collection = await getRawCollection(table);
      await collection.deleteMany({}, { session: t.session });
    }
  });

  // Rebuild the id counters from whatever ids actually ended up in each
  // collection, so the very next create() call continues correctly instead
  // of colliding with a restored id. Uses a plain find+sort+limit rather than
  // an aggregation $max accumulator, which not every MongoDB-compatible
  // server implements -- a sort+limit is about as basic as queries get.
  for (const model of registry.values()) {
    const collection = await getRawCollection(model.collectionName);
    const [highestDoc] = await collection.find({}, { projection: { id: 1 } }).sort({ id: -1 }).limit(1).toArray();
    if (highestDoc?.id) await ensureSequenceAtLeast(model.collectionName, highestDoc.id);
  }

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
