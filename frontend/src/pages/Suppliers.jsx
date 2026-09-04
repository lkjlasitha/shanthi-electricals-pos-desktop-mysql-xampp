import React from 'react';
import CrudPage from '../components/CrudPage.jsx';
import { SuppliersAPI } from '../api/endpoints';
import { useAuth } from '../context/AuthContext.jsx';

export default function Suppliers() {
  const { hasPermission } = useAuth();
  return (
    <CrudPage
      title="Suppliers"
      subtitle="Companies you buy stock from."
      api={SuppliersAPI}
      hasPermission={hasPermission}
      permission="suppliers.manage"
      columns={[
        { key: 'name', label: 'Name' },
        { key: 'phone', label: 'Phone' },
        { key: 'city', label: 'City' },
        { key: 'payment_terms_days', label: 'Credit days' },
      ]}
      fields={[
        { name: 'name', label: 'Name', required: true },
        { name: 'phone', label: 'Phone', required: true },
        { name: 'email', label: 'Email' },
        { name: 'city', label: 'City' },
        { name: 'address', label: 'Address', type: 'textarea' },
        { name: 'tax_number', label: 'VAT/BIN' },
        { name: 'payment_terms_days', label: 'Default payment terms (days)', type: 'number' },
      ]}
    />
  );
}
