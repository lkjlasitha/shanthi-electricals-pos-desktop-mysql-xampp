const test = require('node:test');
const assert = require('node:assert/strict');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const { User, Warehouse } = require('../src/models/associations');
const { createApp } = require('../src/app');
const { signToken } = require('../src/controllers/authController');

test('new tokens retain a stable MongoDB identity when a legacy numeric id is missing', () => {
  const previousSecret = process.env.JWT_SECRET;
  const previousExpiry = process.env.JWT_EXPIRES_IN;
  process.env.JWT_SECRET = 'auth-identity-test-secret-with-sufficient-length';
  process.env.JWT_EXPIRES_IN = '12h';
  try {
    const objectId = new mongoose.Types.ObjectId();
    const payload = jwt.verify(signToken({ _id: objectId, id: null }), process.env.JWT_SECRET);
    assert.equal(payload.sub, String(objectId));
    assert.equal(Object.prototype.hasOwnProperty.call(payload, 'id'), false);
  } finally {
    if (previousSecret === undefined) delete process.env.JWT_SECRET; else process.env.JWT_SECRET = previousSecret;
    if (previousExpiry === undefined) delete process.env.JWT_EXPIRES_IN; else process.env.JWT_EXPIRES_IN = previousExpiry;
  }
});

test('a successful login token authorizes session and POS bootstrap requests', async () => {
  const previousSecret = process.env.JWT_SECRET;
  const previousExpiry = process.env.JWT_EXPIRES_IN;
  const originalFindOne = User.findOne;
  const originalWarehouseFindAndCountAll = Warehouse.findAndCountAll;
  process.env.JWT_SECRET = 'auth-flow-test-secret-with-sufficient-length';
  process.env.JWT_EXPIRES_IN = '12h';

  const objectId = new mongoose.Types.ObjectId();
  const password = 'Admin@12345';
  const fakeUser = {
    _id: objectId,
    id: 1,
    name: 'Shop Owner',
    email: 'admin@example.com',
    password: await bcrypt.hash(password, 4),
    status: 'active',
    role_id: 1,
    warehouse_id: 1,
    Role: { id: 1, name: 'admin', display_name: 'Administrator', permissions: [] },
    Warehouse: { id: 1, name: 'Main Warehouse' },
    toJSON() {
      return { ...this, _id: String(this._id), toJSON: undefined };
    },
  };

  User.findOne = async ({ where }) => {
    if (where?.email === fakeUser.email || String(where?._id || '') === String(objectId) || where?.id === 1) return fakeUser;
    return null;
  };
  Warehouse.findAndCountAll = async () => ({ rows: [fakeUser.Warehouse], count: 1 });

  const server = createApp({ enableCors: false, logFormat: 'tiny' }).listen(0, '127.0.0.1');
  await new Promise((resolve, reject) => { server.once('listening', resolve); server.once('error', reject); });
  const base = `http://127.0.0.1:${server.address().port}`;

  try {
    const login = await fetch(`${base}/api/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: fakeUser.email, password }),
    });
    assert.equal(login.status, 200);
    const loginBody = await login.json();
    assert.ok(loginBody.token);
    assert.equal(jwt.verify(loginBody.token, process.env.JWT_SECRET).sub, String(objectId));

    const headers = { authorization: `Bearer ${loginBody.token}` };
    const session = await fetch(`${base}/api/auth/me`, { headers });
    assert.equal(session.status, 200);
    assert.equal((await session.json()).data.email, fakeUser.email);

    const warehouses = await fetch(`${base}/api/warehouses?per_page=100`, { headers });
    assert.equal(warehouses.status, 200);
    assert.equal((await warehouses.json()).data[0].name, 'Main Warehouse');
  } finally {
    await new Promise((resolve) => server.close(resolve));
    User.findOne = originalFindOne;
    Warehouse.findAndCountAll = originalWarehouseFindAndCountAll;
    if (previousSecret === undefined) delete process.env.JWT_SECRET; else process.env.JWT_SECRET = previousSecret;
    if (previousExpiry === undefined) delete process.env.JWT_EXPIRES_IN; else process.env.JWT_EXPIRES_IN = previousExpiry;
  }
});
