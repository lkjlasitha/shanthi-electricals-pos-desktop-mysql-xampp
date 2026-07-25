const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/registerController');
const { authenticate, requirePermission } = require('../middleware/auth');

router.use(authenticate);
router.get('/', requirePermission('registers.view'), ctrl.list);
router.get('/current', ctrl.myCurrent);
router.post('/open', ctrl.openRegister);
router.post('/:id/close', ctrl.closeRegister);

module.exports = router;
