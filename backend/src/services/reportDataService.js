const { todayISO } = require('../utils/date');
const { Op } = require('../config/sequelizeCompat');
const {
  Sale, SaleItem, Purchase, Product, ManageStock, Warehouse, ProductCategory,
} = require('../models/associations');
const HttpError = require('../utils/httpError');

function asNumber(value) {
  const number = Number(value || 0);
  return Number.isFinite(number) ? number : 0;
}

function dateRange(query = {}) {
  const from = query.from_date || '1970-01-01';
  const to = query.to_date || todayISO();
  if (from > to) throw new HttpError(422, 'From date must not be after to date.');
  return { from, to, condition: { [Op.between]: [from, to] } };
}

async function salesReportData(query = {}) {
  const range = dateRange(query);
  const where = { date: range.condition };
  if (query.warehouse_id) where.warehouse_id = query.warehouse_id;
  const sales = await Sale.findAll({ where, attributes: ['date', 'grand_total', 'paid_amount'] });

  const byDate = new Map();
  for (const sale of sales) {
    const bucket = byDate.get(sale.date) || { invoice_count: 0, total_sales: 0, total_paid: 0 };
    bucket.invoice_count += 1;
    bucket.total_sales += asNumber(sale.grand_total);
    bucket.total_paid += asNumber(sale.paid_amount);
    byDate.set(sale.date, bucket);
  }
  const data = [...byDate.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([date, bucket]) => ({
      date,
      invoice_count: bucket.invoice_count,
      total_sales: bucket.total_sales,
      total_paid: bucket.total_paid,
      balance: bucket.total_sales - bucket.total_paid,
    }));

  return {
    key: 'sales', title: 'Sales Report', range,
    columns: [
      { key: 'date', label: 'Date', type: 'date' },
      { key: 'invoice_count', label: 'Invoices', type: 'number' },
      { key: 'total_sales', label: 'Total Sales', type: 'money' },
      { key: 'total_paid', label: 'Paid', type: 'money' },
      { key: 'balance', label: 'Balance', type: 'money' },
    ],
    rows: data,
    totals: {
      invoice_count: data.reduce((sum, row) => sum + row.invoice_count, 0),
      total_sales: data.reduce((sum, row) => sum + row.total_sales, 0),
      total_paid: data.reduce((sum, row) => sum + row.total_paid, 0),
      balance: data.reduce((sum, row) => sum + row.balance, 0),
    },
  };
}

async function purchasesReportData(query = {}) {
  const range = dateRange(query);
  const where = { date: range.condition, status: { [Op.ne]: 'cancelled' } };
  if (query.warehouse_id) where.warehouse_id = query.warehouse_id;
  const purchases = await Purchase.findAll({ where, attributes: ['date', 'grand_total', 'returned_amount', 'paid_amount'] });

  const byDate = new Map();
  for (const purchase of purchases) {
    const bucket = byDate.get(purchase.date) || { purchase_count: 0, total_purchases: 0, total_returns: 0, total_paid: 0 };
    bucket.purchase_count += 1;
    bucket.total_purchases += asNumber(purchase.grand_total);
    bucket.total_returns += asNumber(purchase.returned_amount);
    bucket.total_paid += asNumber(purchase.paid_amount);
    byDate.set(purchase.date, bucket);
  }
  const data = [...byDate.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([date, bucket]) => ({
      date,
      purchase_count: bucket.purchase_count,
      total_purchases: bucket.total_purchases,
      total_returns: bucket.total_returns,
      net_purchases: Math.max(0, bucket.total_purchases - bucket.total_returns),
      total_paid: bucket.total_paid,
      outstanding: Math.max(0, bucket.total_purchases - bucket.total_returns - bucket.total_paid),
    }));

  return {
    key: 'purchases', title: 'Purchases Report', range,
    columns: [
      { key: 'date', label: 'Date', type: 'date' },
      { key: 'purchase_count', label: 'Purchases', type: 'number' },
      { key: 'total_purchases', label: 'Total Purchases', type: 'money' },
      { key: 'total_returns', label: 'Return Credits', type: 'money' },
      { key: 'net_purchases', label: 'Net Purchases', type: 'money' },
      { key: 'total_paid', label: 'Paid', type: 'money' },
      { key: 'outstanding', label: 'Outstanding', type: 'money' },
    ],
    rows: data,
    totals: {
      purchase_count: data.reduce((sum, row) => sum + row.purchase_count, 0),
      total_purchases: data.reduce((sum, row) => sum + row.total_purchases, 0),
      total_returns: data.reduce((sum, row) => sum + row.total_returns, 0),
      net_purchases: data.reduce((sum, row) => sum + row.net_purchases, 0),
      total_paid: data.reduce((sum, row) => sum + row.total_paid, 0),
      outstanding: data.reduce((sum, row) => sum + row.outstanding, 0),
    },
  };
}

