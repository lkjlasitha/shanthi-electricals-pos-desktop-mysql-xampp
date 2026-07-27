import React, { useEffect, useMemo, useRef, useState } from 'react';
import JsBarcode from 'jsbarcode';
import { ProductsAPI } from '../../api/endpoints';
import { Button, Card, Field, PageHeader, inputClass } from '../../components/ui.jsx';
import { formatMoney } from '../../utils/format';

const LABEL_SIZES = {
  '40x25': { width: 40, height: 25, name: '40 × 25 mm' },
  '50x30': { width: 50, height: 30, name: '50 × 30 mm' },
  '60x40': { width: 60, height: 40, name: '60 × 40 mm' },
  '70x40': { width: 70, height: 40, name: '70 × 40 mm' },
};

function BarcodeSvg({ product, height, fontSize }) {
  const ref = useRef(null);

  useEffect(() => {
    if (!ref.current || !product?.code) return;
    const requested = String(product.barcode_symbol || '').toUpperCase();
    const ean13 = requested === 'EAN13' && /^\d{13}$/.test(String(product.code));
    try {
      JsBarcode(ref.current, String(product.code), {
        format: ean13 ? 'EAN13' : 'CODE128',
        displayValue: true,
        height,
        fontSize,
        margin: 0,
        width: 1.55,
        background: '#ffffff',
        lineColor: '#111111',
      });
    } catch {
      JsBarcode(ref.current, String(product.code), {
        format: 'CODE128', displayValue: true, height, fontSize, margin: 0, width: 1.4,
      });
    }
  }, [product, height, fontSize]);

  return <svg ref={ref} className="max-w-full" aria-label={`Barcode ${product.code}`} />;
}

function Label({ product, settings }) {
  const size = LABEL_SIZES[settings.size];
  const barcodeHeight = Math.max(18, Math.min(42, size.height * 0.85));
  return (
    <div
      className={`barcode-label bg-white overflow-hidden flex flex-col items-center justify-center text-center ${settings.border ? 'border border-dashed border-slate-400' : ''}`}
      style={{ width: `${size.width}mm`, height: `${size.height}mm`, padding: `${settings.padding}mm`, breakInside: 'avoid' }}
    >
      {settings.showShop && <div className="font-bold leading-tight truncate w-full" style={{ fontSize: `${settings.shopFont}px` }}>Shanthi Electricals</div>}
      {settings.showName && <div className="font-semibold leading-tight truncate w-full" style={{ fontSize: `${settings.nameFont}px` }}>{product.name}</div>}
      <div className="flex-1 min-h-0 w-full flex items-center justify-center"><BarcodeSvg product={product} height={barcodeHeight} fontSize={settings.codeFont} /></div>
      {settings.showPrice && <div className="font-bold leading-none" style={{ fontSize: `${settings.priceFont}px` }}>{formatMoney(product.product_price)}</div>}
    </div>
  );
}

