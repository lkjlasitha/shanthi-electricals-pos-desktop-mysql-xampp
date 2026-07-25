import React from 'react';

export function Button({ variant = 'primary', className = '', ...props }) {
  const base = 'inline-flex items-center gap-1.5 px-3.5 py-2 rounded-md text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed';
  const variants = {
    primary: 'bg-copper-600 text-white hover:bg-copper-700',
    secondary: 'bg-white border border-slate-200 text-graphite-800 hover:bg-slate-100',
    danger: 'bg-red-600 text-white hover:bg-red-700',
    ghost: 'text-graphite-700 hover:bg-slate-100',
  };
  return <button className={`${base} ${variants[variant]} ${className}`} {...props} />;
}

export function PageHeader({ title, subtitle, actions }) {
  return (
    <div className="flex items-start justify-between mb-6">
      <div>
        <h1 className="font-display text-2xl font-semibold text-graphite-950">{title}</h1>
        {subtitle && <p className="text-sm text-graphite-600 mt-0.5">{subtitle}</p>}
      </div>
      {actions && <div className="flex gap-2">{actions}</div>}
    </div>
  );
}

export function Modal({ open, onClose, title, children, width = 'max-w-lg' }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-graphite-950/40 p-4">
      <div className={`bg-white rounded-lg shadow-xl w-full ${width} max-h-[90vh] overflow-y-auto`}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200">
          <h2 className="font-display font-semibold text-lg">{title}</h2>
          <button onClick={onClose} className="text-graphite-500 hover:text-graphite-900 text-xl leading-none">
            &times;
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

export function Card({ className = '', children }) {
  return <div className={`bg-white rounded-lg border border-slate-200 ${className}`}>{children}</div>;
}

export function Field({ label, children, hint }) {
  return (
    <label className="block mb-3">
      <span className="block text-xs font-medium text-graphite-700 mb-1">{label}</span>
      {children}
      {hint && <span className="block text-xs text-graphite-500 mt-1">{hint}</span>}
    </label>
  );
}

export const inputClass =
  'w-full px-3 py-2 rounded-md border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-copper-500/40 focus:border-copper-500';
