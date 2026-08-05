import React, { useEffect, useMemo, useState } from 'react';
import { QuotationsHoldsAPI, CustomersAPI, WarehousesAPI, ProductsAPI } from '../api/endpoints';
import { Button, PageHeader, Card, Field, inputClass } from '../components/ui.jsx';
import { formatMoney, formatDate, todayISO } from '../utils/format';
import DocumentActions from '../components/DocumentActions.jsx';

const number = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const lineBase = (line) => number(line.quantity) * number(line.product_price);
const lineDiscount = (line) => {
  if (line.discount_type === 'percentage') return lineBase(line) * number(line.discount_value) / 100;
  if (line.discount_type === 'fixed') return number(line.discount_value);
  return 0;
};
const lineTotal = (line) => lineBase(line) - lineDiscount(line);
const lineProfit = (line) => lineTotal(line) - number(line.quantity) * number(line.product_cost);

function emptyDraft(defaultWarehouse = '') {
  return {
    date: todayISO(), customer_id: '', warehouse_id: defaultWarehouse,
    note: '', discount: '0', shipping: '0', tax_rate: '0', items: [],
  };
}

function quotationToDraft(quotation) {
  return {
    date: quotation.date || todayISO(),
    customer_id: String(quotation.customer_id || ''),
    warehouse_id: String(quotation.warehouse_id || ''),
    note: quotation.note || '',
    discount: String(quotation.discount || 0),
    shipping: String(quotation.shipping || 0),
    tax_rate: String(quotation.tax_rate || 0),
    items: (quotation.items || []).map((item) => ({
      id: item.id,
      product_id: item.product_id,
      name: item.Product?.name || 'Product',
      code: item.Product?.code || '',
      quantity: String(item.quantity || 1),
      product_price: String(item.product_price ?? item.Product?.product_price ?? 0),
      standard_price: number(item.standard_price ?? item.Product?.product_price),
      product_cost: number(item.product_cost ?? item.Product?.product_cost),
      discount_type: item.discount_type || (number(item.discount_amount) > 0 ? 'fixed' : 'none'),
      discount_value: String(item.discount_value ?? item.discount_amount ?? 0),
    })),
  };
}

