import api from './client';

export const AuthAPI = {
  login: (email, password) => api.post('/auth/login', { email, password }),
  me: () => api.get('/auth/me'),
  changePassword: (data) => api.post('/auth/change-password', data),
};

export const DashboardAPI = {
  summary: (warehouseId) => api.get('/dashboard/summary', { params: { warehouse_id: warehouseId } }),
};

export const ProductsAPI = {
  list: (params) => api.get('/products', { params }),
  get: (id) => api.get(`/products/${id}`),
  lookup: (code) => api.get(`/products/lookup/${encodeURIComponent(code)}`),
  generateCode: () => api.get('/products/generate-code'),
  create: (data) => api.post('/products', data),
  getFamily: (id) => api.get(`/products/families/${id}`),
  createFamily: (data) => api.post('/products/families', data),
  addVariants: (id, data) => api.post(`/products/families/${id}/variants`, data),
  convertToFamily: (id, data) => api.post(`/products/${id}/create-family`, data),
  update: (id, data) => api.put(`/products/${id}`, data),
  remove: (id) => api.delete(`/products/${id}`),
  setStock: (id, data) => api.post(`/products/${id}/stock`, data),
  priceHistory: (id) => api.get(`/products/${id}/price-history`),
  adjustPrices: (id, data) => api.post(`/products/${id}/adjust-prices`, data),
};

const crud = (path) => ({
  list: (params) => api.get(path, { params }),
  get: (id) => api.get(`${path}/${id}`),
  create: (data) => api.post(path, data),
  update: (id, data) => api.put(`${path}/${id}`, data),
  remove: (id) => api.delete(`${path}/${id}`),
});

export const CategoriesAPI = crud('/product-categories');
export const BrandsAPI = crud('/brands');
export const BaseUnitsAPI = crud('/base-units');
export const UnitsAPI = crud('/units');
export const WarehousesAPI = crud('/warehouses');
export const SuppliersAPI = crud('/suppliers');
export const CustomersAPI = {
  ...crud('/customers'),
  profile: (id) => api.get(`/customers/${id}/profile`),
  recordPayment: (id, data) => api.post(`/customers/${id}/payments`, data),
};
export const CurrenciesAPI = crud('/currencies');
export const RolesAPI = crud('/roles');
export const UsersAPI = crud('/users');
export const ExpenseCategoriesAPI = crud('/expense-categories');
export const ExpensesAPI = crud('/expenses');

export const PurchasesAPI = {
  list: (params) => api.get('/purchases', { params }),
  get: (id) => api.get(`/purchases/${id}`),
  create: (data) => api.post('/purchases', data),
};

export const SalesAPI = {
  list: (params) => api.get('/sales', { params }),
  get: (id) => api.get(`/sales/${id}`),
  create: (data) => api.post('/sales', data),
  addPayment: (id, data) => api.post(`/sales/${id}/payments`, data),
};

export const ReturnsAPI = {
  listSaleReturns: () => api.get('/sale-returns'),
  saleReturnable: (saleId) => api.get(`/sale-returns/source/${saleId}`),
  createSaleReturn: (data) => api.post('/sale-returns', data),
  listPurchaseReturns: () => api.get('/purchase-returns'),
  purchaseReturnable: (purchaseId) => api.get(`/purchase-returns/source/${purchaseId}`),
  createPurchaseReturn: (data) => api.post('/purchase-returns', data),
};

export const StockAPI = {
  listTransfers: () => api.get('/transfers'),
  createTransfer: (data) => api.post('/transfers', data),
  listAdjustments: () => api.get('/adjustments'),
  createAdjustment: (data) => api.post('/adjustments', data),
};

export const QuotationsHoldsAPI = {
  listQuotations: () => api.get('/quotations'),
  getQuotation: (id) => api.get(`/quotations/${id}`),
  createQuotation: (data) => api.post('/quotations', data),
  updateQuotation: (id, data) => api.put(`/quotations/${id}`, data),
  listHolds: (warehouseId) => api.get('/holds', { params: { warehouse_id: warehouseId } }),
  createHold: (data) => api.post('/holds', data),
  deleteHold: (id) => api.delete(`/holds/${id}`),
};

export const RegisterAPI = {
  current: () => api.get('/register/current'),
  open: (data) => api.post('/register/open', data),
  close: (id, data) => api.post(`/register/${id}/close`, data),
  list: () => api.get('/register'),
};

export const ReportsAPI = {
  sales: (params) => api.get('/reports/sales', { params }),
  purchases: (params) => api.get('/reports/purchases', { params }),
  productSales: (params) => api.get('/reports/product-sales', { params }),
  stock: (params) => api.get('/reports/stock', { params }),
  export: (type, format, params) => api.get(`/reports/${type}/export`, {
    params: { ...params, format },
    responseType: 'blob',
  }),
};

export const SettingsAPI = {
  getAll: () => api.get('/settings'),
  updateMany: (data) => api.put('/settings', data),
};

export const DocumentsAPI = {
  pdf: (type, id, format = 'a4') => api.get(`/documents/${type}/${id}/pdf`, {
    params: { format },
    responseType: 'blob',
  }),
};

export const BackupAPI = {
  exportAll: () => api.get('/backup/export', { responseType: 'blob' }),
  importAll: (file, confirm = 'RESTORE') => {
    const form = new FormData();
    form.append('backup', file);
    form.append('confirm', confirm);
    return api.post('/backup/import', form);
  },
};
