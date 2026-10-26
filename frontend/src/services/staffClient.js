import { getApiUrl } from '../config/apiConfig';

const ACCESS = 'foodie_staff_access';
const REFRESH = 'foodie_staff_refresh';

export function getStaffAccess() {
  return (
    sessionStorage.getItem(ACCESS) ||
    sessionStorage.getItem('foodie_token_admin') ||
    localStorage.getItem(ACCESS) ||
    localStorage.getItem('foodie_token_admin') ||
    ''
  );
}

export function setStaffSession(access, refresh) {
  sessionStorage.setItem(ACCESS, access);
  if (refresh) sessionStorage.setItem(REFRESH, refresh);
  sessionStorage.setItem('foodie_token_admin', access);
  localStorage.setItem(ACCESS, access);
  if (refresh) localStorage.setItem(REFRESH, refresh);
  localStorage.setItem('foodie_token_admin', access);
}

export function clearStaffSession() {
  for (const key of [ACCESS, REFRESH, 'foodie_token_admin', 'foodie_auth_admin']) {
    sessionStorage.removeItem(key);
    localStorage.removeItem(key);
  }
}

let refreshPromise = null;

export async function refreshStaffSession() {
  const refresh = sessionStorage.getItem(REFRESH) || localStorage.getItem(REFRESH);
  if (!refresh) throw new Error('No refresh token');
  if (!refreshPromise) {
    refreshPromise = fetch(getApiUrl('/auth/refresh/'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ refresh }),
    }).then(async (res) => {
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.detail || 'Session expired');
      setStaffSession(data.access, data.refresh);
      return data.access;
    }).finally(() => {
      refreshPromise = null;
    });
  }
  return refreshPromise;
}

function goToLogin() {
  clearStaffSession();
  if (window.location.pathname.startsWith('/db') || window.location.pathname === '/login') return;
  const currentPath = window.location.pathname + window.location.search;
  try {
    sessionStorage.setItem('foodie_auth_redirect', currentPath);
  } catch (e) {}
  window.location.href = '/login';
}

export async function staffFetch(path, options = {}) {
  const headers = { Accept: 'application/json', ...(options.headers || {}) };
  const body = options.body;
  if (body && !(body instanceof FormData) && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }
  const access = getStaffAccess();
  if (access) headers.Authorization = `Bearer ${access}`;

  let res = await fetch(getApiUrl(path), { method: options.method || 'GET', headers, body });
  if (res.status === 401 && !options._retried) {
    try {
      const next = await refreshStaffSession();
      headers.Authorization = `Bearer ${next}`;
      res = await fetch(getApiUrl(path), { method: options.method || 'GET', headers, body });
    } catch {
      goToLogin();
      const err = new Error('Session expired. Please log in again.');
      err.status = 401;
      throw err;
    }
  }
  return res;
}

export async function staffJson(path, options = {}) {
  const res = await staffFetch(path, options);
  if (res.status === 204) return null;
  const text = await res.text();
  let data = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = { detail: text };
    }
  }
  if (!res.ok) {
    const err = new Error(messageFrom(data) || res.statusText || 'Request failed');
    err.status = res.status;
    err.code = data && data.code;
    err.data = data;
    throw err;
  }
  return data;
}

function isRawBackendDump(text) {
  const sample = String(text || '').slice(0, 400).toLowerCase();
  return (
    sample.includes('<!doctype') ||
    sample.includes('<html') ||
    sample.includes('traceback') ||
    sample.includes('integrityerror') ||
    sample.includes('operationalerror') ||
    sample.includes('django.db')
  );
}

export function messageFrom(data) {
  if (!data) return '';
  if (typeof data.detail === 'string') {
    if (isRawBackendDump(data.detail)) {
      return 'The request could not be completed. Please try again.';
    }
    return data.detail;
  }
  if (Array.isArray(data.detail)) return data.detail.join(', ');
  if (typeof data === 'object') {
    const parts = [];
    for (const [key, val] of Object.entries(data)) {
      if (key === 'code') continue;
      if (Array.isArray(val)) parts.push(`${key}: ${val.join(', ')}`);
      else if (typeof val === 'string') parts.push(`${key}: ${val}`);
    }
    return parts.join(' ');
  }
  return '';
}

export function isStaffScreen() {
  if (typeof window === 'undefined') return false;
  const path = window.location.pathname;
  return path.startsWith('/admin') || path.startsWith('/employee');
}
