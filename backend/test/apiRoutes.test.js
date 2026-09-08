const test = require('node:test');
const assert = require('node:assert/strict');

function routes(router, prefix = '') {
  return new Set(router.stack.filter((layer) => layer.route).flatMap((layer) => Object.keys(layer.route.methods).map((method) => {
    const path = `${prefix}${layer.route.path}`.replace(/\/$/, '') || '/';
    return `${method.toUpperCase()} ${path}`;
  })));
}

test('every frontend API operation has a backend route', () => {
  const groups = [
    [require('../src/routes/auth'), '/auth'], [require('../src/routes/users'), '/users'],
    [require('../src/routes/products'), '/products'], [require('../src/routes/purchases'), '/purchases'],
    [require('../src/routes/sales'), '/sales'], [require('../src/routes/register'), '/register'],
    [require('../src/routes/documents'), '/documents'], [require('../src/routes/backup'), '/backup'],
    [require('../src/routes/customers'), ''], [require('../src/routes/masterData'), ''],
    [require('../src/routes/returns'), ''], [require('../src/routes/stockMovements'), ''],
    [require('../src/routes/quotationsHolds'), ''], [require('../src/routes/misc'), ''],
  ];
  const actual = new Set(groups.flatMap(([router, prefix]) => [...routes(router, prefix)]));
  const expected = [
    'POST /auth/login', 'GET /auth/me', 'POST /auth/change-password',
    'GET /users', 'GET /users/:id', 'POST /users', 'PUT /users/:id', 'DELETE /users/:id',
    'GET /products', 'GET /products/:id', 'GET /products/lookup/:code', 'GET /products/generate-code',
    'POST /products', 'PUT /products/:id', 'DELETE /products/:id', 'POST /products/:id/stock',
    'GET /products/families/:id', 'POST /products/families', 'POST /products/families/:id/variants',
    'POST /products/:id/create-family', 'GET /products/:id/price-history', 'POST /products/:id/adjust-prices',
    'GET /purchases', 'GET /purchases/summary', 'GET /purchases/:id', 'POST /purchases',
    'POST /purchases/:id/receive', 'POST /purchases/:id/payments', 'POST /purchases/:id/cancel',
    'GET /sales', 'GET /sales/:id', 'POST /sales', 'POST /sales/:id/payments',
    'GET /customers', 'GET /customers/:id', 'POST /customers', 'PUT /customers/:id', 'DELETE /customers/:id',
    'GET /customers/balances', 'GET /customers/receivables', 'GET /customers/:id/profile', 'POST /customers/:id/payments',
    'GET /sale-returns', 'GET /sale-returns/source/:saleId', 'POST /sale-returns',
    'GET /purchase-returns', 'GET /purchase-returns/source/:purchaseId', 'POST /purchase-returns',
    'GET /transfers', 'POST /transfers', 'GET /adjustments', 'POST /adjustments',
    'GET /quotations', 'GET /quotations/:id', 'POST /quotations', 'PUT /quotations/:id',
    'POST /quotations/:id/convert', 'POST /quotations/:id/status',
    'GET /holds', 'POST /holds', 'DELETE /holds/:id',
    'GET /register', 'GET /register/current', 'POST /register/open', 'POST /register/:id/close',
    'GET /reports/sales', 'GET /reports/purchases', 'GET /reports/product-sales', 'GET /reports/stock', 'GET /reports/:type/export',
    'GET /settings', 'PUT /settings', 'GET /documents/:type/:id/pdf', 'GET /backup/export', 'POST /backup/import',
    'GET /expenses', 'GET /expenses/:id', 'POST /expenses', 'PUT /expenses/:id', 'DELETE /expenses/:id',
    'GET /expense-categories', 'GET /expense-categories/:id', 'POST /expense-categories', 'PUT /expense-categories/:id', 'DELETE /expense-categories/:id',
  ];
  for (const path of ['/product-categories', '/brands', '/base-units', '/units', '/warehouses', '/suppliers', '/currencies', '/roles']) {
    expected.push(`GET ${path}`, `GET ${path}/:id`, `POST ${path}`, `PUT ${path}/:id`, `DELETE ${path}/:id`);
  }
  for (const item of expected) assert.ok(actual.has(item), `Missing backend route: ${item}`);
});
