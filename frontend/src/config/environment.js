/**
 * Foodie — Authoritative Frontend Environment Configuration
 * 
 * Configured for Local Development:
 * - Default API Base URL: http://127.0.0.1:8000/api/
 * - For mobile/phone testing over LAN: Set VITE_API_BASE_URL=http://<LAN_IP>:8000/api/ in .env
 */

// Local defaults
export const DEFAULT_API_BASE_URL = 'http://127.0.0.1:8000/api/';
export const DEFAULT_PUBLIC_FRONTEND_URL = 'http://127.0.0.1:5173';

function computeApiBaseUrl() {
  const rawEnvApi = (
    import.meta.env.VITE_API_BASE_URL ||
    import.meta.env.VITE_MAIN_API_URL ||
    ''
  ).trim();

  // In-browser dynamic resolution for mobile/LAN testing:
  // When a mobile phone opens http://<LAN_IP>:5173, loopback 127.0.0.1 points to the phone.
  // We automatically derive the API backend on the same computer: http://<LAN_IP>:8000/api/
  if (typeof window !== 'undefined' && window.location) {
    const { hostname } = window.location;
    const isLoopback = hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '0.0.0.0';

    if (!isLoopback) {
      if (!rawEnvApi || /127\.0\.0\.1|localhost/i.test(rawEnvApi)) {
        // Mobile testing over LAN: route through Vite dev server proxy at /api/
        return `${window.location.origin.replace(/\/+$/, '')}/api/`;
      }
    }
  }

  const base = (
    rawEnvApi && /^https?:\/\//i.test(rawEnvApi)
      ? rawEnvApi
      : DEFAULT_API_BASE_URL
  ).replace(/\/+$/, '') + '/';

  return base;
}

function computePublicFrontendUrl() {
  if (typeof window !== 'undefined' && window.location && window.location.origin) {
    const { hostname, origin } = window.location;
    const isLoopback = hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '0.0.0.0';
    if (!isLoopback) {
      return origin.replace(/\/+$/, '');
    }
  }

  const rawEnvFrontend = (
    import.meta.env.VITE_PUBLIC_FRONTEND_URL ||
    import.meta.env.VITE_FRONTEND_BASE_URL ||
    ''
  ).trim();

  return (
    rawEnvFrontend && /^https?:\/\//i.test(rawEnvFrontend)
      ? rawEnvFrontend
      : DEFAULT_PUBLIC_FRONTEND_URL
  ).replace(/\/+$/, '');
}

export const API_BASE_URL = computeApiBaseUrl();
export const PUBLIC_FRONTEND_URL = computePublicFrontendUrl();

// Server Origin (e.g. 'http://127.0.0.1:8000' or 'http://192.168.68.104:8000')
export const SERVER_ORIGIN = (() => {
  try {
    const u = new URL(API_BASE_URL);
    return u.origin;
  } catch {
    return API_BASE_URL.replace(/\/api\/?$/i, '');
  }
})();

// WebSocket base URL (e.g. 'ws://127.0.0.1:8000/ws')
export const WS_BASE_URL = (() => {
  const envWs = (import.meta.env.VITE_WS_BASE_URL || '').trim();
  if (envWs) return envWs.replace(/\/+$/, '');

  try {
    const u = new URL(API_BASE_URL);
    const wsProto = u.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${wsProto}//${u.host}/ws`;
  } catch {
    return 'ws://127.0.0.1:8000/ws';
  }
})();

// Media base URL (e.g. 'http://127.0.0.1:8000/media')
export const MEDIA_BASE_URL = `${SERVER_ORIGIN}/media`;

// Application Metadata
export const APP_NAME = import.meta.env.VITE_APP_NAME || 'Foodie';
export const APP_ENVIRONMENT = import.meta.env.VITE_ENVIRONMENT || import.meta.env.MODE || 'development';

export const APP_MODE = 'local';
export const IS_CENTRALIZED = false;
export const IS_LOCAL = true;

// Development startup logging
if (typeof window !== 'undefined' && !window.__FOODIE_ENV_LOGGED__) {
  window.__FOODIE_ENV_LOGGED__ = true;
  console.log(
    `%c[Foodie Environment]%c API: ${API_BASE_URL} | Frontend: ${PUBLIC_FRONTEND_URL}`,
    'background: #dc3545; color: white; padding: 2px 6px; border-radius: 3px; font-weight: bold;',
    'color: #333; font-weight: 500;'
  );
}

export default API_BASE_URL;
