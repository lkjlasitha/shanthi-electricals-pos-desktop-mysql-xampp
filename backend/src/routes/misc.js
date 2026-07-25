const express = require('express');
const router = express.Router();
const expenseController = require('../controllers/expenseController');
const dashboardController = require('../controllers/dashboardController');
const reportController = require('../controllers/reportController');
const reportExportController = require('../controllers/reportExportController');
const settingController = require('../controllers/settingController');
const crudFactory = require('../utils/crudFactory');
const { ExpenseCategory } = require('../models/associations');
const { authenticate, requirePermission } = require('../middleware/auth');

router.use(authenticate);

// Expenses
router.get('/expenses', expenseController.list);
router.post('/expenses', requirePermission('expenses.manage'), expenseController.create);
router.put('/expenses/:id', requirePermission('expenses.manage'), expenseController.update);
router.delete('/expenses/:id', requirePermission('expenses.manage'), expenseController.remove);

const categoryHandlers = crudFactory(ExpenseCategory, { order: [['name', 'ASC']] });
router.get('/expense-categories', categoryHandlers.list);
router.post('/expense-categories', requirePermission('expenses.manage'), categoryHandlers.create);
router.put('/expense-categories/:id', requirePermission('expenses.manage'), categoryHandlers.update);
router.delete('/expense-categories/:id', requirePermission('expenses.manage'), categoryHandlers.remove);

// Dashboard
router.get('/dashboard/summary', dashboardController.summary);

// Reports
router.get('/reports/sales', reportController.salesReport);
router.get('/reports/purchases', reportController.purchaseReport);
router.get('/reports/product-sales', reportController.productSalesReport);
router.get('/reports/stock', reportController.stockReport);
router.get('/reports/:type/export', requirePermission('reports.view'), reportExportController.exportReport);

// Settings (business info, tax defaults, invoice prefix, etc.)
router.get('/settings', settingController.getAll);
router.put('/settings', requirePermission('settings.manage'), settingController.updateMany);

module.exports = router;
