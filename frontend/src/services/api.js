import axios from 'axios';
import { API_BASE_URL, getApiUrl } from '../config/apiConfig';

/*
 * Foodie API Configuration
 * Primary and Backup Servers stored separately
 */
export const PRIMARY_API_URL = API_BASE_URL;

export const BACKUP_API_URL =
  import.meta.env.VITE_BACKUP_API_URL ||
  '';

const api = axios.create({
  baseURL: PRIMARY_API_URL.replace(/\/+$/, ''),
  headers: {
    'Content-Type': 'application/json',
    Accept: 'application/json',
  },
  timeout: 10000,
});

/*
 * Request Interceptor
 *
 * Adds the correct token depending on whether
 * the current user is an admin or customer.
 */
api.interceptors.request.use(
  (config) => {
    // Normalize URL to prevent duplicate /api prefixes or duplicate slashes
    if (config.url && !/^https?:\/\//i.test(config.url)) {
      let cleanUrl = config.url.replace(/^\/+/, '/');
      const baseEndsWithApi = config.baseURL && /\/api\/?$/i.test(config.baseURL);
      if (baseEndsWithApi) {
        if (cleanUrl.startsWith('/api/')) {
          cleanUrl = cleanUrl.slice(4);
        } else if (cleanUrl === '/api') {
          cleanUrl = '';
        }
      }
      config.url = cleanUrl;
    }

    const currentPath = window.location.pathname;

    const staffOrdering = sessionStorage.getItem('foodie_staff_ordering') === '1';
    const isAdminRoute =
      currentPath.startsWith('/admin') || currentPath.startsWith('/employee') || currentPath.startsWith('/db') || staffOrdering;

    const adminToken =
      sessionStorage.getItem('foodie_staff_access') ||
      sessionStorage.getItem('foodie_token_admin') ||
      localStorage.getItem('foodie_staff_access') ||
      localStorage.getItem('foodie_token_admin');
    const customerToken =
      sessionStorage.getItem('foodie_token_customer') ||
      localStorage.getItem('foodie_token_customer');

    // Staff who are placing an order keep their staff login on the shared customer pages.
    const token = isAdminRoute
      ? adminToken
      : customerToken;

    if (token && token !== 'dummy-token') {
      config.headers.Authorization = `Bearer ${token}`;
    } else {
      const guestToken = sessionStorage.getItem('foodie_guest_token') || localStorage.getItem('foodie_guest_token');
      if (guestToken) config.headers['X-Guest-Token'] = guestToken;
    }

    if (config.data instanceof FormData) {
      delete config.headers['Content-Type'];
    }

    /*
     * Useful for debugging API requests.
     */
    console.log(
      `[API REQUEST] ${config.method?.toUpperCase()} ${config.baseURL}${config.url}`
    );


    return config;
  },

  (error) => {
    console.error('[API REQUEST ERROR]', error);
    return Promise.reject(error);
  }
);

/*
 * Response Interceptor
 *
 * Handles successful responses, unwraps standard response envelopes,
 * and manages authentication/network errors.
 */
