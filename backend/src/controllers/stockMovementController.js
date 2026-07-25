const {
  Transfer, TransferItem, Adjustment, AdjustmentItem, Warehouse, Product, sequelize,
} = require('../models/associations');
const { asyncHandler, generateReferenceCode } = require('../utils/helpers');
const { adjustStock } = require('../utils/stockService');

/* ---------------- Transfers (warehouse to warehouse) ---------------- */

const transferInclude = [
  { model: Warehouse, as: 'fromWarehouse' },
  { model: Warehouse, as: 'toWarehouse' },
  { model: TransferItem, as: 'items', include: [Product] },
];

const listTransfers = asyncHandler(async (req, res) => {
  const transfers = await Transfer.findAll({ include: transferInclude, order: [['id', 'DESC']] });
  res.json({ data: transfers });
});

// body: { date, from_warehouse_id, to_warehouse_id, shipping_cost, notes,
//         items: [{ product_id, quantity, purchase_cost }] }
const createTransfer = asyncHandler(async (req, res) => {
  const body = req.body;
  if (!body.items || !body.items.length) return res.status(400).json({ message: 'At least one item is required' });
  if (body.from_warehouse_id === body.to_warehouse_id) {
    return res.status(400).json({ message: 'Source and destination warehouse must differ' });
  }

  const result = await sequelize.transaction(async (t) => {
    const grandTotal = body.items.reduce((sum, i) => sum + Number(i.quantity) * Number(i.purchase_cost || 0), 0)
      + Number(body.shipping_cost || 0);

    const transfer = await Transfer.create({
      date: body.date,
      from_warehouse_id: body.from_warehouse_id,
      to_warehouse_id: body.to_warehouse_id,
      shipping_cost: body.shipping_cost || 0,
      grand_total: grandTotal,
      status: 'completed',
      notes: body.notes || null,
      reference_code: generateReferenceCode('TRF'),
    }, { transaction: t });

    for (const item of body.items) {
      await TransferItem.create({
        transfer_id: transfer.id,
        product_id: item.product_id,
        quantity: item.quantity,
        purchase_cost: item.purchase_cost || 0,
        sub_total: Number(item.quantity) * Number(item.purchase_cost || 0),
      }, { transaction: t });

      await adjustStock({ productId: item.product_id, warehouseId: body.from_warehouse_id, delta: -Number(item.quantity), transaction: t });
      await adjustStock({ productId: item.product_id, warehouseId: body.to_warehouse_id, delta: Number(item.quantity), transaction: t });
    }
    return transfer;
  });

  const full = await Transfer.findByPk(result.id, { include: transferInclude });
  res.status(201).json({ data: full });
});

/* ---------------- Adjustments (stock count corrections, damage, theft, etc.) ---------------- */

const adjustmentInclude = [Warehouse, { model: AdjustmentItem, as: 'items', include: [Product] }];

const listAdjustments = asyncHandler(async (req, res) => {
  const adjustments = await Adjustment.findAll({ include: adjustmentInclude, order: [['id', 'DESC']] });
  res.json({ data: adjustments });
});

// body: { date, warehouse_id, notes, items: [{ product_id, type: 'addition'|'subtraction', quantity }] }
const createAdjustment = asyncHandler(async (req, res) => {
  const body = req.body;
  if (!body.items || !body.items.length) return res.status(400).json({ message: 'At least one item is required' });

  const result = await sequelize.transaction(async (t) => {
    const adjustment = await Adjustment.create({
      date: body.date,
      warehouse_id: body.warehouse_id,
      notes: body.notes || null,
      reference_code: generateReferenceCode('ADJ'),
    }, { transaction: t });

    for (const item of body.items) {
      await AdjustmentItem.create({
        adjustment_id: adjustment.id,
        product_id: item.product_id,
        type: item.type,
        quantity: item.quantity,
      }, { transaction: t });

      const delta = item.type === 'addition' ? Number(item.quantity) : -Number(item.quantity);
      await adjustStock({ productId: item.product_id, warehouseId: body.warehouse_id, delta, transaction: t });
    }
    return adjustment;
  });

  const full = await Adjustment.findByPk(result.id, { include: adjustmentInclude });
  res.status(201).json({ data: full });
});

module.exports = { listTransfers, createTransfer, listAdjustments, createAdjustment };
