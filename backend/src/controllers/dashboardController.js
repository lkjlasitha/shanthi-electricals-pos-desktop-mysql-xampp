const { Op, fn, col, QueryTypes } = require('sequelize');
const {
  Sale, Purchase, Customer, Supplier, Product, ManageStock, Expense,
  SaleReturn, PurchaseReturn, Warehouse, sequelize,
} = require('../models/associations');
const { asyncHandler } = require('../utils/helpers');

function sriLankaDate(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Colombo', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(date).reduce((result, part) => ({ ...result, [part.type]: part.value }), {});
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function addDays(isoDate, amount) {
  const date = new Date(`${isoDate}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + amount);
  return date.toISOString().slice(0, 10);
}

function addMonths(isoDate, amount) {
  const date = new Date(`${isoDate.slice(0, 7)}-01T00:00:00Z`);
  date.setUTCMonth(date.getUTCMonth() + amount);
  return date.toISOString().slice(0, 7);
}

function asNumber(value) {
  const number = Number(value || 0);
  return Number.isFinite(number) ? number : 0;
}

function rowsByKey(rows, key = 'date', value = 'total') {
  return new Map(rows.map((row) => [String(row[key]), asNumber(row[value])]));
}

const summary = asyncHandler(async (req, res) => {
  const today = sriLankaDate();
  const startOfMonth = `${today.slice(0, 7)}-01`;
  const weekStart = addDays(today, -6);
  const sixMonthStart = `${addMonths(today, -5)}-01`;
  const warehouseId = req.query.warehouse_id ? Number(req.query.warehouse_id) : null;
  const warehouseWhere = warehouseId ? { warehouse_id: warehouseId } : {};

  const [
    todaySales, todayPurchases, todaySaleReturns, todayPurchaseReturns,
    todayExpenses, todayReceived, monthSales, monthPurchases, monthExpenses,
    monthSaleReturns, monthPurchaseReturns, customerCount, supplierCount, productCount,
    weeklySalesRows, weeklyPurchaseRows, recentSales, productsWithStock,
  ] = await Promise.all([
    Sale.sum('grand_total', { where: { ...warehouseWhere, date: today } }),
    Purchase.sum('grand_total', { where: { ...warehouseWhere, date: today } }),
    SaleReturn.sum('grand_total', { where: { ...warehouseWhere, date: today } }),
    PurchaseReturn.sum('grand_total', { where: { ...warehouseWhere, date: today } }),
    Expense.sum('amount', { where: { ...warehouseWhere, date: today } }),
    Sale.sum('paid_amount', { where: { ...warehouseWhere, date: today } }),
    Sale.sum('grand_total', { where: { ...warehouseWhere, date: { [Op.between]: [startOfMonth, today] } } }),
    Purchase.sum('grand_total', { where: { ...warehouseWhere, date: { [Op.between]: [startOfMonth, today] } } }),
    Expense.sum('amount', { where: { ...warehouseWhere, date: { [Op.between]: [startOfMonth, today] } } }),
    SaleReturn.sum('grand_total', { where: { ...warehouseWhere, date: { [Op.between]: [startOfMonth, today] } } }),
    PurchaseReturn.sum('grand_total', { where: { ...warehouseWhere, date: { [Op.between]: [startOfMonth, today] } } }),
    Customer.count(),
    Supplier.count(),
    Product.count({ where: { is_active: true } }),
    Sale.findAll({
      attributes: ['date', [fn('SUM', col('grand_total')), 'total']],
      where: { ...warehouseWhere, date: { [Op.between]: [weekStart, today] } },
      group: ['date'], raw: true,
    }),
    Purchase.findAll({
      attributes: ['date', [fn('SUM', col('grand_total')), 'total']],
      where: { ...warehouseWhere, date: { [Op.between]: [weekStart, today] } },
      group: ['date'], raw: true,
    }),
    Sale.findAll({
      where: warehouseWhere,
      include: [
        { model: Customer, attributes: ['id', 'name'] },
        { model: Warehouse, attributes: ['id', 'name'] },
      ],
      order: [['id', 'DESC']], limit: 8,
    }),
    Product.findAll({
      where: { is_active: true },
      attributes: ['id', 'name', 'code', 'stock_alert', 'product_cost', 'product_price'],
      include: [{
        model: ManageStock,
        attributes: ['warehouse_id', 'quantity'],
        required: false,
        ...(warehouseId ? { where: { warehouse_id: warehouseId } } : {}),
      }],
    }),
  ]);

  const warehouseSql = warehouseId ? ' AND s.warehouse_id = :warehouseId' : '';
  const expenseWarehouseSql = warehouseId ? ' AND warehouse_id = :warehouseId' : '';
  const replacements = { startOfMonth, today, sixMonthStart, warehouseId };

  const [topProducts, topCustomers, monthlySales, monthlyPurchases, monthlyExpenses] = await Promise.all([
    sequelize.query(
      `SELECT p.id, p.name, p.code, COALESCE(SUM(si.quantity), 0) AS total_quantity, ` +
      `COALESCE(SUM(si.sub_total), 0) AS total_revenue ` +
      `FROM sale_items si INNER JOIN sales s ON s.id = si.sale_id ` +
      `INNER JOIN products p ON p.id = si.product_id ` +
      `WHERE s.date BETWEEN :startOfMonth AND :today${warehouseSql} ` +
      `GROUP BY p.id, p.name, p.code ORDER BY total_quantity DESC, total_revenue DESC LIMIT 7`,
      { type: QueryTypes.SELECT, replacements }
    ),
    sequelize.query(
      `SELECT c.id, c.name, COALESCE(SUM(s.grand_total), 0) AS grand_total, COUNT(s.id) AS invoice_count ` +
      `FROM customers c INNER JOIN sales s ON s.customer_id = c.id ` +
      `WHERE s.date BETWEEN :startOfMonth AND :today${warehouseSql} ` +
      `GROUP BY c.id, c.name ORDER BY grand_total DESC LIMIT 5`,
      { type: QueryTypes.SELECT, replacements }
    ),
    sequelize.query(
      `SELECT DATE_FORMAT(date, '%Y-%m') AS month_key, COALESCE(SUM(grand_total), 0) AS total ` +
      `FROM sales WHERE date BETWEEN :sixMonthStart AND :today${warehouseId ? ' AND warehouse_id = :warehouseId' : ''} ` +
      `GROUP BY month_key ORDER BY month_key`,
      { type: QueryTypes.SELECT, replacements }
    ),
    sequelize.query(
      `SELECT DATE_FORMAT(date, '%Y-%m') AS month_key, COALESCE(SUM(grand_total), 0) AS total ` +
      `FROM purchases WHERE date BETWEEN :sixMonthStart AND :today${warehouseId ? ' AND warehouse_id = :warehouseId' : ''} ` +
      `GROUP BY month_key ORDER BY month_key`,
      { type: QueryTypes.SELECT, replacements }
    ),
    sequelize.query(
      `SELECT DATE_FORMAT(date, '%Y-%m') AS month_key, COALESCE(SUM(amount), 0) AS total ` +
      `FROM expenses WHERE date BETWEEN :sixMonthStart AND :today${expenseWarehouseSql} ` +
      `GROUP BY month_key ORDER BY month_key`,
      { type: QueryTypes.SELECT, replacements }
    ),
  ]);

  const weeklySales = rowsByKey(weeklySalesRows);
  const weeklyPurchases = rowsByKey(weeklyPurchaseRows);
  const weeklyActivity = Array.from({ length: 7 }, (_, index) => {
    const date = addDays(weekStart, index);
    return { date, sales: weeklySales.get(date) || 0, purchases: weeklyPurchases.get(date) || 0 };
  });

  const salesByMonth = rowsByKey(monthlySales, 'month_key');
  const purchasesByMonth = rowsByKey(monthlyPurchases, 'month_key');
  const expensesByMonth = rowsByKey(monthlyExpenses, 'month_key');
  const monthlyTrend = Array.from({ length: 6 }, (_, index) => {
    const month = addMonths(today, index - 5);
    const sales = salesByMonth.get(month) || 0;
    const purchases = purchasesByMonth.get(month) || 0;
    const expenses = expensesByMonth.get(month) || 0;
    return { month, sales, purchases, expenses, net: sales - purchases - expenses };
  });

  let stockValue = 0;
  const lowStockProducts = productsWithStock.map((product) => {
    const row = product.toJSON();
    const totalStock = (row.ManageStocks || []).reduce((sum, stock) => sum + asNumber(stock.quantity), 0);
    stockValue += totalStock * asNumber(row.product_cost);
    return { ...row, total_stock: totalStock };
  }).filter((product) => product.stock_alert != null && product.total_stock <= asNumber(product.stock_alert))
    .sort((a, b) => a.total_stock - b.total_stock)
    .slice(0, 10);

  const netMonthSales = asNumber(monthSales) - asNumber(monthSaleReturns);
  const netMonthPurchases = asNumber(monthPurchases) - asNumber(monthPurchaseReturns);

  res.json({
    data: {
      today_sales: asNumber(todaySales),
      today_purchases: asNumber(todayPurchases),
      today_sale_returns: asNumber(todaySaleReturns),
      today_purchase_returns: asNumber(todayPurchaseReturns),
      today_expenses: asNumber(todayExpenses),
      today_received: asNumber(todayReceived),
      today_net_sales: asNumber(todaySales) - asNumber(todaySaleReturns),
      month_sales: asNumber(monthSales),
      month_purchases: asNumber(monthPurchases),
      month_expenses: asNumber(monthExpenses),
      month_sale_returns: asNumber(monthSaleReturns),
      month_purchase_returns: asNumber(monthPurchaseReturns),
      month_profit_estimate: netMonthSales - netMonthPurchases - asNumber(monthExpenses),
      customer_count: customerCount,
      supplier_count: supplierCount,
      product_count: productCount,
      stock_value: stockValue,
      weekly_activity: weeklyActivity,
      monthly_trend: monthlyTrend,
      top_selling_products: topProducts.map((row) => ({ ...row, total_quantity: asNumber(row.total_quantity), total_revenue: asNumber(row.total_revenue) })),
      top_customers: topCustomers.map((row) => ({ ...row, grand_total: asNumber(row.grand_total), invoice_count: Number(row.invoice_count || 0) })),
      low_stock_products: lowStockProducts,
      recent_sales: recentSales,
    },
  });
});

module.exports = { summary, sriLankaDate, addDays, addMonths };
