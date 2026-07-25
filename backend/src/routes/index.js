const express = require('express');
const router = express.Router();

router.use('/auth', require('./auth'));
router.use('/users', require('./users'));
router.use('/products', require('./products'));
router.use('/purchases', require('./purchases'));
router.use('/sales', require('./sales'));
router.use('/register', require('./register'));
router.use('/documents', require('./documents'));
router.use('/backup', require('./backup'));
router.use('/', require('./masterData'));
router.use('/', require('./returns'));
router.use('/', require('./stockMovements'));
router.use('/', require('./quotationsHolds'));
router.use('/', require('./misc'));

module.exports = router;
