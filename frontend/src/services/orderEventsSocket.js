import { getStaffAccess, refreshStaffSession } from './staffClient';
import { getWsUrl } from '../config/apiConfig';

const MAX_DELAY_MS = 30000;
const MAX_NETWORK_RETRIES = 8;
const AUTH_CLOSE_CODES = new Set([4401, 4403]);

let socket = null;
let subscribers = new Set();
let reconnectTimer = null;
let delayMs = 2000;
let stopped = false;
let opened = false;
let refreshAttempted = false;
let networkRetries = 0;
let logoutBound = false;

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
    notify('open');
  };

  ws.onmessage = (event) => {
    let data = null;
    try {
      data = JSON.parse(event.data);
    } catch {
      data = null;
    }
    dispatchLivePayload(data);
    notify('message', data);
  };

  ws.onclose = async (event) => {
    if (socket === ws) socket = null;
    if (stopped) return;

    const authFailed = AUTH_CLOSE_CODES.has(event.code) || (!opened && (event.code === 1006 || event.code === 1002));
    if (authFailed && !refreshAttempted) {
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
    if (authFailed) {
      stopped = true;
      notify('unauthorized');
      return;
    }
    if (!hasLiveSession()) return;
    if (networkRetries >= MAX_NETWORK_RETRIES) {
      notify('unavailable');
      return;
    }
    networkRetries += 1;
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      connect();
    }, delayMs);
    delayMs = Math.min(MAX_DELAY_MS, Math.round(delayMs * 1.5));
    notify('reconnecting', { attempt: networkRetries, delayMs });
  };

  ws.onerror = () => {
    /* onclose handles the reconnect */
  };
}

export function startLiveSocket() {
  stopped = false;
  if (!logoutBound && typeof window !== 'undefined') {
    logoutBound = true;
    window.addEventListener('foodie_logout', () => {
      stopLiveSocket();
    });
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
