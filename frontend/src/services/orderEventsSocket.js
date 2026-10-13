import { getStaffAccess, refreshStaffSession } from './staffClient';

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
  if (data.order_id) {
    window.dispatchEvent(new CustomEvent('foodie_orders_updated', { detail: data }));
    window.dispatchEvent(new CustomEvent('foodie_tables_updated', { detail: data }));
  }
  const resource = data.resource;
  if (resource === 'menu' || resource === 'category' || resource === 'inventory') {
    window.dispatchEvent(new CustomEvent('foodie_products_updated', { detail: data }));
    window.dispatchEvent(new CustomEvent('foodie_inventory_updated', { detail: data }));
    window.dispatchEvent(new CustomEvent('foodie_categories_updated', { detail: data }));
  }
  if (resource === 'coupon' || resource === 'menu' || resource === 'inventory') {
    window.dispatchEvent(new CustomEvent('foodie_offers_updated', { detail: data }));
  }
  if (resource === 'table') {
    window.dispatchEvent(new CustomEvent('foodie_tables_updated', { detail: data }));
  }
  if (resource) {
    try {
      localStorage.setItem('foodie_data_sync', JSON.stringify({ t: Date.now(), resource, action: data.action }));
    } catch { /* other tabs */ }
  }
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

  const proto = window.location.protocol === 'https:' ? 'wss' : 'ws';
  const ws = new WebSocket(`${proto}://${window.location.host}/ws/orders/?token=${encodeURIComponent(token)}`);
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
      delayMs = Math.min(delayMs * 2, MAX_DELAY_MS);
      connect();
    }, delayMs);
  };
}

function handleLogout() {
  stopped = true;
  clearSocket();
}

export function startOrderEvents(listener) {
  subscribers.add(listener);
  stopped = false;
  if (!logoutBound && typeof window !== 'undefined') {
    window.addEventListener('foodie_logout', handleLogout);
    logoutBound = true;
  }
  connect();
  return () => {
    subscribers.delete(listener);
    if (subscribers.size === 0) {
      clearSocket();
    }
  };
}
