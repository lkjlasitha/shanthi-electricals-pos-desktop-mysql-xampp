const { DataTypes } = require('sequelize');
const sequelize = require('../config/db');

/* ============================================================
   AUTH / RBAC
   ============================================================ */

const Role = sequelize.define('Role', {
  name: { type: DataTypes.STRING, allowNull: false, unique: true },
  display_name: { type: DataTypes.STRING, allowNull: false },
  // Simplified RBAC: permissions stored as a JSON array of permission keys,
  // e.g. ["products.view","products.create","sales.create", ...]
  permissions: { type: DataTypes.JSON, allowNull: false, defaultValue: [] },
}, { tableName: 'roles' });

const User = sequelize.define('User', {
  name: { type: DataTypes.STRING, allowNull: false },
  email: { type: DataTypes.STRING, allowNull: false, unique: true, validate: { isEmail: true } },
  password: { type: DataTypes.STRING, allowNull: false },
  phone: { type: DataTypes.STRING, allowNull: true }, // Sri Lankan format e.g. +94 77 123 4567
  language: { type: DataTypes.STRING, defaultValue: 'en' },
  status: { type: DataTypes.ENUM('active', 'inactive'), defaultValue: 'active' },
  role_id: { type: DataTypes.INTEGER, allowNull: false },
  warehouse_id: { type: DataTypes.INTEGER, allowNull: true }, // primary/assigned warehouse for cashiers
}, { tableName: 'users' });

/* ============================================================
   MASTER DATA
   ============================================================ */

const Warehouse = sequelize.define('Warehouse', {
  name: { type: DataTypes.STRING, allowNull: false },
  phone: { type: DataTypes.STRING, allowNull: true },
  country: { type: DataTypes.STRING, defaultValue: 'Sri Lanka' },
  city: { type: DataTypes.STRING, allowNull: true },
  address: { type: DataTypes.TEXT, allowNull: true },
  zip_code: { type: DataTypes.STRING, allowNull: true },
  email: { type: DataTypes.STRING, allowNull: true, unique: true },
  is_default: { type: DataTypes.BOOLEAN, defaultValue: false },
}, { tableName: 'warehouses' });

const ProductCategory = sequelize.define('ProductCategory', {
  name: { type: DataTypes.STRING, allowNull: false },
  code: { type: DataTypes.STRING, allowNull: true, unique: true },
  slug: { type: DataTypes.STRING, allowNull: true },
}, { tableName: 'product_categories' });

const Brand = sequelize.define('Brand', {
  name: { type: DataTypes.STRING, allowNull: false },
  slug: { type: DataTypes.STRING, allowNull: true },
  image: { type: DataTypes.STRING, allowNull: true },
}, { tableName: 'brands' });

const BaseUnit = sequelize.define('BaseUnit', {
  name: { type: DataTypes.STRING, allowNull: false }, // e.g. Piece, Meter, Kilogram, Box, Roll
  is_default: { type: DataTypes.BOOLEAN, defaultValue: false },
}, { tableName: 'base_units' });

const Unit = sequelize.define('Unit', {
  name: { type: DataTypes.STRING, allowNull: false }, // e.g. Box of 10
  short_name: { type: DataTypes.STRING, allowNull: true }, // e.g. box10
  base_unit_id: { type: DataTypes.INTEGER, allowNull: false },
  operator: { type: DataTypes.ENUM('*', '/'), defaultValue: '*' },
  operation_value: { type: DataTypes.DOUBLE, defaultValue: 1 }, // conversion factor vs base unit
}, { tableName: 'units' });

const Currency = sequelize.define('Currency', {
  name: { type: DataTypes.STRING, allowNull: false }, // Sri Lankan Rupee
  code: { type: DataTypes.STRING, allowNull: false, unique: true }, // LKR
  symbol: { type: DataTypes.STRING, allowNull: false }, // Rs.
  exchange_rate: { type: DataTypes.DOUBLE, defaultValue: 1 },
  is_default: { type: DataTypes.BOOLEAN, defaultValue: false },
  position: { type: DataTypes.ENUM('left', 'right'), defaultValue: 'left' },
}, { tableName: 'currencies' });

const Customer = sequelize.define('Customer', {
  name: { type: DataTypes.STRING, allowNull: false },
  customer_code: { type: DataTypes.STRING(50), allowNull: true, unique: true },
  email: { type: DataTypes.STRING, allowNull: true },
  phone: { type: DataTypes.STRING, allowNull: false }, // Sri Lankan mobile/landline
  country: { type: DataTypes.STRING, defaultValue: 'Sri Lanka' },
  city: { type: DataTypes.STRING, allowNull: true },
  address: { type: DataTypes.TEXT, allowNull: true },
  tax_number: { type: DataTypes.STRING, allowNull: true }, // customer's VAT/TIN if a registered business
  opening_balance: { type: DataTypes.DOUBLE, defaultValue: 0 }, // credit balance for shop-account customers
  allow_credit: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
  credit_limit: { type: DataTypes.DOUBLE, allowNull: false, defaultValue: 0 },
  payment_terms_days: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
  status: { type: DataTypes.ENUM('active', 'inactive'), allowNull: false, defaultValue: 'active' },
  notes: { type: DataTypes.TEXT, allowNull: true },
}, { tableName: 'customers' });

const Supplier = sequelize.define('Supplier', {
  name: { type: DataTypes.STRING, allowNull: false },
  email: { type: DataTypes.STRING, allowNull: true },
  phone: { type: DataTypes.STRING, allowNull: false },
  country: { type: DataTypes.STRING, defaultValue: 'Sri Lanka' },
  city: { type: DataTypes.STRING, allowNull: true },
  address: { type: DataTypes.TEXT, allowNull: true },
  tax_number: { type: DataTypes.STRING, allowNull: true }, // supplier VAT/BIN
}, { tableName: 'suppliers' });

// Single-row key/value business settings table
const Setting = sequelize.define('Setting', {
  key: { type: DataTypes.STRING, allowNull: false, unique: true },
  value: { type: DataTypes.TEXT, allowNull: true },
}, { tableName: 'settings' });

module.exports = {
  sequelize,
  Role,
  User,
  Warehouse,
  ProductCategory,
  Brand,
  BaseUnit,
  Unit,
  Currency,
  Customer,
  Supplier,
  Setting,
};
