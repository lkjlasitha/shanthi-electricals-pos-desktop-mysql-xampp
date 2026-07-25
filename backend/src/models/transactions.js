const { DataTypes } = require('sequelize');
const sequelize = require('../config/db');

const money = { type: DataTypes.DOUBLE, allowNull: true, defaultValue: 0 };

/* ============================================================
   PURCHASES
   ============================================================ */
const Purchase = sequelize.define('Purchase', {
  date: { type: DataTypes.DATEONLY, allowNull: false },
  supplier_id: { type: DataTypes.INTEGER, allowNull: false },
  warehouse_id: { type: DataTypes.INTEGER, allowNull: false },
  tax_rate: money,
  tax_amount: money,
  discount: money,
  shipping: money,
  grand_total: money,
  received_amount: money,
  paid_amount: money,
  payment_type: { type: DataTypes.ENUM('cash', 'card', 'bank_transfer', 'cheque', 'credit'), defaultValue: 'cash' },
  payment_status: { type: DataTypes.ENUM('paid', 'partial', 'unpaid'), defaultValue: 'paid' },
  status: { type: DataTypes.ENUM('ordered', 'received', 'pending'), defaultValue: 'received' },
  notes: { type: DataTypes.TEXT, allowNull: true },
  reference_code: { type: DataTypes.STRING, allowNull: true, unique: true },
  created_by: { type: DataTypes.INTEGER, allowNull: true },
}, { tableName: 'purchases' });

const PurchaseItem = sequelize.define('PurchaseItem', {
  purchase_id: { type: DataTypes.INTEGER, allowNull: false },
  product_id: { type: DataTypes.INTEGER, allowNull: false },
  product_cost: money,
  net_unit_cost: money,
  tax_type: { type: DataTypes.ENUM('exclusive', 'inclusive', 'none'), defaultValue: 'none' },
  tax_value: money,
  tax_amount: money,
  discount_type: { type: DataTypes.ENUM('percentage', 'fixed', 'none'), defaultValue: 'none' },
  discount_value: money,
  discount_amount: money,
  purchase_unit_id: { type: DataTypes.INTEGER, allowNull: true },
  quantity: { type: DataTypes.DOUBLE, allowNull: false },
  sub_total: money,
}, { tableName: 'purchase_items' });

const PurchaseReturn = sequelize.define('PurchaseReturn', {
  purchase_id: { type: DataTypes.INTEGER, allowNull: false },
  date: { type: DataTypes.DATEONLY, allowNull: false },
  supplier_id: { type: DataTypes.INTEGER, allowNull: false },
  warehouse_id: { type: DataTypes.INTEGER, allowNull: false },
  grand_total: money,
  notes: { type: DataTypes.TEXT, allowNull: true },
  reference_code: { type: DataTypes.STRING, allowNull: true },
}, { tableName: 'purchase_returns' });

const PurchaseReturnItem = sequelize.define('PurchaseReturnItem', {
  purchase_return_id: { type: DataTypes.INTEGER, allowNull: false },
  product_id: { type: DataTypes.INTEGER, allowNull: false },
  quantity: { type: DataTypes.DOUBLE, allowNull: false },
  unit_cost: money,
  sub_total: money,
}, { tableName: 'purchase_return_items' });

/* ============================================================
   SALES (POS)
   ============================================================ */
const Sale = sequelize.define('Sale', {
  date: { type: DataTypes.DATEONLY, allowNull: false },
  customer_id: { type: DataTypes.INTEGER, allowNull: false },
  warehouse_id: { type: DataTypes.INTEGER, allowNull: false },
  pos_register_id: { type: DataTypes.INTEGER, allowNull: true },
  tax_rate: money,
  tax_amount: money,
  discount: money,
  shipping: money,
  grand_total: money,
  received_amount: money,
  paid_amount: money,
  payment_type: { type: DataTypes.ENUM('cash', 'card', 'bank_transfer', 'credit'), defaultValue: 'cash' },
  payment_status: { type: DataTypes.ENUM('paid', 'partial', 'unpaid'), defaultValue: 'paid' },
  note: { type: DataTypes.TEXT, allowNull: true },
  reference_code: { type: DataTypes.STRING, allowNull: true, unique: true },
  created_by: { type: DataTypes.INTEGER, allowNull: true },
}, { tableName: 'sales' });

