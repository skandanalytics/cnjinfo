import React, { createContext, useState, useEffect, useRef, useCallback } from 'react';
import { useLocation } from 'react-router-dom';
import { orderService } from '../services/orderService';
import { notificationService } from '../services/notificationService';
import { startOrderEvents } from '../services/orderEventsSocket';
import { useAuth } from '../hooks/useAuth';

export const OrderContext = createContext();

function uniqueById(rows) {
  const byId = new Map();
  (rows || []).forEach((row) => {
    const id = String(row?.id ?? row?.order_id ?? '');
    if (id) byId.set(id, row);
  });
  return Array.from(byId.values());
}

export const OrderProvider = ({ children }) => {
  const { user, isAuthenticated } = useAuth();
  const location = useLocation();
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const isFetchingRef = useRef(false);
  const pendingFetchRef = useRef(false);
  const pendingStatusIds = useRef(new Set());

  const staffHasSession = () => {
    if (typeof window === 'undefined') return false;
    return Boolean(
      sessionStorage.getItem('foodie_staff_access') ||
      sessionStorage.getItem('foodie_token_admin') ||
      localStorage.getItem('foodie_staff_access') ||
      localStorage.getItem('foodie_token_admin')
    );
  };

  const loadStaffOrders = useCallback(async (showLoading = false) => {
    if (!staffHasSession()) return;
    if (isFetchingRef.current) {
      pendingFetchRef.current = true;
      return;
    }
    isFetchingRef.current = true;
    if (showLoading) setLoading(true);
    try {
      const { listOrdersForUi } = await import('../services/adminApi');
      let currentUser = user;
      if (!currentUser?.id) {
        try {
          const stored = localStorage.getItem('foodie_auth_admin') || sessionStorage.getItem('foodie_auth_admin');
          if (stored) currentUser = JSON.parse(stored);
        } catch {}
      }
      const isEmployee = currentUser?.role === 'employee' || ['STAFF', 'CHEF', 'CASHIER'].includes(currentUser?.backendRole || currentUser?.role);
      const data = await listOrdersForUi(isEmployee ? { mine: true } : {});
      let list = Array.isArray(data) ? data : [];
      if (isEmployee && currentUser?.id) {
        list = list.filter(o => {
          const placedId = String(o.placedById || o.placed_by_id || o.placedBy?.id || o.placed_by?.id || o.employeeId || '');
          return placedId === String(currentUser.id);
        });
      }
      setOrders(uniqueById(list));
    } catch (e) {
      console.error('fetchOrders error:', e);
    } finally {
      setLoading(false);
      isFetchingRef.current = false;
      if (pendingFetchRef.current) {
        pendingFetchRef.current = false;
        loadStaffOrders(false);
      }
    }
  }, [user?.id, user?.role, user?.name, user?.username]);

  const fetchOrders = async (userIdOrShowLoading, maybeShowLoading) => {
    let showLoading = true;
    if (typeof userIdOrShowLoading === 'boolean') {
      showLoading = userIdOrShowLoading;
    } else if (typeof maybeShowLoading === 'boolean') {
      showLoading = maybeShowLoading;
    }
    if (staffHasSession()) {
      await loadStaffOrders(showLoading);
      return;
    }
    if (showLoading) setLoading(true);
    try {
      const data = await orderService.getOrders(userIdOrShowLoading, true);
      if (Array.isArray(data)) setOrders(uniqueById(data));
    } catch (e) {
      console.error('fetchOrders error:', e);
    } finally {
      setLoading(false);
    }
  };

  const fetchOrdersSilently = async () => {
    await loadStaffOrders(false);
  };

  useEffect(() => {
    if (!staffHasSession()) {
      setLoading(false);
      return undefined;
    }
    loadStaffOrders(true);
    const handleOrdersUpdated = () => {
      if (staffHasSession()) loadStaffOrders(false);
    };
    const handleStorage = (e) => {
      if (e.key === 'foodie_orders_sync_trigger' || e.key === 'foodie_data_sync' || e.key === 'foodie_last_placed_order') {
        handleOrdersUpdated();
      }
    };
    window.addEventListener('foodie_orders_updated', handleOrdersUpdated);
    window.addEventListener('foodie_data_sync_refetch', handleOrdersUpdated);
    window.addEventListener('storage', handleStorage);
    const handleLogout = () => setOrders([]);
    window.addEventListener('foodie_logout', handleLogout);
    return () => {
      window.removeEventListener('foodie_orders_updated', handleOrdersUpdated);
      window.removeEventListener('foodie_data_sync_refetch', handleOrdersUpdated);
      window.removeEventListener('storage', handleStorage);
      window.removeEventListener('foodie_logout', handleLogout);
    };
  }, [isAuthenticated, user?.id, loadStaffOrders]);

  useEffect(() => {
    const path = location.pathname || '';
    if (!staffHasSession()) return undefined;
    if (path.includes('/kitchen') || path.includes('/orders') || path.includes('/tables') || path.includes('/dashboard') || path.includes('/pos')) {
      loadStaffOrders(false);
    }
  }, [location.pathname, loadStaffOrders]);

  useEffect(() => {
    if (!staffHasSession() && !sessionStorage.getItem('foodie_token_customer') && !localStorage.getItem('foodie_token_customer')) {
      return undefined;
    }
    return startOrderEvents((type) => {
      if (type === 'open' && staffHasSession()) loadStaffOrders(false);
    });
  }, [isAuthenticated, user?.id, loadStaffOrders]);

  const updateStatus = async (id, status, reason) => {
    const key = String(id);
    if (pendingStatusIds.current.has(key)) {
      throw new Error('This order is already being updated.');
    }
    pendingStatusIds.current.add(key);
    try {
      const updated = await orderService.updateOrderStatus(id, status, reason);
      if (updated) {
        setOrders((prevOrders) => uniqueById(prevOrders.map((o) => (
          String(o.id) === key ? { ...o, ...updated } : o
        ))));
      }
      if (String(status).toLowerCase() === 'ready') {
        const targetOrd = updated || (orders || []).find((o) => String(o.id) === key);
        const isTakeaway = targetOrd?.orderType === 'Takeaway' || targetOrd?.table === 'Takeaway'
          || String(targetOrd?.table).toLowerCase() === 'takeaway';
        const msg = isTakeaway
          ? `Takeaway Order #${id} is READY for counter pickup!`
          : `Order #${id} is READY to be served!`;
        notificationService.createNotification(msg).catch(() => {});
      }
      window.dispatchEvent(new CustomEvent('foodie_orders_updated', { detail: { orderId: id, status } }));
      window.dispatchEvent(new CustomEvent('foodie_tables_updated', { detail: { orderId: id } }));
      try { localStorage.setItem('foodie_orders_sync_trigger', String(Date.now())); } catch { /* other tabs */ }
      return updated;
    } catch (e) {
      await loadStaffOrders(false);
      throw e;
    } finally {
      pendingStatusIds.current.delete(key);
    }
  };

  return (
    <OrderContext.Provider value={{ orders, loading, fetchOrders, updateStatus }}>
      {children}
    </OrderContext.Provider>
  );
};
export default OrderContext;