export default function Barcodes() {
  const [products, setProducts] = useState([]);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState({});
  const [loading, setLoading] = useState(true);
  const [scannerValue, setScannerValue] = useState('');
  const [scannerResult, setScannerResult] = useState('');
  const scannerInputRef = useRef(null);
  const [settings, setSettings] = useState({
    size: '50x30', padding: 1.2, gap: 2, showShop: true, showName: true, showPrice: true,
    border: false, shopFont: 9, nameFont: 9, codeFont: 10, priceFont: 11,
  });

  useEffect(() => {
    ProductsAPI.list({ per_page: 200 }).then((response) => setProducts(response.data.data || response.data)).finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return products;
    return products.filter((product) => `${product.name} ${product.code}`.toLowerCase().includes(query));
  }, [products, search]);

  const labels = useMemo(() => {
    const output = [];
    products.forEach((product) => {
      const quantity = Math.max(0, Math.min(100, Number(selected[product.id] || 0)));
      for (let index = 0; index < quantity; index += 1) output.push({ product, key: `${product.id}-${index}` });
    });
    return output.slice(0, 500);
  }, [products, selected]);

  const selectedCount = labels.length;
  const updateSetting = (key, value) => setSettings((current) => ({ ...current, [key]: value }));
  const selectVisible = () => setSelected((current) => ({ ...current, ...Object.fromEntries(filtered.map((product) => [product.id, current[product.id] || 1])) }));
  const clear = () => setSelected({});

  const testScanner = (event) => {
    event.preventDefault();
    const code = String(scannerValue || '').replace(/[\r\n\t]/g, '').trim();
    if (!code) {
      setScannerResult('No code was received. Make sure the scanner uses USB HID Keyboard mode and sends Enter/CR after the barcode.');
    } else {
      const product = products.find((row) => String(row.code) === code);
      setScannerResult(product
        ? `Scanner OK — matched ${product.name} (${code}).`
        : `Scanner OK — received ${code}, but no active product currently uses this code.`);
    }
    setScannerValue('');
    window.requestAnimationFrame(() => scannerInputRef.current?.focus());
  };

  const focusScannerTest = () => {
    window.requestAnimationFrame(() => {
      scannerInputRef.current?.focus();
      scannerInputRef.current?.select();
    });
  };

  return (
    <div>
      <div className="no-print">
        <PageHeader
          title="Barcode Labels"
          subtitle="Select products, design the label, and print to an A4 sheet or barcode-label printer. The browser print dialog can also save the sheet as PDF."
          actions={<Button onClick={() => window.print()} disabled={!selectedCount}>Print / Save PDF</Button>}
        />

        <Card className="p-4 mb-5">
          <div className="flex flex-col lg:flex-row lg:items-end gap-4">
            <div className="flex-1">
              <h2 className="font-display font-semibold">Barcode reader setup and test</h2>
              <p className="mt-1 text-xs text-graphite-500">
                Connect a USB scanner in <strong>HID Keyboard</strong> mode and configure an <strong>Enter/CR suffix</strong>. No driver or direct Node.js connection is required.
              </p>
              <form onSubmit={testScanner} className="mt-3 flex flex-wrap gap-2">
                <input
                  ref={scannerInputRef}
                  className={`${inputClass} min-w-[260px] flex-1`}
                  autoComplete="off"
                  spellCheck={false}
                  value={scannerValue}
                  onChange={(event) => setScannerValue(event.target.value)}
                  placeholder="Click here, scan a barcode, and wait for Enter"
                />
                <Button type="submit">Test scan</Button>
                <Button type="button" variant="secondary" onClick={focusScannerTest}>Focus scanner</Button>
              </form>
              {scannerResult && <div className="mt-2 text-sm text-copper-700">{scannerResult}</div>}
            </div>
            <div className="text-xs text-graphite-500 lg:max-w-xs">
              Use the scanner manual’s configuration barcodes to enable EAN-13, CODE128, English-US keyboard layout, and Enter/CR suffix.
            </div>
          </div>
        </Card>

        <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_340px] gap-5 mb-6">
          <Card className="overflow-hidden">
            <div className="p-4 border-b border-slate-200 flex flex-wrap gap-2 items-center">
              <input className={`${inputClass} max-w-sm`} value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search product name or barcode…" />
              <Button type="button" variant="secondary" onClick={selectVisible}>Select visible</Button>
              <Button type="button" variant="ghost" onClick={clear}>Clear</Button>
              <span className="ml-auto text-sm text-graphite-500">{selectedCount} labels</span>
            </div>
            <div className="max-h-[58vh] overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-slate-50"><tr className="text-left text-graphite-600"><th className="px-4 py-2">Product</th><th className="px-4 py-2">Barcode</th><th className="px-4 py-2 text-right">Price</th><th className="px-4 py-2 w-28">Labels</th></tr></thead>
                <tbody>
                  {loading && <tr><td colSpan={4} className="px-4 py-6 text-center text-graphite-500">Loading products…</td></tr>}
                  {!loading && filtered.map((product) => (
                    <tr key={product.id} className="border-t border-slate-100">
                      <td className="px-4 py-2"><div className="font-medium">{product.name}</div><div className="text-xs text-graphite-400">Stock {product.total_stock ?? 0}</div></td>
                      <td className="px-4 py-2 font-mono text-xs">{product.code}</td>
                      <td className="px-4 py-2 text-right">{formatMoney(product.product_price)}</td>
                      <td className="px-4 py-2"><input type="number" min="0" max="100" className={`${inputClass} py-1`} value={selected[product.id] ?? ''} onChange={(event) => setSelected({ ...selected, [product.id]: event.target.value })} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          <Card className="p-4 h-fit">
            <h2 className="font-display font-semibold mb-4">Label design</h2>
            <Field label="Label size"><select className={inputClass} value={settings.size} onChange={(event) => updateSetting('size', event.target.value)}>{Object.entries(LABEL_SIZES).map(([key, size]) => <option key={key} value={key}>{size.name}</option>)}</select></Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Padding (mm)"><input type="number" min="0" max="5" step="0.2" className={inputClass} value={settings.padding} onChange={(event) => updateSetting('padding', event.target.value)} /></Field>
              <Field label="Gap (mm)"><input type="number" min="0" max="10" step="0.5" className={inputClass} value={settings.gap} onChange={(event) => updateSetting('gap', event.target.value)} /></Field>
            </div>
            <div className="space-y-2 mb-4 text-sm">
              <label className="flex items-center gap-2"><input type="checkbox" checked={settings.showShop} onChange={(event) => updateSetting('showShop', event.target.checked)} />Show shop name</label>
              <label className="flex items-center gap-2"><input type="checkbox" checked={settings.showName} onChange={(event) => updateSetting('showName', event.target.checked)} />Show product name</label>
              <label className="flex items-center gap-2"><input type="checkbox" checked={settings.showPrice} onChange={(event) => updateSetting('showPrice', event.target.checked)} />Show selling price</label>
              <label className="flex items-center gap-2"><input type="checkbox" checked={settings.border} onChange={(event) => updateSetting('border', event.target.checked)} />Print cut border</label>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Shop font"><input type="number" min="6" max="20" className={inputClass} value={settings.shopFont} onChange={(event) => updateSetting('shopFont', event.target.value)} /></Field>
              <Field label="Name font"><input type="number" min="6" max="20" className={inputClass} value={settings.nameFont} onChange={(event) => updateSetting('nameFont', event.target.value)} /></Field>
              <Field label="Code font"><input type="number" min="6" max="20" className={inputClass} value={settings.codeFont} onChange={(event) => updateSetting('codeFont', event.target.value)} /></Field>
              <Field label="Price font"><input type="number" min="6" max="24" className={inputClass} value={settings.priceFont} onChange={(event) => updateSetting('priceFont', event.target.value)} /></Field>
            </div>
          </Card>
        </div>
      </div>

      <Card className="p-4 no-print mb-3"><div className="font-display font-semibold">Print preview</div><div className="text-xs text-graphite-500">Maximum 500 labels per print job.</div></Card>
      <div className="barcode-print-area bg-white flex flex-wrap content-start" style={{ gap: `${settings.gap}mm` }}>
        {!labels.length && <div className="no-print w-full rounded-md border border-dashed border-slate-300 p-10 text-center text-sm text-graphite-500">Select one or more products and enter the number of labels.</div>}
        {labels.map(({ product, key }) => <Label key={key} product={product} settings={settings} />)}
      </div>
    </div>
  );
}
