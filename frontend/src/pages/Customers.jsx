import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CustomersAPI } from '../api/endpoints';
import {
  Button, Card, Field, Modal, PageHeader, inputClass,
} from '../components/ui.jsx';
import { formatMoney } from '../utils/format';
import { useDialog } from '../context/DialogContext.jsx';

const EMPTY_FORM = {
  name: '', phone: '', email: '', city: '', address: '', tax_number: '',
  opening_balance: '0', customer_type: 'retail', credit_limit: '', is_active: true, notes: '',
};

const TYPE_STYLES = {
  retail: 'bg-slate-50 text-slate-700 border-slate-200',
  wholesale: 'bg-indigo-50 text-indigo-700 border-indigo-100',
  credit: 'bg-amber-50 text-amber-700 border-amber-100',
};

export default function Customers() {
  const navigate = useNavigate();
  const { confirm, alert: showAlert } = useDialog();
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('');

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);

  const load = () => {
    setLoading(true);
    setError('');
    CustomersAPI.listWithBalances({ search: search || undefined })
      .then((r) => setCustomers(r.data.data || []))
      .catch((e) => setError(e.response?.data?.message || 'Failed to load customers.'))
      .finally(() => setLoading(false));
  };
  useEffect(load, [search]);

  const filtered = typeFilter ? customers.filter((c) => c.customer_type === typeFilter) : customers;

  const openCreate = () => { setEditing(null); setForm(EMPTY_FORM); setFormError(''); setModalOpen(true); };
  const openEdit = (customer) => {
    setEditing(customer);
    setForm({
      name: customer.name || '', phone: customer.phone || '', email: customer.email || '',
      city: customer.city || '', address: customer.address || '', tax_number: customer.tax_number || '',
      opening_balance: String(customer.opening_balance ?? 0), customer_type: customer.customer_type || 'retail',
      credit_limit: customer.credit_limit ? String(customer.credit_limit) : '', is_active: customer.is_active !== false, notes: customer.notes || '',
    });
    setFormError('');
    setModalOpen(true);
  };

  const submit = async (event) => {
    event.preventDefault();
    if (!form.name.trim()) { setFormError('Name is required.'); return; }
    if (!form.phone.trim()) { setFormError('Phone number is required.'); return; }
    setSaving(true);
    setFormError('');
    const payload = {
      ...form,
      opening_balance: Number(form.opening_balance || 0),
      credit_limit: form.credit_limit === '' ? null : Number(form.credit_limit),
    };
    try {
      if (editing) await CustomersAPI.update(editing.id, payload);
      else await CustomersAPI.create(payload);
      setModalOpen(false);
      load();
    } catch (e) {
      setFormError(e.response?.data?.message || 'Could not save this customer.');
    } finally {
      setSaving(false);
    }
  };

  const remove = async (customer) => {
    const ok = await confirm(`Remove ${customer.name}? This cannot be undone.`, { title: 'Remove customer', confirmLabel: 'Remove' });
    if (!ok) return;
    try {
      await CustomersAPI.remove(customer.id);
      load();
    } catch (e) {
      showAlert(e.response?.data?.message || 'This customer could not be removed — they may have existing sales.', { title: 'Could not remove' });
    }
  };

  return (
    <div>
      <PageHeader
        title="Customers"
        subtitle="Regulars, wholesale accounts, and customers buying on credit — with their running balance at a glance."
        actions={(
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => navigate('/customers/receivables')}>Accounts Receivable</Button>
            <Button onClick={openCreate}>+ New Customer</Button>
          </div>
        )}
      />

      <Card className="p-3 mb-4 flex flex-wrap items-center gap-2">
        <input className={inputClass + ' max-w-xs'} placeholder="Search name, phone or email…" value={search} onChange={(e) => setSearch(e.target.value)} />
        <select className="rounded-md border border-slate-200 text-sm px-2 py-1.5" value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
          <option value="">All types</option>
          <option value="retail">Retail</option>
          <option value="wholesale">Wholesale</option>
          <option value="credit">Credit account</option>
        </select>
      </Card>

      {error && <div className="mb-4 text-sm text-red-600 bg-red-50 border border-red-100 rounded-md px-3 py-2">{error}</div>}

      <Card>
        <table className="w-full text-sm">
          <thead><tr className="border-b border-slate-200 text-left text-graphite-600">
            <th className="px-4 py-3 font-medium">Name</th><th className="px-4 py-3 font-medium">Phone</th>
            <th className="px-4 py-3 font-medium">Type</th><th className="px-4 py-3 font-medium">Total purchased</th>
            <th className="px-4 py-3 font-medium">Amount due</th><th className="px-4 py-3 font-medium text-right">Actions</th>
          </tr></thead>
          <tbody>
            {loading && <tr><td colSpan={6} className="px-4 py-6 text-center text-graphite-500">Loading…</td></tr>}
            {!loading && filtered.length === 0 && <tr><td colSpan={6} className="px-4 py-6 text-center text-graphite-500">No customers found.</td></tr>}
            {!loading && filtered.map((customer) => (
              <tr key={customer.id} className="border-b border-slate-100 hover:bg-slate-50 cursor-pointer" onClick={() => navigate(`/customers/${customer.id}`)}>
                <td className="px-4 py-2.5 font-medium text-graphite-900">{customer.name}</td>
                <td className="px-4 py-2.5">{customer.phone}</td>
                <td className="px-4 py-2.5">
                  <span className={`inline-block rounded-full border px-2 py-0.5 text-xs capitalize ${TYPE_STYLES[customer.customer_type] || TYPE_STYLES.retail}`}>{customer.customer_type}</span>
                </td>
                <td className="px-4 py-2.5">{formatMoney(customer.total_purchases)}</td>
                <td className="px-4 py-2.5">
                  {customer.total_due > 0 ? (
                    <span className={`font-medium ${customer.over_credit_limit ? 'text-red-600' : 'text-amber-700'}`}>
                      {formatMoney(customer.total_due)}
                      {customer.over_credit_limit && <span className="ml-1 text-[10px] uppercase">over limit</span>}
                    </span>
                  ) : <span className="text-graphite-400">—</span>}
                </td>
                <td className="px-4 py-2.5" onClick={(e) => e.stopPropagation()}>
                  <div className="flex justify-end gap-2">
                    <Button variant="secondary" className="px-2 py-1 text-xs" onClick={() => openEdit(customer)}>Edit</Button>
                    <Button variant="danger" className="px-2 py-1 text-xs" onClick={() => remove(customer)}>Delete</Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editing ? 'Edit Customer' : 'New Customer'} width="max-w-xl">
        <form onSubmit={submit} className="space-y-3">
          {formError && <div className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-md px-3 py-2">{formError}</div>}
          <div className="grid grid-cols-2 gap-3">
            <Field label="Name"><input className={inputClass} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required /></Field>
            <Field label="Phone"><input className={inputClass} value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} required /></Field>
            <Field label="Email"><input type="email" className={inputClass} value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></Field>
            <Field label="City"><input className={inputClass} value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} /></Field>
          </div>
          <Field label="Address"><textarea className={inputClass} rows={2} value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Tax number"><input className={inputClass} value={form.tax_number} onChange={(e) => setForm({ ...form, tax_number: e.target.value })} /></Field>
            <Field label="Customer type" hint="Credit account = regulars who buy now, pay later.">
              <select className={inputClass} value={form.customer_type} onChange={(e) => setForm({ ...form, customer_type: e.target.value })}>
                <option value="retail">Retail</option>
                <option value="wholesale">Wholesale</option>
                <option value="credit">Credit account</option>
              </select>
            </Field>
            <Field label="Opening balance" hint="A pre-existing debt not tied to any bill.">
              <input type="number" step="any" className={inputClass} value={form.opening_balance} onChange={(e) => setForm({ ...form, opening_balance: e.target.value })} />
            </Field>
            <Field label="Credit limit" hint="Leave blank for no limit. You'll be warned at checkout if exceeded.">
              <input type="number" step="any" className={inputClass} value={form.credit_limit} onChange={(e) => setForm({ ...form, credit_limit: e.target.value })} />
            </Field>
          </div>
          <Field label="Notes"><textarea className={inputClass} rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></Field>
          <label className="flex items-center gap-2 text-sm text-graphite-700">
            <input type="checkbox" checked={form.is_active} onChange={(e) => setForm({ ...form, is_active: e.target.checked })} />
            Active customer
          </label>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" onClick={() => setModalOpen(false)}>Cancel</Button>
            <Button type="submit" disabled={saving}>{saving ? 'Saving…' : 'Save'}</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
