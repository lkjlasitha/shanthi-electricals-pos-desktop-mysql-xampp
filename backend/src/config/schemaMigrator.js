const { DataTypes } = require('sequelize');
const sequelize = require('./db');

// Columns used by reports and transaction writes. These are migrated explicitly
// before the generic model scan, so upgrades do not depend on how a particular
// Sequelize version exposes sequelize.models.
const CRITICAL_COLUMNS = {
  sales: {
    due_date: { type: DataTypes.DATEONLY, allowNull: true },
    grand_total: { type: DataTypes.DOUBLE, allowNull: true },
    received_amount: { type: DataTypes.DOUBLE, allowNull: true },
    paid_amount: { type: DataTypes.DOUBLE, allowNull: true },
  },
  purchases: {
    grand_total: { type: DataTypes.DOUBLE, allowNull: true },
    received_amount: { type: DataTypes.DOUBLE, allowNull: true },
    paid_amount: { type: DataTypes.DOUBLE, allowNull: true },
  },
  sale_items: {
    product_id: { type: DataTypes.INTEGER, allowNull: true },
    item_name: { type: DataTypes.STRING, allowNull: true },
    item_code: { type: DataTypes.STRING(100), allowNull: true },
    is_manual: { type: DataTypes.BOOLEAN, allowNull: true, defaultValue: false },
    standard_price: { type: DataTypes.DOUBLE, allowNull: true },
    product_cost: { type: DataTypes.DOUBLE, allowNull: true },
    profit_amount: { type: DataTypes.DOUBLE, allowNull: true },
    quantity: { type: DataTypes.DOUBLE, allowNull: true },
    sub_total: { type: DataTypes.DOUBLE, allowNull: true },
  },
  sales_payments: {
    customer_account_payment_id: { type: DataTypes.INTEGER, allowNull: true },
  },
  quotation_items: {
    standard_price: { type: DataTypes.DOUBLE, allowNull: true },
    product_cost: { type: DataTypes.DOUBLE, allowNull: true },
    profit_amount: { type: DataTypes.DOUBLE, allowNull: true },
    discount_type: { type: DataTypes.ENUM('percentage', 'fixed', 'none'), allowNull: true, defaultValue: 'none' },
    discount_value: { type: DataTypes.DOUBLE, allowNull: true, defaultValue: 0 },
    tax_type: { type: DataTypes.ENUM('exclusive', 'inclusive', 'none'), allowNull: true, defaultValue: 'none' },
    tax_value: { type: DataTypes.DOUBLE, allowNull: true, defaultValue: 0 },
  },
  quotations: {
    sub_total: { type: DataTypes.DOUBLE, allowNull: true, defaultValue: 0 },
    profit_amount: { type: DataTypes.DOUBLE, allowNull: true, defaultValue: 0 },
  },
  customers: {
    customer_code: { type: DataTypes.STRING(50), allowNull: true },
    allow_credit: { type: DataTypes.BOOLEAN, allowNull: true, defaultValue: false },
    credit_limit: { type: DataTypes.DOUBLE, allowNull: true, defaultValue: 0 },
    payment_terms_days: { type: DataTypes.INTEGER, allowNull: true, defaultValue: 0 },
    status: { type: DataTypes.ENUM('active', 'inactive'), allowNull: true, defaultValue: 'active' },
    notes: { type: DataTypes.TEXT, allowNull: true },
  },
  purchase_items: {
    quantity: { type: DataTypes.DOUBLE, allowNull: true },
    sub_total: { type: DataTypes.DOUBLE, allowNull: true },
  },
  expenses: {
    amount: { type: DataTypes.DOUBLE, allowNull: true },
  },
  main_products: {
    product_unit: { type: DataTypes.INTEGER, allowNull: true },
    variant_config: { type: DataTypes.JSON, allowNull: true },
  },
  products: {
    main_product_id: { type: DataTypes.INTEGER, allowNull: true },
    variant_name: { type: DataTypes.STRING, allowNull: true },
    variant_attributes: { type: DataTypes.JSON, allowNull: true },
    variant_sort_order: { type: DataTypes.INTEGER, allowNull: true, defaultValue: 0 },
    product_unit: { type: DataTypes.INTEGER, allowNull: true },
    sale_unit: { type: DataTypes.INTEGER, allowNull: true },
    purchase_unit: { type: DataTypes.INTEGER, allowNull: true },
  },
  variation_products: {
    main_product_id: { type: DataTypes.INTEGER, allowNull: true },
  },
};

