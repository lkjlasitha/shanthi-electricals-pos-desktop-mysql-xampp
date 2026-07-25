import React from 'react';
import CrudPage from '../components/CrudPage.jsx';
import { CustomersAPI } from '../api/endpoints';
import { useAuth } from '../context/AuthContext.jsx';

export default function Customers() {
  const { hasPermission } = useAuth();
  return (
    <CrudPage
      title="Customers"
      subtitle="Walk-in and account customers. Add a 'Walk-in Customer' entry for anonymous POS sales."
      api={CustomersAPI}
      hasPermission={hasPermission}
      permission="customers.manage"
      columns={[
        { key: 'name', label: 'Name' },
        { key: 'phone', label: 'Phone' },
        { key: 'city', label: 'City' },
        { key: 'opening_balance', label: 'Opening balance' },
      ]}
      fields={[
        { name: 'name', label: 'Name', required: true },
        { name: 'phone', label: 'Phone (e.g. 077 123 4567)', required: true },
        { name: 'email', label: 'Email' },
        { name: 'city', label: 'City' },
        { name: 'address', label: 'Address', type: 'textarea' },
        { name: 'tax_number', label: 'VAT/TIN (if a business)' },
        { name: 'opening_balance', label: 'Opening balance', type: 'number', default: 0 },
      ]}
    />
  );
}
