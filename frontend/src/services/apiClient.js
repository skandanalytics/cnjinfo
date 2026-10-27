/**
 * Foodie — Authoritative API Client
 * 
 * Re-exports the unified Axios instance and caching helpers from api.js.
 */
import api, {
  clearApiCache,
  normalizeApiResponse,
  PRIMARY_API_URL,
  BACKUP_API_URL,
  API_BASE_URL,
} from './api';

export {
  api,
  clearApiCache,
  normalizeApiResponse,
  PRIMARY_API_URL,
  BACKUP_API_URL,
  API_BASE_URL,
};

export default api;
