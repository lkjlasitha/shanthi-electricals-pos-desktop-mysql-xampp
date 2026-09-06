const { Op } = require('../config/sequelizeCompat');
const {
  Transfer, TransferItem, Adjustment, AdjustmentItem, Warehouse, Product, User, sequelize,
} = require('../models/associations');
const { asyncHandler, generateReferenceCode } = require('../utils/helpers');
const { adjustStock } = require('../utils/stockService');
const HttpError = require('../utils/httpError');
const { cleanDate, nonNegativeNumber, positiveInteger, positiveNumber } = require('../utils/purchasePipeline');
const { todayISO } = require('../utils/date');

const transferInclude = [
  { model: Warehouse, as: 'fromWarehouse' },
  { model: Warehouse, as: 'toWarehouse' },
  { model: TransferItem, as: 'items', include: [Product] },
  { model: User, as: 'createdBy', attributes: ['id', 'name'] },
];

const adjustmentInclude = [Warehouse, { model: AdjustmentItem, as: 'items', include: [Product] }, { model: User, as: 'createdBy', attributes: ['id', 'name'] }];

function cleanItems(rows, kind) {
  if (!Array.isArray(rows) || !rows.length) throw new HttpError(400, 'At least one item is required.');
  const seen = new Set();
  return rows.map((item, index) => {
    const productId = positiveInteger(item.product_id, `Product for item ${index + 1}`);
    if (seen.has(productId)) throw new HttpError(422, 'Add each product only once per stock document.');
    seen.add(productId);
    const row = { product_id: productId, quantity: positiveNumber(item.quantity, `Quantity for item ${index + 1}`) };
    if (kind === 'transfer') row.purchase_cost = nonNegativeNumber(item.purchase_cost || 0, `Value for item ${index + 1}`);
    if (kind === 'adjustment') {
      if (!['addition', 'subtraction'].includes(item.type)) throw new HttpError(422, `Select a valid movement type for item ${index + 1}.`);
      row.type = item.type;
    }
    return row;
  });
}

async function assertReferences({ warehouseIds, productIds, transaction }) {
  const [warehouseCount, productCount] = await Promise.all([
    Warehouse.count({ where: { id: { [Op.in]: warehouseIds } }, transaction }),
    Product.count({ where: { id: { [Op.in]: productIds }, is_active: true }, transaction }),
  ]);
  if (warehouseCount !== new Set(warehouseIds).size) throw new HttpError(422, 'One or more selected warehouses no longer exists.');
  if (productCount !== new Set(productIds).size) throw new HttpError(422, 'One or more selected products no longer exists or is inactive.');
}

const listTransfers = asyncHandler(async (req, res) => {
  const transfers = await Transfer.findAll({ include: transferInclude, order: [['date', 'DESC'], ['id', 'DESC']], limit: 500 });
  res.json({ data: transfers });
});

const createTransfer = asyncHandler(async (req, res) => {
  const body = req.body || {};
  const fromWarehouseId = positiveInteger(body.from_warehouse_id, 'Source warehouse');
  const toWarehouseId = positiveInteger(body.to_warehouse_id, 'Destination warehouse');
  if (fromWarehouseId === toWarehouseId) throw new HttpError(422, 'Source and destination warehouse must differ.');
  const items = cleanItems(body.items, 'transfer');
  const date = cleanDate(body.date || todayISO(), 'Transfer date', { required: true });
  const shippingCost = nonNegativeNumber(body.shipping_cost || 0, 'Shipping cost');
  const notes = String(body.notes || '').trim() || null;

  const result = await sequelize.transaction(async (transaction) => {
    await assertReferences({
      warehouseIds: [fromWarehouseId, toWarehouseId],
      productIds: items.map((item) => item.product_id),
      transaction,
    });
    const grandTotal = items.reduce((sum, item) => sum + item.quantity * item.purchase_cost, 0) + shippingCost;
    const transfer = await Transfer.create({
      date,
      from_warehouse_id: fromWarehouseId,
      to_warehouse_id: toWarehouseId,
      shipping_cost: shippingCost,
      grand_total: grandTotal,
      status: 'completed',
      notes,
      reference_code: generateReferenceCode('TRF'),
      created_by: req.user?.id || null,
    }, { transaction });

    for (const item of items) {
      // Deduct first. If any line lacks stock the whole transaction rolls back,
      // including earlier lines and the transfer header.
      await adjustStock({ productId: item.product_id, warehouseId: fromWarehouseId, delta: -item.quantity, transaction });
      await adjustStock({ productId: item.product_id, warehouseId: toWarehouseId, delta: item.quantity, transaction });
      await TransferItem.create({
        transfer_id: transfer.id,
        product_id: item.product_id,
        quantity: item.quantity,
        purchase_cost: item.purchase_cost,
        sub_total: item.quantity * item.purchase_cost,
      }, { transaction });
    }
    return transfer;
  });

  const full = await Transfer.findByPk(result.id, { include: transferInclude });
  res.status(201).json({ data: full });
});

const listAdjustments = asyncHandler(async (req, res) => {
  const adjustments = await Adjustment.findAll({ include: adjustmentInclude, order: [['date', 'DESC'], ['id', 'DESC']], limit: 500 });
  res.json({ data: adjustments });
});

const createAdjustment = asyncHandler(async (req, res) => {
  const body = req.body || {};
  const warehouseId = positiveInteger(body.warehouse_id, 'Warehouse');
  const items = cleanItems(body.items, 'adjustment');
  const date = cleanDate(body.date || todayISO(), 'Adjustment date', { required: true });
  const notes = String(body.notes || '').trim();
  if (!notes) throw new HttpError(422, 'Enter a reason for the stock adjustment.');
  if (notes.length > 1000) throw new HttpError(422, 'Adjustment reason must not exceed 1000 characters.');

  const result = await sequelize.transaction(async (transaction) => {
    await assertReferences({ warehouseIds: [warehouseId], productIds: items.map((item) => item.product_id), transaction });
    const adjustment = await Adjustment.create({
      date,
      warehouse_id: warehouseId,
      notes,
      reference_code: generateReferenceCode('ADJ'),
      created_by: req.user?.id || null,
    }, { transaction });

    for (const item of items) {
      const delta = item.type === 'addition' ? item.quantity : -item.quantity;
      await adjustStock({ productId: item.product_id, warehouseId, delta, transaction });
      await AdjustmentItem.create({
        adjustment_id: adjustment.id,
        product_id: item.product_id,
        type: item.type,
        quantity: item.quantity,
      }, { transaction });
    }
    return adjustment;
  });

  const full = await Adjustment.findByPk(result.id, { include: adjustmentInclude });
  res.status(201).json({ data: full });
});

module.exports = { listTransfers, createTransfer, listAdjustments, createAdjustment };
