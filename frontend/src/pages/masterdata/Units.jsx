import React, { useEffect, useState } from 'react';
import CrudPage from '../../components/CrudPage.jsx';
import { BaseUnitsAPI, UnitsAPI } from '../../api/endpoints';
import { useAuth } from '../../context/AuthContext.jsx';

export default function Units() {
  const { hasPermission } = useAuth();
  const [baseUnits, setBaseUnits] = useState([]);

  useEffect(() => {
    BaseUnitsAPI.list({ per_page: 100 }).then((res) => setBaseUnits(res.data.data || res.data));
  }, []);

  return (
    <div className="space-y-10">
      <CrudPage
        title="Base Units"
        subtitle="Fundamental units of measure, e.g. Piece, Meter, Box, Roll."
        api={BaseUnitsAPI}
        hasPermission={hasPermission}
        permission="products.manage"
        columns={[{ key: 'name', label: 'Name' }]}
        fields={[{ name: 'name', label: 'Base unit name', required: true }]}
      />
      <CrudPage
        title="Units"
        subtitle="Purchase/sale units with a conversion factor against a base unit — e.g. 'Box of 10' = 10 × Piece."
        api={UnitsAPI}
        hasPermission={hasPermission}
        permission="products.manage"
        columns={[
          { key: 'name', label: 'Name' },
          { key: 'base_unit_id', label: 'Base unit', render: (r) => baseUnits.find((b) => b.id === r.base_unit_id)?.name || r.base_unit_id },
          { key: 'operator', label: 'Operator' },
          { key: 'operation_value', label: 'Factor' },
        ]}
        fields={[
          { name: 'name', label: 'Unit name', required: true },
          { name: 'short_name', label: 'Short name' },
          { name: 'base_unit_id', label: 'Base unit', type: 'select', required: true, options: baseUnits.map((b) => ({ value: b.id, label: b.name })) },
          { name: 'operator', label: 'Operator', type: 'select', required: true, options: [{ value: '*', label: 'Multiply (×)' }, { value: '/', label: 'Divide (÷)' }] },
          { name: 'operation_value', label: 'Conversion factor', type: 'number', required: true },
        ]}
      />
    </div>
  );
}
