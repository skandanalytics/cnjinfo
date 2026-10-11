import api from './api';
import { extractApiErrorMessage } from '../utils/errorUtils';
import {
  DINE_IN, DINE_IN_NEEDS_QR, getOrderType, getScannedTableQr, getSelectedTableId, normalizeOrderType,
} from '../utils/orderContext';

const CHECKOUT_KEY = 'foodie_checkout_key';

const PAYMENT_METHODS = { COD: 'COUNTER', COUNTER: 'COUNTER', CARD: 'CARD', UPI: 'UPI' };

export function toApiPaymentMethod(method) {
  return PAYMENT_METHODS[String(method || '').toUpperCase()] || 'COUNTER';
}

export function checkoutErrorMessage(err, fallback = 'Could not place the order.') {
  const data = err?.response?.data;
  if (data && Array.isArray(data.issues) && data.issues.length) {
    return `${data.detail || 'Your cart needs attention.'} ${data.issues.map((i) => i.detail).join(' ')}`.trim();
  }
  return extractApiErrorMessage(err, fallback);
}

export function customerBranchId() {
  const branch = Number(sessionStorage.getItem('foodie_public_branch'));
  return Number.isFinite(branch) && branch > 0 ? branch : null;
}

// Puts the chosen order type (and, for Dine-In, the scanned table) on the server cart and returns the
// re-priced cart view. Throws with the server's reason when the context is not acceptable.
export async function applyOrderContext(orderType) {
  const type = normalizeOrderType(orderType) || getOrderType();
  if (!type) throw new Error('Choose Dine-In or Takeaway first.');
  const branch = customerBranchId();
  if (!branch) throw new Error('Choose a restaurant before checkout.');
  const body = { branch, order_type: type };
  if (type === DINE_IN) {
    const qr = getScannedTableQr();
    const tableId = getSelectedTableId();
    if (qr) body.qr = qr;
    else if (tableId) body.table = tableId;
    else throw new Error(DINE_IN_NEEDS_QR);
  }
  try {
    const res = await api.put('/cart/context/', body);
    return res.data;
  } catch (err) {
    throw new Error(checkoutErrorMessage(err, 'Could not update your order type.'));
  }
}

export async function validateCheckout() {
  const branch = customerBranchId();
  if (!branch) throw new Error('Choose a restaurant before checkout.');
  try {
    const res = await api.post('/checkout/validate/', { branch });
    return res.data;
  } catch (err) {
    const wrapped = new Error(checkoutErrorMessage(err, 'Your cart could not be checked.'));
    wrapped.cart = err?.response?.data?.cart || null;
    throw wrapped;
  }
}

// One idempotency key per server cart: a retried request for the same cart returns the same order, and a
// new cart never reuses the key of an order that was already placed.
function checkoutKeyFor(cartId) {
  try {
    const saved = JSON.parse(sessionStorage.getItem(CHECKOUT_KEY) || 'null');
    if (saved && saved.cartId === cartId && saved.key) return saved.key;
  } catch { /* replaced below */ }
  const key = (crypto.randomUUID && crypto.randomUUID()) || `ck-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  sessionStorage.setItem(CHECKOUT_KEY, JSON.stringify({ cartId, key }));
  return key;
}

export async function placeOrder(orderType, paymentMethod) {
  await applyOrderContext(orderType);
  const review = await validateCheckout();
  const branch = customerBranchId();
  const key = checkoutKeyFor(review.cart?.id ?? null);
  try {
    const res = await api.post('/orders/', {
      branch, idempotency_key: key, payment_method: toApiPaymentMethod(paymentMethod),
    });
    sessionStorage.removeItem(CHECKOUT_KEY);
    if (!res.data?.id) throw new Error('The server did not return an order id.');
    return res.data;
  } catch (err) {
    throw new Error(checkoutErrorMessage(err));
  }
}

export async function availableTables(branchId) {
  const res = await api.get(`/public/branches/${branchId}/tables/`);
  return Array.isArray(res.data) ? res.data : [];
}

export async function fetchCustomerOrder(orderId) {
  const res = await api.get(`/orders/${orderId}/`, { bypassCache: true });
  return res.data;
}

let razorpayScript = null;

function loadRazorpay() {
  if (window.Razorpay) return Promise.resolve();
  if (!razorpayScript) {
    razorpayScript = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://checkout.razorpay.com/v1/checkout.js';
      script.onload = () => resolve();
      script.onerror = () => {
        razorpayScript = null;
        reject(new Error('The payment window could not be loaded. Check your connection and try again.'));
      };
      document.body.appendChild(script);
    });
  }
  return razorpayScript;
}

// Starts a Razorpay payment for an existing order. The order is only marked paid by the server after it
// verifies the signature; the result here just tells the UI what happened.
// Resolves to { status: 'PAID' | 'FAILED' | 'CANCELLED', message? }.
export async function payOrderOnline(order, method, customer) {
  let start;
  try {
    start = (await api.post(`/orders/${order.id}/pay/`, { method: toApiPaymentMethod(method) })).data;
  } catch (err) {
    return { status: 'FAILED', message: checkoutErrorMessage(err, 'Online payment could not be started.') };
  }
  try {
    await loadRazorpay();
  } catch (err) {
    return { status: 'FAILED', message: err.message };
  }
  return new Promise((resolve) => {
    let lastFailure = null;
    let settled = false;
    const finish = (result) => {
      if (!settled) {
        settled = true;
        resolve(result);
      }
    };
    const checkout = new window.Razorpay({
      key: start.key_id,
      order_id: start.razorpay_order_id,
      amount: Math.round(Number(start.amount) * 100),
      currency: start.currency || 'INR',
      name: 'Foodie',
      description: `Order ${order.order_number || order.id}`,
      prefill: { name: customer?.name || '', contact: customer?.phone || '' },
      handler: async (resp) => {
        try {
          await api.post('/payments/verify/', {
            razorpay_order_id: resp.razorpay_order_id,
            razorpay_payment_id: resp.razorpay_payment_id,
            razorpay_signature: resp.razorpay_signature,
          });
          finish({ status: 'PAID' });
        } catch (err) {
          finish({ status: 'FAILED', message: checkoutErrorMessage(err, 'The payment could not be verified.') });
        }
      },
      modal: {
        ondismiss: () => finish(lastFailure
          ? { status: 'FAILED', message: lastFailure }
          : { status: 'CANCELLED', message: 'Payment was cancelled. Your order is saved; you can pay again.' }),
      },
    });
    checkout.on('payment.failed', (resp) => {
      lastFailure = resp?.error?.description || 'The payment failed.';
    });
    checkout.open();
  });
}

export async function downloadCustomerInvoice(order) {
  try {
    const res = await api.get(`/orders/${order.id}/invoice/`, { responseType: 'blob', bypassCache: true });
    const url = URL.createObjectURL(res.data);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${order.orderNumber || order.order_number || order.id}.pdf`;
    link.click();
    URL.revokeObjectURL(url);
  } catch (err) {
    if (err?.response?.status === 409) throw new Error('The invoice is not ready until the order is completed.');
    throw new Error('The invoice could not be downloaded.');
  }
}
