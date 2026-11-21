import { notifyOrderCreated } from './notificationService';
import { getStaffAccess, refreshStaffSession } from './staffClient';
import { getWsUrl } from '../config/apiConfig';

const MAX_DELAY_MS = 25000;
const AUTH_CLOSE_CODES = new Set([4401, 4403]);
const HEARTBEAT_INTERVAL_MS = 25000;
const HEARTBEAT_TIMEOUT_MS = 60000;

let socket = null;
let subscribers = new Set();
let reconnectTimer = null;
let heartbeatTimer = null;
let lastPong = Date.now();
let delayMs = 2000;
let stopped = false;
let opened = false;
let refreshAttempted = false;
let networkRetries = 0;
let logoutBound = false;
let onlineBound = false;

let syncRefetchDebounceTimer = null;
function dispatchDebouncedSyncRefetch() {
  if (typeof window === 'undefined') return;
  if (syncRefetchDebounceTimer) clearTimeout(syncRefetchDebounceTimer);
  syncRefetchDebounceTimer = setTimeout(() => {
    syncRefetchDebounceTimer = null;
    window.dispatchEvent(new CustomEvent('foodie_data_sync_refetch'));
  }, 300);
}

function notify(type, payload) {
  subscribers.forEach((listener) => {
    try {
      listener(type, payload);
    } catch {
      /* a listener error must not drop the socket */
    }
  });
}

function hasLiveSession() {
  if (typeof window === 'undefined') return false;
  return Boolean(
    getStaffAccess()
    || sessionStorage.getItem('foodie_token_customer')
    || localStorage.getItem('foodie_token_customer')
  );
}

function tokenExpiringSoon(token) {
  try {
    const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
    return !payload.exp || payload.exp * 1000 < Date.now() + 60000;
  } catch {
    return true;
  }
}

async function liveAccessToken() {
  let token = getStaffAccess();
  if (token) {
    if (tokenExpiringSoon(token)) {
      try {
        token = await refreshStaffSession();
      } catch {
        return '';
      }
    }
    return token;
  }
  return sessionStorage.getItem('foodie_token_customer') || localStorage.getItem('foodie_token_customer') || '';
}

function clearSocket() {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  if (heartbeatTimer) {
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }
  if (!socket) return;
  socket.onopen = null;
  socket.onmessage = null;
  socket.onerror = null;
  socket.onclose = null;
  try {
    socket.close(1000);
  } catch {
    /* already closed */
  }
  socket = null;
}

function dispatchLivePayload(data) {
  if (!data || typeof window === 'undefined') return;
  if (data.order_id || data.resource === 'order') {
    window.dispatchEvent(new CustomEvent('foodie_orders_updated', { detail: data }));
    window.dispatchEvent(new CustomEvent('foodie_tables_updated', { detail: data }));
    if (data.action === 'created' && data.order_id) {
      notifyOrderCreated({
        id: data.order_id,
        order_number: data.order_number || data.display_order_number || data.order_id,
        table: data.table,
        total_amount: data.total_amount,
        branch_id: data.branch_id || data.branchId
      });
    }
  }
  const resource = data.resource;
  if (resource === 'menu' || resource === 'category' || resource === 'inventory') {
    window.dispatchEvent(new CustomEvent('foodie_products_updated', { detail: data }));
    window.dispatchEvent(new CustomEvent('foodie_inventory_updated', { detail: data }));
    window.dispatchEvent(new CustomEvent('foodie_categories_updated', { detail: data }));
  }
  if (resource === 'coupon' || resource === 'offer' || resource === 'menu' || resource === 'inventory') {
    window.dispatchEvent(new CustomEvent('foodie_offers_updated', { detail: data }));
  }
  if (resource === 'table') {
    window.dispatchEvent(new CustomEvent('foodie_tables_updated', { detail: data }));
  }
  if (resource === 'branch') {
    window.dispatchEvent(new CustomEvent('foodie_branches_updated', { detail: data }));
  }
  try {
    const syncTag = resource || (data.order_id ? 'order' : 'data');
    localStorage.setItem('foodie_data_sync', JSON.stringify({ t: Date.now(), resource: syncTag, action: data.action }));
    if (data.order_id || data.resource === 'order') {
      localStorage.setItem('foodie_orders_sync_trigger', String(Date.now()));
    }
  } catch { /* other tabs */ }
}

