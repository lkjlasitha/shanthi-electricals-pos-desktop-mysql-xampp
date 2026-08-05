import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ProductsAPI, CategoriesAPI, BrandsAPI, UnitsAPI, WarehousesAPI } from '../../api/endpoints';
import { Button, PageHeader, Modal, Card, Field, inputClass } from '../../components/ui.jsx';
import { formatMoney } from '../../utils/format';
import { useAuth } from '../../context/AuthContext.jsx';
import { useDialog } from '../../context/DialogContext.jsx';

const emptyForm = {
  name: '', code: '', barcode_symbol: 'EAN13', product_category_id: '', brand_id: '',
  product_cost: '', product_price: '', product_unit: '', sale_unit: '', purchase_unit: '',
  stock_alert: 5, order_tax: 0, tax_type: 'exclusive', notes: '',
};

function changeText(oldValue, newValue) {
  const oldNumber = Number(oldValue || 0);
  const newNumber = Number(newValue || 0);
  if (oldNumber === newNumber) return 'No change';
  if (oldNumber === 0) return newNumber > 0 ? 'New value' : 'No change';
  const percentage = ((newNumber - oldNumber) / oldNumber) * 100;
  return `${percentage > 0 ? '+' : ''}${percentage.toFixed(1)}%`;
}

function historyDate(value) {
  if (!value) return '—';
  return new Date(value).toLocaleString('en-LK', { dateStyle: 'medium', timeStyle: 'short' });
}

