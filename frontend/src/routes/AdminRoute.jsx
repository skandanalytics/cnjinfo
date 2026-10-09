import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import Loader from '../components/common/Loader';

export const AdminRoute = ({ children, allowEmployee = true }) => {
  const { user, isAuthenticated, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-vh-100 d-flex align-items-center justify-content-center">
        <Loader />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  if (user?.role === 'customer') {
    return <Navigate to="/customer/home" replace />;
  }

  if (!allowEmployee && user?.role === 'employee') {
    return <Navigate to="/employee/dashboard" replace />;
  }

  return children;
};
export default AdminRoute;
