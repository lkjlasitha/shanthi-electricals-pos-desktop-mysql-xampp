const test = require('node:test');
const assert = require('node:assert/strict');
require('../src/models/associations');
const { createApp } = require('../src/app');

test('Express health endpoint and authentication boundary work', async () => {
  const server = createApp({ enableCors: false, logFormat: 'tiny' }).listen(0, '127.0.0.1');
  await new Promise((resolve, reject) => { server.once('listening', resolve); server.once('error', reject); });
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const health = await fetch(`${base}/health`);
    assert.equal(health.status, 200);
    assert.deepEqual(await health.json(), { status: 'ok', service: 'shanthi-electricals-backend' });
    const protectedResponse = await fetch(`${base}/api/products`);
    assert.equal(protectedResponse.status, 401);
    assert.match((await protectedResponse.json()).message, /token/i);
    const missing = await fetch(`${base}/not-a-route`);
    assert.equal(missing.status, 404);
  } finally { await new Promise((resolve) => server.close(resolve)); }
});
