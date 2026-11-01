import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import Loader from '../components/common/Loader';

export const ProtectedRoute = ({ children }) => {
  const { isAuthenticated, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="min-vh-100 d-flex align-items-center justify-content-center">
        <Loader />
      </div>
    );
  }

  const staffOrdering = sessionStorage.getItem('foodie_staff_ordering') === '1'
    && sessionStorage.getItem('foodie_staff_access');
  const isCustomerRoute = location.pathname.startsWith('/customer/');
  const hasGuestCustomerSession = Boolean(
    sessionStorage.getItem('foodie_guest_token') ||
    localStorage.getItem('foodie_guest_token') ||
    sessionStorage.getItem('foodie_table') ||
    sessionStorage.getItem('foodie_order_type') ||
    sessionStorage.getItem('foodie_last_placed_order') ||
    localStorage.getItem('foodie_last_placed_order')
  );

  if (!isAuthenticated && !staffOrdering) {
    if (isCustomerRoute && hasGuestCustomerSession) {
      return children;
    }
    const from = `${location.pathname}${location.search}${location.hash}`;
    if (isCustomerRoute) {
      return <Navigate to="/customer/login" state={{ from }} replace />;
    }
    return <Navigate to="/login" state={{ from }} replace />;
  }

  return children;
};
export default ProtectedRoute;
