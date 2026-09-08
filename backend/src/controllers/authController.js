const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { User, Role, Warehouse } = require('../models/associations');
const { asyncHandler } = require('../utils/helpers');

function signToken(user) {
  if (!user?._id) throw new Error('Cannot create an authentication token for a user without a MongoDB document ID.');
  const numericId = Number(user.id);
  return jwt.sign({ ...(Number.isSafeInteger(numericId) && numericId > 0 ? { id: numericId } : {}) }, process.env.JWT_SECRET, {
    subject: String(user._id),
    expiresIn: process.env.JWT_EXPIRES_IN || '12h',
  });
}

const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ message: 'Email and password are required' });

  const normalizedEmail = String(email).trim().toLowerCase();
  const user = await User.findOne({ where: { email: normalizedEmail }, include: [Role, Warehouse] });
  if (!user || user.status !== 'active') return res.status(401).json({ message: 'Invalid credentials' });

  const valid = await bcrypt.compare(password, user.password);
  if (!valid) return res.status(401).json({ message: 'Invalid credentials' });

  const token = signToken(user);
  const safeUser = user.toJSON();
  delete safeUser.password;
  res.json({ token, user: safeUser });
});

const me = asyncHandler(async (req, res) => {
  // authenticate() already loaded and validated the current user with both
  // associations. Returning it avoids a second identity lookup.
  res.json({ data: req.user });
});

const changePassword = asyncHandler(async (req, res) => {
  const { current_password, new_password } = req.body;
  const user = await User.findByPk(req.user.id);
  if (!user) return res.status(404).json({ message: 'User account not found' });
  const valid = await bcrypt.compare(current_password || '', user.password);
  if (!valid) return res.status(400).json({ message: 'Current password is incorrect' });
  if (!new_password || new_password.length < 8) {
    return res.status(400).json({ message: 'New password must be at least 8 characters' });
  }
  user.password = await bcrypt.hash(new_password, 10);
  await user.save();
  res.json({ message: 'Password updated' });
});

module.exports = { login, me, changePassword, signToken };
