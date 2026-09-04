const express = require('express');
const router = express.Router();
const productController = require('../controllers/productController');
const { authenticate, requirePermission } = require('../middleware/auth');

router.use(authenticate);
router.get('/', productController.list);
router.get('/lookup/:code', productController.lookupByCode);
router.get('/generate-code', requirePermission('products.manage'), productController.generateCode);
router.get('/families/:id', productController.getFamily);
router.post('/families', requirePermission('products.manage'), productController.createFamily);
router.post('/families/:id/variants', requirePermission('products.manage'), productController.addFamilyVariants);
router.post('/:id/create-family', requirePermission('products.manage'), productController.convertProductToFamily);
router.get('/:id/price-history', productController.priceHistory);
router.get('/:id', productController.getOne);
router.post('/', requirePermission('products.manage'), productController.create);
router.put('/:id', requirePermission('products.manage'), productController.update);
router.post('/:id/adjust-prices', requirePermission('products.manage'), productController.adjustPrices);
router.delete('/:id', requirePermission('products.manage'), productController.remove);
router.post('/:id/stock', requirePermission('stock.manage'), productController.setStock);

module.exports = router;