api.interceptors.response.use(
  (response) => {
    console.log(
      `[API RESPONSE] ${response.status} ${response.config.url}`
    );


    // If backend returns enveloped structure { state, data, ... }, attach normalized payload
    if (response.data && typeof response.data === 'object' && 'state' in response.data && 'data' in response.data) {
      response.apiEnvelope = response.data;
    }

    // Invalidate GET cache on data mutations
    const method = response.config?.method?.toUpperCase();
    if (method && method !== 'GET') {
      clearApiCache();
    }

    return response;
  },

  (error) => {
    /*
     * Server returned a response.
     */
    if (error.response) {
      console.error(
        `[API ERROR] ${error.response.status} ${error.config?.url}`
      );


      console.error(
        '[API ERROR DATA]',
        error.response.data
      );

      /*
       * Unauthorized (401)
       */
      if (error.response.status === 401) {
        const currentPath = window.location.pathname;
        const isAdminRoute = currentPath.startsWith('/admin') || currentPath.startsWith('/employee') || currentPath === '/login';
        if ((currentPath.startsWith('/admin') || currentPath.startsWith('/employee')) && !error.config?._retried) {
          return import('./staffClient').then(async ({ refreshStaffSession, clearStaffSession }) => {
            try {
              const access = await refreshStaffSession();
              error.config._retried = true;
              error.config.headers.Authorization = `Bearer ${access}`;
              return api(error.config);
            } catch {
              clearStaffSession();
              if (currentPath !== '/login') window.location.href = '/login';
              return Promise.reject(error);
            }
          });
        }

        if (isAdminRoute) {
          const hasAdminToken = sessionStorage.getItem('foodie_token_admin') || localStorage.getItem('foodie_token_admin');
          if (!hasAdminToken) {
            sessionStorage.removeItem('foodie_token_admin');
            sessionStorage.removeItem('foodie_auth_admin');
            localStorage.removeItem('foodie_token_admin');
            localStorage.removeItem('foodie_auth_admin');
            if (currentPath !== '/login') {
              window.location.href = '/login';
            }
          }
        } else {
          const sentCustomerAuth = Boolean(error.config?.headers?.Authorization);
          const isCustomerOpenRoute = currentPath === '/customer/cart' || currentPath === '/customer/home' || currentPath.startsWith('/customer/food/');
          if (sentCustomerAuth && !error.config?._retried) {
            const refresh = sessionStorage.getItem('foodie_customer_refresh') || localStorage.getItem('foodie_customer_refresh');
            if (refresh) {
              return import('axios').then(async ({ default: axios }) => {
                try {
                  const res = await axios.post(getApiUrl('/auth/refresh/'), { refresh });
                  const access = res.data.access;
                  sessionStorage.setItem('foodie_token_customer', access);
                  localStorage.setItem('foodie_token_customer', access);
                  if (res.data.refresh) {
                    sessionStorage.setItem('foodie_customer_refresh', res.data.refresh);
                    localStorage.setItem('foodie_customer_refresh', res.data.refresh);
                  }
                  error.config._retried = true;
                  error.config.headers.Authorization = `Bearer ${access}`;
                  return api(error.config);
                } catch {
                  sessionStorage.removeItem('foodie_token_customer');
                  sessionStorage.removeItem('foodie_auth_customer');
                  sessionStorage.removeItem('foodie_customer_refresh');
                  localStorage.removeItem('foodie_token_customer');
                  localStorage.removeItem('foodie_auth_customer');
                  localStorage.removeItem('foodie_customer_refresh');
                  if (!isCustomerOpenRoute && currentPath !== '/customer/welcome' && currentPath !== '/') {
                    window.location.href = '/customer/welcome';
                  }
                  return Promise.reject(error);
                }
              });
            }
          }
          if (sentCustomerAuth && error.config?._retried !== true) {
            sessionStorage.removeItem('foodie_token_customer');
            sessionStorage.removeItem('foodie_auth_customer');
            sessionStorage.removeItem('foodie_customer_refresh');
            localStorage.removeItem('foodie_token_customer');
            localStorage.removeItem('foodie_auth_customer');
            localStorage.removeItem('foodie_customer_refresh');
            if (!isCustomerOpenRoute && currentPath !== '/customer/welcome' && currentPath !== '/') {
              window.location.href = '/customer/welcome';
            }
          }
        }
      }

      return Promise.reject(error);
    }

    /*
     * Request was created but no response was received.
     */
    if (error.request) {
      console.error(
        '[API NETWORK ERROR]',
        error.message
      );


      const networkError = new Error(
        `Unable to connect to the backend server. Please check that the backend is running at ${PRIMARY_API_URL}`
      );

      networkError.isNetworkError = true;
      networkError.originalError = error;

      return Promise.reject(networkError);
    }

    console.error(
      '[API CONFIG ERROR]',
      error.message
    );

    return Promise.reject(error);
  }
);

