const { Op, getRawCollection } = require('../config/sequelizeCompat');
const {
  Sale, Purchase, Customer, Supplier, Product, ManageStock, Expense,
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

function rowsByKey(rows, key = 'date', value = 'total') {
  return new Map(rows.map((row) => [String(row[key]), asNumber(row[value])]));
}

// Sums `valueField` from `docs` grouped by a date/month key. `keyFn` turns
// each document's date into the grouping key (a day string or 'YYYY-MM').
function sumByKey(docs, keyFn, valueField) {
  const totals = new Map();
  for (const doc of docs) {
    const key = keyFn(doc);
    totals.set(key, (totals.get(key) || 0) + asNumber(doc[valueField]));
  }
  return Array.from(totals.entries()).map(([key, total]) => ({ key, total }));
}

const summary = asyncHandler(async (req, res) => {
  const today = sriLankaDate();
  const startOfMonth = `${today.slice(0, 7)}-01`;
  const weekStart = addDays(today, -6);
  const sixMonthStart = `${addMonths(today, -5)}-01`;
  const warehouseId = req.query.warehouse_id ? Number(req.query.warehouse_id) : null;
  const warehouseWhere = warehouseId ? { warehouse_id: warehouseId } : {};
  const purchaseWarehouseWhere = { ...warehouseWhere, status: { [Op.ne]: 'cancelled' } };

  // ---- Money received today (invoice payments + opening-balance payments) ----
  // Only the opening-balance portion of a customer_payment is counted here;
  // invoice-allocated portions already exist as sales_payments rows and must
  // not be counted twice.
  async function totalReceivedToday() {
    const salesPaymentsCol = await getRawCollection('sales_payments');
    const salesPayments = await salesPaymentsCol.find({ paid_on: today }, { projection: { amount: 1, sale_id: 1 } }).toArray();
    let invoicePortion = 0;
    if (salesPayments.length) {
      if (warehouseId) {
        const saleIds = [...new Set(salesPayments.map((p) => p.sale_id))];
        const matchingSales = await Sale.findAll({ where: { id: { [Op.in]: saleIds }, warehouse_id: warehouseId }, attributes: ['id'] });
        const allowedIds = new Set(matchingSales.map((s) => s.id));
        invoicePortion = salesPayments.filter((p) => allowedIds.has(p.sale_id)).reduce((sum, p) => sum + asNumber(p.amount), 0);
      } else {
        invoicePortion = salesPayments.reduce((sum, p) => sum + asNumber(p.amount), 0);
      }
    }

    const customerPaymentsCol = await getRawCollection('customer_payments');
    const customerPayments = await customerPaymentsCol.find({ paid_on: today }, {
      projection: { amount: 1, opening_balance_amount: 1, pos_register_id: 1 },
    }).toArray();
    let openingPortion = 0;
    if (customerPayments.length) {
      let allowedRegisterIds = null;
      if (warehouseId) {
        const registersCol = await getRawCollection('pos_registers');
        const registers = await registersCol.find({ warehouse_id: warehouseId }, { projection: { id: 1 } }).toArray();
        allowedRegisterIds = new Set(registers.map((r) => r.id));
      }
      openingPortion = customerPayments
        .filter((p) => !allowedRegisterIds || allowedRegisterIds.has(p.pos_register_id))
        .reduce((sum, p) => sum + (p.opening_balance_amount === null || p.opening_balance_amount === undefined ? asNumber(p.amount) : asNumber(p.opening_balance_amount)), 0);
    }

    return invoicePortion + openingPortion;
  }

  const [
    todaySales, todayPurchases, todaySaleReturns, todayPurchaseReturns,
    todayExpenses, todayReceived, monthSales, monthPurchases, monthExpenses,
    monthSaleReturns, monthPurchaseReturns, customerCount, supplierCount, productCount,
    weekSales, weekPurchases, recentSales, productsWithStock,
  ] = await Promise.all([
    Sale.sum('grand_total', { where: { ...warehouseWhere, date: today } }),
    Purchase.sum('grand_total', { where: { ...purchaseWarehouseWhere, date: today } }),
    SaleReturn.sum('grand_total', { where: { ...warehouseWhere, date: today } }),
    PurchaseReturn.sum('grand_total', { where: { ...warehouseWhere, date: today } }),
    Expense.sum('amount', { where: { ...warehouseWhere, date: today } }),
    totalReceivedToday(),
    Sale.sum('grand_total', { where: { ...warehouseWhere, date: { [Op.between]: [startOfMonth, today] } } }),
    Purchase.sum('grand_total', { where: { ...purchaseWarehouseWhere, date: { [Op.between]: [startOfMonth, today] } } }),
    Expense.sum('amount', { where: { ...warehouseWhere, date: { [Op.between]: [startOfMonth, today] } } }),
    SaleReturn.sum('grand_total', { where: { ...warehouseWhere, date: { [Op.between]: [startOfMonth, today] } } }),
    PurchaseReturn.sum('grand_total', { where: { ...warehouseWhere, date: { [Op.between]: [startOfMonth, today] } } }),
    Customer.count(),
    Supplier.count(),
    Product.count({ where: { is_active: true } }),
    Sale.findAll({ where: { ...warehouseWhere, date: { [Op.between]: [weekStart, today] } }, attributes: ['date', 'grand_total'] }),
    Purchase.findAll({ where: { ...warehouseWhere, date: { [Op.between]: [weekStart, today] } }, attributes: ['date', 'grand_total'] }),
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

  const weeklySalesRows = sumByKey(weekSales, (row) => row.date, 'grand_total');
  const weeklyPurchaseRows = sumByKey(weekPurchases, (row) => row.date, 'grand_total');
  const weeklySales = rowsByKey(weeklySalesRows, 'key');
  const weeklyPurchases = rowsByKey(weeklyPurchaseRows, 'key');
  const weeklyActivity = Array.from({ length: 7 }, (_, index) => {
    const date = addDays(weekStart, index);
    return { date, sales: weeklySales.get(date) || 0, purchases: weeklyPurchases.get(date) || 0 };
  });

  // ---- Top-selling products & top customers this month ----
  const monthSalesForWarehouse = await Sale.findAll({
    where: { ...warehouseWhere, date: { [Op.between]: [startOfMonth, today] } },
    attributes: ['id', 'customer_id', 'grand_total'],
  });
  const monthSaleIds = monthSalesForWarehouse.map((sale) => sale.id);

  const topProducts = [];
  if (monthSaleIds.length) {
    const saleItemsCol = await getRawCollection('sale_items');
    const items = await saleItemsCol.find(
      { sale_id: { $in: monthSaleIds }, product_id: { $ne: null } },
      { projection: { product_id: 1, quantity: 1, sub_total: 1 } }
    ).toArray();
    const byProduct = new Map();
    for (const item of items) {
      const bucket = byProduct.get(item.product_id) || { total_quantity: 0, total_revenue: 0 };
      bucket.total_quantity += asNumber(item.quantity);
      bucket.total_revenue += asNumber(item.sub_total);
      byProduct.set(item.product_id, bucket);
    }
    const productIds = [...byProduct.keys()];
    if (productIds.length) {
      const products = await Product.findAll({ where: { id: { [Op.in]: productIds } }, attributes: ['id', 'name', 'code'] });
      const productById = new Map(products.map((p) => [p.id, p]));
      topProducts.push(...productIds
        .map((id) => ({ id, name: productById.get(id)?.name, code: productById.get(id)?.code, ...byProduct.get(id) }))
        .sort((a, b) => (b.total_quantity - a.total_quantity) || (b.total_revenue - a.total_revenue))
        .slice(0, 7));
    }
  }

  const topCustomersMap = new Map();
  for (const sale of monthSalesForWarehouse) {
    const bucket = topCustomersMap.get(sale.customer_id) || { grand_total: 0, invoice_count: 0 };
    bucket.grand_total += asNumber(sale.grand_total);
    bucket.invoice_count += 1;
    topCustomersMap.set(sale.customer_id, bucket);
  }
  const topCustomerIds = [...topCustomersMap.keys()].sort((a, b) => topCustomersMap.get(b).grand_total - topCustomersMap.get(a).grand_total).slice(0, 5);
  const topCustomerRecords = topCustomerIds.length ? await Customer.findAll({ where: { id: { [Op.in]: topCustomerIds } }, attributes: ['id', 'name'] }) : [];
  const customerNameById = new Map(topCustomerRecords.map((c) => [c.id, c.name]));
  const topCustomers = topCustomerIds.map((id) => ({ id, name: customerNameById.get(id), ...topCustomersMap.get(id) }));

  // ---- 6-month trend ----
  const [sixMonthSales, sixMonthPurchases, sixMonthExpenses] = await Promise.all([
    Sale.findAll({ where: { ...warehouseWhere, date: { [Op.between]: [sixMonthStart, today] } }, attributes: ['date', 'grand_total'] }),
    Purchase.findAll({ where: { ...purchaseWarehouseWhere, date: { [Op.between]: [sixMonthStart, today] } }, attributes: ['date', 'grand_total'] }),
    Expense.findAll({ where: { ...warehouseWhere, date: { [Op.between]: [sixMonthStart, today] } }, attributes: ['date', 'amount'] }),
  ]);
  const monthKey = (row) => String(row.date).slice(0, 7);
  const salesByMonth = rowsByKey(sumByKey(sixMonthSales, monthKey, 'grand_total'), 'key');
  const purchasesByMonth = rowsByKey(sumByKey(sixMonthPurchases, monthKey, 'grand_total'), 'key');
  const expensesByMonth = rowsByKey(sumByKey(sixMonthExpenses, monthKey, 'amount'), 'key');
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

  // ---- Payables (money owed to suppliers) ----
  const openPurchases = await Purchase.findAll({
    where: purchaseWarehouseWhere,
    attributes: ['id', 'grand_total', 'returned_amount', 'paid_amount', 'due_date'],
  });
  let outstandingPayables = 0;
  let overduePayables = 0;
  let openSupplierBills = 0;
  for (const purchase of openPurchases) {
    const due = Math.max(asNumber(purchase.grand_total) - asNumber(purchase.returned_amount) - asNumber(purchase.paid_amount), 0);
    if (due <= 0.005) continue;
    outstandingPayables += due;
    openSupplierBills += 1;
    if (purchase.due_date && purchase.due_date < today) overduePayables += due;
  }
  const purchasePaymentsCol = await getRawCollection('purchase_payments');
  const todaysPurchasePayments = await purchasePaymentsCol.find({ paid_on: today }, { projection: { amount: 1, purchase_id: 1 } }).toArray();
  let supplierPaymentsToday = 0;
  if (todaysPurchasePayments.length) {
    if (warehouseId) {
      const purchaseIds = [...new Set(todaysPurchasePayments.map((p) => p.purchase_id))];
      const matchingPurchases = await Purchase.findAll({ where: { id: { [Op.in]: purchaseIds }, warehouse_id: warehouseId }, attributes: ['id'] });
      const allowedIds = new Set(matchingPurchases.map((p) => p.id));
      supplierPaymentsToday = todaysPurchasePayments.filter((p) => allowedIds.has(p.purchase_id)).reduce((sum, p) => sum + asNumber(p.amount), 0);
    } else {
      supplierPaymentsToday = todaysPurchasePayments.reduce((sum, p) => sum + asNumber(p.amount), 0);
    }
  }

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
      top_selling_products: topProducts,
      top_customers: topCustomers,
      low_stock_products: lowStockProducts,
      recent_sales: recentSales,
      outstanding_receivables: receivables.outstanding_receivables,
      outstanding_from_sales: receivables.outstanding_from_sales,
      outstanding_from_opening_balance: receivables.outstanding_from_opening_balance,
      overdue_receivables: receivables.overdue_receivables,
      current_receivables: receivables.current_receivables,
      customers_with_open_sales: receivables.customers_with_open_sales,
      outstanding_payables: outstandingPayables,
      overdue_payables: overduePayables,
      open_supplier_bills: openSupplierBills,
      supplier_payments_today: supplierPaymentsToday,
    },
  });
});

module.exports = { summary, sriLankaDate, addDays, addMonths };
