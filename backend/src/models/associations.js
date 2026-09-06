const core = require('./index');
const productModels = require('./products');
const txModels = require('./transactions');

const {
  Role, User, Warehouse, ProductCategory, Brand, BaseUnit, Unit,
  Currency, Customer, Supplier, Setting,
} = core;

const {
  MainProduct, Product, Variation, VariationType, VariationProduct, ManageStock, ProductPriceHistory,
} = productModels;

const {
  Purchase, PurchaseItem, PurchasePayment, PurchaseReturn, PurchaseReturnItem,
  Sale, SaleItem, SalesPayment, SaleReturn, SaleReturnItem,
  Transfer, TransferItem, Adjustment, AdjustmentItem,
  Quotation, QuotationItem, Hold, HoldItem, CustomerPayment,
  POSRegister, ExpenseCategory, Expense, CouponCode,
} = txModels;

/* ---------------- Auth / RBAC ---------------- */
Role.hasMany(User, { foreignKey: 'role_id' });
User.belongsTo(Role, { foreignKey: 'role_id' });
Warehouse.hasMany(User, { foreignKey: 'warehouse_id' });
User.belongsTo(Warehouse, { foreignKey: 'warehouse_id' });

/* ---------------- Units ---------------- */
BaseUnit.hasMany(Unit, { foreignKey: 'base_unit_id' });
Unit.belongsTo(BaseUnit, { foreignKey: 'base_unit_id' });

/* ---------------- Products ---------------- */
MainProduct.hasMany(Product, { foreignKey: 'main_product_id', as: 'variants' });
Product.belongsTo(MainProduct, { foreignKey: 'main_product_id' });

ProductCategory.hasMany(Product, { foreignKey: 'product_category_id' });
Product.belongsTo(ProductCategory, { foreignKey: 'product_category_id' });

Brand.hasMany(Product, { foreignKey: 'brand_id' });
Product.belongsTo(Brand, { foreignKey: 'brand_id' });

Product.belongsTo(Unit, { as: 'stockUnit', foreignKey: 'product_unit' });
Product.belongsTo(Unit, { as: 'saleUnit', foreignKey: 'sale_unit' });
Product.belongsTo(Unit, { as: 'purchaseUnit', foreignKey: 'purchase_unit' });

Variation.hasMany(VariationType, { foreignKey: 'variation_id', onDelete: 'CASCADE' });
VariationType.belongsTo(Variation, { foreignKey: 'variation_id' });

MainProduct.hasMany(VariationProduct, { foreignKey: 'main_product_id', onDelete: 'CASCADE' });
VariationProduct.belongsTo(MainProduct, { foreignKey: 'main_product_id' });
Product.hasMany(VariationProduct, { foreignKey: 'product_id', onDelete: 'CASCADE' });
VariationProduct.belongsTo(Product, { foreignKey: 'product_id' });
VariationProduct.belongsTo(Variation, { foreignKey: 'variation_id' });
VariationProduct.belongsTo(VariationType, { foreignKey: 'variation_type_id' });

Product.hasMany(ManageStock, { foreignKey: 'product_id', onDelete: 'CASCADE' });
ManageStock.belongsTo(Product, { foreignKey: 'product_id' });
Warehouse.hasMany(ManageStock, { foreignKey: 'warehouse_id', onDelete: 'CASCADE' });
ManageStock.belongsTo(Warehouse, { foreignKey: 'warehouse_id' });

Product.hasMany(ProductPriceHistory, { as: 'priceHistory', foreignKey: 'product_id', onDelete: 'CASCADE' });
ProductPriceHistory.belongsTo(Product, { foreignKey: 'product_id' });
User.hasMany(ProductPriceHistory, { as: 'priceChanges', foreignKey: 'changed_by' });
ProductPriceHistory.belongsTo(User, { as: 'changedBy', foreignKey: 'changed_by' });

/* ---------------- Purchases ---------------- */
Supplier.hasMany(Purchase, { foreignKey: 'supplier_id' });
Purchase.belongsTo(Supplier, { foreignKey: 'supplier_id' });
Warehouse.hasMany(Purchase, { foreignKey: 'warehouse_id' });
Purchase.belongsTo(Warehouse, { foreignKey: 'warehouse_id' });
Purchase.hasMany(PurchaseItem, { foreignKey: 'purchase_id', onDelete: 'CASCADE', as: 'items' });
PurchaseItem.belongsTo(Purchase, { foreignKey: 'purchase_id' });
PurchaseItem.belongsTo(Product, { foreignKey: 'product_id' });
Purchase.hasMany(PurchasePayment, { foreignKey: 'purchase_id', onDelete: 'CASCADE', as: 'payments' });
PurchasePayment.belongsTo(Purchase, { foreignKey: 'purchase_id' });
User.hasMany(PurchasePayment, { foreignKey: 'created_by' });
PurchasePayment.belongsTo(User, { as: 'createdBy', foreignKey: 'created_by' });
ProductPriceHistory.belongsTo(Purchase, { foreignKey: 'purchase_id' });
Purchase.hasMany(ProductPriceHistory, { as: 'priceChanges', foreignKey: 'purchase_id' });

PurchaseReturn.belongsTo(Purchase, { foreignKey: 'purchase_id' });
PurchaseReturn.belongsTo(Supplier, { foreignKey: 'supplier_id' });
PurchaseReturn.belongsTo(Warehouse, { foreignKey: 'warehouse_id' });
PurchaseReturn.hasMany(PurchaseReturnItem, { foreignKey: 'purchase_return_id', onDelete: 'CASCADE', as: 'items' });
PurchaseReturnItem.belongsTo(PurchaseReturn, { foreignKey: 'purchase_return_id' });
PurchaseReturnItem.belongsTo(Product, { foreignKey: 'product_id' });

