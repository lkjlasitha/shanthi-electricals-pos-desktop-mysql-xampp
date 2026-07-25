const { asyncHandler } = require('../utils/helpers');
const {
  salesReportData,
  purchasesReportData,
  productSalesReportData,
  stockReportData,
} = require('../services/reportDataService');

const salesReport = asyncHandler(async (req, res) => {
  const report = await salesReportData(req.query);
  res.json({ data: report.rows, totals: report.totals });
});

const purchaseReport = asyncHandler(async (req, res) => {
  const report = await purchasesReportData(req.query);
  res.json({ data: report.rows, totals: report.totals });
});

const productSalesReport = asyncHandler(async (req, res) => {
  const report = await productSalesReportData(req.query);
  res.json({ data: report.rows, totals: report.totals });
});

const stockReport = asyncHandler(async (req, res) => {
  const report = await stockReportData(req.query);
  res.json({ data: report.rows, totals: report.totals });
});

module.exports = { salesReport, purchaseReport, productSalesReport, stockReport };