const LEGACY_ALIASES = {
  sales: {
    grand_total: ['total', 'total_amount', 'net_total'],
    paid_amount: ['paid', 'amount_paid', 'paid_total'],
    received_amount: ['received', 'amount_received', 'received_total'],
  },
  purchases: {
    grand_total: ['total', 'total_amount', 'net_total'],
    paid_amount: ['paid', 'amount_paid', 'paid_total'],
    received_amount: ['received', 'amount_received', 'received_total'],
  },
  sale_items: {
    sub_total: ['subtotal', 'line_total', 'total'],
    sale_unit_id: ['sale_unit'],
  },
  purchase_items: {
    sub_total: ['subtotal', 'line_total', 'total'],
    purchase_unit_id: ['purchase_unit'],
  },
  expenses: {
    amount: ['expense_amount', 'expense_total', 'grand_total', 'total', 'total_amount', 'cost', 'value'],
  },
};

const ZERO_FILL_COLUMNS = new Set([
  'sales.grand_total',
  'sales.paid_amount',
  'sales.received_amount',
  'purchases.grand_total',
  'purchases.paid_amount',
  'purchases.received_amount',
  'sale_items.sub_total',
  'sale_items.is_manual',
  'purchase_items.sub_total',
  'expenses.amount',
]);

function getAffectedRows(queryResult) {
  if (!Array.isArray(queryResult)) return 0;
  const [results, metadata] = queryResult;
  return Number(metadata?.affectedRows ?? results?.affectedRows ?? 0);
}

function tableNameOf(model) {
  const value = model.getTableName();
  return typeof value === 'string' ? value : value.tableName;
}

function fieldNameOf(attributeName, attribute) {
  return attribute.field || attributeName;
}

function columnDefinition(attribute, { preserveNull = false } = {}) {
  const definition = {
    type: attribute.type,
    // Existing tables may already contain rows. Add columns as nullable first,
    // then normalize data in a separate step.
    allowNull: true,
  };

  const defaultValue = attribute.defaultValue;
  if (!preserveNull && (['string', 'number', 'boolean'].includes(typeof defaultValue) || defaultValue === null)) {
    definition.defaultValue = defaultValue;
  }

  return definition;
}

async function describeIfExists(queryInterface, tableName) {
  try {
    return await queryInterface.describeTable(tableName);
  } catch (error) {
    const code = error?.original?.code || error?.parent?.code || error?.code;
    if (code === 'ER_NO_SUCH_TABLE' || code === 'ER_BAD_TABLE_ERROR') return null;
    throw error;
  }
}

function getRegisteredModels() {
  const candidates = [];

  // Sequelize v6 keeps the authoritative list here.
  if (Array.isArray(sequelize.modelManager?.models)) {
    candidates.push(...sequelize.modelManager.models);
  }

  // Keep compatibility with registries exposed as a plain object, Map, or
  // ModelSetView by other Sequelize releases.
  const registry = sequelize.models;
  if (registry) {
    if (typeof registry.values === 'function') {
      candidates.push(...registry.values());
    } else if (typeof registry === 'object') {
      candidates.push(...Object.values(registry));
    }
  }

  return [...new Set(candidates)].filter(
    (model) => model && typeof model.getTableName === 'function' && typeof model.getAttributes === 'function'
  );
}

async function addColumnAndConfirm(queryInterface, tableName, columnName, definition) {
  const before = await describeIfExists(queryInterface, tableName);
  if (!before) return false;
  if (before[columnName]) return false;

  await queryInterface.addColumn(tableName, columnName, definition);

  const after = await describeIfExists(queryInterface, tableName);
  if (!after?.[columnName]) {
    throw new Error(`Migration attempted to add ${tableName}.${columnName}, but MySQL did not report the column afterwards.`);
  }
  return true;
}

