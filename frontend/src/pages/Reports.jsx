import React, { useEffect, useMemo, useState } from 'react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { ReportsAPI } from '../api/endpoints';
import { PageHeader, Card, Field, Button, inputClass } from '../components/ui.jsx';
import { formatMoney, formatDate, todayISO } from '../utils/format';
import { saveResponseBlob } from '../utils/download';
import { printReport } from '../utils/printDocuments';
import { getDocumentSettings } from '../components/DocumentActions.jsx';

const TABS = ['Sales', 'Purchases', 'Top Products', 'Stock Valuation'];

export default function Reports() {
  const [tab, setTab] = useState('Sales');
  const [fromDate, setFromDate] = useState(todayISO().slice(0, 8) + '01');
  const [toDate, setToDate] = useState(todayISO());
  const [sales, setSales] = useState([]);
  const [purchases, setPurchases] = useState([]);
  const [products, setProducts] = useState([]);
  const [stock, setStock] = useState({ data: [], totals: {} });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState('');

  useEffect(() => {
    let active = true;
    const load = async () => {
      setLoading(true);
      setError('');
      const params = { from_date: fromDate, to_date: toDate };
      try {
        const [salesResponse, purchasesResponse, productsResponse, stockResponse] = await Promise.all([
          ReportsAPI.sales(params),
          ReportsAPI.purchases(params),
          ReportsAPI.productSales(params),
          ReportsAPI.stock(),
        ]);
        if (!active) return;
        setSales(salesResponse.data.data || []);
        setPurchases(purchasesResponse.data.data || []);
        setProducts(productsResponse.data.data || []);
        setStock(stockResponse.data || { data: [], totals: {} });
      } catch (requestError) {
        if (active) setError(requestError.response?.data?.message || 'Could not load reports.');
      } finally {
        if (active) setLoading(false);
      }
    };
    load();
    return () => { active = false; };
  }, [fromDate, toDate]);

  const current = useMemo(() => {
    if (tab === 'Sales') {
      const rows = sales.map((row) => ({ ...row, balance: Number(row.total_sales || 0) - Number(row.total_paid || 0) }));
      return {
        type: 'sales',
        title: 'Sales Report',
        rows,
        columns: [
          { key: 'date', label: 'Date' },
          { key: 'invoice_count', label: 'Invoices', align: 'right' },
          { key: 'total_sales', label: 'Total Sales', type: 'money', align: 'right' },
          { key: 'total_paid', label: 'Paid', type: 'money', align: 'right' },
          { key: 'balance', label: 'Balance', type: 'money', align: 'right' },
        ],
        totals: {
          invoice_count: rows.reduce((sum, row) => sum + Number(row.invoice_count || 0), 0),
          total_sales: rows.reduce((sum, row) => sum + Number(row.total_sales || 0), 0),
          total_paid: rows.reduce((sum, row) => sum + Number(row.total_paid || 0), 0),
          balance: rows.reduce((sum, row) => sum + Number(row.balance || 0), 0),
        },
      };
    }
    if (tab === 'Purchases') {
      return {
        type: 'purchases', title: 'Purchases Report', rows: purchases,
        columns: [
          { key: 'date', label: 'Date' },
          { key: 'purchase_count', label: 'Purchases', align: 'right' },
          { key: 'total_purchases', label: 'Total Purchases', type: 'money', align: 'right' },
        ],
        totals: {
          purchase_count: purchases.reduce((sum, row) => sum + Number(row.purchase_count || 0), 0),
          total_purchases: purchases.reduce((sum, row) => sum + Number(row.total_purchases || 0), 0),
        },
      };
    }
    if (tab === 'Top Products') {
      const rows = products.map((row) => ({ ...row, product: row.product || row.Product?.name || '', code: row.code || row.Product?.code || '', category: row.category || row.Product?.ProductCategory?.name || '' }));
      return {
        type: 'product-sales', title: 'Best-Selling Products Report', rows,
        columns: [
          { key: 'product', label: 'Product' },
          { key: 'code', label: 'Code' },
          { key: 'category', label: 'Category' },
          { key: 'total_quantity_sold', label: 'Qty Sold', align: 'right' },
          { key: 'total_revenue', label: 'Revenue', type: 'money', align: 'right' },
        ],
        totals: {
          total_quantity_sold: rows.reduce((sum, row) => sum + Number(row.total_quantity_sold || 0), 0),
          total_revenue: rows.reduce((sum, row) => sum + Number(row.total_revenue || 0), 0),
        },
      };
    }
    return {
      type: 'stock', title: 'Current Stock Valuation Report', rows: stock.data || [],
      columns: [
        { key: 'warehouse', label: 'Warehouse' },
        { key: 'product', label: 'Product' },
        { key: 'code', label: 'Code' },
        { key: 'quantity', label: 'Qty', align: 'right' },
        { key: 'cost_value', label: 'Cost Value', type: 'money', align: 'right' },
        { key: 'retail_value', label: 'Retail Value', type: 'money', align: 'right' },
      ],
      totals: stock.totals || {},
    };
  }, [tab, sales, purchases, products, stock]);

  const params = current.type === 'stock' ? {} : { from_date: fromDate, to_date: toDate };

  const handlePrint = async () => {
    setError('');
    try {
      const settings = await getDocumentSettings();
      await printReport({
        title: current.title,
        columns: current.columns,
        rows: current.rows,
        totals: current.totals,
        settings,
        range: current.type === 'stock' ? `As at ${toDate}` : `${fromDate} to ${toDate}`,
      });
    } catch (requestError) {
      setError(requestError.message || 'Could not open the print view.');
    }
  };

  const handleExport = async (format) => {
    setExporting(format);
    setError('');
    try {
      const response = await ReportsAPI.export(current.type, format, params);
      saveResponseBlob(response, `${current.type}-${fromDate}-to-${toDate}.${format}`);
    } catch (requestError) {
      if (requestError.response?.data instanceof Blob) {
        try {
          const payload = JSON.parse(await requestError.response.data.text());
          setError(payload.message || 'Could not export the report.');
        } catch {
          setError('Could not export the report.');
        }
      } else {
        setError(requestError.response?.data?.message || 'Could not export the report.');
      }
    } finally {
      setExporting('');
    }
  };

  return (
    <div>
      <PageHeader
        title="Reports"
        subtitle="Printable and downloadable sales, purchase, product performance and stock reports."
        actions={(
          <>
            <Button variant="secondary" onClick={handlePrint} disabled={loading}>Print</Button>
            <Button variant="secondary" onClick={() => handleExport('pdf')} disabled={loading || !!exporting}>{exporting === 'pdf' ? 'Preparing PDF…' : 'Download PDF'}</Button>
            <Button onClick={() => handleExport('xlsx')} disabled={loading || !!exporting}>{exporting === 'xlsx' ? 'Preparing Excel…' : 'Download Excel'}</Button>
          </>
        )}
      />

      {error && <div className="mb-4 text-sm text-red-700 bg-red-50 border border-red-200 rounded-md px-4 py-3">{error}</div>}
      {loading && <div className="mb-4 text-sm text-graphite-500">Loading reports…</div>}

      <Card className="p-4 mb-4 flex flex-wrap gap-6 items-end">
        <Field label="From"><input type="date" className={inputClass} value={fromDate} onChange={(e) => setFromDate(e.target.value)} /></Field>
        <Field label="To"><input type="date" className={inputClass} value={toDate} onChange={(e) => setToDate(e.target.value)} /></Field>
        <div className="flex flex-wrap gap-1">
          {TABS.map((name) => (
            <button key={name} onClick={() => setTab(name)} className={`px-3 py-1.5 rounded-md text-sm ${tab === name ? 'bg-copper-600 text-white' : 'bg-slate-100 text-graphite-700'}`}>
              {name}
            </button>
          ))}
        </div>
      </Card>

      {tab === 'Sales' && (
        <Card className="p-5">
          <h3 className="font-display font-semibold mb-4">Sales Over Time</h3>
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={sales}>
              <CartesianGrid strokeDasharray="3 3" stroke="#EBEDEF" />
              <XAxis dataKey="date" tickFormatter={formatDate} fontSize={12} />
              <YAxis fontSize={12} />
              <Tooltip formatter={(value) => formatMoney(value)} labelFormatter={formatDate} />
              <Line type="monotone" dataKey="total_sales" stroke="#C9713D" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
          <table className="w-full text-sm mt-4">
            <thead><tr className="text-left text-graphite-500 border-b border-slate-100"><th className="py-2">Date</th><th className="py-2 text-right">Invoices</th><th className="py-2 text-right">Sales</th><th className="py-2 text-right">Paid</th><th className="py-2 text-right">Balance</th></tr></thead>
            <tbody>{current.rows.map((row) => <tr key={row.date} className="border-b border-slate-50"><td className="py-1.5">{formatDate(row.date)}</td><td className="py-1.5 text-right">{row.invoice_count}</td><td className="py-1.5 text-right">{formatMoney(row.total_sales)}</td><td className="py-1.5 text-right">{formatMoney(row.total_paid)}</td><td className="py-1.5 text-right">{formatMoney(row.balance)}</td></tr>)}</tbody>
          </table>
        </Card>
      )}

      {tab === 'Purchases' && (
        <Card className="p-5">
          <h3 className="font-display font-semibold mb-4">Purchases Over Time</h3>
          <table className="w-full text-sm"><thead><tr className="text-left text-graphite-500 border-b border-slate-100"><th className="py-2">Date</th><th className="py-2 text-right">Purchase Count</th><th className="py-2 text-right">Total</th></tr></thead>
            <tbody>{purchases.map((row) => <tr key={row.date} className="border-b border-slate-50"><td className="py-1.5">{formatDate(row.date)}</td><td className="py-1.5 text-right">{row.purchase_count}</td><td className="py-1.5 text-right">{formatMoney(row.total_purchases)}</td></tr>)}</tbody>
          </table>
        </Card>
      )}

      {tab === 'Top Products' && (
        <Card className="p-5">
          <h3 className="font-display font-semibold mb-4">Best-Selling Products</h3>
          <table className="w-full text-sm"><thead><tr className="text-left text-graphite-500 border-b border-slate-100"><th className="py-2">Product</th><th className="py-2">Code</th><th className="py-2">Category</th><th className="py-2 text-right">Qty Sold</th><th className="py-2 text-right">Revenue</th></tr></thead>
            <tbody>{current.rows.map((row) => <tr key={row.product_id} className="border-b border-slate-50"><td className="py-1.5">{row.product}</td><td className="py-1.5">{row.code}</td><td className="py-1.5">{row.category}</td><td className="py-1.5 text-right">{row.total_quantity_sold}</td><td className="py-1.5 text-right">{formatMoney(row.total_revenue)}</td></tr>)}</tbody>
          </table>
        </Card>
      )}

      {tab === 'Stock Valuation' && (
        <Card className="p-5">
          <h3 className="font-display font-semibold mb-4">Current Stock Valuation</h3>
          <div className="flex gap-8 mb-4 text-sm"><div><span className="text-graphite-500">Total cost value: </span><span className="font-medium">{formatMoney(stock.totals?.cost_value)}</span></div><div><span className="text-graphite-500">Total retail value: </span><span className="font-medium">{formatMoney(stock.totals?.retail_value)}</span></div></div>
          <table className="w-full text-sm"><thead><tr className="text-left text-graphite-500 border-b border-slate-100"><th className="py-2">Product</th><th className="py-2">Warehouse</th><th className="py-2 text-right">Qty</th><th className="py-2 text-right">Cost Value</th><th className="py-2 text-right">Retail Value</th></tr></thead>
            <tbody>{(stock.data || []).map((row, index) => <tr key={`${row.warehouse}-${row.code}-${index}`} className="border-b border-slate-50"><td className="py-1.5">{row.product} <span className="text-graphite-400 text-xs">({row.code})</span></td><td className="py-1.5">{row.warehouse}</td><td className="py-1.5 text-right">{row.quantity}</td><td className="py-1.5 text-right">{formatMoney(row.cost_value)}</td><td className="py-1.5 text-right">{formatMoney(row.retail_value)}</td></tr>)}</tbody>
          </table>
        </Card>
      )}
    </div>
  );
}
