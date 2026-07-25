import React, { useEffect, useMemo, useState } from 'react';
import {
  Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart,
  Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import { DashboardAPI } from '../api/endpoints';
import { Card, PageHeader } from '../components/ui.jsx';
import { formatMoney, formatDate } from '../utils/format';
import { useAuth } from '../context/AuthContext.jsx';

const CHART_COLORS = ['#b7632c', '#40556b', '#d89b72', '#8092a6', '#6e8b74'];

function Stat({ label, value, note, accent = false }) {
  return (
    <Card className="p-5 min-w-0">
      <div className="text-xs uppercase tracking-wide text-graphite-500 font-medium mb-1">{label}</div>
      <div className={`font-display text-2xl font-semibold truncate ${accent ? 'text-copper-600' : 'text-graphite-950'}`}>{value}</div>
      {note && <div className="text-xs text-graphite-500 mt-1">{note}</div>}
    </Card>
  );
}

function MoneyTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-md border border-slate-200 bg-white px-3 py-2 shadow-lg text-xs">
      <div className="font-medium text-graphite-800 mb-1">{label}</div>
      {payload.map((item) => (
        <div key={item.dataKey} className="flex justify-between gap-5" style={{ color: item.color }}>
          <span>{item.name}</span><span className="font-medium">{formatMoney(item.value)}</span>
        </div>
      ))}
    </div>
  );
}

function dayLabel(value) {
  const date = new Date(`${value}T00:00:00`);
  return date.toLocaleDateString('en-LK', { weekday: 'short', day: 'numeric' });
}

function monthLabel(value) {
  const date = new Date(`${value}-01T00:00:00`);
  return date.toLocaleDateString('en-LK', { month: 'short' });
}