export default function Products() {
  const navigate = useNavigate();
  const { confirm } = useDialog();
  const { hasPermission } = useAuth();
  const canWrite = hasPermission('products.manage');
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [brands, setBrands] = useState([]);
  const [units, setUnits] = useState([]);
  const [warehouses, setWarehouses] = useState([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [initialStock, setInitialStock] = useState({});
  const [error, setError] = useState('');
  const [barcodeMessage, setBarcodeMessage] = useState('');
  const barcodeInputRef = useRef(null);

  const [priceProduct, setPriceProduct] = useState(null);
  const [priceForm, setPriceForm] = useState({ new_cost: '', new_price: '', reason: '' });
  const [priceHistory, setPriceHistory] = useState([]);
  const [priceError, setPriceError] = useState('');
  const [historyLoading, setHistoryLoading] = useState(false);
  const [savingPrice, setSavingPrice] = useState(false);

  const loadLookups = () => {
    CategoriesAPI.list({ per_page: 200 }).then((r) => setCategories(r.data.data || r.data));
    BrandsAPI.list({ per_page: 200 }).then((r) => setBrands(r.data.data || r.data));
    UnitsAPI.list({ per_page: 200 }).then((r) => setUnits(r.data.data || r.data));
    WarehousesAPI.list({ per_page: 200 }).then((r) => setWarehouses(r.data.data || r.data));
  };

  const loadProducts = () => {
    setLoading(true);
    ProductsAPI.list({ search, per_page: 100 }).then((r) => setProducts(r.data.data || r.data)).finally(() => setLoading(false));
  };

  useEffect(loadLookups, []);
  useEffect(() => { loadProducts(); /* eslint-disable-next-line */ }, [search]);

  const openCreate = async () => {
    setEditing(null);
    setForm(emptyForm);
    setInitialStock({});
    setError('');
    setBarcodeMessage('');
    setModalOpen(true);
    try {
      const response = await ProductsAPI.generateCode();
      setForm((current) => ({ ...current, ...response.data.data }));
    } catch {
      // The backend will still generate a unique barcode when the product is saved.
    }
  };

  const openEdit = (product) => {
    setEditing(product);
    setForm({
      name: product.name, code: product.code, barcode_symbol: product.barcode_symbol || 'CODE128', product_category_id: product.product_category_id, brand_id: product.brand_id || '',
      product_cost: product.product_cost, product_price: product.product_price,
      product_unit: product.product_unit || '', sale_unit: product.sale_unit || '', purchase_unit: product.purchase_unit || '',
      stock_alert: product.stock_alert, order_tax: product.order_tax, tax_type: product.tax_type, notes: product.notes || '',
    });
    const stockMap = {};
    (product.ManageStocks || []).forEach((stock) => { stockMap[stock.warehouse_id] = stock.quantity; });
    setInitialStock(stockMap);
    setError('');
    setBarcodeMessage('');
    setModalOpen(true);
  };

  const openPrices = async (product) => {
    setPriceProduct(product);
    setPriceForm({ new_cost: String(product.product_cost ?? 0), new_price: String(product.product_price ?? 0), reason: '' });
    setPriceError('');
    setPriceHistory([]);
    setHistoryLoading(true);
    try {
      const response = await ProductsAPI.priceHistory(product.id);
      setPriceHistory(response.data.data || []);
    } catch (requestError) {
      setPriceError(requestError.response?.data?.message || 'Price history could not be loaded.');
    } finally {
      setHistoryLoading(false);
    }
  };

  const normalizeBarcode = (value) => String(value || '').replace(/[\r\n\t]/g, '').trim();

  const applyBarcode = (value, { captured = false } = {}) => {
    const code = normalizeBarcode(value);
    setForm((current) => ({
      ...current,
      code,
      barcode_symbol: /^\d{13}$/.test(code) ? 'EAN13' : 'CODE128',
    }));
    if (captured && code) setBarcodeMessage(`Barcode captured: ${code}`);
  };

  const focusBarcodeScanner = () => {
    window.requestAnimationFrame(() => {
      barcodeInputRef.current?.focus();
      barcodeInputRef.current?.select();
    });
    setBarcodeMessage('Scanner ready. Scan the manufacturer barcode now; Enter will not submit the product form.');
  };

  const submit = async (event) => {
    event.preventDefault();
    setError('');
    const stockUnit = form.product_unit ? Number(form.product_unit) : null;
    const payload = {
      name: form.name,
      code: String(form.code || '').trim() || null,
      barcode_symbol: form.barcode_symbol || 'CODE128',
      product_category_id: form.product_category_id ? Number(form.product_category_id) : null,
      brand_id: form.brand_id ? Number(form.brand_id) : null,
      product_unit: stockUnit,
      sale_unit: form.sale_unit ? Number(form.sale_unit) : stockUnit,
      purchase_unit: form.purchase_unit ? Number(form.purchase_unit) : stockUnit,
      stock_alert: form.stock_alert === '' ? 0 : Number(form.stock_alert),
      order_tax: form.order_tax === '' ? 0 : Number(form.order_tax),
      tax_type: form.tax_type,
      notes: form.notes,
    };

    if (!editing) {
      payload.product_cost = Number(form.product_cost);
      payload.product_price = Number(form.product_price);
      payload.initial_stock = Object.entries(initialStock)
        .filter(([, quantity]) => quantity !== '')
        .map(([warehouse_id, quantity]) => ({ warehouse_id: Number(warehouse_id), quantity: Number(quantity) }));
    }

    try {
      if (editing) await ProductsAPI.update(editing.id, payload);
      else await ProductsAPI.create(payload);
      setModalOpen(false);
      setBarcodeMessage('');
      loadProducts();
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Save failed');
    }
  };

  const submitPrice = async (event) => {
    event.preventDefault();
    setPriceError('');
    setSavingPrice(true);
    try {
      await ProductsAPI.adjustPrices(priceProduct.id, {
        new_cost: Number(priceForm.new_cost),
        new_price: Number(priceForm.new_price),
        reason: priceForm.reason,
      });
      const historyResponse = await ProductsAPI.priceHistory(priceProduct.id);
      setPriceHistory(historyResponse.data.data || []);
      const updated = historyResponse.data.product;
      setPriceProduct((current) => ({ ...current, ...updated }));
      setPriceForm({ new_cost: String(updated.product_cost), new_price: String(updated.product_price), reason: '' });
      loadProducts();
    } catch (requestError) {
      setPriceError(requestError.response?.data?.message || 'Price adjustment failed.');
    } finally {
      setSavingPrice(false);
    }
  };

  const remove = async (product) => {
    const ok = await confirm(
      `Deactivate "${product.name}"? It will be hidden from POS but past sales/purchases stay intact.`,
      { title: 'Deactivate product', confirmLabel: 'Deactivate' }
    );
    if (!ok) return;
    await ProductsAPI.remove(product.id);
    loadProducts();
  };

  const newMargin = useMemo(() => Number(priceForm.new_price || 0) - Number(priceForm.new_cost || 0), [priceForm]);
  const marginPercent = Number(priceForm.new_cost || 0) > 0 ? (newMargin / Number(priceForm.new_cost)) * 100 : null;

  return (
    <div>
      <PageHeader
        title="Products"
        subtitle="Single products and variant families with separate barcodes, stock, prices and price history."
        actions={(
          <>
            <Button variant="secondary" onClick={() => navigate('/barcodes')}>Barcode Labels</Button>
            {canWrite && <Button variant="secondary" onClick={() => navigate('/products/variants/new')}>+ Product with Variants</Button>}
            {canWrite && <Button onClick={openCreate}>+ Single Product</Button>}
          </>
        )}
      />

      <Card className="p-4 mb-4">
        <input className={`${inputClass} max-w-xs`} placeholder="Search name or code…" value={search} onChange={(event) => setSearch(event.target.value)} />
      </Card>

      <Card className="overflow-x-auto">
        <table className="w-full text-sm min-w-[850px]">
          <thead>
            <tr className="border-b border-slate-200 text-left text-graphite-600">
              <th className="px-4 py-3 font-medium">Product</th>
              <th className="px-4 py-3 font-medium">Code</th>
              <th className="px-4 py-3 font-medium">Category</th>
              <th className="px-4 py-3 font-medium">Cost</th>
              <th className="px-4 py-3 font-medium">Selling</th>
              <th className="px-4 py-3 font-medium">Margin</th>
              <th className="px-4 py-3 font-medium">Stock</th>
              {canWrite && <th className="px-4 py-3" />}
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={8} className="px-4 py-6 text-center text-graphite-500">Loading…</td></tr>}
            {!loading && products.length === 0 && <tr><td colSpan={8} className="px-4 py-6 text-center text-graphite-500">No products yet.</td></tr>}
            {!loading && products.map((product) => {
              const margin = Number(product.product_price || 0) - Number(product.product_cost || 0);
              return (
                <tr key={product.id} className="border-b border-slate-100 hover:bg-slate-50">
                  <td className="px-4 py-2.5 font-medium">
                    <div>{product.name}</div>
                    {product.MainProduct?.product_type === 'variable' && (
                      <div className="mt-1 flex flex-wrap gap-1 text-[11px] font-normal">
                        <span className="rounded-full bg-copper-50 text-copper-700 px-2 py-0.5">{product.MainProduct.name}</span>
                        {product.variant_name && <span className="rounded-full bg-slate-100 text-graphite-600 px-2 py-0.5">{product.variant_name}</span>}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-2.5 font-mono text-xs">{product.code}</td>
                  <td className="px-4 py-2.5">{product.ProductCategory?.name}</td>
                  <td className="px-4 py-2.5">{formatMoney(product.product_cost)}</td>
                  <td className="px-4 py-2.5">{formatMoney(product.product_price)}</td>
                  <td className={`px-4 py-2.5 ${margin < 0 ? 'text-red-600' : 'text-emerald-700'}`}>{formatMoney(margin)}</td>
                  <td className="px-4 py-2.5"><span className={product.low_stock ? 'text-red-600 font-medium' : ''}>{product.total_stock ?? 0}</span></td>
                  {canWrite && (
                    <td className="px-4 py-2.5 text-right space-x-2 whitespace-nowrap">
                      {product.MainProduct?.product_type === 'variable' ? (
                        <button onClick={() => navigate(`/products/families/${product.main_product_id}`)} className="font-medium text-indigo-600 hover:underline">Add variants</button>
                      ) : (
                        <button onClick={() => navigate(`/products/variants/new?source_product_id=${product.id}`)} className="font-medium text-indigo-600 hover:underline">Make family</button>
                      )}
                      <button onClick={() => openPrices(product)} className="font-medium text-copper-600 hover:underline">Adjust prices</button>
                      <button onClick={() => openEdit(product)} className="text-graphite-600 hover:underline">Edit</button>
                      <button onClick={() => remove(product)} className="text-red-600 hover:underline">Deactivate</button>
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editing ? 'Edit Product' : 'Add Product'} width="max-w-2xl">
        <form onSubmit={submit}>
          {error && <div className="mb-3 text-sm text-red-600 bg-red-50 border border-red-100 rounded-md px-3 py-2">{error}</div>}
          {editing && (
            <div className="mb-4 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
              Cost and selling prices are changed with <strong>Adjust prices</strong>, which records the previous value, user, date and reason.
            </div>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4">
            <Field label="Product name"><input required className={inputClass} value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /></Field>
            <Field label="Barcode / product code" hint={!editing ? 'A unique EAN-13 code is generated automatically. Use Scan existing to replace it with a supplier/manufacturer barcode.' : 'Changing this value changes what the POS scanner must read.'}>
              <div className="flex flex-wrap gap-2">
                <input
                  ref={barcodeInputRef}
                  required={!!editing}
                  autoComplete="off"
                  spellCheck={false}
                  className={`${inputClass} min-w-[190px] flex-1`}
                  value={form.code}
                  placeholder="Generated automatically"
                  onChange={(event) => {
                    setForm({ ...form, code: event.target.value });
                    setBarcodeMessage('');
                  }}
                  onBlur={(event) => applyBarcode(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault();
                      event.stopPropagation();
                      applyBarcode(event.currentTarget.value, { captured: true });
                    }
                  }}
                />
                <Button type="button" variant="secondary" onClick={focusBarcodeScanner}>Scan existing</Button>
                {!editing && <Button type="button" variant="secondary" onClick={async () => {
                  try {
                    const response = await ProductsAPI.generateCode();
                    setForm((current) => ({ ...current, ...response.data.data }));
                    setBarcodeMessage(`Generated barcode: ${response.data.data.code}`);
                  } catch (requestError) {
                    setError(requestError.response?.data?.message || 'Barcode could not be generated.');
                  }
                }}>Generate</Button>}
              </div>
              {barcodeMessage && <p className="mt-1 text-xs text-emerald-700">{barcodeMessage}</p>}
            </Field>
            <Field label="Barcode type">
              <select className={inputClass} value={form.barcode_symbol} onChange={(event) => setForm({ ...form, barcode_symbol: event.target.value })}>
                <option value="EAN13">EAN-13 (recommended for generated numeric codes)</option>
                <option value="CODE128">Code 128 (letters and numbers)</option>
              </select>
            </Field>
            <Field label="Category">
              <select required className={inputClass} value={form.product_category_id} onChange={(event) => setForm({ ...form, product_category_id: event.target.value })}>
                <option value="">Select…</option>{categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
              </select>
            </Field>
            <Field label="Brand">
              <select className={inputClass} value={form.brand_id} onChange={(event) => setForm({ ...form, brand_id: event.target.value })}>
                <option value="">None</option>{brands.map((brand) => <option key={brand.id} value={brand.id}>{brand.name}</option>)}
              </select>
            </Field>
            <Field label="Cost price (Rs.)"><input required={!editing} disabled={!!editing} type="number" min="0" step="any" className={`${inputClass} disabled:bg-slate-100`} value={form.product_cost} onChange={(event) => setForm({ ...form, product_cost: event.target.value })} /></Field>
            <Field label="Selling price (Rs.)"><input required={!editing} disabled={!!editing} type="number" min="0" step="any" className={`${inputClass} disabled:bg-slate-100`} value={form.product_price} onChange={(event) => setForm({ ...form, product_price: event.target.value })} /></Field>
            <Field label="Stock unit">
              <select className={inputClass} value={form.product_unit} onChange={(event) => setForm({ ...form, product_unit: event.target.value })}>
                <option value="">None</option>{units.map((unit) => <option key={unit.id} value={unit.id}>{unit.name}</option>)}
              </select>
              {!units.length && <p className="text-xs text-amber-700 mt-1">No units found. Run the seed command or create a unit first.</p>}
            </Field>
            <Field label="Sale unit"><select className={inputClass} value={form.sale_unit} onChange={(event) => setForm({ ...form, sale_unit: event.target.value })}><option value="">Same as stock unit</option>{units.map((unit) => <option key={unit.id} value={unit.id}>{unit.name}</option>)}</select></Field>
            <Field label="Purchase unit"><select className={inputClass} value={form.purchase_unit} onChange={(event) => setForm({ ...form, purchase_unit: event.target.value })}><option value="">Same as stock unit</option>{units.map((unit) => <option key={unit.id} value={unit.id}>{unit.name}</option>)}</select></Field>
            <Field label="Low-stock alert at"><input type="number" min="0" step="any" className={inputClass} value={form.stock_alert} onChange={(event) => setForm({ ...form, stock_alert: event.target.value })} /></Field>
            <Field label="Tax % (e.g. VAT)"><input type="number" min="0" max="100" step="any" className={inputClass} value={form.order_tax} onChange={(event) => setForm({ ...form, order_tax: event.target.value })} /></Field>
            <Field label="Tax type"><select className={inputClass} value={form.tax_type} onChange={(event) => setForm({ ...form, tax_type: event.target.value })}><option value="exclusive">Exclusive (added on top)</option><option value="inclusive">Inclusive (already in price)</option></select></Field>
          </div>
          <Field label="Notes"><textarea className={inputClass} rows={2} value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} /></Field>

          {!editing && (
            <Field label="Initial stock per warehouse">
              <div className="space-y-2 border border-slate-200 rounded-md p-3">
                {warehouses.map((warehouse) => (
                  <div key={warehouse.id} className="flex items-center justify-between gap-3 text-sm">
                    <span>{warehouse.name}</span>
                    <input type="number" min="0" step="any" className={`${inputClass} w-28 py-1`} value={initialStock[warehouse.id] ?? ''} onChange={(event) => setInitialStock({ ...initialStock, [warehouse.id]: event.target.value })} />
                  </div>
                ))}
              </div>
            </Field>
          )}

          <div className="flex justify-end gap-2 mt-4"><Button type="button" variant="secondary" onClick={() => setModalOpen(false)}>Cancel</Button><Button type="submit">Save</Button></div>
        </form>
      </Modal>

      <Modal open={!!priceProduct} onClose={() => setPriceProduct(null)} title={`Adjust prices — ${priceProduct?.name || ''}`} width="max-w-3xl">
        {priceProduct && (
          <div>
            <form onSubmit={submitPrice} className="border-b border-slate-200 pb-5 mb-5">
              {priceError && <div className="mb-3 text-sm text-red-600 bg-red-50 border border-red-100 rounded-md px-3 py-2">{priceError}</div>}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="rounded-md border border-slate-200 p-3">
                  <div className="text-xs text-graphite-500">Current cost</div><div className="font-display text-lg font-semibold">{formatMoney(priceProduct.product_cost)}</div>
                </div>
                <div className="rounded-md border border-slate-200 p-3">
                  <div className="text-xs text-graphite-500">Current selling price</div><div className="font-display text-lg font-semibold">{formatMoney(priceProduct.product_price)}</div>
                </div>
                <Field label={`New cost price (${changeText(priceProduct.product_cost, priceForm.new_cost)})`}><input required type="number" min="0" step="any" className={inputClass} value={priceForm.new_cost} onChange={(event) => setPriceForm({ ...priceForm, new_cost: event.target.value })} /></Field>
                <Field label={`New selling price (${changeText(priceProduct.product_price, priceForm.new_price)})`}><input required type="number" min="0" step="any" className={inputClass} value={priceForm.new_price} onChange={(event) => setPriceForm({ ...priceForm, new_price: event.target.value })} /></Field>
              </div>
              <div className={`rounded-md px-3 py-2 mb-3 text-sm ${newMargin < 0 ? 'bg-red-50 text-red-700' : 'bg-emerald-50 text-emerald-800'}`}>
                New unit margin: <strong>{formatMoney(newMargin)}</strong>{marginPercent !== null ? ` (${marginPercent.toFixed(1)}% on cost)` : ''}
                {newMargin < 0 && <span> — selling price is below cost.</span>}
              </div>
              <Field label="Reason for change" hint="Examples: supplier increase, market reduction, promotional price, corrected data."><textarea required rows={2} className={inputClass} value={priceForm.reason} onChange={(event) => setPriceForm({ ...priceForm, reason: event.target.value })} /></Field>
              <div className="flex justify-end"><Button type="submit" disabled={savingPrice}>{savingPrice ? 'Saving…' : 'Save price adjustment'}</Button></div>
            </form>

            <div>
              <h3 className="font-display font-semibold mb-3">Price history</h3>
              {historyLoading && <p className="text-sm text-graphite-500">Loading history…</p>}
              {!historyLoading && priceHistory.length === 0 && <p className="text-sm text-graphite-500">No previous price adjustments.</p>}
              {!historyLoading && priceHistory.length > 0 && (
                <div className="overflow-x-auto border border-slate-200 rounded-md max-h-72 overflow-y-auto">
                  <table className="w-full text-xs min-w-[680px]">
                    <thead className="sticky top-0 bg-slate-50"><tr className="text-left text-graphite-600"><th className="p-2">Date / user</th><th className="p-2">Cost</th><th className="p-2">Selling</th><th className="p-2">Source</th><th className="p-2">Reason</th></tr></thead>
                    <tbody>{priceHistory.map((row) => (
                      <tr key={row.id} className="border-t border-slate-100 align-top">
                        <td className="p-2"><div>{historyDate(row.createdAt || row.created_at)}</div><div className="text-graphite-400">{row.changedBy?.name || 'System'}</div></td>
                        <td className="p-2"><span className="text-graphite-400">{formatMoney(row.old_cost)}</span> → <strong>{formatMoney(row.new_cost)}</strong></td>
                        <td className="p-2"><span className="text-graphite-400">{formatMoney(row.old_price)}</span> → <strong>{formatMoney(row.new_price)}</strong></td>
                        <td className="p-2 capitalize">{String(row.source || '').replace('_', ' ')}{row.Purchase?.reference_code ? <div className="text-graphite-400">{row.Purchase.reference_code}</div> : null}</td>
                        <td className="p-2 max-w-xs">{row.reason || '—'}</td>
                      </tr>
                    ))}</tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
