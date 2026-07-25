const jwt = require('jsonwebtoken');
const { User, Role } = require('../models/associations');

// Verifies the JWT and attaches req.user (with role + permissions) to the request.
async function authenticate(req, res, next) {
  try {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;
    if (!token) return res.status(401).json({ message: 'Authentication token missing' });

    const payload = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findByPk(payload.id, {
      include: [{ model: Role }],
      attributes: { exclude: ['password'] },
    });
    if (!user || user.status !== 'active') {
      return res.status(401).json({ message: 'Invalid or inactive user' });
    }
    req.user = user;
    next();
  } catch (err) {
    return res.status(401).json({ message: 'Invalid or expired token' });
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
