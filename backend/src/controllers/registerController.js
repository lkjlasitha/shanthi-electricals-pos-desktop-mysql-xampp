const {
  POSRegister, SalesPayment, CustomerPayment, User, Warehouse,
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
  const register = await POSRegister.findByPk(req.params.id);
  if (!register) return res.status(404).json({ message: 'Not found' });
  if (register.status === 'closed') return res.status(400).json({ message: 'Register already closed' });

  const [cashSalePayments, cashOpeningBalancePayments] = await Promise.all([
    SalesPayment.sum('amount', {
      where: { pos_register_id: register.id, paying_method: 'cash' },
    }),
    // Invoice portions of customer-level receipts also exist in
    // sales_payments. Add only the opening-balance portion from the header.
    CustomerPayment.sum('opening_balance_amount', {
      where: { pos_register_id: register.id, paying_method: 'cash' },
    }),
  ]);
  const cashReceived = Number(cashSalePayments || 0) + Number(cashOpeningBalancePayments || 0);

  register.status = 'closed';
  register.closed_at = new Date();
  register.cash_in_hand = Number(register.opening_balance) + cashReceived;
  register.closing_balance = req.body.closing_balance != null ? req.body.closing_balance : register.cash_in_hand;
  register.notes = req.body.notes || register.notes;
  await register.save();
  res.json({ data: register });
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
