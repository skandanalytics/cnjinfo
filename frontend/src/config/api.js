/**
 * Foodie — Centralized Shared API Client and Configuration
 *
 * Configured Backend URL: http://192.168.1.15:8000/
 * API Base URL:           http://192.168.1.15:8000/api
 *
 * All service modules and components import this shared API client.
 */
import api, {
  clearApiCache,
  normalizeApiResponse,
  PRIMARY_API_URL,
  BACKUP_API_URL,
} from '../services/api';

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

export const BASE_URL = DEFAULT_SERVER_URL.endsWith('/')
  ? DEFAULT_SERVER_URL
  : `${DEFAULT_SERVER_URL}/`;

export {
  api,
  API_BASE_URL,
  DEFAULT_SERVER_URL,
  SERVER_ORIGIN,
  WS_BASE_URL,
  MEDIA_BASE_URL,
  getApiUrl,
  getWsUrl,
  getMediaUrl,
  clearApiCache,
  normalizeApiResponse,
  PRIMARY_API_URL,
  BACKUP_API_URL,
};

export default api;
