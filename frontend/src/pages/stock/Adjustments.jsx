import React, { useEffect, useState } from 'react';
import { StockAPI, WarehousesAPI, ProductsAPI } from '../../api/endpoints';
import { Button, PageHeader, Modal, Card, Field, inputClass } from '../../components/ui.jsx';
import { formatDate, todayISO } from '../../utils/format';
import DocumentActions from '../../components/DocumentActions.jsx';

export default function Adjustments() {
  const [adjustments, setAdjustments] = useState([]);
  const [warehouses, setWarehouses] = useState([]);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [error, setError] = useState('');

  const [date, setDate] = useState(todayISO());
  const [warehouseId, setWarehouseId] = useState('');
  const [notes, setNotes] = useState('');
  const [items, setItems] = useState([]);
  const [productToAdd, setProductToAdd] = useState('');

  const load = () => { setLoading(true); StockAPI.listAdjustments().then((r) => setAdjustments(r.data.data || r.data)).finally(() => setLoading(false)); };
  useEffect(() => {
    load();
    WarehousesAPI.list({ per_page: 200 }).then((r) => setWarehouses(r.data.data || r.data));
    ProductsAPI.list({ per_page: 500 }).then((r) => setProducts(r.data.data || r.data));
  }, []);

  const addItem = () => {
    const product = products.find((p) => String(p.id) === String(productToAdd));
    if (!product) return;
    setItems((prev) => [...prev, { product, type: 'subtraction', quantity: 1 }]);
    setProductToAdd('');
  };

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    if (!items.length) return setError('Add at least one item.');
    try {
      await StockAPI.createAdjustment({
        date, warehouse_id: warehouseId, notes,
        items: items.map((it) => ({ product_id: it.product.id, type: it.type, quantity: it.quantity })),
      });
      setModalOpen(false);
      setItems([]); setNotes(''); setWarehouseId('');
      load();
    } catch (e2) {
      setError(e2.response?.data?.message || 'Adjustment failed');
    }
  };

  return (
    <div>
      <PageHeader
        title="Stock Adjustments"
        subtitle="Correct stock counts — damage, theft, breakage, or manual stocktake corrections."
        actions={<Button onClick={() => setModalOpen(true)}>+ New Adjustment</Button>}
      />
      <Card>
        <table className="w-full text-sm">
          <thead><tr className="border-b border-slate-200 text-left text-graphite-600">
            <th className="px-4 py-3 font-medium">Ref</th><th className="px-4 py-3 font-medium">Date</th>
            <th className="px-4 py-3 font-medium">Warehouse</th><th className="px-4 py-3 font-medium">Notes</th><th className="px-4 py-3 font-medium text-right">Output</th>
          </tr></thead>
          <tbody>
            {loading && <tr><td colSpan={5} className="px-4 py-6 text-center text-graphite-500">Loading…</td></tr>}
            {!loading && adjustments.length === 0 && <tr><td colSpan={5} className="px-4 py-6 text-center text-graphite-500">No adjustments yet.</td></tr>}
            {!loading && adjustments.map((a) => (
              <tr key={a.id} className="border-b border-slate-100 hover:bg-slate-50">
                <td className="px-4 py-2.5 font-mono text-xs">{a.reference_code}</td>
                <td className="px-4 py-2.5">{formatDate(a.date)}</td>
                <td className="px-4 py-2.5">{a.Warehouse?.name}</td>
                <td className="px-4 py-2.5 text-graphite-500">{a.notes}</td>
                <td className="px-4 py-2.5"><div className="flex justify-end"><DocumentActions type="adjustment" record={a} compact /></div></td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="New Stock Adjustment" width="max-w-2xl">
        <form onSubmit={submit}>
          {error && <div className="mb-3 text-sm text-red-600 bg-red-50 border border-red-100 rounded-md px-3 py-2">{error}</div>}
          <div className="grid grid-cols-2 gap-3 mb-3">
            <Field label="Date"><input type="date" required className={inputClass} value={date} onChange={(e) => setDate(e.target.value)} /></Field>
            <Field label="Warehouse">
              <select required className={inputClass} value={warehouseId} onChange={(e) => setWarehouseId(e.target.value)}>
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
                <select
                  className={inputClass + ' w-32 py-1'}
                  value={it.type}
                  onChange={(e) => setItems((prev) => prev.map((x, i) => (i === idx ? { ...x, type: e.target.value } : x)))}
                >
                  <option value="addition">Add stock</option>
                  <option value="subtraction">Remove stock</option>
                </select>
                <input type="number" min="0.01" step="any" className={inputClass + ' w-20 py-1'}
                  value={it.quantity} onChange={(e) => setItems((prev) => prev.map((x, i) => (i === idx ? { ...x, quantity: e.target.value } : x)))} />
                <button type="button" onClick={() => setItems((prev) => prev.filter((_, i) => i !== idx))} className="text-red-600 text-xs">Remove</button>
              </div>
            ))}
          </div>
          <Field label="Notes / reason"><textarea required className={inputClass} rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setModalOpen(false)}>Cancel</Button>
            <Button type="submit">Save Adjustment</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
