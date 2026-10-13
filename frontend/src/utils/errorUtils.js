export function formatRetryAfter(seconds) {
  const wait = Math.max(0, Math.ceil(Number(seconds) || 0));
  if (wait <= 0) return 'a short while';
  if (wait < 60) return `${wait} second${wait === 1 ? '' : 's'}`;
  const minutes = Math.ceil(wait / 60);
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'}`;
  const hours = Math.floor(minutes / 60);
  const rem = minutes % 60;
  if (rem === 0) return `${hours} hour${hours === 1 ? '' : 's'}`;
  return `${hours} hour${hours === 1 ? '' : 's'} ${rem} minute${rem === 1 ? '' : 's'}`;
}

export function getRetryAfterSeconds(err) {
  if (!err) return 0;
  if (typeof err === 'number') return err;
  const direct = err.retryAfter ?? err.retry_after;
  if (Number.isFinite(Number(direct)) && Number(direct) > 0) {
    return Math.ceil(Number(direct));
  }
  const status = err?.response?.status;
  if (status === 429) {
    const dataWait = err.response?.data?.retry_after;
    if (Number.isFinite(Number(dataWait)) && Number(dataWait) > 0) {
      return Math.ceil(Number(dataWait));
    }
    const header = err.response?.headers?.['retry-after'] ?? err.response?.headers?.['Retry-After'];
    if (Number.isFinite(Number(header)) && Number(header) > 0) {
      return Math.ceil(Number(header));
    }
    const detail = String(err.response?.data?.detail || err.message || '');
    const match = detail.match(/(\d+)\s*(?:second|sec)/i);
    if (match) return parseInt(match[1], 10);
  }
  return 0;
}

export function throttleErrorMessage(err, fallback = 'OTP requests are temporarily limited. Please wait and try again.') {
  const status = err?.response?.status;
  if (status !== 429 && !err?.isThrottled) return null;
  const wait = getRetryAfterSeconds(err);
  const detail = err.response?.data?.detail;
  if (typeof detail === 'string' && detail.trim() && !/expected available in \d+ seconds/i.test(detail)) {
    return detail;
  }
  if (Number.isFinite(wait) && wait > 0) {
    return `OTP requests are temporarily limited. Try again in ${formatRetryAfter(wait)}.`;
  }
  return fallback;
}

export const extractApiErrorMessage = (err, fallbackMsg = 'An error occurred. Please try again.') => {
  if (!err) return fallbackMsg;
  if (typeof err === 'string') return err;
  const throttled = throttleErrorMessage(err);
  if (throttled) return throttled;

  const data = err.response?.data;
  if (!data) return err.message || fallbackMsg;

  // Handle DRF errors object: e.g. { errors: { field: ["error"] } } or { field: ["error"] }
  const errorsObj = data.errors || data;
  if (typeof errorsObj === 'object' && errorsObj !== null) {
    if (Array.isArray(errorsObj.detail)) return errorsObj.detail.join(', ');
    if (typeof errorsObj.detail === 'string') return errorsObj.detail;
    if (Array.isArray(errorsObj.non_field_errors)) return errorsObj.non_field_errors.join(', ');

    const fieldErrors = [];
    for (const [field, val] of Object.entries(errorsObj)) {
      if (field === 'state' || field === 'status' || field === 'code') continue;
      if (Array.isArray(val)) {
        fieldErrors.push(`${field}: ${val.join(', ')}`);
      } else if (typeof val === 'string') {
        fieldErrors.push(`${field}: ${val}`);
      }
    }
    if (fieldErrors.length > 0) {
      return fieldErrors.join(' | ');
    }
  }

  if (data.state?.description && data.state?.description !== 'The submitted data is invalid.') {
    return data.state.description;
  }

  if (data.message) {
    return data.message;
  }

  return err.message || fallbackMsg;
};

export default extractApiErrorMessage;
