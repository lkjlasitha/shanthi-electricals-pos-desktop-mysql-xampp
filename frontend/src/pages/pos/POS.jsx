import React, { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import {
  ProductsAPI, CustomersAPI, WarehousesAPI, SalesAPI,
  QuotationsHoldsAPI, RegisterAPI, CategoriesAPI, UnitsAPI,
} from '../../api/endpoints';
import { Button, Card, inputClass } from '../../components/ui.jsx';
import { formatMoney, todayISO } from '../../utils/format';
import { useAuth } from '../../context/AuthContext.jsx';
import DocumentActions from '../../components/DocumentActions.jsx';
import { compatibleUnits, convertUnits, defaultUnitId, findUnit } from '../../utils/units';

function numericValue(value, fallback = 0) {
  if (value === '' || value === null || value === undefined) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function isEditableElement(element) {
  if (!element) return false;
  return element.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(element.tagName);
}

function standardUnitProfit(product = {}) {
  const price = numericValue(product.product_price);
  const cost = numericValue(product.product_cost);
  const taxValue = numericValue(product.order_tax);
  const revenueBeforeTax = product.tax_type === 'inclusive' && taxValue > 0
    ? price / (1 + taxValue / 100)
    : price;
  return revenueBeforeTax - cost;
}

export default function POS() {
  const { user } = useAuth();
  const [warehouses, setWarehouses] = useState([]);
  const [warehouseId, setWarehouseId] = useState(user?.warehouse_id || '');
  const [categories, setCategories] = useState([]);
  const [categoryId, setCategoryId] = useState('');
  const [products, setProducts] = useState([]);
  const [search, setSearch] = useState('');
  const [barcode, setBarcode] = useState('');
  const [cart, setCart] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [customerId, setCustomerId] = useState('');
  const [discount, setDiscount] = useState('0');
  const [taxRate, setTaxRate] = useState('0');
  const [paymentType, setPaymentType] = useState('cash');
  const [receivedAmount, setReceivedAmount] = useState('');
  const [register, setRegister] = useState(null);
  const [message, setMessage] = useState('');
  const [messageType, setMessageType] = useState('error');
  const [lastReceipt, setLastReceipt] = useState(null);
  const [showQuickItem, setShowQuickItem] = useState(false);
  const [quickItem, setQuickItem] = useState({ name: '', price: '', quantity: '1' });
  const [units, setUnits] = useState([]);
  const barcodeInputRef = useRef(null);
  const quickItemNameRef = useRef(null);
  const manualLineSequence = useRef(0);

  const loadCustomers = useCallback(() => {
    CustomersAPI.listWithBalances()
      .then((res) => setCustomers((res.data.data || []).filter((customer) => customer.is_active !== false)))
      .catch(() => {});
  }, []);

  const focusScanner = useCallback(({ select = false, force = false } = {}) => {
    window.requestAnimationFrame(() => {
      const input = barcodeInputRef.current;
      if (!input) return;

      // Do not steal focus while the cashier is editing quantity, price,
      // discount, search, customer, or any other form control.
      const active = document.activeElement;
      if (!force && active !== input && isEditableElement(active)) return;

      input.focus();
      if (select) input.select();
    });
  }, []);

  useEffect(() => {
    WarehousesAPI.list({ per_page: 100 }).then((res) => setWarehouses(res.data.data || res.data));
    CategoriesAPI.list({ per_page: 100 }).then((res) => setCategories(res.data.data || res.data));
    UnitsAPI.list({ per_page: 200 }).then((res) => setUnits(res.data.data || res.data)).catch(() => {});
    loadCustomers();
    RegisterAPI.current().then((res) => setRegister(res.data.data)).catch(() => {});
  }, [loadCustomers]);

  useEffect(() => {
    focusScanner({ force: true });
    const handleShortcut = (event) => {
      if (event.key === 'F8') {
        event.preventDefault();
        focusScanner({ select: true, force: true });
      }
    };
    window.addEventListener('keydown', handleShortcut);
    return () => window.removeEventListener('keydown', handleShortcut);
  }, [focusScanner]);

  useEffect(() => {
    if (showQuickItem) {
      window.requestAnimationFrame(() => quickItemNameRef.current?.focus());
    }
  }, [showQuickItem]);

  const loadProducts = useCallback(() => {
    ProductsAPI.list({ search, category_id: categoryId || undefined, per_page: 60 }).then((res) =>
      setProducts(res.data.data || res.data)
    );
  }, [search, categoryId]);

  useEffect(() => { loadProducts(); }, [loadProducts]);

  const addToCart = (product) => {
    const lineId = `product-${product.id}`;
    const lineUnits = compatibleUnits(product, units);
    const initialUnit = lineUnits.length ? findUnit(defaultUnitId(product), units) || lineUnits[0] : null;
    setCart((previous) => {
      const existing = previous.find((line) => line.line_id === lineId);
      if (existing) {
        if (existing.unit_id) {
          const unit = findUnit(existing.unit_id, units);
          const nextUnitQuantity = numericValue(existing.unit_quantity) + 1;
          return previous.map((line) => line.line_id === lineId
            ? {
              ...line,
              unit_quantity: String(nextUnitQuantity),
              quantity: String(convertUnits(nextUnitQuantity, unit, product.stockUnit)),
            }
            : line);
        }
        return previous.map((line) => line.line_id === lineId
          ? { ...line, quantity: String(numericValue(line.quantity) + 1) }
          : line);
      }
      return [...previous, {
        line_id: lineId,
        product,
        is_manual: false,
        item_name: product.name,
        item_code: product.code || '',
        quantity: '1',
        // For length-based products (wire/cable), unit_id/unit_quantity track
        // what the cashier actually typed (e.g. "5" while unit = Foot); the
        // `quantity` above always stays in the product's stock unit (meters)
        // so pricing, stock deduction, and profit reports need no changes.
        unit_id: initialUnit ? initialUnit.id : null,
        unit_quantity: initialUnit ? '1' : null,
        // The cashier may change `price` for this bill only. The catalogue price
        // and product cost are retained separately for reset and profit display.
        price: String(product.product_price ?? 0),
        standard_price: String(product.product_price ?? 0),
        cost_price: String(product.product_cost ?? 0),
        discount_value: '',
        discount_type: 'none',
        tax_value: String(product.order_tax || 0),
        tax_type: product.tax_type || 'none',
      }];
    });
    setMessage(`${product.name} added to the cart.`);
    setMessageType('success');
  };

  // Called when the cashier changes the Length input or the unit dropdown for
  // a length-based cart line (e.g. wire sold in feet). Keeps `quantity`
  // (stock unit) and `unit_quantity`/`unit_id` (what was actually typed) in
  // sync so pricing/stock stay correct while the invoice still shows "5 ft".
  const updateLineUnit = (lineId, { unitQuantity, unitId }) => {
    setCart((previous) => previous.map((line) => {
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

  const addQuickItem = (event) => {
    event.preventDefault();
    const name = quickItem.name.trim();
    const price = Number(quickItem.price);
    const quantity = Number(quickItem.quantity);

    if (!name) {
      setMessage('Enter a name for the quick item.');
      setMessageType('error');
      quickItemNameRef.current?.focus();
      return;
    }
    if (quickItem.price === '' || !Number.isFinite(price) || price < 0) {
      setMessage('Enter a valid quick-item price.');
      setMessageType('error');
      return;
    }
    if (!Number.isFinite(quantity) || quantity <= 0) {
      setMessage('Quick-item quantity must be greater than zero.');
      setMessageType('error');
      return;
    }

    manualLineSequence.current += 1;
    setCart((previous) => [...previous, {
      line_id: `manual-${Date.now()}-${manualLineSequence.current}`,
      product: null,
      is_manual: true,
      item_name: name,
      item_code: '',
      quantity: quickItem.quantity,
      price: quickItem.price,
      standard_price: '',
      cost_price: '',
      discount_value: '',
      discount_type: 'none',
      tax_value: '0',
      tax_type: 'none',
    }]);
    setQuickItem({ name: '', price: '', quantity: '1' });
    setShowQuickItem(false);
    setMessage(`${name} added as a manual bill item. Stock was not changed.`);
    setMessageType('success');
  };

  const scanBarcode = async (event) => {
    event.preventDefault();
    const scannedCode = String(barcode || '').replace(/[\r\n\t]/g, '').trim();
    if (!scannedCode) {
      focusScanner({ force: true });
      return;
    }

    setBarcode('');
    try {
      const response = await ProductsAPI.lookup(scannedCode);
      addToCart(response.data.data);
    } catch (error) {
      setMessage(error.response?.data?.message || `No product found for code "${scannedCode}".`);
      setMessageType('error');
    } finally {
      focusScanner({ force: true });
    }
  };

  const updateLine = (lineId, patch) => {
    setCart((previous) => previous.map((line) => line.line_id === lineId ? { ...line, ...patch } : line));
  };

  const removeLine = (lineId) => {
    setCart((previous) => previous.filter((line) => line.line_id !== lineId));
  };

  const lineBaseTotal = (line) => numericValue(line.quantity) * numericValue(line.price);

  const lineDiscountAmount = (line) => {
    const lineTotal = lineBaseTotal(line);
    const value = numericValue(line.discount_value);
    if (line.discount_type === 'percentage') return (lineTotal * value) / 100;
    if (line.discount_type === 'fixed') return value;
    return 0;
  };

  const lineTaxAmount = (line) => {
    const taxable = lineBaseTotal(line) - lineDiscountAmount(line);
    const taxValue = numericValue(line.tax_value);
    if (line.tax_type === 'exclusive') return (taxable * taxValue) / 100;
    if (line.tax_type === 'inclusive' && taxValue > 0) return taxable - taxable / (1 + taxValue / 100);
    return 0;
  };

  const lineSubtotal = (line) => lineBaseTotal(line) - lineDiscountAmount(line)
    + (line.tax_type === 'exclusive' ? lineTaxAmount(line) : 0);

  // Product cost is stored excluding tax. Profit therefore uses sale revenue
  // excluding line tax and after the cashier's item discount. Whole-bill
  // discounts are intentionally shown separately because they are not tied to
  // a single product line.
  const lineRevenueBeforeTax = (line) => lineSubtotal(line) - lineTaxAmount(line);
  const lineCostTotal = (line) => line.is_manual
    ? null
    : numericValue(line.quantity) * numericValue(line.cost_price);
  const lineProfit = (line) => {
    const costTotal = lineCostTotal(line);
    return costTotal === null ? null : lineRevenueBeforeTax(line) - costTotal;
  };
  const lineUnitProfit = (line) => {
    const quantity = numericValue(line.quantity);
    const profit = lineProfit(line);
    return profit === null || quantity <= 0 ? null : profit / quantity;
  };
  const isPriceOverridden = (line) => !line.is_manual
    && Math.abs(numericValue(line.price) - numericValue(line.standard_price)) > 0.000001;

  const rawSubtotal = useMemo(() => cart.reduce((sum, line) => sum + lineBaseTotal(line), 0), [cart]);
  const itemDiscountTotal = useMemo(() => cart.reduce((sum, line) => sum + lineDiscountAmount(line), 0), [cart]);
  const knownProductProfit = useMemo(() => cart.reduce((sum, line) => {
    const profit = lineProfit(line);
    return profit === null ? sum : sum + profit;
  }, 0), [cart]);
  const productLineCount = useMemo(() => cart.filter((line) => !line.is_manual).length, [cart]);
  const subTotal = useMemo(() => cart.reduce((sum, line) => sum + lineSubtotal(line), 0), [cart]);
  const orderDiscount = numericValue(discount);
  const orderTaxAmount = useMemo(
    () => ((subTotal - orderDiscount) * numericValue(taxRate)) / 100,
    [subTotal, orderDiscount, taxRate]
  );
  const grandTotal = Math.max(0, subTotal - orderDiscount + orderTaxAmount);
  const selectedCustomer = customers.find((customer) => String(customer.id) === String(customerId));
  const plannedPaidAmount = receivedAmount === ''
    ? (paymentType === 'credit' ? 0 : grandTotal)
    : Math.min(numericValue(receivedAmount), grandTotal);
  const projectedNewDebt = Math.max(0, grandTotal - plannedPaidAmount);
  const projectedCustomerDue = numericValue(selectedCustomer?.total_due) + projectedNewDebt;
  const projectedOverLimit = numericValue(selectedCustomer?.credit_limit) > 0
    && projectedCustomerDue > numericValue(selectedCustomer?.credit_limit);

  const validateCart = () => {
    for (let index = 0; index < cart.length; index += 1) {
      const line = cart[index];
      const quantity = Number(line.quantity);
      const price = Number(line.price);
      const discountValue = numericValue(line.discount_value);
      const label = line.item_name || `Item ${index + 1}`;

      if (!Number.isFinite(quantity) || quantity <= 0) return `${label}: quantity must be greater than zero.`;
      if (line.price === '' || !Number.isFinite(price) || price < 0) return `${label}: enter a valid selling price.`;
      if (line.is_manual && !String(line.item_name || '').trim()) return `Manual item ${index + 1} needs a name.`;
      if (line.discount_type === 'percentage' && discountValue > 100) return `${label}: percentage discount cannot exceed 100%.`;
      if (lineDiscountAmount(line) > lineBaseTotal(line)) return `${label}: discount cannot exceed the item total.`;
    }

    if (orderDiscount > subTotal) return 'Order discount cannot exceed the sale subtotal.';
    if (receivedAmount !== '' && (!Number.isFinite(Number(receivedAmount)) || Number(receivedAmount) < 0)) {
      return 'Enter a valid received amount.';
    }
    return '';
  };

  const resetCart = () => {
    setCart([]);
    setDiscount('0');
    setTaxRate('0');
    setReceivedAmount('');
    setQuickItem({ name: '', price: '', quantity: '1' });
    setShowQuickItem(false);
  };

  const checkout = async () => {
    if (!warehouseId) { setMessageType('error'); setMessage('Select a warehouse first.'); return; }
    if (!customerId) { setMessageType('error'); setMessage('Select a customer (use "Walk-in Customer" if none).'); return; }
    if (cart.length === 0) { setMessageType('error'); setMessage('Cart is empty.'); return; }

    const validationError = validateCart();
    if (validationError) {
      setMessage(validationError);
      setMessageType('error');
      return;
    }

    const payload = {
      date: todayISO(),
      customer_id: customerId,
      warehouse_id: warehouseId,
      discount: orderDiscount,
      tax_rate: numericValue(taxRate),
      payment_type: paymentType,
      paid_amount: plannedPaidAmount,
      received_amount: receivedAmount === '' ? plannedPaidAmount : Number(receivedAmount),
      pos_register_id: register?.id || null,
      items: cart.map((line) => ({
        product_id: line.is_manual ? null : line.product?.id,
        is_manual: line.is_manual,
        item_name: line.item_name,
        item_code: line.item_code || null,
        quantity: Number(line.quantity),
        // This is the temporary selling price for this transaction. The backend
        // reads cost and standard price from the product record instead of
        // trusting cashier-supplied financial data.
        product_price: Number(line.price),
        sale_unit_id: line.unit_id || null,
        unit_quantity: line.unit_id ? numericValue(line.unit_quantity) : null,
        discount_type: line.discount_type,
        discount_value: numericValue(line.discount_value),
        tax_type: line.tax_type,
        tax_value: numericValue(line.tax_value),
      })),
    };

    try {
      const response = await SalesAPI.create(payload);
      setLastReceipt(response.data.data);
      resetCart();
      loadProducts();
      loadCustomers();
      setMessage('Sale completed. The scanner is ready for the next bill.');
      setMessageType('success');
      focusScanner({ force: true });
    } catch (error) {
      setMessage(error.response?.data?.message || 'Checkout failed');
      setMessageType('error');
    }
  };

  const holdCart = async () => {
    if (cart.length === 0) {
      setMessage('Cart is empty.');
      setMessageType('error');
      return;
    }

    if (cart.some((line) => line.is_manual || line.discount_type !== 'none')) {
      setMessage('A cart containing manual items or item discounts cannot be held because those details would be lost. Complete this sale or remove those lines first.');
      setMessageType('error');
      return;
    }

    const validationError = validateCart();
    if (validationError) {
      setMessage(validationError);
      setMessageType('error');
      return;
    }

    try {
      await QuotationsHoldsAPI.createHold({
        warehouse_id: warehouseId,
        customer_id: customerId || null,
        items: cart.map((line) => ({
          product_id: line.product.id,
          quantity: Number(line.quantity),
          price: Number(line.price),
        })),
      });
      resetCart();
      setMessage('Cart held. You can resume it from Holds.');
      setMessageType('success');
      focusScanner({ force: true });
    } catch (error) {
      setMessage(error.response?.data?.message || 'The cart could not be held.');
      setMessageType('error');
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 h-full">
      <div className="lg:col-span-2 flex flex-col gap-4">
        <Card className="p-4 flex flex-wrap gap-3 items-center">
          <select className={inputClass + ' max-w-[220px]'} value={warehouseId} onChange={(event) => setWarehouseId(event.target.value)}>
            <option value="">Warehouse…</option>
            {warehouses.map((warehouse) => <option key={warehouse.id} value={warehouse.id}>{warehouse.name}</option>)}
          </select>
          <form onSubmit={scanBarcode} className="flex-1 min-w-[240px]">
            <input
              ref={barcodeInputRef}
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
            onClick={() => focusScanner({ select: true, force: true })}
            className="rounded-md border border-slate-200 px-3 py-2 text-xs font-medium text-graphite-700 hover:bg-slate-50"
            title="Focus the scanner field (F8)"
          >
            Focus scanner (F8)
          </button>
          <div className="w-full text-xs text-graphite-500">
            The scanner field will no longer take focus while you are typing in another field. Press <strong>F8</strong> whenever you want to scan.
          </div>
        </Card>

        <Card className="p-4 flex flex-wrap gap-2 items-center">
          <input
            className={inputClass + ' max-w-xs'}
            placeholder="Search product name/code…"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
          <select className={inputClass + ' max-w-[200px]'} value={categoryId} onChange={(event) => setCategoryId(event.target.value)}>
            <option value="">All categories</option>
            {categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
          </select>
          <Button type="button" variant="secondary" onClick={() => setShowQuickItem((open) => !open)}>
            {showQuickItem ? 'Close quick item' : '+ Quick item'}
          </Button>
          <span className="text-xs text-graphite-500">Use this for an item not yet saved in Products.</span>
        </Card>

        {showQuickItem && (
          <Card className="p-4 border-amber-200 bg-amber-50/60">
            <form onSubmit={addQuickItem} className="flex flex-wrap items-end gap-3">
              <div className="flex-1 min-w-[240px]">
                <label className="block text-xs font-medium text-graphite-700 mb-1">Item name</label>
                <input
                  ref={quickItemNameRef}
                  className={inputClass}
                  maxLength={191}
                  value={quickItem.name}
                  onChange={(event) => setQuickItem((current) => ({ ...current, name: event.target.value }))}
                  placeholder="Example: Special cable connector"
                />
              </div>
              <div className="w-36">
                <label className="block text-xs font-medium text-graphite-700 mb-1">Price</label>
                <input
                  type="number"
                  min="0"
                  step="any"
                  className={inputClass}
                  value={quickItem.price}
                  onChange={(event) => setQuickItem((current) => ({ ...current, price: event.target.value }))}
                  placeholder="0.00"
                />
              </div>
              <div className="w-28">
                <label className="block text-xs font-medium text-graphite-700 mb-1">Quantity</label>
                <input
                  type="number"
                  min="0.01"
                  step="any"
                  className={inputClass}
                  value={quickItem.quantity}
                  onChange={(event) => setQuickItem((current) => ({ ...current, quantity: event.target.value }))}
                />
              </div>
              <Button type="submit">Add to bill</Button>
            </form>
            <p className="mt-2 text-xs text-amber-800">
              This line appears on the invoice and receipt but does not create a product or change warehouse stock.
            </p>
          </Card>
        )}

        <Card className="p-4 flex-1 overflow-y-auto">
          <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-3">
            {products.map((product) => (
              <button
                type="button"
                key={product.id}
                onClick={() => addToCart(product)}
                className="text-left border border-slate-200 rounded-lg p-3 hover:border-copper-500 hover:shadow-sm transition"
              >
                <div className="text-sm font-medium text-graphite-900 line-clamp-2 min-h-[2.5em]">{product.name}</div>
                <div className="text-xs text-graphite-500 font-mono mt-1">{product.code}</div>
                <div className="flex items-center justify-between mt-2">
                  <span className="font-display font-semibold text-copper-600">{formatMoney(product.product_price)}</span>
                  <span className={`text-xs ${product.low_stock ? 'text-red-600' : 'text-graphite-400'}`}>
                    {product.total_stock ?? 0} in stock
                  </span>
                </div>
                <div className="mt-1 text-[10px] text-graphite-500">
                  Cost {formatMoney(product.product_cost)} · Standard profit {formatMoney(standardUnitProfit(product))}
                </div>
              </button>
            ))}
            {products.length === 0 && <div className="col-span-full text-center text-graphite-500 py-8">No products found.</div>}
          </div>
        </Card>
      </div>

      <Card className="flex flex-col p-4 h-full">
        <select className={inputClass + ' mb-3'} value={customerId} onChange={(event) => setCustomerId(event.target.value)}>
          <option value="">Select customer…</option>
          {customers.map((customer) => (
            <option key={customer.id} value={customer.id}>
              {customer.name} ({customer.phone}){customer.total_due > 0 ? ` — owes ${formatMoney(customer.total_due)}` : ''}
            </option>
          ))}
        </select>
        {selectedCustomer && (numericValue(selectedCustomer.total_due) > 0 || projectedNewDebt > 0) && (
          <div className={`mb-3 rounded-md border px-3 py-2 text-xs ${projectedOverLimit ? 'border-red-200 bg-red-50 text-red-700' : 'border-amber-200 bg-amber-50 text-amber-800'}`}>
            <div>Existing balance: <strong>{formatMoney(selectedCustomer.total_due)}</strong></div>
            {projectedNewDebt > 0 && <div>This sale adds <strong>{formatMoney(projectedNewDebt)}</strong>; projected balance: <strong>{formatMoney(projectedCustomerDue)}</strong>.</div>}
            {selectedCustomer.payment_terms_days !== undefined && projectedNewDebt > 0 && <div>Default payment terms: {selectedCustomer.payment_terms_days} day(s).</div>}
            {projectedOverLimit && <div className="mt-1 font-medium">Warning: this would exceed the customer credit limit of {formatMoney(selectedCustomer.credit_limit)}.</div>}
          </div>
        )}

        {message && (
          <div className={`mb-3 rounded-md border px-3 py-2 text-sm ${messageType === 'success' ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-red-100 bg-red-50 text-red-600'}`}>
            {message}
          </div>
        )}

        <div className="flex-1 overflow-y-auto divide-y divide-slate-100 -mx-1">
          {cart.length === 0 && <p className="text-sm text-graphite-500 text-center py-8">Cart is empty. Tap a product, scan a barcode, or add a quick item.</p>}
          {cart.map((line) => {
            const discountAmount = lineDiscountAmount(line);
            const profit = lineProfit(line);
            const unitProfit = lineUnitProfit(line);
            const priceOverridden = isPriceOverridden(line);
            const belowCost = profit !== null && profit < 0;
            return (
              <div key={line.line_id} className="py-3 px-1">
                <div className="flex justify-between items-start gap-2">
                  <div>
                    <span className="text-sm font-medium">{line.item_name}</span>
                    {line.is_manual && (
                      <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-amber-800">Manual</span>
                    )}
                  </div>
                  <button type="button" onClick={() => removeLine(line.line_id)} className="text-graphite-400 hover:text-red-600 text-xs">Remove</button>
                </div>

                <div className="mt-2 grid grid-cols-[5rem_minmax(7rem,1fr)_auto] items-end gap-2">
                  {line.unit_id ? (
                    <label className="col-span-1 block">
                      <span className="mb-1 block text-[11px] font-medium text-graphite-500">Length</span>
                      <div className="flex items-center gap-1">
                        <input
                          aria-label={`Length for ${line.item_name}`}
                          type="number"
                          min="0.01"
                          step="any"
                          className={inputClass + ' w-full py-1'}
                          value={line.unit_quantity ?? ''}
                          onChange={(event) => updateLineUnit(line.line_id, { unitQuantity: event.target.value })}
                        />
                        <select
                          aria-label={`Unit for ${line.item_name}`}
                          className={inputClass + ' w-auto py-1 text-xs'}
                          value={line.unit_id}
                          onChange={(event) => updateLineUnit(line.line_id, { unitId: Number(event.target.value) })}
                        >
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
                      <input
                        aria-label={`Quantity for ${line.item_name}`}
                        type="number"
                        min="0.01"
                        step="any"
                        className={inputClass + ' w-full py-1'}
                        value={line.quantity}
                        onChange={(event) => updateLine(line.line_id, { quantity: event.target.value })}
                      />
                    </label>
                  )}
                  <label className="block">
                    <span className="mb-1 flex items-center gap-1 text-[11px] font-medium text-graphite-500">
                      Sale price for this bill
                      {priceOverridden && (
                        <span className="rounded bg-blue-100 px-1.5 py-0.5 text-[9px] uppercase tracking-wide text-blue-700">Changed</span>
                      )}
                    </span>
                    <div className="flex items-center gap-1.5">
                      <input
                        aria-label={`Sale price for ${line.item_name}`}
                        type="number"
                        min="0"
                        step="any"
                        className={inputClass + ' min-w-0 flex-1 py-1'}
                        value={line.price}
                        onChange={(event) => updateLine(line.line_id, { price: event.target.value })}
                      />
                      {priceOverridden && (
                        <button
                          type="button"
                          onClick={() => updateLine(line.line_id, { price: line.standard_price })}
                          className="whitespace-nowrap rounded border border-slate-200 bg-white px-2 py-1.5 text-[10px] font-medium text-graphite-600 hover:border-copper-400"
                          title={`Reset to standard price ${formatMoney(line.standard_price)}`}
                        >
                          Reset
                        </button>
                      )}
                    </div>
                  </label>
                  <span className="pb-2 text-sm font-medium">{formatMoney(lineSubtotal(line))}</span>
                </div>

                {!line.is_manual && (
                  <div className={`mt-2 rounded-md border px-2.5 py-2 ${belowCost ? 'border-red-200 bg-red-50' : 'border-emerald-100 bg-emerald-50/60'}`}>
                    <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs sm:grid-cols-4">
                      <div>
                        <span className="block text-[10px] uppercase tracking-wide text-graphite-500">Standard</span>
                        <strong className="text-graphite-800">{formatMoney(line.standard_price)}</strong>
                      </div>
                      <div>
                        <span className="block text-[10px] uppercase tracking-wide text-graphite-500">Cost / unit</span>
                        <strong className="text-graphite-800">{formatMoney(line.cost_price)}</strong>
                      </div>
                      <div>
                        <span className="block text-[10px] uppercase tracking-wide text-graphite-500">Profit / unit</span>
                        <strong className={belowCost ? 'text-red-700' : 'text-emerald-700'}>{formatMoney(unitProfit)}</strong>
                      </div>
                      <div>
                        <span className="block text-[10px] uppercase tracking-wide text-graphite-500">Line profit</span>
                        <strong className={belowCost ? 'text-red-700' : 'text-emerald-700'}>{formatMoney(profit)}</strong>
                      </div>
                    </div>
                    {belowCost && <p className="mt-1 text-[11px] font-medium text-red-700">Warning: this line is being sold below cost.</p>}
                    <p className="mt-1 text-[10px] text-graphite-500">Profit includes the item discount and excludes tax. A whole-bill discount can reduce it further.</p>
                  </div>
                )}

                <div className="mt-2 rounded-md bg-slate-50 p-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs font-medium text-graphite-600">Item discount</span>
                    <button
                      type="button"
                      onClick={() => updateLine(line.line_id, { discount_type: 'percentage', discount_value: '5' })}
                      className="rounded border border-slate-200 bg-white px-2 py-1 text-xs hover:border-copper-400"
                    >5%</button>
                    <button
                      type="button"
                      onClick={() => updateLine(line.line_id, { discount_type: 'percentage', discount_value: '10' })}
                      className="rounded border border-slate-200 bg-white px-2 py-1 text-xs hover:border-copper-400"
                    >10%</button>
                    <select
                      className={inputClass + ' w-32 py-1 text-xs'}
                      value={line.discount_type}
                      onChange={(event) => updateLine(line.line_id, {
                        discount_type: event.target.value,
                        discount_value: event.target.value === 'none' ? '' : line.discount_value,
                      })}
                    >
                      <option value="none">No discount</option>
                      <option value="percentage">Percentage</option>
                      <option value="fixed">Fixed amount</option>
                    </select>
                    {line.discount_type !== 'none' && (
                      <input
                        aria-label={`Discount for ${line.item_name}`}
                        type="number"
                        min="0"
                        max={line.discount_type === 'percentage' ? 100 : undefined}
                        step="any"
                        className={inputClass + ' w-24 py-1'}
                        value={line.discount_value}
                        onChange={(event) => updateLine(line.line_id, { discount_value: event.target.value })}
                        placeholder={line.discount_type === 'percentage' ? '%' : 'Amount'}
                      />
                    )}
                    {discountAmount > 0 && <span className="ml-auto text-xs font-medium text-emerald-700">Saved {formatMoney(discountAmount)}</span>}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <div className="border-t border-slate-200 mt-3 pt-3 space-y-2 text-sm">
          <div className="flex justify-between"><span>Items before discount</span><span>{formatMoney(rawSubtotal)}</span></div>
          {itemDiscountTotal > 0 && <div className="flex justify-between text-emerald-700"><span>Item discounts</span><span>-{formatMoney(itemDiscountTotal)}</span></div>}
          <div className="flex justify-between"><span>Items subtotal</span><span>{formatMoney(subTotal)}</span></div>
          {productLineCount > 0 && (
            <div className={`flex justify-between rounded px-2 py-1 font-medium ${knownProductProfit < 0 ? 'bg-red-50 text-red-700' : 'bg-emerald-50 text-emerald-700'}`}>
              <span>Known product profit*</span><span>{formatMoney(knownProductProfit)}</span>
            </div>
          )}
          <div className="flex justify-between items-center">
            <span>Whole-bill discount</span>
            <input type="number" min="0" step="any" className={inputClass + ' w-28 py-1'} value={discount} onChange={(event) => setDiscount(event.target.value)} />
          </div>
          <div className="flex justify-between items-center">
            <span>Tax %</span>
            <input type="number" min="0" step="any" className={inputClass + ' w-28 py-1'} value={taxRate} onChange={(event) => setTaxRate(event.target.value)} />
          </div>
          <div className="flex justify-between font-display font-semibold text-lg pt-1">
            <span>Total</span><span className="text-copper-600">{formatMoney(grandTotal)}</span>
          </div>
          {productLineCount > 0 && (
            <p className="text-[10px] leading-4 text-graphite-500">
              *Known product profit is after item discounts and before the whole-bill discount. Manual quick items are excluded because their cost is unknown.
            </p>
          )}

          <select className={inputClass} value={paymentType} onChange={(event) => {
            const method = event.target.value;
            setPaymentType(method);
            if (method === 'credit' && receivedAmount === '') setReceivedAmount('0');
          }}>
            <option value="cash">Cash</option>
            <option value="card">Card</option>
            <option value="bank_transfer">Bank Transfer</option>
            <option value="credit">Credit (pay later)</option>
          </select>
          <input
            type="number"
            min="0"
            step="any"
            className={inputClass}
            placeholder={paymentType === 'credit' ? 'Deposit received (0 for pay later)' : `Cash/card received (default: ${grandTotal.toFixed(2)})`}
            value={receivedAmount}
            onChange={(event) => setReceivedAmount(event.target.value)}
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
                <button type="button" onClick={() => setLastReceipt(null)} className="text-xs text-graphite-500">Dismiss</button>
              </div>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