export default function Quotations() {
  const [quotations, setQuotations] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [warehouses, setWarehouses] = useState([]);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [mode, setMode] = useState('list');
  const [selected, setSelected] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [productToAdd, setProductToAdd] = useState('');
  const [draft, setDraft] = useState(emptyDraft());

  const loadQuotations = async () => {
    setLoading(true);
    try {
      const response = await QuotationsHoldsAPI.listQuotations();
      setQuotations(response.data.data || response.data || []);
    } catch (loadError) {
      setError(loadError.response?.data?.message || 'Quotations could not be loaded.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadQuotations();
    Promise.all([
      CustomersAPI.list({ per_page: 200, status: 'active' }),
      WarehousesAPI.list({ per_page: 200 }),
      ProductsAPI.list({ per_page: 500 }),
    ]).then(([customerResponse, warehouseResponse, productResponse]) => {
      const customerRows = customerResponse.data.data || customerResponse.data || [];
      const warehouseRows = warehouseResponse.data.data || warehouseResponse.data || [];
      setCustomers(customerRows);
      setWarehouses(warehouseRows);
      setProducts(productResponse.data.data || productResponse.data || []);
      setDraft((current) => ({ ...current, warehouse_id: current.warehouse_id || String(warehouseRows.find((row) => row.is_default)?.id || warehouseRows[0]?.id || '') }));
    }).catch((loadError) => setError(loadError.response?.data?.message || 'Quotation setup data could not be loaded.'));
  }, []);

  const totals = useMemo(() => {
    const itemsSubtotal = draft.items.reduce((sum, line) => sum + lineTotal(line), 0);
    const itemDiscounts = draft.items.reduce((sum, line) => sum + lineDiscount(line), 0);
    const orderDiscount = number(draft.discount);
    const taxAmount = Math.max(0, itemsSubtotal - orderDiscount) * number(draft.tax_rate) / 100;
    const profit = draft.items.reduce((sum, line) => sum + lineProfit(line), 0) - orderDiscount;
    return {
      itemsSubtotal, itemDiscounts, orderDiscount, taxAmount, profit,
      grandTotal: Math.max(0, itemsSubtotal - orderDiscount + number(draft.shipping) + taxAmount),
    };
  }, [draft]);

  const visibleQuotations = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return quotations;
    return quotations.filter((quotation) => [quotation.reference_code, quotation.Customer?.name, quotation.status]
      .some((value) => String(value || '').toLowerCase().includes(query)));
  }, [quotations, search]);

  const startNew = () => {
    const defaultWarehouse = String(warehouses.find((row) => row.is_default)?.id || warehouses[0]?.id || '');
    setDraft(emptyDraft(defaultWarehouse));
    setEditingId(null);
    setSelected(null);
    setError('');
    setMode('edit');
  };

  const startEdit = (quotation) => {
    setDraft(quotationToDraft(quotation));
    setEditingId(quotation.id);
    setSelected(null);
    setError('');
    setMode('edit');
  };

  const showQuotation = (quotation) => {
    setSelected(quotation);
    setMode('view');
    setError('');
  };

  const addProduct = () => {
    const product = products.find((entry) => String(entry.id) === String(productToAdd));
    if (!product) return;
    setDraft((current) => {
      const existing = current.items.find((line) => Number(line.product_id) === Number(product.id));
      if (existing) {
        return { ...current, items: current.items.map((line) => Number(line.product_id) === Number(product.id)
          ? { ...line, quantity: String(number(line.quantity) + 1) } : line) };
      }
      return {
        ...current,
        items: [...current.items, {
          product_id: product.id, name: product.name, code: product.code || '', quantity: '1',
          product_price: String(product.product_price || 0), standard_price: number(product.product_price),
          product_cost: number(product.product_cost), discount_type: 'none', discount_value: '0',
        }],
      };
    });
    setProductToAdd('');
  };

  const updateLine = (index, patch) => setDraft((current) => ({
    ...current, items: current.items.map((line, lineIndex) => lineIndex === index ? { ...line, ...patch } : line),
  }));

  const validate = () => {
    if (!draft.customer_id) return 'Select a customer.';
    if (!draft.warehouse_id) return 'Select a warehouse.';
    if (!draft.items.length) return 'Add at least one product.';
    for (const line of draft.items) {
      if (number(line.quantity) <= 0) return `${line.name}: quantity must be greater than zero.`;
      if (line.product_price === '' || number(line.product_price) < 0) return `${line.name}: enter a valid quoted price.`;
      if (line.discount_type === 'percentage' && number(line.discount_value) > 100) return `${line.name}: discount cannot exceed 100%.`;
      if (lineDiscount(line) > lineBase(line)) return `${line.name}: discount cannot exceed the line total.`;
    }
    if (number(draft.discount) > totals.itemsSubtotal) return 'Whole-quotation discount cannot exceed the items subtotal.';
    return '';
  };

  const save = async (event) => {
    event.preventDefault();
    const validationError = validate();
    if (validationError) { setError(validationError); return; }
    setSaving(true);
    setError('');
    const payload = {
      date: draft.date, customer_id: draft.customer_id, warehouse_id: draft.warehouse_id,
      note: draft.note, discount: number(draft.discount), shipping: number(draft.shipping), tax_rate: number(draft.tax_rate),
      items: draft.items.map((line) => ({
        product_id: line.product_id, quantity: number(line.quantity), product_price: number(line.product_price),
        discount_type: line.discount_type, discount_value: number(line.discount_value), tax_type: 'none', tax_value: 0,
      })),
    };
    try {
      const response = editingId
        ? await QuotationsHoldsAPI.updateQuotation(editingId, payload)
        : await QuotationsHoldsAPI.createQuotation(payload);
      const saved = response.data.data;
      await loadQuotations();
      setSelected(saved);
      setMode('view');
    } catch (saveError) {
      setError(saveError.response?.data?.message || 'Quotation could not be saved.');
    } finally {
      setSaving(false);
    }
  };

  if (mode === 'edit') {
    return (
      <div>
        <PageHeader
          title={editingId ? 'Edit quotation' : 'New quotation'}
          subtitle="Build the complete quotation here—prices, item discounts, cost and profit stay visible while you work."
          actions={<Button variant="secondary" onClick={() => setMode('list')}>Back to quotations</Button>}
        />
        <form onSubmit={save} className="space-y-4">
          {error && <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
          <Card className="p-5">
            <div className="grid gap-4 md:grid-cols-3">
              <Field label="Quotation date"><input type="date" required className={inputClass} value={draft.date} onChange={(event) => setDraft({ ...draft, date: event.target.value })} /></Field>
              <Field label="Customer"><select required className={inputClass} value={draft.customer_id} onChange={(event) => setDraft({ ...draft, customer_id: event.target.value })}><option value="">Select customer…</option>{customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.name} · {customer.phone}</option>)}</select></Field>
              <Field label="Warehouse"><select required className={inputClass} value={draft.warehouse_id} onChange={(event) => setDraft({ ...draft, warehouse_id: event.target.value })}><option value="">Select warehouse…</option>{warehouses.map((warehouse) => <option key={warehouse.id} value={warehouse.id}>{warehouse.name}</option>)}</select></Field>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <select className={inputClass} value={productToAdd} onChange={(event) => setProductToAdd(event.target.value)}>
                <option value="">Search or select a product…</option>
                {products.map((product) => <option key={product.id} value={product.id}>{product.name} · {product.code} · {formatMoney(product.product_price)}</option>)}
              </select>
              <Button type="button" variant="secondary" onClick={addProduct} disabled={!productToAdd}>Add product</Button>
            </div>
          </Card>

          <Card className="overflow-x-auto">
            <table className="w-full min-w-[1050px] text-sm">
              <thead><tr className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase tracking-wide text-graphite-500">
                <th className="px-4 py-3">Product</th><th className="px-2 py-3">Qty</th><th className="px-2 py-3">Standard</th><th className="px-2 py-3">Quoted price</th><th className="px-2 py-3">Discount</th><th className="px-2 py-3">Cost</th><th className="px-2 py-3">Profit</th><th className="px-4 py-3 text-right">Total</th><th />
              </tr></thead>
              <tbody>
                {!draft.items.length && <tr><td colSpan={9} className="px-4 py-12 text-center text-graphite-500">Select a product above to start the quotation.</td></tr>}
                {draft.items.map((line, index) => {
                  const profit = lineProfit(line);
                  const changed = Math.abs(number(line.product_price) - number(line.standard_price)) > 0.001;
                  return <tr key={`${line.product_id}-${index}`} className="border-b border-slate-100 align-top">
                    <td className="px-4 py-3"><div className="font-medium">{line.name}</div><div className="font-mono text-xs text-graphite-500">{line.code}</div></td>
                    <td className="px-2 py-3"><input aria-label={`Quantity for ${line.name}`} type="number" min="0.01" step="any" className={inputClass + ' w-20'} value={line.quantity} onChange={(event) => updateLine(index, { quantity: event.target.value })} /></td>
                    <td className="px-2 py-3 whitespace-nowrap">{formatMoney(line.standard_price)}</td>
                    <td className="px-2 py-3"><input aria-label={`Quoted price for ${line.name}`} type="number" min="0" step="any" className={inputClass + ' w-28'} value={line.product_price} onChange={(event) => updateLine(index, { product_price: event.target.value })} />{changed && <button type="button" className="mt-1 block text-[11px] text-blue-700" onClick={() => updateLine(index, { product_price: String(line.standard_price) })}>Reset price</button>}</td>
                    <td className="px-2 py-3"><div className="flex gap-1"><select className={inputClass + ' w-28'} value={line.discount_type} onChange={(event) => updateLine(index, { discount_type: event.target.value, discount_value: event.target.value === 'none' ? '0' : line.discount_value })}><option value="none">None</option><option value="percentage">%</option><option value="fixed">Amount</option></select>{line.discount_type !== 'none' && <input aria-label={`Discount for ${line.name}`} type="number" min="0" max={line.discount_type === 'percentage' ? 100 : undefined} step="any" className={inputClass + ' w-24'} value={line.discount_value} onChange={(event) => updateLine(index, { discount_value: event.target.value })} />}</div>{lineDiscount(line) > 0 && <span className="text-[11px] text-emerald-700">-{formatMoney(lineDiscount(line))}</span>}</td>
                    <td className="px-2 py-3 whitespace-nowrap">{formatMoney(line.product_cost)}<div className="text-[10px] text-graphite-400">per unit</div></td>
                    <td className={`px-2 py-3 whitespace-nowrap font-medium ${profit < 0 ? 'text-red-700' : 'text-emerald-700'}`}>{formatMoney(profit)}{profit < 0 && <div className="text-[10px]">Below cost</div>}</td>
                    <td className="px-4 py-3 text-right font-medium whitespace-nowrap">{formatMoney(lineTotal(line))}</td>
                    <td className="px-2 py-3"><button type="button" className="text-xs text-red-600" onClick={() => setDraft((current) => ({ ...current, items: current.items.filter((_, lineIndex) => lineIndex !== index) }))}>Remove</button></td>
                  </tr>;
                })}
              </tbody>
            </table>
          </Card>

          <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
            <Card className="p-5"><Field label="Customer note / terms"><textarea rows={5} className={inputClass} value={draft.note} onChange={(event) => setDraft({ ...draft, note: event.target.value })} placeholder="Delivery, validity or special conditions…" /></Field></Card>
            <Card className="p-5 space-y-3 text-sm">
              <div className="flex justify-between"><span>Items subtotal</span><span>{formatMoney(totals.itemsSubtotal)}</span></div>
              {totals.itemDiscounts > 0 && <div className="flex justify-between text-emerald-700"><span>Item discounts included</span><span>-{formatMoney(totals.itemDiscounts)}</span></div>}
              <label className="flex items-center justify-between gap-3"><span>Whole quotation discount</span><input type="number" min="0" step="any" className={inputClass + ' w-32'} value={draft.discount} onChange={(event) => setDraft({ ...draft, discount: event.target.value })} /></label>
              <label className="flex items-center justify-between gap-3"><span>Shipping</span><input type="number" min="0" step="any" className={inputClass + ' w-32'} value={draft.shipping} onChange={(event) => setDraft({ ...draft, shipping: event.target.value })} /></label>
              <label className="flex items-center justify-between gap-3"><span>Tax %</span><input type="number" min="0" step="any" className={inputClass + ' w-32'} value={draft.tax_rate} onChange={(event) => setDraft({ ...draft, tax_rate: event.target.value })} /></label>
              <div className="flex justify-between border-t border-slate-200 pt-3 text-lg font-semibold"><span>Total</span><span className="text-copper-600">{formatMoney(totals.grandTotal)}</span></div>
              <div className={`flex justify-between rounded-md px-3 py-2 font-medium ${totals.profit < 0 ? 'bg-red-50 text-red-700' : 'bg-emerald-50 text-emerald-700'}`}><span>Estimated profit</span><span>{formatMoney(totals.profit)}</span></div>
              <p className="text-[10px] leading-4 text-graphite-500">Estimated profit is after all discounts and before shipping/tax. It is internal and does not print on the customer quotation.</p>
              <Button type="submit" className="w-full justify-center" disabled={saving}>{saving ? 'Saving…' : editingId ? 'Update quotation' : 'Save quotation'}</Button>
            </Card>
          </div>
        </form>
      </div>
    );
  }

  if (mode === 'view' && selected) {
    return (
      <div>
        <PageHeader title={`Quotation ${selected.reference_code}`} subtitle={`${selected.Customer?.name || 'Customer'} · ${formatDate(selected.date)}`} actions={<><Button variant="secondary" onClick={() => setMode('list')}>Back</Button>{selected.status === 'sent' && <Button variant="secondary" onClick={() => startEdit(selected)}>Edit quotation</Button>}<DocumentActions type="quotation" record={selected} /></>} />
        <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
          <Card className="overflow-x-auto"><table className="w-full min-w-[760px] text-sm"><thead><tr className="border-b border-slate-200 bg-slate-50 text-left text-graphite-500"><th className="px-4 py-3">Item</th><th className="px-3 py-3 text-right">Qty</th><th className="px-3 py-3 text-right">Quoted price</th><th className="px-3 py-3 text-right">Discount</th><th className="px-3 py-3 text-right">Cost</th><th className="px-3 py-3 text-right">Profit</th><th className="px-4 py-3 text-right">Total</th></tr></thead><tbody>{(selected.items || []).map((item) => <tr key={item.id} className="border-b border-slate-100"><td className="px-4 py-3 font-medium">{item.Product?.name}</td><td className="px-3 py-3 text-right">{item.quantity}</td><td className="px-3 py-3 text-right">{formatMoney(item.product_price)}</td><td className="px-3 py-3 text-right">{formatMoney(item.discount_amount)}</td><td className="px-3 py-3 text-right">{formatMoney(item.product_cost)}</td><td className={`px-3 py-3 text-right font-medium ${number(item.profit_amount) < 0 ? 'text-red-700' : 'text-emerald-700'}`}>{formatMoney(item.profit_amount)}</td><td className="px-4 py-3 text-right font-medium">{formatMoney(item.sub_total)}</td></tr>)}</tbody></table></Card>
          <Card className="p-5 space-y-3 text-sm h-fit"><div className="flex justify-between"><span>Status</span><span className="capitalize font-medium">{selected.status}</span></div><div className="flex justify-between"><span>Warehouse</span><span>{selected.Warehouse?.name}</span></div><div className="flex justify-between"><span>Subtotal</span><span>{formatMoney(selected.sub_total)}</span></div><div className="flex justify-between"><span>Discount</span><span>-{formatMoney(selected.discount)}</span></div><div className="flex justify-between"><span>Tax</span><span>{formatMoney(selected.tax_amount)}</span></div><div className="flex justify-between"><span>Shipping</span><span>{formatMoney(selected.shipping)}</span></div><div className="flex justify-between border-t pt-3 text-lg font-semibold"><span>Total</span><span className="text-copper-600">{formatMoney(selected.grand_total)}</span></div><div className={`flex justify-between rounded px-3 py-2 font-medium ${number(selected.profit_amount) < 0 ? 'bg-red-50 text-red-700' : 'bg-emerald-50 text-emerald-700'}`}><span>Estimated profit</span><span>{formatMoney(selected.profit_amount)}</span></div>{selected.note && <div className="border-t pt-3 text-graphite-600"><strong>Note:</strong> {selected.note}</div>}</Card>
        </div>
      </div>
    );
  }

  return (
    <div>
      <PageHeader title="Quotations" subtitle="Create, review and revise customer quotations from a full workspace." actions={<Button onClick={startNew}>+ New quotation</Button>} />
      {error && <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
      <Card className="mb-4 p-4"><input className={inputClass + ' max-w-md'} value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search reference, customer or status…" /></Card>
      <Card className="overflow-x-auto"><table className="w-full min-w-[760px] text-sm"><thead><tr className="border-b border-slate-200 bg-slate-50 text-left text-graphite-600"><th className="px-4 py-3">Reference</th><th className="px-4 py-3">Date</th><th className="px-4 py-3">Customer</th><th className="px-4 py-3 text-right">Total</th><th className="px-4 py-3 text-right">Profit</th><th className="px-4 py-3">Status</th><th className="px-4 py-3 text-right">Actions</th></tr></thead><tbody>{loading && <tr><td colSpan={7} className="px-4 py-8 text-center text-graphite-500">Loading quotations…</td></tr>}{!loading && !visibleQuotations.length && <tr><td colSpan={7} className="px-4 py-10 text-center text-graphite-500">No quotations found.</td></tr>}{!loading && visibleQuotations.map((quotation) => <tr key={quotation.id} className="border-b border-slate-100 hover:bg-slate-50"><td className="px-4 py-3 font-mono text-xs"><button className="text-copper-700 hover:underline" onClick={() => showQuotation(quotation)}>{quotation.reference_code}</button></td><td className="px-4 py-3">{formatDate(quotation.date)}</td><td className="px-4 py-3">{quotation.Customer?.name}</td><td className="px-4 py-3 text-right font-medium">{formatMoney(quotation.grand_total)}</td><td className={`px-4 py-3 text-right ${number(quotation.profit_amount) < 0 ? 'text-red-700' : 'text-emerald-700'}`}>{formatMoney(quotation.profit_amount)}</td><td className="px-4 py-3 capitalize">{quotation.status}</td><td className="px-4 py-3"><div className="flex justify-end gap-2"><Button variant="ghost" onClick={() => showQuotation(quotation)}>View</Button>{quotation.status === 'sent' && <Button variant="ghost" onClick={() => startEdit(quotation)}>Edit</Button>}<DocumentActions type="quotation" record={quotation} compact /></div></td></tr>)}</tbody></table></Card>
    </div>
  );
}
