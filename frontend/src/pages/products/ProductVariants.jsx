import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  ProductsAPI, CategoriesAPI, BrandsAPI, UnitsAPI, WarehousesAPI,
} from '../../api/endpoints';
import { Button, Card, Field, PageHeader, inputClass } from '../../components/ui.jsx';
import { formatMoney } from '../../utils/format';

const commonDefaults = {
  name: '', family_code: '', product_category_id: '', brand_id: '',
  product_unit: '', sale_unit: '', purchase_unit: '', stock_alert: 5,
  quantity_limit: '', order_tax: 0, tax_type: 'exclusive', notes: '',
};

const defaultAxes = [{ name: 'Variant', values: '' }];

function splitValues(value) {
  return [...new Set(String(value || '')
    .split(/[\n,]/)
    .map((item) => item.trim())
    .filter(Boolean))];
}

function cartesianAxes(axes, limit = 100) {
  const valid = axes
    .map((axis) => ({ name: axis.name.trim(), values: splitValues(axis.values) }))
    .filter((axis) => axis.name && axis.values.length);
  if (!valid.length) return [];

  let combinations = [{ label: '', attributes: {} }];
  valid.forEach((axis) => {
    combinations = combinations.flatMap((combination) => axis.values.map((value) => ({
      label: [combination.label, value].filter(Boolean).join(' / '),
      attributes: { ...combination.attributes, [axis.name]: value },
    })));
    if (combinations.length > limit) throw new Error(`These options create more than ${limit} variants.`);
  });
  return combinations;
}

function variantRow(item, index, defaults) {
  return {
    key: `${Date.now()}-${index}-${Math.random().toString(36).slice(2)}`,
    enabled: true,
    label: item.label,
    attributes: item.attributes || { Variant: item.label },
    code: '',
    barcode_symbol: 'EAN13',
    product_cost: defaults.product_cost,
    product_price: defaults.product_price,
    stock_alert: defaults.stock_alert,
    initial_quantity: defaults.initial_quantity,
  };
}

function productCommon(product) {
  return {
    name: product.MainProduct?.name || product.name,
    family_code: product.MainProduct?.code || '',
    product_category_id: product.product_category_id || '',
    brand_id: product.brand_id || '',
    product_unit: product.product_unit || '',
    sale_unit: product.sale_unit || '',
    purchase_unit: product.purchase_unit || '',
    stock_alert: product.stock_alert ?? 5,
    quantity_limit: product.quantity_limit ?? '',
    order_tax: product.order_tax ?? 0,
    tax_type: product.tax_type || 'exclusive',
    notes: product.notes || '',
  };
}

