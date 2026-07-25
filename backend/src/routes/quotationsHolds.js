const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/quotationHoldController');
const { authenticate } = require('../middleware/auth');

router.use(authenticate);
router.get('/quotations', ctrl.listQuotations);
router.post('/quotations', ctrl.createQuotation);
router.get('/holds', ctrl.listHolds);
router.post('/holds', ctrl.createHold);
router.delete('/holds/:id', ctrl.deleteHold);

module.exports = router;
