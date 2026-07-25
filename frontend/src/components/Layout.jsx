import React, { useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';

const NAV_SECTIONS = [
  {
    label: 'Overview',
    items: [{ to: '/dashboard', label: 'Dashboard', icon: '🏠' }],
  },
  {
    label: 'Sell',
    items: [
      { to: '/pos', label: 'POS Terminal', icon: '⚡' },
      { to: '/sales', label: 'Sales History', icon: '🧾' },
      { to: '/quotations', label: 'Quotations', icon: '📋' },
      { to: '/returns', label: 'Returns', icon: '↩️' },
    ],
  },
  {
    label: 'Inventory',
    items: [
      { to: '/products', label: 'Products', icon: '🔌' },
      { to: '/barcodes', label: 'Barcode Labels', icon: '▥' },
      { to: '/stock/transfers', label: 'Stock Transfers', icon: '🚚' },
      { to: '/stock/adjustments', label: 'Stock Adjustments', icon: '⚖️' },
      { to: '/purchases', label: 'Purchases', icon: '📦' },
    ],
  },
  {
    label: 'Contacts',
    items: [
      { to: '/customers', label: 'Customers', icon: '👤' },
      { to: '/suppliers', label: 'Suppliers', icon: '🏭' },
    ],
  },
  {
    label: 'Setup',
    items: [
      { to: '/masterdata/categories', label: 'Categories & Brands', icon: '🗂️' },
      { to: '/masterdata/units', label: 'Units', icon: '📏' },
      { to: '/warehouses', label: 'Warehouses', icon: '🏬' },
      { to: '/expenses', label: 'Expenses', icon: '💸' },
      { to: '/reports', label: 'Reports', icon: '📊' },
      { to: '/users', label: 'Staff & Roles', icon: '🔑' },
      { to: '/settings', label: 'Settings', icon: '⚙️' },
    ],
  },
];

export default function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [collapsed, setCollapsed] = useState(false);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <div className="flex h-screen bg-slate-50 text-graphite-900">
      {/* Sidebar */}
      <aside className={`${collapsed ? 'w-16' : 'w-64'} shrink-0 bg-graphite-950 text-slate-100 flex flex-col transition-all duration-200`}>
        <div className="flex items-center gap-2 px-4 h-16 border-b border-graphite-700">
          <div className="w-8 h-8 rounded bg-copper-500 flex items-center justify-center font-display font-bold text-graphite-950">SE</div>
          {!collapsed && <span className="font-display font-semibold tracking-wide text-lg">Shanthi Electricals</span>}
        </div>
        <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-5">
          {NAV_SECTIONS.map((section) => (
            <div key={section.label}>
              {!collapsed && (
                <div className="px-2 text-[10px] uppercase tracking-[0.15em] text-graphite-600 font-semibold mb-1">
                  {section.label}
                </div>
              )}
              <div className="space-y-0.5">
                {section.items.map((item) => (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    className={({ isActive }) =>
                      `flex items-center gap-3 px-2.5 py-2 rounded-md text-sm transition-colors ${
                        isActive ? 'bg-copper-600/20 text-amber-400 font-medium' : 'text-slate-200 hover:bg-graphite-800'
                      }`
                    }
                  >
                    <span className="text-base leading-none">{item.icon}</span>
                    {!collapsed && <span>{item.label}</span>}
                  </NavLink>
                ))}
              </div>
            </div>
          ))}
        </nav>
        <button
          onClick={() => setCollapsed((c) => !c)}
          className="h-10 border-t border-graphite-700 text-graphite-600 hover:text-slate-200 text-xs"
        >
          {collapsed ? '»' : '« Collapse'}
        </button>
      </aside>

      {/* Main column */}
      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-6 shrink-0">
          <div className="text-sm text-graphite-600">
            {user?.Warehouse?.name ? (
              <span>
                Warehouse: <span className="font-medium text-graphite-900">{user.Warehouse.name}</span>
              </span>
            ) : (
              <span className="font-display text-base text-graphite-900">Shanthi Electricals</span>
            )}
          </div>
          <div className="flex items-center gap-3">
            <div className="text-right">
              <div className="text-sm font-medium">{user?.name}</div>
              <div className="text-xs text-graphite-600">{user?.Role?.display_name}</div>
            </div>
            <div className="w-9 h-9 rounded-full bg-graphite-800 text-slate-100 flex items-center justify-center font-medium">
              {user?.name?.charAt(0).toUpperCase()}
            </div>
            <button
              onClick={handleLogout}
              className="text-sm px-3 py-1.5 rounded-md border border-slate-200 hover:bg-slate-100 text-graphite-700"
            >
              Log out
            </button>
          </div>
        </header>
        <main className="flex-1 overflow-y-auto p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
