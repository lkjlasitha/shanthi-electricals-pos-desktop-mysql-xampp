import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';

export default function ProtectedRoute({ children, permission }) {
  const { user, loading, hasPermission } = useAuth();

  if (loading) {
    return <div className="flex items-center justify-center h-screen text-graphite-600">Loading…</div>;
  }
  if (!user) return <Navigate to="/login" replace />;
  if (permission && !hasPermission(permission)) {
    return (
      <div className="p-10 text-center text-graphite-600">
        You don&apos;t have permission to view this page. Ask your shop admin for access.
      </div>
    );
  }
  return children;
}
