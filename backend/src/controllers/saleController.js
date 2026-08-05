const { Op } = require('sequelize');
const { todayISO, addDaysISO, isValidISODate } = require('../utils/date');
const {
  Sale, SaleItem, SaleReturn, Product, Customer, Warehouse, SalesPayment, CustomerAccountPayment, sequelize,
} = require('../models/associations');
const { asyncHandler, generateReferenceCode } = require('../utils/helpers');
const { adjustStock } = require('../utils/stockService');
const HttpError = require('../utils/httpError');
const {
  computeSaleLine,
  nonNegativeNumber,
  applyProductFinancialSnapshot,
} = require('../utils/saleLine');
const { loadAccountSnapshot } = require('../services/customerAccountService');

const PAYMENT_METHODS = new Set(['cash', 'card', 'bank_transfer', 'credit']);

const includeGraph = [
  Customer, Warehouse,
  { model: SaleItem, as: 'items', include: [Product] },
  { model: SalesPayment, as: 'payments' },
];

const list = asyncHandler(async (req, res) => {
  const page = parseInt(req.query.page || '1', 10);
  const perPage = Math.min(parseInt(req.query.per_page || '20', 10), 200);
  const where = {};
  if (req.query.warehouse_id) where.warehouse_id = req.query.warehouse_id;
  if (req.query.customer_id) where.customer_id = req.query.customer_id;
  if (req.query.reference_code) where.reference_code = { [Op.like]: `%${req.query.reference_code}%` };
  if (req.query.from_date && req.query.to_date) where.date = { [Op.between]: [req.query.from_date, req.query.to_date] };

  const { rows, count } = await Sale.findAndCountAll({
    where, include: includeGraph, order: [['id', 'DESC']],
    limit: perPage, offset: (page - 1) * perPage, distinct: true,
  });
  res.json({ data: rows, total: count, page, per_page: perPage, total_pages: Math.ceil(count / perPage) });
});

const getOne = asyncHandler(async (req, res) => {
  const sale = await Sale.findByPk(req.params.id, { include: includeGraph });
  if (!sale) return res.status(404).json({ message: 'Not found' });
  res.json({ data: sale });
});