const SaleItem = sequelize.define('SaleItem', {
  sale_id: { type: DataTypes.INTEGER, allowNull: false },
  product_id: { type: DataTypes.INTEGER, allowNull: false },
  product_price: money,
  net_unit_price: money,
  tax_type: { type: DataTypes.ENUM('exclusive', 'inclusive', 'none'), defaultValue: 'none' },
  tax_value: money,
  tax_amount: money,
  discount_type: { type: DataTypes.ENUM('percentage', 'fixed', 'none'), defaultValue: 'none' },
  discount_value: money,
  discount_amount: money,
  sale_unit_id: { type: DataTypes.INTEGER, allowNull: true },
  quantity: { type: DataTypes.DOUBLE, allowNull: false },
  sub_total: money,
}, { tableName: 'sale_items' });

const SalesPayment = sequelize.define('SalesPayment', {
  sale_id: { type: DataTypes.INTEGER, allowNull: false },
  amount: money,
  paying_method: { type: DataTypes.ENUM('cash', 'card', 'bank_transfer', 'credit'), defaultValue: 'cash' },
  received_amount: money,
  reference: { type: DataTypes.STRING, allowNull: true },
  note: { type: DataTypes.TEXT, allowNull: true },
  paid_on: { type: DataTypes.DATEONLY, allowNull: false },
}, { tableName: 'sales_payments' });

const SaleReturn = sequelize.define('SaleReturn', {
  sale_id: { type: DataTypes.INTEGER, allowNull: false },
  date: { type: DataTypes.DATEONLY, allowNull: false },
  customer_id: { type: DataTypes.INTEGER, allowNull: false },
  warehouse_id: { type: DataTypes.INTEGER, allowNull: false },
  grand_total: money,
  notes: { type: DataTypes.TEXT, allowNull: true },
  reference_code: { type: DataTypes.STRING, allowNull: true },
}, { tableName: 'sale_returns' });

const SaleReturnItem = sequelize.define('SaleReturnItem', {
  sale_return_id: { type: DataTypes.INTEGER, allowNull: false },
  product_id: { type: DataTypes.INTEGER, allowNull: false },
  quantity: { type: DataTypes.DOUBLE, allowNull: false },
  sold_quantity: { type: DataTypes.DOUBLE, allowNull: true },
  unit_price: money,
  sub_total: money,
}, { tableName: 'sale_return_items' });

/* ============================================================
   STOCK MOVEMENTS: TRANSFERS & ADJUSTMENTS
   ============================================================ */
const Transfer = sequelize.define('Transfer', {
  date: { type: DataTypes.DATEONLY, allowNull: false },
  from_warehouse_id: { type: DataTypes.INTEGER, allowNull: false },
  to_warehouse_id: { type: DataTypes.INTEGER, allowNull: false },
  shipping_cost: money,
  grand_total: money,
  status: { type: DataTypes.ENUM('pending', 'completed'), defaultValue: 'completed' },
  notes: { type: DataTypes.TEXT, allowNull: true },
  reference_code: { type: DataTypes.STRING, allowNull: true },
}, { tableName: 'transfers' });

const TransferItem = sequelize.define('TransferItem', {
  transfer_id: { type: DataTypes.INTEGER, allowNull: false },
  product_id: { type: DataTypes.INTEGER, allowNull: false },
  quantity: { type: DataTypes.DOUBLE, allowNull: false },
  purchase_cost: money,
  sub_total: money,
}, { tableName: 'transfer_items' });

const Adjustment = sequelize.define('Adjustment', {
  date: { type: DataTypes.DATEONLY, allowNull: false },
  warehouse_id: { type: DataTypes.INTEGER, allowNull: false },
  notes: { type: DataTypes.TEXT, allowNull: true },
  reference_code: { type: DataTypes.STRING, allowNull: true },
}, { tableName: 'adjustments' });

const AdjustmentItem = sequelize.define('AdjustmentItem', {
  adjustment_id: { type: DataTypes.INTEGER, allowNull: false },
  product_id: { type: DataTypes.INTEGER, allowNull: false },
  type: { type: DataTypes.ENUM('addition', 'subtraction'), allowNull: false },
  quantity: { type: DataTypes.DOUBLE, allowNull: false },
}, { tableName: 'adjustment_items' });

/* ============================================================
   QUOTATIONS & HOLDS
   ============================================================ */
