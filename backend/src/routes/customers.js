const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/customerController');
const { authenticate, requirePermission } = require('../middleware/auth');

router.use(authenticate);

// NOTE: these literal routes must be registered (and mounted) before the
// generic CRUD `/customers/:id` route in routes/masterData.js, otherwise
// Express would treat "receivables"/"balances" as a numeric :id.
router.get('/customers/receivables', ctrl.receivables);
router.get('/customers/balances', ctrl.listWithBalances);
router.get('/customers/:id/profile', ctrl.profile);
router.post('/customers/:id/payments', requirePermission('customers.manage'), ctrl.addAccountPayment);

module.exports = router;
