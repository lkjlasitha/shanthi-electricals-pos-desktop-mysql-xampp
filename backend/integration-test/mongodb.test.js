const test = require('node:test');
const assert = require('node:assert/strict');

test('real MongoDB transaction, relations, integrity, and backup smoke test', async () => {
  const uri = process.env.TEST_MONGODB_URI;
  if (!uri) throw new Error('TEST_MONGODB_URI is required and must point to a disposable database whose name ends in _test.');
  const databaseName = new URL(uri).pathname.replace(/^\//, '').split('?')[0];
  if (!databaseName.endsWith('_test')) throw new Error('Refusing to run: TEST_MONGODB_URI database name must end in _test.');
  process.env.MONGODB_URI = uri;

  const database = require('../src/config/db');
  const {
    Role, User, Warehouse, ProductCategory, Customer, Product, ManageStock,
    Sale, SaleItem,
  } = require('../src/models/associations');
  const { backupBuffer, parseBackupBuffer } = require('../src/services/backupService');

  try {
    await database.authenticate();
    await database.mongoose.connection.dropDatabase();
    await database.sync();
    const role = await Role.create({ name: 'integration-admin', display_name: 'Integration Admin', permissions: ['*'] });
    const warehouse = await Warehouse.create({ name: 'Integration Warehouse', is_default: true });
    const user = await User.create({ name: 'Tester', email: 'integration@example.test', password: 'not-a-real-hash', role_id: role.id });
    const category = await ProductCategory.create({ name: 'Integration Category', code: 'INT' });
    const customer = await Customer.create({ name: 'Integration Customer', phone: '+94000000000' });
    const product = await Product.create({ name: 'Integration Product', code: 'INT-001', product_category_id: category.id, product_cost: 10, product_price: 15 });
    await ManageStock.create({ warehouse_id: warehouse.id, product_id: product.id, quantity: 5 });

    const saleId = await database.transaction(async (transaction) => {
      const stock = await ManageStock.findOne({ where: { warehouse_id: warehouse.id, product_id: product.id }, transaction });
      stock.quantity -= 2;
      await stock.save({ session: transaction.session });
      const sale = await Sale.create({ date: '2026-09-08', customer_id: customer.id, warehouse_id: warehouse.id, grand_total: 30, paid_amount: 30, created_by: user.id }, { transaction });
      await SaleItem.create({ sale_id: sale.id, product_id: product.id, product_price: 15, quantity: 2, sub_total: 30 }, { transaction });
      return sale.id;
    });

    const loaded = await Sale.findByPk(saleId, { include: [Customer, { model: SaleItem, as: 'items', include: [Product] }] });
    assert.equal(loaded.Customer.name, customer.name);
    assert.equal(loaded.items.length, 1);
    assert.equal(loaded.items[0].Product.code, product.code);
    assert.equal((await ManageStock.findOne({ where: { warehouse_id: warehouse.id, product_id: product.id } })).quantity, 3);

    await assert.rejects(category.destroy(), /already used elsewhere/i);
    await loaded.destroy();
    assert.equal(await SaleItem.count({ where: { sale_id: saleId } }), 0);

    const { buffer, tables } = await backupBuffer();
    assert.ok(buffer.length > 1000);
    assert.ok(tables.includes('products'));
    const parsed = await parseBackupBuffer(buffer);
    assert.equal(parsed.metadata.database_engine, 'MongoDB');
  } finally {
    if (database.mongoose.connection.readyState === 1) await database.mongoose.connection.dropDatabase();
    await database.close().catch(() => {});
  }
});
