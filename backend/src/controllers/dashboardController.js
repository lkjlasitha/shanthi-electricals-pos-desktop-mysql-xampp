const { Op, fn, col } = require('../config/db');
const {
  Sale, Purchase, Customer, Supplier, Product, ManageStock, Expense,
  SaleReturn, PurchaseReturn, Warehouse, SalesPayment, CustomerPayment,
  POSRegister, SaleItem, PurchasePayment,
} = require('../models/associations');
const { asyncHandler } = require('../utils/helpers');
const { getReceivablesTotals } = require('../services/customerLedgerService');

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

function aggregateRows(rows, key, value) {
  const totals = new Map();
  for (const row of rows) totals.set(String(row[key]), (totals.get(String(row[key])) || 0) + asNumber(row[value]));
  return [...totals].map(([groupKey, total]) => ({ [key]: groupKey, total }));
}

const summary = asyncHandler(async (req, res) => {
  const today = sriLankaDate();
  const startOfMonth = `${today.slice(0, 7)}-01`;
  const weekStart = addDays(today, -6);
  const sixMonthStart = `${addMonths(today, -5)}-01`;
  const warehouseId = req.query.warehouse_id ? Number(req.query.warehouse_id) : null;
  const warehouseWhere = warehouseId ? { warehouse_id: warehouseId } : {};
  const purchaseWarehouseWhere = { ...warehouseWhere, status: { [Op.ne]: 'cancelled' } };
  const warehouseSales = warehouseId ? await Sale.findAll({ where: warehouseWhere, attributes: ['id'] }) : [];
  const warehouseSaleIds = warehouseSales.map((sale) => sale.id);
  const registers = warehouseId ? await POSRegister.findAll({ where: { warehouse_id: warehouseId } }) : [];
  const registerIds = registers.map((register) => register.id);

  const [
    todaySales, todayPurchases, todaySaleReturns, todayPurchaseReturns,
    todayExpenses, todayReceived, monthSales, monthPurchases, monthExpenses,
    monthSaleReturns, monthPurchaseReturns, customerCount, supplierCount, productCount,
    weeklySalesRows, weeklyPurchaseRows, recentSales, productsWithStock,
  ] = await Promise.all([
    Sale.sum('grand_total', { where: { ...warehouseWhere, date: today } }),
    Purchase.sum('grand_total', { where: { ...purchaseWarehouseWhere, date: today } }),
    SaleReturn.sum('grand_total', { where: { ...warehouseWhere, date: today } }),
    PurchaseReturn.sum('grand_total', { where: { ...warehouseWhere, date: today } }),
    Expense.sum('amount', { where: { ...warehouseWhere, date: today } }),
    Promise.all([
      SalesPayment.findAll({ where: { paid_on: today, ...(warehouseId ? { sale_id: { [Op.in]: warehouseSaleIds } } : {}) } }),
      CustomerPayment.findAll({ where: { paid_on: today, ...(warehouseId ? { pos_register_id: { [Op.in]: registerIds } } : {}) } }),
    ]).then(([salePayments, accountPayments]) => salePayments.reduce((sum, row) => sum + asNumber(row.amount), 0)
      + accountPayments.reduce((sum, row) => sum + asNumber(row.opening_balance_amount ?? row.amount), 0)),
    Sale.sum('grand_total', { where: { ...warehouseWhere, date: { [Op.between]: [startOfMonth, today] } } }),
    Purchase.sum('grand_total', { where: { ...purchaseWarehouseWhere, date: { [Op.between]: [startOfMonth, today] } } }),
    Expense.sum('amount', { where: { ...warehouseWhere, date: { [Op.between]: [startOfMonth, today] } } }),
    SaleReturn.sum('grand_total', { where: { ...warehouseWhere, date: { [Op.between]: [startOfMonth, today] } } }),
    PurchaseReturn.sum('grand_total', { where: { ...warehouseWhere, date: { [Op.between]: [startOfMonth, today] } } }),
    Customer.count(),
    Supplier.count(),
    Product.count({ where: { is_active: true } }),
    Sale.findAll({
      attributes: ['date', [fn('SUM', col('grand_total')), 'total']],
      where: { ...purchaseWarehouseWhere, date: { [Op.between]: [weekStart, today] } },
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

  const [periodSales, periodPurchases, periodExpenses] = await Promise.all([
    Sale.findAll({ where: { ...warehouseWhere, date: { [Op.between]: [sixMonthStart, today] } } }),
    Purchase.findAll({ where: { ...purchaseWarehouseWhere, date: { [Op.between]: [sixMonthStart, today] } } }),
    Expense.findAll({ where: { ...warehouseWhere, date: { [Op.between]: [sixMonthStart, today] } } }),
  ]);
  const monthSalesRows = periodSales.filter((sale) => sale.date >= startOfMonth);
  const monthSaleIds = monthSalesRows.map((sale) => sale.id);
  const [monthItems, productRows, customerRows] = await Promise.all([
    monthSaleIds.length ? SaleItem.findAll({ where: { sale_id: { [Op.in]: monthSaleIds }, product_id: { [Op.ne]: null } } }) : [],
    Product.findAll(), Customer.findAll(),
  ]);
  const productMap = new Map(productRows.map((row) => [Number(row.id), row]));
  const topMap = new Map();
  for (const item of monthItems) {
    const product = productMap.get(Number(item.product_id));
    if (!product) continue;
    const value = topMap.get(product.id) || { id: product.id, name: product.name, code: product.code, total_quantity: 0, total_revenue: 0 };
    value.total_quantity += asNumber(item.quantity); value.total_revenue += asNumber(item.sub_total); topMap.set(product.id, value);
  }
  const topProducts = [...topMap.values()].sort((a, b) => b.total_quantity - a.total_quantity || b.total_revenue - a.total_revenue).slice(0, 7);
  const customerMap = new Map(customerRows.map((row) => [Number(row.id), row]));
  const customerTotals = new Map();
  for (const sale of monthSalesRows) {
    const customer = customerMap.get(Number(sale.customer_id));
    if (!customer) continue;
    const value = customerTotals.get(customer.id) || { id: customer.id, name: customer.name, grand_total: 0, invoice_count: 0 };
    value.grand_total += asNumber(sale.grand_total); value.invoice_count += 1; customerTotals.set(customer.id, value);
  }
  const topCustomers = [...customerTotals.values()].sort((a, b) => b.grand_total - a.grand_total).slice(0, 5);
  const monthlySales = aggregateRows(periodSales.map((row) => ({ month_key: row.date.slice(0, 7), total: row.grand_total })), 'month_key', 'total');
  const monthlyPurchases = aggregateRows(periodPurchases.map((row) => ({ month_key: row.date.slice(0, 7), total: row.grand_total })), 'month_key', 'total');
  const monthlyExpenses = aggregateRows(periodExpenses.map((row) => ({ month_key: row.date.slice(0, 7), total: row.amount })), 'month_key', 'total');

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
  const receivables = await getReceivablesTotals().catch(() => ({
    outstanding_receivables: 0, outstanding_from_sales: 0, outstanding_from_opening_balance: 0,
    overdue_receivables: 0, current_receivables: 0, customers_with_open_sales: 0,
  }));
  const payablePurchases = await Purchase.findAll({ where: purchaseWarehouseWhere });
  const openBills = payablePurchases.map((purchase) => ({ purchase, due: Math.max(0, asNumber(purchase.grand_total) - asNumber(purchase.returned_amount) - asNumber(purchase.paid_amount)) })).filter((row) => row.due > 0.005);
  const payableIds = payablePurchases.map((purchase) => purchase.id);
  const supplierPayments = payableIds.length ? await PurchasePayment.findAll({ where: { paid_on: today, purchase_id: { [Op.in]: payableIds } } }) : [];
  const payables = {
    outstanding_payables: openBills.reduce((sum, row) => sum + row.due, 0),
    overdue_payables: openBills.filter(({ purchase }) => purchase.due_date && purchase.due_date < today).reduce((sum, row) => sum + row.due, 0),
    open_supplier_bills: openBills.length,
    supplier_payments_today: supplierPayments.reduce((sum, row) => sum + asNumber(row.amount), 0),
  };

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
      outstanding_receivables: receivables.outstanding_receivables,
      outstanding_from_sales: receivables.outstanding_from_sales,
      outstanding_from_opening_balance: receivables.outstanding_from_opening_balance,
      overdue_receivables: receivables.overdue_receivables,
      current_receivables: receivables.current_receivables,
      customers_with_open_sales: receivables.customers_with_open_sales,
      outstanding_payables: asNumber(payables?.outstanding_payables),
      overdue_payables: asNumber(payables?.overdue_payables),
      open_supplier_bills: Number(payables?.open_supplier_bills || 0),
      supplier_payments_today: asNumber(payables?.supplier_payments_today),
    },
  });
});

module.exports = { summary, sriLankaDate, addDays, addMonths };
