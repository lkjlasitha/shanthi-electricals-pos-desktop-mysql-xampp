const { Expense, ExpenseCategory, Warehouse } = require('../models/associations');
const { asyncHandler } = require('../utils/helpers');
const { Op } = require('../config/db');

const list = asyncHandler(async (req, res) => {
  const where = {};
  if (req.query.from_date && req.query.to_date) where.date = { [Op.between]: [req.query.from_date, req.query.to_date] };
  if (req.query.warehouse_id) where.warehouse_id = req.query.warehouse_id;
  const expenses = await Expense.findAll({ where, include: [ExpenseCategory, Warehouse], order: [['id', 'DESC']] });
  res.json({ data: expenses });
});

const getOne = asyncHandler(async (req, res) => {
  const expense = await Expense.findByPk(req.params.id, { include: [ExpenseCategory, Warehouse] });
  if (!expense) return res.status(404).json({ message: 'Not found' });
  res.json({ data: expense });
});

const create = asyncHandler(async (req, res) => {
  const expense = await Expense.create(req.body);
  res.status(201).json({ data: expense });
});

const update = asyncHandler(async (req, res) => {
  const expense = await Expense.findByPk(req.params.id);
  if (!expense) return res.status(404).json({ message: 'Not found' });
  await expense.update(req.body);
  res.json({ data: expense });
});

const remove = asyncHandler(async (req, res) => {
  const expense = await Expense.findByPk(req.params.id);
  if (!expense) return res.status(404).json({ message: 'Not found' });
  await expense.destroy();
  res.json({ message: 'Deleted' });
});

module.exports = { list, getOne, create, update, remove };
