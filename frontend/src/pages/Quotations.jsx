import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { QuotationsHoldsAPI } from '../api/endpoints';
import { Button, PageHeader, Card } from '../components/ui.jsx';
import { formatMoney, formatDate } from '../utils/format';
import DocumentActions from '../components/DocumentActions.jsx';

const STATUS_STYLES = {
  sent: 'bg-blue-50 text-blue-700 border-blue-100',
  converted: 'bg-emerald-50 text-emerald-700 border-emerald-100',
  expired: 'bg-amber-50 text-amber-700 border-amber-100',
  cancelled: 'bg-red-50 text-red-700 border-red-100',
};

export default function Quotations() {
  const navigate = useNavigate();
  const [quotations, setQuotations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  const load = () => {
    setLoading(true);
    setError('');
    QuotationsHoldsAPI.listQuotations(statusFilter ? { status: statusFilter } : undefined)
      .then((r) => setQuotations(r.data.data || r.data))
      .catch((e) => setError(e.response?.data?.message || 'Failed to load quotations.'))
      .finally(() => setLoading(false));
  };
  useEffect(load, [statusFilter]);

  return (
    <div>
      <PageHeader
        title="Quotations"
        subtitle="Price quotes for customers before they commit to a sale. Build them on a full page — see your margin, then convert straight into an invoice."
        actions={<Button onClick={() => navigate('/quotations/new')}>+ New Quotation</Button>}
      />

      <Card className="p-3 mb-4 flex items-center gap-2">
        <span className="text-xs font-medium text-graphite-600">Status</span>
        <select className="rounded-md border border-slate-200 text-sm px-2 py-1.5" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <option value="">All</option>
          <option value="sent">Open (sent)</option>
          <option value="converted">Converted to sale</option>
          <option value="expired">Expired</option>
          <option value="cancelled">Cancelled</option>
        </select>
      </Card>

      {error && <div className="mb-4 text-sm text-red-600 bg-red-50 border border-red-100 rounded-md px-3 py-2">{error}</div>}

      <Card>
        <table className="w-full text-sm">
          <thead><tr className="border-b border-slate-200 text-left text-graphite-600">
            <th className="px-4 py-3 font-medium">Ref</th><th className="px-4 py-3 font-medium">Date</th>
            <th className="px-4 py-3 font-medium">Customer</th><th className="px-4 py-3 font-medium">Total</th><th className="px-4 py-3 font-medium">Status</th><th className="px-4 py-3 font-medium text-right">Output</th>
          </tr></thead>
          <tbody>
            {loading && <tr><td colSpan={6} className="px-4 py-6 text-center text-graphite-500">Loading…</td></tr>}
            {!loading && quotations.length === 0 && <tr><td colSpan={6} className="px-4 py-6 text-center text-graphite-500">No quotations yet.</td></tr>}
            {!loading && quotations.map((q) => (
              <tr key={q.id} className="border-b border-slate-100 hover:bg-slate-50 cursor-pointer" onClick={() => navigate(`/quotations/${q.id}`)}>
                <td className="px-4 py-2.5 font-mono text-xs">{q.reference_code}</td>
                <td className="px-4 py-2.5">{formatDate(q.date)}</td>
                <td className="px-4 py-2.5">{q.Customer?.name}</td>
                <td className="px-4 py-2.5">{formatMoney(q.grand_total)}</td>
                <td className="px-4 py-2.5">
                  <span className={`inline-block rounded-full border px-2 py-0.5 text-xs capitalize ${STATUS_STYLES[q.status] || 'bg-slate-50 text-slate-700 border-slate-200'}`}>{q.status}</span>
                </td>
                <td className="px-4 py-2.5"><div className="flex justify-end"><DocumentActions type="quotation" record={q} compact /></div></td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
