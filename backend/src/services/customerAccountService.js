const {
  Sale, SalesPayment, SaleReturn, CustomerAccountPayment,
} = require('../models/associations');
const { invoiceSnapshot, buildAccountSummary, money } = require('../utils/customerAccount');
const { todayISO } = require('../utils/date');

async function loadAccountSnapshot(customer, { transaction } = {}) {
  const sales = await Sale.findAll({
    where: { customer_id: customer.id },
    include: [
      { model: SalesPayment, as: 'payments', attributes: ['id', 'amount', 'customer_account_payment_id'] },
      { model: SaleReturn, as: 'returns', attributes: ['id', 'grand_total'] },
    ],
    order: [['date', 'ASC'], ['id', 'ASC']],
    transaction,
  });

  const accountPayments = await CustomerAccountPayment.findAll({
    where: { customer_id: customer.id },
    attributes: ['id', 'amount', 'unallocated_amount'],
    transaction,
  });

  const invoices = sales.map(invoiceSnapshot);
  const unallocatedCredit = money(accountPayments.reduce(
    (total, payment) => total + Number(payment.unallocated_amount || 0),
    0
  ));

  return {
    invoices,
    accountPayments,
    summary: buildAccountSummary({ customer, invoices, unallocatedCredit, today: todayISO() }),
  };
}

module.exports = { loadAccountSnapshot };
