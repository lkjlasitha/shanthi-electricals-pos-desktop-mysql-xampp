const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/quotationHoldController');
const { authenticate, requirePermission } = require('../middleware/auth');

router.use(authenticate);
router.get('/quotations', ctrl.listQuotations);
router.get('/quotations/:id', ctrl.getQuotation);
router.post('/quotations', requirePermission('sales.create'), ctrl.createQuotation);
router.put('/quotations/:id', requirePermission('sales.create'), ctrl.updateQuotation);
router.get('/holds', ctrl.listHolds);
router.post('/holds', requirePermission('sales.create'), ctrl.createHold);
router.delete('/holds/:id', requirePermission('sales.create'), ctrl.deleteHold);

module.exports = router;
