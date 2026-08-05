import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CustomersAPI } from '../api/endpoints';
import { Button, Card, Field, PageHeader, inputClass } from '../components/ui.jsx';
import { formatMoney, formatDate } from '../utils/format';

const initialForm = {
  name: '', customer_code: '', phone: '', email: '', city: '', address: '', tax_number: '',
  opening_balance: '0', allow_credit: false, credit_limit: '0', payment_terms_days: '0',
  status: 'active', notes: '', country: 'Sri Lanka',
};

export default function Customers() {
  const navigate = useNavigate();
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(initialForm);

  const load = async (query = search) => {
    setLoading(true);
    setError('');
    try {
      const response = await CustomersAPI.list({ per_page: 200, search: query || undefined });
      setCustomers(response.data.data || response.data || []);
    } catch (loadError) {
      setError(loadError.response?.data?.message || 'Customers could not be loaded.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(''); }, []);

  const filtered = useMemo(() => customers.filter((customer) => {
    if (filter === 'outstanding') return Number(customer.account?.amount_due || 0) > 0;
    if (filter === 'overdue') return Number(customer.account?.overdue || 0) > 0;
    if (filter === 'credit') return customer.allow_credit;
    if (filter === 'inactive') return customer.status === 'inactive';
    return true;
  }), [customers, filter]);

  const totals = useMemo(() => ({
    due: customers.reduce((sum, customer) => sum + Number(customer.account?.amount_due || 0), 0),
    overdue: customers.reduce((sum, customer) => sum + Number(customer.account?.overdue || 0), 0),
    creditCustomers: customers.filter((customer) => customer.allow_credit).length,
  }), [customers]);

  const createCustomer = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    try {
      const response = await CustomersAPI.create({
        ...form,
        opening_balance: Number(form.opening_balance || 0),
        credit_limit: Number(form.credit_limit || 0),
        payment_terms_days: Number(form.payment_terms_days || 0),
      });
      setForm(initialForm);
      setShowForm(false);
      await load('');
      navigate(`/customers/${response.data.data.id}`);
    } catch (saveError) {
      setError(saveError.response?.data?.message || 'Customer could not be saved.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <PageHeader title="Customer accounts" subtitle="Profiles, purchase history, credit limits, balances and payment follow-up in one place." actions={<Button onClick={() => setShowForm((visible) => !visible)}>{showForm ? 'Close form' : '+ New customer'}</Button>} />
      {error && <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

      {showForm && (
        <Card className="mb-5 p-5">
          <h2 className="mb-4 font-display text-lg font-semibold">Create customer profile</h2>
          <form onSubmit={createCustomer}>
            <div className="grid gap-x-4 md:grid-cols-2 xl:grid-cols-4">
              <Field label="Customer name"><input required className={inputClass} value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /></Field>
              <Field label="Customer code"><input className={inputClass} value={form.customer_code} onChange={(event) => setForm({ ...form, customer_code: event.target.value })} placeholder="Optional" /></Field>
              <Field label="Phone"><input required className={inputClass} value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} /></Field>
              <Field label="Email"><input type="email" className={inputClass} value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} /></Field>
              <Field label="City"><input className={inputClass} value={form.city} onChange={(event) => setForm({ ...form, city: event.target.value })} /></Field>
              <Field label="VAT / TIN"><input className={inputClass} value={form.tax_number} onChange={(event) => setForm({ ...form, tax_number: event.target.value })} /></Field>
              <Field label="Opening amount due"><input type="number" min="0" step="any" className={inputClass} value={form.opening_balance} onChange={(event) => setForm({ ...form, opening_balance: event.target.value })} /></Field>
              <Field label="Profile status"><select className={inputClass} value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value })}><option value="active">Active</option><option value="inactive">Inactive</option></select></Field>
            </div>
            <div className="grid gap-4 md:grid-cols-[auto_1fr_1fr] md:items-end">
              <label className="mb-3 flex h-10 items-center gap-2 rounded-md border border-slate-200 px-3 text-sm"><input type="checkbox" checked={form.allow_credit} onChange={(event) => setForm({ ...form, allow_credit: event.target.checked })} /> Allow purchases on credit</label>
              <Field label="Credit limit"><input type="number" min="0" step="any" disabled={!form.allow_credit} className={inputClass} value={form.credit_limit} onChange={(event) => setForm({ ...form, credit_limit: event.target.value })} /></Field>
              <Field label="Payment terms (days)"><input type="number" min="0" step="1" disabled={!form.allow_credit} className={inputClass} value={form.payment_terms_days} onChange={(event) => setForm({ ...form, payment_terms_days: event.target.value })} /></Field>
            </div>
            <div className="grid gap-4 md:grid-cols-2"><Field label="Address"><textarea rows={2} className={inputClass} value={form.address} onChange={(event) => setForm({ ...form, address: event.target.value })} /></Field><Field label="Internal notes"><textarea rows={2} className={inputClass} value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} /></Field></div>
            <div className="flex justify-end"><Button type="submit" disabled={saving}>{saving ? 'Saving…' : 'Create customer'}</Button></div>
          </form>
        </Card>
      )}

      <div className="mb-5 grid gap-3 sm:grid-cols-3">
        <Card className="p-4"><div className="text-xs uppercase tracking-wide text-graphite-500">Total receivable</div><div className="mt-1 text-xl font-semibold text-copper-700">{formatMoney(totals.due)}</div></Card>
        <Card className="p-4"><div className="text-xs uppercase tracking-wide text-graphite-500">Overdue</div><div className={`mt-1 text-xl font-semibold ${totals.overdue > 0 ? 'text-red-700' : 'text-emerald-700'}`}>{formatMoney(totals.overdue)}</div></Card>
        <Card className="p-4"><div className="text-xs uppercase tracking-wide text-graphite-500">Credit-enabled profiles</div><div className="mt-1 text-xl font-semibold">{totals.creditCustomers}</div></Card>
      </div>

      <Card className="mb-4 p-4">
        <form className="flex flex-col gap-3 md:flex-row" onSubmit={(event) => { event.preventDefault(); load(search); }}>
          <input className={inputClass + ' md:max-w-md'} value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search name, phone, code or email…" />
          <select className={inputClass + ' md:max-w-[220px]'} value={filter} onChange={(event) => setFilter(event.target.value)}><option value="all">All customers</option><option value="outstanding">Amount outstanding</option><option value="overdue">Overdue</option><option value="credit">Credit enabled</option><option value="inactive">Inactive</option></select>
          <Button type="submit" variant="secondary">Search</Button>
        </form>
      </Card>

      <Card className="overflow-x-auto">
        <table className="w-full min-w-[920px] text-sm">
          <thead><tr className="border-b border-slate-200 bg-slate-50 text-left text-graphite-600"><th className="px-4 py-3">Customer</th><th className="px-4 py-3">Contact</th><th className="px-4 py-3">Last purchase</th><th className="px-4 py-3 text-right">Amount due</th><th className="px-4 py-3 text-right">Overdue</th><th className="px-4 py-3">Credit</th><th className="px-4 py-3 text-right">Invoices</th></tr></thead>
          <tbody>
            {loading && <tr><td colSpan={7} className="px-4 py-10 text-center text-graphite-500">Loading customer accounts…</td></tr>}
            {!loading && !filtered.length && <tr><td colSpan={7} className="px-4 py-10 text-center text-graphite-500">No matching customers.</td></tr>}
            {!loading && filtered.map((customer) => <tr key={customer.id} className="cursor-pointer border-b border-slate-100 hover:bg-slate-50" onClick={() => navigate(`/customers/${customer.id}`)}><td className="px-4 py-3"><div className="font-medium text-copper-700">{customer.name}</div><div className="text-xs text-graphite-500">{customer.customer_code || `Customer #${customer.id}`} {customer.status === 'inactive' && <span className="ml-1 text-red-600">Inactive</span>}</div></td><td className="px-4 py-3"><div>{customer.phone}</div><div className="text-xs text-graphite-500">{customer.city || customer.email || '—'}</div></td><td className="px-4 py-3">{formatDate(customer.last_purchase_date)}</td><td className={`px-4 py-3 text-right font-medium ${Number(customer.account?.amount_due) > 0 ? 'text-red-700' : 'text-emerald-700'}`}>{formatMoney(customer.account?.amount_due)}</td><td className="px-4 py-3 text-right text-red-700">{formatMoney(customer.account?.overdue)}</td><td className="px-4 py-3">{customer.allow_credit ? <><span className="rounded bg-blue-50 px-2 py-1 text-xs text-blue-700">Limit {formatMoney(customer.credit_limit)}</span><div className="mt-1 text-xs text-graphite-500">Available {formatMoney(customer.account?.available_credit)}</div></> : <span className="text-graphite-400">Cash only</span>}</td><td className="px-4 py-3 text-right">{customer.invoice_count || 0}</td></tr>)}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