/* ---------------- Sales ---------------- */
Customer.hasMany(Sale, { foreignKey: 'customer_id' });
Sale.belongsTo(Customer, { foreignKey: 'customer_id' });
Warehouse.hasMany(Sale, { foreignKey: 'warehouse_id' });
Sale.belongsTo(Warehouse, { foreignKey: 'warehouse_id' });
Sale.belongsTo(POSRegister, { foreignKey: 'pos_register_id' });
Sale.hasMany(SaleItem, { foreignKey: 'sale_id', onDelete: 'CASCADE', as: 'items' });
SaleItem.belongsTo(Sale, { foreignKey: 'sale_id' });
SaleItem.belongsTo(Product, { foreignKey: 'product_id' });
SaleItem.belongsTo(Unit, { as: 'saleUnitRef', foreignKey: 'sale_unit_id' });
Sale.hasMany(SalesPayment, { foreignKey: 'sale_id', onDelete: 'CASCADE', as: 'payments' });
SalesPayment.belongsTo(Sale, { foreignKey: 'sale_id' });

SaleReturn.belongsTo(Sale, { foreignKey: 'sale_id' });
SaleReturn.belongsTo(Customer, { foreignKey: 'customer_id' });
SaleReturn.belongsTo(Warehouse, { foreignKey: 'warehouse_id' });
SaleReturn.hasMany(SaleReturnItem, { foreignKey: 'sale_return_id', onDelete: 'CASCADE', as: 'items' });
SaleReturnItem.belongsTo(SaleReturn, { foreignKey: 'sale_return_id' });
SaleReturnItem.belongsTo(Product, { foreignKey: 'product_id' });

/* ---------------- Transfers & Adjustments ---------------- */
Transfer.belongsTo(Warehouse, { as: 'fromWarehouse', foreignKey: 'from_warehouse_id' });
Transfer.belongsTo(Warehouse, { as: 'toWarehouse', foreignKey: 'to_warehouse_id' });
Transfer.hasMany(TransferItem, { foreignKey: 'transfer_id', onDelete: 'CASCADE', as: 'items' });
TransferItem.belongsTo(Product, { foreignKey: 'product_id' });
Transfer.belongsTo(User, { as: 'createdBy', foreignKey: 'created_by' });

Adjustment.belongsTo(Warehouse, { foreignKey: 'warehouse_id' });
Adjustment.hasMany(AdjustmentItem, { foreignKey: 'adjustment_id', onDelete: 'CASCADE', as: 'items' });
AdjustmentItem.belongsTo(Product, { foreignKey: 'product_id' });
Adjustment.belongsTo(User, { as: 'createdBy', foreignKey: 'created_by' });

/* ---------------- Quotations & Holds ---------------- */
Quotation.belongsTo(Customer, { foreignKey: 'customer_id' });
Quotation.belongsTo(Warehouse, { foreignKey: 'warehouse_id' });
Quotation.belongsTo(Sale, { as: 'convertedSale', foreignKey: 'converted_sale_id' });
Quotation.hasMany(QuotationItem, { foreignKey: 'quotation_id', onDelete: 'CASCADE', as: 'items' });
QuotationItem.belongsTo(Product, { foreignKey: 'product_id' });
QuotationItem.belongsTo(Quotation, { foreignKey: 'quotation_id' });
QuotationItem.belongsTo(Unit, { as: 'saleUnitRef', foreignKey: 'sale_unit_id' });

Hold.belongsTo(Warehouse, { foreignKey: 'warehouse_id' });
Hold.belongsTo(Customer, { foreignKey: 'customer_id' });
Hold.hasMany(HoldItem, { foreignKey: 'hold_id', onDelete: 'CASCADE', as: 'items' });
HoldItem.belongsTo(Product, { foreignKey: 'product_id' });

/* ---------------- Customer account payments ---------------- */
Customer.hasMany(CustomerPayment, { foreignKey: 'customer_id', onDelete: 'CASCADE', as: 'accountPayments' });
CustomerPayment.belongsTo(Customer, { foreignKey: 'customer_id' });
CustomerPayment.hasMany(SalesPayment, { foreignKey: 'customer_payment_id', as: 'allocations' });
SalesPayment.belongsTo(CustomerPayment, { foreignKey: 'customer_payment_id', as: 'customerPayment' });

/* ---------------- Register & Expenses ---------------- */
User.hasMany(POSRegister, { foreignKey: 'user_id' });
POSRegister.belongsTo(User, { foreignKey: 'user_id' });
Warehouse.hasMany(POSRegister, { foreignKey: 'warehouse_id' });
POSRegister.belongsTo(Warehouse, { foreignKey: 'warehouse_id' });
POSRegister.hasMany(SalesPayment, { foreignKey: 'pos_register_id', as: 'receivedSalePayments' });
SalesPayment.belongsTo(POSRegister, { foreignKey: 'pos_register_id' });
POSRegister.hasMany(CustomerPayment, { foreignKey: 'pos_register_id', as: 'receivedCustomerPayments' });
CustomerPayment.belongsTo(POSRegister, { foreignKey: 'pos_register_id' });

ExpenseCategory.hasMany(Expense, { foreignKey: 'expense_category_id' });
Expense.belongsTo(ExpenseCategory, { foreignKey: 'expense_category_id' });
Expense.belongsTo(Warehouse, { foreignKey: 'warehouse_id' });

// `sequelize.transaction(async (t) => {...})` is used throughout the
// controllers exactly as it was with real Sequelize; it now runs a MongoDB
// session/transaction underneath. Exporting it here (as before) means no
// controller import line needs to change.
const { sequelize } = require('../config/sequelizeCompat');

module.exports = {
  ...core,
  ...productModels,
  ...txModels,
  sequelize,
};