export default function Dashboard() {
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = () => {
    setLoading(true);
    setError('');
    DashboardAPI.summary(user?.warehouse_id)
      .then((res) => setData(res.data.data))
      .catch((requestError) => setError(requestError.response?.data?.message || 'Dashboard data could not be loaded.'))
      .finally(() => setLoading(false));
  };

  useEffect(load, [user?.warehouse_id]);

  const topProductChart = useMemo(() => (data?.top_selling_products || []).map((product) => ({
    name: product.name.length > 18 ? `${product.name.slice(0, 18)}…` : product.name,
    quantity: Number(product.total_quantity || 0),
    revenue: Number(product.total_revenue || 0),
  })), [data]);

  if (loading) return <div className="text-graphite-500">Loading dashboard…</div>;
  if (error) return <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-700">{error}</div>;
  if (!data) return <div className="text-graphite-500">No data available.</div>;

  return (
    <div>
      <PageHeader
        title={`Welcome back, ${user?.name?.split(' ')[0] || ''}`}
        subtitle="Sales, purchases, customers and stock at a glance."
        actions={<button type="button" onClick={load} className="text-sm text-copper-600 hover:underline">Refresh</button>}
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 mb-4">
        <Stat label="Today's net sales" value={formatMoney(data.today_net_sales)} note={`Returns: ${formatMoney(data.today_sale_returns)}`} accent />
        <Stat label="Today's purchases" value={formatMoney(data.today_purchases)} note={`Returns: ${formatMoney(data.today_purchase_returns)}`} />
        <Stat label="Payments received" value={formatMoney(data.today_received)} note="Recorded against today's sales" />
        <Stat label="Today's expenses" value={formatMoney(data.today_expenses)} />
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <Stat label="Month sales" value={formatMoney(data.month_sales)} />
        <Stat label="Month purchases" value={formatMoney(data.month_purchases)} />
        <Stat label="Estimated month result" value={formatMoney(data.month_profit_estimate)} note="Net sales − net purchases − expenses" accent />
        <Stat label="Stock cost value" value={formatMoney(data.stock_value)} note="Current quantity × current cost" />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 mb-6">
        <Card className="p-5 xl:col-span-2">
          <div className="mb-4">
            <h3 className="font-display font-semibold">Sales and purchases — last 7 days</h3>
            <p className="text-xs text-graphite-500 mt-0.5">Daily movement based on saved transactions.</p>
          </div>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data.weekly_activity || []} margin={{ top: 5, right: 12, left: 6, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="date" tickFormatter={dayLabel} tick={{ fontSize: 11 }} />
                <YAxis tickFormatter={(value) => Number(value).toLocaleString('en-LK')} tick={{ fontSize: 11 }} width={70} />
                <Tooltip content={<MoneyTooltip />} />
                <Legend />
                <Line type="monotone" dataKey="sales" name="Sales" stroke="#b7632c" strokeWidth={3} dot={{ r: 3 }} />
                <Line type="monotone" dataKey="purchases" name="Purchases" stroke="#40556b" strokeWidth={3} dot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card className="p-5">
          <h3 className="font-display font-semibold">Top customers this month</h3>
          <p className="text-xs text-graphite-500 mt-0.5 mb-3">By invoiced value.</p>
          {(data.top_customers || []).length ? (
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={data.top_customers} dataKey="grand_total" nameKey="name" innerRadius={52} outerRadius={88} paddingAngle={2}>
                    {data.top_customers.map((customer, index) => <Cell key={customer.id} fill={CHART_COLORS[index % CHART_COLORS.length]} />)}
                  </Pie>
                  <Tooltip formatter={(value) => formatMoney(value)} />
                  <Legend verticalAlign="bottom" height={46} wrapperStyle={{ fontSize: 11 }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          ) : <p className="text-sm text-graphite-500 py-12 text-center">No customer sales this month.</p>}
        </Card>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 mb-6">
        <Card className="p-5">
          <h3 className="font-display font-semibold">Six-month business trend</h3>
          <p className="text-xs text-graphite-500 mt-0.5 mb-3">Sales, purchases and operating expenses.</p>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.monthly_trend || []} margin={{ top: 5, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="month" tickFormatter={monthLabel} tick={{ fontSize: 11 }} />
                <YAxis tickFormatter={(value) => Number(value).toLocaleString('en-LK')} tick={{ fontSize: 11 }} width={70} />
                <Tooltip content={<MoneyTooltip />} />
                <Legend />
                <Bar dataKey="sales" name="Sales" fill="#b7632c" radius={[4, 4, 0, 0]} />
                <Bar dataKey="purchases" name="Purchases" fill="#40556b" radius={[4, 4, 0, 0]} />
                <Bar dataKey="expenses" name="Expenses" fill="#d89b72" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card className="p-5">
          <h3 className="font-display font-semibold">Top-selling products this month</h3>
          <p className="text-xs text-graphite-500 mt-0.5 mb-3">Quantity sold; hover for the exact value.</p>
          {topProductChart.length ? (
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={topProductChart} layout="vertical" margin={{ top: 0, right: 20, left: 25, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 11 }} />
                  <YAxis type="category" dataKey="name" width={115} tick={{ fontSize: 11 }} />
                  <Tooltip formatter={(value, name) => name === 'Revenue' ? formatMoney(value) : Number(value).toLocaleString('en-LK')} />
                  <Bar dataKey="quantity" name="Quantity sold" fill="#b7632c" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : <p className="text-sm text-graphite-500 py-12 text-center">No product sales this month.</p>}
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        <Card className="overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
            <h3 className="font-display font-semibold">Low-stock alerts</h3>
            <span className="text-xs text-graphite-500">{(data.low_stock_products || []).length} shown</span>
          </div>
          {(!data.low_stock_products || data.low_stock_products.length === 0) && (
            <p className="text-sm text-graphite-500 p-5">Nothing is running low right now.</p>
          )}
          <div className="divide-y divide-slate-100">
            {(data.low_stock_products || []).map((product) => (
              <div key={product.id} className="px-5 py-3 flex justify-between gap-4 text-sm">
                <div><div className="font-medium">{product.name}</div><div className="text-xs text-graphite-400">{product.code} · alert at {product.stock_alert}</div></div>
                <span className="text-red-600 font-semibold whitespace-nowrap">{product.total_stock} left</span>
              </div>
            ))}
          </div>
        </Card>

        <Card className="overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100"><h3 className="font-display font-semibold">Recent sales</h3></div>
          {(!data.recent_sales || data.recent_sales.length === 0) && <p className="text-sm text-graphite-500 p-5">No sales recorded yet.</p>}
          <div className="divide-y divide-slate-100">
            {(data.recent_sales || []).map((sale) => (
              <div key={sale.id} className="px-5 py-3 flex justify-between gap-4 text-sm">
                <div>
                  <div className="font-medium">{sale.reference_code}</div>
                  <div className="text-xs text-graphite-400">{sale.Customer?.name || 'Walk-in customer'} · {formatDate(sale.date)}</div>
                </div>
                <div className="text-right"><div className="font-semibold">{formatMoney(sale.grand_total)}</div><div className="text-xs capitalize text-graphite-400">{sale.payment_status}</div></div>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <Stat label="Customers" value={data.customer_count} />
        <Stat label="Suppliers" value={data.supplier_count} />
        <Stat label="Active products" value={data.product_count} />
      </div>
    </div>
  );
}
