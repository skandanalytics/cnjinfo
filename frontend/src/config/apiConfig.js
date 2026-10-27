/**
 * Foodie — Centralized Dynamic API & WebSocket Configuration
 * 
 * Manages dynamic configuration for local and LAN environments.
 */

import {
  DEFAULT_API_BASE_URL,
  DEFAULT_PUBLIC_FRONTEND_URL,
  API_BASE_URL,
  PUBLIC_FRONTEND_URL,
  SERVER_ORIGIN,
  WS_BASE_URL,
  MEDIA_BASE_URL,
  APP_NAME,
  APP_ENVIRONMENT,
  APP_MODE,
  IS_CENTRALIZED,
  IS_LOCAL,
} from './environment';

import {
  getApiUrl,
  getWsUrl,
  getMediaUrl,
  getCustomerWelcomeUrl,
} from './urls';

export const DEFAULT_SERVER_URL = SERVER_ORIGIN;
export const API_MODE = APP_MODE;

export {
  DEFAULT_API_BASE_URL,
  DEFAULT_PUBLIC_FRONTEND_URL,
  API_BASE_URL,
  PUBLIC_FRONTEND_URL,
  SERVER_ORIGIN,
  WS_BASE_URL,
  MEDIA_BASE_URL,
  APP_NAME,
  APP_ENVIRONMENT,
  APP_MODE,
  IS_CENTRALIZED,
  IS_LOCAL,
  getApiUrl,
  getWsUrl,
  getMediaUrl,
  getCustomerWelcomeUrl,
};

export default API_BASE_URL;
