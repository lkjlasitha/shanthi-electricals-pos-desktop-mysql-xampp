const { Op } = require('../config/db');
const {
  Purchase,
  PurchaseItem,
  PurchasePayment,
  Product,
  Supplier,
  Warehouse,
  User,
  sequelize,
} = require('../models/associations');
const { asyncHandler, generateReferenceCode } = require('../utils/helpers');
const { adjustStock } = require('../utils/stockService');
const { applyProductPriceChange } = require('../services/productPriceService');
const HttpError = require('../utils/httpError');
const { todayISO } = require('../utils/date');
const {
  cleanDate,
  computePurchaseBalance,
  computeInitialPurchasePayment,
  nonNegativeNumber,
  normalizePurchasePaymentMethod,
  normalizePurchaseStatus,
  planPurchaseReceipt,
  positiveInteger,
  positiveNumber,
  resolvePurchaseDueDate,
  summarizePayables,
} = require('../utils/purchasePipeline');

const includeGraph = [
  Supplier,
  Warehouse,
  { model: PurchaseItem, as: 'items', include: [Product] },
  { model: PurchasePayment, as: 'payments', include: [{ model: User, as: 'createdBy', attributes: ['id', 'name'] }] },
];

function userCanManagePrices(user) {
  const role = user?.Role;
  return role?.name === 'admin' || (role?.permissions || []).includes('products.manage');
}

function cleanOptionalText(value, label, maxLength = 255) {
  const text = String(value ?? '').trim();
  if (text.length > maxLength) throw new HttpError(422, `${label} must not exceed ${maxLength} characters.`);
  return text || null;
}

function normalizedPagination(query) {
  const rawPage = Number(query.page || 1);
  const rawPerPage = Number(query.per_page || 20);
  return {
    page: Number.isInteger(rawPage) && rawPage > 0 ? rawPage : 1,
    perPage: Number.isInteger(rawPerPage) && rawPerPage > 0 ? Math.min(rawPerPage, 200) : 20,
  };
}

function purchaseWhere(query = {}) {
  const where = {};
  if (query.warehouse_id) where.warehouse_id = positiveInteger(query.warehouse_id, 'Warehouse');
  if (query.supplier_id) where.supplier_id = positiveInteger(query.supplier_id, 'Supplier');

  const fromDate = cleanDate(query.from_date, 'From date');
  const toDate = cleanDate(query.to_date, 'To date');
  if (fromDate && toDate && fromDate > toDate) throw new HttpError(422, 'From date cannot be after to date.');
  if (fromDate || toDate) {
    where.date = {};
    if (fromDate) where.date[Op.gte] = fromDate;
    if (toDate) where.date[Op.lte] = toDate;
  }

  if (query.payment_status) {
    if (!['paid', 'partial', 'unpaid'].includes(query.payment_status)) throw new HttpError(422, 'Select a valid payment status.');
    where.payment_status = query.payment_status;
  }
  if (query.status) where.status = normalizePurchaseStatus(query.status);
  if (String(query.overdue || '') === 'true') {
    where.payment_status = { [Op.ne]: 'paid' };
    where.due_date = { [Op.lt]: todayISO() };
  }

  const search = String(query.search || '').trim();
  if (search) {
    where[Op.or] = [
      { reference_code: { [Op.like]: `%${search}%` } },
      { supplier_invoice_number: { [Op.like]: `%${search}%` } },
    ];
  }
  return where;
}

const list = asyncHandler(async (req, res) => {
  const { page, perPage } = normalizedPagination(req.query);
  const where = purchaseWhere(req.query);
  const { rows, count } = await Purchase.findAndCountAll({
    where,
    include: includeGraph,
    order: [['date', 'DESC'], ['id', 'DESC']],
    limit: perPage,
    offset: (page - 1) * perPage,
    distinct: true,
  });
  res.json({ data: rows, total: count, page, per_page: perPage, total_pages: Math.ceil(count / perPage) });
});

const summary = asyncHandler(async (req, res) => {
  const rows = await Purchase.findAll({
    where: purchaseWhere(req.query),
    attributes: ['status', 'grand_total', 'returned_amount', 'paid_amount', 'due_date'],
  });
  res.json({ data: summarizePayables(rows, todayISO()) });
});

const getOne = asyncHandler(async (req, res) => {
  const purchase = await Purchase.findByPk(positiveInteger(req.params.id, 'Purchase'), { include: includeGraph });
  if (!purchase) throw new HttpError(404, 'Purchase not found.');
  res.json({ data: purchase });
});

