const express = require('express');
const router = express.Router();
const purchaseController = require('../controllers/purchaseController');
const { authenticate, requirePermission } = require('../middleware/auth');

router.use(authenticate);
router.get('/', purchaseController.list);
router.get('/summary', purchaseController.summary);
router.get('/:id', purchaseController.getOne);
router.post('/', requirePermission('purchases.create'), purchaseController.create);
router.post('/:id/receive', requirePermission('purchases.create'), purchaseController.receive);
router.post('/:id/payments', requirePermission('purchases.create'), purchaseController.addPayment);
router.post('/:id/cancel', requirePermission('purchases.create'), purchaseController.cancel);

module.exports = router;
