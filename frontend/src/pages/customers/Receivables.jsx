import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CustomersAPI } from '../../api/endpoints';
import { Button, Card, PageHeader } from '../../components/ui.jsx';
import { formatMoney } from '../../utils/format';

export default function Receivables() {
  const navigate = useNavigate();
  const [rows, setRows] = useState([]);
  const [totals, setTotals] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    setLoading(true);
    CustomersAPI.receivables()
      .then((r) => { setRows(r.data.data || []); setTotals(r.data.totals || null); })
      .catch((e) => setError(e.response?.data?.message || 'Could not load receivables.'))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div>
      <PageHeader
        title="Accounts Receivable"
        subtitle="Every customer who currently owes the shop money, largest balance first."
        actions={<Button variant="secondary" onClick={() => navigate('/customers')}>Back to customers</Button>}
      />

      {totals && (
        <Card className="p-5 grid grid-cols-2 sm:grid-cols-3 gap-4 mb-6">
          <div>
            <div className="text-xs uppercase tracking-wide text-graphite-500 font-medium">Total outstanding</div>
            <div className="font-display text-2xl font-semibold text-amber-700">{formatMoney(totals.outstanding_receivables)}</div>
          </div>
          <div>
            <div className="text-xs uppercase tracking-wide text-graphite-500 font-medium">From unpaid bills</div>
            <div className="font-display text-xl font-semibold">{formatMoney(totals.outstanding_from_sales)}</div>
          </div>
          <div>
            <div className="text-xs uppercase tracking-wide text-graphite-500 font-medium">From opening balances</div>
            <div className="font-display text-xl font-semibold">{formatMoney(totals.outstanding_from_opening_balance)}</div>
          </div>
        </Card>
      )}

      {error && <div className="mb-4 text-sm text-red-600 bg-red-50 border border-red-100 rounded-md px-3 py-2">{error}</div>}

      <Card>
        <table className="w-full text-sm">
          <thead><tr className="border-b border-slate-200 text-left text-graphite-600">
            <th className="px-4 py-3 font-medium">Customer</th><th className="px-4 py-3 font-medium">Phone</th>
            <th className="px-4 py-3 font-medium">Type</th><th className="px-4 py-3 font-medium">Amount due</th>
          </tr></thead>
          <tbody>
            {loading && <tr><td colSpan={4} className="px-4 py-6 text-center text-graphite-500">Loading…</td></tr>}
            {!loading && rows.length === 0 && <tr><td colSpan={4} className="px-4 py-6 text-center text-graphite-500">No outstanding balances — everyone's paid up.</td></tr>}
            {!loading && rows.map((row) => (
              <tr key={row.id} className="border-b border-slate-100 hover:bg-slate-50 cursor-pointer" onClick={() => navigate(`/customers/${row.id}`)}>
                <td className="px-4 py-2.5 font-medium text-graphite-900">{row.name}</td>
                <td className="px-4 py-2.5">{row.phone}</td>
                <td className="px-4 py-2.5 capitalize">{row.customer_type}</td>
                <td className="px-4 py-2.5">
                  <span className={`font-medium ${row.over_credit_limit ? 'text-red-600' : 'text-amber-700'}`}>
                    {formatMoney(row.total_due)}{row.over_credit_limit && <span className="ml-1 text-[10px] uppercase">over limit</span>}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
