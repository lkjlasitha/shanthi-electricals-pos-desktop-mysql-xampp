import React, { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ReturnsAPI, SalesAPI, PurchasesAPI } from '../api/endpoints';
import { PageHeader, Card, Button, Modal, Field, inputClass } from '../components/ui.jsx';
import { formatMoney, formatDate, todayISO } from '../utils/format';
import DocumentActions from '../components/DocumentActions.jsx';

function asList(response) {
  return response?.data?.data || response?.data || [];
}

export default function Returns() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [saleReturns, setSaleReturns] = useState([]);
  const [purchaseReturns, setPurchaseReturns] = useState([]);
  const [sales, setSales] = useState([]);
  const [purchases, setPurchases] = useState([]);
  const [loading, setLoading] = useState(true);
  const [success, setSuccess] = useState('');

  const [returnType, setReturnType] = useState(null);
  const [sourceId, setSourceId] = useState('');
  const [sourceData, setSourceData] = useState(null);
  const [quantities, setQuantities] = useState({});
  const [date, setDate] = useState(todayISO());
  const [notes, setNotes] = useState('');
  const [formError, setFormError] = useState('');
  const [sourceLoading, setSourceLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const [saleReturnResponse, purchaseReturnResponse, salesResponse, purchasesResponse] = await Promise.all([
        ReturnsAPI.listSaleReturns(),
        ReturnsAPI.listPurchaseReturns(),
        SalesAPI.list({ per_page: 200 }),
        PurchasesAPI.list({ per_page: 200 }),
      ]);
      setSaleReturns(asList(saleReturnResponse));
      setPurchaseReturns(asList(purchaseReturnResponse));
      setSales(asList(salesResponse));
      setPurchases(asList(purchasesResponse));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const openReturn = (type, id = '') => {
    setReturnType(type);
    setSourceId(id ? String(id) : '');
    setSourceData(null);
    setQuantities({});
    setDate(todayISO());
    setNotes('');
    setFormError('');
  };

  useEffect(() => {
    const saleId = searchParams.get('sale_id');
    const purchaseId = searchParams.get('purchase_id');
    if (saleId) openReturn('sale', saleId);
    else if (purchaseId) openReturn('purchase', purchaseId);
    if (saleId || purchaseId) setSearchParams({}, { replace: true });
    // The URL parameters are intentionally consumed only once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!returnType || !sourceId) {
      setSourceData(null);
      setQuantities({});
      return;
    }

    let active = true;
    setSourceLoading(true);
    setFormError('');
    const request = returnType === 'sale'
      ? ReturnsAPI.saleReturnable(sourceId)
      : ReturnsAPI.purchaseReturnable(sourceId);

    request.then((response) => {
      if (!active) return;
      const data = response.data.data;
      setSourceData(data);
      setQuantities(Object.fromEntries((data.items || []).map((item) => [item.product_id, ''])));
    }).catch((error) => {
      if (!active) return;
      setSourceData(null);
      setFormError(error.response?.data?.message || 'The source document could not be loaded.');
    }).finally(() => {
      if (active) setSourceLoading(false);
    });

    return () => { active = false; };
  }, [returnType, sourceId]);

  const selectedItems = useMemo(() => (sourceData?.items || []).filter((item) => Number(quantities[item.product_id] || 0) > 0), [sourceData, quantities]);
  const returnTotal = useMemo(() => selectedItems.reduce((total, item) => {
    const unitValue = returnType === 'sale' ? item.unit_price : item.unit_cost;
    return total + Number(quantities[item.product_id] || 0) * Number(unitValue || 0);
  }, 0), [selectedItems, quantities, returnType]);

  const submitReturn = async (event) => {
    event.preventDefault();
    setFormError('');
    if (!sourceId) return setFormError(`Select the original ${returnType === 'sale' ? 'sale' : 'purchase'}.`);
    if (!selectedItems.length) return setFormError('Enter a return quantity for at least one item.');

    for (const item of selectedItems) {
      const quantity = Number(quantities[item.product_id]);
      if (quantity > Number(item.returnable_quantity)) {
        return setFormError(`${item.product_name}: only ${item.returnable_quantity} can still be returned.`);
      }
    }

    setSaving(true);
    try {
      const payload = {
        date,
        notes,
        items: selectedItems.map((item) => ({
          product_id: item.product_id,
          quantity: Number(quantities[item.product_id]),
        })),
      };
      if (returnType === 'sale') {
        payload.sale_id = Number(sourceId);
        await ReturnsAPI.createSaleReturn(payload);
      } else {
        payload.purchase_id = Number(sourceId);
        await ReturnsAPI.createPurchaseReturn(payload);
      }
      setReturnType(null);
      setSuccess(returnType === 'sale'
        ? 'Customer return created and stock was added back to the warehouse.'
        : 'Supplier return created and stock was deducted from the warehouse.');
      await load();
    } catch (error) {
      setFormError(error.response?.data?.message || 'Return could not be created.');
    } finally {
      setSaving(false);
    }
  };

  const sourceOptions = returnType === 'sale' ? sales : purchases.filter((purchase) => purchase.status === 'received');
  const sourceLabel = returnType === 'sale' ? 'sale invoice' : 'purchase';
  const sourceParty = sourceData?.source?.Customer?.name || sourceData?.source?.Supplier?.name || '—';
  const sourceWarehouse = sourceData?.source?.Warehouse?.name || '—';

  return (
    <div className="space-y-8">
      <PageHeader
        title="Returns"
        subtitle="Create customer credit notes and supplier returns against the original transaction. Returned quantities are checked automatically."
        actions={(
          <>
            <Button variant="secondary" onClick={() => openReturn('purchase')}>+ Supplier Return</Button>
            <Button onClick={() => openReturn('sale')}>+ Customer Return</Button>
          </>
        )}
      />

      {success && <div className="rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{success}</div>}
      {loading && <div className="text-sm text-graphite-500">Loading returns…</div>}

      <div>
        <h3 className="font-display font-semibold mb-3">Sale Returns (customer brought item back)</h3>
        <Card className="overflow-x-auto">
          <table className="w-full text-sm min-w-[720px]">
            <thead><tr className="border-b border-slate-200 text-left text-graphite-600">
              <th className="px-4 py-3 font-medium">Ref</th><th className="px-4 py-3 font-medium">Original invoice</th><th className="px-4 py-3 font-medium">Date</th><th className="px-4 py-3 font-medium">Customer</th><th className="px-4 py-3 font-medium">Total</th><th className="px-4 py-3 font-medium text-right">Output</th>
            </tr></thead>
            <tbody>
              {!loading && saleReturns.length === 0 && <tr><td colSpan={6} className="px-4 py-6 text-center text-graphite-500">No sale returns yet.</td></tr>}
              {saleReturns.map((row) => (
                <tr key={row.id} className="border-b border-slate-100">
                  <td className="px-4 py-2.5 font-mono text-xs">{row.reference_code}</td>
                  <td className="px-4 py-2.5 font-mono text-xs text-copper-600">{row.Sale?.reference_code || '—'}</td>
                  <td className="px-4 py-2.5">{formatDate(row.date)}</td>
                  <td className="px-4 py-2.5">{row.Customer?.name}</td>
                  <td className="px-4 py-2.5">{formatMoney(row.grand_total)}</td>
                  <td className="px-4 py-2.5"><div className="flex justify-end"><DocumentActions type="sale-return" record={row} compact /></div></td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </div>

      <div>
        <h3 className="font-display font-semibold mb-3">Purchase Returns (sent back to supplier)</h3>
        <Card className="overflow-x-auto">
          <table className="w-full text-sm min-w-[720px]">
            <thead><tr className="border-b border-slate-200 text-left text-graphite-600">
              <th className="px-4 py-3 font-medium">Ref</th><th className="px-4 py-3 font-medium">Original purchase</th><th className="px-4 py-3 font-medium">Date</th><th className="px-4 py-3 font-medium">Supplier</th><th className="px-4 py-3 font-medium">Total</th><th className="px-4 py-3 font-medium text-right">Output</th>
            </tr></thead>
            <tbody>
              {!loading && purchaseReturns.length === 0 && <tr><td colSpan={6} className="px-4 py-6 text-center text-graphite-500">No purchase returns yet.</td></tr>}
              {purchaseReturns.map((row) => (
                <tr key={row.id} className="border-b border-slate-100">
                  <td className="px-4 py-2.5 font-mono text-xs">{row.reference_code}</td>
                  <td className="px-4 py-2.5 font-mono text-xs text-copper-600">{row.Purchase?.reference_code || '—'}</td>
                  <td className="px-4 py-2.5">{formatDate(row.date)}</td>
                  <td className="px-4 py-2.5">{row.Supplier?.name}</td>
                  <td className="px-4 py-2.5">{formatMoney(row.grand_total)}</td>
                  <td className="px-4 py-2.5"><div className="flex justify-end"><DocumentActions type="purchase-return" record={row} compact /></div></td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </div>

      <Modal open={!!returnType} onClose={() => setReturnType(null)} title={returnType === 'sale' ? 'New Customer Return' : 'New Supplier Return'} width="max-w-4xl">
        <form onSubmit={submitReturn}>
          {formError && <div className="mb-3 rounded-md border border-red-100 bg-red-50 px-3 py-2 text-sm text-red-600">{formError}</div>}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label={`Original ${sourceLabel}`}>
              <select required className={inputClass} value={sourceId} onChange={(event) => setSourceId(event.target.value)}>
                <option value="">Select…</option>
                {sourceOptions.map((source) => (
                  <option key={source.id} value={source.id}>
                    {source.reference_code} · {formatDate(source.date)} · {source.Customer?.name || source.Supplier?.name || ''}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Return date"><input required type="date" className={inputClass} value={date} onChange={(event) => setDate(event.target.value)} /></Field>
          </div>

          {sourceLoading && <div className="rounded-md border border-slate-200 p-4 text-sm text-graphite-500">Loading returnable quantities…</div>}
          {sourceData && (
            <>
              <div className="mb-4 grid grid-cols-1 sm:grid-cols-3 gap-3 rounded-md bg-slate-50 p-3 text-sm">
                <div><span className="text-graphite-500">Reference</span><div className="font-mono text-xs">{sourceData.source.reference_code}</div></div>
                <div><span className="text-graphite-500">Customer / supplier</span><div>{sourceParty}</div></div>
                <div><span className="text-graphite-500">Warehouse</span><div>{sourceWarehouse}</div></div>
              </div>

              <div className="overflow-x-auto rounded-md border border-slate-200 mb-4">
                <table className="w-full text-sm min-w-[720px]">
                  <thead><tr className="bg-slate-50 text-left text-graphite-600">
                    <th className="px-3 py-2">Product</th><th className="px-3 py-2 text-right">Original</th><th className="px-3 py-2 text-right">Already returned</th><th className="px-3 py-2 text-right">Available</th><th className="px-3 py-2 text-right">Unit value</th><th className="px-3 py-2 w-32">Return qty</th>
                  </tr></thead>
                  <tbody>{sourceData.items.map((item) => {
                    const unitValue = returnType === 'sale' ? item.unit_price : item.unit_cost;
                    return (
                      <tr key={item.product_id} className="border-t border-slate-100">
                        <td className="px-3 py-2"><div className="font-medium">{item.product_name}</div><div className="font-mono text-[11px] text-graphite-400">{item.product_code}</div></td>
                        <td className="px-3 py-2 text-right">{item.document_quantity}</td>
                        <td className="px-3 py-2 text-right">{item.returned_quantity}</td>
                        <td className="px-3 py-2 text-right font-medium">{item.returnable_quantity}</td>
                        <td className="px-3 py-2 text-right">{formatMoney(unitValue)}</td>
                        <td className="px-3 py-2"><input type="number" min="0" max={item.returnable_quantity} step="any" disabled={item.returnable_quantity <= 0} className={`${inputClass} py-1 disabled:bg-slate-100`} value={quantities[item.product_id] ?? ''} onChange={(event) => setQuantities({ ...quantities, [item.product_id]: event.target.value })} /></td>
                      </tr>
                    );
                  })}</tbody>
                </table>
              </div>
              {!sourceData.items.some((item) => item.returnable_quantity > 0) && <div className="mb-4 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">Every item on this document has already been fully returned.</div>}
            </>
          )}

          <Field label="Reason / notes"><textarea rows={2} className={inputClass} value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Optional return reason, condition, or supplier note" /></Field>
          <div className="flex items-center justify-between border-t border-slate-200 pt-4">
            <div className="font-display font-semibold">Return total: <span className="text-copper-600">{formatMoney(returnTotal)}</span></div>
            <div className="flex gap-2"><Button type="button" variant="secondary" onClick={() => setReturnType(null)}>Cancel</Button><Button type="submit" disabled={saving || !sourceData}>{saving ? 'Saving…' : 'Create Return'}</Button></div>
          </div>
        </form>
      </Modal>
    </div>
  );
}
