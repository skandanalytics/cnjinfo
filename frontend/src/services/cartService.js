import api from './api';
import { extractApiErrorMessage } from '../utils/errorUtils';

const _isValidId = (id) => {
  if (id === undefined || id === null) return false;
  const s = String(id).trim();
  return s !== '' && s !== 'undefined' && s !== 'null' && s !== 'NaN';
};

const _isValidNumericId = (id) => {
  if (id === undefined || id === null) return false;
  const n = Number(id);
  return !Number.isNaN(n) && Number.isFinite(n) && n > 0;
};

const getGuestSessionId = () => {
  let sessId = sessionStorage.getItem('foodie_cart_session_id') || localStorage.getItem('foodie_cart_session_id');
  if (!sessId) {
    sessId = `sess_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    sessionStorage.setItem('foodie_cart_session_id', sessId);
    localStorage.setItem('foodie_cart_session_id', sessId);
  }
  return sessId;
};

const resolveBackendUserPk = async (userId) => {
  if (!userId) return null;
  const numId = Number(userId);
  if (!isNaN(numId) && numId > 0) {
    return numId;
  }

  try {
    const rawPhone = String(userId).replace(/\D/g, '');
    if (rawPhone.length >= 10) {
      const last10 = rawPhone.slice(-10);
      const usersRes = await api.get('/users/users/').catch(() => ({ data: [] }));
      const rawUsers = usersRes.data?.data || (Array.isArray(usersRes.data) ? usersRes.data : (usersRes.data?.results || []));
      const users = Array.isArray(rawUsers) ? rawUsers : [];
      const match = users.find(u => {
        const uPhone = String(u.phone || '').replace(/\D/g, '');
        return uPhone.includes(last10);
      });
      if (match && match.id) return Number(match.id);
    }
  } catch (e) { }

  return null;
};

const resolveBackendTablePk = async (tableInput) => {
  if (!tableInput || tableInput === 'Takeaway' || String(tableInput).toLowerCase() === 'takeaway') return null;
  const numId = Number(tableInput);
  if (!isNaN(numId) && numId > 0 && numId < 1000) {
    try {
      const tablesRes = await api.get('/restaurant/tables/').catch(() => ({ data: [] }));
      const rawTables = tablesRes.data?.data || (Array.isArray(tablesRes.data) ? tablesRes.data : (tablesRes.data?.results || []));
      const tables = Array.isArray(rawTables) ? rawTables : [];
      const pkMatch = tables.find(t => Number(t.id) === numId);
      if (pkMatch) return numId;
      const numMatch = tables.find(t => String(t.table_number || t.number || '').replace(/\D/g, '') === String(numId));
      if (numMatch) return Number(numMatch.id);
    } catch (e) { }
  }

  const cleanStr = String(tableInput).toUpperCase().trim();
  const cleanDigits = cleanStr.replace(/\D/g, '');
  try {
    const tablesRes = await api.get('/restaurant/tables/').catch(() => ({ data: [] }));
    const rawTables = tablesRes.data?.data || (Array.isArray(tablesRes.data) ? tablesRes.data : (tablesRes.data?.results || []));
    const tables = Array.isArray(rawTables) ? rawTables : [];
    const match = tables.find(t => {
      const tNum = String(t.table_number || t.number || '').toUpperCase().trim();
      return tNum === cleanStr || (cleanDigits && tNum.replace(/\D/g, '') === cleanDigits);
    });
    if (match) return Number(match.id);
  } catch (e) { }

  return null;
};

let _inFlightCartPromise = null;

function customerBranchId() {
  return sessionStorage.getItem('foodie_public_branch');
}

export function isStaffOrdering() {
  try {
    return sessionStorage.getItem('foodie_staff_ordering') === '1';
  } catch {
    return false;
  }
}

export function hasGuestToken() {
  try {
    return Boolean(sessionStorage.getItem('foodie_guest_token'));
  } catch {
    return false;
  }
}

export function usesServerCart(user) {
  return Boolean((user && user.role === 'customer') || isStaffOrdering() || hasGuestToken());
}

export async function ensureGuestToken() {
  const existing = sessionStorage.getItem('foodie_guest_token');
  if (existing) return existing;
  const issued = await api.post('/cart/guest-token/');
  const token = issued.data?.guest_token;
  if (!token) throw new Error('Could not start a guest cart session.');
  sessionStorage.setItem('foodie_guest_token', token);
  return token;
}

async function fetchCartView() {
  const branch = customerBranchId();
  if (!branch) return null;
  const res = await api.get(`/cart/?branch=${branch}`);
  return res.data;
}

export const cartService = {
  mergeGuestCart: async (guestToken) => {
    if (!guestToken) return [];
    try {
      const res = await api.post('/cart/merge/', { guest_token: guestToken });
      return res.data?.merged_branches || [];
    } catch (e) {
      console.warn('[CART SERVICE] mergeGuestCart error:', e?.response?.data || e.message);
      return [];
    }
  },

  getExistingCart: async (userId, tableInput = null) => {
    try {
      const view = await fetchCartView();
      if (!view?.id) return null;
      return { id: view.id, status: 'ACTIVE', branch: view.branch };
    } catch (e) {
      return null;
    }
  },

  getExistingCartLegacyRemoved: async () => null,

  getExistingCartLegacy: async (userId, tableInput = null) => {
    return null;
    let allCarts = [];
    try {
      const cartsRes = await api.get('/orders/carts/');
      const rawCarts = cartsRes.data?.data || (Array.isArray(cartsRes.data) ? cartsRes.data : (cartsRes.data?.results || []));
      allCarts = Array.isArray(rawCarts) ? rawCarts : [];
    } catch (e) {
      console.warn("[CART SERVICE] Failed to fetch carts:", e);
      return null;
    }

    const validUserPk = await resolveBackendUserPk(userId);
    const guestSessId = !validUserPk ? getGuestSessionId() : null;

    // Filter active carts from backend and sort by ID descending to get the newest first
    const activeCarts = allCarts.filter(c => {
      const st = String(c.status || '').toUpperCase();
      return (!st || st === 'ACTIVE' || st === 'OPEN') && _isValidNumericId(c.id);
    }).sort((a, b) => Number(b.id) - Number(a.id));

    if (validUserPk) {
      const userCart = activeCarts.find(c => {
        const cUser = typeof c.user === 'object' ? (c.user?.id || c.user?.user_id) : c.user;
        return Number(cUser) === validUserPk;
      });
      if (userCart) return userCart;
    } else if (guestSessId) {
      const sessionCart = activeCarts.find(c => String(c.session_id || '') === guestSessId);
      if (sessionCart) return sessionCart;
    }

    return null;
  },

  getOrCreateCart: async (userId, tableInput = null, restaurantId = 1) => {
    if (_inFlightCartPromise) {
      return _inFlightCartPromise;
    }

    _inFlightCartPromise = (async () => {
      try {
        const existing = await cartService.getExistingCart(userId, tableInput);
        if (existing && _isValidNumericId(existing.id)) {
          return existing;
        }
        return { id: null, branch: customerBranchId() };

        const validUserPk = await resolveBackendUserPk(userId);
        const validTablePk = await resolveBackendTablePk(tableInput);
        const guestSessId = !validUserPk ? getGuestSessionId() : null;

        const payload = {
          restaurant: Number(restaurantId) || 1,
          status: 'ACTIVE'
        };
        if (validUserPk) {
          payload.user = validUserPk;
        } else if (guestSessId) {
          payload.session_id = guestSessId;
        }
        if (validTablePk) {
          payload.table = validTablePk;
        }

        const res = await api.post('/orders/carts/', payload);
        const candidate = res.data?.data || res.data;
        if (candidate && _isValidNumericId(candidate.id)) {
          return candidate;
        }
        throw new Error("Backend did not return a valid cart record.");
      } catch (err) {
        console.error("[CART SERVICE] POST /orders/carts/ failed:", err.response?.data || err.message);
        throw err;
      } finally {
        _inFlightCartPromise = null;
      }
    })();

    return _inFlightCartPromise;
  },

  getCartItems: async (cartId) => {
    try {
      const view = await fetchCartView();
      return (view?.items || []).map(item => ({
        id: item.item_id,
        item_id: item.item_id,
        food: item.food_id,
        food_id: item.food_id,
        food_item: item.food_id,
        name: item.name,
        image: item.image,
        quantity: item.quantity,
        special_instructions: item.special_instructions || '',
        options: Array.isArray(item.options) ? item.options : [],
        available_customizations: Array.isArray(item.available_customizations) ? item.available_customizations : [],
        unit_price: item.unit_price,
        final_unit_price: item.final_unit_price,
        line_total: item.line_total,
      }));
    } catch (e) {
      return [];
    }
  },

  getCartItemsLegacy: async (cartId) => {
    if (!_isValidNumericId(cartId)) return [];
    try {
      const itemsRes = await api.get('/orders/cart-items/');
      const rawItems = itemsRes.data?.data || (Array.isArray(itemsRes.data) ? itemsRes.data : (itemsRes.data?.results || []));
      const allItems = Array.isArray(rawItems) ? rawItems : [];
      return allItems
        .filter(item => Number(item.cart) === Number(cartId) || String(item.cart) === String(cartId))
        .map(item => ({
          ...item,
          food: item.food ?? item.food_item,
          food_item: item.food_item ?? item.food,
          instructions: item.special_instructions ?? item.instructions
        }));
    } catch (e) {
      return [];
    }
  },

  addItemToCart: async (cartId, foodId, quantity, price, extraOptions = {}) => {
    const branch = customerBranchId();
    if (!branch) throw new Error('Choose a restaurant before adding items.');
    if (!_isValidNumericId(foodId)) throw new Error('This dish is not available.');
    try {
      const res = await api.post('/cart/items/', {
        branch: Number(branch), food: Number(foodId), quantity: parseInt(quantity, 10) || 1,
        options: extraOptions.optionIds || [], special_instructions: extraOptions.instructions || '',
      });
      const line = [...(res.data?.items || [])].reverse().find((i) => Number(i.food_id) === Number(foodId));
      return { ...res.data, cart_item_id: line?.item_id };
    } catch (e) {
      console.error("[CART SERVICE] addItemToCart error:", e.response?.data || e.message);
      throw new Error(extractApiErrorMessage(e, 'This item could not be added to your cart.'));
    }
  },

  addItemToCartLegacy: async (cartId, foodId, quantity, price, extraOptions = {}) => {
    if (!_isValidNumericId(cartId) || !_isValidNumericId(foodId)) {
      return null;
    }
    try {
      const items = await cartService.getCartItems(cartId);
      const existingItem = items.find(item => Number(item.food || item.food_item) === Number(foodId));
      const qtyNum = parseInt(quantity, 10) || 1;
      const unitPriceVal = parseFloat(price || 0);

      if (existingItem && _isValidNumericId(existingItem.id)) {
        const newQty = (parseInt(existingItem.quantity, 10) || 0) + qtyNum;
        const itemUnitPrice = parseFloat(existingItem.unit_price || unitPriceVal);
        const newSubtotal = String((newQty * itemUnitPrice).toFixed(2));
        const res = await api.patch(`/orders/cart-items/${existingItem.id}/`, {
          quantity: newQty,
          subtotal: newSubtotal
        });
        return res.data?.data || res.data;
      } else {
        const uPriceStr = String(unitPriceVal.toFixed(2));
        const subtotalStr = String((qtyNum * unitPriceVal).toFixed(2));
        const payload = {
          cart: Number(cartId),
          food: Number(foodId),
          quantity: qtyNum,
          unit_price: uPriceStr,
          subtotal: subtotalStr,
          special_instructions: extraOptions.instructions || "",
          extra_ingredients: extraOptions.extraIngredients || [],
          extra_ingredient_amount: String(Number(extraOptions.extraIngredientAmount || 0).toFixed(2))
        };
        const res = await api.post('/orders/cart-items/', payload);
        return res.data?.data || res.data;
      }
    } catch (e) {
      console.error("[CART SERVICE] addItemToCart error:", e.response?.data || e.message);
      return null;
    }
  },

  updateItemQuantity: async (cartItemId, quantity, unitPrice) => {
    if (!_isValidNumericId(cartItemId)) return null;
    try {
      const qty = parseInt(quantity, 10) || 1;
      const patchData = { quantity: qty };
      if (unitPrice !== undefined && unitPrice !== null && !isNaN(Number(unitPrice))) {
        patchData.subtotal = String((qty * Number(unitPrice)).toFixed(2));
      }
      const res = await api.patch(`/cart/items/${cartItemId}/`, { quantity: qty });
      return res.data?.data || res.data;
    } catch (e) {
      return null;
    }
  },

  removeItemFromCart: async (cartItemId) => {
    if (!_isValidNumericId(cartItemId)) return false;
    try {
      await api.delete(`/cart/items/${cartItemId}/`);
      return true;
    } catch (e) {
      return false;
    }
  },

  clearCart: async () => {
    const branch = customerBranchId();
    if (!branch) return false;
    await api.delete(`/cart/?branch=${branch}`);
    return true;
  },

  restoreGuestCartAfterLogin: async (localItems = []) => {
    const items = Array.isArray(localItems) ? localItems : [];
    if (!items.length) {
      return fetchCartView().catch(() => null);
    }
    const existing = await cartService.getCartItems(null).catch(() => []);
    const keys = new Set((existing || []).map((row) => {
      const foodId = Number(row.food || row.food_id || row.food_item);
      const opts = Array.isArray(row.options) ? row.options.map((o) => String(o.id)).sort().join(',') : '';
      return `${foodId}:${opts}`;
    }));
    for (const item of items) {
      if (!item || item.id == null) continue;
      const optionIds = (item.extraIngredients || []).map((extra) => extra.id).filter(Boolean);
      const key = `${Number(item.id)}:${optionIds.map(String).sort().join(',')}`;
      if (keys.has(key)) continue;
      try {
        await cartService.addItemToCart(null, item.id, item.quantity, null, {
          instructions: item.instructions || '',
          optionIds,
        });
        keys.add(key);
      } catch (err) {
        console.error('[CART SERVICE] restoreGuestCartAfterLogin:', err?.message || err);
      }
    }
    return fetchCartView().catch(() => null);
  }
};

export default cartService;
