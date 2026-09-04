import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PurchasesAPI, SuppliersAPI, WarehousesAPI, ProductsAPI } from '../../api/endpoints';
import { Button, PageHeader, Modal, Card, Field, inputClass } from '../../components/ui.jsx';
import { formatMoney, formatDate, todayISO } from '../../utils/format';
import DocumentActions from '../../components/DocumentActions.jsx';
import { useAuth } from '../../context/AuthContext.jsx';

function asList(response) {
  return response?.data?.data || response?.data || [];
}

function differencePercent(oldValue, newValue) {
  const oldNumber = Number(oldValue || 0);
  const newNumber = Number(newValue || 0);
  if (oldNumber === newNumber) return 0;
  if (oldNumber === 0) return null;
  return ((newNumber - oldNumber) / oldNumber) * 100;
}

function human(value) {
  return String(value || '').replaceAll('_', ' ');
}

function outstanding(purchase) {
  return Math.max(0, Number(purchase?.grand_total || 0) - Number(purchase?.returned_amount || 0) - Number(purchase?.paid_amount || 0));
}

function supplierCredit(purchase) {
  return Math.max(0, Number(purchase?.paid_amount || 0) - (Number(purchase?.grand_total || 0) - Number(purchase?.returned_amount || 0)));
}

function receivedTotal(purchase) {
  return (purchase?.items || []).reduce((sum, item) => sum + Number(item.received_quantity || 0), 0);
}

function cleanParams(values) {
  return Object.fromEntries(Object.entries(values).filter(([, value]) => value !== '' && value !== null && value !== undefined));
}

const initialFilters = {
  from_date: `${todayISO().slice(0, 8)}01`,
  to_date: todayISO(),
  supplier_id: '',
  payment_status: '',
  status: '',
  search: '',
};

