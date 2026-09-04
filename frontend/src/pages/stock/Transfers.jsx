import React, { useEffect, useMemo, useState } from 'react';
import { StockAPI, WarehousesAPI, ProductsAPI } from '../../api/endpoints';
import { Button, PageHeader, Modal, Card, Field, inputClass } from '../../components/ui.jsx';
import { formatMoney, formatDate, todayISO } from '../../utils/format';
import DocumentActions from '../../components/DocumentActions.jsx';

export default function Transfers() {
  const [transfers, setTransfers] = useState([]);
  const [warehouses, setWarehouses] = useState([]);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const [date, setDate] = useState(todayISO());
  const [fromId, setFromId] = useState('');
  const [toId, setToId] = useState('');
  const [notes, setNotes] = useState('');
  const [items, setItems] = useState([]);
  const [productToAdd, setProductToAdd] = useState('');

  const load = () => { setLoading(true); StockAPI.listTransfers().then((r) => setTransfers(r.data.data || r.data)).catch((requestError) => setError(requestError.response?.data?.message || 'Transfers could not be loaded.')).finally(() => setLoading(false)); };
  useEffect(() => {
    load();
    WarehousesAPI.list({ per_page: 200 }).then((r) => setWarehouses(r.data.data || r.data));
    ProductsAPI.list({ per_page: 500 }).then((r) => setProducts(r.data.data || r.data));
  }, []);

  const addItem = () => {
    const product = products.find((p) => String(p.id) === String(productToAdd));
    if (!product) return;
    setItems((prev) => prev.some((item) => item.product.id === product.id)
      ? prev.map((item) => item.product.id === product.id ? { ...item, quantity: Number(item.quantity || 0) + 1 } : item)
      : [...prev, { product, quantity: 1, purchase_cost: product.product_cost }]);
    setProductToAdd('');
  };
  const grandTotal = useMemo(() => items.reduce((s, it) => s + Number(it.quantity) * Number(it.purchase_cost || 0), 0), [items]);

  const submit = async (e) => {
    e.preventDefault();
    if (saving) return;
    setError('');
    if (!items.length) return setError('Add at least one item.');
    setSaving(true);
    try {
      await StockAPI.createTransfer({
        date, from_warehouse_id: fromId, to_warehouse_id: toId, notes,
        items: items.map((it) => ({ product_id: it.product.id, quantity: it.quantity, purchase_cost: it.purchase_cost })),
      });
      setModalOpen(false);
      setItems([]); setNotes(''); setFromId(''); setToId('');
      load();
    } catch (e2) {
      setError(e2.response?.data?.message || 'Transfer failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <PageHeader title="Stock Transfers" subtitle="Move stock between warehouses." actions={<Button onClick={() => setModalOpen(true)}>+ New Transfer</Button>} />
      <Card>
        <table className="w-full text-sm">
          <thead><tr className="border-b border-slate-200 text-left text-graphite-600">
            <th className="px-4 py-3 font-medium">Ref</th><th className="px-4 py-3 font-medium">Date</th>
            <th className="px-4 py-3 font-medium">From</th><th className="px-4 py-3 font-medium">To</th><th className="px-4 py-3 font-medium">Total</th><th className="px-4 py-3 font-medium text-right">Output</th>
          </tr></thead>
          <tbody>
            {loading && <tr><td colSpan={6} className="px-4 py-6 text-center text-graphite-500">Loading…</td></tr>}
            {!loading && transfers.length === 0 && <tr><td colSpan={6} className="px-4 py-6 text-center text-graphite-500">No transfers yet.</td></tr>}
            {!loading && transfers.map((t) => (
              <tr key={t.id} className="border-b border-slate-100 hover:bg-slate-50">
                <td className="px-4 py-2.5 font-mono text-xs">{t.reference_code}</td>
                <td className="px-4 py-2.5">{formatDate(t.date)}</td>
                <td className="px-4 py-2.5">{t.fromWarehouse?.name}</td>
                <td className="px-4 py-2.5">{t.toWarehouse?.name}</td>
                <td className="px-4 py-2.5">{formatMoney(t.grand_total)}</td>
                <td className="px-4 py-2.5"><div className="flex justify-end"><DocumentActions type="transfer" record={t} compact /></div></td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="New Stock Transfer" width="max-w-2xl">
        <form onSubmit={submit}>
          {error && <div className="mb-3 text-sm text-red-600 bg-red-50 border border-red-100 rounded-md px-3 py-2">{error}</div>}
          <div className="grid grid-cols-3 gap-3 mb-3">
            <Field label="Date"><input type="date" required className={inputClass} value={date} onChange={(e) => setDate(e.target.value)} /></Field>
            <Field label="From warehouse">
              <select required className={inputClass} value={fromId} onChange={(e) => setFromId(e.target.value)}>
                <option value="">Select…</option>{warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
              </select>
            </Field>
            <Field label="To warehouse">
              <select required className={inputClass} value={toId} onChange={(e) => setToId(e.target.value)}>
                <option value="">Select…</option>{warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
              </select>
            </Field>
          </div>
          <div className="flex gap-2 mb-3">
            <select className={inputClass} value={productToAdd} onChange={(e) => setProductToAdd(e.target.value)}>
              <option value="">Add a product…</option>{products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            <Button type="button" variant="secondary" onClick={addItem}>Add</Button>
          </div>
          <div className="border border-slate-200 rounded-md divide-y divide-slate-100 mb-3 max-h-56 overflow-y-auto">
            {items.length === 0 && <div className="p-3 text-sm text-graphite-500">No items added.</div>}
            {items.map((it, idx) => (
              <div key={idx} className="p-2 flex items-center gap-2 text-sm">
                <span className="flex-1">{it.product.name}</span>
                <input type="number" min="0.01" step="any" className={inputClass + ' w-20 py-1'}
                  value={it.quantity} onChange={(e) => setItems((prev) => prev.map((x, i) => (i === idx ? { ...x, quantity: e.target.value } : x)))} />
                <button type="button" onClick={() => setItems((prev) => prev.filter((_, i) => i !== idx))} className="text-red-600 text-xs">Remove</button>
              </div>
            ))}
          </div>
          <Field label="Notes"><textarea className={inputClass} rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
          <div className="text-right font-display font-semibold mb-3">Value: <span className="text-copper-600">{formatMoney(grandTotal)}</span></div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" disabled={saving} onClick={() => setModalOpen(false)}>Cancel</Button>
            <Button type="submit" disabled={saving}>{saving ? 'Saving…' : 'Save Transfer'}</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
