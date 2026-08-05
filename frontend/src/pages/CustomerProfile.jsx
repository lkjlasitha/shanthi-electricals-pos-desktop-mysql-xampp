import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { CustomersAPI } from '../api/endpoints';
import { Button, Card, Field, PageHeader, inputClass } from '../components/ui.jsx';
import { formatDate, formatMoney, todayISO } from '../utils/format';
import DocumentActions from '../components/DocumentActions.jsx';

const methodLabel = (method) => ({ cash: 'Cash', card: 'Card', bank_transfer: 'Bank transfer' }[method] || method || '—');

export default function CustomerProfile() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [tab, setTab] = useState('overview');
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState({});
  const [payment, setPayment] = useState({ amount: '', date: todayISO(), payment_method: 'cash', reference: '', note: '' });

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const response = await CustomersAPI.profile(id);
      const data = response.data.data;
      setProfile(data);
      setEditForm({ ...data.customer, opening_balance: String(data.customer.opening_balance || 0), credit_limit: String(data.customer.credit_limit || 0), payment_terms_days: String(data.customer.payment_terms_days || 0) });
    } catch (loadError) {
      setError(loadError.response?.data?.message || 'Customer profile could not be loaded.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [id]);

  const openInvoices = useMemo(() => (profile?.invoices || []).filter((invoice) => Number(invoice.balance) > 0), [profile]);

  const recordPayment = async (event) => {
    event.preventDefault();
    setSaving(true); setError(''); setNotice('');
    try {
      const response = await CustomersAPI.recordPayment(id, { ...payment, amount: Number(payment.amount) });
      setProfile(response.data.data);
      setPayment({ amount: '', date: todayISO(), payment_method: 'cash', reference: '', note: '' });
      setNotice('Payment recorded and allocated to the oldest open bills.');
    } catch (paymentError) {
      setError(paymentError.response?.data?.message || 'Payment could not be recorded.');
    } finally { setSaving(false); }
  };

  const saveProfile = async (event) => {
    event.preventDefault();
    setSaving(true); setError(''); setNotice('');
    try {
      await CustomersAPI.update(id, { ...editForm, opening_balance: Number(editForm.opening_balance || 0), credit_limit: Number(editForm.credit_limit || 0), payment_terms_days: Number(editForm.payment_terms_days || 0) });
      await load();
      setEditing(false);
      setNotice('Customer profile updated.');
    } catch (saveError) { setError(saveError.response?.data?.message || 'Profile could not be updated.'); }
    finally { setSaving(false); }
  };

  if (loading) return <Card className="p-10 text-center text-graphite-500">Loading customer profile…</Card>;
  if (!profile) return <div><Button variant="secondary" onClick={() => navigate('/customers')}>Back to customers</Button>{error && <div className="mt-4 text-red-700">{error}</div>}</div>;

  const { customer, summary, metrics } = profile;
  const tabButton = (key, label) => <button type="button" onClick={() => setTab(key)} className={`rounded-md px-3 py-2 text-sm font-medium ${tab === key ? 'bg-graphite-900 text-white' : 'text-graphite-600 hover:bg-slate-100'}`}>{label}</button>;

  return (
    <div>
      <PageHeader title={customer.name} subtitle={`${customer.customer_code || `Customer #${customer.id}`} · ${customer.phone}`} actions={<><Button variant="secondary" onClick={() => navigate('/customers')}>Back</Button><Button variant="secondary" onClick={() => setEditing((value) => !value)}>{editing ? 'Close edit' : 'Edit profile'}</Button></>} />
      {error && <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
      {notice && <div className="mb-4 rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{notice}</div>}

      {editing && <Card className="mb-5 p-5"><form onSubmit={saveProfile}><div className="grid gap-x-4 md:grid-cols-2 xl:grid-cols-4"><Field label="Name"><input required className={inputClass} value={editForm.name || ''} onChange={(event) => setEditForm({ ...editForm, name: event.target.value })} /></Field><Field label="Customer code"><input className={inputClass} value={editForm.customer_code || ''} onChange={(event) => setEditForm({ ...editForm, customer_code: event.target.value })} /></Field><Field label="Phone"><input required className={inputClass} value={editForm.phone || ''} onChange={(event) => setEditForm({ ...editForm, phone: event.target.value })} /></Field><Field label="Email"><input type="email" className={inputClass} value={editForm.email || ''} onChange={(event) => setEditForm({ ...editForm, email: event.target.value })} /></Field><Field label="City"><input className={inputClass} value={editForm.city || ''} onChange={(event) => setEditForm({ ...editForm, city: event.target.value })} /></Field><Field label="Opening amount due"><input type="number" min="0" step="any" className={inputClass} value={editForm.opening_balance} onChange={(event) => setEditForm({ ...editForm, opening_balance: event.target.value })} /></Field><Field label="Credit limit"><input type="number" min="0" step="any" className={inputClass} value={editForm.credit_limit} disabled={!editForm.allow_credit} onChange={(event) => setEditForm({ ...editForm, credit_limit: event.target.value })} /></Field><Field label="Payment terms (days)"><input type="number" min="0" className={inputClass} value={editForm.payment_terms_days} disabled={!editForm.allow_credit} onChange={(event) => setEditForm({ ...editForm, payment_terms_days: event.target.value })} /></Field></div><div className="grid gap-4 md:grid-cols-3"><label className="mb-3 flex h-10 items-center gap-2 rounded-md border border-slate-200 px-3 text-sm"><input type="checkbox" checked={Boolean(editForm.allow_credit)} onChange={(event) => setEditForm({ ...editForm, allow_credit: event.target.checked })} /> Allow credit purchases</label><Field label="Status"><select className={inputClass} value={editForm.status || 'active'} onChange={(event) => setEditForm({ ...editForm, status: event.target.value })}><option value="active">Active</option><option value="inactive">Inactive</option></select></Field><Field label="VAT / TIN"><input className={inputClass} value={editForm.tax_number || ''} onChange={(event) => setEditForm({ ...editForm, tax_number: event.target.value })} /></Field></div><div className="grid gap-4 md:grid-cols-2"><Field label="Address"><textarea rows={2} className={inputClass} value={editForm.address || ''} onChange={(event) => setEditForm({ ...editForm, address: event.target.value })} /></Field><Field label="Internal notes"><textarea rows={2} className={inputClass} value={editForm.notes || ''} onChange={(event) => setEditForm({ ...editForm, notes: event.target.value })} /></Field></div><div className="flex justify-end"><Button type="submit" disabled={saving}>{saving ? 'Saving…' : 'Save profile'}</Button></div></form></Card>}

      <div className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <Card className="p-4"><div className="text-xs uppercase text-graphite-500">Amount due</div><div className={`mt-1 text-xl font-semibold ${summary.amount_due > 0 ? 'text-red-700' : 'text-emerald-700'}`}>{formatMoney(summary.amount_due)}</div>{summary.credit_balance > 0 && <div className="text-xs text-emerald-700">Customer credit {formatMoney(summary.credit_balance)}</div>}</Card>
        <Card className="p-4"><div className="text-xs uppercase text-graphite-500">Overdue</div><div className={`mt-1 text-xl font-semibold ${summary.overdue > 0 ? 'text-red-700' : 'text-graphite-900'}`}>{formatMoney(summary.overdue)}</div></Card>
        <Card className="p-4"><div className="text-xs uppercase text-graphite-500">Lifetime sales</div><div className="mt-1 text-xl font-semibold">{formatMoney(metrics.total_sales)}</div><div className="text-xs text-graphite-500">{metrics.invoice_count} bills</div></Card>
        <Card className="p-4"><div className="text-xs uppercase text-graphite-500">Total received</div><div className="mt-1 text-xl font-semibold text-emerald-700">{formatMoney(metrics.total_paid)}</div></Card>
        <Card className="p-4"><div className="text-xs uppercase text-graphite-500">Available credit</div><div className="mt-1 text-xl font-semibold text-blue-700">{customer.allow_credit ? formatMoney(summary.available_credit) : 'Not enabled'}</div><div className="text-xs text-graphite-500">Limit {formatMoney(customer.credit_limit)}</div></Card>
      </div>

      <Card className="mb-5 p-5">
        <div className="mb-3 flex items-center justify-between"><div><h2 className="font-display text-lg font-semibold">Receive account payment</h2><p className="text-xs text-graphite-500">Payments automatically settle the oldest open bills; any excess stays as customer credit.</p></div><div className="text-sm">Open bills: <strong>{openInvoices.length}</strong></div></div>
        <form onSubmit={recordPayment} className="grid gap-3 md:grid-cols-[1fr_1fr_1fr_1fr_auto] md:items-end"><Field label="Amount"><input required type="number" min="0.01" step="any" className={inputClass} value={payment.amount} onChange={(event) => setPayment({ ...payment, amount: event.target.value })} /></Field><Field label="Date"><input required type="date" className={inputClass} value={payment.date} onChange={(event) => setPayment({ ...payment, date: event.target.value })} /></Field><Field label="Method"><select className={inputClass} value={payment.payment_method} onChange={(event) => setPayment({ ...payment, payment_method: event.target.value })}><option value="cash">Cash</option><option value="card">Card</option><option value="bank_transfer">Bank transfer</option></select></Field><Field label="Reference"><input className={inputClass} value={payment.reference} onChange={(event) => setPayment({ ...payment, reference: event.target.value })} placeholder="Optional" /></Field><Button type="submit" className="mb-3 justify-center" disabled={saving}>{saving ? 'Recording…' : 'Record payment'}</Button></form>
      </Card>

      <div className="mb-4 flex flex-wrap gap-1 rounded-lg border border-slate-200 bg-white p-1">{tabButton('overview', 'Overview')}{tabButton('invoices', `Bills (${metrics.invoice_count})`)}{tabButton('items', 'Items purchased')}{tabButton('statement', 'Account statement')}</div>

      {tab === 'overview' && <div className="grid gap-4 lg:grid-cols-2"><Card className="p-5"><h2 className="mb-3 font-display text-lg font-semibold">Profile details</h2><dl className="grid grid-cols-2 gap-3 text-sm"><div><dt className="text-graphite-500">Phone</dt><dd>{customer.phone}</dd></div><div><dt className="text-graphite-500">Email</dt><dd>{customer.email || '—'}</dd></div><div><dt className="text-graphite-500">City</dt><dd>{customer.city || '—'}</dd></div><div><dt className="text-graphite-500">VAT / TIN</dt><dd>{customer.tax_number || '—'}</dd></div><div className="col-span-2"><dt className="text-graphite-500">Address</dt><dd>{customer.address || '—'}</dd></div><div className="col-span-2"><dt className="text-graphite-500">Notes</dt><dd>{customer.notes || '—'}</dd></div></dl></Card><Card className="p-5"><h2 className="mb-3 font-display text-lg font-semibold">Account controls</h2><div className="space-y-3 text-sm"><div className="flex justify-between"><span>Credit purchases</span><strong>{customer.allow_credit ? 'Allowed' : 'Not allowed'}</strong></div><div className="flex justify-between"><span>Credit limit</span><strong>{formatMoney(customer.credit_limit)}</strong></div><div className="flex justify-between"><span>Payment terms</span><strong>{customer.payment_terms_days} days</strong></div><div className="flex justify-between"><span>Unallocated credit</span><strong className="text-emerald-700">{formatMoney(summary.unallocated_credit)}</strong></div><div className="flex justify-between"><span>Average bill</span><strong>{formatMoney(metrics.average_sale)}</strong></div><div className="flex justify-between"><span>Last purchase</span><strong>{formatDate(metrics.last_purchase_date)}</strong></div></div></Card></div>}

      {tab === 'invoices' && <Card className="overflow-x-auto"><table className="w-full min-w-[950px] text-sm"><thead><tr className="border-b bg-slate-50 text-left text-graphite-600"><th className="px-4 py-3">Bill</th><th className="px-4 py-3">Date / due</th><th className="px-4 py-3 text-right">Total</th><th className="px-4 py-3 text-right">Paid</th><th className="px-4 py-3 text-right">Returns</th><th className="px-4 py-3 text-right">Balance</th><th className="px-4 py-3">Status</th><th className="px-4 py-3 text-right">Document</th></tr></thead><tbody>{profile.invoices.map((invoice) => { const printableSale = { ...invoice.sale, Customer: customer }; return <tr key={invoice.id} className="border-b border-slate-100"><td className="px-4 py-3 font-mono text-xs">{invoice.reference_code}</td><td className="px-4 py-3"><div>{formatDate(invoice.date)}</div><div className={`text-xs ${invoice.due_date && invoice.due_date < todayISO() && invoice.balance > 0 ? 'text-red-700' : 'text-graphite-500'}`}>Due {formatDate(invoice.due_date)}</div></td><td className="px-4 py-3 text-right">{formatMoney(invoice.grand_total)}</td><td className="px-4 py-3 text-right text-emerald-700">{formatMoney(invoice.paid_amount)}</td><td className="px-4 py-3 text-right">{formatMoney(invoice.return_amount)}</td><td className={`px-4 py-3 text-right font-medium ${invoice.balance > 0 ? 'text-red-700' : 'text-emerald-700'}`}>{formatMoney(invoice.balance)}</td><td className="px-4 py-3 capitalize">{invoice.payment_status}</td><td className="px-4 py-3"><div className="flex justify-end"><DocumentActions type="sale" record={printableSale} allowReceipt compact /></div></td></tr>; })}{!profile.invoices.length && <tr><td colSpan={8} className="px-4 py-10 text-center text-graphite-500">No bills yet.</td></tr>}</tbody></table></Card>}

      {tab === 'items' && <Card className="overflow-x-auto"><table className="w-full min-w-[700px] text-sm"><thead><tr className="border-b bg-slate-50 text-left text-graphite-600"><th className="px-4 py-3">Product</th><th className="px-4 py-3">Code</th><th className="px-4 py-3 text-right">Total quantity</th><th className="px-4 py-3 text-right">Purchased value</th><th className="px-4 py-3">Last purchased</th></tr></thead><tbody>{profile.purchased_items.map((item, index) => <tr key={`${item.product_id || item.name}-${index}`} className="border-b border-slate-100"><td className="px-4 py-3 font-medium">{item.name}</td><td className="px-4 py-3 font-mono text-xs">{item.code || '—'}</td><td className="px-4 py-3 text-right">{item.quantity}</td><td className="px-4 py-3 text-right">{formatMoney(item.amount)}</td><td className="px-4 py-3">{formatDate(item.last_purchased)}</td></tr>)}{!profile.purchased_items.length && <tr><td colSpan={5} className="px-4 py-10 text-center text-graphite-500">No purchased items yet.</td></tr>}</tbody></table></Card>}

      {tab === 'statement' && <Card className="overflow-x-auto"><table className="w-full min-w-[760px] text-sm"><thead><tr className="border-b bg-slate-50 text-left text-graphite-600"><th className="px-4 py-3">Date</th><th className="px-4 py-3">Activity</th><th className="px-4 py-3">Reference</th><th className="px-4 py-3 text-right">Charge</th><th className="px-4 py-3 text-right">Payment / credit</th><th className="px-4 py-3 text-right">Running balance</th></tr></thead><tbody>{profile.statement.map((entry) => <tr key={entry.id} className="border-b border-slate-100"><td className="px-4 py-3">{formatDate(entry.date)}</td><td className="px-4 py-3 capitalize">{entry.type.replaceAll('_', ' ')}</td><td className="px-4 py-3"><div>{entry.reference}</div>{entry.payment_method && <div className="text-xs text-graphite-500">{methodLabel(entry.payment_method)}</div>}</td><td className="px-4 py-3 text-right">{entry.debit ? formatMoney(entry.debit) : '—'}</td><td className="px-4 py-3 text-right text-emerald-700">{entry.credit ? formatMoney(entry.credit) : '—'}</td><td className={`px-4 py-3 text-right font-medium ${entry.balance > 0 ? 'text-red-700' : 'text-emerald-700'}`}>{formatMoney(entry.balance)}</td></tr>)}{!profile.statement.length && <tr><td colSpan={6} className="px-4 py-10 text-center text-graphite-500">No account activity yet.</td></tr>}</tbody></table></Card>}
    </div>
  );
}