export default function ProductVariants() {
  const navigate = useNavigate();
  const { familyId } = useParams();
  const [searchParams] = useSearchParams();
  const sourceProductId = searchParams.get('source_product_id');
  const mode = familyId ? 'add' : sourceProductId ? 'convert' : 'create';

  const [common, setCommon] = useState(commonDefaults);
  const [existingLabel, setExistingLabel] = useState('Standard');
  const [existingVariants, setExistingVariants] = useState([]);
  const [categories, setCategories] = useState([]);
  const [brands, setBrands] = useState([]);
  const [units, setUnits] = useState([]);
  const [warehouses, setWarehouses] = useState([]);
  const [selectedWarehouse, setSelectedWarehouse] = useState('');
  const [entryMode, setEntryMode] = useState('quick');
  const [quickValues, setQuickValues] = useState('');
  const [axes, setAxes] = useState(defaultAxes);
  const [defaults, setDefaults] = useState({ product_cost: '', product_price: '', stock_alert: 5, initial_quantity: 0 });
  const [variants, setVariants] = useState([]);
  const [loading, setLoading] = useState(mode !== 'create');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    Promise.all([
      CategoriesAPI.list({ per_page: 200 }),
      BrandsAPI.list({ per_page: 200 }),
      UnitsAPI.list({ per_page: 200 }),
      WarehousesAPI.list({ per_page: 200 }),
    ]).then(([categoryResponse, brandResponse, unitResponse, warehouseResponse]) => {
      setCategories(categoryResponse.data.data || categoryResponse.data || []);
      setBrands(brandResponse.data.data || brandResponse.data || []);
      setUnits(unitResponse.data.data || unitResponse.data || []);
      const warehouseRows = warehouseResponse.data.data || warehouseResponse.data || [];
      setWarehouses(warehouseRows);
      if (warehouseRows.length) setSelectedWarehouse(String(warehouseRows[0].id));
    }).catch((requestError) => setError(requestError.response?.data?.message || 'Product form data could not be loaded.'));
  }, []);

  useEffect(() => {
    if (mode === 'create') return;
    setLoading(true);
    const request = mode === 'add' ? ProductsAPI.getFamily(familyId) : ProductsAPI.get(sourceProductId);
    request.then((response) => {
      const data = response.data.data;
      if (mode === 'add') {
        const rows = data.variants || [];
        setExistingVariants(rows);
        if (rows[0]) {
          setCommon({ ...productCommon(rows[0]), name: data.name, family_code: data.code });
          setDefaults((current) => ({
            ...current,
            product_cost: String(rows[0].product_cost ?? ''),
            product_price: String(rows[0].product_price ?? ''),
            stock_alert: rows[0].stock_alert ?? 5,
          }));
        }
      } else {
        setExistingVariants([data]);
        setCommon(productCommon(data));
        setDefaults((current) => ({
          ...current,
          product_cost: String(data.product_cost ?? ''),
          product_price: String(data.product_price ?? ''),
          stock_alert: data.stock_alert ?? 5,
        }));
      }
    }).catch((requestError) => {
      setError(requestError.response?.data?.message || 'Product information could not be loaded.');
    }).finally(() => setLoading(false));
  }, [familyId, sourceProductId, mode]);

  const title = mode === 'add'
    ? `Add variants — ${common.name || 'Product family'}`
    : mode === 'convert'
      ? `Convert to product family — ${common.name || 'Product'}`
      : 'Add product with variants';

  const addRows = (items) => {
    const existingNames = new Set([
      ...existingVariants.map((row) => String(row.variant_name || '').toLowerCase()),
      ...variants.map((row) => row.label.toLowerCase()),
    ]);
    const newItems = items.filter((item) => !existingNames.has(item.label.toLowerCase()));
    if (!newItems.length) throw new Error('All generated variant names already exist.');
    setVariants((current) => [...current, ...newItems.map((item, index) => variantRow(item, current.length + index, defaults))]);
  };

  const generateQuick = () => {
    setError('');
    try {
      const labels = splitValues(quickValues);
      if (!labels.length) throw new Error('Enter at least one variant, one per line or separated by commas.');
      addRows(labels.map((label) => ({ label, attributes: { Variant: label } })));
      setQuickValues('');
    } catch (generationError) {
      setError(generationError.message);
    }
  };

  const generateMatrix = () => {
    setError('');
    try {
      const combinations = cartesianAxes(axes);
      if (!combinations.length) throw new Error('Add an attribute name and at least one option.');
      addRows(combinations);
    } catch (generationError) {
      setError(generationError.message);
    }
  };

  const applyTemplate = (template) => {
    setEntryMode('advanced');
    if (template === 'wire') {
      setAxes([
        { name: 'Length', values: '50m, 100m' },
        { name: 'Colour', values: 'Red, Brown, Black' },
      ]);
    } else if (template === 'bulb') {
      setAxes([{ name: 'Wattage', values: '12W, 20W, 30W, 50W' }]);
    } else {
      setAxes([{ name: 'Size', values: 'Small, Medium, Large' }]);
    }
  };

  const updateVariant = (key, patch) => {
    setVariants((current) => current.map((row) => (row.key === key ? { ...row, ...patch } : row)));
  };

  const applyDefaults = () => {
    setVariants((current) => current.map((row) => ({
      ...row,
      product_cost: defaults.product_cost,
      product_price: defaults.product_price,
      stock_alert: defaults.stock_alert,
      initial_quantity: defaults.initial_quantity,
    })));
  };

  const activeVariants = useMemo(() => variants.filter((row) => row.enabled), [variants]);

  const submit = async (event) => {
    event.preventDefault();
    setError('');
    if (!activeVariants.length) {
      setError('Generate or add at least one enabled variant.');
      return;
    }
    if (mode === 'create' && !common.product_category_id) {
      setError('Select a product category.');
      return;
    }

    const variantPayload = activeVariants.map((row, index) => ({
      label: row.label,
      attributes: row.attributes,
      code: String(row.code || '').trim() || null,
      barcode_symbol: row.code ? row.barcode_symbol : 'EAN13',
      product_cost: Number(row.product_cost),
      product_price: Number(row.product_price),
      stock_alert: Number(row.stock_alert || 0),
      sort_order: index,
      initial_stock: selectedWarehouse
        ? [{ warehouse_id: Number(selectedWarehouse), quantity: Number(row.initial_quantity || 0) }]
        : [],
    }));

    const stockUnit = common.product_unit ? Number(common.product_unit) : null;
    const payload = {
      name: common.name,
      family_code: String(common.family_code || '').trim() || null,
      product_category_id: common.product_category_id ? Number(common.product_category_id) : null,
      brand_id: common.brand_id ? Number(common.brand_id) : null,
      product_unit: stockUnit,
      sale_unit: common.sale_unit ? Number(common.sale_unit) : stockUnit,
      purchase_unit: common.purchase_unit ? Number(common.purchase_unit) : stockUnit,
      stock_alert: Number(common.stock_alert || 0),
      quantity_limit: common.quantity_limit === '' ? null : Number(common.quantity_limit),
      order_tax: Number(common.order_tax || 0),
      tax_type: common.tax_type,
      notes: common.notes,
      variants: variantPayload,
    };

    setSaving(true);
    try {
      if (mode === 'add') {
        await ProductsAPI.addVariants(familyId, { variants: variantPayload });
      } else if (mode === 'convert') {
        await ProductsAPI.convertToFamily(sourceProductId, {
          ...payload,
          existing_variant_name: existingLabel,
          existing_attributes: { Variant: existingLabel },
        });
      } else {
        await ProductsAPI.createFamily(payload);
      }
      navigate('/products');
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'The product variants could not be saved.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <Card className="p-6">Loading product family…</Card>;

  return (
    <div>
      <PageHeader
        title={title}
        subtitle="Create one product family, then manage each sellable size, colour, wattage or roll length as its own barcode, price and stock item."
        actions={<Button variant="secondary" onClick={() => navigate('/products')}>Back to products</Button>}
      />

      {error && <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

      <form onSubmit={submit} className="space-y-5">
        <Card className="p-5">
          <h2 className="font-display font-semibold mb-4">1. Product family</h2>
          {mode === 'add' && (
            <div className="mb-4 rounded-md bg-slate-50 border border-slate-200 p-3 text-sm">
              Family: <strong>{common.name}</strong> <span className="text-graphite-500">({common.family_code})</span>. Common category, brand and units are copied from the existing variants.
            </div>
          )}
          {mode === 'convert' && (
            <Field label="Name for the existing product variant" hint="The current product keeps its barcode, prices and stock and becomes the first variant.">
              <input required className={inputClass} value={existingLabel} onChange={(event) => setExistingLabel(event.target.value)} />
            </Field>
          )}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-x-4">
            <Field label="Family name"><input required disabled={mode === 'add'} className={`${inputClass} disabled:bg-slate-100`} value={common.name} onChange={(event) => setCommon({ ...common, name: event.target.value })} placeholder="DIMO LED Bulb" /></Field>
            <Field label="Family code" hint="Optional. A unique family code is generated when left empty."><input disabled={mode === 'add'} className={`${inputClass} disabled:bg-slate-100`} value={common.family_code} onChange={(event) => setCommon({ ...common, family_code: event.target.value })} placeholder="FAM-DIMO-LED" /></Field>
            <Field label="Category"><select required disabled={mode !== 'create'} className={`${inputClass} disabled:bg-slate-100`} value={common.product_category_id} onChange={(event) => setCommon({ ...common, product_category_id: event.target.value })}><option value="">Select…</option>{categories.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Field>
            <Field label="Brand"><select disabled={mode !== 'create'} className={`${inputClass} disabled:bg-slate-100`} value={common.brand_id} onChange={(event) => setCommon({ ...common, brand_id: event.target.value })}><option value="">None</option>{brands.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Field>
            <Field label="Stock unit"><select disabled={mode !== 'create'} className={`${inputClass} disabled:bg-slate-100`} value={common.product_unit} onChange={(event) => setCommon({ ...common, product_unit: event.target.value })}><option value="">None</option>{units.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Field>
            <Field label="Sale unit"><select disabled={mode !== 'create'} className={`${inputClass} disabled:bg-slate-100`} value={common.sale_unit} onChange={(event) => setCommon({ ...common, sale_unit: event.target.value })}><option value="">Same as stock unit</option>{units.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Field>
            <Field label="Purchase unit"><select disabled={mode !== 'create'} className={`${inputClass} disabled:bg-slate-100`} value={common.purchase_unit} onChange={(event) => setCommon({ ...common, purchase_unit: event.target.value })}><option value="">Same as stock unit</option>{units.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Field>
            <Field label="Tax %"><input disabled={mode !== 'create'} type="number" min="0" max="100" step="any" className={`${inputClass} disabled:bg-slate-100`} value={common.order_tax} onChange={(event) => setCommon({ ...common, order_tax: event.target.value })} /></Field>
            <Field label="Tax type"><select disabled={mode !== 'create'} className={`${inputClass} disabled:bg-slate-100`} value={common.tax_type} onChange={(event) => setCommon({ ...common, tax_type: event.target.value })}><option value="exclusive">Exclusive</option><option value="inclusive">Inclusive</option></select></Field>
          </div>
          {mode === 'create' && <Field label="Notes"><textarea rows={2} className={inputClass} value={common.notes} onChange={(event) => setCommon({ ...common, notes: event.target.value })} /></Field>}
        </Card>

        {existingVariants.length > 0 && (
          <Card className="p-5">
            <h2 className="font-display font-semibold mb-3">Existing variants</h2>
            <div className="flex flex-wrap gap-2">
              {existingVariants.map((variant) => (
                <span key={variant.id} className="rounded-full bg-slate-100 border border-slate-200 px-3 py-1 text-xs">
                  {variant.variant_name || variant.name} · {variant.code} · {formatMoney(variant.product_price)}
                </span>
              ))}
            </div>
          </Card>
        )}

        <Card className="p-5">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
            <div><h2 className="font-display font-semibold">2. Generate variants</h2><p className="text-xs text-graphite-500">Use quick paste for one-off labels or an attribute matrix for combinations.</p></div>
            <div className="flex gap-2"><Button type="button" variant={entryMode === 'quick' ? 'primary' : 'secondary'} onClick={() => setEntryMode('quick')}>Quick list</Button><Button type="button" variant={entryMode === 'advanced' ? 'primary' : 'secondary'} onClick={() => setEntryMode('advanced')}>Attribute matrix</Button></div>
          </div>

          {entryMode === 'quick' ? (
            <div className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-3 items-end">
              <Field label="Variant names" hint={'One per line or comma separated. Example: 50m Red, 100m Brown'}><textarea rows={4} className={inputClass} value={quickValues} onChange={(event) => setQuickValues(event.target.value)} placeholder={'50m Red\n100m Brown'} /></Field>
              <Button type="button" className="mb-3" onClick={generateQuick}>Add variants</Button>
            </div>
          ) : (
            <div>
              <div className="flex flex-wrap gap-2 mb-4"><Button type="button" variant="secondary" onClick={() => applyTemplate('wire')}>Wire roll template</Button><Button type="button" variant="secondary" onClick={() => applyTemplate('bulb')}>LED bulb template</Button><Button type="button" variant="secondary" onClick={() => applyTemplate('size')}>Size template</Button></div>
              <div className="space-y-3">
                {axes.map((axis, index) => (
                  <div key={index} className="grid grid-cols-1 md:grid-cols-[220px_1fr_auto] gap-3 items-end">
                    <Field label={`Attribute ${index + 1}`}><input className={inputClass} value={axis.name} onChange={(event) => setAxes(axes.map((row, rowIndex) => rowIndex === index ? { ...row, name: event.target.value } : row))} placeholder="Wattage" /></Field>
                    <Field label="Options" hint="Comma separated"><input className={inputClass} value={axis.values} onChange={(event) => setAxes(axes.map((row, rowIndex) => rowIndex === index ? { ...row, values: event.target.value } : row))} placeholder="12W, 20W, 50W" /></Field>
                    <Button type="button" variant="secondary" className="mb-3" disabled={axes.length === 1} onClick={() => setAxes(axes.filter((_, rowIndex) => rowIndex !== index))}>Remove</Button>
                  </div>
                ))}
              </div>
              <div className="flex gap-2"><Button type="button" variant="secondary" disabled={axes.length >= 3} onClick={() => setAxes([...axes, { name: '', values: '' }])}>+ Attribute</Button><Button type="button" onClick={generateMatrix}>Generate combinations</Button></div>
            </div>
          )}
        </Card>

        <Card className="p-5">
          <h2 className="font-display font-semibold mb-4">3. Prices and starting stock</h2>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3 items-end mb-4 rounded-md bg-slate-50 border border-slate-200 p-3">
            <Field label="Default cost"><input type="number" min="0" step="any" className={inputClass} value={defaults.product_cost} onChange={(event) => setDefaults({ ...defaults, product_cost: event.target.value })} /></Field>
            <Field label="Default selling"><input type="number" min="0" step="any" className={inputClass} value={defaults.product_price} onChange={(event) => setDefaults({ ...defaults, product_price: event.target.value })} /></Field>
            <Field label="Low-stock alert"><input type="number" min="0" step="any" className={inputClass} value={defaults.stock_alert} onChange={(event) => setDefaults({ ...defaults, stock_alert: event.target.value })} /></Field>
            <Field label="Starting quantity"><input type="number" min="0" step="any" className={inputClass} value={defaults.initial_quantity} onChange={(event) => setDefaults({ ...defaults, initial_quantity: event.target.value })} /></Field>
            <Button type="button" className="mb-3" variant="secondary" onClick={applyDefaults}>Apply to all</Button>
            <Field label="Starting-stock warehouse"><select className={inputClass} value={selectedWarehouse} onChange={(event) => setSelectedWarehouse(event.target.value)}><option value="">No starting stock</option>{warehouses.map((warehouse) => <option key={warehouse.id} value={warehouse.id}>{warehouse.name}</option>)}</select></Field>
          </div>

          {!variants.length && <div className="rounded-md border border-dashed border-slate-300 p-8 text-center text-sm text-graphite-500">Generate variants above. Each one will have its own barcode, cost, selling price and stock.</div>}
          {!!variants.length && (
            <div className="overflow-x-auto border border-slate-200 rounded-md">
              <table className="w-full text-xs min-w-[980px]">
                <thead className="bg-slate-50"><tr className="text-left"><th className="p-2">Use</th><th className="p-2">Variant</th><th className="p-2">Attributes</th><th className="p-2">Barcode / SKU</th><th className="p-2">Cost</th><th className="p-2">Selling</th><th className="p-2">Alert</th><th className="p-2">Start qty</th><th className="p-2" /></tr></thead>
                <tbody>{variants.map((row) => (
                  <tr key={row.key} className={`border-t border-slate-100 ${row.enabled ? '' : 'opacity-50 bg-slate-50'}`}>
                    <td className="p-2"><input type="checkbox" checked={row.enabled} onChange={(event) => updateVariant(row.key, { enabled: event.target.checked })} /></td>
                    <td className="p-2"><input required={row.enabled} className={`${inputClass} py-1`} value={row.label} onChange={(event) => updateVariant(row.key, { label: event.target.value })} /></td>
                    <td className="p-2"><div className="flex flex-wrap gap-1">{Object.entries(row.attributes).map(([name, value]) => <span key={name} className="rounded bg-slate-100 px-1.5 py-0.5">{name}: {value}</span>)}</div></td>
                    <td className="p-2"><input className={`${inputClass} py-1 font-mono`} value={row.code} onChange={(event) => updateVariant(row.key, { code: event.target.value, barcode_symbol: /^\d{13}$/.test(event.target.value.trim()) ? 'EAN13' : 'CODE128' })} placeholder="Auto EAN-13" /></td>
                    <td className="p-2"><input required={row.enabled} type="number" min="0" step="any" className={`${inputClass} py-1 w-24`} value={row.product_cost} onChange={(event) => updateVariant(row.key, { product_cost: event.target.value })} /></td>
                    <td className="p-2"><input required={row.enabled} type="number" min="0" step="any" className={`${inputClass} py-1 w-24`} value={row.product_price} onChange={(event) => updateVariant(row.key, { product_price: event.target.value })} /></td>
                    <td className="p-2"><input type="number" min="0" step="any" className={`${inputClass} py-1 w-20`} value={row.stock_alert} onChange={(event) => updateVariant(row.key, { stock_alert: event.target.value })} /></td>
                    <td className="p-2"><input type="number" min="0" step="any" className={`${inputClass} py-1 w-20`} value={row.initial_quantity} onChange={(event) => updateVariant(row.key, { initial_quantity: event.target.value })} /></td>
                    <td className="p-2"><button type="button" className="text-red-600 hover:underline" onClick={() => setVariants(variants.filter((item) => item.key !== row.key))}>Remove</button></td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          )}
        </Card>

        <div className="flex justify-end gap-2"><Button type="button" variant="secondary" onClick={() => navigate('/products')}>Cancel</Button><Button type="submit" disabled={saving}>{saving ? 'Saving variants…' : mode === 'add' ? 'Add variants' : 'Save product family'}</Button></div>
      </form>
    </div>
  );
}