/*
 * In-Flight Request Deduplication & Memory Caching for GET Requests
 */
const originalGet = api.get.bind(api);
const pendingGetRequests = new Map();
const cacheGetStore = new Map();
const DEFAULT_CACHE_TTL = 4000; // 4 seconds TTL for GET requests

export const clearApiCache = () => {
  cacheGetStore.clear();
};

api.get = function (url, config = {}) {
  const currentPath = typeof window !== 'undefined' ? window.location.pathname : '';
  const staffOrdering = typeof sessionStorage !== 'undefined' && sessionStorage.getItem('foodie_staff_ordering') === '1';
  const isAdminRoute = currentPath.startsWith('/admin') || currentPath.startsWith('/employee') || currentPath.startsWith('/db') || staffOrdering;
  const adminToken = typeof sessionStorage !== 'undefined'
    ? (sessionStorage.getItem('foodie_staff_access') || sessionStorage.getItem('foodie_token_admin') || localStorage.getItem('foodie_staff_access') || localStorage.getItem('foodie_token_admin') || '')
    : '';
  const customerToken = typeof sessionStorage !== 'undefined'
    ? (sessionStorage.getItem('foodie_token_customer') || localStorage.getItem('foodie_token_customer') || '')
    : '';
  const token = isAdminRoute ? adminToken : customerToken;

  const key = `${url}?${JSON.stringify(config.params || {})}&auth=${token}`;
  const now = Date.now();

  // 1. In-flight Request Deduplication: Return existing promise if identical GET request is currently running
  if (pendingGetRequests.has(key)) {
    return pendingGetRequests.get(key);
  }

  // 2. Return cached response if valid and bypassCache is false
  if (!config.bypassCache && cacheGetStore.has(key)) {
    const { timestamp, response, ttl } = cacheGetStore.get(key);
    const validTtl = ttl || DEFAULT_CACHE_TTL;
    if (now - timestamp < validTtl) {
      return Promise.resolve(response);
    }
    cacheGetStore.delete(key);
  }

  // 3. Dispatch original GET request and track in-flight promise
  const requestPromise = originalGet(url, config)
    .then((response) => {
      pendingGetRequests.delete(key);
      cacheGetStore.set(key, { timestamp: Date.now(), response });
      return response;
    })
    .catch(async (error) => {
      // If primary is unavailable (network error, timeout, 502/503/504) and backup is configured, fail over safely for GET
      const status = error.response?.status;
      const isServerUnavailable = !error.response || [502, 503, 504].includes(status) || error.code === 'ECONNABORTED' || error.isNetworkError;
      if (isServerUnavailable && BACKUP_API_URL && BACKUP_API_URL !== PRIMARY_API_URL) {
        try {
          const backupUrl = `${BACKUP_API_URL.replace(/\/+$/, '')}${url.startsWith('/') ? url : '/' + url}`;
          const backupResponse = await axios.get(backupUrl, { ...config, timeout: 8000 });
          pendingGetRequests.delete(key);
          cacheGetStore.set(key, { timestamp: Date.now(), response: backupResponse });
          return backupResponse;
        } catch (backupError) {
          // Backup also failed
        }
      }

      pendingGetRequests.delete(key);
      cacheGetStore.delete(key);
      throw error;
    });

  pendingGetRequests.set(key, requestPromise);
  return requestPromise;
};

export const normalizeApiResponse = (res) => {
  if (!res) return null;
  if (res.data && typeof res.data === 'object') {
    if ('data' in res.data) {
      return res.data.data;
    }
    if ('results' in res.data) {
      return res.data.results;
    }
  }
  return res.data;
};

export { api };
export { API_BASE_URL } from '../config/apiConfig';
export default api;
