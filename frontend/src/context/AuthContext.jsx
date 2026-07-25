import React, { createContext, useContext, useEffect, useState } from 'react';
import { AuthAPI } from '../api/endpoints';
import { STORAGE_KEYS, clearStoredAuth, getStoredToken } from '../api/client';

const AuthContext = createContext(null);

function readStoredUser() {
  const raw = localStorage.getItem(STORAGE_KEYS.user) || localStorage.getItem(STORAGE_KEYS.legacyUser);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function storeAuth(token, user) {
  localStorage.setItem(STORAGE_KEYS.token, token);
  localStorage.setItem(STORAGE_KEYS.user, JSON.stringify(user));
  localStorage.removeItem(STORAGE_KEYS.legacyToken);
  localStorage.removeItem(STORAGE_KEYS.legacyUser);
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(readStoredUser);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = getStoredToken();
    if (!token) {
      setLoading(false);
      return;
    }
    AuthAPI.me()
      .then((res) => {
        const currentUser = res.data.data;
        storeAuth(token, currentUser);
        setUser(currentUser);
      })
      .catch(() => {
        clearStoredAuth();
        setUser(null);
      })
      .finally(() => setLoading(false));
  }, []);

  const login = async (email, password) => {
    const res = await AuthAPI.login(email, password);
    storeAuth(res.data.token, res.data.user);
    setUser(res.data.user);
    return res.data.user;
  };

  const logout = () => {
    clearStoredAuth();
    setUser(null);
  };

  const hasPermission = (key) => {
    if (!user || !user.Role) return false;
    if (user.Role.name === 'admin') return true;
    return (user.Role.permissions || []).includes(key);
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, hasPermission }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
