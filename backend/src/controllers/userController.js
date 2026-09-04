const bcrypt = require('bcryptjs');
const { User, Role, Warehouse } = require('../models/associations');
const { asyncHandler } = require('../utils/helpers');
const HttpError = require('../utils/httpError');

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
  if (String(password).length < 8) throw new HttpError(422, 'Password must contain at least 8 characters.');
  const normalizedEmail = String(email).trim().toLowerCase();
  const [role, warehouse] = await Promise.all([
    Role.findByPk(role_id),
    warehouse_id ? Warehouse.findByPk(warehouse_id) : Promise.resolve(null),
  ]);
  if (!role) throw new HttpError(422, 'The selected role no longer exists.');
  if (warehouse_id && !warehouse) throw new HttpError(422, 'The selected warehouse no longer exists.');
  const hashed = await bcrypt.hash(password, 10);
  const user = await User.create({ name: String(name).trim(), email: normalizedEmail, password: hashed, phone, role_id, warehouse_id, language });
  const safe = user.toJSON();
  delete safe.password;
  res.status(201).json({ data: safe });
});

const update = asyncHandler(async (req, res) => {
  const user = await User.findByPk(req.params.id);
  if (!user) return res.status(404).json({ message: 'Not found' });
  const { name, email, phone, role_id, warehouse_id, status, language, password } = req.body;
  const updates = Object.fromEntries(Object.entries({ name, email, phone, role_id, warehouse_id, status, language }).filter(([, value]) => value !== undefined));
  if (updates.email) updates.email = String(updates.email).trim().toLowerCase();
  if (Number(user.id) === Number(req.user?.id) && updates.status === 'inactive') {
    throw new HttpError(422, 'You cannot deactivate the account that is currently signed in.');
  }
  if (updates.role_id && !await Role.findByPk(updates.role_id)) throw new HttpError(422, 'The selected role no longer exists.');
  if (updates.warehouse_id && !await Warehouse.findByPk(updates.warehouse_id)) throw new HttpError(422, 'The selected warehouse no longer exists.');
  if (password) {
    if (String(password).length < 8) throw new HttpError(422, 'Password must contain at least 8 characters.');
    updates.password = await bcrypt.hash(password, 10);
  }
  await user.update(updates);
  const safe = user.toJSON();
  delete safe.password;
  res.json({ data: safe });
});

const remove = asyncHandler(async (req, res) => {
  const user = await User.findByPk(req.params.id);
  if (!user) return res.status(404).json({ message: 'Not found' });
  if (Number(user.id) === Number(req.user?.id)) throw new HttpError(422, 'You cannot delete the account that is currently signed in.');
  await user.destroy();
  res.json({ message: 'Deleted' });
});

module.exports = { list, create, update, remove };
