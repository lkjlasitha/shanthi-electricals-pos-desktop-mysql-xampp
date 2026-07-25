const express = require('express');
const router = express.Router();
const controller = require('../controllers/documentController');
const { authenticate } = require('../middleware/auth');

router.use(authenticate);
router.get('/:type/:id/pdf', controller.downloadPdf);

module.exports = router;
