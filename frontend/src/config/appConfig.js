/**
 * Foodie — Centralized Application Configuration
 * 
 * Re-exports application metadata, environment variables,
 * and unified API / WebSocket / Media configuration helpers.
 */

import {
  DEFAULT_SERVER_URL,
  SERVER_ORIGIN,
  API_BASE_URL,
  WS_BASE_URL,
  MEDIA_BASE_URL,
  getApiUrl,
  getWsUrl,
  getMediaUrl,
} from './apiConfig';

export const APP_NAME = import.meta.env.VITE_APP_NAME || 'Foodie';
export const APP_ENVIRONMENT = import.meta.env.VITE_ENVIRONMENT || import.meta.env.MODE || 'development';

export const IS_PRODUCTION = APP_ENVIRONMENT === 'production';
export const IS_DEVELOPMENT = APP_ENVIRONMENT === 'development';

/**
 * Returns the customer frontend base URL (used for QR code links, customer redirection).
 * Falls back to window.location.origin if running in a browser.
 */
export function getFrontendBaseUrl() {
  const envUrl = (import.meta.env.VITE_FRONTEND_BASE_URL || '').trim().replace(/\/+$/, '');
  if (envUrl) return envUrl;
  if (typeof window !== 'undefined' && window.location && window.location.origin) {
    return window.location.origin.replace(/\/+$/, '');
  }
  return 'http://localhost:5173';
}

/**
 * Determine if current client is configured for centralized deployment (remote server IP)
 * or local deployment (localhost / 127.0.0.1).
 */
export function isCentralizedDeployment() {
  const origin = SERVER_ORIGIN || API_BASE_URL;
  if (!origin) return false;
  return !origin.includes('localhost') && !origin.includes('127.0.0.1');
}

export const appConfig = {
  APP_NAME,
  APP_ENVIRONMENT,
  IS_PRODUCTION,
  IS_DEVELOPMENT,
  DEFAULT_SERVER_URL,
  SERVER_ORIGIN,
  API_BASE_URL,
  WS_BASE_URL,
  MEDIA_BASE_URL,
  getApiUrl,
  getWsUrl,
  getMediaUrl,
  getFrontendBaseUrl,
  isCentralizedDeployment,
};

export {
  DEFAULT_SERVER_URL,
  SERVER_ORIGIN,
  API_BASE_URL,
  WS_BASE_URL,
  MEDIA_BASE_URL,
  getApiUrl,
  getWsUrl,
  getMediaUrl,
};

export default appConfig;