// POS checkout supports both catalogue products and one-off manual bill items.
// Manual items have product_id=null, keep an item_name snapshot, and never change stock.
const create = asyncHandler(async (req, res) => {
  const body = req.body || {};
  if (!Array.isArray(body.items) || !body.items.length) throw new HttpError(400, 'Cart is empty');
  if (!body.warehouse_id) throw new HttpError(422, 'Select a warehouse first.');
  if (!body.customer_id) throw new HttpError(422, 'Select a customer first.');

  const result = await sequelize.transaction(async (transaction) => {
    const customer = await Customer.findByPk(body.customer_id, { transaction, lock: transaction.LOCK.UPDATE });
    if (!customer || customer.status === 'inactive') {
      throw new HttpError(422, 'The selected customer does not exist or is inactive.');
    }
    const computedItems = body.items.map((item, index) => computeSaleLine(item, index));
    const productIds = [...new Set(computedItems.map((item) => item.product_id).filter(Boolean))];

    const products = productIds.length
      ? await Product.findAll({
        where: { id: { [Op.in]: productIds }, is_active: true },
        transaction,
        lock: transaction.LOCK.UPDATE,
      })
      : [];

    if (products.length !== productIds.length) {
      throw new HttpError(422, 'One or more selected products no longer exists or is inactive. Refresh the POS and try again.');
    }

    const productsById = new Map(products.map((product) => [Number(product.id), product]));
    let subTotal = 0;

    for (const item of computedItems) {
      if (item.product_id) {
        const product = productsById.get(Number(item.product_id));
        // Save a historical name/code snapshot so old receipts remain understandable
        // even when the catalogue entry is renamed later.
        item.item_name = product.name;
        item.item_code = product.code || null;
        item.is_manual = false;
        Object.assign(item, applyProductFinancialSnapshot(item, product));
      } else {
        Object.assign(item, applyProductFinancialSnapshot(item));
      }
      subTotal += item.sub_total;
    }

    const discount = nonNegativeNumber(body.discount || 0, 'Order discount');
    const shipping = nonNegativeNumber(body.shipping || 0, 'Shipping');
    const taxRate = nonNegativeNumber(body.tax_rate || 0, 'Order tax');
    if (discount > subTotal) throw new HttpError(422, 'Order discount cannot exceed the sale subtotal.');

    const orderTaxAmount = ((subTotal - discount) * taxRate) / 100;
    const grandTotal = subTotal - discount + shipping + orderTaxAmount;
    const requestedPaidAmount = body.paid_amount === null || body.paid_amount === undefined || body.paid_amount === ''
      ? grandTotal
      : nonNegativeNumber(body.paid_amount, 'Paid amount');
    const paidAmount = Math.min(requestedPaidAmount, grandTotal);
    const receivedAmount = body.received_amount === null || body.received_amount === undefined || body.received_amount === ''
      ? requestedPaidAmount
      : nonNegativeNumber(body.received_amount, 'Received amount');
    if (receivedAmount < paidAmount) throw new HttpError(422, 'Received amount cannot be less than the amount applied to the sale.');
    const paymentStatus = paidAmount >= grandTotal ? 'paid' : paidAmount > 0 ? 'partial' : 'unpaid';
    const unpaidAmount = grandTotal - paidAmount;
    let accountSnapshot = null;
    if (unpaidAmount > 0) {
      accountSnapshot = await loadAccountSnapshot(customer, { transaction });
      const newUncoveredCredit = Math.max(0, unpaidAmount - Number(accountSnapshot.summary.credit_balance || 0));
      if (newUncoveredCredit > 0 && !customer.allow_credit) {
        throw new HttpError(422, 'This customer is not approved for credit sales. Enable credit on the customer profile or collect the full amount.');
      }
      const projectedOutstanding = Math.max(0, Number(accountSnapshot.summary.outstanding || 0)) + newUncoveredCredit;
      if (projectedOutstanding > Number(customer.credit_limit || 0) + 0.001) {
        throw new HttpError(422, `This sale would exceed the customer's credit limit. Available credit: ${accountSnapshot.summary.available_credit.toFixed(2)}.`);
      }
    }
    const saleDate = body.date || todayISO();
    if (!isValidISODate(saleDate)) throw new HttpError(422, 'Sale date must be a valid date.');
    const paymentType = PAYMENT_METHODS.has(body.payment_type) ? body.payment_type : 'cash';

    const sale = await Sale.create({
      date: saleDate,
      due_date: unpaidAmount > 0 ? addDaysISO(saleDate, customer.payment_terms_days) : null,
      customer_id: body.customer_id,
      warehouse_id: body.warehouse_id,
      pos_register_id: body.pos_register_id || null,
      tax_rate: taxRate,
      tax_amount: orderTaxAmount,
      discount,
      shipping,
      grand_total: grandTotal,
      received_amount: receivedAmount,
      paid_amount: paidAmount,
      payment_type: paymentType,
      payment_status: paymentStatus,
      note: body.note || null,
      reference_code: generateReferenceCode('INV'),
      created_by: req.user ? req.user.id : null,
    }, { transaction });

    for (const item of computedItems) {
      await SaleItem.create({ ...item, sale_id: sale.id }, { transaction });

      if (item.product_id) {
        // Only catalogue products are inventory-controlled. Manual bill items are
        // intentionally excluded from stock so a quick sale cannot create fake stock.
        await adjustStock({
          productId: item.product_id,
          warehouseId: body.warehouse_id,
          delta: -item.quantity,
          transaction,
        });
      }
    }

    if (paidAmount > 0) {
      await SalesPayment.create({
        sale_id: sale.id,
        amount: paidAmount,
        paying_method: paymentType,
        received_amount: receivedAmount,
        paid_on: saleDate,
      }, { transaction });
    }

    // Apply any genuine advance/customer credit after the current tender. An
    // unallocated amount only exists after all older invoices were settled, so
    // using it here keeps both the invoice status and account balance aligned.
    let remainingAfterTender = unpaidAmount;
    let accountCreditApplied = 0;
    if (remainingAfterTender > 0 && Number(accountSnapshot?.summary?.credit_balance || 0) > 0) {
      const creditReceipts = await CustomerAccountPayment.findAll({
        where: { customer_id: customer.id, unallocated_amount: { [Op.gt]: 0 } },
        order: [['date', 'ASC'], ['id', 'ASC']],
        transaction,
        lock: transaction.LOCK.UPDATE,
      });
      for (const receipt of creditReceipts) {
        if (remainingAfterTender <= 0) break;
        const allocated = Math.min(remainingAfterTender, Number(receipt.unallocated_amount || 0));
        if (allocated <= 0) continue;
        await SalesPayment.create({
          sale_id: sale.id,
          customer_account_payment_id: receipt.id,
          amount: allocated,
          paying_method: receipt.payment_method,
          received_amount: allocated,
          reference: receipt.receipt_code,
          note: 'Applied from existing customer account credit',
          paid_on: saleDate,
        }, { transaction });
        await receipt.update({ unallocated_amount: Number(receipt.unallocated_amount) - allocated }, { transaction });
        remainingAfterTender -= allocated;
        accountCreditApplied += allocated;
      }
      if (accountCreditApplied > 0) {
        await sale.update({
          paid_amount: paidAmount + accountCreditApplied,
          payment_status: remainingAfterTender <= 0.001 ? 'paid' : 'partial',
          due_date: remainingAfterTender <= 0.001 ? null : sale.due_date,
        }, { transaction });
      }
    }

    return sale;
  });

  const full = await Sale.findByPk(result.id, { include: includeGraph });
  res.status(201).json({ data: full });
});

