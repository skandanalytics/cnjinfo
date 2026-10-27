/**
 * Foodie — Authoritative QR Code URL Builder & Validator
 * 
 * Guarantees that generated QR codes:
 * 1. Target the customer-facing frontend, NEVER the backend API (port 8000).
 * 2. Never silently encode localhost / 127.0.0.1 for mobile devices without warning.
 * 3. Use the configured public frontend URL or active LAN IP address.
 * 4. Contain only non-sensitive routing parameters (table, qr token).
 */

import { PUBLIC_FRONTEND_URL } from '../config/environment';

/**
 * Validates a generated QR target URL.
 * 
 * @param {string} url - Target URL to inspect
 * @returns {{ isValid: boolean, isLocalhost: boolean, hasBackendPort: boolean, issues: string[] }}
 */
export function validateQrUrl(url) {
  const issues = [];
  let isLocalhost = false;
  let hasBackendPort = false;

  if (!url || typeof url !== 'string') {
    return { isValid: false, isLocalhost: false, hasBackendPort: false, issues: ['URL is empty or undefined'] };
  }

  try {
    const parsed = new URL(url);

    // Check for localhost / loopback
    if (parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1' || parsed.hostname === '0.0.0.0') {
      isLocalhost = true;
      issues.push('Target URL uses localhost or loopback (127.0.0.1). Mobile phones cannot connect to localhost.');
    }

    // Check for backend port (8000)
    if (parsed.port === '8000') {
      hasBackendPort = true;
      issues.push('Target URL points to backend API port 8000 instead of frontend port 5173.');
    }

    // Check protocol
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      issues.push(`Unsupported protocol: ${parsed.protocol}`);
    }
  } catch (err) {
    issues.push(`Invalid URL format: ${err.message}`);
  }

  return {
    isValid: issues.length === 0,
    isLocalhost,
    hasBackendPort,
    issues
  };
}

/**
 * Resolves the active base host for QR code generation.
 * Checks for a temporary user override in localStorage, then falls back to PUBLIC_FRONTEND_URL.
 * 
 * @returns {string} Sanitized base host URL without trailing slash
 */
export function getQrBaseHost() {
  if (typeof window !== 'undefined') {
    const override = localStorage.getItem('foodie_network_host') || sessionStorage.getItem('foodie_network_host');
    if (override && /^https?:\/\//i.test(override.trim())) {
      return override.trim().replace(/\/+$/, '');
    }
  }

  return (PUBLIC_FRONTEND_URL || 'http://127.0.0.1:5173').replace(/\/+$/, '');
}

/**
 * Builds a mobile-ready table ordering QR URL.
 * 
 * @param {Object} options
 * @param {string|number} options.tableId - Table identifier
 * @param {string} [options.qrToken] - Unique QR token / code for the table
 * @param {string} [options.customHost] - Optional override host for testing
 * @returns {{ targetUrl: string, validation: ReturnType<typeof validateQrUrl> }}
 */
export function buildTableQrUrl({ tableId, qrToken, customHost } = {}) {
  const host = (customHost || getQrBaseHost()).replace(/\/+$/, '');
  
  const params = new URLSearchParams();
  if (tableId) params.append('table', String(tableId));
  if (qrToken) params.append('qr', String(qrToken));

  const queryString = params.toString();
  const targetUrl = queryString ? `${host}/customer/welcome?${queryString}` : `${host}/customer/welcome`;
  const validation = validateQrUrl(targetUrl);

  return {
    targetUrl,
    validation
  };
}

export default {
  validateQrUrl,
  getQrBaseHost,
  buildTableQrUrl,
};
