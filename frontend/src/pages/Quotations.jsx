import React, { useEffect, useMemo, useState } from 'react';
import { QuotationsHoldsAPI, CustomersAPI, WarehousesAPI, ProductsAPI } from '../api/endpoints';
import { Button, PageHeader, Modal, Card, Field, inputClass } from '../components/ui.jsx';
import { formatMoney, formatDate, todayISO } from '../utils/format';
import DocumentActions from '../components/DocumentActions.jsx';

export default function Quotations() {
  const [quotations, setQuotations] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [warehouses, setWarehouses] = useState([]);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState(null);

  const [date, setDate] = useState(todayISO());
  const [customerId, setCustomerId] = useState('');
  const [warehouseId, setWarehouseId] = useState('');
  const [note, setNote] = useState('');
  const [items, setItems] = useState([]);
  const [productToAdd, setProductToAdd] = useState('');

  const load = () => { setLoading(true); QuotationsHoldsAPI.listQuotations().then((r) => setQuotations(r.data.data || r.data)).finally(() => setLoading(false)); };
  useEffect(() => {
    load();
    CustomersAPI.list({ per_page: 200 }).then((r) => setCustomers(r.data.data || r.data));
    WarehousesAPI.list({ per_page: 200 }).then((r) => setWarehouses(r.data.data || r.data));
    ProductsAPI.list({ per_page: 500 }).then((r) => setProducts(r.data.data || r.data));
  }, []);

  const addItem = () => {
    const product = products.find((p) => String(p.id) === String(productToAdd));
    if (!product) return;
    setItems((prev) => [...prev, { product, quantity: 1, product_price: product.product_price }]);
    setProductToAdd('');
  };
  const grandTotal = useMemo(() => items.reduce((s, it) => s + Number(it.quantity) * Number(it.product_price), 0), [items]);

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    if (!items.length) return setError('Add at least one item.');
    try {
      await QuotationsHoldsAPI.createQuotation({
        date, customer_id: customerId, warehouse_id: warehouseId, note,
        items: items.map((it) => ({ product_id: it.product.id, product_price: it.product_price, quantity: it.quantity, discount_amount: 0, tax_amount: 0 })),
      });
      setModalOpen(false);
      setItems([]); setNote(''); setCustomerId(''); setWarehouseId('');
      load();
    } catch (e2) {
      setError(e2.response?.data?.message || 'Failed to save quotation');
    }
  };

  return (
    <div>
      <PageHeader title="Quotations" subtitle="Price quotes for customers before they commit to a sale." actions={<Button onClick={() => setModalOpen(true)}>+ New Quotation</Button>} />
      <Card>
        <table className="w-full text-sm">
          <thead><tr className="border-b border-slate-200 text-left text-graphite-600">
            <th className="px-4 py-3 font-medium">Ref</th><th className="px-4 py-3 font-medium">Date</th>
            <th className="px-4 py-3 font-medium">Customer</th><th className="px-4 py-3 font-medium">Total</th><th className="px-4 py-3 font-medium">Status</th><th className="px-4 py-3 font-medium text-right">Output</th>
          </tr></thead>
          <tbody>
            {loading && <tr><td colSpan={6} className="px-4 py-6 text-center text-graphite-500">Loading…</td></tr>}
            {!loading && quotations.length === 0 && <tr><td colSpan={6} className="px-4 py-6 text-center text-graphite-500">No quotations yet.</td></tr>}
            {!loading && quotations.map((q) => (
              <tr key={q.id} className="border-b border-slate-100 hover:bg-slate-50 cursor-pointer" onClick={() => setSelected(q)}>
                <td className="px-4 py-2.5 font-mono text-xs">{q.reference_code}</td>
                <td className="px-4 py-2.5">{formatDate(q.date)}</td>
                <td className="px-4 py-2.5">{q.Customer?.name}</td>
                <td className="px-4 py-2.5">{formatMoney(q.grand_total)}</td>
                <td className="px-4 py-2.5 capitalize">{q.status}</td>
                <td className="px-4 py-2.5"><div className="flex justify-end"><DocumentActions type="quotation" record={q} compact /></div></td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="New Quotation" width="max-w-2xl">
        <form onSubmit={submit}>
          {error && <div className="mb-3 text-sm text-red-600 bg-red-50 border border-red-100 rounded-md px-3 py-2">{error}</div>}
          <div className="grid grid-cols-3 gap-3 mb-3">
            <Field label="Date"><input type="date" required className={inputClass} value={date} onChange={(e) => setDate(e.target.value)} /></Field>
            <Field label="Customer">
              <select required className={inputClass} value={customerId} onChange={(e) => setCustomerId(e.target.value)}>
                <option value="">Select…</option>{customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </Field>
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
                <input type="number" min="0.01" step="any" className={inputClass + ' w-20 py-1'}
                  value={it.quantity} onChange={(e) => setItems((prev) => prev.map((x, i) => (i === idx ? { ...x, quantity: e.target.value } : x)))} />
                <input type="number" min="0" step="any" className={inputClass + ' w-24 py-1'}
                  value={it.product_price} onChange={(e) => setItems((prev) => prev.map((x, i) => (i === idx ? { ...x, product_price: e.target.value } : x)))} />
                <button type="button" onClick={() => setItems((prev) => prev.filter((_, i) => i !== idx))} className="text-red-600 text-xs">Remove</button>
              </div>
            ))}
          </div>
          <Field label="Note"><textarea className={inputClass} rows={2} value={note} onChange={(e) => setNote(e.target.value)} /></Field>
          <div className="text-right font-display font-semibold mb-3">Total: <span className="text-copper-600">{formatMoney(grandTotal)}</span></div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setModalOpen(false)}>Cancel</Button>
            <Button type="submit">Save Quotation</Button>
          </div>
        </form>
      </Modal>

      <Modal open={!!selected} onClose={() => setSelected(null)} title={`Quotation ${selected?.reference_code || ''}`} width="max-w-2xl">
        {selected && (
          <div className="text-sm space-y-4">
            <div className="grid grid-cols-2 gap-3 text-graphite-600">
              <div><strong>Date:</strong> {formatDate(selected.date)}</div>
              <div><strong>Status:</strong> <span className="capitalize">{selected.status}</span></div>
              <div><strong>Customer:</strong> {selected.Customer?.name}</div>
              <div><strong>Warehouse:</strong> {selected.Warehouse?.name}</div>
            </div>
            <table className="w-full">
              <thead><tr className="text-left text-graphite-500 border-b border-slate-100"><th className="py-2">Item</th><th className="py-2 text-right">Qty</th><th className="py-2 text-right">Price</th><th className="py-2 text-right">Total</th></tr></thead>
              <tbody>{(selected.items || []).map((item) => (
                <tr key={item.id} className="border-b border-slate-50"><td className="py-2">{item.Product?.name}</td><td className="py-2 text-right">{item.quantity}</td><td className="py-2 text-right">{formatMoney(item.product_price)}</td><td className="py-2 text-right">{formatMoney(item.sub_total)}</td></tr>
              ))}</tbody>
            </table>
            <div className="flex justify-between pt-2 border-t border-slate-200 font-display font-semibold text-base"><span>Total</span><span className="text-copper-600">{formatMoney(selected.grand_total)}</span></div>
            {selected.note && <div className="text-graphite-600"><strong>Note:</strong> {selected.note}</div>}
            <div className="pt-3 border-t border-slate-100"><DocumentActions type="quotation" record={selected} /></div>
          </div>
        )}
      </Modal>
    </div>
  );
}
