const express = require('express');
const router = express.Router();
const saleController = require('../controllers/saleController');
const { authenticate, requirePermission } = require('../middleware/auth');

router.use(authenticate);
router.get('/', saleController.list);
router.get('/:id', saleController.getOne);
router.post('/', requirePermission('sales.create'), saleController.create);
router.post('/:id/payments', requirePermission('sales.create'), saleController.addPayment);

module.exports = router;
