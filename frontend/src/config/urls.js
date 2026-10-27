/**
 * Foodie — Centralized URL Builders
 * 
 * Provides consistent URL resolution for HTTP APIs, WebSockets, Media assets,
 * and customer navigation routes using the authoritative environment configuration.
 */

import {
  API_BASE_URL,
  SERVER_ORIGIN,
  WS_BASE_URL,
  MEDIA_BASE_URL,
  PUBLIC_FRONTEND_URL
} from './environment';

/**
 * Builds a complete backend API URL for an endpoint.
 * Ensures consistent `/api/` prefix without duplicates.
 * 
 * @param {string} endpoint - API path (e.g. '/orders/' or 'menu/dishes/')
 * @returns {string} Fully qualified API URL
 */
export function getApiUrl(endpoint = '') {
  if (!endpoint) return API_BASE_URL;
  if (/^https?:\/\//i.test(endpoint)) return endpoint;

  const clean = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
  
  if (clean.startsWith('/api/')) {
    return `${SERVER_ORIGIN}${clean}`;
  }

  const base = API_BASE_URL.replace(/\/+$/, '');
  return `${base}${clean}`;
}

/**
 * Builds a complete WebSocket URL for an endpoint with optional query params.
 * 
 * @param {string} path - WebSocket path (e.g. '/orders/' or 'realtime/')
 * @param {Record<string, string|number|boolean>} [params={}] - Query parameters
 * @returns {string} Fully qualified WebSocket URL
 */
export function getWsUrl(path = '/orders/', params = {}) {
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  const base = `${WS_BASE_URL.replace(/\/+$/, '')}${cleanPath}`;
  
  const entries = Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== '');
  if (entries.length === 0) return base;

  const search = new URLSearchParams(entries).toString();
  return `${base}?${search}`;
}

/**
 * Builds a complete Media URL for an image or file asset.
 * 
 * @param {string} relativePath - Relative path (e.g. 'dishes/pizza.jpg')
 * @returns {string} Fully qualified Media URL
 */
export function getMediaUrl(relativePath = '') {
  if (!relativePath) return '';
  if (/^(?:https?:|\/\/|data:|blob:)/i.test(relativePath)) return relativePath;

  const clean = relativePath.startsWith('/') ? relativePath.slice(1) : relativePath;
  const normalized = clean.startsWith('media/') ? clean.slice(6) : clean;
  return `${MEDIA_BASE_URL.replace(/\/+$/, '')}/${normalized}`;
}

/**
 * Builds customer frontend route URLs using the public frontend URL.
 * 
 * @param {string|number} [tableId] - Optional table identifier
 * @param {string} [qrToken] - Optional table QR token
 * @returns {string} Full customer welcome URL
 */
export function getCustomerWelcomeUrl(tableId, qrToken) {
  const base = PUBLIC_FRONTEND_URL.replace(/\/+$/, '');
  const params = new URLSearchParams();
  if (tableId) params.append('table', String(tableId));
  if (qrToken) params.append('qr', String(qrToken));

  const query = params.toString();
  return query ? `${base}/customer/welcome?${query}` : `${base}/customer/welcome`;
}

export default {
  getApiUrl,
  getWsUrl,
  getMediaUrl,
  getCustomerWelcomeUrl,
};
