const express = require('express');
const router = express.Router();
const returnController = require('../controllers/returnController');
const { authenticate, requirePermission } = require('../middleware/auth');

router.use(authenticate);
router.get('/sale-returns', returnController.listSaleReturns);
router.get('/sale-returns/source/:saleId', returnController.saleReturnable);
router.post('/sale-returns', requirePermission('sales.create'), returnController.createSaleReturn);
router.get('/purchase-returns', returnController.listPurchaseReturns);
router.get('/purchase-returns/source/:purchaseId', returnController.purchaseReturnable);
router.post('/purchase-returns', requirePermission('purchases.create'), returnController.createPurchaseReturn);

module.exports = router;
