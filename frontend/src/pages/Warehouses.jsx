import React from 'react';
import CrudPage from '../components/CrudPage.jsx';
import { WarehousesAPI } from '../api/endpoints';
import { useAuth } from '../context/AuthContext.jsx';

export default function Warehouses() {
  const { hasPermission } = useAuth();
  return (
    <CrudPage
      title="Warehouses"
      subtitle="Physical shop / warehouse locations that hold stock."
      api={WarehousesAPI}
      hasPermission={hasPermission}
      permission="warehouses.manage"
      columns={[
        { key: 'name', label: 'Name' },
        { key: 'city', label: 'City' },
        { key: 'phone', label: 'Phone' },
        { key: 'is_default', label: 'Default', render: (r) => (r.is_default ? 'Yes' : '') },
      ]}
      fields={[
        { name: 'name', label: 'Warehouse name', required: true },
        { name: 'phone', label: 'Phone', default: '+94 ' },
        { name: 'city', label: 'City' },
        { name: 'address', label: 'Address', type: 'textarea' },
        { name: 'zip_code', label: 'Postal code' },
        { name: 'email', label: 'Email' },
      ]}
    />
  );
}
