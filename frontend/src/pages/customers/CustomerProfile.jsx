import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { CustomersAPI, SalesAPI } from '../../api/endpoints';
import {
  Button, Card, Field, Modal, PageHeader, inputClass,
} from '../../components/ui.jsx';
import { formatMoney, formatDate, todayISO } from '../../utils/format';
import { useDialog } from '../../context/DialogContext.jsx';

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
  const { alert: showAlert } = useDialog();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [payModal, setPayModal] = useState(null); // { mode: 'sale'|'account', sale? }
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState('cash');
  const [reference, setReference] = useState('');
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
    setMethod('cash'); setReference(''); setPayError('');
  };
  const openPayAccount = () => {
    setPayModal({ mode: 'account' });
    setAmount('');
    setMethod('cash'); setReference(''); setPayError('');
  };

  const submitPayment = async (event) => {
    event.preventDefault();
    const value = Number(amount);
    if (!Number.isFinite(value) || value <= 0) { setPayError('Enter a valid amount greater than zero.'); return; }
    setSaving(true);
    setPayError('');
    try {
      if (payModal.mode === 'sale') {
        await SalesAPI.addPayment(payModal.sale.id, { amount: value, paying_method: method, reference, paid_on: todayISO() });
      } else {
        await CustomersAPI.addPayment(id, { amount: value, paying_method: method, reference, paid_on: todayISO() });
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

      <Card className="p-5 grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
        <StatBlock label="Total purchased" value={formatMoney(summary.total_purchases)} />
        <StatBlock label="Bills" value={`${summary.invoice_count} (${summary.unpaid_invoice_count} unpaid)`} />
        <StatBlock label="Amount due" value={formatMoney(summary.total_due)} tone={summary.total_due > 0 ? 'danger' : undefined} />
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
                const due = Number(sale.grand_total) - Number(sale.paid_amount);
                return (
                  <div key={sale.id} className="py-3">
                    <div className="flex justify-between items-start gap-2 flex-wrap">
                      <div>
                        <div className="text-sm font-medium font-mono">{sale.reference_code}</div>
                        <div className="text-xs text-graphite-500">{formatDate(sale.date)} · {(sale.items || []).length} item(s)</div>
                      </div>
                      <div className="text-right">
                        <div className="font-medium">{formatMoney(sale.grand_total)}</div>
                        <span className={`inline-block rounded-full border px-2 py-0.5 text-[11px] capitalize ${PAYMENT_STATUS_STYLES[sale.payment_status] || ''}`}>{sale.payment_status}</span>
                      </div>
                    </div>
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
              {customer.opening_balance > 0 && <Button className="px-2 py-1 text-xs" onClick={openPayAccount}>Record payment</Button>}
            </div>
            <div className="text-sm space-y-1.5">
              <div className="flex justify-between"><span>Opening balance</span><span>{formatMoney(customer.opening_balance)}</span></div>
              <div className="flex justify-between"><span>Due from opening balance</span><span>{formatMoney(summary.opening_balance_due)}</span></div>
              <div className="flex justify-between"><span>Due from unpaid bills</span><span>{formatMoney(summary.sales_due)}</span></div>
              <div className="flex justify-between font-semibold pt-1.5 border-t border-slate-200"><span>Total due</span><span>{formatMoney(summary.total_due)}</span></div>
              {customer.credit_limit ? <div className="flex justify-between text-graphite-500"><span>Credit limit</span><span>{formatMoney(customer.credit_limit)}</span></div> : null}
            </div>
          </Card>

          <Card className="p-4">
            <h3 className="font-display font-semibold mb-3">Account payment history</h3>
            {accountPayments.length === 0 && <p className="text-sm text-graphite-500">No account-level payments recorded.</p>}
            <div className="divide-y divide-slate-100">
              {accountPayments.map((payment) => (
                <div key={payment.id} className="py-2 flex justify-between text-sm">
                  <span>{formatDate(payment.paid_on)} · <span className="capitalize text-graphite-500">{payment.paying_method}</span></span>
                  <span className="font-medium">{formatMoney(payment.amount)}</span>
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
          <Field label="Amount"><input type="number" min="0" step="any" className={inputClass} value={amount} onChange={(e) => setAmount(e.target.value)} autoFocus /></Field>
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
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" onClick={() => setPayModal(null)}>Cancel</Button>
            <Button type="submit" disabled={saving}>{saving ? 'Saving…' : 'Record payment'}</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