async function makeSaleItemProductOptional({ verbose = true } = {}) {
  const queryInterface = sequelize.getQueryInterface();
  const table = await describeIfExists(queryInterface, 'sale_items');
  if (!table?.product_id || table.product_id.allowNull !== false) return [];

  await queryInterface.changeColumn('sale_items', 'product_id', {
    type: DataTypes.INTEGER,
    allowNull: true,
  });

  const changed = ['made sale_items.product_id nullable for manual bill items'];
  if (verbose) changed.forEach((change) => console.log(`[db:migrate] ${change}`));
  return changed;
}

async function addCriticalColumns({ verbose = true } = {}) {
  const queryInterface = sequelize.getQueryInterface();
  const changes = [];

  for (const [tableName, columns] of Object.entries(CRITICAL_COLUMNS)) {
    const table = await describeIfExists(queryInterface, tableName);
    if (!table) continue;

    for (const [columnName, definition] of Object.entries(columns)) {
      if (await addColumnAndConfirm(queryInterface, tableName, columnName, definition)) {
        changes.push(`added ${tableName}.${columnName}`);
      }
    }
  }

  if (verbose && changes.length) {
    changes.forEach((change) => console.log(`[db:migrate] ${change}`));
  }
  return changes;
}

async function addMissingColumns({ verbose = true } = {}) {
  const queryInterface = sequelize.getQueryInterface();
  const changes = [];
  const models = getRegisteredModels();

  if (verbose) {
    console.log(`[db:migrate] discovered ${models.length} Sequelize model(s)`);
  }

  if (!models.length) {
    throw new Error('No Sequelize models were registered. Ensure models/associations is required before running the migration.');
  }

  for (const model of models) {
    const tableName = tableNameOf(model);
    let existingColumns = await describeIfExists(queryInterface, tableName);
    if (!existingColumns) continue;

    for (const [attributeName, attribute] of Object.entries(model.getAttributes())) {
      if (attribute.primaryKey || attribute.autoIncrement || attribute.type?.key === 'VIRTUAL') continue;

      const fieldName = fieldNameOf(attributeName, attribute);
      if (existingColumns[fieldName]) continue;

      const preserveNull = Boolean(LEGACY_ALIASES[tableName]?.[fieldName]);
      const added = await addColumnAndConfirm(
        queryInterface,
        tableName,
        fieldName,
        columnDefinition(attribute, { preserveNull })
      );
      if (added) {
        changes.push(`added ${tableName}.${fieldName}`);
        existingColumns = await queryInterface.describeTable(tableName);
      }
    }
  }

  if (verbose && changes.length) {
    changes.forEach((change) => console.log(`[db:migrate] ${change}`));
  }
  return changes;
}

async function copyLegacyColumnValues({ verbose = true } = {}) {
  const queryInterface = sequelize.getQueryInterface();
  const changes = [];

  for (const [tableName, mappings] of Object.entries(LEGACY_ALIASES)) {
    const columns = await describeIfExists(queryInterface, tableName);
    if (!columns) continue;

    for (const [target, aliases] of Object.entries(mappings)) {
      if (!columns[target]) continue;
      const source = aliases.find((alias) => columns[alias]);
      if (!source) continue;

      const queryResult = await sequelize.query(
        `UPDATE \`${tableName}\` SET \`${target}\` = \`${source}\` ` +
        `WHERE \`${target}\` IS NULL AND \`${source}\` IS NOT NULL`
      );
      const affectedRows = getAffectedRows(queryResult);
      if (affectedRows > 0) changes.push(`copied ${tableName}.${source} -> ${target} (${affectedRows} rows)`);
    }
  }

  if (verbose && changes.length) {
    changes.forEach((change) => console.log(`[db:migrate] ${change}`));
  }
  return changes;
}

