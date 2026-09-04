import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { CustomersAPI, SalesAPI } from '../../api/endpoints';
import {
  Button, Card, Field, Modal, PageHeader, inputClass,
} from '../../components/ui.jsx';
import { formatMoney, formatDate, todayISO } from '../../utils/format';

const PAYMENT_STATUS_STYLES = {
  paid: 'bg-emerald-50 text-emerald-700 border-emerald-100',
  partial: 'bg-amber-50 text-amber-700 border-amber-100',
  unpaid: 'bg-red-50 text-red-700 border-red-100',
};

function StatBlock({ label, value, tone }) {
  const toneClass = tone === 'danger' ? 'text-red-700' : tone === 'accent' ? 'text-copper-600' : 'text-graphite-950';
  return (
    <div>
      <div className="text-xs uppercase tracking-wide text-graphite-500 font-medium">{label}</div>
      <div className={`font-display text-xl font-semibold ${toneClass}`}>{value}</div>
    </div>
  );
}

export default function CustomerProfile() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [payModal, setPayModal] = useState(null); // { mode: 'sale'|'account', sale? }
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState('cash');
  const [reference, setReference] = useState('');
  const [paymentNote, setPaymentNote] = useState('');
  const [payError, setPayError] = useState('');
  const [saving, setSaving] = useState(false);

  const load = () => {
    setLoading(true);
    setError('');
    CustomersAPI.profile(id)
      .then((r) => setData(r.data.data))
      .catch((e) => setError(e.response?.data?.message || 'Could not load this customer.'))
      .finally(() => setLoading(false));
  };
  useEffect(load, [id]);

  const openPaySale = (sale) => {
    setPayModal({ mode: 'sale', sale });
    setAmount(String((Number(sale.grand_total) - Number(sale.paid_amount)).toFixed(2)));
    setMethod('cash'); setReference(''); setPaymentNote(''); setPayError('');
  };
  const openPayAccount = () => {
    setPayModal({ mode: 'account' });
    setAmount(String(Number(data?.summary?.total_due || 0).toFixed(2)));
    setMethod('cash'); setReference(''); setPaymentNote(''); setPayError('');
  };

  const submitPayment = async (event) => {
    event.preventDefault();
    const value = Number(amount);
    if (!Number.isFinite(value) || value <= 0) { setPayError('Enter a valid amount greater than zero.'); return; }
    setSaving(true);
    setPayError('');
    try {
      if (payModal.mode === 'sale') {
        await SalesAPI.addPayment(payModal.sale.id, { amount: value, paying_method: method, reference, note: paymentNote, paid_on: todayISO() });
      } else {
        await CustomersAPI.addPayment(id, { amount: value, paying_method: method, reference, note: paymentNote, paid_on: todayISO() });
      }
      setPayModal(null);
      load();
    } catch (e) {
      setPayError(e.response?.data?.message || 'Could not record this payment.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="text-graphite-500">Loading…</div>;
  if (error) return <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-700">{error}</div>;
  if (!data) return null;

  const { customer, sales, quotations, account_payments: accountPayments, summary } = data;

  return (
    <div>
      <PageHeader
        title={customer.name}
        subtitle={`${customer.phone}${customer.city ? ` · ${customer.city}` : ''} · ${customer.customer_type} customer`}
        actions={<Button variant="secondary" onClick={() => navigate('/customers')}>Back to customers</Button>}
      />

      <Card className="p-5 grid grid-cols-2 sm:grid-cols-5 gap-4 mb-6">
        <StatBlock label="Total purchased" value={formatMoney(summary.total_purchases)} />
        <StatBlock label="Bills" value={`${summary.invoice_count} (${summary.unpaid_invoice_count} unpaid)`} />
        <StatBlock label="Amount due" value={formatMoney(summary.total_due)} tone={summary.total_due > 0 ? 'danger' : undefined} />
        <StatBlock label="Overdue" value={formatMoney(summary.overdue_due)} tone={summary.overdue_due > 0 ? 'danger' : undefined} />
        <StatBlock label="Last purchase" value={summary.last_purchase_date ? formatDate(summary.last_purchase_date) : '—'} />
      </Card>

      {summary.over_credit_limit && (
        <div className="mb-6 text-sm text-red-700 bg-red-50 border border-red-100 rounded-md px-3 py-2">
          This customer owes {formatMoney(summary.total_due)}, which is over their credit limit of {formatMoney(customer.credit_limit)}.
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 flex flex-col gap-6">
          <Card className="p-4">
            <h3 className="font-display font-semibold mb-3">Bills &amp; payments</h3>
            {sales.length === 0 && <p className="text-sm text-graphite-500 py-2">No bills yet.</p>}
            <div className="divide-y divide-slate-100">
              {sales.map((sale) => {
                const due = Number(sale.due_amount ?? (Number(sale.grand_total) - Number(sale.paid_amount)));
                return (
                  <div key={sale.id} className="py-3">
                    <div className="flex justify-between items-start gap-2 flex-wrap">
                      <div>
                        <div className="text-sm font-medium font-mono">{sale.reference_code}</div>
                        <div className="text-xs text-graphite-500">
                          {formatDate(sale.date)} · {(sale.items || []).length} item(s)
                          {sale.due_date ? ` · due ${formatDate(sale.due_date)}` : ''}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="font-medium">{formatMoney(sale.grand_total)}</div>
                        <span className={`inline-block rounded-full border px-2 py-0.5 text-[11px] capitalize ${PAYMENT_STATUS_STYLES[sale.payment_status] || ''}`}>{sale.payment_status}</span>
                        {sale.is_overdue && <div className="mt-1 text-[11px] font-medium text-red-700">{sale.days_overdue} day(s) overdue</div>}
                      </div>
                    </div>
                    <div className="mt-2 grid grid-cols-3 gap-2 rounded-md bg-slate-50 px-2.5 py-2 text-xs">
                      <div><span className="block text-graphite-500">Bill total</span><strong>{formatMoney(sale.grand_total)}</strong></div>
                      <div><span className="block text-graphite-500">Paid</span><strong className="text-emerald-700">{formatMoney(sale.paid_amount)}</strong></div>
                      <div><span className="block text-graphite-500">Due</span><strong className={due > 0.005 ? 'text-amber-700' : ''}>{formatMoney(due)}</strong></div>
                    </div>
                    <details className="mt-2 rounded-md border border-slate-200 bg-white px-2.5 py-2">
                      <summary className="cursor-pointer text-xs font-medium text-copper-700">View goods and payment history</summary>
                      <div className="mt-2 overflow-x-auto">
                        <table className="w-full min-w-[520px] text-xs">
                          <thead><tr className="text-left text-graphite-500"><th className="py-1 pr-2">Goods</th><th className="py-1 px-2 text-right">Qty</th><th className="py-1 px-2 text-right">Price</th><th className="py-1 pl-2 text-right">Line total</th></tr></thead>
                          <tbody>{(sale.items || []).map((item) => (
                            <tr key={item.id} className="border-t border-slate-100">
                              <td className="py-1.5 pr-2"><div className="font-medium">{item.item_name || item.Product?.name || `Product #${item.product_id}`}</div><div className="font-mono text-[10px] text-graphite-400">{item.item_code || item.Product?.code || ''}</div></td>
                              <td className="py-1.5 px-2 text-right">{item.quantity}</td>
                              <td className="py-1.5 px-2 text-right">{formatMoney(item.product_price)}</td>
                              <td className="py-1.5 pl-2 text-right font-medium">{formatMoney(item.sub_total)}</td>
                            </tr>
                          ))}</tbody>
                        </table>
                      </div>
                      <div className="mt-2 border-t border-slate-100 pt-2">
                        <div className="mb-1 text-[10px] font-medium uppercase tracking-wide text-graphite-500">Payments on this bill</div>
                        {(sale.payments || []).length === 0 ? <div className="text-xs text-graphite-400">No payment recorded.</div> : (sale.payments || []).map((payment) => (
                          <div key={payment.id} className="flex justify-between py-0.5 text-xs">
                            <span>{formatDate(payment.paid_on)} · <span className="capitalize">{String(payment.paying_method || '').replace('_', ' ')}</span>{payment.reference ? ` · ${payment.reference}` : ''}</span>
                            <strong>{formatMoney(payment.amount)}</strong>
                          </div>
                        ))}
                      </div>
                    </details>
                    {due > 0.005 && (
                      <div className="mt-2 flex items-center justify-between rounded-md bg-amber-50 border border-amber-100 px-2.5 py-1.5">
                        <span className="text-xs text-amber-800">Due: <strong>{formatMoney(due)}</strong></span>
                        <Button className="px-2 py-1 text-xs" onClick={() => openPaySale(sale)}>Record payment</Button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </Card>

          <Card className="p-4">
            <h3 className="font-display font-semibold mb-3">Recent quotations</h3>
            {quotations.length === 0 && <p className="text-sm text-graphite-500 py-2">No quotations yet.</p>}
            <div className="divide-y divide-slate-100">
              {quotations.map((q) => (
                <div key={q.id} className="py-2.5 flex justify-between items-center cursor-pointer hover:bg-slate-50 -mx-1 px-1 rounded"
                  onClick={() => navigate(`/quotations/${q.id}`)}>
                  <div>
                    <div className="text-sm font-mono">{q.reference_code}</div>
                    <div className="text-xs text-graphite-500">{formatDate(q.date)}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-medium">{formatMoney(q.grand_total)}</div>
                    <div className="text-xs capitalize text-graphite-500">{q.status}</div>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </div>

        <div className="flex flex-col gap-6">
          <Card className="p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-display font-semibold">Account balance</h3>
              {summary.total_due > 0.005 && <Button className="px-2 py-1 text-xs" onClick={openPayAccount}>Pay account</Button>}
            </div>
            <div className="text-sm space-y-1.5">
              <div className="flex justify-between"><span>Opening balance</span><span>{formatMoney(customer.opening_balance)}</span></div>
              <div className="flex justify-between"><span>Due from opening balance</span><span>{formatMoney(summary.opening_balance_due)}</span></div>
              <div className="flex justify-between"><span>Due from unpaid bills</span><span>{formatMoney(summary.sales_due)}</span></div>
              <div className="flex justify-between text-red-700"><span>Overdue now</span><span>{formatMoney(summary.overdue_due)}</span></div>
              {summary.next_due_date && <div className="flex justify-between text-graphite-500"><span>Next due date</span><span>{formatDate(summary.next_due_date)}</span></div>}
              <div className="flex justify-between font-semibold pt-1.5 border-t border-slate-200"><span>Total due</span><span>{formatMoney(summary.total_due)}</span></div>
              {customer.credit_limit ? <div className="flex justify-between text-graphite-500"><span>Credit limit</span><span>{formatMoney(customer.credit_limit)}</span></div> : null}
            </div>
          </Card>

          <Card className="p-4">
            <h3 className="font-display font-semibold mb-3">Account payment history</h3>
            {accountPayments.length === 0 && <p className="text-sm text-graphite-500">No account-level payments recorded.</p>}
            <div className="divide-y divide-slate-100">
              {accountPayments.map((payment) => (
                <div key={payment.id} className="py-2 text-sm">
                  <div className="flex justify-between">
                    <span>{formatDate(payment.paid_on)} · <span className="capitalize text-graphite-500">{String(payment.paying_method || '').replace('_', ' ')}</span></span>
                    <span className="font-medium">{formatMoney(payment.amount)}</span>
                  </div>
                  <div className="mt-1 text-[11px] text-graphite-500">
                    {Number(payment.opening_balance_amount === null ? payment.amount : payment.opening_balance_amount || 0) > 0 && (
                      <div>Opening balance: {formatMoney(payment.opening_balance_amount === null ? payment.amount : payment.opening_balance_amount)}</div>
                    )}
                    {(payment.allocations || []).map((allocation) => (
                      <div key={allocation.id}>Invoice {allocation.Sale?.reference_code || `#${allocation.sale_id}`}: {formatMoney(allocation.amount)}</div>
                    ))}
                    {payment.reference && <div>Reference: {payment.reference}</div>}
                    {payment.note && <div>{payment.note}</div>}
                  </div>
                </div>
              ))}
            </div>
          </Card>

          {customer.notes && (
            <Card className="p-4">
              <h3 className="font-display font-semibold mb-2">Notes</h3>
              <p className="text-sm text-graphite-600 whitespace-pre-line">{customer.notes}</p>
            </Card>
          )}
        </div>
      </div>

      <Modal open={!!payModal} onClose={() => setPayModal(null)} title={payModal?.mode === 'sale' ? `Record payment for ${payModal.sale.reference_code}` : 'Record account payment'}>
        <form onSubmit={submitPayment} className="space-y-3">
          {payError && <div className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-md px-3 py-2">{payError}</div>}
          {payModal?.mode === 'account' && (
            <div className="rounded-md border border-blue-100 bg-blue-50 px-3 py-2 text-xs text-blue-800">
              This receipt is applied to the opening balance first, then to the oldest unpaid bills. Maximum: {formatMoney(summary.total_due)}.
            </div>
          )}
          <Field label="Amount"><input type="number" min="0.01" max={payModal?.mode === 'sale' ? payModal.sale.due_amount : summary.total_due} step="any" className={inputClass} value={amount} onChange={(e) => setAmount(e.target.value)} autoFocus /></Field>
          <Field label="Method">
            <select className={inputClass} value={method} onChange={(e) => setMethod(e.target.value)}>
              <option value="cash">Cash</option>
              <option value="card">Card</option>
              <option value="bank_transfer">Bank transfer</option>
              <option value="cheque">Cheque</option>
              <option value="other">Other</option>
            </select>
          </Field>
          <Field label="Reference (optional)"><input className={inputClass} value={reference} onChange={(e) => setReference(e.target.value)} /></Field>
          <Field label="Note (optional)"><textarea rows={2} className={inputClass} value={paymentNote} onChange={(e) => setPaymentNote(e.target.value)} /></Field>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" onClick={() => setPayModal(null)}>Cancel</Button>
            <Button type="submit" disabled={saving}>{saving ? 'Saving…' : 'Record payment'}</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
