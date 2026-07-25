import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { inputClass } from '../components/ui.jsx';

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(email, password);
      navigate('/pos');
    } catch (err) {
      setError(err.response?.data?.message || 'Login failed. Check your email and password.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-graphite-950 px-4">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center mb-8">
          <div className="w-12 h-12 rounded-lg bg-copper-500 flex items-center justify-center font-display font-bold text-2xl text-graphite-950 mb-3">
            SE
          </div>
          <h1 className="font-display text-2xl font-semibold text-slate-100">Shanthi Electricals</h1>
          <p className="text-graphite-600 text-sm mt-1">Warehouse &amp; shop management</p>
        </div>
        <form onSubmit={submit} className="bg-graphite-900 border border-graphite-700 rounded-xl p-6">
          {error && (
            <div className="mb-4 text-sm text-red-300 bg-red-950/40 border border-red-900 rounded-md px-3 py-2">{error}</div>
          )}
          <label className="block mb-4">
            <span className="block text-xs font-medium text-graphite-600 mb-1">Email</span>
            <input
              type="email"
              required
              className={inputClass + ' bg-graphite-800 border-graphite-700 text-slate-100 placeholder:text-graphite-600'}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="admin@example.com"
            />
          </label>
          <label className="block mb-6">
            <span className="block text-xs font-medium text-graphite-600 mb-1">Password</span>
            <input
              type="password"
              required
              className={inputClass + ' bg-graphite-800 border-graphite-700 text-slate-100'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
            />
          </label>
          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 rounded-md bg-copper-600 hover:bg-copper-700 text-white font-medium disabled:opacity-50"
          >
            {loading ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
      </div>
    </div>
  );
}