async function productSalesReportData(query = {}) {
  const range = dateRange(query);
  const saleWhere = { date: range.condition };
  if (query.warehouse_id) saleWhere.warehouse_id = query.warehouse_id;
  const limit = Math.min(Math.max(parseInt(query.limit || '200', 10) || 200, 1), 1000);

  const salesInRange = await Sale.findAll({ where: saleWhere, attributes: ['id'] });
  const saleIds = salesInRange.map((sale) => sale.id);

  const byProduct = new Map();
  if (saleIds.length) {
    // Manual one-off bill items are revenue, but are not catalogue products and
    // should not distort the best-selling inventory report.
    const items = await SaleItem.findAll({
      where: { sale_id: { [Op.in]: saleIds }, product_id: { [Op.ne]: null } },
      attributes: ['product_id', 'quantity', 'sub_total'],
    });
    for (const item of items) {
      const bucket = byProduct.get(item.product_id) || { total_quantity_sold: 0, total_revenue: 0 };
      bucket.total_quantity_sold += asNumber(item.quantity);
      bucket.total_revenue += asNumber(item.sub_total);
      byProduct.set(item.product_id, bucket);
    }
  }

  const aggregates = [...byProduct.entries()]
    .sort(([, a], [, b]) => b.total_revenue - a.total_revenue)
    .slice(0, limit);
  const productIds = aggregates.map(([productId]) => productId);
  const products = productIds.length
    ? await Product.findAll({
      where: { id: productIds },
      attributes: ['id', 'name', 'code'],
      include: [{ model: ProductCategory, attributes: ['id', 'name', 'code'] }],
    })
    : [];
  const productMap = new Map(products.map((product) => [Number(product.id), product.toJSON()]));
  const data = aggregates.map(([productId, bucket]) => {
    const product = productMap.get(Number(productId));
    return {
      product_id: Number(productId),
      product: product?.name || `Product #${productId}`,
      code: product?.code || '',
      category: product?.ProductCategory?.name || '',
      total_quantity_sold: bucket.total_quantity_sold,
      total_revenue: bucket.total_revenue,
      Product: product || null,
    };
  });

  return {
    key: 'product-sales', title: 'Best-Selling Products Report', range,
    columns: [
      { key: 'product', label: 'Product', type: 'text' },
      { key: 'code', label: 'Code', type: 'text' },
      { key: 'category', label: 'Category', type: 'text' },
      { key: 'total_quantity_sold', label: 'Quantity Sold', type: 'number' },
      { key: 'total_revenue', label: 'Revenue', type: 'money' },
    ],
    rows: data,
    totals: {
      total_quantity_sold: data.reduce((sum, row) => sum + row.total_quantity_sold, 0),
      total_revenue: data.reduce((sum, row) => sum + row.total_revenue, 0),
    },
  };
}

async function stockReportData(query = {}) {
  const where = {};
  if (query.warehouse_id) where.warehouse_id = query.warehouse_id;
  const stocks = await ManageStock.findAll({
    where,
    include: [
      { model: Product, attributes: ['id', 'name', 'code', 'product_cost', 'product_price'] },
      Warehouse,
    ],
    order: [[Warehouse, 'name', 'ASC'], [Product, 'name', 'ASC']],
  });
  const data = stocks.map((stock) => {
    const quantity = Number(stock.quantity || 0);
    const productCost = Number(stock.Product?.product_cost || 0);
    const productPrice = Number(stock.Product?.product_price || 0);
    return {
      warehouse: stock.Warehouse?.name || '',
      product: stock.Product?.name || '',
      code: stock.Product?.code || '',
      quantity,
      cost_value: productCost * quantity,
      retail_value: productPrice * quantity,
    };
  });
  return {
    key: 'stock', title: 'Current Stock Valuation Report', range: null,
    columns: [
      { key: 'warehouse', label: 'Warehouse', type: 'text' },
      { key: 'product', label: 'Product', type: 'text' },
      { key: 'code', label: 'Code', type: 'text' },
      { key: 'quantity', label: 'Quantity', type: 'number' },
      { key: 'cost_value', label: 'Cost Value', type: 'money' },
      { key: 'retail_value', label: 'Retail Value', type: 'money' },
    ],
    rows: data,
    totals: {
      quantity: data.reduce((sum, row) => sum + row.quantity, 0),
      cost_value: data.reduce((sum, row) => sum + row.cost_value, 0),
      retail_value: data.reduce((sum, row) => sum + row.retail_value, 0),
    },
  };
}

async function getReportData(type, query = {}) {
  switch (String(type || '').toLowerCase()) {
    case 'sales': return salesReportData(query);
    case 'purchases': return purchasesReportData(query);
    case 'product-sales':
    case 'top-products': return productSalesReportData(query);
    case 'stock':
    case 'stock-valuation': return stockReportData(query);
    default: throw new HttpError(404, 'Unsupported report type.');
  }
}

module.exports = {
  dateRange,
  salesReportData,
  purchasesReportData,
  productSalesReportData,
  stockReportData,
  getReportData,
};
