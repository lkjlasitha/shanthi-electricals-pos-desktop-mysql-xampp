import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PurchasesAPI, SuppliersAPI, WarehousesAPI, ProductsAPI } from '../../api/endpoints';
import { Button, PageHeader, Modal, Card, Field, inputClass } from '../../components/ui.jsx';
import { formatMoney, formatDate, todayISO } from '../../utils/format';
import DocumentActions from '../../components/DocumentActions.jsx';
import { useAuth } from '../../context/AuthContext.jsx';

function differencePercent(oldValue, newValue) {
  const oldNumber = Number(oldValue || 0);
  const newNumber = Number(newValue || 0);
  if (oldNumber === newNumber) return 0;
  if (oldNumber === 0) return null;
  return ((newNumber - oldNumber) / oldNumber) * 100;
}

export default function Purchases() {
  const navigate = useNavigate();
  const { hasPermission } = useAuth();
  const canManagePrices = hasPermission('products.manage');
  const [purchases, setPurchases] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [warehouses, setWarehouses] = useState([]);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState(null);

  const [date, setDate] = useState(todayISO());
  const [supplierId, setSupplierId] = useState('');
  const [warehouseId, setWarehouseId] = useState('');
  const [items, setItems] = useState([]);
  const [productToAdd, setProductToAdd] = useState('');
  const [discount, setDiscount] = useState(0);
  const [shipping, setShipping] = useState(0);
  const [taxRate, setTaxRate] = useState(0);
  const [paymentType, setPaymentType] = useState('cash');
  const [paidAmount, setPaidAmount] = useState('');

  const load = () => {
    setLoading(true);
    PurchasesAPI.list({ per_page: 50 }).then((response) => setPurchases(response.data.data || response.data)).finally(() => setLoading(false));
  };

  const loadProducts = () => ProductsAPI.list({ per_page: 200 }).then((response) => setProducts(response.data.data || response.data));

  useEffect(() => {
    load();
    SuppliersAPI.list({ per_page: 200 }).then((response) => setSuppliers(response.data.data || response.data));
    WarehousesAPI.list({ per_page: 200 }).then((response) => setWarehouses(response.data.data || response.data));
    loadProducts();
  }, []);

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
    setDate(todayISO()); setSupplierId(''); setWarehouseId(''); setItems([]);
    setDiscount(0); setShipping(0); setTaxRate(0); setPaidAmount(''); setPaymentType('cash');
  };

  const submit = async (event) => {
    event.preventDefault();
    setError('');
    if (!items.length) return setError('Add at least one item.');
    try {
      await PurchasesAPI.create({
        date,
        supplier_id: Number(supplierId),
        warehouse_id: Number(warehouseId),
        discount: Number(discount || 0),
        shipping: Number(shipping || 0),
        tax_rate: Number(taxRate || 0),
        payment_type: paymentType,
        paid_amount: paidAmount === '' ? grandTotal : Number(paidAmount),
        items: items.map((item) => ({
          product_id: item.product.id,
          quantity: Number(item.quantity),
          product_cost: Number(item.product_cost),
          discount_type: item.discount_type,
          discount_value: Number(item.discount_value || 0),
          tax_type: item.tax_type,
          tax_value: Number(item.tax_value || 0),
          update_product_cost: canManagePrices && Boolean(item.update_product_cost),
          update_selling_price: canManagePrices && Boolean(item.update_selling_price),
          new_selling_price: canManagePrices && item.update_selling_price ? Number(item.new_selling_price) : undefined,
        })),
      });
      setModalOpen(false);
      resetForm();
      load();
      loadProducts();
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Failed to save purchase');
    }
  };

  return (
    <div>
      <PageHeader title="Purchases" subtitle="Receive supplier stock and optionally update the catalogue cost and selling prices." actions={<Button onClick={() => setModalOpen(true)}>+ New Purchase</Button>} />
      <Card className="overflow-x-auto">
        <table className="w-full text-sm min-w-[760px]">
          <thead><tr className="border-b border-slate-200 text-left text-graphite-600">
            <th className="px-4 py-3 font-medium">Ref</th><th className="px-4 py-3 font-medium">Date</th>
            <th className="px-4 py-3 font-medium">Supplier</th><th className="px-4 py-3 font-medium">Warehouse</th>
            <th className="px-4 py-3 font-medium">Total</th><th className="px-4 py-3 font-medium">Payment</th><th className="px-4 py-3 font-medium text-right">Output</th>
          </tr></thead>
          <tbody>
            {loading && <tr><td colSpan={7} className="px-4 py-6 text-center text-graphite-500">Loading…</td></tr>}
            {!loading && purchases.length === 0 && <tr><td colSpan={7} className="px-4 py-6 text-center text-graphite-500">No purchases yet.</td></tr>}
            {!loading && purchases.map((purchase) => (
              <tr key={purchase.id} className="border-b border-slate-100 hover:bg-slate-50 cursor-pointer" onClick={() => setSelected(purchase)}>
                <td className="px-4 py-2.5 font-mono text-xs">{purchase.reference_code}</td>
                <td className="px-4 py-2.5">{formatDate(purchase.date)}</td>
                <td className="px-4 py-2.5">{purchase.Supplier?.name}</td>
                <td className="px-4 py-2.5">{purchase.Warehouse?.name}</td>
                <td className="px-4 py-2.5">{formatMoney(purchase.grand_total)}</td>
                <td className="px-4 py-2.5 capitalize">{purchase.payment_status}</td>
                <td className="px-4 py-2.5"><div className="flex justify-end"><DocumentActions type="purchase" record={purchase} compact /></div></td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="New Purchase" width="max-w-4xl">
        <form onSubmit={submit}>
          {error && <div className="mb-3 text-sm text-red-600 bg-red-50 border border-red-100 rounded-md px-3 py-2">{error}</div>}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-3">
            <Field label="Date"><input type="date" required className={inputClass} value={date} onChange={(event) => setDate(event.target.value)} /></Field>
            <Field label="Supplier"><select required className={inputClass} value={supplierId} onChange={(event) => setSupplierId(event.target.value)}><option value="">Select…</option>{suppliers.map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.name}</option>)}</select></Field>
            <Field label="Warehouse"><select required className={inputClass} value={warehouseId} onChange={(event) => setWarehouseId(event.target.value)}><option value="">Select…</option>{warehouses.map((warehouse) => <option key={warehouse.id} value={warehouse.id}>{warehouse.name}</option>)}</select></Field>
          </div>

          <div className="flex gap-2 mb-3">
            <select className={inputClass} value={productToAdd} onChange={(event) => setProductToAdd(event.target.value)}><option value="">Add a product…</option>{products.map((product) => <option key={product.id} value={product.id}>{product.name} ({product.code})</option>)}</select>
            <Button type="button" variant="secondary" onClick={addItem}>Add</Button>
          </div>

          <div className="space-y-3 mb-4 max-h-[45vh] overflow-y-auto pr-1">
            {items.length === 0 && <div className="rounded-md border border-slate-200 p-3 text-sm text-graphite-500">No items added.</div>}
            {items.map((item, index) => {
              const costDifference = differencePercent(item.product.product_cost, item.product_cost);
              const costChanged = Number(item.product_cost) !== Number(item.product.product_cost);
              const newMargin = Number(item.new_selling_price || item.product.product_price) - Number(item.product_cost || 0);
              return (
                <div key={item.product.id} className="rounded-lg border border-slate-200 p-3 text-sm">
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="flex-1 min-w-[180px]"><div className="font-medium">{item.product.name}</div><div className="text-xs text-graphite-400">Current cost {formatMoney(item.product.product_cost)} · selling {formatMoney(item.product.product_price)}</div></div>
                    <input aria-label="Quantity" type="number" min="0.01" step="any" className={`${inputClass} w-20 py-1`} value={item.quantity} onChange={(event) => updateItem(index, { quantity: event.target.value })} />
                    <span>×</span>
                    <input aria-label="Purchase cost" type="number" min="0" step="any" className={`${inputClass} w-28 py-1`} value={item.product_cost} onChange={(event) => updateItem(index, { product_cost: event.target.value })} />
                    <span className="w-28 text-right font-medium">{formatMoney(lineTotal(item))}</span>
                    <button type="button" onClick={() => removeItem(index)} className="text-red-600 text-xs">Remove</button>
                  </div>

                  {costChanged && (
                    <div className="mt-3 rounded-md border border-amber-200 bg-amber-50 p-3">
                      <div className="text-xs font-medium text-amber-900">Supplier cost changed {costDifference === null ? '' : `(${costDifference > 0 ? '+' : ''}${costDifference.toFixed(1)}%)`}</div>
                      {canManagePrices ? (
                        <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <label className="flex items-start gap-2 text-xs text-amber-900">
                            <input type="checkbox" className="mt-0.5" checked={item.update_product_cost} onChange={(event) => updateItem(index, { update_product_cost: event.target.checked })} />
                            <span>Update the saved product cost from {formatMoney(item.product.product_cost)} to <strong>{formatMoney(item.product_cost)}</strong>.</span>
                          </label>
                          <div>
                            <label className="flex items-center gap-2 text-xs text-amber-900 mb-1">
                              <input type="checkbox" checked={item.update_selling_price} onChange={(event) => updateItem(index, { update_selling_price: event.target.checked })} />
                              Change the selling price too
                            </label>
                            {item.update_selling_price && <input type="number" min="0" step="any" className={`${inputClass} py-1`} value={item.new_selling_price} onChange={(event) => updateItem(index, { new_selling_price: event.target.value })} />}
                          </div>
                          {(item.update_product_cost || item.update_selling_price) && <div className={`sm:col-span-2 text-xs ${newMargin < 0 ? 'text-red-700' : 'text-emerald-700'}`}>Resulting margin using the entered purchase cost: <strong>{formatMoney(newMargin)}</strong>{newMargin < 0 ? ' — selling below cost.' : ''}</div>}
                        </div>
                      ) : <p className="text-xs text-amber-800 mt-1">Your role can record this purchase but cannot change the product catalogue price.</p>}
                    </div>
                  )}

                  {!costChanged && canManagePrices && (
                    <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-graphite-600">
                      <label className="flex items-center gap-2"><input type="checkbox" checked={item.update_selling_price} onChange={(event) => updateItem(index, { update_selling_price: event.target.checked })} />Change selling price</label>
                      {item.update_selling_price && <input type="number" min="0" step="any" className={`${inputClass} w-32 py-1`} value={item.new_selling_price} onChange={(event) => updateItem(index, { new_selling_price: event.target.value })} />}
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
            <Field label="Payment"><select className={inputClass} value={paymentType} onChange={(event) => setPaymentType(event.target.value)}><option value="cash">Cash</option><option value="bank_transfer">Bank Transfer</option><option value="cheque">Cheque</option><option value="credit">Credit</option></select></Field>
          </div>
          <Field label={`Paid amount (default: full ${grandTotal.toFixed(2)})`}><input type="number" min="0" step="any" className={inputClass} value={paidAmount} onChange={(event) => setPaidAmount(event.target.value)} /></Field>

          <div className="text-right font-display font-semibold text-lg mb-3">Total: <span className="text-copper-600">{formatMoney(grandTotal)}</span></div>
          <div className="flex justify-end gap-2"><Button type="button" variant="secondary" onClick={() => setModalOpen(false)}>Cancel</Button><Button type="submit">Save Purchase</Button></div>
        </form>
      </Modal>

      <Modal open={!!selected} onClose={() => setSelected(null)} title={`Purchase ${selected?.reference_code || ''}`} width="max-w-2xl">
        {selected && (
          <div className="text-sm space-y-4">
            <div className="grid grid-cols-2 gap-3 text-graphite-600">
              <div><strong>Date:</strong> {formatDate(selected.date)}</div><div><strong>Status:</strong> <span className="capitalize">{selected.status}</span></div>
              <div><strong>Supplier:</strong> {selected.Supplier?.name}</div><div><strong>Warehouse:</strong> {selected.Warehouse?.name}</div>
            </div>
            <table className="w-full"><thead><tr className="text-left text-graphite-500 border-b border-slate-100"><th className="py-2">Item</th><th className="py-2 text-right">Qty</th><th className="py-2 text-right">Cost</th><th className="py-2 text-right">Total</th></tr></thead>
              <tbody>{(selected.items || []).map((item) => <tr key={item.id} className="border-b border-slate-50"><td className="py-2">{item.Product?.name}</td><td className="py-2 text-right">{item.quantity}</td><td className="py-2 text-right">{formatMoney(item.product_cost)}</td><td className="py-2 text-right">{formatMoney(item.sub_total)}</td></tr>)}</tbody>
            </table>
            <div className="flex justify-between pt-2 border-t border-slate-200 font-display font-semibold text-base"><span>Total</span><span className="text-copper-600">{formatMoney(selected.grand_total)}</span></div>
            <div className="pt-3 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2">
              <DocumentActions type="purchase" record={selected} />
              <Button type="button" onClick={() => navigate(`/returns?purchase_id=${selected.id}`)}>Create Supplier Return</Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
