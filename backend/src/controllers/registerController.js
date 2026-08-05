const {
  POSRegister, Sale, SalesPayment, CustomerAccountPayment, User, Warehouse, sequelize,
} = require('../models/associations');
const { asyncHandler } = require('../utils/helpers');

const openRegister = asyncHandler(async (req, res) => {
  const existing = await POSRegister.findOne({ where: { user_id: req.user.id, status: 'open' } });
  if (existing) return res.status(400).json({ message: 'You already have an open register', data: existing });

  const register = await POSRegister.create({
    user_id: req.user.id,
    warehouse_id: req.body.warehouse_id,
    opening_balance: req.body.opening_balance || 0,
    status: 'open',
    opened_at: new Date(),
  });
  res.status(201).json({ data: register });
});

const closeRegister = asyncHandler(async (req, res) => {
  const result = await sequelize.transaction(async (transaction) => {
    const register = await POSRegister.findByPk(req.params.id, { transaction, lock: transaction.LOCK.UPDATE });
    if (!register) return { error: [404, 'Register not found'] };
    if (register.status === 'closed') return { error: [409, 'Register already closed'] };
    const role = req.user?.Role;
    const canCloseAnother = role?.name === 'admin' || (role?.permissions || []).includes('registers.view');
    if (Number(register.user_id) !== Number(req.user.id) && !canCloseAnother) {
      return { error: [403, 'You can only close your own register.'] };
    }

    // Count the actual cash tender rows, not Sale.paid_amount. This excludes
    // card/bank allocations and avoids counting customer credit as new cash.
    const [cashSalesTotal, cashAccountPayments] = await Promise.all([
      SalesPayment.sum('amount', {
        where: { paying_method: 'cash', customer_account_payment_id: null },
        include: [{ model: Sale, attributes: [], required: true, where: { pos_register_id: register.id } }],
        transaction,
      }),
      CustomerAccountPayment.sum('amount', {
        where: { pos_register_id: register.id, payment_method: 'cash' },
        transaction,
      }),
    ]);

    register.status = 'closed';
    register.closed_at = new Date();
    register.cash_in_hand = Number(register.opening_balance) + Number(cashSalesTotal || 0) + Number(cashAccountPayments || 0);
    register.closing_balance = req.body.closing_balance != null ? req.body.closing_balance : register.cash_in_hand;
    register.notes = req.body.notes || register.notes;
    await register.save({ transaction });
    return { register };
  });
  if (result.error) return res.status(result.error[0]).json({ message: result.error[1] });
  return res.json({ data: result.register });
});

const myCurrent = asyncHandler(async (req, res) => {
  const register = await POSRegister.findOne({ where: { user_id: req.user.id, status: 'open' } });
  res.json({ data: register });
});

const list = asyncHandler(async (req, res) => {
  const registers = await POSRegister.findAll({ include: [User, Warehouse], order: [['id', 'DESC']] });
  res.json({ data: registers });
});

module.exports = { openRegister, closeRegister, myCurrent, list };
