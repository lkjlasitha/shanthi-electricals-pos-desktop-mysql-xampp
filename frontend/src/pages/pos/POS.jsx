import React, { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import { ProductsAPI, CustomersAPI, WarehousesAPI, SalesAPI, QuotationsHoldsAPI, RegisterAPI, CategoriesAPI } from '../../api/endpoints';
import { Button, Card, inputClass } from '../../components/ui.jsx';
import { formatMoney, todayISO } from '../../utils/format';
import { useAuth } from '../../context/AuthContext.jsx';
import DocumentActions from '../../components/DocumentActions.jsx';

export default function POS() {
  const { user } = useAuth();
  const [warehouses, setWarehouses] = useState([]);
  const [warehouseId, setWarehouseId] = useState(user?.warehouse_id || '');
  const [categories, setCategories] = useState([]);
  const [categoryId, setCategoryId] = useState('');
  const [products, setProducts] = useState([]);
  const [search, setSearch] = useState('');
  const [barcode, setBarcode] = useState('');
  const [cart, setCart] = useState([]); // { product, quantity, price }
  const [customers, setCustomers] = useState([]);
  const [customerId, setCustomerId] = useState('');
  const [discount, setDiscount] = useState(0);
  const [taxRate, setTaxRate] = useState(0);
  const [paymentType, setPaymentType] = useState('cash');
  const [receivedAmount, setReceivedAmount] = useState('');
  const [register, setRegister] = useState(null);
  const [message, setMessage] = useState('');
  const [messageType, setMessageType] = useState('error');
  const [lastReceipt, setLastReceipt] = useState(null);
  const barcodeInputRef = useRef(null);

  const focusScanner = useCallback(({ select = false } = {}) => {
    window.requestAnimationFrame(() => {
      const input = barcodeInputRef.current;
      if (!input) return;
      input.focus();
      if (select) input.select();
    });
  }, []);

  useEffect(() => {
    WarehousesAPI.list({ per_page: 100 }).then((res) => setWarehouses(res.data.data || res.data));
    CategoriesAPI.list({ per_page: 100 }).then((res) => setCategories(res.data.data || res.data));
    CustomersAPI.list({ per_page: 200 }).then((res) => setCustomers(res.data.data || res.data));
    RegisterAPI.current().then((res) => setRegister(res.data.data)).catch(() => {});
  }, []);

  useEffect(() => {
    focusScanner();
    const handleShortcut = (event) => {
      if (event.key === 'F8') {
        event.preventDefault();
        focusScanner({ select: true });
      }
    };
    window.addEventListener('keydown', handleShortcut);
    return () => window.removeEventListener('keydown', handleShortcut);
  }, [focusScanner]);

  const loadProducts = useCallback(() => {
    ProductsAPI.list({ search, category_id: categoryId || undefined, per_page: 60 }).then((res) =>
      setProducts(res.data.data || res.data)
    );
  }, [search, categoryId]);

  useEffect(() => { loadProducts(); }, [loadProducts]);

  const addToCart = (product) => {
    setCart((prev) => {
      const existing = prev.find((l) => l.product.id === product.id);
      if (existing) {
        return prev.map((l) => (l.product.id === product.id ? { ...l, quantity: l.quantity + 1 } : l));
      }
      return [...prev, { product, quantity: 1, price: product.product_price, discount_value: 0, discount_type: 'none', tax_value: product.order_tax || 0, tax_type: product.tax_type || 'none' }];
    });
  };

  const scanBarcode = async (event) => {
    event.preventDefault();
    const scannedCode = String(barcode || '').replace(/[\r\n\t]/g, '').trim();
    if (!scannedCode) {
      focusScanner();
      return;
    }

    // Clear immediately so a fast second scan cannot be appended to the first.
    setBarcode('');
    try {
      const response = await ProductsAPI.lookup(scannedCode);
      addToCart(response.data.data);
      setMessage(`${response.data.data.name} added to the cart.`);
      setMessageType('success');
    } catch (error) {
      setMessage(error.response?.data?.message || `No product found for code "${scannedCode}".`);
      setMessageType('error');
    } finally {
      focusScanner();
    }
  };

  const updateLine = (productId, patch) => {
    setCart((prev) => prev.map((l) => (l.product.id === productId ? { ...l, ...patch } : l)));
  };
  const removeLine = (productId) => setCart((prev) => prev.filter((l) => l.product.id !== productId));

  const lineSubtotal = (l) => {
    const lineTotal = Number(l.quantity) * Number(l.price);
    let discountAmount = 0;
    if (l.discount_type === 'percentage') discountAmount = (lineTotal * Number(l.discount_value || 0)) / 100;
    else if (l.discount_type === 'fixed') discountAmount = Number(l.discount_value || 0);
    const taxedBase = lineTotal - discountAmount;
    let taxAmount = 0;
    if (l.tax_type === 'exclusive') taxAmount = (taxedBase * Number(l.tax_value || 0)) / 100;
    return taxedBase + taxAmount;
  };

  const subTotal = useMemo(() => cart.reduce((sum, l) => sum + lineSubtotal(l), 0), [cart]);
  const orderTaxAmount = useMemo(() => ((subTotal - Number(discount || 0)) * Number(taxRate || 0)) / 100, [subTotal, discount, taxRate]);
  const grandTotal = useMemo(() => subTotal - Number(discount || 0) + orderTaxAmount, [subTotal, discount, orderTaxAmount]);

  const resetCart = () => {
    setCart([]);
    setDiscount(0);
    setTaxRate(0);
    setReceivedAmount('');
  };

  const checkout = async () => {
    if (!warehouseId) { setMessageType('error'); return setMessage('Select a warehouse first.'); }
    if (!customerId) { setMessageType('error'); return setMessage('Select a customer (use "Walk-in Customer" if none).'); }
    if (cart.length === 0) { setMessageType('error'); return setMessage('Cart is empty.'); }

    const payload = {
      date: todayISO(),
      customer_id: customerId,
      warehouse_id: warehouseId,
      discount: Number(discount || 0),
      tax_rate: Number(taxRate || 0),
      payment_type: paymentType,
      paid_amount: receivedAmount === '' ? grandTotal : Number(receivedAmount),
      received_amount: receivedAmount === '' ? grandTotal : Number(receivedAmount),
      pos_register_id: register?.id || null,
      items: cart.map((l) => ({
        product_id: l.product.id,
        quantity: l.quantity,
        product_price: l.price,
        discount_type: l.discount_type,
        discount_value: l.discount_value,
        tax_type: l.tax_type,
        tax_value: l.tax_value,
      })),
    };
    try {
      const res = await SalesAPI.create(payload);
      setLastReceipt(res.data.data);
      resetCart();
      loadProducts();
      setMessage('Sale completed. The scanner is ready for the next bill.');
      setMessageType('success');
    } catch (e) {
      setMessage(e.response?.data?.message || 'Checkout failed');
      setMessageType('error');
    } finally {
      focusScanner();
    }
  };

  const holdCart = async () => {
    if (cart.length === 0) {
      setMessage('Cart is empty.');
      setMessageType('error');
      focusScanner();
      return;
    }
    try {
      await QuotationsHoldsAPI.createHold({
        warehouse_id: warehouseId,
        customer_id: customerId || null,
        items: cart.map((l) => ({ product_id: l.product.id, quantity: l.quantity, price: l.price })),
      });
      resetCart();
      setMessage('Cart held. You can resume it from Holds.');
      setMessageType('success');
    } catch (error) {
      setMessage(error.response?.data?.message || 'The cart could not be held.');
      setMessageType('error');
    } finally {
      focusScanner();
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 h-full">
      {/* Product browser */}
      <div className="lg:col-span-2 flex flex-col gap-4">
        <Card className="p-4 flex flex-wrap gap-3 items-center">
          <select className={inputClass + ' max-w-[220px]'} value={warehouseId} onChange={(e) => setWarehouseId(e.target.value)}>
            <option value="">Warehouse…</option>
            {warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
          </select>
          <form onSubmit={scanBarcode} className="flex-1 min-w-[240px]">
            <input
              ref={barcodeInputRef}
              autoFocus
              autoComplete="off"
              spellCheck={false}
              aria-label="Barcode scanner input"
              className={inputClass}
              placeholder="Scan barcode / enter product code and press Enter"
              value={barcode}
              onChange={(event) => setBarcode(event.target.value)}
            />
          </form>
          <button
            type="button"
            onClick={() => focusScanner({ select: true })}
            className="rounded-md border border-slate-200 px-3 py-2 text-xs font-medium text-graphite-700 hover:bg-slate-50"
            title="Focus the scanner field (F8)"
          >
            Focus scanner (F8)
          </button>
          <div className="w-full text-xs text-graphite-500">
            USB scanner mode: <strong>HID Keyboard</strong> with an <strong>Enter/CR suffix</strong>. Scan when this field has the copper focus ring.
          </div>
        </Card>

        <Card className="p-4 flex flex-wrap gap-2 items-center">
          <input
            className={inputClass + ' max-w-xs'}
            placeholder="Search product name/code…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <select className={inputClass + ' max-w-[200px]'} value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
            <option value="">All categories</option>
            {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </Card>

        <Card className="p-4 flex-1 overflow-y-auto">
          <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-3">
            {products.map((p) => (
              <button
                key={p.id}
                onClick={() => { addToCart(p); focusScanner(); }}
                className="text-left border border-slate-200 rounded-lg p-3 hover:border-copper-500 hover:shadow-sm transition"
              >
                <div className="text-sm font-medium text-graphite-900 line-clamp-2 min-h-[2.5em]">{p.name}</div>
                <div className="text-xs text-graphite-500 font-mono mt-1">{p.code}</div>
                <div className="flex items-center justify-between mt-2">
                  <span className="font-display font-semibold text-copper-600">{formatMoney(p.product_price)}</span>
                  <span className={`text-xs ${p.low_stock ? 'text-red-600' : 'text-graphite-400'}`}>
                    {p.total_stock ?? 0} in stock
                  </span>
                </div>
              </button>
            ))}
            {products.length === 0 && <div className="col-span-full text-center text-graphite-500 py-8">No products found.</div>}
          </div>
        </Card>
      </div>

      {/* Cart / checkout */}
      <Card className="flex flex-col p-4 h-full">
        <select className={inputClass + ' mb-3'} value={customerId} onChange={(e) => setCustomerId(e.target.value)}>
          <option value="">Select customer…</option>
          {customers.map((c) => <option key={c.id} value={c.id}>{c.name} ({c.phone})</option>)}
        </select>

        {message && (
          <div className={`mb-3 rounded-md border px-3 py-2 text-sm ${messageType === 'success' ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-red-100 bg-red-50 text-red-600'}`}>
            {message}
          </div>
        )}

        <div className="flex-1 overflow-y-auto divide-y divide-slate-100 -mx-1">
          {cart.length === 0 && <p className="text-sm text-graphite-500 text-center py-8">Cart is empty. Tap a product or scan a barcode.</p>}
          {cart.map((l) => (
            <div key={l.product.id} className="py-2 px-1">
              <div className="flex justify-between items-start">
                <span className="text-sm font-medium">{l.product.name}</span>
                <button onClick={() => removeLine(l.product.id)} className="text-graphite-400 hover:text-red-600 text-xs">Remove</button>
              </div>
              <div className="flex items-center gap-2 mt-1">
                <input
                  type="number" min="0.01" step="any"
                  className={inputClass + ' w-20 py-1'}
                  value={l.quantity}
                  onChange={(e) => updateLine(l.product.id, { quantity: Number(e.target.value) })}
                />
                <span className="text-xs text-graphite-500">×</span>
                <input
                  type="number" min="0" step="any"
                  className={inputClass + ' w-24 py-1'}
                  value={l.price}
                  onChange={(e) => updateLine(l.product.id, { price: Number(e.target.value) })}
                />
                <span className="ml-auto text-sm font-medium">{formatMoney(lineSubtotal(l))}</span>
              </div>
            </div>
          ))}
        </div>

        <div className="border-t border-slate-200 mt-3 pt-3 space-y-2 text-sm">
          <div className="flex justify-between"><span>Subtotal</span><span>{formatMoney(subTotal)}</span></div>
          <div className="flex justify-between items-center">
            <span>Discount</span>
            <input type="number" min="0" step="any" className={inputClass + ' w-28 py-1'} value={discount} onChange={(e) => setDiscount(e.target.value)} />
          </div>
          <div className="flex justify-between items-center">
            <span>Tax %</span>
            <input type="number" min="0" step="any" className={inputClass + ' w-28 py-1'} value={taxRate} onChange={(e) => setTaxRate(e.target.value)} />
          </div>
          <div className="flex justify-between font-display font-semibold text-lg pt-1">
            <span>Total</span><span className="text-copper-600">{formatMoney(grandTotal)}</span>
          </div>

          <select className={inputClass} value={paymentType} onChange={(e) => setPaymentType(e.target.value)}>
            <option value="cash">Cash</option>
            <option value="card">Card</option>
            <option value="bank_transfer">Bank Transfer</option>
            <option value="credit">Credit (pay later)</option>
          </select>
          <input
            type="number" min="0" step="any"
            className={inputClass}
            placeholder={`Amount received (default: ${grandTotal.toFixed(2)})`}
            value={receivedAmount}
            onChange={(e) => setReceivedAmount(e.target.value)}
          />

          <div className="flex gap-2 pt-1">
            <Button type="button" variant="secondary" className="flex-1 justify-center" onClick={holdCart}>Hold</Button>
            <Button type="button" className="flex-1 justify-center" onClick={checkout}>Charge</Button>
          </div>
        </div>
      </Card>

      {lastReceipt && (
        <div className="lg:col-span-3">
          <Card className="p-4 mt-2 border-copper-300">
            <div className="flex justify-between items-center">
              <div className="text-sm">
                Sale <span className="font-mono">{lastReceipt.reference_code}</span> completed — total {formatMoney(lastReceipt.grand_total)}.
              </div>
              <div className="flex items-center gap-3">
                <DocumentActions type="sale" record={lastReceipt} allowReceipt />
                <button onClick={() => setLastReceipt(null)} className="text-xs text-graphite-500">Dismiss</button>
              </div>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
