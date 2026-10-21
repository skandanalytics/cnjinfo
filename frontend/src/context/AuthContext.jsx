import React, { createContext, useState, useEffect } from 'react';
import { authService } from '../services/authService';

export const AuthContext = createContext();

const restoreInitialAuth = () => {
  if (typeof window === 'undefined') {
    return { user: null, isAuthenticated: false };
  }

  const path = window.location.pathname;
  const staffOrdering = sessionStorage.getItem('foodie_staff_ordering') === '1';
  const isAdminRoute = path.startsWith('/admin') || path.startsWith('/employee') || path.startsWith('/db') || staffOrdering;
  const roleKey = isAdminRoute ? 'admin' : 'customer';
  const key = `foodie_auth_${roleKey}`;
  const tokenKey = `foodie_token_${roleKey}`;

  let savedAuth = isAdminRoute ? sessionStorage.getItem(key) : (sessionStorage.getItem(key) || localStorage.getItem(key));
  let savedToken = isAdminRoute
    ? (sessionStorage.getItem('foodie_staff_access') || sessionStorage.getItem(tokenKey))
    : (sessionStorage.getItem(tokenKey) || localStorage.getItem(tokenKey));
  if (isAdminRoute && (!savedToken || savedToken === 'dummy-token')) {
    return { user: null, isAuthenticated: false };
  }


  if (savedAuth) {
    try {
      const parsed = JSON.parse(savedAuth);
      if (parsed && parsed.user && parsed.isAuthenticated !== false) {
        try {
          sessionStorage.setItem(key, savedAuth);
          sessionStorage.setItem(tokenKey, savedToken || 'dummy-token');
        } catch (e) {}
        return { user: parsed.user, isAuthenticated: true };
      }
    } catch (e) {
      console.error('Error parsing initial auth state:', e);
    }
  }

  return { user: null, isAuthenticated: false };
};

