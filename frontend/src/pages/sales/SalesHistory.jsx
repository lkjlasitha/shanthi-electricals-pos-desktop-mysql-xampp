import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { SalesAPI } from '../../api/endpoints';
import { PageHeader, Card, Modal, Button, inputClass } from '../../components/ui.jsx';
import { formatMoney, formatDate } from '../../utils/format';
import DocumentActions from '../../components/DocumentActions.jsx';

export default function SalesHistory() {
  const navigate = useNavigate();
  const [sales, setSales] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState(null);
  const [error, setError] = useState('');

  const load = () => {
    setLoading(true);
    setError('');
    SalesAPI.list({ reference_code: search || undefined, per_page: 50 }).then((r) => setSales(r.data.data || r.data)).catch((requestError) => setError(requestError.response?.data?.message || 'Sales could not be loaded.')).finally(() => setLoading(false));
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [search]);

  return (
    <div>
      <PageHeader title="Sales History" subtitle="All completed POS sales." />
      {error && <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
      <Card className="p-4 mb-4">
        <input className={inputClass + ' max-w-xs'} placeholder="Search by invoice ref…" value={search} onChange={(e) => setSearch(e.target.value)} />
      </Card>
      <Card>
        <table className="w-full text-sm">
          <thead><tr className="border-b border-slate-200 text-left text-graphite-600">
            <th className="px-4 py-3 font-medium">Invoice</th><th className="px-4 py-3 font-medium">Date</th>
            <th className="px-4 py-3 font-medium">Customer</th><th className="px-4 py-3 font-medium">Warehouse</th>
            <th className="px-4 py-3 font-medium">Total</th><th className="px-4 py-3 font-medium">Payment</th><th className="px-4 py-3 font-medium text-right">Output</th>
          </tr></thead>
          <tbody>
            {loading && <tr><td colSpan={7} className="px-4 py-6 text-center text-graphite-500">Loading…</td></tr>}
            {!loading && sales.length === 0 && <tr><td colSpan={7} className="px-4 py-6 text-center text-graphite-500">No sales yet.</td></tr>}
            {!loading && sales.map((s) => (
              <tr key={s.id} className="border-b border-slate-100 hover:bg-slate-50 cursor-pointer" onClick={() => setSelected(s)}>
                <td className="px-4 py-2.5 font-mono text-xs text-copper-600">{s.reference_code}</td>
                <td className="px-4 py-2.5">{formatDate(s.date)}</td>
                <td className="px-4 py-2.5">{s.Customer?.name}</td>
                <td className="px-4 py-2.5">{s.Warehouse?.name}</td>
                <td className="px-4 py-2.5">{formatMoney(s.grand_total)}</td>
                <td className="px-4 py-2.5 capitalize">
                  <div>{s.payment_status}</div>
                  {s.payment_status !== 'paid' && <div className="text-[11px] normal-case text-amber-700">Due {formatMoney(Math.max(0, Number(s.grand_total) - Number(s.paid_amount)))}{s.due_date ? ` · ${formatDate(s.due_date)}` : ''}</div>}
                </td>
                <td className="px-4 py-2.5"><div className="flex justify-end"><DocumentActions type="sale" record={s} allowReceipt compact /></div></td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <Modal open={!!selected} onClose={() => setSelected(null)} title={`Invoice ${selected?.reference_code || ''}`} width="max-w-xl">
        {selected && (
          <div className="text-sm space-y-3">
            <div className="flex justify-between text-graphite-600">
              <span>{formatDate(selected.date)}</span>
              <span>{selected.Customer?.name} · {selected.Warehouse?.name}</span>
            </div>
            <table className="w-full">
              <thead><tr className="text-left text-graphite-500 border-b border-slate-100">
                <th className="py-1">Item</th><th className="py-1 text-right">Qty</th><th className="py-1 text-right">Price</th><th className="py-1 text-right">Subtotal</th>
              </tr></thead>
              <tbody>
                {(selected.items || []).map((it) => (
                  <tr key={it.id} className="border-b border-slate-50">
                    <td className="py-1">
                      <div>{it.item_name || it.Product?.name || (it.product_id ? `Product #${it.product_id}` : 'Manual item')}</div>
                      {it.is_manual && <div className="text-[10px] uppercase tracking-wide text-amber-700">Manual bill item</div>}
                      {Number(it.discount_amount || 0) > 0 && <div className="text-xs text-emerald-700">Discount: {formatMoney(it.discount_amount)}</div>}
                    </td>
                    <td className="py-1 text-right">{it.quantity}</td>
                    <td className="py-1 text-right">{formatMoney(it.product_price)}</td>
                    <td className="py-1 text-right">{formatMoney(it.sub_total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="flex justify-between pt-2 border-t border-slate-200 font-display font-semibold text-base">
              <span>Total</span><span className="text-copper-600">{formatMoney(selected.grand_total)}</span>
            </div>
            <div className="grid grid-cols-3 gap-2 rounded-md bg-slate-50 p-2 text-xs">
              <div><span className="block text-graphite-500">Paid</span><strong>{formatMoney(selected.paid_amount)}</strong></div>
              <div><span className="block text-graphite-500">Balance due</span><strong>{formatMoney(Math.max(0, Number(selected.grand_total) - Number(selected.paid_amount)))}</strong></div>
              <div><span className="block text-graphite-500">Due date</span><strong>{selected.due_date ? formatDate(selected.due_date) : '—'}</strong></div>
            </div>
            <div className="pt-3 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2">
              <DocumentActions type="sale" record={selected} allowReceipt />
              {(selected.items || []).some((item) => item.product_id) ? (
                <Button type="button" onClick={() => navigate(`/returns?sale_id=${selected.id}`)}>Create Customer Return</Button>
              ) : (
                <span className="text-xs text-graphite-500">Manual bill items do not change stock and have no stock return.</span>
              )}
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