// Record an additional payment against a partially-paid / credit sale
const addPayment = asyncHandler(async (req, res) => {
  const amount = Number(req.body.amount);
  if (!Number.isFinite(amount) || amount <= 0) throw new HttpError(422, 'A positive payment amount is required.');
  const payingMethod = PAYMENT_METHODS.has(req.body.paying_method) ? req.body.paying_method : 'cash';
  const paidOn = req.body.paid_on || todayISO();
  if (!isValidISODate(paidOn)) throw new HttpError(422, 'Payment date must be a valid date.');

  const saleId = await sequelize.transaction(async (transaction) => {
    const sale = await Sale.findByPk(req.params.id, { transaction, lock: transaction.LOCK.UPDATE });
    if (!sale) throw new HttpError(404, 'Sale not found');
    const [payments, returned] = await Promise.all([
      SalesPayment.sum('amount', { where: { sale_id: sale.id }, transaction }),
      SaleReturn.sum('grand_total', { where: { sale_id: sale.id }, transaction }),
    ]);
    const outstanding = Math.max(0, Number(sale.grand_total || 0) - Number(payments || 0) - Number(returned || 0));
    if (outstanding <= 0) throw new HttpError(409, 'This sale is already fully settled.');
    if (amount > outstanding + 0.001) {
      throw new HttpError(422, `Payment cannot exceed the outstanding amount of ${outstanding.toFixed(2)}. Use the customer profile to retain an excess amount as account credit.`);
    }
    const receivedAmount = req.body.received_amount === undefined || req.body.received_amount === ''
      ? amount
      : nonNegativeNumber(req.body.received_amount, 'Received amount');
    if (receivedAmount < amount) throw new HttpError(422, 'Received amount cannot be less than the payment amount.');

    await SalesPayment.create({
      sale_id: sale.id,
      amount,
      paying_method: payingMethod,
      received_amount: receivedAmount,
      reference: req.body.reference || null,
      note: req.body.note || null,
      paid_on: paidOn,
    }, { transaction });

    const newPaidTotal = Number(payments || 0) + amount;
    await sale.update({
      paid_amount: newPaidTotal,
      payment_status: newPaidTotal + Number(returned || 0) >= Number(sale.grand_total) ? 'paid' : 'partial',
    }, { transaction });
    return sale.id;
  });

  const full = await Sale.findByPk(saleId, { include: includeGraph });
  res.json({ data: full });
});

module.exports = { list, getOne, create, addPayment };
