require('dotenv').config();
const sequelize = require('../config/db');
const { ensureDatabaseExists, formatDatabaseError, getDatabaseConfig } = require('../config/databaseSetup');
require('../models/associations');

const REQUIRED = {
  sales: ['grand_total', 'received_amount', 'paid_amount'],
  purchases: ['grand_total', 'received_amount', 'paid_amount'],
  sale_items: ['quantity', 'sub_total'],
  purchase_items: ['quantity', 'sub_total'],
  main_products: ['product_unit', 'product_type', 'variant_config'],
  products: ['main_product_id', 'variant_name', 'variant_attributes', 'variant_sort_order', 'product_unit', 'sale_unit', 'purchase_unit'],
  variation_products: ['main_product_id', 'product_id', 'variation_id', 'variation_type_id'],
  expenses: ['amount'],
  product_price_histories: ['product_id', 'old_cost', 'new_cost', 'old_price', 'new_price', 'source', 'reason', 'purchase_id', 'changed_by'],
};

async function run() {
  const config = getDatabaseConfig();
  try {
    await ensureDatabaseExists();
    await sequelize.authenticate();

    const queryInterface = sequelize.getQueryInterface();
    console.log(`Database: ${config.host}:${config.port}/${config.database}`);

    let missingCount = 0;
    for (const [tableName, requiredColumns] of Object.entries(REQUIRED)) {
      let description;
      try {
        description = await queryInterface.describeTable(tableName);
      } catch (error) {
        const code = error?.original?.code || error?.parent?.code || error?.code;
        if (code === 'ER_NO_SUCH_TABLE' || code === 'ER_BAD_TABLE_ERROR') {
          console.log(`[missing table] ${tableName}`);
          missingCount += requiredColumns.length;
          continue;
        }
        throw error;
      }

      const actual = Object.keys(description);
      const missing = requiredColumns.filter((column) => !description[column]);
      console.log(`${tableName}: ${actual.join(', ')}`);
      if (missing.length) {
        console.log(`  missing: ${missing.join(', ')}`);
        missingCount += missing.length;
      }
    }

    if (missingCount) {
      console.log(`Schema check found ${missingCount} missing required column(s). Run: npm run db:migrate`);
      process.exitCode = 2;
    } else {
      console.log('Schema check passed.');
    }
  } catch (error) {
    console.error(`Database diagnosis failed: ${formatDatabaseError(error)}`);
    process.exitCode = 1;
  } finally {
    await sequelize.close().catch(() => {});
  }
}

run();
