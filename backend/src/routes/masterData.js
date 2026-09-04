const express = require('express');
const crudFactory = require('../utils/crudFactory');
const { authenticate, requirePermission } = require('../middleware/auth');
const {
  ProductCategory, Brand, BaseUnit, Unit, Warehouse, Supplier, Customer, Currency, Role,
} = require('../models/associations');
const { normalizeCustomerPayload } = require('../utils/customerPayload');
const HttpError = require('../utils/httpError');

function normalizeSupplierPayload(data = {}, { partial = false } = {}) {
  const output = { ...data };
  if (!partial || Object.prototype.hasOwnProperty.call(data, 'payment_terms_days')) {
    const days = Number(data.payment_terms_days === '' || data.payment_terms_days === undefined ? 30 : data.payment_terms_days);
    if (!Number.isInteger(days) || days < 0 || days > 3650) {
      throw new HttpError(422, 'Supplier payment terms must be a whole number from 0 to 3650 days.');
    }
    output.payment_terms_days = days;
  }
  return output;
}

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
mountCrud(router, '/suppliers', Supplier, {
  searchFields: ['name', 'phone', 'email'],
  order: [['name', 'ASC']],
  beforeCreate: (req, data) => normalizeSupplierPayload(data),
  beforeUpdate: (req, data) => normalizeSupplierPayload(data, { partial: true }),
}, 'suppliers.manage');
mountCrud(router, '/customers', Customer, {
  searchFields: ['name', 'phone', 'email'],
  order: [['name', 'ASC']],
  beforeCreate: (req, data) => normalizeCustomerPayload(data),
  beforeUpdate: (req, data) => normalizeCustomerPayload(data, { partial: true }),
}, 'customers.manage');
mountCrud(router, '/currencies', Currency, { order: [['code', 'ASC']] }, 'settings.manage');
mountCrud(router, '/roles', Role, { order: [['name', 'ASC']] }, 'users.manage');

module.exports = router;
