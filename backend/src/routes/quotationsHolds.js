const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/quotationHoldController');
const { authenticate, requirePermission } = require('../middleware/auth');

router.use(authenticate);

router.get('/quotations', ctrl.listQuotations);
router.get('/quotations/:id', ctrl.getQuotation);
router.post('/quotations', requirePermission('sales.create'), ctrl.createQuotation);
router.put('/quotations/:id', requirePermission('sales.create'), ctrl.updateQuotation);
router.post('/quotations/:id/convert', requirePermission('sales.create'), ctrl.convertQuotationToSale);
router.post('/quotations/:id/status', requirePermission('sales.create'), ctrl.setQuotationStatus);

router.get('/holds', ctrl.listHolds);
router.post('/holds', ctrl.createHold);
router.delete('/holds/:id', ctrl.deleteHold);

module.exports = router;
