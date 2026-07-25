import axios from 'axios';

export const STORAGE_KEYS = {
  token: 'shanthi_pos_token',
  user: 'shanthi_pos_user',
  legacyToken: 'electro_pos_token',
  legacyUser: 'electro_pos_user',
};

export function getStoredToken() {
  return localStorage.getItem(STORAGE_KEYS.token) || localStorage.getItem(STORAGE_KEYS.legacyToken);
}

export function clearStoredAuth() {
  Object.values(STORAGE_KEYS).forEach((key) => localStorage.removeItem(key));
}

const api = axios.create({
  baseURL: '/api',
});

api.interceptors.request.use((config) => {
  const token = getStoredToken();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response && error.response.status === 401) {
      clearStoredAuth();
      if (!window.location.pathname.startsWith('/login')) {
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  }
);

export default api;