const Quotation = sequelize.define('Quotation', {
  date: { type: DataTypes.DATEONLY, allowNull: false },
  customer_id: { type: DataTypes.INTEGER, allowNull: false },
  warehouse_id: { type: DataTypes.INTEGER, allowNull: false },
  tax_rate: money,
  tax_amount: money,
  discount: money,
  shipping: money,
  grand_total: money,
  note: { type: DataTypes.TEXT, allowNull: true },
  reference_code: { type: DataTypes.STRING, allowNull: true },
  status: { type: DataTypes.ENUM('sent', 'converted', 'expired'), defaultValue: 'sent' },
}, { tableName: 'quotations' });

const QuotationItem = sequelize.define('QuotationItem', {
  quotation_id: { type: DataTypes.INTEGER, allowNull: false },
  product_id: { type: DataTypes.INTEGER, allowNull: false },
  product_price: money,
  quantity: { type: DataTypes.DOUBLE, allowNull: false },
  discount_amount: money,
  tax_amount: money,
  sub_total: money,
}, { tableName: 'quotation_items' });

const Hold = sequelize.define('Hold', {
  warehouse_id: { type: DataTypes.INTEGER, allowNull: false },
  customer_id: { type: DataTypes.INTEGER, allowNull: true },
  note: { type: DataTypes.TEXT, allowNull: true },
  reference_code: { type: DataTypes.STRING, allowNull: true },
  created_by: { type: DataTypes.INTEGER, allowNull: true },
}, { tableName: 'holds' });

const HoldItem = sequelize.define('HoldItem', {
  hold_id: { type: DataTypes.INTEGER, allowNull: false },
  product_id: { type: DataTypes.INTEGER, allowNull: false },
  quantity: { type: DataTypes.DOUBLE, allowNull: false },
  price: money,
}, { tableName: 'hold_items' });

/* ============================================================
   POS REGISTER (cash drawer per shift)
   ============================================================ */
const POSRegister = sequelize.define('POSRegister', {
  user_id: { type: DataTypes.INTEGER, allowNull: false },
  warehouse_id: { type: DataTypes.INTEGER, allowNull: false },
  opening_balance: money,
  closing_balance: money,
  cash_in_hand: money,
  status: { type: DataTypes.ENUM('open', 'closed'), defaultValue: 'open' },
  opened_at: { type: DataTypes.DATE, allowNull: false },
  closed_at: { type: DataTypes.DATE, allowNull: true },
  notes: { type: DataTypes.TEXT, allowNull: true },
}, { tableName: 'pos_registers' });

/* ============================================================
   EXPENSES
   ============================================================ */
const ExpenseCategory = sequelize.define('ExpenseCategory', {
  name: { type: DataTypes.STRING, allowNull: false },
  description: { type: DataTypes.TEXT, allowNull: true },
}, { tableName: 'expense_categories' });

const Expense = sequelize.define('Expense', {
  expense_category_id: { type: DataTypes.INTEGER, allowNull: false },
  warehouse_id: { type: DataTypes.INTEGER, allowNull: true },
  title: { type: DataTypes.STRING, allowNull: false }, // e.g. "Electricity bill", "Shop rent"
  date: { type: DataTypes.DATEONLY, allowNull: false },
  amount: money,
  notes: { type: DataTypes.TEXT, allowNull: true },
}, { tableName: 'expenses' });

/* ============================================================
   COUPONS
   ============================================================ */
const CouponCode = sequelize.define('CouponCode', {
  code: { type: DataTypes.STRING, allowNull: false, unique: true },
  type: { type: DataTypes.ENUM('percentage', 'fixed'), defaultValue: 'percentage' },
  value: { type: DataTypes.DOUBLE, allowNull: false },
  start_date: { type: DataTypes.DATEONLY, allowNull: true },
  end_date: { type: DataTypes.DATEONLY, allowNull: true },
  minimum_spend: money,
  is_active: { type: DataTypes.BOOLEAN, defaultValue: true },
}, { tableName: 'coupon_codes' });

module.exports = {
  Purchase, PurchaseItem, PurchaseReturn, PurchaseReturnItem,
  Sale, SaleItem, SalesPayment, SaleReturn, SaleReturnItem,
  Transfer, TransferItem, Adjustment, AdjustmentItem,
  Quotation, QuotationItem, Hold, HoldItem,
  POSRegister, ExpenseCategory, Expense, CouponCode,
};
