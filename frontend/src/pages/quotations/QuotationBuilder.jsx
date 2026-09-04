import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  QuotationsHoldsAPI, CustomersAPI, WarehousesAPI, ProductsAPI, CategoriesAPI, UnitsAPI,
} from '../../api/endpoints';
import {
  Button, Card, Field, Modal, PageHeader, inputClass,
} from '../../components/ui.jsx';
import { formatMoney, todayISO } from '../../utils/format';
import { useDialog } from '../../context/DialogContext.jsx';
import DocumentActions from '../../components/DocumentActions.jsx';
import { compatibleUnits, convertUnits, defaultUnitId, findUnit } from '../../utils/units';

function numericValue(value, fallback = 0) {
  if (value === '' || value === null || value === undefined) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

// This full page replaces the old "New Quotation" popup. A shop person can
// browse/search the catalogue, add lines, override the price or apply a
// per-item discount for this quotation only, and see the cost/profit for
// every line and for the whole quotation before sending it to the customer.
export default function QuotationBuilder() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { alert: showAlert, confirm } = useDialog();
  const isEditing = Boolean(id) && id !== 'new';

  const [loading, setLoading] = useState(isEditing);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [quotation, setQuotation] = useState(null); // loaded record when editing/viewing

  const [customers, setCustomers] = useState([]);
  const [warehouses, setWarehouses] = useState([]);
  const [categories, setCategories] = useState([]);
  const [products, setProducts] = useState([]);
  const [search, setSearch] = useState('');
  const [categoryId, setCategoryId] = useState('');

  const [date, setDate] = useState(todayISO());
  const [validUntil, setValidUntil] = useState('');
  const [customerId, setCustomerId] = useState('');
  const [warehouseId, setWarehouseId] = useState('');
  const [note, setNote] = useState('');
  const [items, setItems] = useState([]);
  const [discount, setDiscount] = useState('0');
  const [taxRate, setTaxRate] = useState('0');
  const [shipping, setShipping] = useState('0');
  const [convertOpen, setConvertOpen] = useState(false);
  const [converting, setConverting] = useState(false);
  const [convertError, setConvertError] = useState('');
  const [convertMethod, setConvertMethod] = useState('cash');
  const [convertPaid, setConvertPaid] = useState('');
  const [convertReceived, setConvertReceived] = useState('');
  const [convertDueDate, setConvertDueDate] = useState('');
  const [units, setUnits] = useState([]);

  const readOnly = isEditing && quotation && quotation.status !== 'sent';

  useEffect(() => {
    CustomersAPI.listWithBalances().then((r) => setCustomers((r.data.data || []).filter((customer) => customer.is_active !== false))).catch(() => {});
    WarehousesAPI.list({ per_page: 100 }).then((r) => setWarehouses(r.data.data || r.data)).catch(() => {});
    CategoriesAPI.list({ per_page: 100 }).then((r) => setCategories(r.data.data || r.data)).catch(() => {});
    UnitsAPI.list({ per_page: 200 }).then((r) => setUnits(r.data.data || r.data)).catch(() => {});
  }, []);

  const loadProducts = useCallback(() => {
    ProductsAPI.list({ search, category_id: categoryId || undefined, per_page: 100 })
      .then((res) => setProducts(res.data.data || res.data))
      .catch(() => setProducts([]));
  }, [search, categoryId]);
  useEffect(() => {
    const timer = setTimeout(loadProducts, search ? 250 : 0); // debounce typing, but filter instantly on category change
    return () => clearTimeout(timer);
  }, [loadProducts, search]);

  useEffect(() => {
    if (!isEditing) return;
    setLoading(true);
    QuotationsHoldsAPI.getQuotation(id)
      .then((res) => {
        const q = res.data.data;
        setQuotation(q);
        setDate(q.date);
        setValidUntil(q.valid_until || '');
        setCustomerId(String(q.customer_id));
        setWarehouseId(String(q.warehouse_id));
        setNote(q.note || '');
        setDiscount(String(q.discount ?? 0));
        setTaxRate(String(q.tax_rate ?? 0));
        setShipping(String(q.shipping ?? 0));
        setItems((q.items || []).map((item) => ({
          line_id: `item-${item.id}`,
          product: item.Product || { id: item.product_id, name: item.item_name, product_price: item.standard_price, product_cost: item.product_cost },
          quantity: String(item.quantity),
          price: String(item.product_price),
          standard_price: String(item.standard_price ?? item.product_price),
          cost_price: String(item.product_cost ?? 0),
          discount_type: item.discount_type || 'none',
          discount_value: item.discount_value ? String(item.discount_value) : '',
          unit_id: item.sale_unit_id || null,
          unit_quantity: item.unit_quantity !== null && item.unit_quantity !== undefined ? String(item.unit_quantity) : null,
        })));
      })
      .catch((e) => setError(e.response?.data?.message || 'Could not load this quotation.'))
      .finally(() => setLoading(false));
  }, [id, isEditing]);

  const addItem = (product) => {
    if (readOnly) return;
    const lineUnits = compatibleUnits(product, units);
    const initialUnit = lineUnits.length ? findUnit(defaultUnitId(product), units) || lineUnits[0] : null;
    setItems((previous) => {
      const existing = previous.find((line) => line.product.id === product.id);
      if (existing) {
        if (existing.unit_id) {
          const unit = findUnit(existing.unit_id, units);
          const nextUnitQuantity = numericValue(existing.unit_quantity) + 1;
          return previous.map((line) => (line.product.id === product.id
            ? { ...line, unit_quantity: String(nextUnitQuantity), quantity: String(convertUnits(nextUnitQuantity, unit, product.stockUnit)) }
            : line));
        }
        return previous.map((line) => (line.product.id === product.id
          ? { ...line, quantity: String(numericValue(line.quantity) + 1) }
          : line));
      }
      return [...previous, {
        line_id: `product-${product.id}-${Date.now()}`,
        product,
        quantity: '1',
        unit_id: initialUnit ? initialUnit.id : null,
        unit_quantity: initialUnit ? '1' : null,
        price: String(product.product_price ?? 0),
        standard_price: String(product.product_price ?? 0),
        cost_price: String(product.product_cost ?? 0),
        discount_type: 'none',
        discount_value: '',
      }];
    });
  };

  const updateLine = (lineId, patch) => setItems((prev) => prev.map((line) => (line.line_id === lineId ? { ...line, ...patch } : line)));
  const removeLine = (lineId) => setItems((prev) => prev.filter((line) => line.line_id !== lineId));

  // Mirrors POS.jsx: keeps `quantity` in the product's stock unit while
  // unit_id/unit_quantity remember what the cashier actually typed.
  const updateLineUnit = (lineId, { unitQuantity, unitId }) => {
    setItems((previous) => previous.map((line) => {
      if (line.line_id !== lineId) return line;
      const product = line.product;
      const nextUnitId = unitId !== undefined ? unitId : line.unit_id;
      const nextUnitQuantity = unitQuantity !== undefined ? unitQuantity : line.unit_quantity;
      const unit = findUnit(nextUnitId, units);
      const quantity = product?.stockUnit
        ? convertUnits(numericValue(nextUnitQuantity), unit, product.stockUnit)
        : numericValue(nextUnitQuantity);
      return { ...line, unit_id: nextUnitId, unit_quantity: nextUnitQuantity, quantity: String(quantity) };
    }));
  };

  const lineBaseTotal = (line) => numericValue(line.quantity) * numericValue(line.price);
  const lineDiscountAmount = (line) => {
    const total = lineBaseTotal(line);
    const value = numericValue(line.discount_value);
    if (line.discount_type === 'percentage') return (total * value) / 100;
    if (line.discount_type === 'fixed') return value;
    return 0;
  };
  const lineSubtotal = (line) => lineBaseTotal(line) - lineDiscountAmount(line);
  const lineCostTotal = (line) => numericValue(line.quantity) * numericValue(line.cost_price);
  const lineProfit = (line) => lineSubtotal(line) - lineCostTotal(line);
  const isPriceOverridden = (line) => Math.abs(numericValue(line.price) - numericValue(line.standard_price)) > 0.000001;

  const subTotal = useMemo(() => items.reduce((sum, line) => sum + lineSubtotal(line), 0), [items]);
  const totalCost = useMemo(() => items.reduce((sum, line) => sum + lineCostTotal(line), 0), [items]);
  const totalProfit = subTotal - totalCost;
  const orderDiscount = numericValue(discount);
  const orderShipping = numericValue(shipping);
  const taxAmount = ((subTotal - orderDiscount) * numericValue(taxRate)) / 100;
  const grandTotal = Math.max(0, subTotal - orderDiscount + orderShipping + taxAmount);
  const netProfit = totalProfit - orderDiscount;
  const selectedCustomer = customers.find((customer) => String(customer.id) === String(customerId));
  const conversionDebt = Math.max(0, Number(quotation?.grand_total || grandTotal || 0) - Number(convertPaid || 0));
  const projectedConversionBalance = Number(selectedCustomer?.total_due || 0) + conversionDebt;

  const validate = () => {
    if (!customerId) return 'Select a customer.';
    if (!warehouseId) return 'Select a warehouse.';
    if (!items.length) return 'Add at least one item.';
    for (const line of items) {
      const quantity = numericValue(line.quantity, -1);
      const price = numericValue(line.price, -1);
      if (quantity <= 0) return `${line.product.name}: quantity must be greater than zero.`;
      if (price < 0) return `${line.product.name}: enter a valid price.`;
      if (lineDiscountAmount(line) > lineBaseTotal(line)) return `${line.product.name}: discount cannot exceed the line total.`;
    }
    if (orderDiscount > subTotal) return 'Whole-quotation discount cannot exceed the items subtotal.';
    return '';
  };

  const save = async () => {
    setError('');
    const validationError = validate();
    if (validationError) { setError(validationError); return; }

    const payload = {
      date,
      valid_until: validUntil || null,
      customer_id: customerId,
      warehouse_id: warehouseId,
      note,
      discount: orderDiscount,
      shipping: orderShipping,
      tax_rate: numericValue(taxRate),
      items: items.map((line) => ({
        product_id: line.product.id,
        quantity: numericValue(line.quantity),
        product_price: numericValue(line.price),
        discount_type: line.discount_type,
        discount_value: numericValue(line.discount_value),
        sale_unit_id: line.unit_id || null,
        unit_quantity: line.unit_id ? numericValue(line.unit_quantity) : null,
      })),
    };

    setSaving(true);
    try {
      const response = isEditing
        ? await QuotationsHoldsAPI.updateQuotation(id, payload)
        : await QuotationsHoldsAPI.createQuotation(payload);
      navigate(`/quotations/${response.data.data.id}`, { replace: true });
    } catch (e) {
      setError(e.response?.data?.message || 'Failed to save the quotation.');
    } finally {
      setSaving(false);
    }
  };

  const openConvert = () => {
    const total = Number(quotation?.grand_total || grandTotal || 0).toFixed(2);
    setConvertMethod('cash');
    setConvertPaid(total);
    setConvertReceived(total);
    setConvertDueDate('');
    setConvertError('');
    setConvertOpen(true);
  };

  const convertToSale = async (event) => {
    event.preventDefault();
    const paid = Number(convertPaid || 0);
    const received = Number(convertReceived || 0);
    const total = Number(quotation?.grand_total || 0);
    if (!Number.isFinite(paid) || paid < 0 || paid - total > 0.005) {
      setConvertError(`Paid amount must be between 0 and ${total.toFixed(2)}.`);
      return;
    }
    if (!Number.isFinite(received) || received < paid) {
      setConvertError('Received amount must be at least the paid amount.');
      return;
    }
    setConverting(true);
    setConvertError('');
    try {
      const response = await QuotationsHoldsAPI.convertQuotation(id, {
        payment_type: convertMethod,
        paid_amount: paid,
        received_amount: received,
        due_date: paid < total ? (convertDueDate || null) : null,
      });
      setConvertOpen(false);
      await showAlert(`Sale ${response.data.data.reference_code} created from this quotation.`, { title: 'Converted' });
      navigate('/sales');
    } catch (e) {
      setConvertError(e.response?.data?.message || 'Could not convert this quotation.');
    } finally {
      setConverting(false);
    }
  };

  const reopenQuotation = async () => {
    try {
      const response = await QuotationsHoldsAPI.setQuotationStatus(id, 'sent');
      setQuotation((current) => ({ ...current, ...response.data.data }));
    } catch (e) {
      showAlert(e.response?.data?.message || 'Could not reopen this quotation.', { title: 'Action failed' });
    }
  };

  const cancelQuotation = async () => {
    const ok = await confirm('Mark this quotation as cancelled? It will stay on record but can no longer be converted.', { title: 'Cancel quotation', confirmLabel: 'Cancel quotation' });
    if (!ok) return;
    try {
      await QuotationsHoldsAPI.setQuotationStatus(id, 'cancelled');
      setQuotation((q) => ({ ...q, status: 'cancelled' }));
    } catch (e) {
      showAlert(e.response?.data?.message || 'Could not update this quotation.', { title: 'Action failed' });
    }
  };

  if (loading) return <div className="text-graphite-500">Loading…</div>;

  return (
    <div>
      <PageHeader
        title={isEditing ? `Quotation ${quotation?.reference_code || ''}` : 'New Quotation'}
        subtitle={readOnly ? `Status: ${quotation.status} — this quotation can no longer be edited.` : 'Build the quotation on this page — prices and discounts update live, and you can see your margin before you send it.'}
        actions={(
          <div className="flex gap-2">
            <Button type="button" variant="secondary" onClick={() => navigate('/quotations')}>Back to list</Button>
            {isEditing && quotation && <DocumentActions type="quotation" record={quotation} />}
            {isEditing && quotation?.status === 'sent' && (
              <>
                <Button type="button" variant="secondary" onClick={cancelQuotation}>Cancel quotation</Button>
                <Button type="button" onClick={openConvert}>Convert to Sale</Button>
              </>
            )}
            {isEditing && quotation?.status === 'expired' && (
              <Button type="button" onClick={reopenQuotation}>Reopen &amp; review</Button>
            )}
          </div>
        )}
      />

      {error && <div className="mb-4 text-sm text-red-600 bg-red-50 border border-red-100 rounded-md px-3 py-2">{error}</div>}
      {quotation?.status === 'converted' && (
        <div className="mb-4 text-sm text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-md px-3 py-2">
          This quotation was converted into sale #{quotation.converted_sale_id}. View it from Sales History.
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 flex flex-col gap-4">
          <Card className="p-4 grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-graphite-700">Date</span>
              <input type="date" className={inputClass} value={date} disabled={readOnly} onChange={(e) => setDate(e.target.value)} />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-graphite-700">Valid until</span>
              <input type="date" className={inputClass} value={validUntil} disabled={readOnly} onChange={(e) => setValidUntil(e.target.value)} />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-graphite-700">Customer</span>
              <select className={inputClass} value={customerId} disabled={readOnly} onChange={(e) => setCustomerId(e.target.value)}>
                <option value="">Select…</option>
                {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-graphite-700">Warehouse</span>
              <select className={inputClass} value={warehouseId} disabled={readOnly} onChange={(e) => setWarehouseId(e.target.value)}>
                <option value="">Select…</option>
                {warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
              </select>
            </label>
          </Card>

          {!readOnly && (
            <Card className="p-4">
              <div className="flex flex-wrap gap-2 items-center">
                <div className="relative flex-1 min-w-[220px]">
                  <svg className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-graphite-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M11 19a8 8 0 100-16 8 8 0 000 16z" />
                  </svg>
                  <input
                    className={inputClass + ' w-full pl-8 pr-8'}
                    placeholder="Search products by name or code…"
                    value={search}
                    autoFocus
                    onChange={(e) => setSearch(e.target.value)}
                  />
                  {search && (
                    <button
                      type="button"
                      onClick={() => setSearch('')}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-graphite-400 hover:text-graphite-700"
                      aria-label="Clear search"
                    >
                      ×
                    </button>
                  )}
                </div>
                <select className={inputClass + ' w-full sm:w-56'} value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
                  <option value="">All categories</option>
                  {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              {(search || categoryId) && (
                <p className="mt-2 text-xs text-graphite-500">
                  {products.length} product{products.length === 1 ? '' : 's'} match
                  {categoryId && categories.find((c) => String(c.id) === String(categoryId)) ? ` in "${categories.find((c) => String(c.id) === String(categoryId)).name}"` : ''}
                  {search ? ` for "${search}"` : ''}.
                </p>
              )}
            </Card>
          )}

          {!readOnly && (
            <Card className="p-4 max-h-96 overflow-y-auto">
              <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-3">
                {products.map((product) => (
                  <button
                    type="button"
                    key={product.id}
                    onClick={() => addItem(product)}
                    className="text-left border border-slate-200 rounded-lg p-3 hover:border-copper-500 hover:shadow-sm transition"
                  >
                    <div className="text-sm font-medium text-graphite-900 line-clamp-2 min-h-[2.5em]">{product.name}</div>
                    <div className="text-xs text-graphite-500 font-mono mt-1">{product.code}</div>
                    <div className="font-display font-semibold text-copper-600 mt-2">{formatMoney(product.product_price)}</div>
                  </button>
                ))}
                {products.length === 0 && (
                  <div className="col-span-full text-center text-graphite-500 py-6">
                    No products found{search ? ` for "${search}"` : ''}{categoryId ? ' in this category' : ''}. Try a different search term or category.
                  </div>
                )}
              </div>
            </Card>
          )}

          <Card className="p-4">
            <h3 className="font-display font-semibold mb-3">Items</h3>
            {items.length === 0 && <p className="text-sm text-graphite-500 py-4 text-center">No items yet. Click a product above to add it.</p>}
            <div className="divide-y divide-slate-100">
              {items.map((line) => {
                const discountAmount = lineDiscountAmount(line);
                const profit = lineProfit(line);
                const overridden = isPriceOverridden(line);
                const belowCost = profit < 0;
                return (
                  <div key={line.line_id} className="py-3">
                    <div className="flex justify-between items-start gap-2">
                      <span className="text-sm font-medium">{line.product.name}</span>
                      {!readOnly && <button type="button" onClick={() => removeLine(line.line_id)} className="text-graphite-400 hover:text-red-600 text-xs">Remove</button>}
                    </div>
                    <div className="mt-2 grid grid-cols-[5rem_minmax(7rem,1fr)_auto] items-end gap-2">
                      {line.unit_id ? (
                        <label className="col-span-1 block">
                          <span className="mb-1 block text-[11px] font-medium text-graphite-500">Length</span>
                          <div className="flex items-center gap-1">
                            <input type="number" min="0.01" step="any" className={inputClass + ' w-full py-1'} value={line.unit_quantity ?? ''} disabled={readOnly}
                              onChange={(e) => updateLineUnit(line.line_id, { unitQuantity: e.target.value })} />
                            <select className={inputClass + ' w-auto py-1 text-xs'} value={line.unit_id} disabled={readOnly}
                              onChange={(e) => updateLineUnit(line.line_id, { unitId: Number(e.target.value) })}>
                              {compatibleUnits(line.product, units).map((unit) => (
                                <option key={unit.id} value={unit.id}>{unit.short_name || unit.name}</option>
                              ))}
                            </select>
                          </div>
                          <span className="mt-1 block text-[10px] text-graphite-400">
                            = {Number(line.quantity || 0).toLocaleString('en-LK', { maximumFractionDigits: 3 })} {line.product?.stockUnit?.short_name || line.product?.stockUnit?.name}
                          </span>
                        </label>
                      ) : (
                        <label className="block">
                          <span className="mb-1 block text-[11px] font-medium text-graphite-500">Qty</span>
                          <input type="number" min="0.01" step="any" className={inputClass + ' w-full py-1'} value={line.quantity} disabled={readOnly}
                            onChange={(e) => updateLine(line.line_id, { quantity: e.target.value })} />
                        </label>
                      )}
                      <label className="block">
                        <span className="mb-1 flex items-center gap-1 text-[11px] font-medium text-graphite-500">
                          Quoted price
                          {overridden && <span className="rounded bg-blue-100 px-1.5 py-0.5 text-[9px] uppercase tracking-wide text-blue-700">Changed</span>}
                        </span>
                        <div className="flex items-center gap-1.5">
                          <input type="number" min="0" step="any" className={inputClass + ' min-w-0 flex-1 py-1'} value={line.price} disabled={readOnly}
                            onChange={(e) => updateLine(line.line_id, { price: e.target.value })} />
                          {overridden && !readOnly && (
                            <button type="button" onClick={() => updateLine(line.line_id, { price: line.standard_price })}
                              className="whitespace-nowrap rounded border border-slate-200 bg-white px-2 py-1.5 text-[10px] font-medium text-graphite-600 hover:border-copper-400">
                              Reset
                            </button>
                          )}
                        </div>
                      </label>
                      <span className="pb-2 text-sm font-medium">{formatMoney(lineSubtotal(line))}</span>
                    </div>

                    <div className={`mt-2 rounded-md border px-2.5 py-2 ${belowCost ? 'border-red-200 bg-red-50' : 'border-emerald-100 bg-emerald-50/60'}`}>
                      <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs sm:grid-cols-4">
                        <div><span className="block text-[10px] uppercase tracking-wide text-graphite-500">Standard</span><strong className="text-graphite-800">{formatMoney(line.standard_price)}</strong></div>
                        <div><span className="block text-[10px] uppercase tracking-wide text-graphite-500">Cost / unit</span><strong className="text-graphite-800">{formatMoney(line.cost_price)}</strong></div>
                        <div><span className="block text-[10px] uppercase tracking-wide text-graphite-500">Profit / unit</span><strong className={belowCost ? 'text-red-700' : 'text-emerald-700'}>{formatMoney(numericValue(line.quantity) > 0 ? profit / numericValue(line.quantity) : 0)}</strong></div>
                        <div><span className="block text-[10px] uppercase tracking-wide text-graphite-500">Line profit</span><strong className={belowCost ? 'text-red-700' : 'text-emerald-700'}>{formatMoney(profit)}</strong></div>
                      </div>
                      {belowCost && <p className="mt-1 text-[11px] font-medium text-red-700">Warning: this line is quoted below cost.</p>}
                    </div>

                    {!readOnly && (
                      <div className="mt-2 rounded-md bg-slate-50 p-2 flex flex-wrap items-center gap-2">
                        <span className="text-xs font-medium text-graphite-600">Item discount</span>
                        <button type="button" onClick={() => updateLine(line.line_id, { discount_type: 'percentage', discount_value: '5' })} className="rounded border border-slate-200 bg-white px-2 py-1 text-xs hover:border-copper-400">5%</button>
                        <button type="button" onClick={() => updateLine(line.line_id, { discount_type: 'percentage', discount_value: '10' })} className="rounded border border-slate-200 bg-white px-2 py-1 text-xs hover:border-copper-400">10%</button>
                        <select className={inputClass + ' w-32 py-1 text-xs'} value={line.discount_type}
                          onChange={(e) => updateLine(line.line_id, { discount_type: e.target.value, discount_value: e.target.value === 'none' ? '' : line.discount_value })}>
                          <option value="none">No discount</option>
                          <option value="percentage">Percentage</option>
                          <option value="fixed">Fixed amount</option>
                        </select>
                        {line.discount_type !== 'none' && (
                          <input type="number" min="0" max={line.discount_type === 'percentage' ? 100 : undefined} step="any" className={inputClass + ' w-24 py-1'}
                            value={line.discount_value} onChange={(e) => updateLine(line.line_id, { discount_value: e.target.value })}
                            placeholder={line.discount_type === 'percentage' ? '%' : 'Amount'} />
                        )}
                        {discountAmount > 0 && <span className="ml-auto text-xs font-medium text-emerald-700">Saved {formatMoney(discountAmount)}</span>}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </Card>

          <Card className="p-4">
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-graphite-700">Note (shown on the printed quotation)</span>
              <textarea className={inputClass} rows={2} value={note} disabled={readOnly} onChange={(e) => setNote(e.target.value)} />
            </label>
          </Card>
        </div>

        <Card className="p-4 h-fit sticky top-4">
          <h3 className="font-display font-semibold mb-3">Totals &amp; profit</h3>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between"><span>Items subtotal</span><span>{formatMoney(subTotal)}</span></div>
            <div className="flex justify-between items-center">
              <span>Whole-quotation discount</span>
              <input type="number" min="0" step="any" className={inputClass + ' w-28 py-1'} value={discount} disabled={readOnly} onChange={(e) => setDiscount(e.target.value)} />
            </div>
            <div className="flex justify-between items-center">
              <span>Shipping</span>
              <input type="number" min="0" step="any" className={inputClass + ' w-28 py-1'} value={shipping} disabled={readOnly} onChange={(e) => setShipping(e.target.value)} />
            </div>
            <div className="flex justify-between items-center">
              <span>Tax %</span>
              <input type="number" min="0" step="any" className={inputClass + ' w-28 py-1'} value={taxRate} disabled={readOnly} onChange={(e) => setTaxRate(e.target.value)} />
            </div>
            <div className="flex justify-between font-display font-semibold text-lg pt-1 border-t border-slate-200">
              <span>Total (to customer)</span><span className="text-copper-600">{formatMoney(grandTotal)}</span>
            </div>
          </div>

          <div className={`mt-4 rounded-md border px-3 py-2.5 ${netProfit < 0 ? 'border-red-200 bg-red-50' : 'border-emerald-100 bg-emerald-50/60'}`}>
            <div className="text-xs uppercase tracking-wide text-graphite-500 font-medium mb-1">For shop staff only — not printed</div>
            <div className="flex justify-between text-sm"><span>Total cost</span><span>{formatMoney(totalCost)}</span></div>
            <div className={`flex justify-between font-semibold ${netProfit < 0 ? 'text-red-700' : 'text-emerald-700'}`}>
              <span>Estimated profit</span><span>{formatMoney(netProfit)}</span>
            </div>
            <p className="mt-1 text-[10px] text-graphite-500">Profit is after item discounts and the whole-quotation discount, excludes tax and shipping.</p>
          </div>

          {!readOnly && (
            <Button type="button" className="w-full justify-center mt-4" onClick={save} disabled={saving}>
              {saving ? 'Saving…' : isEditing ? 'Save changes' : 'Save Quotation'}
            </Button>
          )}
        </Card>
      </div>

      <Modal open={convertOpen} onClose={() => !converting && setConvertOpen(false)} title="Convert quotation to sale" width="max-w-xl">
        <form onSubmit={convertToSale} className="space-y-3">
          {convertError && <div className="rounded-md border border-red-100 bg-red-50 px-3 py-2 text-sm text-red-600">{convertError}</div>}
          <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm">
            Invoice total: <strong>{formatMoney(quotation?.grand_total)}</strong>. Stock is deducted only after this form succeeds.
          </div>
          {selectedCustomer && conversionDebt > 0.005 && (
            <div className={`rounded-md border px-3 py-2 text-xs ${Number(selectedCustomer.credit_limit || 0) > 0 && projectedConversionBalance > Number(selectedCustomer.credit_limit) ? 'border-red-200 bg-red-50 text-red-700' : 'border-amber-200 bg-amber-50 text-amber-800'}`}>
              Existing customer balance: <strong>{formatMoney(selectedCustomer.total_due)}</strong>. After conversion: <strong>{formatMoney(projectedConversionBalance)}</strong>.
              {Number(selectedCustomer.credit_limit || 0) > 0 && projectedConversionBalance > Number(selectedCustomer.credit_limit) && ` This exceeds the credit limit of ${formatMoney(selectedCustomer.credit_limit)}.`}
            </div>
          )}
          <Field label="Payment method">
            <select className={inputClass} value={convertMethod} onChange={(e) => {
              const method = e.target.value;
              setConvertMethod(method);
              if (method === 'credit') { setConvertPaid('0'); setConvertReceived('0'); }
            }}>
              <option value="cash">Cash</option>
              <option value="card">Card</option>
              <option value="bank_transfer">Bank transfer</option>
              <option value="credit">Credit / pay later</option>
            </select>
          </Field>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Amount paid now" hint="Enter 0 for a fully credit sale.">
              <input type="number" min="0" max={quotation?.grand_total} step="any" className={inputClass} value={convertPaid}
                onChange={(e) => setConvertPaid(e.target.value)} autoFocus />
            </Field>
            <Field label="Amount received" hint="May be higher for cash tender; change is not counted as payment.">
              <input type="number" min="0" step="any" className={inputClass} value={convertReceived}
                onChange={(e) => setConvertReceived(e.target.value)} />
            </Field>
          </div>
          {Number(convertPaid || 0) < Number(quotation?.grand_total || 0) && (
            <Field label="Payment due date" hint="Leave blank to use this customer's default payment terms.">
              <input type="date" className={inputClass} value={convertDueDate} onChange={(e) => setConvertDueDate(e.target.value)} />
            </Field>
          )}
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" disabled={converting} onClick={() => setConvertOpen(false)}>Cancel</Button>
            <Button type="submit" disabled={converting}>{converting ? 'Converting…' : 'Create sale & deduct stock'}</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
