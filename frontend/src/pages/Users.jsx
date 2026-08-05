import React, { useEffect, useState } from 'react';
import { UsersAPI, RolesAPI, WarehousesAPI } from '../api/endpoints';
import { Button, PageHeader, Modal, Card, Field, inputClass } from '../components/ui.jsx';
import { useDialog } from '../context/DialogContext.jsx';

const emptyForm = { name: '', email: '', password: '', phone: '', role_id: '', warehouse_id: '' };

export default function Users() {
  const { confirm } = useDialog();
  const [users, setUsers] = useState([]);
  const [roles, setRoles] = useState([]);
  const [warehouses, setWarehouses] = useState([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState('');

  const load = () => UsersAPI.list().then((r) => setUsers(r.data.data || r.data));
  useEffect(() => {
    load();
    RolesAPI.list().then((r) => setRoles(r.data.data || r.data));
    WarehousesAPI.list({ per_page: 200 }).then((r) => setWarehouses(r.data.data || r.data));
  }, []);

  const openCreate = () => { setEditing(null); setForm(emptyForm); setError(''); setModalOpen(true); };
  const openEdit = (u) => {
    setEditing(u);
    setForm({ name: u.name, email: u.email, password: '', phone: u.phone || '', role_id: u.role_id, warehouse_id: u.warehouse_id || '' });
    setError('');
    setModalOpen(true);
  };

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    try {
      if (editing) {
        const payload = { ...form };
        if (!payload.password) delete payload.password;
        await UsersAPI.update(editing.id, payload);
      } else {
        await UsersAPI.create(form);
      }
      setModalOpen(false);
      load();
    } catch (e2) {
      setError(e2.response?.data?.message || 'Save failed');
    }
  };

  const remove = async (u) => {
    const ok = await confirm(`Remove staff account "${u.name}"?`, { title: 'Remove staff', confirmLabel: 'Remove' });
    if (!ok) return;
    await UsersAPI.remove(u.id);
    load();
  };

  return (
    <div>
      <PageHeader title="Staff &amp; Roles" subtitle="Manage who can access the system and what they can do." actions={<Button onClick={openCreate}>+ Add Staff</Button>} />
      <Card>
        <table className="w-full text-sm">
          <thead><tr className="border-b border-slate-200 text-left text-graphite-600">
            <th className="px-4 py-3 font-medium">Name</th><th className="px-4 py-3 font-medium">Email</th>
            <th className="px-4 py-3 font-medium">Role</th><th className="px-4 py-3 font-medium">Warehouse</th><th className="px-4 py-3"></th>
          </tr></thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className="border-b border-slate-100 hover:bg-slate-50">
                <td className="px-4 py-2.5">{u.name}</td>
                <td className="px-4 py-2.5">{u.email}</td>
                <td className="px-4 py-2.5">{u.Role?.display_name}</td>
                <td className="px-4 py-2.5">{u.Warehouse?.name}</td>
                <td className="px-4 py-2.5 text-right space-x-2 whitespace-nowrap">
                  <button onClick={() => openEdit(u)} className="text-copper-600 hover:underline">Edit</button>
                  <button onClick={() => remove(u)} className="text-red-600 hover:underline">Remove</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editing ? 'Edit Staff' : 'Add Staff'}>
        <form onSubmit={submit}>
          {error && <div className="mb-3 text-sm text-red-600 bg-red-50 border border-red-100 rounded-md px-3 py-2">{error}</div>}
          <Field label="Name"><input required className={inputClass} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
          <Field label="Email"><input required type="email" className={inputClass} value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></Field>
          <Field label={editing ? 'New password (leave blank to keep current)' : 'Password'}>
            <input type="password" required={!editing} className={inputClass} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
          </Field>
          <Field label="Phone"><input className={inputClass} value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="+94 77 123 4567" /></Field>
          <Field label="Role">
            <select required className={inputClass} value={form.role_id} onChange={(e) => setForm({ ...form, role_id: e.target.value })}>
              <option value="">Select…</option>{roles.map((r) => <option key={r.id} value={r.id}>{r.display_name}</option>)}
            </select>
          </Field>
          <Field label="Assigned warehouse">
            <select className={inputClass} value={form.warehouse_id} onChange={(e) => setForm({ ...form, warehouse_id: e.target.value })}>
              <option value="">None</option>{warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
            </select>
          </Field>
          <div className="flex justify-end gap-2 mt-4">
            <Button type="button" variant="secondary" onClick={() => setModalOpen(false)}>Cancel</Button>
            <Button type="submit">Save</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
