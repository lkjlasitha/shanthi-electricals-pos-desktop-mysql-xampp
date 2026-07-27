const { Op, QueryTypes } = require('sequelize');
const {
  SaleReturn, SaleReturnItem, Sale, SaleItem, Customer, Warehouse,
  PurchaseReturn, PurchaseReturnItem, Purchase, PurchaseItem, Supplier,
  Product, sequelize,
} = require('../models/associations');
const { asyncHandler, generateReferenceCode } = require('../utils/helpers');
const { adjustStock } = require('../utils/stockService');
const HttpError = require('../utils/httpError');
const { positiveInteger, normalizeRequestedItems, prepareReturnItems } = require('../utils/returnPayload');
const { todayISO } = require('../utils/date');

function aggregateSourceItems(items, valueField) {
  const rows = new Map();
  for (const item of items) {
    const productId = Number(item.product_id);
    const quantity = Number(item.quantity || 0);
    const lineTotal = Number(item.sub_total ?? (Number(item[valueField] || 0) * quantity));
    const current = rows.get(productId) || {
      product_id: productId,
      Product: item.Product,
      document_quantity: 0,
      document_total: 0,
    };
    current.document_quantity += quantity;
    current.document_total += lineTotal;
    rows.set(productId, current);
  }
  return rows;
}

async function returnedQuantities(kind, sourceId, transaction) {
  const saleMode = kind === 'sale';
  const returnTable = saleMode ? 'sale_returns' : 'purchase_returns';
  const itemTable = saleMode ? 'sale_return_items' : 'purchase_return_items';
  const returnForeignKey = saleMode ? 'sale_return_id' : 'purchase_return_id';
  const sourceForeignKey = saleMode ? 'sale_id' : 'purchase_id';

  const rows = await sequelize.query(
    `SELECT ri.product_id, COALESCE(SUM(ri.quantity), 0) AS returned_quantity ` +
    `FROM \`${itemTable}\` ri INNER JOIN \`${returnTable}\` r ON r.id = ri.\`${returnForeignKey}\` ` +
    `WHERE r.\`${sourceForeignKey}\` = :sourceId GROUP BY ri.product_id`,
    { type: QueryTypes.SELECT, replacements: { sourceId }, transaction }
  );

  return new Map(rows.map((row) => [Number(row.product_id), Number(row.returned_quantity || 0)]));
}

async function buildSaleReturnable(saleId, transaction) {
  const sale = await Sale.findByPk(saleId, {
    include: [Customer, Warehouse],
    transaction,
    ...(transaction ? { lock: transaction.LOCK.UPDATE } : {}),
  });
  if (!sale) throw new HttpError(404, 'Sale invoice not found.');

  const items = await SaleItem.findAll({
    // Manual bill items do not represent inventory and therefore are excluded
    // from stock returns. They remain visible on the original invoice.
    where: { sale_id: sale.id, product_id: { [Op.ne]: null } },
    include: [Product],
    transaction,
    ...(transaction ? { lock: transaction.LOCK.UPDATE } : {}),
  });
  if (!items.length) throw new HttpError(422, 'This sale has no stocked items that can be returned.');
  const source = aggregateSourceItems(items, 'product_price');
  const alreadyReturned = await returnedQuantities('sale', sale.id, transaction);

  const returnableItems = [...source.values()].map((item) => {
    const returned = alreadyReturned.get(item.product_id) || 0;
    const returnable = Math.max(0, item.document_quantity - returned);
    const unitPrice = item.document_quantity > 0 ? item.document_total / item.document_quantity : 0;
    return {
      product_id: item.product_id,
      product_name: item.Product?.name || `Product ${item.product_id}`,
      product_code: item.Product?.code || '',
      document_quantity: item.document_quantity,
      returned_quantity: returned,
      returnable_quantity: returnable,
      unit_price: unitPrice,
    };
  });

  return { source: sale, items: returnableItems };
}

async function buildPurchaseReturnable(purchaseId, transaction) {
  const purchase = await Purchase.findByPk(purchaseId, {
    include: [Supplier, Warehouse],
    transaction,
    ...(transaction ? { lock: transaction.LOCK.UPDATE } : {}),
  });
  if (!purchase) throw new HttpError(404, 'Purchase document not found.');
  if (purchase.status !== 'received') {
    throw new HttpError(422, 'Only received purchases can be returned to a supplier because ordered or pending purchases have not increased stock.');
  }

  const items = await PurchaseItem.findAll({
    where: { purchase_id: purchase.id },
    include: [Product],
    transaction,
    ...(transaction ? { lock: transaction.LOCK.UPDATE } : {}),
  });
  if (!items.length) throw new HttpError(422, 'This purchase has no line items that can be returned.');
  const source = aggregateSourceItems(items, 'product_cost');
  const alreadyReturned = await returnedQuantities('purchase', purchase.id, transaction);

  const returnableItems = [...source.values()].map((item) => {
    const returned = alreadyReturned.get(item.product_id) || 0;
    const returnable = Math.max(0, item.document_quantity - returned);
    const unitCost = item.document_quantity > 0 ? item.document_total / item.document_quantity : 0;
    return {
      product_id: item.product_id,
      product_name: item.Product?.name || `Product ${item.product_id}`,
      product_code: item.Product?.code || '',
      document_quantity: item.document_quantity,
      returned_quantity: returned,
      returnable_quantity: returnable,
      unit_cost: unitCost,
    };
  });

  return { source: purchase, items: returnableItems };
}


