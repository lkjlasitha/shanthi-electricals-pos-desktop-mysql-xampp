const { Op } = require('../database/mongoOrm');
const {
  Sale, SaleItem, SalesPayment, CustomerPayment, POSRegister,
  Purchase, PurchasePayment, Customer, Supplier, Product, ManageStock, Expense,
  SaleReturn, PurchaseReturn, Warehouse,
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

function sumRows(rows, field) {
  return rows.reduce((sum, row) => sum + asNumber(row[field]), 0);
}

function groupByKey(rows, key, valueField) {
  const grouped = new Map();
  for (const row of rows) grouped.set(String(row[key]), (grouped.get(String(row[key])) || 0) + asNumber(row[valueField]));
  return grouped;
}

const summary = asyncHandler(async (req, res) => {
  const today = sriLankaDate();
  const startOfMonth = `${today.slice(0, 7)}-01`;
  const weekStart = addDays(today, -6);
  const sixMonthStart = `${addMonths(today, -5)}-01`;
  const warehouseId = req.query.warehouse_id ? Number(req.query.warehouse_id) : null;
  const warehouseWhere = warehouseId ? { warehouse_id: warehouseId } : {};
  const purchaseWhere = { ...warehouseWhere, status: { [Op.ne]: 'cancelled' } };

  const [
    sales, purchases, saleReturns, purchaseReturns, expenses, salePayments,
    accountPayments, registers, purchasePayments, customerCount, supplierCount,
    productCount, recentSales, productsWithStock,
  ] = await Promise.all([
    Sale.findAll({ where: { ...warehouseWhere, date: { [Op.between]: [sixMonthStart, today] } } }),
    Purchase.findAll({ where: { ...purchaseWhere, date: { [Op.between]: [sixMonthStart, today] } } }),
    SaleReturn.findAll({ where: { ...warehouseWhere, date: { [Op.between]: [startOfMonth, today] } } }),
    PurchaseReturn.findAll({ where: { ...warehouseWhere, date: { [Op.between]: [startOfMonth, today] } } }),
    Expense.findAll({ where: { ...warehouseWhere, date: { [Op.between]: [sixMonthStart, today] } } }),
    SalesPayment.findAll({ where: { paid_on: today } }),
    CustomerPayment.findAll({ where: { paid_on: today } }),
    POSRegister.findAll(),
    PurchasePayment.findAll({ where: { paid_on: today } }),
    Customer.count(), Supplier.count(), Product.count({ where: { is_active: true } }),
    Sale.findAll({
      where: warehouseWhere,
      include: [{ model: Customer, attributes: ['id', 'name'] }, { model: Warehouse, attributes: ['id', 'name'] }],
      order: [['id', 'DESC']], limit: 8,
    }),
    Product.findAll({
      where: { is_active: true },
      attributes: ['id', 'name', 'code', 'stock_alert', 'product_cost', 'product_price'],
      include: [{ model: ManageStock, attributes: ['warehouse_id', 'quantity'], ...(warehouseId ? { where: { warehouse_id: warehouseId } } : {}) }],
    }),
  ]);

  const saleMap = new Map(sales.map((row) => [Number(row.id), row]));
  const purchaseMap = new Map(purchases.map((row) => [Number(row.id), row]));
  const registerMap = new Map(registers.map((row) => [Number(row.id), row]));
  const eligibleSalePayments = salePayments.filter((row) => !warehouseId || Number(saleMap.get(Number(row.sale_id))?.warehouse_id) === warehouseId);
  const eligibleAccountPayments = accountPayments.filter((row) => !warehouseId || Number(registerMap.get(Number(row.pos_register_id))?.warehouse_id) === warehouseId);
  const todayReceived = sumRows(eligibleSalePayments, 'amount') + eligibleAccountPayments.reduce((sum, row) => sum + asNumber(row.opening_balance_amount ?? row.amount), 0);

  const todaySalesRows = sales.filter((row) => row.date === today);
  const todayPurchaseRows = purchases.filter((row) => row.date === today);
  const monthSalesRows = sales.filter((row) => row.date >= startOfMonth);
  const monthPurchaseRows = purchases.filter((row) => row.date >= startOfMonth);
  const monthExpenseRows = expenses.filter((row) => row.date >= startOfMonth);
  const todaySaleReturnRows = saleReturns.filter((row) => row.date === today);
  const todayPurchaseReturnRows = purchaseReturns.filter((row) => row.date === today);

  const monthSaleIds = monthSalesRows.map((row) => row.id);
  const saleItems = monthSaleIds.length ? await SaleItem.findAll({ where: { sale_id: { [Op.in]: monthSaleIds }, product_id: { [Op.ne]: null } } }) : [];
  const products = await Product.findAll({ where: { id: { [Op.in]: [...new Set(saleItems.map((row) => row.product_id))] } } });
  const productMap = new Map(products.map((row) => [Number(row.id), row]));
  const topProductMap = new Map();
  for (const item of saleItems) {
    const product = productMap.get(Number(item.product_id));
    if (!product) continue;
    const current = topProductMap.get(product.id) || { id: product.id, name: product.name, code: product.code, total_quantity: 0, total_revenue: 0 };
    current.total_quantity += asNumber(item.quantity);
    current.total_revenue += asNumber(item.sub_total);
    topProductMap.set(product.id, current);
  }
  const topProducts = [...topProductMap.values()].sort((a, b) => b.total_quantity - a.total_quantity || b.total_revenue - a.total_revenue).slice(0, 7);

  const monthCustomerMap = new Map();
  const monthCustomers = await Customer.findAll({ where: { id: { [Op.in]: [...new Set(monthSalesRows.map((row) => row.customer_id))] } } });
  const customerMap = new Map(monthCustomers.map((row) => [Number(row.id), row]));
  for (const sale of monthSalesRows) {
    const customer = customerMap.get(Number(sale.customer_id));
    if (!customer) continue;
    const current = monthCustomerMap.get(customer.id) || { id: customer.id, name: customer.name, grand_total: 0, invoice_count: 0 };
    current.grand_total += asNumber(sale.grand_total);
    current.invoice_count += 1;
    monthCustomerMap.set(customer.id, current);
  }
  const topCustomers = [...monthCustomerMap.values()].sort((a, b) => b.grand_total - a.grand_total).slice(0, 5);

  const weeklySales = groupByKey(sales.filter((row) => row.date >= weekStart), 'date', 'grand_total');
  const weeklyPurchases = groupByKey(purchases.filter((row) => row.date >= weekStart), 'date', 'grand_total');
  const weeklyActivity = Array.from({ length: 7 }, (_, index) => {
    const date = addDays(weekStart, index);
    return { date, sales: weeklySales.get(date) || 0, purchases: weeklyPurchases.get(date) || 0 };
  });
  const salesByMonth = groupByKey(sales.map((row) => ({ ...row.toJSON(), month: row.date.slice(0, 7) })), 'month', 'grand_total');
  const purchasesByMonth = groupByKey(purchases.map((row) => ({ ...row.toJSON(), month: row.date.slice(0, 7) })), 'month', 'grand_total');
  const expensesByMonth = groupByKey(expenses.map((row) => ({ ...row.toJSON(), month: row.date.slice(0, 7) })), 'month', 'amount');
  const monthlyTrend = Array.from({ length: 6 }, (_, index) => {
    const month = addMonths(today, index - 5);
    const monthSales = salesByMonth.get(month) || 0;
    const monthPurchases = purchasesByMonth.get(month) || 0;
    const monthExpenses = expensesByMonth.get(month) || 0;
    return { month, sales: monthSales, purchases: monthPurchases, expenses: monthExpenses, net: monthSales - monthPurchases - monthExpenses };
  });

  let stockValue = 0;
  const lowStockProducts = productsWithStock.map((product) => {
    const row = product.toJSON();
    const totalStock = (row.ManageStocks || []).reduce((sum, stock) => sum + asNumber(stock.quantity), 0);
    stockValue += totalStock * asNumber(row.product_cost);
    return { ...row, total_stock: totalStock };
  }).filter((row) => row.stock_alert != null && row.total_stock <= asNumber(row.stock_alert))
    .sort((a, b) => a.total_stock - b.total_stock).slice(0, 10);

  const receivables = await getReceivablesTotals().catch(() => ({
    outstanding_receivables: 0, outstanding_from_sales: 0, outstanding_from_opening_balance: 0,
    overdue_receivables: 0, current_receivables: 0, customers_with_open_sales: 0,
  }));
  const openPurchases = purchases.map((row) => ({ row, due: Math.max(0, asNumber(row.grand_total) - asNumber(row.returned_amount) - asNumber(row.paid_amount)) }));
  const eligiblePurchasePayments = purchasePayments.filter((row) => !warehouseId || Number(purchaseMap.get(Number(row.purchase_id))?.warehouse_id) === warehouseId);
  const payables = {
    outstanding_payables: openPurchases.reduce((sum, item) => sum + item.due, 0),
    overdue_payables: openPurchases.filter((item) => item.due > 0.005 && item.row.due_date && item.row.due_date < today).reduce((sum, item) => sum + item.due, 0),
    open_supplier_bills: openPurchases.filter((item) => item.due > 0.005).length,
    supplier_payments_today: sumRows(eligiblePurchasePayments, 'amount'),
  };
  const todaySales = sumRows(todaySalesRows, 'grand_total');
  const todayPurchases = sumRows(todayPurchaseRows, 'grand_total');
  const todaySaleReturns = sumRows(todaySaleReturnRows, 'grand_total');
  const todayPurchaseReturns = sumRows(todayPurchaseReturnRows, 'grand_total');
  const monthSales = sumRows(monthSalesRows, 'grand_total');
  const monthPurchases = sumRows(monthPurchaseRows, 'grand_total');
  const monthExpenses = sumRows(monthExpenseRows, 'amount');
  const monthSaleReturns = sumRows(saleReturns, 'grand_total');
  const monthPurchaseReturns = sumRows(purchaseReturns, 'grand_total');
  const netMonthSales = monthSales - monthSaleReturns;
  const netMonthPurchases = monthPurchases - monthPurchaseReturns;

  res.json({ data: {
    today_sales: todaySales, today_purchases: todayPurchases,
    today_sale_returns: todaySaleReturns, today_purchase_returns: todayPurchaseReturns,
    today_expenses: sumRows(expenses.filter((row) => row.date === today), 'amount'), today_received: todayReceived,
    today_net_sales: todaySales - todaySaleReturns,
    month_sales: monthSales, month_purchases: monthPurchases, month_expenses: monthExpenses,
    month_sale_returns: monthSaleReturns, month_purchase_returns: monthPurchaseReturns,
    month_profit_estimate: netMonthSales - netMonthPurchases - monthExpenses,
    customer_count: customerCount, supplier_count: supplierCount, product_count: productCount,
    stock_value: stockValue, weekly_activity: weeklyActivity, monthly_trend: monthlyTrend,
    top_selling_products: topProducts, top_customers: topCustomers,
    low_stock_products: lowStockProducts, recent_sales: recentSales,
    ...receivables, ...payables,
  } });
});

module.exports = { summary, sriLankaDate, addDays, addMonths };
