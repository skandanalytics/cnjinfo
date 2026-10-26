import React, { useEffect, useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import Loader from '../components/common/Loader';
import api from '../config/api';

export const AdminRoute = ({ children, allowEmployee = true }) => {
  const { user, isAuthenticated, loading } = useAuth();
  const [setupRequired, setSetupRequired] = useState(null);
  const location = useLocation();

  useEffect(() => {
    let active = true;
    api.get('/db/status/')
      .then((res) => { if (active) setSetupRequired(Boolean(res.data?.setup_required)); })
      .catch(() => { if (active) setSetupRequired(false); });
    return () => { active = false; };
  }, []);

  if (loading || setupRequired === null) {
    return (
      <div className="min-vh-100 d-flex align-items-center justify-content-center">
        <Loader />
      </div>
    );
  }

  if (setupRequired) {
    return <Navigate to="/db" replace />;
  }

  if (!isAuthenticated) {
    const from = `${location.pathname}${location.search}${location.hash}`;
    return <Navigate to="/login" state={{ from }} replace />;
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
