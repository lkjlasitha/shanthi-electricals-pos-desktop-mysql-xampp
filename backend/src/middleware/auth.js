const jwt = require('jsonwebtoken');
const { User, Role, Warehouse } = require('../models/associations');

// Verifies the JWT and attaches req.user (with role + permissions) to the request.
async function authenticate(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : null;
  if (!token) return res.status(401).json({ message: 'Authentication token missing' });

  let payload;
  try {
    payload = jwt.verify(token, process.env.JWT_SECRET);
  } catch (error) {
    console.warn(`[auth] JWT rejected: ${error?.name || 'verification error'}`);
    return res.status(401).json({ message: 'Invalid or expired token', code: 'AUTH_TOKEN_INVALID' });
  }

  try {
    const query = payload.sub
      ? { where: { _id: payload.sub } }
      : { where: { id: Number(payload.id) } };
    if (!payload.sub && !Number.isSafeInteger(Number(payload.id))) {
      return res.status(401).json({ message: 'Invalid authentication token identity', code: 'AUTH_IDENTITY_INVALID' });
    }
    const user = await User.findOne({
      ...query,
      include: [{ model: Role }, { model: Warehouse }],
      attributes: { exclude: ['password'] },
    });
    if (!user || user.status !== 'active') {
      return res.status(401).json({ message: 'Invalid or inactive user', code: 'AUTH_USER_INVALID' });
    }
    req.user = user;
    return next();
  } catch (error) {
    return next(error);
  }
}

// Restricts a route to users whose role includes ALL of the given permission keys.
// The "admin" role (by name) always passes.
function requirePermission(...permissionKeys) {
  return (req, res, next) => {
    const role = req.user && req.user.Role;
    if (!role) return res.status(403).json({ message: 'No role assigned' });
    if (role.name === 'admin') return next();

    const has = permissionKeys.every((key) => (role.permissions || []).includes(key));
    if (!has) return res.status(403).json({ message: 'You do not have permission to do this' });
    next();
  };
}

module.exports = { authenticate, requirePermission };