// Creates the supplier bill. Stock only moves when status=received; ordered
// bills can be received later in one or more deliveries through receive().
const create = asyncHandler(async (req, res) => {
  const body = req.body || {};
  if (!Array.isArray(body.items) || !body.items.length) throw new HttpError(400, 'At least one item is required.');
  const purchaseDate = cleanDate(body.date || todayISO(), 'Purchase date', { required: true });
  const supplierId = positiveInteger(body.supplier_id, 'Supplier');
  const warehouseId = positiveInteger(body.warehouse_id, 'Warehouse');
  const requestedStatus = normalizePurchaseStatus(body.status || 'received', { forCreate: true });
  const supplierInvoiceNumber = cleanOptionalText(body.supplier_invoice_number, 'Supplier invoice number', 100);
  const wantsPriceUpdate = body.items.some((item) => item.update_product_cost || item.update_selling_price);

  if (wantsPriceUpdate && !userCanManagePrices(req.user)) {
    throw new HttpError(403, 'You do not have permission to change product prices from a purchase.');
  }
  if (wantsPriceUpdate && requestedStatus !== 'received') {
    throw new HttpError(422, 'Catalogue prices can only be changed when the goods are received.');
  }

  const result = await sequelize.transaction(async (transaction) => {
    const supplier = await Supplier.findByPk(supplierId, { transaction, lock: transaction.LOCK.SHARE });
    const warehouse = await Warehouse.findByPk(warehouseId, { transaction, lock: transaction.LOCK.SHARE });
    if (!supplier) throw new HttpError(422, 'The selected supplier no longer exists. Refresh and select it again.');
    if (!warehouse) throw new HttpError(422, 'The selected warehouse no longer exists. Refresh and select it again.');

    if (supplierInvoiceNumber) {
      const duplicate = await Purchase.findOne({
        where: { supplier_id: supplierId, supplier_invoice_number: supplierInvoiceNumber },
        transaction,
        lock: transaction.LOCK.UPDATE,
      });
      if (duplicate) throw new HttpError(409, `Supplier invoice ${supplierInvoiceNumber} has already been recorded.`);
    }

    const rawProductIds = body.items.map((item, index) => positiveInteger(item.product_id, `Product for item ${index + 1}`));
    const productIds = [...new Set(rawProductIds)];
    if (productIds.length !== rawProductIds.length) {
      throw new HttpError(422, 'Add each product only once to a supplier bill.');
    }
    const products = await Product.findAll({
      where: { id: { [Op.in]: productIds }, is_active: true },
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    if (products.length !== productIds.length) {
      throw new HttpError(422, 'One or more selected products no longer exists or is inactive. Refresh and try again.');
    }
    const productsById = new Map(products.map((product) => [Number(product.id), product]));

    let subTotal = 0;
    const computedItems = body.items.map((item, index) => {
      const productId = rawProductIds[index];
      const quantity = positiveNumber(item.quantity, `Quantity for item ${index + 1}`);
      const cost = nonNegativeNumber(item.product_cost, `Purchase cost for item ${index + 1}`);
      const lineTotal = quantity * cost;
      const discountType = item.discount_type || 'none';
      const taxType = item.tax_type || 'none';
      if (!['none', 'fixed', 'percentage'].includes(discountType)) throw new HttpError(422, `Select a valid discount type for item ${index + 1}.`);
      if (!['none', 'exclusive', 'inclusive'].includes(taxType)) throw new HttpError(422, `Select a valid tax type for item ${index + 1}.`);

      const discountValue = nonNegativeNumber(item.discount_value || 0, `Discount for item ${index + 1}`);
      const discountAmount = discountType === 'percentage' ? (lineTotal * discountValue) / 100
        : discountType === 'fixed' ? discountValue : 0;
      if (discountType === 'percentage' && discountValue > 100) throw new HttpError(422, `Discount for item ${index + 1} cannot exceed 100%.`);
      if (discountAmount > lineTotal) throw new HttpError(422, `Discount for item ${index + 1} cannot exceed the line total.`);

      const taxedBase = lineTotal - discountAmount;
      const taxValue = nonNegativeNumber(item.tax_value || 0, `Tax percentage for item ${index + 1}`);
      if (taxValue > 1000) throw new HttpError(422, `Tax percentage for item ${index + 1} is too large.`);
      let taxAmount = 0;
      if (taxType === 'exclusive') taxAmount = (taxedBase * taxValue) / 100;
      else if (taxType === 'inclusive' && taxValue > 0) taxAmount = taxedBase - taxedBase / (1 + taxValue / 100);

      const itemSubTotal = taxedBase + (taxType === 'exclusive' ? taxAmount : 0);
      subTotal += itemSubTotal;
      return {
        product_id: productId,
        product_cost: cost,
        net_unit_cost: cost - discountAmount / quantity + taxAmount / quantity,
        tax_type: taxType,
        tax_value: taxValue,
        tax_amount: taxAmount,
        discount_type: discountType,
        discount_value: discountValue,
        discount_amount: discountAmount,
        purchase_unit_id: item.purchase_unit_id || null,
        quantity,
        received_quantity: requestedStatus === 'received' ? quantity : 0,
        sub_total: itemSubTotal,
        update_product_cost: Boolean(item.update_product_cost),
        update_selling_price: Boolean(item.update_selling_price),
        new_selling_price: item.update_selling_price
          ? nonNegativeNumber(item.new_selling_price, `New selling price for item ${index + 1}`)
          : undefined,
      };
    });

    const discount = nonNegativeNumber(body.discount || 0, 'Order discount');
    const shipping = nonNegativeNumber(body.shipping || 0, 'Shipping');
    const taxRate = nonNegativeNumber(body.tax_rate || 0, 'Order tax');
    if (discount > subTotal) throw new HttpError(422, 'Order discount cannot exceed the purchase subtotal.');
    if (taxRate > 1000) throw new HttpError(422, 'Order tax percentage is too large.');
    const orderTaxAmount = ((subTotal - discount) * taxRate) / 100;
    const grandTotal = subTotal - discount + shipping + orderTaxAmount;
    const payment = computeInitialPurchasePayment({
      grand_total: grandTotal,
      paid_amount: body.paid_amount,
      payment_type: body.payment_type,
    });
    const dueDate = resolvePurchaseDueDate({
      purchase_date: purchaseDate,
      due_date: body.due_date,
      payment_status: payment.payment_status,
      payment_terms_days: supplier.payment_terms_days,
    });
    if (dueDate && dueDate < purchaseDate) throw new HttpError(422, 'Due date cannot be before the supplier bill date.');

    const purchase = await Purchase.create({
      date: purchaseDate,
      supplier_invoice_number: supplierInvoiceNumber,
      supplier_id: supplierId,
      warehouse_id: warehouseId,
      tax_rate: taxRate,
      tax_amount: orderTaxAmount,
      discount,
      shipping,
      grand_total: grandTotal,
      received_amount: payment.paid_amount,
      paid_amount: payment.paid_amount,
      payment_type: payment.payment_type,
      payment_status: payment.payment_status,
      status: requestedStatus,
      due_date: dueDate,
      received_at: requestedStatus === 'received' ? purchaseDate : null,
      notes: cleanOptionalText(body.notes, 'Notes', 5000),
      reference_code: generateReferenceCode('PO'),
      created_by: req.user?.id || null,
    }, { transaction });

    for (const item of computedItems) {
      const {
        update_product_cost: updateProductCost,
        update_selling_price: updateSellingPrice,
        new_selling_price: newSellingPrice,
        ...purchaseItemData
      } = item;
      await PurchaseItem.create({ ...purchaseItemData, purchase_id: purchase.id }, { transaction });

      if (requestedStatus === 'received') {
        await adjustStock({ productId: item.product_id, warehouseId, delta: item.quantity, transaction });
        if (updateProductCost || updateSellingPrice) {
          await applyProductPriceChange({
            product: productsById.get(item.product_id),
            newCost: updateProductCost ? item.product_cost : undefined,
            newPrice: updateSellingPrice ? newSellingPrice : undefined,
            reason: `Updated while receiving purchase ${purchase.reference_code}`,
            source: 'purchase',
            changedBy: req.user?.id,
            purchaseId: purchase.id,
            transaction,
          });
        }
      }
    }

    if (payment.paid_amount > 0) {
      await PurchasePayment.create({
        purchase_id: purchase.id,
        amount: payment.paid_amount,
        paying_method: payment.payment_type,
        reference: cleanOptionalText(body.payment_reference, 'Payment reference', 150),
        note: 'Initial payment recorded with supplier bill',
        paid_on: purchaseDate,
        created_by: req.user?.id || null,
      }, { transaction });
    }
    return purchase;
  });

  const full = await Purchase.findByPk(result.id, { include: includeGraph });
  res.status(201).json({ data: full, message: result.status === 'received' ? 'Supplier bill saved and stock received.' : 'Supplier bill saved. Stock will change only when goods are received.' });
});

const receive = asyncHandler(async (req, res) => {
  const purchaseId = positiveInteger(req.params.id, 'Purchase');
  const receiptDate = cleanDate(req.body?.date || todayISO(), 'Receipt date', { required: true });
  const result = await sequelize.transaction(async (transaction) => {
    const purchase = await Purchase.findByPk(purchaseId, { transaction, lock: transaction.LOCK.UPDATE });
    if (!purchase) throw new HttpError(404, 'Purchase not found.');
    if (purchase.status === 'cancelled') throw new HttpError(422, 'A cancelled purchase cannot receive stock.');
    if (purchase.status === 'received') throw new HttpError(422, 'This purchase has already been fully received.');
    if (receiptDate < purchase.date) throw new HttpError(422, 'Receipt date cannot be before the supplier bill date.');

    const items = await PurchaseItem.findAll({
      where: { purchase_id: purchase.id },
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    const plan = planPurchaseReceipt(items, req.body?.items);
    for (const increment of plan.increments) {
      const item = items.find((row) => Number(row.id) === increment.purchase_item_id);
      item.received_quantity = increment.new_received_quantity;
      await item.save({ session: transaction.session });
      await adjustStock({
        productId: increment.product_id,
        warehouseId: purchase.warehouse_id,
        delta: increment.quantity,
        transaction,
      });
    }
    purchase.status = plan.status;
    if (plan.status === 'received') purchase.received_at = receiptDate;
    const receiptNote = cleanOptionalText(req.body?.note, 'Receipt note', 1000);
    if (receiptNote) purchase.notes = [purchase.notes, `Receipt ${receiptDate}: ${receiptNote}`].filter(Boolean).join('\n');
    await purchase.save({ session: transaction.session });
    return purchase;
  });

  const full = await Purchase.findByPk(result.id, { include: includeGraph });
  res.json({ data: full, message: full.status === 'received' ? 'All goods received and stock updated.' : 'Partial goods receipt saved and stock updated.' });
});

const addPayment = asyncHandler(async (req, res) => {
  const purchaseId = positiveInteger(req.params.id, 'Purchase');
  const result = await sequelize.transaction(async (transaction) => {
    const purchase = await Purchase.findByPk(purchaseId, { transaction, lock: transaction.LOCK.UPDATE });
    if (!purchase) throw new HttpError(404, 'Purchase not found.');
    if (purchase.status === 'cancelled') throw new HttpError(422, 'A cancelled purchase cannot accept payments.');
    if (purchase.payment_status === 'paid') throw new HttpError(422, 'This supplier bill is already fully paid.');

    const amount = positiveNumber(req.body?.amount, 'Payment amount');
    const currentBalance = computePurchaseBalance(purchase);
    const outstanding = currentBalance.outstanding;
    if (amount - outstanding > 0.005) {
      throw new HttpError(422, `Payment of ${amount.toFixed(2)} is more than the outstanding balance of ${outstanding.toFixed(2)}.`);
    }
    const method = normalizePurchasePaymentMethod(req.body?.paying_method, { allowCredit: false });
    const paidOn = cleanDate(req.body?.paid_on || todayISO(), 'Payment date', { required: true });
    await PurchasePayment.create({
      purchase_id: purchase.id,
      amount,
      paying_method: method,
      reference: cleanOptionalText(req.body?.reference, 'Payment reference', 150),
      note: cleanOptionalText(req.body?.note, 'Payment note', 1000),
      paid_on: paidOn,
      created_by: req.user?.id || null,
    }, { transaction });

    const newPaid = Number(purchase.paid_amount || 0) + amount;
    purchase.paid_amount = newPaid;
    purchase.received_amount = newPaid;
    purchase.payment_status = computePurchaseBalance({ ...purchase.toJSON(), paid_amount: newPaid }).payment_status;
    await purchase.save({ session: transaction.session });
    return purchase;
  });

  const full = await Purchase.findByPk(result.id, { include: includeGraph });
  res.json({ data: full, message: 'Supplier payment recorded.' });
});

const cancel = asyncHandler(async (req, res) => {
  const purchaseId = positiveInteger(req.params.id, 'Purchase');
  const result = await sequelize.transaction(async (transaction) => {
    const purchase = await Purchase.findByPk(purchaseId, { transaction, lock: transaction.LOCK.UPDATE });
    if (!purchase) throw new HttpError(404, 'Purchase not found.');
    if (purchase.status === 'cancelled') throw new HttpError(422, 'This purchase is already cancelled.');
    const received = await PurchaseItem.sum('received_quantity', { where: { purchase_id: purchase.id }, transaction });
    const paid = await PurchasePayment.sum('amount', { where: { purchase_id: purchase.id }, transaction });
    if (Number(received || 0) > 0.000001) throw new HttpError(422, 'Received goods must be handled with a supplier return; this bill cannot be cancelled.');
    if (Number(paid || 0) > 0.005) throw new HttpError(422, 'Record the supplier refund before cancelling a paid bill.');
    const reason = cleanOptionalText(req.body?.reason, 'Cancellation reason', 1000);
    if (!reason) throw new HttpError(422, 'Enter a cancellation reason.');
    purchase.status = 'cancelled';
    purchase.notes = [purchase.notes, `Cancelled: ${reason}`].filter(Boolean).join('\n');
    await purchase.save({ session: transaction.session });
    return purchase;
  });
  const full = await Purchase.findByPk(result.id, { include: includeGraph });
  res.json({ data: full, message: 'Purchase cancelled.' });
});

module.exports = { list, summary, getOne, create, receive, addPayment, cancel };