async function rebuildDerivedTotals({ verbose = true } = {}) {
  const queryInterface = sequelize.getQueryInterface();
  const changes = [];
  const requiredTables = ['sales', 'sale_items', 'purchases', 'purchase_items'];
  const descriptions = {};
  for (const tableName of requiredTables) {
    descriptions[tableName] = await describeIfExists(queryInterface, tableName);
  }

  if (descriptions.sale_items?.sub_total && descriptions.sale_items?.quantity) {
    const priceColumn = descriptions.sale_items.net_unit_price
      ? 'net_unit_price'
      : descriptions.sale_items.product_price ? 'product_price' : null;
    if (priceColumn) {
      const result = await sequelize.query(
        `UPDATE \`sale_items\` SET \`sub_total\` = COALESCE(\`${priceColumn}\`, 0) * COALESCE(\`quantity\`, 0) ` +
        `WHERE \`sub_total\` IS NULL`
      );
      const affectedRows = getAffectedRows(result);
      if (affectedRows > 0) changes.push(`rebuilt sale_items.sub_total (${affectedRows} rows)`);
    }
  }

  if (descriptions.purchase_items?.sub_total && descriptions.purchase_items?.quantity) {
    const costColumn = descriptions.purchase_items.net_unit_cost
      ? 'net_unit_cost'
      : descriptions.purchase_items.product_cost ? 'product_cost' : null;
    if (costColumn) {
      const result = await sequelize.query(
        `UPDATE \`purchase_items\` SET \`sub_total\` = COALESCE(\`${costColumn}\`, 0) * COALESCE(\`quantity\`, 0) ` +
        `WHERE \`sub_total\` IS NULL`
      );
      const affectedRows = getAffectedRows(result);
      if (affectedRows > 0) changes.push(`rebuilt purchase_items.sub_total (${affectedRows} rows)`);
    }
  }

  if (descriptions.sales?.grand_total && descriptions.sale_items?.sub_total) {
    const discount = descriptions.sales.discount ? 'COALESCE(s.`discount`, 0)' : '0';
    const shipping = descriptions.sales.shipping ? 'COALESCE(s.`shipping`, 0)' : '0';
    const tax = descriptions.sales.tax_amount ? 'COALESCE(s.`tax_amount`, 0)' : '0';
    const result = await sequelize.query(
      `UPDATE \`sales\` s SET s.\`grand_total\` = ` +
      `COALESCE((SELECT SUM(si.\`sub_total\`) FROM \`sale_items\` si WHERE si.\`sale_id\` = s.\`id\`), 0) ` +
      `- ${discount} + ${shipping} + ${tax} ` +
      `WHERE s.\`grand_total\` IS NULL`
    );
    const affectedRows = getAffectedRows(result);
    if (affectedRows > 0) changes.push(`rebuilt sales.grand_total (${affectedRows} rows)`);
  }

  if (descriptions.purchases?.grand_total && descriptions.purchase_items?.sub_total) {
    const discount = descriptions.purchases.discount ? 'COALESCE(p.`discount`, 0)' : '0';
    const shipping = descriptions.purchases.shipping ? 'COALESCE(p.`shipping`, 0)' : '0';
    const tax = descriptions.purchases.tax_amount ? 'COALESCE(p.`tax_amount`, 0)' : '0';
    const result = await sequelize.query(
      `UPDATE \`purchases\` p SET p.\`grand_total\` = ` +
      `COALESCE((SELECT SUM(pi.\`sub_total\`) FROM \`purchase_items\` pi WHERE pi.\`purchase_id\` = p.\`id\`), 0) ` +
      `- ${discount} + ${shipping} + ${tax} ` +
      `WHERE p.\`grand_total\` IS NULL`
    );
    const affectedRows = getAffectedRows(result);
    if (affectedRows > 0) changes.push(`rebuilt purchases.grand_total (${affectedRows} rows)`);
  }

  if (verbose && changes.length) changes.forEach((change) => console.log(`[db:migrate] ${change}`));
  return changes;
}