async function connect() {
  if (stopped || !hasLiveSession()) return;
  if (socket && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)) return;

  const token = await liveAccessToken();
  if (!token) {
    stopped = true;
    notify('unauthorized');
    return;
  }

  const wsUrl = getWsUrl('/orders/', { token });
  const ws = new WebSocket(wsUrl);
  socket = ws;
  opened = false;

  ws.onopen = () => {
    opened = true;
    delayMs = 2000;
    networkRetries = 0;
    refreshAttempted = false;
    lastPong = Date.now();

    // Start 25s ping heartbeat
    if (heartbeatTimer) clearInterval(heartbeatTimer);
    heartbeatTimer = setInterval(() => {
      if (socket && socket.readyState === WebSocket.OPEN) {
        if (Date.now() - lastPong > HEARTBEAT_TIMEOUT_MS) {
          clearSocket();
          connect();
          return;
        }
        try {
          socket.send(JSON.stringify({ type: 'ping' }));
        } catch {}
      }
    }, HEARTBEAT_INTERVAL_MS);

    notify('open');
    dispatchDebouncedSyncRefetch();
  };

  ws.onmessage = (event) => {
    let data = null;
    try {
      data = JSON.parse(event.data);
    } catch {
      data = null;
    }
    if (data?.type === 'pong') {
      lastPong = Date.now();
      return;
    }
    dispatchLivePayload(data);
    notify('message', data);
  };

  ws.onclose = async (event) => {
    if (heartbeatTimer) {
      clearInterval(heartbeatTimer);
      heartbeatTimer = null;
    }
    if (socket === ws) socket = null;
    if (stopped) return;

    // Genuine authentication / authorization close codes (4401, 4403)
    const isAuthClose = AUTH_CLOSE_CODES.has(event.code);
    if (isAuthClose && !refreshAttempted) {
      refreshAttempted = true;
      try {
        await refreshStaffSession();
        connect();
        return;
      } catch {
        stopped = true;
        notify('unauthorized');
        return;
      }
    }
    if (isAuthClose) {
      stopped = true;
      notify('unauthorized');
      return;
    }

    if (!hasLiveSession()) return;

    networkRetries += 1;
    // Jittered backoff (0.85x to 1.15x) capped at MAX_DELAY_MS (25s)
    const jitter = 0.85 + Math.random() * 0.3;
    const scheduledDelay = Math.min(MAX_DELAY_MS, Math.round(delayMs * jitter));

    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      connect();
    }, scheduledDelay);
    delayMs = Math.min(MAX_DELAY_MS, Math.round(delayMs * 1.5));
    notify('reconnecting', { attempt: networkRetries, delayMs: scheduledDelay });
  };

  ws.onerror = () => {
    /* onclose handles the reconnect */
  };
}

export function startLiveSocket() {
  stopped = false;
  if (typeof window !== 'undefined') {
    if (!logoutBound) {
      logoutBound = true;
      window.addEventListener('foodie_logout', () => {
        stopLiveSocket();
      });
    }
    if (!onlineBound) {
      onlineBound = true;
      window.addEventListener('online', () => {
        if (!stopped && hasLiveSession()) {
          if (!socket || socket.readyState === WebSocket.CLOSED) {
            delayMs = 2000;
            networkRetries = 0;
            connect();
          }
        }
      });
    }
  }
  connect();
}

export function stopLiveSocket() {
  stopped = true;
  clearSocket();
}

export function subscribeLiveEvents(listener) {
  subscribers.add(listener);
  startLiveSocket();
  return () => {
    subscribers.delete(listener);
    if (!subscribers.size) stopLiveSocket();
  };
}

export function sendLiveAction(action, payload = {}) {
  if (!socket || socket.readyState !== WebSocket.OPEN) {
    return false;
  }
  try {
    socket.send(JSON.stringify({ action, ...payload }));
    return true;
  } catch {
    return false;
  }
}

export function startOrderEvents(listener) {
  return subscribeLiveEvents((type, payload) => {
    if (type === 'message' && payload) {
      if (payload.order_id || payload.resource === 'order') {
        listener('order', payload);
      } else {
        listener('data', payload);
      }
    } else {
      listener(type, payload);
    }
  });
}
