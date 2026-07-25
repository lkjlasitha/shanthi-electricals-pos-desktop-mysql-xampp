const bcrypt = require('bcryptjs');
const { User, Role, Warehouse } = require('../models/associations');
const { asyncHandler } = require('../utils/helpers');

const list = asyncHandler(async (req, res) => {
  const users = await User.findAll({
    include: [Role, Warehouse],
    attributes: { exclude: ['password'] },
    order: [['id', 'DESC']],
  });
  res.json({ data: users });
});

const create = asyncHandler(async (req, res) => {
  const { name, email, password, phone, role_id, warehouse_id, language } = req.body;
  if (!name || !email || !password || !role_id) {
    return res.status(400).json({ message: 'name, email, password and role_id are required' });
  }
  const hashed = await bcrypt.hash(password, 10);
  const user = await User.create({ name, email, password: hashed, phone, role_id, warehouse_id, language });
  const safe = user.toJSON();
  delete safe.password;
  res.status(201).json({ data: safe });
});

const update = asyncHandler(async (req, res) => {
  const user = await User.findByPk(req.params.id);
  if (!user) return res.status(404).json({ message: 'Not found' });
  const { name, email, phone, role_id, warehouse_id, status, language, password } = req.body;
  const updates = { name, email, phone, role_id, warehouse_id, status, language };
  if (password) updates.password = await bcrypt.hash(password, 10);
  await user.update(updates);
  const safe = user.toJSON();
  delete safe.password;
  res.json({ data: safe });
});

const remove = asyncHandler(async (req, res) => {
  const user = await User.findByPk(req.params.id);
  if (!user) return res.status(404).json({ message: 'Not found' });
  await user.destroy();
  res.json({ message: 'Deleted' });
});

module.exports = { list, create, update, remove };
