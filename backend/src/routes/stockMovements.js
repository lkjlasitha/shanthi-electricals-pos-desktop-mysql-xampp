const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/stockMovementController');
const { authenticate, requirePermission } = require('../middleware/auth');

router.use(authenticate);
router.get('/transfers', ctrl.listTransfers);
router.post('/transfers', requirePermission('stock.manage'), ctrl.createTransfer);
router.get('/adjustments', ctrl.listAdjustments);
router.post('/adjustments', requirePermission('stock.manage'), ctrl.createAdjustment);

module.exports = router;