export const AuthProvider = ({ children }) => {
  const [authState, setAuthState] = useState(restoreInitialAuth);
  const [loading, setLoading] = useState(() => {
    if (typeof window === 'undefined') return false;
    const path = window.location.pathname;
    const staffOrdering = sessionStorage.getItem('foodie_staff_ordering') === '1';
    const staffRoute = path.startsWith('/admin') || path.startsWith('/employee') || path.startsWith('/db') || staffOrdering;
    return staffRoute && Boolean(sessionStorage.getItem('foodie_staff_access'));
  });
  const { user, isAuthenticated } = authState;

  useEffect(() => {
    const handleStorage = (e) => {
      if (e.key === 'foodie_auth_admin' || e.key === 'foodie_auth_customer') {
        if (!e.newValue) {
          setAuthState({ user: null, isAuthenticated: false });
        }
      }
    };

    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, []);

  useEffect(() => {
    if (!loading) return undefined;
    let active = true;
    import('../services/staffClient').then(({ staffJson, clearStaffSession }) => {
      staffJson('/auth/me/')
        .then(() => {
          if (active) setLoading(false);
        })
        .catch(() => {
          if (!active) return;
          clearStaffSession();
          sessionStorage.removeItem('foodie_staff_ordering');
          setAuthState({ user: null, isAuthenticated: false });
          setLoading(false);
        });
    });
    return () => { active = false; };
  }, [loading]);

  const saveSession = (userObj, token, refresh) => {
    // Save unauthenticated guest cart temporarily for seamless login cart merging ONLY for genuine guest browsing
    if (!authState.isAuthenticated && userObj.role !== 'admin' && userObj.role !== 'employee') {
      try {
        const guestCart = sessionStorage.getItem('foodie_guest_cart_temp') ||
          sessionStorage.getItem('foodie_guest_cart');
        if (guestCart && guestCart !== '[]') {
          sessionStorage.setItem('foodie_guest_cart_unmerged', guestCart);
        }
      } catch (e) {}
    } else {
      try {
        sessionStorage.removeItem('foodie_guest_cart_unmerged');
        localStorage.removeItem('foodie_guest_cart_unmerged');
      } catch (e) {}
    }
    // Clean up any legacy shared cart key
    try {
      sessionStorage.removeItem('foodie_cart');
      localStorage.removeItem('foodie_cart');
    } catch (e) {}

    const roleKey = (userObj.role === 'admin' || userObj.role === 'employee') ? 'admin' : 'customer';
    const payload = JSON.stringify({ user: userObj, isAuthenticated: true });

    sessionStorage.setItem(`foodie_token_${roleKey}`, token || '');
    sessionStorage.setItem(`foodie_auth_${roleKey}`, payload);
    if (roleKey === 'admin') {
      if (token) sessionStorage.setItem('foodie_staff_access', token);
      if (refresh) sessionStorage.setItem('foodie_staff_refresh', refresh);
      localStorage.removeItem('foodie_token_admin');
      localStorage.removeItem('foodie_auth_admin');
    } else {
      localStorage.setItem(`foodie_token_${roleKey}`, token || '');
      localStorage.setItem(`foodie_auth_${roleKey}`, payload);
      if (refresh) sessionStorage.setItem('foodie_customer_refresh', refresh);
    }

    const userPhone = userObj.phone || userObj.customerPhone || userObj.customer_phone || userObj.mobile;
    if (userPhone) {
      const cleanDigits = String(userPhone).replace(/\D/g, '').slice(-10);
      if (cleanDigits) {
        localStorage.setItem('foodie_customer_phone', cleanDigits);
        sessionStorage.setItem('foodie_customer_phone', cleanDigits);
      }
    }

    setAuthState({ user: userObj, isAuthenticated: true });

    try {
      window.dispatchEvent(new CustomEvent('foodie_orders_updated'));
      localStorage.setItem('foodie_orders_sync_trigger', Date.now().toString());
    } catch (e) {}
  };

  const login = async (email, password) => {
    try {
      const res = await authService.login(email, password);
      saveSession(res.user, res.token, res.refresh);
      return res.user;
    } catch (err) {
      throw err;
    }
  };

  const signup = async (name, email, phone) => {
    try {
      const res = await authService.signup(name, email, phone);
      saveSession(res.user, res.token);
      return res.user;
    } catch (err) {
      throw err;
    }
  };

  const sendOTP = async (phone) => {
    try {
      return await authService.sendOTP(phone);
    } catch (err) {
      throw err;
    }
  };

  const verifyOTP = async (phone, otp) => {
    try {
      const res = await authService.verifyOTP(phone, otp);
      saveSession(res.user, res.token, res.refresh);
      return res;
    } catch (err) {
      throw err;
    }
  };

  const logout = (options = {}) => {
    const scope = options.scope;
    const clearCustomer = scope !== 'staff';
    const clearStaff = scope !== 'customer';

    if (clearStaff) {
      import('../services/adminApi').then(({ staffLogout }) => staffLogout()).catch(() => {});
    }

    if (clearCustomer) {
      try {
        const phone = user?.phone || localStorage.getItem('foodie_customer_phone') || sessionStorage.getItem('foodie_customer_phone');
        const digits = phone ? String(phone).replace(/\D/g, '').slice(-10) : '';
        if (digits) {
          sessionStorage.removeItem(`foodie_cart_${digits}`);
          localStorage.removeItem(`foodie_cart_${digits}`);
          localStorage.removeItem(`foodie_customer_order_ids_${digits}`);
        }
        if (user?.id) {
          sessionStorage.removeItem(`foodie_cart_${user.id}`);
          localStorage.removeItem(`foodie_cart_${user.id}`);
        }
      } catch (e) {}
      sessionStorage.removeItem('foodie_token_customer');
      sessionStorage.removeItem('foodie_auth_customer');
      sessionStorage.removeItem('foodie_customer_refresh');
      sessionStorage.removeItem('foodie_customer_phone');
      sessionStorage.removeItem('foodie_last_placed_order');
      sessionStorage.removeItem('foodie_last_order_items');
      sessionStorage.removeItem('foodie_all_placed_orders');
      sessionStorage.removeItem('foodie_guest_token');
      sessionStorage.removeItem('foodie_guest_cart');
      sessionStorage.removeItem('foodie_guest_cart_temp');
      sessionStorage.removeItem('foodie_guest_cart_unmerged');
      sessionStorage.removeItem('foodie_cart');
      localStorage.removeItem('foodie_token_customer');
      localStorage.removeItem('foodie_auth_customer');
      localStorage.removeItem('foodie_customer_phone');
      localStorage.removeItem('foodie_last_placed_order');
      localStorage.removeItem('foodie_last_order_items');
      localStorage.removeItem('foodie_customer_order_ids');
      localStorage.removeItem('foodie_all_placed_orders');
      localStorage.removeItem('foodie_guest_cart');
      localStorage.removeItem('foodie_guest_cart_temp');
      localStorage.removeItem('foodie_guest_cart_unmerged');
      localStorage.removeItem('foodie_cart');
    }

    if (clearStaff) {
      sessionStorage.removeItem('foodie_token_admin');
      sessionStorage.removeItem('foodie_auth_admin');
      sessionStorage.removeItem('foodie_staff_access');
      sessionStorage.removeItem('foodie_staff_refresh');
      sessionStorage.removeItem('foodie_staff_ordering');
      localStorage.removeItem('foodie_token_admin');
      localStorage.removeItem('foodie_auth_admin');
    }

    sessionStorage.removeItem('foodie_token');
    sessionStorage.removeItem('foodie_auth');
    sessionStorage.removeItem('foodie_cart');
    sessionStorage.removeItem('foodie_guest_token');
    sessionStorage.removeItem('foodie_guest_cart');
    sessionStorage.removeItem('foodie_guest_cart_temp');
    sessionStorage.removeItem('foodie_guest_cart_unmerged');
    localStorage.removeItem('foodie_token');
    localStorage.removeItem('foodie_auth');
    localStorage.removeItem('foodie_cart');
    localStorage.removeItem('foodie_guest_cart');
    localStorage.removeItem('foodie_guest_cart_temp');
    localStorage.removeItem('foodie_guest_cart_unmerged');
    setAuthState({ user: null, isAuthenticated: false });
    try {
      window.dispatchEvent(new CustomEvent('foodie_logout'));
      window.dispatchEvent(new CustomEvent('foodie_orders_updated'));
      localStorage.setItem('foodie_orders_sync_trigger', Date.now().toString());
    } catch (e) {}
  };

  return (
    <AuthContext.Provider value={{ user, isAuthenticated, loading, login, signup, logout, sendOTP, verifyOTP }}>
      {children}
    </AuthContext.Provider>
  );
};
export default AuthContext;