async function normalizeCompatibilityValues({ verbose = true } = {}) {
  const queryInterface = sequelize.getQueryInterface();
  const changes = [];

  for (const qualified of ZERO_FILL_COLUMNS) {
    const [tableName, column] = qualified.split('.');
    const columns = await describeIfExists(queryInterface, tableName);
    if (!columns?.[column]) continue;

    const queryResult = await sequelize.query(
      `UPDATE \`${tableName}\` SET \`${column}\` = 0 WHERE \`${column}\` IS NULL`
    );
    const affectedRows = getAffectedRows(queryResult);
    if (affectedRows > 0) {
      changes.push(`filled ${qualified} NULL values with 0 (${affectedRows} rows)`);
    }
  }

  const productColumns = await describeIfExists(queryInterface, 'products');
  if (productColumns) {
    for (const column of ['product_unit', 'sale_unit', 'purchase_unit']) {
      if (!productColumns[column]) continue;
      const queryResult = await sequelize.query(
        `UPDATE \`products\` SET \`${column}\` = NULL ` +
        `WHERE \`${column}\` = 0 OR TRIM(CAST(\`${column}\` AS CHAR)) = ''`
      );
      const affectedRows = getAffectedRows(queryResult);
      if (affectedRows > 0) {
        changes.push(`normalized products.${column} (${affectedRows} rows)`);
      }
    }
  }

  const variationProductColumns = await describeIfExists(queryInterface, 'variation_products');
  if (variationProductColumns?.main_product_id && variationProductColumns?.product_id && productColumns?.main_product_id) {
    const queryResult = await sequelize.query(
      `UPDATE \`variation_products\` vp ` +
      `INNER JOIN \`products\` p ON p.\`id\` = vp.\`product_id\` ` +
      `SET vp.\`main_product_id\` = p.\`main_product_id\` ` +
      `WHERE vp.\`main_product_id\` IS NULL AND p.\`main_product_id\` IS NOT NULL`
    );
    const affectedRows = getAffectedRows(queryResult);
    if (affectedRows > 0) changes.push(`backfilled variation_products.main_product_id (${affectedRows} rows)`);
  }

  if (productColumns?.variant_name && productColumns?.main_product_id && variationProductColumns?.variation_type_id) {
    const variationTypeColumns = await describeIfExists(queryInterface, 'variation_types');
    if (variationTypeColumns?.name) {
      const queryResult = await sequelize.query(
        `UPDATE \`products\` p SET p.\`variant_name\` = (` +
        `SELECT GROUP_CONCAT(vt.\`name\` ORDER BY vp.\`id\` SEPARATOR ' / ') ` +
        `FROM \`variation_products\` vp ` +
        `INNER JOIN \`variation_types\` vt ON vt.\`id\` = vp.\`variation_type_id\` ` +
        `WHERE vp.\`product_id\` = p.\`id\`) ` +
        `WHERE p.\`main_product_id\` IS NOT NULL ` +
        `AND (p.\`variant_name\` IS NULL OR TRIM(p.\`variant_name\`) = '') ` +
        `AND EXISTS (SELECT 1 FROM \`variation_products\` vp2 WHERE vp2.\`product_id\` = p.\`id\`)`
      );
      const affectedRows = getAffectedRows(queryResult);
      if (affectedRows > 0) changes.push(`backfilled products.variant_name (${affectedRows} rows)`);
    }
  }

  if (verbose && changes.length) {
    changes.forEach((change) => console.log(`[db:migrate] ${change}`));
  }
  return changes;
}

async function verifyCriticalColumns() {
  const queryInterface = sequelize.getQueryInterface();
  const missing = [];

  for (const [tableName, columns] of Object.entries(CRITICAL_COLUMNS)) {
    const description = await describeIfExists(queryInterface, tableName);
    if (!description) {
      missing.push(`${tableName} (table)`);
      continue;
    }
    for (const column of Object.keys(columns)) {
      if (!description[column]) missing.push(`${tableName}.${column}`);
    }
  }

  if (missing.length) {
    throw new Error(`Database schema is still missing after migration: ${missing.join(', ')}`);
  }
}

async function migrateSchema(options = {}) {
  const changes = [];
  changes.push(...await addCriticalColumns(options));
  changes.push(...await makeSaleItemProductOptional(options));
  changes.push(...await addMissingColumns(options));
  changes.push(...await copyLegacyColumnValues(options));
  changes.push(...await rebuildDerivedTotals(options));
  changes.push(...await normalizeCompatibilityValues(options));
  await verifyCriticalColumns();

  if (options.verbose !== false) {
    console.log(changes.length ? `[db:migrate] completed with ${changes.length} change(s)` : '[db:migrate] schema already up to date');
  }
  return changes;
}

module.exports = {
  migrateSchema,
  addCriticalColumns,
  makeSaleItemProductOptional,
  addMissingColumns,
  copyLegacyColumnValues,
  rebuildDerivedTotals,
  normalizeCompatibilityValues,
  verifyCriticalColumns,
  getRegisteredModels,
};
