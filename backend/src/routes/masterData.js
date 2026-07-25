const express = require('express');
const crudFactory = require('../utils/crudFactory');
const { authenticate, requirePermission } = require('../middleware/auth');
const {
  ProductCategory, Brand, BaseUnit, Unit, Warehouse, Supplier, Customer, Currency, Role,
} = require('../models/associations');

// Mounts standard list/get/create/update/delete routes for a simple model at the given path.
function mountCrud(router, path, model, options, permissionKey) {
  const handlers = crudFactory(model, options);
  const writeGuard = permissionKey ? requirePermission(permissionKey) : (req, res, next) => next();
  router.get(`${path}`, handlers.list);
  router.get(`${path}/:id`, handlers.getOne);
  router.post(`${path}`, writeGuard, handlers.create);
  router.put(`${path}/:id`, writeGuard, handlers.update);
  router.delete(`${path}/:id`, writeGuard, handlers.remove);
}

const router = express.Router();
router.use(authenticate);

mountCrud(router, '/product-categories', ProductCategory, { searchFields: ['name', 'code'], order: [['name', 'ASC']] }, 'products.manage');
mountCrud(router, '/brands', Brand, { searchFields: ['name'], order: [['name', 'ASC']] }, 'products.manage');
mountCrud(router, '/base-units', BaseUnit, { order: [['name', 'ASC']] }, 'products.manage');
mountCrud(router, '/units', Unit, { include: [BaseUnit], order: [['name', 'ASC']] }, 'products.manage');
mountCrud(router, '/warehouses', Warehouse, { searchFields: ['name', 'city'], order: [['name', 'ASC']] }, 'warehouses.manage');
mountCrud(router, '/suppliers', Supplier, { searchFields: ['name', 'phone', 'email'], order: [['name', 'ASC']] }, 'suppliers.manage');
mountCrud(router, '/customers', Customer, { searchFields: ['name', 'phone', 'email'], order: [['name', 'ASC']] }, 'customers.manage');
mountCrud(router, '/currencies', Currency, { order: [['code', 'ASC']] }, 'settings.manage');
mountCrud(router, '/roles', Role, { order: [['name', 'ASC']] }, 'users.manage');

module.exports = router;