export default function Purchases() {
  const navigate = useNavigate();
  const { hasPermission } = useAuth();
  const canManagePrices = hasPermission('products.manage');
  const [purchases, setPurchases] = useState([]);
  const [summary, setSummary] = useState({});
  const [suppliers, setSuppliers] = useState([]);
  const [warehouses, setWarehouses] = useState([]);
  const [products, setProducts] = useState([]);
  const [filters, setFilters] = useState(initialFilters);
  const [loading, setLoading] = useState(true);
  const [pageError, setPageError] = useState('');
  const [success, setSuccess] = useState('');

  const [modalOpen, setModalOpen] = useState(false);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [selected, setSelected] = useState(null);

  const [date, setDate] = useState(todayISO());
  const [supplierInvoiceNumber, setSupplierInvoiceNumber] = useState('');
  const [supplierId, setSupplierId] = useState('');
  const [warehouseId, setWarehouseId] = useState('');
  const [receiptStatus, setReceiptStatus] = useState('received');
  const [dueDate, setDueDate] = useState('');
  const [notes, setNotes] = useState('');
  const [items, setItems] = useState([]);
  const [productToAdd, setProductToAdd] = useState('');
  const [discount, setDiscount] = useState(0);
  const [shipping, setShipping] = useState(0);
  const [taxRate, setTaxRate] = useState(0);
  const [paymentType, setPaymentType] = useState('cash');
  const [paymentReference, setPaymentReference] = useState('');
  const [paidAmount, setPaidAmount] = useState('');

  const [paymentTarget, setPaymentTarget] = useState(null);
  const [paymentForm, setPaymentForm] = useState({ amount: '', paying_method: 'cash', paid_on: todayISO(), reference: '', note: '' });
  const [paymentError, setPaymentError] = useState('');
  const [paymentSaving, setPaymentSaving] = useState(false);

  const [receiptTarget, setReceiptTarget] = useState(null);
  const [receiptQuantities, setReceiptQuantities] = useState({});
  const [receiptDate, setReceiptDate] = useState(todayISO());
  const [receiptNote, setReceiptNote] = useState('');
  const [receiptError, setReceiptError] = useState('');
  const [receiptSaving, setReceiptSaving] = useState(false);

  const load = async (nextFilters = filters) => {
    setLoading(true);
    setPageError('');
    try {
      const params = cleanParams({ ...nextFilters, per_page: 200 });
      const [listResponse, summaryResponse] = await Promise.all([
        PurchasesAPI.list(params),
        PurchasesAPI.summary(cleanParams(nextFilters)),
      ]);
      setPurchases(asList(listResponse));
      setSummary(summaryResponse.data.data || {});
    } catch (requestError) {
      setPageError(requestError.response?.data?.message || 'Supplier bills could not be loaded.');
    } finally {
      setLoading(false);
    }
  };

  const loadProducts = async () => {
    const response = await ProductsAPI.list({ per_page: 200 });
    setProducts(asList(response));
  };

  useEffect(() => {
    load(initialFilters);
    Promise.all([
      SuppliersAPI.list({ per_page: 200 }),
      WarehousesAPI.list({ per_page: 200 }),
      ProductsAPI.list({ per_page: 200 }),
    ]).then(([supplierResponse, warehouseResponse, productResponse]) => {
      setSuppliers(asList(supplierResponse));
      setWarehouses(asList(warehouseResponse));
      setProducts(asList(productResponse));
    }).catch((requestError) => {
      setPageError(requestError.response?.data?.message || 'Purchase form data could not be loaded.');
    });
    // Initial load only; filters are applied explicitly by the user.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const applyFilters = (event) => {
    event.preventDefault();
    load(filters);
  };

  const clearFilters = () => {
    setFilters(initialFilters);
    load(initialFilters);
  };

  const addItem = () => {
    const product = products.find((row) => String(row.id) === String(productToAdd));
    if (!product) return;
    setItems((previous) => {
      const existingIndex = previous.findIndex((item) => item.product.id === product.id);
      if (existingIndex >= 0) {
        return previous.map((item, index) => index === existingIndex
          ? { ...item, quantity: Number(item.quantity || 0) + 1 }
          : item);
      }
      return [...previous, {
        product,
        quantity: 1,
        product_cost: product.product_cost,
        discount_type: 'none',
        discount_value: 0,
        tax_type: 'none',
        tax_value: 0,
        update_product_cost: false,
        update_selling_price: false,
        new_selling_price: product.product_price,
      }];
    });
    setProductToAdd('');
  };

  const updateItem = (index, patch) => setItems((previous) => previous.map((item, itemIndex) => (itemIndex === index ? { ...item, ...patch } : item)));
  const removeItem = (index) => setItems((previous) => previous.filter((_, itemIndex) => itemIndex !== index));

  const lineTotal = (item) => {
    const total = Number(item.quantity) * Number(item.product_cost);
    const discountAmount = item.discount_type === 'percentage'
      ? (total * Number(item.discount_value || 0)) / 100
      : item.discount_type === 'fixed' ? Number(item.discount_value || 0) : 0;
    const taxedBase = total - discountAmount;
    const taxAmount = item.tax_type === 'exclusive' ? (taxedBase * Number(item.tax_value || 0)) / 100 : 0;
    return taxedBase + taxAmount;
  };

  const subTotal = useMemo(() => items.reduce((sum, item) => sum + lineTotal(item), 0), [items]);
  const orderTax = useMemo(() => ((subTotal - Number(discount || 0)) * Number(taxRate || 0)) / 100, [subTotal, discount, taxRate]);
  const grandTotal = useMemo(() => subTotal - Number(discount || 0) + Number(shipping || 0) + orderTax, [subTotal, discount, shipping, orderTax]);

  const resetForm = () => {
    setDate(todayISO());
    setSupplierInvoiceNumber('');
    setSupplierId('');
    setWarehouseId('');
    setReceiptStatus('received');
    setDueDate('');
    setNotes('');
    setItems([]);
    setDiscount(0);
    setShipping(0);
    setTaxRate(0);
    setPaidAmount('');
    setPaymentType('cash');
    setPaymentReference('');
  };

  const submit = async (event) => {
    event.preventDefault();
    if (saving) return;
    setError('');
    if (!items.length) return setError('Add at least one item.');
    setSaving(true);
    try {
      const response = await PurchasesAPI.create({
        date,
        supplier_invoice_number: supplierInvoiceNumber,
        supplier_id: Number(supplierId),
        warehouse_id: Number(warehouseId),
        status: receiptStatus,
        due_date: dueDate || null,
        notes,
        discount: Number(discount || 0),
        shipping: Number(shipping || 0),
        tax_rate: Number(taxRate || 0),
        payment_type: paymentType,
        payment_reference: paymentReference,
        paid_amount: paidAmount === '' ? undefined : Number(paidAmount),
        items: items.map((item) => ({
          product_id: item.product.id,
          quantity: Number(item.quantity),
          product_cost: Number(item.product_cost),
          discount_type: item.discount_type,
          discount_value: Number(item.discount_value || 0),
          tax_type: item.tax_type,
          tax_value: Number(item.tax_value || 0),
          update_product_cost: receiptStatus === 'received' && canManagePrices && Boolean(item.update_product_cost),
          update_selling_price: receiptStatus === 'received' && canManagePrices && Boolean(item.update_selling_price),
          new_selling_price: receiptStatus === 'received' && canManagePrices && item.update_selling_price ? Number(item.new_selling_price) : undefined,
        })),
      });
      setModalOpen(false);
      resetForm();
      setSuccess(response.data.message || 'Supplier bill saved.');
      await Promise.all([load(filters), loadProducts()]);
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Failed to save supplier bill.');
    } finally {
      setSaving(false);
    }
  };

  const openDetails = async (purchase) => {
    setSelected(purchase);
    try {
      const response = await PurchasesAPI.get(purchase.id);
      setSelected(response.data.data);
    } catch (requestError) {
      setPageError(requestError.response?.data?.message || 'Purchase details could not be refreshed.');
    }
  };

  const refreshPurchase = async (id) => {
    await load(filters);
    const response = await PurchasesAPI.get(id);
    setSelected(response.data.data);
    return response.data.data;
  };

  const openPayment = (purchase) => {
    setPaymentTarget(purchase);
    setPaymentForm({ amount: String(outstanding(purchase).toFixed(2)), paying_method: 'cash', paid_on: todayISO(), reference: '', note: '' });
    setPaymentError('');
  };

  const submitPayment = async (event) => {
    event.preventDefault();
    if (paymentSaving) return;
    setPaymentSaving(true);
    setPaymentError('');
    try {
      const response = await PurchasesAPI.addPayment(paymentTarget.id, { ...paymentForm, amount: Number(paymentForm.amount) });
      setPaymentTarget(null);
      setSuccess(response.data.message || 'Supplier payment recorded.');
      await refreshPurchase(paymentTarget.id);
    } catch (requestError) {
      setPaymentError(requestError.response?.data?.message || 'Payment could not be recorded.');
    } finally {
      setPaymentSaving(false);
    }
  };

  const openReceipt = (purchase) => {
    setReceiptTarget(purchase);
    setReceiptQuantities(Object.fromEntries((purchase.items || []).map((item) => [item.id, ''])));
    setReceiptDate(todayISO());
    setReceiptNote('');
    setReceiptError('');
  };

  const fillRemaining = () => {
    setReceiptQuantities(Object.fromEntries((receiptTarget?.items || []).map((item) => [
      item.id,
      String(Math.max(0, Number(item.quantity || 0) - Number(item.received_quantity || 0))),
    ])));
  };

  const submitReceipt = async (event) => {
    event.preventDefault();
    if (receiptSaving) return;
    const receiptItems = (receiptTarget.items || []).map((item) => ({
      purchase_item_id: item.id,
      quantity: Number(receiptQuantities[item.id] || 0),
    })).filter((item) => item.quantity > 0);
    if (!receiptItems.length) return setReceiptError('Enter a received quantity for at least one product.');
    setReceiptSaving(true);
    setReceiptError('');
    try {
      const response = await PurchasesAPI.receive(receiptTarget.id, { date: receiptDate, note: receiptNote, items: receiptItems });
      setReceiptTarget(null);
      setSuccess(response.data.message || 'Goods receipt saved.');
      await Promise.all([refreshPurchase(receiptTarget.id), loadProducts()]);
    } catch (requestError) {
      setReceiptError(requestError.response?.data?.message || 'Goods receipt could not be saved.');
    } finally {
      setReceiptSaving(false);
    }
  };

  const isOverdue = (purchase) => outstanding(purchase) > 0.005 && purchase.due_date && purchase.due_date < todayISO();

  return (
    <div className="space-y-5">
      <PageHeader title="Supplier Bills & Goods Receiving" subtitle="Record supplier invoices, receive stock in one or more deliveries, and track every partial payment." actions={<Button onClick={() => { setError(''); setModalOpen(true); }}>+ New Supplier Bill</Button>} />

      {success && <div className="rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{success}</div>}
      {pageError && <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{pageError}</div>}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Card className="p-4"><div className="text-xs text-graphite-500">Bills in period</div><div className="mt-1 font-display text-xl font-semibold">{summary.bill_count || 0}</div><div className="text-xs text-graphite-400">Net {formatMoney(summary.net_billed_total || 0)} after returns</div></Card>
        <Card className="p-4"><div className="text-xs text-graphite-500">Paid in period</div><div className="mt-1 font-display text-xl font-semibold text-emerald-700">{formatMoney(summary.paid_total || 0)}</div><div className="text-xs text-graphite-400">Supplier credit {formatMoney(summary.supplier_credit_total || 0)}</div></Card>
        <Card className="p-4"><div className="text-xs text-graphite-500">Outstanding</div><div className="mt-1 font-display text-xl font-semibold text-amber-700">{formatMoney(summary.outstanding_total || 0)}</div><div className="text-xs text-graphite-400">{summary.unpaid_bill_count || 0} open bill(s)</div></Card>
        <Card className="p-4"><div className="text-xs text-graphite-500">Overdue</div><div className="mt-1 font-display text-xl font-semibold text-red-700">{formatMoney(summary.overdue_total || 0)}</div><div className="text-xs text-graphite-400">{summary.overdue_bill_count || 0} overdue bill(s)</div></Card>
      </div>

      <Card className="p-4">
        <form onSubmit={applyFilters} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-7 gap-3 items-end">
          <Field label="From"><input type="date" className={inputClass} value={filters.from_date} onChange={(event) => setFilters({ ...filters, from_date: event.target.value })} /></Field>
          <Field label="To"><input type="date" className={inputClass} value={filters.to_date} onChange={(event) => setFilters({ ...filters, to_date: event.target.value })} /></Field>
          <Field label="Supplier"><select className={inputClass} value={filters.supplier_id} onChange={(event) => setFilters({ ...filters, supplier_id: event.target.value })}><option value="">All</option>{suppliers.map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.name}</option>)}</select></Field>
          <Field label="Payment"><select className={inputClass} value={filters.payment_status} onChange={(event) => setFilters({ ...filters, payment_status: event.target.value })}><option value="">All</option><option value="unpaid">Unpaid</option><option value="partial">Partial</option><option value="paid">Paid</option></select></Field>
          <Field label="Receiving"><select className={inputClass} value={filters.status} onChange={(event) => setFilters({ ...filters, status: event.target.value })}><option value="">All</option><option value="pending">Legacy pending</option><option value="ordered">Ordered</option><option value="partially_received">Partially received</option><option value="received">Received</option><option value="cancelled">Cancelled</option></select></Field>
          <Field label="Reference"><input className={inputClass} value={filters.search} onChange={(event) => setFilters({ ...filters, search: event.target.value })} placeholder="POS or supplier ref" /></Field>
          <div className="flex gap-2"><Button type="submit">Apply</Button><Button type="button" variant="secondary" onClick={clearFilters}>Reset</Button></div>
        </form>
      </Card>

      <Card className="overflow-x-auto">
        <table className="w-full text-sm min-w-[1040px]">
          <thead><tr className="border-b border-slate-200 text-left text-graphite-600">
            <th className="px-4 py-3 font-medium">POS Ref</th><th className="px-4 py-3 font-medium">Supplier Bill</th><th className="px-4 py-3 font-medium">Date</th>
            <th className="px-4 py-3 font-medium">Supplier</th><th className="px-4 py-3 font-medium text-right">Total</th><th className="px-4 py-3 font-medium text-right">Outstanding</th>
            <th className="px-4 py-3 font-medium">Receiving</th><th className="px-4 py-3 font-medium">Payment / Due</th><th className="px-4 py-3 font-medium text-right">Output</th>
          </tr></thead>
          <tbody>
            {loading && <tr><td colSpan={9} className="px-4 py-6 text-center text-graphite-500">Loading…</td></tr>}
            {!loading && purchases.length === 0 && <tr><td colSpan={9} className="px-4 py-6 text-center text-graphite-500">No supplier bills match this period and filters.</td></tr>}
            {!loading && purchases.map((purchase) => (
              <tr key={purchase.id} className="border-b border-slate-100 hover:bg-slate-50 cursor-pointer" onClick={() => openDetails(purchase)}>
                <td className="px-4 py-2.5 font-mono text-xs">{purchase.reference_code}</td>
                <td className="px-4 py-2.5 font-mono text-xs">{purchase.supplier_invoice_number || '—'}</td>
                <td className="px-4 py-2.5">{formatDate(purchase.date)}</td>
                <td className="px-4 py-2.5">{purchase.Supplier?.name}</td>
                <td className="px-4 py-2.5 text-right">{formatMoney(purchase.grand_total)}</td>
                <td className={`px-4 py-2.5 text-right font-medium ${outstanding(purchase) > 0.005 ? 'text-amber-700' : 'text-emerald-700'}`}>{formatMoney(outstanding(purchase))}</td>
                <td className="px-4 py-2.5 capitalize">{human(purchase.status)}</td>
                <td className="px-4 py-2.5"><div className="capitalize">{purchase.payment_status}</div>{purchase.due_date && purchase.payment_status !== 'paid' && <div className={`text-[11px] ${isOverdue(purchase) ? 'text-red-700 font-medium' : 'text-graphite-400'}`}>{isOverdue(purchase) ? 'Overdue ' : 'Due '}{formatDate(purchase.due_date)}</div>}</td>
                <td className="px-4 py-2.5"><div className="flex justify-end" onClick={(event) => event.stopPropagation()}><DocumentActions type="purchase" record={purchase} compact /></div></td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <Modal open={modalOpen} onClose={() => !saving && setModalOpen(false)} title="New Supplier Bill" width="max-w-5xl">
        <form onSubmit={submit}>
          {error && <div className="mb-3 text-sm text-red-600 bg-red-50 border border-red-100 rounded-md px-3 py-2">{error}</div>}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-3">
            <Field label="Bill date"><input type="date" required className={inputClass} value={date} onChange={(event) => setDate(event.target.value)} /></Field>
            <Field label="Supplier"><select required className={inputClass} value={supplierId} onChange={(event) => setSupplierId(event.target.value)}><option value="">Select…</option>{suppliers.map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.name}</option>)}</select></Field>
            <Field label="Supplier invoice number"><input className={inputClass} maxLength={100} value={supplierInvoiceNumber} onChange={(event) => setSupplierInvoiceNumber(event.target.value)} placeholder="e.g. INV-4582" /></Field>
            <Field label="Warehouse"><select required className={inputClass} value={warehouseId} onChange={(event) => setWarehouseId(event.target.value)}><option value="">Select…</option>{warehouses.map((warehouse) => <option key={warehouse.id} value={warehouse.id}>{warehouse.name}</option>)}</select></Field>
            <Field label="Goods status"><select className={inputClass} value={receiptStatus} onChange={(event) => setReceiptStatus(event.target.value)}><option value="received">Received now — add all to stock</option><option value="ordered">Ordered / bill only — receive later</option></select></Field>
            <Field label="Due date" hint="Leave blank to use the supplier's default terms."><input type="date" className={inputClass} value={dueDate} onChange={(event) => setDueDate(event.target.value)} /></Field>
          </div>

          {receiptStatus !== 'received' && <div className="mb-3 rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-800">Saving this bill will not change stock. Use “Receive goods” from the bill details when a delivery arrives.</div>}

          <div className="flex gap-2 mb-3">
            <select className={inputClass} value={productToAdd} onChange={(event) => setProductToAdd(event.target.value)}><option value="">Add a product…</option>{products.map((product) => <option key={product.id} value={product.id}>{product.name} ({product.code})</option>)}</select>
            <Button type="button" variant="secondary" onClick={addItem}>Add</Button>
          </div>

          <div className="space-y-3 mb-4 max-h-[42vh] overflow-y-auto pr-1">
            {items.length === 0 && <div className="rounded-md border border-slate-200 p-3 text-sm text-graphite-500">No items added.</div>}
            {items.map((item, index) => {
              const costDifference = differencePercent(item.product.product_cost, item.product_cost);
              const costChanged = Number(item.product_cost) !== Number(item.product.product_cost);
              const newMargin = Number(item.new_selling_price || item.product.product_price) - Number(item.product_cost || 0);
              return (
                <div key={item.product.id} className="rounded-lg border border-slate-200 p-3 text-sm">
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="flex-1 min-w-[180px]"><div className="font-medium">{item.product.name}</div><div className="text-xs text-graphite-400">Current cost {formatMoney(item.product.product_cost)} · selling {formatMoney(item.product.product_price)}</div></div>
                    <input aria-label="Quantity" type="number" min="0.000001" step="any" className={`${inputClass} w-20 py-1`} value={item.quantity} onChange={(event) => updateItem(index, { quantity: event.target.value })} />
                    <span>×</span>
                    <input aria-label="Purchase cost" type="number" min="0" step="any" className={`${inputClass} w-28 py-1`} value={item.product_cost} onChange={(event) => updateItem(index, { product_cost: event.target.value })} />
                    <span className="w-28 text-right font-medium">{formatMoney(lineTotal(item))}</span>
                    <button type="button" onClick={() => removeItem(index)} className="text-red-600 text-xs">Remove</button>
                  </div>

                  {costChanged && receiptStatus === 'received' && (
                    <div className="mt-3 rounded-md border border-amber-200 bg-amber-50 p-3">
                      <div className="text-xs font-medium text-amber-900">Supplier cost changed {costDifference === null ? '' : `(${costDifference > 0 ? '+' : ''}${costDifference.toFixed(1)}%)`}</div>
                      {canManagePrices ? (
                        <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <label className="flex items-start gap-2 text-xs text-amber-900"><input type="checkbox" className="mt-0.5" checked={item.update_product_cost} onChange={(event) => updateItem(index, { update_product_cost: event.target.checked })} /><span>Update saved product cost to <strong>{formatMoney(item.product_cost)}</strong>.</span></label>
                          <div><label className="flex items-center gap-2 text-xs text-amber-900 mb-1"><input type="checkbox" checked={item.update_selling_price} onChange={(event) => updateItem(index, { update_selling_price: event.target.checked })} />Change selling price too</label>{item.update_selling_price && <input type="number" min="0" step="any" className={`${inputClass} py-1`} value={item.new_selling_price} onChange={(event) => updateItem(index, { new_selling_price: event.target.value })} />}</div>
                          {(item.update_product_cost || item.update_selling_price) && <div className={`sm:col-span-2 text-xs ${newMargin < 0 ? 'text-red-700' : 'text-emerald-700'}`}>Resulting unit margin: <strong>{formatMoney(newMargin)}</strong>{newMargin < 0 ? ' — selling below cost.' : ''}</div>}
                        </div>
                      ) : <p className="text-xs text-amber-800 mt-1">Your role can record this bill but cannot change catalogue prices.</p>}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm mb-2">
            <Field label="Discount"><input type="number" min="0" step="any" className={inputClass} value={discount} onChange={(event) => setDiscount(event.target.value)} /></Field>
            <Field label="Shipping"><input type="number" min="0" step="any" className={inputClass} value={shipping} onChange={(event) => setShipping(event.target.value)} /></Field>
            <Field label="Tax %"><input type="number" min="0" step="any" className={inputClass} value={taxRate} onChange={(event) => setTaxRate(event.target.value)} /></Field>
            <Field label="Initial payment"><select className={inputClass} value={paymentType} onChange={(event) => setPaymentType(event.target.value)}><option value="cash">Cash</option><option value="card">Card</option><option value="bank_transfer">Bank transfer</option><option value="cheque">Cheque</option><option value="credit">Credit / no payment</option></select></Field>
            <Field label={`Paid now (bill total ${grandTotal.toFixed(2)})`} hint="Leave blank for full payment, or zero for unpaid."><input type="number" min="0" max={Math.max(0, grandTotal)} step="any" className={inputClass} value={paidAmount} onChange={(event) => setPaidAmount(event.target.value)} /></Field>
            <Field label="Payment reference"><input className={inputClass} maxLength={150} value={paymentReference} onChange={(event) => setPaymentReference(event.target.value)} placeholder="Cheque / bank reference" /></Field>
            <div className="sm:col-span-2"><Field label="Bill notes"><input className={inputClass} maxLength={5000} value={notes} onChange={(event) => setNotes(event.target.value)} /></Field></div>
          </div>

          <div className="text-right font-display font-semibold text-lg mb-3">Total: <span className="text-copper-600">{formatMoney(grandTotal)}</span></div>
          <div className="flex justify-end gap-2"><Button type="button" variant="secondary" disabled={saving} onClick={() => setModalOpen(false)}>Cancel</Button><Button type="submit" disabled={saving}>{saving ? 'Saving…' : 'Save Supplier Bill'}</Button></div>
        </form>
      </Modal>

      <Modal open={!!selected} onClose={() => setSelected(null)} title={`Supplier bill ${selected?.reference_code || ''}`} width="max-w-4xl">
        {selected && (
          <div className="text-sm space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 rounded-md bg-slate-50 p-3 text-graphite-600">
              <div><div className="text-xs text-graphite-400">Bill date</div>{formatDate(selected.date)}</div>
              <div><div className="text-xs text-graphite-400">Supplier invoice</div>{selected.supplier_invoice_number || '—'}</div>
              <div><div className="text-xs text-graphite-400">Supplier</div>{selected.Supplier?.name}</div>
              <div><div className="text-xs text-graphite-400">Warehouse</div>{selected.Warehouse?.name}</div>
              <div><div className="text-xs text-graphite-400">Receiving</div><span className="capitalize">{human(selected.status)}</span></div>
              <div><div className="text-xs text-graphite-400">Payment</div><span className="capitalize">{selected.payment_status}</span></div>
              <div><div className="text-xs text-graphite-400">Due date</div><span className={isOverdue(selected) ? 'text-red-700 font-medium' : ''}>{selected.due_date ? formatDate(selected.due_date) : '—'}</span></div>
              <div><div className="text-xs text-graphite-400">Outstanding</div><span className="font-semibold text-amber-700">{formatMoney(outstanding(selected))}</span></div>
            </div>

            <div className="overflow-x-auto rounded-md border border-slate-200">
              <table className="w-full min-w-[680px]"><thead><tr className="text-left text-graphite-500 bg-slate-50"><th className="p-2">Item</th><th className="p-2 text-right">Ordered</th><th className="p-2 text-right">Received</th><th className="p-2 text-right">Remaining</th><th className="p-2 text-right">Cost</th><th className="p-2 text-right">Total</th></tr></thead>
                <tbody>{(selected.items || []).map((item) => <tr key={item.id} className="border-t border-slate-100"><td className="p-2">{item.Product?.name}</td><td className="p-2 text-right">{item.quantity}</td><td className="p-2 text-right">{item.received_quantity || 0}</td><td className="p-2 text-right">{Math.max(0, Number(item.quantity) - Number(item.received_quantity || 0))}</td><td className="p-2 text-right">{formatMoney(item.product_cost)}</td><td className="p-2 text-right">{formatMoney(item.sub_total)}</td></tr>)}</tbody>
              </table>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 border-t border-slate-200 pt-3">
              <div><div className="text-xs text-graphite-400">Total</div><div className="font-semibold">{formatMoney(selected.grand_total)}</div></div>
              <div><div className="text-xs text-graphite-400">Return credits</div><div className="font-semibold">{formatMoney(selected.returned_amount || 0)}</div></div>
              <div><div className="text-xs text-graphite-400">Paid</div><div className="font-semibold text-emerald-700">{formatMoney(selected.paid_amount)}</div></div>
              <div><div className="text-xs text-graphite-400">{supplierCredit(selected) > 0.005 ? 'Supplier owes/refunds' : 'Outstanding'}</div><div className={`font-semibold ${supplierCredit(selected) > 0.005 ? 'text-blue-700' : 'text-amber-700'}`}>{formatMoney(supplierCredit(selected) > 0.005 ? supplierCredit(selected) : outstanding(selected))}</div></div>
              <div><div className="text-xs text-graphite-400">Units received</div><div className="font-semibold">{receivedTotal(selected)}</div></div>
            </div>

            <div>
              <h3 className="font-display font-semibold mb-2">Payment history</h3>
              {(selected.payments || []).length === 0 ? <p className="text-graphite-500">No payments recorded.</p> : (
                <div className="overflow-x-auto rounded-md border border-slate-200"><table className="w-full min-w-[620px]"><thead><tr className="bg-slate-50 text-left text-graphite-500"><th className="p-2">Date</th><th className="p-2">Method</th><th className="p-2">Reference</th><th className="p-2">Recorded by</th><th className="p-2 text-right">Amount</th></tr></thead><tbody>{selected.payments.map((payment) => <tr key={payment.id} className="border-t border-slate-100"><td className="p-2">{formatDate(payment.paid_on)}</td><td className="p-2 capitalize">{human(payment.paying_method)}</td><td className="p-2">{payment.reference || '—'}</td><td className="p-2">{payment.createdBy?.name || 'System'}</td><td className="p-2 text-right font-medium">{formatMoney(payment.amount)}</td></tr>)}</tbody></table></div>
              )}
            </div>

            {selected.notes && <div className="rounded-md border border-slate-200 p-3 whitespace-pre-wrap"><span className="text-graphite-400">Notes: </span>{selected.notes}</div>}
            <div className="pt-3 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2">
              <DocumentActions type="purchase" record={selected} />
              <div className="flex flex-wrap gap-2 justify-end">
                {selected.status !== 'cancelled' && selected.status !== 'received' && <Button type="button" variant="secondary" onClick={() => openReceipt(selected)}>Receive Goods</Button>}
                {selected.status !== 'cancelled' && outstanding(selected) > 0.005 && <Button type="button" variant="secondary" onClick={() => openPayment(selected)}>Add Payment</Button>}
                {receivedTotal(selected) > 0 && <Button type="button" onClick={() => navigate(`/returns?purchase_id=${selected.id}`)}>Supplier Return</Button>}
              </div>
            </div>
          </div>
        )}
      </Modal>

      <Modal open={!!paymentTarget} onClose={() => !paymentSaving && setPaymentTarget(null)} title={`Pay supplier bill ${paymentTarget?.reference_code || ''}`} width="max-w-xl">
        {paymentTarget && <form onSubmit={submitPayment} className="space-y-3">
          {paymentError && <div className="rounded-md border border-red-100 bg-red-50 px-3 py-2 text-sm text-red-700">{paymentError}</div>}
          <div className="rounded-md bg-slate-50 p-3 text-sm">Outstanding before payment: <strong>{formatMoney(outstanding(paymentTarget))}</strong></div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Amount"><input required type="number" min="0.01" max={outstanding(paymentTarget)} step="any" className={inputClass} value={paymentForm.amount} onChange={(event) => setPaymentForm({ ...paymentForm, amount: event.target.value })} /></Field>
            <Field label="Payment date"><input required type="date" className={inputClass} value={paymentForm.paid_on} onChange={(event) => setPaymentForm({ ...paymentForm, paid_on: event.target.value })} /></Field>
            <Field label="Method"><select className={inputClass} value={paymentForm.paying_method} onChange={(event) => setPaymentForm({ ...paymentForm, paying_method: event.target.value })}><option value="cash">Cash</option><option value="card">Card</option><option value="bank_transfer">Bank transfer</option><option value="cheque">Cheque</option><option value="other">Other</option></select></Field>
            <Field label="Reference"><input className={inputClass} maxLength={150} value={paymentForm.reference} onChange={(event) => setPaymentForm({ ...paymentForm, reference: event.target.value })} /></Field>
          </div>
          <Field label="Note"><textarea rows={2} className={inputClass} maxLength={1000} value={paymentForm.note} onChange={(event) => setPaymentForm({ ...paymentForm, note: event.target.value })} /></Field>
          <div className="flex justify-end gap-2"><Button type="button" variant="secondary" disabled={paymentSaving} onClick={() => setPaymentTarget(null)}>Cancel</Button><Button type="submit" disabled={paymentSaving}>{paymentSaving ? 'Saving…' : 'Record Payment'}</Button></div>
        </form>}
      </Modal>

      <Modal open={!!receiptTarget} onClose={() => !receiptSaving && setReceiptTarget(null)} title={`Receive goods for ${receiptTarget?.reference_code || ''}`} width="max-w-3xl">
        {receiptTarget && <form onSubmit={submitReceipt} className="space-y-4">
          {receiptError && <div className="rounded-md border border-red-100 bg-red-50 px-3 py-2 text-sm text-red-700">{receiptError}</div>}
          <div className="flex flex-wrap gap-3 items-end"><Field label="Receipt date"><input required type="date" className={inputClass} value={receiptDate} onChange={(event) => setReceiptDate(event.target.value)} /></Field><Button type="button" variant="secondary" onClick={fillRemaining}>Fill All Remaining</Button></div>
          <div className="overflow-x-auto rounded-md border border-slate-200"><table className="w-full min-w-[620px] text-sm"><thead><tr className="bg-slate-50 text-left text-graphite-500"><th className="p-2">Product</th><th className="p-2 text-right">Ordered</th><th className="p-2 text-right">Received</th><th className="p-2 text-right">Remaining</th><th className="p-2 w-36">Receive now</th></tr></thead><tbody>{(receiptTarget.items || []).map((item) => {
            const remaining = Math.max(0, Number(item.quantity || 0) - Number(item.received_quantity || 0));
            return <tr key={item.id} className="border-t border-slate-100"><td className="p-2">{item.Product?.name}</td><td className="p-2 text-right">{item.quantity}</td><td className="p-2 text-right">{item.received_quantity || 0}</td><td className="p-2 text-right font-medium">{remaining}</td><td className="p-2"><input type="number" min="0" max={remaining} step="any" disabled={remaining <= 0} className={`${inputClass} py-1 disabled:bg-slate-100`} value={receiptQuantities[item.id] ?? ''} onChange={(event) => setReceiptQuantities({ ...receiptQuantities, [item.id]: event.target.value })} /></td></tr>;
          })}</tbody></table></div>
          <Field label="Delivery note / remarks"><textarea rows={2} maxLength={1000} className={inputClass} value={receiptNote} onChange={(event) => setReceiptNote(event.target.value)} placeholder="Optional delivery reference, damaged/missing package note, etc." /></Field>
          <div className="flex justify-end gap-2"><Button type="button" variant="secondary" disabled={receiptSaving} onClick={() => setReceiptTarget(null)}>Cancel</Button><Button type="submit" disabled={receiptSaving}>{receiptSaving ? 'Receiving…' : 'Receive and Update Stock'}</Button></div>
        </form>}
      </Modal>
    </div>
  );
}
