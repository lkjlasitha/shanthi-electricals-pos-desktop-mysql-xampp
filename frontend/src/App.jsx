import React, { useEffect } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import Login from './pages/Login.jsx';
import Dashboard from './pages/Dashboard.jsx';
import POS from './pages/pos/POS.jsx';
import Products from './pages/products/Products.jsx';
import Barcodes from './pages/products/Barcodes.jsx';
import ProductVariants from './pages/products/ProductVariants.jsx';
import Purchases from './pages/purchases/Purchases.jsx';
import SalesHistory from './pages/sales/SalesHistory.jsx';
import Transfers from './pages/stock/Transfers.jsx';
import Adjustments from './pages/stock/Adjustments.jsx';
import Returns from './pages/Returns.jsx';
import Quotations from './pages/Quotations.jsx';
import CategoriesBrands from './pages/masterdata/CategoriesBrands.jsx';
import Units from './pages/masterdata/Units.jsx';
import Warehouses from './pages/Warehouses.jsx';
import Customers from './pages/Customers.jsx';
import Suppliers from './pages/Suppliers.jsx';
import Expenses from './pages/Expenses.jsx';
import Reports from './pages/Reports.jsx';
import Settings from './pages/Settings.jsx';
import Users from './pages/Users.jsx';
import Layout from './components/Layout.jsx';
import ProtectedRoute from './components/ProtectedRoute.jsx';

export default function App() {
  useEffect(() => {
    const isTextControl = (target) => target instanceof HTMLElement && (
      target.isContentEditable
      || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)
    );

    const recoverKeyboardFocus = (event) => {
      const target = event.target;
      if (!isTextControl(target) || target.disabled) return;

      window.shanthiDesktop?.ensureKeyboardFocus?.();
      window.requestAnimationFrame(() => {
        // The normal pointer action usually focuses the field. Only repair it
        // when Chromium failed to do so, preserving cursor/selection behavior.
        if (document.contains(target) && document.activeElement !== target) {
          target.focus({ preventScroll: true });
        }
      });
    };

    document.addEventListener('pointerdown', recoverKeyboardFocus, true);
    return () => document.removeEventListener('pointerdown', recoverKeyboardFocus, true);
  }, []);

  return (
    <Routes>
      <Route path="/login" element={<Login />} />

      <Route
        element={
          <ProtectedRoute>
            <Layout />
          </ProtectedRoute>
        }
      >
        <Route path="/" element={<Navigate to="/pos" replace />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/pos" element={<POS />} />
        <Route path="/products" element={<Products />} />
        <Route path="/products/variants/new" element={<ProductVariants />} />
        <Route path="/products/families/:familyId" element={<ProductVariants />} />
        <Route path="/barcodes" element={<Barcodes />} />
        <Route path="/purchases" element={<Purchases />} />
        <Route path="/sales" element={<SalesHistory />} />
        <Route path="/stock/transfers" element={<Transfers />} />
        <Route path="/stock/adjustments" element={<Adjustments />} />
        <Route path="/returns" element={<Returns />} />
        <Route path="/quotations" element={<Quotations />} />
        <Route path="/masterdata/categories" element={<CategoriesBrands />} />
        <Route path="/masterdata/units" element={<Units />} />
        <Route path="/warehouses" element={<Warehouses />} />
        <Route path="/customers" element={<Customers />} />
        <Route path="/suppliers" element={<Suppliers />} />
        <Route path="/expenses" element={<Expenses />} />
        <Route path="/reports" element={<Reports />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="/users" element={<Users />} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
