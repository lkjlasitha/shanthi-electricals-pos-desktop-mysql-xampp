import React, { useEffect, useState } from 'react';
import { Button, PageHeader, Modal, Card, Field, inputClass } from './ui.jsx';
import { useDialog } from '../context/DialogContext.jsx';

/**
 * Renders a searchable table + add/edit modal for a simple resource.
 *
 * props:
 *  - title, subtitle
 *  - api: { list, create, update, remove }
 *  - columns: [{ key, label, render?(row) }]
 *  - fields: [{ name, label, type: 'text'|'number'|'textarea'|'select', options?, required? }]
 *  - permission: permission key required to add/edit/delete (read is open to any logged-in user)
 *  - hasPermission: fn from AuthContext
 */
export default function CrudPage({ title, subtitle, api, columns, fields, hasPermission, permission }) {
  const { confirm, alert: showAlert } = useDialog();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({});
  const [error, setError] = useState('');

  const canWrite = !permission || (hasPermission && hasPermission(permission));

  const load = async () => {
    setLoading(true);
    try {
      const res = await api.list({ search, per_page: 100 });
      setRows(res.data.data || res.data);
    } catch (e) {
      setError(e.response?.data?.message || 'Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [search]);

  const openCreate = () => {
    setEditing(null);
    const initial = {};
    fields.forEach((f) => { initial[f.name] = f.default ?? ''; });
    setForm(initial);
    setError('');
    setModalOpen(true);
  };

  const openEdit = (row) => {
    setEditing(row);
    setForm({ ...row });
    setError('');
    setModalOpen(true);
  };

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    try {
      if (editing) await api.update(editing.id, form);
      else await api.create(form);
      setModalOpen(false);
      load();
    } catch (e2) {
      setError(e2.response?.data?.message || 'Save failed');
    }
  };

  const remove = async (row) => {
    const ok = await confirm(`Delete "${row.name || row.title || row.code || row.id}"? This cannot be undone.`, {
      title: 'Delete record',
      confirmLabel: 'Delete',
    });
    if (!ok) return;
    try {
      await api.remove(row.id);
      load();
    } catch (e) {
      showAlert(e.response?.data?.message || 'Delete failed — it may be used elsewhere in the system.', {
        title: 'Delete failed',
      });
    }
  };

  return (
    <div>
      <PageHeader
        title={title}
        subtitle={subtitle}
        actions={canWrite ? <Button onClick={openCreate}>+ Add</Button> : null}
      />
      <Card className="p-4 mb-4">
        <input
          className={inputClass + ' max-w-xs'}
          placeholder="Search…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </Card>

      <Card>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-graphite-600">
              {columns.map((c) => <th key={c.key} className="px-4 py-3 font-medium">{c.label}</th>)}
              {canWrite && <th className="px-4 py-3"></th>}
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={columns.length + 1} className="px-4 py-6 text-center text-graphite-500">Loading…</td></tr>
            )}
            {!loading && rows.length === 0 && (
              <tr><td colSpan={columns.length + 1} className="px-4 py-6 text-center text-graphite-500">No records yet.</td></tr>
            )}
            {!loading && rows.map((row) => (
              <tr key={row.id} className="border-b border-slate-100 hover:bg-slate-50">
                {columns.map((c) => (
                  <td key={c.key} className="px-4 py-2.5">{c.render ? c.render(row) : row[c.key]}</td>
                ))}
                {canWrite && (
                  <td className="px-4 py-2.5 text-right space-x-2 whitespace-nowrap">
                    <button onClick={() => openEdit(row)} className="text-copper-600 hover:underline">Edit</button>
                    <button onClick={() => remove(row)} className="text-red-600 hover:underline">Delete</button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editing ? `Edit ${title}` : `Add ${title}`}>
        <form onSubmit={submit}>
          {error && <div className="mb-3 text-sm text-red-600 bg-red-50 border border-red-100 rounded-md px-3 py-2">{error}</div>}
          {fields.map((f) => (
            <Field key={f.name} label={f.label}>
              {f.type === 'textarea' ? (
                <textarea
                  className={inputClass}
                  rows={3}
                  required={f.required}
                  value={form[f.name] ?? ''}
                  onChange={(e) => setForm({ ...form, [f.name]: e.target.value })}
                />
              ) : f.type === 'select' ? (
                <select
                  className={inputClass}
                  required={f.required}
                  value={form[f.name] ?? ''}
                  onChange={(e) => setForm({ ...form, [f.name]: e.target.value })}
                >
                  <option value="">Select…</option>
                  {f.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              ) : (
                <input
                  className={inputClass}
                  type={f.type || 'text'}
                  step={f.type === 'number' ? 'any' : undefined}
                  required={f.required}
                  value={form[f.name] ?? ''}
                  onChange={(e) => setForm({ ...form, [f.name]: e.target.value })}
                />
              )}
            </Field>
          ))}
          <div className="flex justify-end gap-2 mt-4">
            <Button type="button" variant="secondary" onClick={() => setModalOpen(false)}>Cancel</Button>
            <Button type="submit">Save</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
