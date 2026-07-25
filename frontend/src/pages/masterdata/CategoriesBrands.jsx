import React from 'react';
import CrudPage from '../../components/CrudPage.jsx';
import { CategoriesAPI, BrandsAPI } from '../../api/endpoints';
import { useAuth } from '../../context/AuthContext.jsx';

export default function CategoriesBrands() {
  const { hasPermission } = useAuth();
  return (
    <div className="space-y-10">
      <CrudPage
        title="Product Categories"
        subtitle="Group products (e.g. Wires & Cables, Switches & Sockets, Lighting)."
        api={CategoriesAPI}
        hasPermission={hasPermission}
        permission="products.manage"
        columns={[{ key: 'name', label: 'Name' }, { key: 'code', label: 'Code' }]}
        fields={[
          { name: 'name', label: 'Category name', required: true },
          { name: 'code', label: 'Code (optional)' },
        ]}
      />
      <CrudPage
        title="Brands"
        subtitle="e.g. Orange Electric, ACL Cables, Schneider Electric."
        api={BrandsAPI}
        hasPermission={hasPermission}
        permission="products.manage"
        columns={[{ key: 'name', label: 'Name' }]}
        fields={[{ name: 'name', label: 'Brand name', required: true }]}
      />
    </div>
  );
}
