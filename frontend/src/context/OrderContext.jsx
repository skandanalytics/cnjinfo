import React, { createContext, useState, useEffect, useRef } from 'react';
import { orderService } from '../services/orderService';
import { notificationService } from '../services/notificationService';

export const OrderContext = createContext();

export const OrderProvider = ({ children }) => {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const isFetchingRef = useRef(false);
  const pollBackoffUntilRef = useRef(0);

  const staffHasSession = () => {
    if (typeof window === 'undefined') return false;
    return Boolean(sessionStorage.getItem('foodie_staff_access') || sessionStorage.getItem('foodie_token_admin'));
  };

  const fetchOrders = async (userIdOrShowLoading, maybeShowLoading) => {
    let targetUser = undefined;
    let showLoading = true;
    if (typeof userIdOrShowLoading === 'string') {
      targetUser = userIdOrShowLoading;
      if (typeof maybeShowLoading === 'boolean') showLoading = maybeShowLoading;
    } else if (typeof userIdOrShowLoading === 'boolean') {
      showLoading = userIdOrShowLoading;
    }

    if (isFetchingRef.current) return;
    isFetchingRef.current = true;

    if (showLoading) setLoading(true);
    try {
      const path = typeof window !== 'undefined' ? window.location.pathname : '';
      const isStaffRoute = path.includes('/admin') || path.includes('/employee');
      const arg = targetUser || (isStaffRoute ? 'ALL' : undefined);
      const data = await orderService.getOrders(arg, true);
      setOrders(Array.isArray(data) ? data : []);
    } catch (e) {
      console.error("fetchOrders error:", e);
    } finally {
      setLoading(false);
      isFetchingRef.current = false;
    }
  };

  const fetchOrdersSilently = async (targetUser) => {
    if (isFetchingRef.current) return;
    if (Date.now() < pollBackoffUntilRef.current) return;
    isFetchingRef.current = true;
    try {
      const path = typeof window !== 'undefined' ? window.location.pathname : '';
      const isStaffRoute = path.includes('/admin') || path.includes('/employee');
      const arg = targetUser || (isStaffRoute ? 'ALL' : undefined);
      const data = await orderService.getOrders(arg, true);
      setOrders(Array.isArray(data) ? data : []);
      pollBackoffUntilRef.current = 0;
    } catch (e) {
      console.error("fetchOrdersSilently error:", e);
      const status = e && e.status;
      if (!status || status >= 500) {
        pollBackoffUntilRef.current = Date.now() + 60000;
      }
    } finally {
      setLoading(false);
      isFetchingRef.current = false;
    }
  };

  useEffect(() => {
    const path = typeof window !== 'undefined' ? window.location.pathname : '';
    const isStaffRoute = path.includes('/admin') || path.includes('/employee');

    if (isStaffRoute && staffHasSession()) {
      fetchOrders(true);
    }

    const handleOrdersUpdated = () => {
      const currentPath = typeof window !== 'undefined' ? window.location.pathname : '';
      const isStaff = currentPath.includes('/admin') || currentPath.includes('/employee');
      if (isStaff && staffHasSession()) {
        fetchOrdersSilently();
      }
    };

    const handleStorage = (e) => {
      if (e.key === 'foodie_orders_sync_trigger' || e.key === 'foodie_order_status_overrides' || e.key === 'foodie_last_placed_order') {
        handleOrdersUpdated();
      }
    };

    window.addEventListener('foodie_orders_updated', handleOrdersUpdated);
    window.addEventListener('foodie_tables_updated', handleOrdersUpdated);
    window.addEventListener('storage', handleStorage);
    
    const handleLogout = () => {
      setOrders([]);
    };
    window.addEventListener('foodie_logout', handleLogout);

    return () => {
      window.removeEventListener('foodie_orders_updated', handleOrdersUpdated);
      window.removeEventListener('foodie_tables_updated', handleOrdersUpdated);
      window.removeEventListener('storage', handleStorage);
      window.removeEventListener('foodie_logout', handleLogout);
    };
  }, []);

  // Fallback refresh. Live updates come from the orders websocket; this poll
  // stays slow and pauses for a minute after a 5xx so a down database is not stampeded.
  useEffect(() => {
    const pollInterval = setInterval(() => {
      if (typeof document !== 'undefined' && document.hidden) return;
      const currentPath = typeof window !== 'undefined' ? window.location.pathname : '';
      const isStaff = currentPath.includes('/admin') || currentPath.includes('/employee');
      if (isStaff && staffHasSession()) {
        fetchOrdersSilently();
      }
    }, 5000);

    return () => clearInterval(pollInterval);
  }, []);

  useEffect(() => {
    const path = window.location.pathname;
    if (!path.startsWith('/admin') && !path.startsWith('/employee')) return undefined;
    const token = sessionStorage.getItem('foodie_staff_access');
    if (!token) return undefined;
    let socket;
    let closed = false;
    let timer;
    let delay = 2000;
    const connect = () => {
      const access = sessionStorage.getItem('foodie_staff_access');
      if (!access || closed) return;
      const proto = window.location.protocol === 'https:' ? 'wss' : 'ws';
      socket = new WebSocket(`${proto}://${window.location.host}/ws/orders/?token=${encodeURIComponent(access)}`);
      socket.onopen = () => { delay = 2000; };
      socket.onmessage = () => fetchOrdersSilently();
      socket.onclose = () => {
        if (!closed) {
          timer = setTimeout(connect, delay);
          delay = Math.min(delay * 2, 30000);
        }
      };
    };
    connect();
    return () => {
      closed = true;
      if (timer) clearTimeout(timer);
      if (socket) socket.close();
    };
  }, []);

  const updateStatus = async (id, status, reason) => {
    const now = Date.now();
    let previousStatus = null;

    // Optimistically update React state immediately with transition timestamp
    setOrders((prevOrders) =>
      prevOrders.map((o) => {
        if (String(o.id) === String(id)) {
          previousStatus = o.status;
          const statusTimes = { ...(o.statusTimes || {}), [status]: now, updatedAt: now };
          return {
            ...o,
            status,
            statusTimes,
            statusUpdatedAt: now,
            ...(status === 'Preparing' ? { preparingAt: now } : {}),
            ...(status === 'Ready' ? { readyAt: now } : {}),
            ...(status === 'Serving' || status === 'Completed' ? { completedAt: now } : {})
          };
        }
        return o;
      })
    );

    try {
      const updated = await orderService.updateOrderStatus(id, status, reason);
      if (status === 'Ready' || status === 'ready') {
        const targetOrd = (orders || []).find(o => String(o.id) === String(id));
        const isTakeaway = targetOrd?.orderType === 'Takeaway' || targetOrd?.table === 'Takeaway' || String(targetOrd?.table).toLowerCase() === 'takeaway';
        const msg = isTakeaway
          ? `Takeaway Order #${id} is READY for counter pickup!`
          : `Order #${id} is READY to be served!`;
        notificationService.createNotification(msg).catch(() => {});
      }
      fetchOrdersSilently();
      return updated;
    } catch (e) {
      console.error("Failed to update status:", e);
      if (previousStatus) {
        setOrders((prevOrders) =>
          prevOrders.map((o) => {
            if (String(o.id) === String(id)) {
              return { ...o, status: previousStatus };
            }
            return o;
          })
        );
      }
      fetchOrdersSilently();
      throw e;
    }
  };

  return (
    <OrderContext.Provider value={{ orders, loading, fetchOrders, updateStatus }}>
      {children}
    </OrderContext.Provider>
  );
};
export default OrderContext;