/* ---------------- Sale Returns (customer brings item back) ---------------- */

const saleReturnInclude = [Customer, Warehouse, Sale, { model: SaleReturnItem, as: 'items', include: [Product] }];

const listSaleReturns = asyncHandler(async (req, res) => {
  const where = req.query.warehouse_id ? { warehouse_id: Number(req.query.warehouse_id) } : {};
  const returns = await SaleReturn.findAll({ where, include: saleReturnInclude, order: [['id', 'DESC']] });
  res.json({ data: returns });
});

const saleReturnable = asyncHandler(async (req, res) => {
  const saleId = positiveInteger(req.params.saleId, 'Sale');
  const data = await buildSaleReturnable(saleId);
  res.json({ data });
});

const createSaleReturn = asyncHandler(async (req, res) => {
  const saleId = positiveInteger(req.body?.sale_id, 'Sale');
  const requested = normalizeRequestedItems(req.body?.items);

  const result = await sequelize.transaction(async (transaction) => {
    const returnable = await buildSaleReturnable(saleId, transaction);
    const preparedItems = prepareReturnItems(requested, returnable.items, 'unit_price');

    const grandTotal = preparedItems.reduce((sum, item) => sum + item.sub_total, 0);
    const saleReturn = await SaleReturn.create({
      sale_id: returnable.source.id,
      date: req.body?.date || todayISO(),
      customer_id: returnable.source.customer_id,
      warehouse_id: returnable.source.warehouse_id,
      grand_total: grandTotal,
      notes: String(req.body?.notes || '').trim() || null,
      reference_code: generateReferenceCode('SRT'),
    }, { transaction });

    for (const item of preparedItems) {
      await SaleReturnItem.create({
        sale_return_id: saleReturn.id,
        product_id: item.product_id,
        quantity: item.quantity,
        sold_quantity: item.document_quantity,
        unit_price: item.unit_price,
        sub_total: item.sub_total,
      }, { transaction });

      await adjustStock({
        productId: item.product_id,
        warehouseId: returnable.source.warehouse_id,
        delta: item.quantity,
        transaction,
      });
    }

    return saleReturn;
  });

  const full = await SaleReturn.findByPk(result.id, { include: saleReturnInclude });
  res.status(201).json({ data: full, message: 'Sale return created and stock restored.' });
});

/* ---------------- Purchase Returns (shop sends stock back to supplier) ---------------- */

const purchaseReturnInclude = [Supplier, Warehouse, Purchase, { model: PurchaseReturnItem, as: 'items', include: [Product] }];

const listPurchaseReturns = asyncHandler(async (req, res) => {
  const where = req.query.warehouse_id ? { warehouse_id: Number(req.query.warehouse_id) } : {};
  const returns = await PurchaseReturn.findAll({ where, include: purchaseReturnInclude, order: [['id', 'DESC']] });
  res.json({ data: returns });
});

const purchaseReturnable = asyncHandler(async (req, res) => {
  const purchaseId = positiveInteger(req.params.purchaseId, 'Purchase');
  const data = await buildPurchaseReturnable(purchaseId);
  res.json({ data });
});

const createPurchaseReturn = asyncHandler(async (req, res) => {
  const purchaseId = positiveInteger(req.body?.purchase_id, 'Purchase');
  const requested = normalizeRequestedItems(req.body?.items);

  const result = await sequelize.transaction(async (transaction) => {
    const returnable = await buildPurchaseReturnable(purchaseId, transaction);
    const preparedItems = prepareReturnItems(requested, returnable.items, 'unit_cost');

    const grandTotal = preparedItems.reduce((sum, item) => sum + item.sub_total, 0);
    const purchaseReturn = await PurchaseReturn.create({
      purchase_id: returnable.source.id,
      date: req.body?.date || todayISO(),
      supplier_id: returnable.source.supplier_id,
      warehouse_id: returnable.source.warehouse_id,
      grand_total: grandTotal,
      notes: String(req.body?.notes || '').trim() || null,
      reference_code: generateReferenceCode('PRT'),
    }, { transaction });

    for (const item of preparedItems) {
      // adjustStock validates that the warehouse still contains enough stock.
      await adjustStock({
        productId: item.product_id,
        warehouseId: returnable.source.warehouse_id,
        delta: -item.quantity,
        transaction,
      });

      await PurchaseReturnItem.create({
        purchase_return_id: purchaseReturn.id,
        product_id: item.product_id,
        quantity: item.quantity,
        unit_cost: item.unit_cost,
        sub_total: item.sub_total,
      }, { transaction });
    }

    return purchaseReturn;
  });

  const full = await PurchaseReturn.findByPk(result.id, { include: purchaseReturnInclude });
  res.status(201).json({ data: full, message: 'Purchase return created and stock deducted.' });
});

module.exports = {
  listSaleReturns,
  saleReturnable,
  createSaleReturn,
  listPurchaseReturns,
  purchaseReturnable,
  createPurchaseReturn,
  buildSaleReturnable,
  buildPurchaseReturnable,
  normalizeRequestedItems,
};
