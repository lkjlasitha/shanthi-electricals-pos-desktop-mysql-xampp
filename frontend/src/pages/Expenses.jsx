import React, { useEffect, useState } from 'react';
import CrudPage from '../components/CrudPage.jsx';
import { ExpensesAPI, ExpenseCategoriesAPI } from '../api/endpoints';
import { useAuth } from '../context/AuthContext.jsx';
import { formatMoney, formatDate } from '../utils/format';

export default function Expenses() {
  const { hasPermission } = useAuth();
  const [categories, setCategories] = useState([]);

  useEffect(() => { ExpenseCategoriesAPI.list({ per_page: 100 }).then((r) => setCategories(r.data.data || r.data)); }, []);

  return (
    <div className="space-y-10">
      <CrudPage
        title="Expense Categories"
        subtitle="e.g. Shop rent, Electricity bill, Staff wages, Transport."
        api={ExpenseCategoriesAPI}
        hasPermission={hasPermission}
        permission="expenses.manage"
        columns={[{ key: 'name', label: 'Name' }]}
        fields={[{ name: 'name', label: 'Category name', required: true }, { name: 'description', label: 'Description', type: 'textarea' }]}
      />
      <CrudPage
        title="Expenses"
        subtitle="Track shop running costs."
        api={ExpensesAPI}
        hasPermission={hasPermission}
        permission="expenses.manage"
        columns={[
          { key: 'title', label: 'Title' },
          { key: 'expense_category_id', label: 'Category', render: (r) => categories.find((c) => c.id === r.expense_category_id)?.name || '' },
          { key: 'date', label: 'Date', render: (r) => formatDate(r.date) },
          { key: 'amount', label: 'Amount', render: (r) => formatMoney(r.amount) },
        ]}
        fields={[
          { name: 'title', label: 'Title (e.g. "July electricity bill")', required: true },
          { name: 'expense_category_id', label: 'Category', type: 'select', required: true, options: categories.map((c) => ({ value: c.id, label: c.name })) },
          { name: 'date', label: 'Date', type: 'date', required: true },
          { name: 'amount', label: 'Amount (Rs.)', type: 'number', required: true },
          { name: 'notes', label: 'Notes', type: 'textarea' },
        ]}
      />
    </div>
  );
}
