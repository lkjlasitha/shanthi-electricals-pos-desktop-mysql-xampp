const sequelize = require('../config/db');
const { DataTypes } = sequelize;

/* ============================================================
   PRODUCTS, VARIATIONS & STOCK
   ============================================================ */

// A "main product" groups either a single product or a family of variation
// products (e.g. "LED Bulb 9W" as the main product, with variation products
// per color/wattage). Mirrors the original Laravel schema.
const MainProduct = sequelize.define('MainProduct', {
  name: { type: DataTypes.STRING, allowNull: false },
  code: { type: DataTypes.STRING, allowNull: false, unique: true },
  product_unit: { type: DataTypes.INTEGER, allowNull: true },
  product_type: { type: DataTypes.ENUM('single', 'variable'), defaultValue: 'single' },
  variant_config: { type: DataTypes.JSON, allowNull: true },
  image: { type: DataTypes.STRING, allowNull: true },
}, { tableName: 'main_products' });

const Product = sequelize.define('Product', {
  main_product_id: { type: DataTypes.INTEGER, allowNull: true },
  variant_name: { type: DataTypes.STRING, allowNull: true },
  variant_attributes: { type: DataTypes.JSON, allowNull: true },
  variant_sort_order: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
  name: { type: DataTypes.STRING, allowNull: false },
  code: { type: DataTypes.STRING, allowNull: false, unique: true }, // SKU / barcode
  barcode_symbol: { type: DataTypes.STRING, defaultValue: 'CODE128' },
  product_category_id: { type: DataTypes.INTEGER, allowNull: false },
  brand_id: { type: DataTypes.INTEGER, allowNull: true },
  product_cost: { type: DataTypes.DOUBLE, allowNull: false, defaultValue: 0 }, // cost price ex-tax
  product_price: { type: DataTypes.DOUBLE, allowNull: false, defaultValue: 0 }, // selling price
  product_unit: { type: DataTypes.INTEGER, allowNull: true }, // Unit id, base stocking unit
  sale_unit: { type: DataTypes.INTEGER, allowNull: true }, // Unit id used when selling
  purchase_unit: { type: DataTypes.INTEGER, allowNull: true }, // Unit id used when purchasing
  stock_alert: { type: DataTypes.DOUBLE, allowNull: true, defaultValue: 5 }, // low-stock threshold
  quantity_limit: { type: DataTypes.DOUBLE, allowNull: true }, // max sellable qty per sale line
  order_tax: { type: DataTypes.DOUBLE, allowNull: true, defaultValue: 0 }, // e.g. Sri Lanka VAT %
  tax_type: { type: DataTypes.ENUM('exclusive', 'inclusive'), defaultValue: 'exclusive' },
  is_active: { type: DataTypes.BOOLEAN, defaultValue: true },
  notes: { type: DataTypes.TEXT, allowNull: true },
}, { tableName: 'products' });


// Auditable history for every cost/selling-price change. This keeps old
// invoices unchanged while showing when and why the catalogue price moved.
const ProductPriceHistory = sequelize.define('ProductPriceHistory', {
  product_id: { type: DataTypes.INTEGER, allowNull: false },
  old_cost: { type: DataTypes.DOUBLE, allowNull: false, defaultValue: 0 },
  new_cost: { type: DataTypes.DOUBLE, allowNull: false, defaultValue: 0 },
  old_price: { type: DataTypes.DOUBLE, allowNull: false, defaultValue: 0 },
  new_price: { type: DataTypes.DOUBLE, allowNull: false, defaultValue: 0 },
  source: {
    type: DataTypes.ENUM('manual', 'purchase', 'product_edit'),
    allowNull: false,
    defaultValue: 'manual',
  },
  reason: { type: DataTypes.TEXT, allowNull: true },
  purchase_id: { type: DataTypes.INTEGER, allowNull: true },
  changed_by: { type: DataTypes.INTEGER, allowNull: true },
}, {
  tableName: 'product_price_histories',
  indexes: [
    { fields: ['product_id', 'created_at'] },
    { fields: ['purchase_id'] },
  ],
});

const Variation = sequelize.define('Variation', {
  name: { type: DataTypes.STRING, allowNull: false, unique: true }, // e.g. "Wattage", "Color"
}, { tableName: 'variations' });

const VariationType = sequelize.define('VariationType', {
  variation_id: { type: DataTypes.INTEGER, allowNull: false },
  name: { type: DataTypes.STRING, allowNull: false }, // e.g. "9W", "Red"
}, { tableName: 'variation_types' });

const VariationProduct = sequelize.define('VariationProduct', {
  main_product_id: { type: DataTypes.INTEGER, allowNull: true },
  product_id: { type: DataTypes.INTEGER, allowNull: false },
  variation_id: { type: DataTypes.INTEGER, allowNull: false },
  variation_type_id: { type: DataTypes.INTEGER, allowNull: false },
}, { tableName: 'variation_products' });

// Per-warehouse stock quantity for a product
const ManageStock = sequelize.define('ManageStock', {
  warehouse_id: { type: DataTypes.INTEGER, allowNull: false },
  product_id: { type: DataTypes.INTEGER, allowNull: false },
  quantity: { type: DataTypes.DOUBLE, allowNull: false, defaultValue: 0 },
}, {
  tableName: 'manage_stocks',
  indexes: [{ unique: true, fields: ['warehouse_id', 'product_id'] }],
});

module.exports = {
  MainProduct,
  Product,
  Variation,
  VariationType,
  VariationProduct,
  ManageStock,
  ProductPriceHistory,
};
