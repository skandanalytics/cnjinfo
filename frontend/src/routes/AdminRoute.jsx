import React, { useEffect, useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import Loader from '../components/common/Loader';
import api from '../config/api';

let cachedSetupRequired = null;

export const AdminRoute = ({ children, allowEmployee = true }) => {
  const { user, isAuthenticated, loading } = useAuth();
  const [setupRequired, setSetupRequired] = useState(() => cachedSetupRequired);
  const location = useLocation();

  useEffect(() => {
    if (cachedSetupRequired !== null) return;
    let active = true;
    api.get('/db/status/')
      .then((res) => {
        const val = Boolean(res.data?.setup_required);
        cachedSetupRequired = val;
        if (active) setSetupRequired(val);
      })
      .catch(() => {
        cachedSetupRequired = false;
        if (active) setSetupRequired(false);
      });
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
