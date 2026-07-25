const express = require('express');
const router = express.Router();
const purchaseController = require('../controllers/purchaseController');
const { authenticate, requirePermission } = require('../middleware/auth');

router.use(authenticate);
router.get('/', purchaseController.list);
router.get('/:id', purchaseController.getOne);
router.post('/', requirePermission('purchases.create'), purchaseController.create);

module.exports = router;
