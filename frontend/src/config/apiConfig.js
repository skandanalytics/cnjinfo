/**
 * Foodie — Centralized API & WebSocket Configuration
 * 
 * ============================================================================
 * HOW TO CHANGE THE BACKEND SERVER IP / DOMAIN:
 * ============================================================================
 * You can set the backend server URL in ONE of two ways:
 * 
 * Option 1 (Direct configuration in this file):
 *   Change `DEFAULT_SERVER_URL` below to your server's IP address or domain:
 *   e.g. export const DEFAULT_SERVER_URL = 'http://192.168.1.100:8000';
 * 
 * Option 2 (Environment variable):
 *   Set `VITE_API_BASE_URL` in your `.env` or `.env.production` file:
 *   VITE_API_BASE_URL=http://192.168.1.100:8000
 * 
 * Both HTTP API calls and WebSocket connections automatically adapt to this address.
 * No other frontend files need to be edited!
 * ============================================================================
 */

// Set to your centralized server address:
export const DEFAULT_SERVER_URL = 'http://192.168.1.15:8000';

/**
 * Resolves the raw base URL from environment variables or the default server URL fallback.
 */
function resolveRawBaseUrl() {
  const envUrl = (
    import.meta.env.VITE_API_BASE_URL ||
    import.meta.env.VITE_MAIN_API_URL ||
    ''
  ).trim();

  // If envUrl is an explicit absolute URL (http:// or https://), it takes highest precedence
  if (/^https?:\/\//i.test(envUrl)) {
    return envUrl.replace(/\/+$/, '');
  }

  // If DEFAULT_SERVER_URL is configured, use it
  if (DEFAULT_SERVER_URL && DEFAULT_SERVER_URL.trim()) {
    return DEFAULT_SERVER_URL.trim().replace(/\/+$/, '');
  }

  // If relative path from env (e.g. '/api' for proxy)
  if (envUrl) {
    return envUrl.replace(/\/+$/, '');
  }

  const devTarget = (import.meta.env.VITE_API_TARGET || '').trim();
  if (/^https?:\/\//i.test(devTarget)) {
    return devTarget.replace(/\/+$/, '');
  }

  // If running in browser, automatically target backend port 8000 on the same host
  if (typeof window !== 'undefined' && window.location && window.location.hostname) {
    return `${window.location.protocol}//${window.location.hostname}:8000`;
  }

  return 'http://127.0.0.1:8000';
}

const rawBase = resolveRawBaseUrl();

/**
 * Server Origin (e.g. 'http://192.168.1.100:8000' or '' if relative)
 */
export const SERVER_ORIGIN = (() => {
  if (!rawBase) return '';
  if (/^https?:\/\//i.test(rawBase)) {
    try {
      const parsed = new URL(rawBase);
      return parsed.origin;
    } catch {
      return rawBase.replace(/\/api\/?$/i, '');
    }
  }
  return '';
})();

/**
 * API Base URL (e.g. 'http://192.168.1.100:8000/api' or '/api')
 */
export const API_BASE_URL = (() => {
  if (!rawBase) return '/api';
  if (rawBase.endsWith('/api')) return rawBase;
  if (/^https?:\/\//i.test(rawBase)) {
    return `${rawBase}/api`;
  }
  if (rawBase.startsWith('/')) {
    return rawBase.endsWith('/api') ? rawBase : `${rawBase}/api`;
  }
  return `/${rawBase}/api`;
})();

/**
 * WebSocket Base URL (e.g. 'ws://192.168.1.100:8000/ws' or 'wss://...' or browser location fallback)
 */
export const WS_BASE_URL = (() => {
  const envWs = (import.meta.env.VITE_WS_BASE_URL || '').trim().replace(/\/+$/, '');
  if (envWs) return envWs;

  if (rawBase && /^https?:\/\//i.test(rawBase)) {
    const isSsl = /^https:/i.test(rawBase);
    const hostWithPort = rawBase.replace(/^https?:\/\//i, '').replace(/\/.*$/, '');
    const wsProto = isSsl ? 'wss:' : 'ws:';
    return `${wsProto}//${hostWithPort}/ws`;
  }

  // Fallback to browser host if running in browser
  if (typeof window !== 'undefined' && window.location) {
    const wsProto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${wsProto}//${window.location.host}/ws`;
  }

  return 'ws://127.0.0.1:8000/ws';
})();

/**
 * Media Base URL (e.g. 'http://192.168.1.100:8000/media' or '/media')
 */
export const MEDIA_BASE_URL = (() => {
  if (SERVER_ORIGIN) {
    return `${SERVER_ORIGIN}/media`;
  }
  return '/media';
})();

/**
 * Build a complete API URL for any given path or endpoint
 * @param {string} endpoint - API path (e.g. '/orders/' or 'menu/dishes/')
 * @returns {string} full API URL
 */
export function getApiUrl(endpoint = '') {
  if (!endpoint) return API_BASE_URL;
  if (/^https?:\/\//i.test(endpoint)) return endpoint;
  const path = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
  // Prevent duplicate /api if endpoint already begins with /api/
  if (path.startsWith('/api/')) {
    return SERVER_ORIGIN ? `${SERVER_ORIGIN}${path}` : path;
  }
  return `${API_BASE_URL}${path}`;
}

/**
 * Build a complete WebSocket URL for any given path and query params
 * @param {string} path - WebSocket endpoint path (e.g. '/orders/' or 'orders/')
 * @param {Record<string, string|number|boolean>} [params={}] - Optional query params
 * @returns {string} full WebSocket URL
 */
export function getWsUrl(path = '/orders/', params = {}) {
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  const base = `${WS_BASE_URL}${cleanPath}`;
  const queryEntries = Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== '');
  if (queryEntries.length === 0) return base;
  const search = new URLSearchParams(queryEntries).toString();
  return `${base}?${search}`;
}

/**
 * Build a complete Media URL for an image or upload
 * @param {string} relativePath - Relative path (e.g. 'dishes/burger.jpg')
 * @returns {string} full Media URL
 */
export function getMediaUrl(relativePath = '') {
  if (!relativePath) return '';
  if (/^(?:https?:|\/\/|data:|blob:)/i.test(relativePath)) return relativePath;
  const clean = relativePath.startsWith('/') ? relativePath.slice(1) : relativePath;
  const normalized = clean.startsWith('media/') ? clean.slice(6) : clean;
  return `${MEDIA_BASE_URL}/${normalized}`;
}

export default {
  DEFAULT_SERVER_URL,
  SERVER_ORIGIN,
  API_BASE_URL,
  WS_BASE_URL,
  MEDIA_BASE_URL,
  getApiUrl,
  getWsUrl,
  getMediaUrl,
};
