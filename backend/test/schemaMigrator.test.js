const test = require('node:test');
const assert = require('node:assert/strict');
const database = require('../src/config/db');
const { repairMissingNumericIds } = require('../src/config/schemaMigrator');

test('migration repairs documents created without a public numeric id', async () => {
  const originalResetCounter = database.resetCounter;
  const originalNextNumericId = database.nextNumericId;
  const calls = [];
  database.resetCounter = async (collection, value) => calls.push(['reset', collection, value]);
  database.nextNumericId = async (collection) => { calls.push(['next', collection]); return 10; };

  const model = {
    tableName: 'users',
    collection: {
      findOne: async () => ({ id: 9 }),
      find: () => ({ toArray: async () => [{ _id: 'missing-user-id' }] }),
      updateOne: async (where, update) => {
        calls.push(['update', where, update]);
        return { modifiedCount: 1 };
      },
    },
  };

  try {
    assert.equal(await repairMissingNumericIds(model), 1);
    assert.deepEqual(calls[0], ['reset', 'users', 9]);
    assert.deepEqual(calls[1], ['next', 'users']);
    assert.equal(calls[2][2].$set.id, 10);
  } finally {
    database.resetCounter = originalResetCounter;
    database.nextNumericId = originalNextNumericId;
  }
});
