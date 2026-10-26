import React, { createContext, useState, useEffect, useContext, useRef } from 'react';
import { orderService } from '../services/orderService';
import { getProductSellingPrice, calculateBillDetails, calculateCouponDiscount, GST_RATE, DEFAULT_PACKING_CHARGE } from '../utils/pricing';
import { couponService, isFirstTimeCustomer } from '../services/couponService';
import { cartService, ensureGuestToken, hasGuestToken, isStaffOrdering, usesServerCart } from '../services/cartService';
import { productService } from '../services/productService';
import { dishStockLimit, isDishOutOfStock } from '../utils/filters';
import { AuthContext } from './AuthContext';
import OutOfStockModal from '../components/common/OutOfStockModal';
import api from '../services/api';
import { placeOrder as placeCustomerOrder } from '../services/customerCheckout';
import { getOrderType, setOrderType, setSelectedTableId } from '../utils/orderContext';

const parseInstructions = (text) => {
  if (!text) {
    return { instructions: "", extraIngredients: [] };
  }

  const parts = text.split(' | ');
  let instructions = "";
  let extraIngredients = [];

  for (const part of parts) {
    if (part.startsWith('Add-ons: ')) {
      const ingPart = part.substring(9);
      const ingItems = ingPart.split(', ');
      for (const item of ingItems) {
        const match = item.match(/(.+?)\s*\(\+₹(\d+)\)/);
        if (match) {
          extraIngredients.push({
            name: match[1].trim(),
            price: parseInt(match[2])
          });
        }
      }
    } else {
      instructions = part;
    }
  }

  return { instructions, extraIngredients };
};

function normalizeAddons(list) {
  if (!Array.isArray(list)) return [];
  return list.map((option) => {
    if (!option || typeof option !== 'object') return null;
    const id = option.id;
    const name = option.name;
    if (id == null || !name) return null;
    const price = Number(option.extra_price ?? option.price ?? 0);
    return { id, name, price, extra_price: Number.isFinite(price) ? price : 0 };
  }).filter(Boolean);
}

function optionKey(extras) {
  return normalizeAddons(extras).map((extra) => String(extra.id)).sort().join(',');
}

function findLine(items, key) {
  const text = String(key);
  const direct = items.find((row) => String(row.lineId) === text || String(row.cartItemId) === text);
  if (direct) return direct;
  const byFood = items.filter((row) => Number(row.id) === Number(key));
  return byFood.length === 1 ? byFood[0] : null;
}

function isAuthFailure(err) {
  const status = err?.response?.status || err?.status;
  return status === 401 || status === 403;
}

function isStockFailure(err) {
  if (isAuthFailure(err)) return false;
  const msg = String(err?.response?.data?.detail || err?.message || '').toLowerCase();
  if (/cannot read propert/i.test(msg)) return false;
  const code = String(err?.response?.data?.code || '');
  if (['item_invalid', 'out_of_stock', 'insufficient_stock', 'sold_out', 'quantity_limit'].includes(code)) return true;
  return /out of stock|insufficient stock|sold out|no longer available/.test(msg);
}

function cartOwnerId(user) {
  return user?.id || user?.phone || null;
}

function lineIdentity(row) {
  const foodId = Number(row?.food || row?.food_id || row?.food_item || row?.id);
  return `${foodId}:${optionKey(row?.options || row?.extraIngredients)}`;
}

function mergeServerItems(serverItems, previous) {
  return (serverItems || []).map((line) => {
    const foodId = line.food_id ?? line.food;
    const selected = Array.isArray(line.options) ? normalizeAddons(line.options) : null;
    const hasCatalog = line.available_customizations !== undefined;
    const catalog = hasCatalog ? normalizeAddons(line.available_customizations) : null;
    const notes = line.special_instructions ?? '';
    const prev = (previous || []).find((row) => String(row.cartItemId) === String(line.item_id || line.id))
      || (previous || []).find((row) => (
        Number(row.id) === Number(foodId)
        && optionKey(row.extraIngredients) === optionKey(selected || [])
        && String(row.instructions || '') === String(notes)
      ));
    return {
      ...(prev || {}),
      id: foodId,
      name: prev?.name || line.name,
      image: prev?.image || line.image,
      quantity: line.quantity,
      cartItemId: line.item_id || line.id,
      lineId: String(line.item_id || line.id),
      instructions: notes,
      extraIngredients: selected != null ? selected : (prev?.extraIngredients || []),
      customizations: catalog != null ? catalog : (Array.isArray(prev?.customizations) ? prev.customizations : []),
      finalUnitPrice: line.final_unit_price != null ? Number(line.final_unit_price) : prev?.finalUnitPrice,
      lineTotal: line.line_total != null ? Number(line.line_total) : prev?.lineTotal,
    };
  });
}

export const CartContext = createContext();

export const CartProvider = ({ children }) => {
  const [cartItems, setCartItems] = useState([]);
  const [tableContext, setTableContext] = useState(null); // { tableNumber, tableId }
  const [coupon, setCoupon] = useState(null); // { code, discount }
  const [orderLogs, setOrderLogs] = useState([]);
  const [outOfStockModalData, setOutOfStockModalData] = useState(null);
  const { user } = useContext(AuthContext);
  const deletingIdsRef = useRef(new Set());
  const prevUserIdRef = useRef(user?.id);
  const fetchIdRef = useRef(0);

  const getCartStorageKey = (currentUser, ctx = tableContext) => {
    if (!currentUser) return 'foodie_guest_cart';
    const id = currentUser.id
      ? String(currentUser.id)
      : (currentUser.phone ? String(currentUser.phone).replace(/\D/g, '').slice(-10) : (currentUser.email || 'customer'));
    const baseKey = `foodie_cart_user_${id}`;
    
    if (currentUser.role === 'admin' || currentUser.role === 'employee') {
      const tId = ctx?.tableId || ctx?.tableNumber || 'default';
      return `${baseKey}_table_${tId}`;
    }
    
    return baseKey;
  };

  const saveCartToStorage = (items, targetUser = user) => {
    const key = getCartStorageKey(targetUser);
    sessionStorage.setItem(key, JSON.stringify(items));
    if (!targetUser) {
      sessionStorage.setItem('foodie_guest_cart_temp', JSON.stringify(items));
      sessionStorage.setItem('foodie_guest_cart', JSON.stringify(items));
    } else {
      // Ensure guest keys don't linger for an authenticated user
      sessionStorage.removeItem('foodie_guest_cart');
      sessionStorage.removeItem('foodie_guest_cart_temp');
      sessionStorage.removeItem('foodie_guest_cart_unmerged');
      localStorage.removeItem('foodie_guest_cart');
      localStorage.removeItem('foodie_guest_cart_temp');
      localStorage.removeItem('foodie_guest_cart_unmerged');
    }
    // Scrub legacy shared cart keys
    try {
      sessionStorage.removeItem('foodie_cart');
      localStorage.removeItem('foodie_cart');
    } catch (e) {}
  };

  useEffect(() => {
    const key = getCartStorageKey(user);
    let savedCart = sessionStorage.getItem(key);
    if (!savedCart && !user) {
      savedCart = sessionStorage.getItem('foodie_guest_cart_temp') || sessionStorage.getItem('foodie_guest_cart');
    }
    const savedTable = sessionStorage.getItem('foodie_table') || localStorage.getItem('foodie_table');
    if (savedCart) {
      try {
        setCartItems(JSON.parse(savedCart));
      } catch (e) {
        setCartItems([]);
      }
    } else {
      setCartItems([]);
    }

    if (savedTable) {
      try {
        const parsed = JSON.parse(savedTable);
        setTableContext(parsed);
        const tNum = String(parsed?.tableNumber || parsed?.number || '').toLowerCase();
        if (tNum === 'takeaway' || parsed?.isTakeaway) {
          setOrderType('TAKEAWAY');
          setSelectedTableId(null);
        } else {
          setOrderType('DINE_IN');
          const tid = parsed?.tableId || parsed?.id;
          if (tid) setSelectedTableId(tid);
        }
      } catch (e) { }
    }

    const handleLogout = () => {
      setCartItems([]);
      setCoupon(null);
      sessionStorage.removeItem('foodie_cart');
      sessionStorage.removeItem('foodie_guest_token');
      sessionStorage.removeItem('foodie_guest_cart');
      localStorage.removeItem('foodie_guest_cart');
      sessionStorage.removeItem('foodie_guest_cart_temp');
      localStorage.removeItem('foodie_guest_cart_temp');
      sessionStorage.removeItem('foodie_guest_cart_unmerged');
      localStorage.removeItem('foodie_guest_cart_unmerged');
      localStorage.removeItem('foodie_cart');
      if (user) {
        sessionStorage.removeItem(getCartStorageKey(user));
      }
    };
    window.addEventListener('foodie_logout', handleLogout);
    return () => {
      window.removeEventListener('foodie_logout', handleLogout);
    };
  }, []);

  // Synchronize cart items with backend database when user logs in / changes
  useEffect(() => {
    const currentFetchId = ++fetchIdRef.current;
    const currentIdentity = user ? String(user.id || user.phone || 'customer') : 'guest';
    const isIdentityChange = prevUserIdRef.current !== undefined && prevUserIdRef.current !== currentIdentity;
    prevUserIdRef.current = currentIdentity;

    // Immediately clear in-memory cart on identity transition so previous user's cart is never displayed
    if (isIdentityChange) {
      setCartItems([]);
    }

    const loadBackendCart = async () => {
      const guestToken = sessionStorage.getItem('foodie_guest_token');
      const savedUnmergedStr = sessionStorage.getItem('foodie_guest_cart_unmerged') || sessionStorage.getItem('foodie_guest_cart_temp');
      let unmergedGuestItems = [];
      if (user && user.role === 'customer' && savedUnmergedStr) {
        try {
          unmergedGuestItems = JSON.parse(savedUnmergedStr);
        } catch (e) { }
      }

      // If customer just logged in and had an active guest token, merge it via server endpoint
      if (user && user.role === 'customer' && guestToken) {
        try {
          await cartService.mergeGuestCart(guestToken);
        } catch (e) {
          console.warn('[CART SYNC] Failed to merge server guest cart:', e);
        } finally {
          sessionStorage.removeItem('foodie_guest_token');
        }
      }

      // Skip backend cart sync immediately after order placement
      const skipFlag = sessionStorage.getItem('foodie_checkout_in_progress');
      if (skipFlag) {
        sessionStorage.removeItem('foodie_checkout_in_progress');
        return;
      }

      if (usesServerCart(user) || (!user && !isStaffOrdering())) {
        try {
          if (!user && !isStaffOrdering()) {
            try { await ensureGuestToken(); } catch (e) { /* local cart still works */ }
          }
          if (currentFetchId !== fetchIdRef.current) return;

          const ownerId = cartOwnerId(user);
          let activeCart = await cartService.getExistingCart(ownerId, tableContext?.tableId || null).catch(() => null);
          if (currentFetchId !== fetchIdRef.current) return;

          // If customer just logged in with unmerged guest items and has no active server cart yet, restore them
          if (user && user.role === 'customer' && Array.isArray(unmergedGuestItems) && unmergedGuestItems.length > 0) {
            try {
              await cartService.restoreGuestCartAfterLogin(unmergedGuestItems);
              activeCart = await cartService.getExistingCart(ownerId, tableContext?.tableId || null).catch(() => null);
            } catch (err) {
              console.warn('[CART SYNC] Failed to restore local guest items:', err);
            } finally {
              sessionStorage.removeItem('foodie_guest_cart_unmerged');
              sessionStorage.removeItem('foodie_guest_cart_temp');
              sessionStorage.removeItem('foodie_guest_cart');
              localStorage.removeItem('foodie_guest_cart_unmerged');
              localStorage.removeItem('foodie_guest_cart_temp');
              localStorage.removeItem('foodie_guest_cart');
            }
          }

          if (currentFetchId !== fetchIdRef.current) return;

          if (!activeCart) {
            const key = getCartStorageKey(user, tableContext);
            let savedCart = sessionStorage.getItem(key) || localStorage.getItem(key);
            if (!savedCart && !user) {
              savedCart = sessionStorage.getItem('foodie_guest_cart_temp')
                || sessionStorage.getItem('foodie_guest_cart')
                || localStorage.getItem('foodie_guest_cart')
                || localStorage.getItem('foodie_guest_cart_temp');
            }
            if (savedCart) {
              try {
                const parsed = JSON.parse(savedCart);
                if (Array.isArray(parsed) && parsed.length > 0) {
                  setCartItems(parsed);
                  return;
                }
              } catch (e) {}
            }
            setCartItems([]);
            saveCartToStorage([], user);
            return;
          }

          const backendItems = await cartService.getCartItems(activeCart.id);
          if (currentFetchId !== fetchIdRef.current) return;

          const allProducts = await productService.getProducts();
          if (currentFetchId !== fetchIdRef.current) return;

          const mappedItems = (backendItems || []).map(bi => {
            const prod = allProducts.find(p => Number(p.id) === Number(bi.food || bi.food_item || bi.food_id));
            const selected = Array.isArray(bi.options) ? normalizeAddons(bi.options) : [];
            const parsed = selected.length ? { instructions: bi.special_instructions || '', extraIngredients: selected } : parseInstructions(bi.special_instructions || '');
            const catalog = bi.available_customizations !== undefined
              ? normalizeAddons(bi.available_customizations)
              : normalizeAddons(prod?.customizations);
            if (!prod && !bi.name) return null;
            return {
              ...(prod || {}),
              id: bi.food_id || bi.food || bi.food_item,
              name: prod?.name || bi.name,
              image: prod?.image || bi.image,
              quantity: bi.quantity,
              cartItemId: bi.id || bi.item_id,
              lineId: String(bi.id || bi.item_id),
              instructions: selected.length ? (bi.special_instructions || '') : parsed.instructions,
              extraIngredients: selected.length ? selected : parsed.extraIngredients,
              customizations: catalog,
              finalUnitPrice: bi.final_unit_price != null ? Number(bi.final_unit_price) : undefined,
              lineTotal: bi.line_total != null ? Number(bi.line_total) : undefined,
            };
          }).filter(Boolean);

          if (currentFetchId !== fetchIdRef.current) return;

          if (mappedItems.length > 0) {
            setCartItems(mappedItems);
            saveCartToStorage(mappedItems, user);
          } else {
            const key = getCartStorageKey(user, tableContext);
            let savedCart = sessionStorage.getItem(key) || localStorage.getItem(key);
            if (!savedCart && !user) {
              savedCart = sessionStorage.getItem('foodie_guest_cart_temp')
                || sessionStorage.getItem('foodie_guest_cart')
                || localStorage.getItem('foodie_guest_cart')
                || localStorage.getItem('foodie_guest_cart_temp');
            }
            if (savedCart) {
              try {
                const parsed = JSON.parse(savedCart);
                if (Array.isArray(parsed) && parsed.length > 0) {
                  setCartItems(parsed);
                  return;
                }
              } catch (e) {}
            }
            setCartItems([]);
            saveCartToStorage([], user);
          }
        } catch (e) {
          console.error("Error loading cart from database:", e);
          if (currentFetchId === fetchIdRef.current) {
            // Load only this specific user's scoped cart if exists, never a generic or foreign cart
            const key = getCartStorageKey(user);
            const userSpecificSaved = sessionStorage.getItem(key);
            if (userSpecificSaved) {
              try { setCartItems(JSON.parse(userSpecificSaved)); } catch (err) { setCartItems([]); }
            } else {
              setCartItems([]);
            }
          }
        }
      } else {
        const key = getCartStorageKey(user, tableContext);
        let savedCart = sessionStorage.getItem(key);
        if (!savedCart && !user) {
          savedCart = sessionStorage.getItem('foodie_guest_cart_temp') || sessionStorage.getItem('foodie_guest_cart');
        }
        if (savedCart) {
          try {
            setCartItems(JSON.parse(savedCart));
          } catch (e) {
            setCartItems([]);
          }
        } else {
          setCartItems([]);
        }
      }
    };

    loadBackendCart();
  }, [user, tableContext?.tableId]);

  const setTable = (tableInfo) => {
    setTableContext(tableInfo);
    if (tableInfo) {
      sessionStorage.setItem('foodie_table', JSON.stringify(tableInfo));
      localStorage.setItem('foodie_table', JSON.stringify(tableInfo));
      const tNum = String(tableInfo.tableNumber || tableInfo.number || '').toLowerCase();
      if (tNum === 'takeaway' || tableInfo.isTakeaway) {
        setOrderType('TAKEAWAY');
        setSelectedTableId(null);
      } else {
        setOrderType('DINE_IN');
        const tid = tableInfo.tableId || tableInfo.id;
        if (tid) setSelectedTableId(tid);
      }
    } else {
      sessionStorage.removeItem('foodie_table');
      localStorage.removeItem('foodie_table');
      setSelectedTableId(null);
    }
  };

  const showOutOfStockModal = ({ item, message, stock, title }) => {
    setOutOfStockModalData({
      item: item || null,
      message,
      title: title || 'Out of Stock',
      stock: stock !== undefined ? stock : (item?.stock !== undefined ? item.stock : 0)
    });
  };

  const showCartNotice = ({ item, message, title }) => {
    setOutOfStockModalData({
      item: item || null,
      message,
      title: title || 'Cart error',
      stock: item?.stock
    });
  };

  const closeOutOfStockModal = () => {
    setOutOfStockModalData(null);
  };

  const rollbackLocalAdd = (localLineId, qtyToAdd) => {
    setCartItems((prev) => {
      const updated = prev
        .map((row) => (String(row.lineId) === String(localLineId) ? { ...row, quantity: row.quantity - qtyToAdd } : row))
        .filter((row) => row.quantity > 0);
      saveCartToStorage(updated);
      return updated;
    });
  };

  const addToCart = async (item, quantity = 1) => {
    if (!item) return false;
    const maxStock = dishStockLimit(item);
    if (isDishOutOfStock(item)) {
      showOutOfStockModal({
        item,
        stock: 0,
        message: `Sorry, "${item.name || 'this dish'}" is completely out of stock and cannot be added right now.`
      });
      return false;
    }

    const notes = item.instructions || '';
    const extras = normalizeAddons(item.extraIngredients);
    const wantedKey = optionKey(extras);
    const catalog = Array.isArray(item.customizations) ? normalizeAddons(item.customizations) : null;
    const sameFoodQty = cartItems
      .filter((row) => Number(row.id) === Number(item.id))
      .reduce((sum, row) => sum + Number(row.quantity || 0), 0);

    let qtyToAdd = quantity;
    if (sameFoodQty + qtyToAdd > maxStock) {
      if (sameFoodQty >= maxStock) {
        showOutOfStockModal({
          item,
          stock: maxStock,
          message: `You already have all ${maxStock} available "${item.name}" in your cart. Additional items are currently out of stock.`
        });
        return false;
      }
      qtyToAdd = maxStock - sameFoodQty;
      showOutOfStockModal({
        item,
        stock: maxStock,
        message: `Only ${qtyToAdd} more "${item.name}" available in stock. Added ${qtyToAdd} to your cart.`
      });
    }

    const localLineId = `local-${item.id}-${wantedKey}-${Date.now()}`;

    setCartItems((prev) => {
      const exist = prev.find((row) => (
        Number(row.id) === Number(item.id)
        && optionKey(row.extraIngredients) === wantedKey
        && (row.instructions || '') === notes
      ));
      const updated = exist
        ? prev.map((row) => (
          row === exist
            ? {
              ...row,
              quantity: row.quantity + qtyToAdd,
              customizations: catalog || (Array.isArray(row.customizations) ? row.customizations : []),
              extraIngredients: extras.length ? extras : (row.extraIngredients || []),
            }
            : row
        ))
        : [...prev, {
          ...item,
          quantity: qtyToAdd,
          customizations: catalog || [],
          instructions: notes,
          extraIngredients: extras,
          lineId: localLineId,
        }];
      saveCartToStorage(updated);
      return updated;
    });

    const guestSession = !user && !isStaffOrdering();
    try {
      if (guestSession && !hasGuestToken()) {
        await ensureGuestToken();
      }
    } catch (err) {
      console.error('Could not issue a guest cart token:', err);
    }

    if (usesServerCart(user) || guestSession) {
      try {
        const added = await cartService.addItemToCart(
          null,
          item.id,
          qtyToAdd,
          getProductSellingPrice(item),
          {
            instructions: notes,
            optionIds: extras.map((extra) => extra.id).filter(Boolean),
          }
        );
        if (Array.isArray(added?.items)) {
          setCartItems((prev) => {
            const updated = mergeServerItems(added.items, prev);
            saveCartToStorage(updated);
            return updated;
          });
        }
      } catch (err) {
        console.error("Error adding to database cart:", err);
        if (isStockFailure(err)) {
          rollbackLocalAdd(localLineId, qtyToAdd);
          showOutOfStockModal({
            item,
            message: err.message || `Sorry, "${item.name || 'this dish'}" is currently unavailable.`,
            stock: 0,
          });
          return false;
        }
        if (guestSession) {
          if (isAuthFailure(err)) {
            showCartNotice({
              item,
              title: 'Sign in at checkout',
              message: `"${item.name || 'This dish'}" was saved in your cart. Sign in when you proceed to checkout.`,
            });
          }
          return true;
        }
        rollbackLocalAdd(localLineId, qtyToAdd);
        showCartNotice({
          item,
          title: isAuthFailure(err) ? 'Sign in required' : 'Could not add to cart',
          message: isAuthFailure(err)
            ? 'Please sign in to add this dish to your cart.'
            : (err.message || 'This dish could not be added to your cart. Please try again.'),
        });
        return false;
      }
    }

    try {
      window.dispatchEvent(new CustomEvent('foodie_item_added', { detail: { message: `"${item.name}" added to cart` } }));
    } catch (e) { }
    return true;
  };

  const updateItemInstructionsAndExtras = async (id, instructions, extraIngredients = []) => {
    const selected = normalizeAddons(extraIngredients);
    const previous = cartItems;
    setCartItems((prev) => {
      const target = findLine(prev, id);
      if (!target) return prev;
      const updated = prev.map((row) => (
        row === target ? { ...row, instructions, extraIngredients: selected } : row
      ));
      saveCartToStorage(updated);
      return updated;
    });

    if (usesServerCart(user)) {
      try {
        const item = findLine(previous, id);
        let cartItemId = item?.cartItemId;
        if (!cartItemId && item) {
          const activeCart = await cartService.getOrCreateCart(cartOwnerId(user), tableContext?.tableId || null);
          const backendItems = await cartService.getCartItems(activeCart.id);
          const found = backendItems.find((bi) => (
            String(bi.id) === String(item.cartItemId)
            || (Number(bi.food || bi.food_item || bi.food_id) === Number(item.id) && optionKey(bi.options) === optionKey(item.extraIngredients))
          ));
          if (found) cartItemId = found.id || found.item_id;
        }

        if (!cartItemId) throw new Error('This cart item could not be updated.');
        const res = await api.patch(`/cart/items/${cartItemId}/`, {
          special_instructions: instructions || '',
          options: selected.map((extra) => extra.id).filter(Boolean),
        });
        const view = res.data?.data || res.data;
        if (Array.isArray(view?.items)) {
          setCartItems((prev) => {
            const updated = mergeServerItems(view.items, prev);
            saveCartToStorage(updated);
            return updated;
          });
        }
      } catch (e) {
        console.error("Error updating instructions on backend:", e);
        setCartItems(previous);
        saveCartToStorage(previous);
        window.alert(e?.response?.data?.detail || e.message || 'The add-ons could not be saved.');
      }
    }
  };

  const removeFromCart = async (id) => {
    const item = findLine(cartItems, id);
    if (!item) return false;
    const lockKey = String(item.lineId || item.cartItemId || item.id);
    if (deletingIdsRef.current.has(lockKey)) return false;
    deletingIdsRef.current.add(lockKey);

    try {
      let backendSuccess = true;

      if (usesServerCart(user)) {
        let cartItemId = item.cartItemId;
        if (!cartItemId || String(cartItemId).startsWith('local')) {
          try {
            const activeCart = await cartService.getOrCreateCart(cartOwnerId(user), tableContext?.tableId || null);
            if (activeCart && activeCart.id && !activeCart._localOnly) {
              const backendItems = await cartService.getCartItems(activeCart.id);
              const found = backendItems.find((bi) => (
                Number(bi.food || bi.food_id) === Number(item.id)
                && optionKey(bi.options) === optionKey(item.extraIngredients)
              ));
              if (found) {
                cartItemId = found.id || found.item_id;
              }
            }
          } catch (e) {
            console.error("Error finding backend cart item:", e);
          }
        }

        if (cartItemId && !String(cartItemId).startsWith('local_') && !String(cartItemId).startsWith('cart_')) {
          const deleteResult = await cartService.removeItemFromCart(cartItemId);
          if (!deleteResult) {
            // Check if item is already deleted or absent from backend cart
            try {
              const activeCart = await cartService.getOrCreateCart(cartOwnerId(user), tableContext?.tableId || null);
              const backendItems = await cartService.getCartItems(activeCart.id);
              const stillExists = backendItems.some((bi) => String(bi.id || bi.item_id) === String(cartItemId));
              backendSuccess = !stillExists;
            } catch (e) {
              backendSuccess = false;
            }
          } else {
            backendSuccess = true;
          }
        } else {
          backendSuccess = true;
        }
      }

      if (backendSuccess) {
        // Update local cart state ONLY after verified backend deletion
        setCartItems(prev => {
          const target = findLine(prev, lockKey);
          const updated = prev.filter(i => i !== target);
          saveCartToStorage(updated);
          return updated;
        });

        // Display success notification only after backend success
        try {
          window.dispatchEvent(new CustomEvent('foodie_item_removed', { detail: { message: `"${item.name}" removed from cart` } }));
        } catch (e) { }
        return true;
      } else {
        console.error("Failed to delete cart item from backend:", item.name);
        try {
          window.dispatchEvent(new CustomEvent('foodie_item_removed', { detail: { message: `Failed to remove "${item.name}" from cart. Please try again.` } }));
        } catch (e) { }
        return false;
      }
    } finally {
      deletingIdsRef.current.delete(lockKey);
    }
  };

  const increaseQuantity = async (id) => {
    const item = findLine(cartItems, id);
    if (!item) return;

    const maxStock = dishStockLimit(item);
    if (item.quantity >= maxStock) {
      showOutOfStockModal({
        item,
        stock: maxStock,
        message: `You have reached the maximum available quantity (${maxStock} in stock) for "${item.name}". Additional quantity is currently out of stock.`
      });
      return;
    }

    const currentQty = item.quantity;
    const sellingPrice = getProductSellingPrice(item);
    const newQty = currentQty + 1;

    // 1. Optimistic UI update
    setCartItems(prev => {
      const target = findLine(prev, id);
      const updated = prev.map(i => i === target ? { ...i, quantity: newQty } : i);
      saveCartToStorage(updated);
      return updated;
    });

    // 2. Backend sync in background
    if (usesServerCart(user)) {
      try {
        let cartItemId = item.cartItemId;
        if (!cartItemId) {
          const activeCart = await cartService.getOrCreateCart(cartOwnerId(user), tableContext?.tableId || null);
          const backendItems = await cartService.getCartItems(activeCart.id);
          const found = backendItems.find((bi) => Number(bi.food || bi.food_id) === Number(item.id) && optionKey(bi.options) === optionKey(item.extraIngredients));
          if (found) {
            cartItemId = found.id || found.item_id;
          }
        }

        if (cartItemId) {
          const view = await cartService.updateItemQuantity(cartItemId, newQty, sellingPrice);
          if (Array.isArray(view?.items)) {
            setCartItems((prev) => {
              const updated = mergeServerItems(view.items, prev);
              saveCartToStorage(updated);
              return updated;
            });
          }
        }
      } catch (e) {
        console.error(e);
      }
    }
  };

  const decreaseQuantity = async (id) => {
    const item = findLine(cartItems, id);
    if (!item) return;

    const currentQty = item.quantity;
    if (currentQty <= 1) {
      await removeFromCart(id);
      return;
    }

    const sellingPrice = getProductSellingPrice(item);
    const newQty = currentQty - 1;

    // 1. Optimistic UI update
    setCartItems((prev) => {
      const target = findLine(prev, id);
      const updated = prev.map((i) => (i === target ? { ...i, quantity: newQty } : i));
      saveCartToStorage(updated);
      return updated;
    });

    // 2. Backend sync in background
    if (usesServerCart(user)) {
      try {
        let cartItemId = item.cartItemId;
        if (!cartItemId) {
          const activeCart = await cartService.getOrCreateCart(cartOwnerId(user), tableContext?.tableId || null);
          const backendItems = await cartService.getCartItems(activeCart.id);
          const found = backendItems.find((bi) => Number(bi.food || bi.food_id) === Number(item.id) && optionKey(bi.options) === optionKey(item.extraIngredients));
          if (found) {
            cartItemId = found.id || found.item_id;
          }
        }

        if (cartItemId) {
          const view = await cartService.updateItemQuantity(cartItemId, newQty, sellingPrice);
          if (Array.isArray(view?.items)) {
            setCartItems((prev) => {
              const updated = mergeServerItems(view.items, prev);
              saveCartToStorage(updated);
              return updated;
            });
          }
        }
      } catch (e) {
        console.error(e);
      }
    }
  };

  const updateQuantity = async (id, newQty) => {
    const item = findLine(cartItems, id);
    if (!item) return;

    const parsedQty = parseInt(newQty, 10);
    if (isNaN(parsedQty) || parsedQty <= 0) {
      await removeFromCart(id);
      return;
    }

    const maxStock = dishStockLimit(item);
    const finalQty = Math.min(parsedQty, maxStock);
    const sellingPrice = getProductSellingPrice(item);

    if (parsedQty > maxStock) {
      showOutOfStockModal({
        item,
        stock: maxStock,
        message: `You have reached the maximum available quantity (${maxStock} in stock) for "${item.name}". Additional quantity is currently out of stock.`
      });
    }

    setCartItems(prev => {
      const target = findLine(prev, id);
      const updated = prev.map(i => i === target ? { ...i, quantity: finalQty } : i);
      saveCartToStorage(updated);
      return updated;
    });

    if (usesServerCart(user)) {
      try {
        let cartItemId = item.cartItemId;
        if (!cartItemId) {
          const activeCart = await cartService.getOrCreateCart(cartOwnerId(user), tableContext?.tableId || null);
          const backendItems = await cartService.getCartItems(activeCart.id);
          const found = backendItems.find((bi) => Number(bi.food || bi.food_id) === Number(item.id) && optionKey(bi.options) === optionKey(item.extraIngredients));
          if (found) {
            cartItemId = found.id || found.item_id;
          }
        }
        if (cartItemId) {
          const view = await cartService.updateItemQuantity(cartItemId, finalQty, sellingPrice);
          if (Array.isArray(view?.items)) {
            setCartItems((prev) => {
              const updated = mergeServerItems(view.items, prev);
              saveCartToStorage(updated);
              return updated;
            });
          }
        }
      } catch (e) {
        console.error(e);
      }
    }
  };

  const wipeStaffLocalCart = () => {
    setCartItems([]);
    setCoupon(null);
    const id = user?.phone
      ? String(user.phone).replace(/\D/g, '').slice(-10)
      : (user?.id || user?.email || '');
    const prefix = id ? `foodie_cart_user_${id}` : null;
    const shouldWipe = (key) => key === 'foodie_cart' || (prefix && key && key.startsWith(prefix));
    const sessionKeys = [];
    for (let i = 0; i < sessionStorage.length; i += 1) sessionKeys.push(sessionStorage.key(i));
    sessionKeys.filter(shouldWipe).forEach((key) => sessionStorage.removeItem(key));
    const localKeys = [];
    for (let i = 0; i < localStorage.length; i += 1) localKeys.push(localStorage.key(i));
    localKeys.filter(shouldWipe).forEach((key) => localStorage.removeItem(key));
  };

  const abandonStaffTableOrder = async () => {
    const branch = Number(sessionStorage.getItem('foodie_public_branch'));
    if (!Number.isFinite(branch) || branch <= 0) {
      throw new Error('The table-order session could not be identified.');
    }
    const { staffJson } = await import('../services/staffClient');
    await staffJson(`/cart/?branch=${branch}`, { method: 'DELETE' });
    wipeStaffLocalCart();
    setTable(null);
    const { setOrderType, setSelectedTableId, rememberScannedTableQr } = await import('../utils/orderContext');
    setOrderType(null);
    setSelectedTableId(null);
    rememberScannedTableQr(null);
    sessionStorage.removeItem('foodie_staff_ordering');
    sessionStorage.removeItem('foodie_branch_source');
  };

  const clearCart = async () => {
    // Set flag so loadBackendCart doesn't immediately re-create a cart after checkout
    sessionStorage.setItem('foodie_checkout_in_progress', '1');
    if (usesServerCart(user)) {
      try {
        const targetId = user?.id ? Number(user.id) : null;
        const userCart = await cartService.getExistingCart(targetId, tableContext?.tableId || null);
        if (userCart && userCart.id) {
          await cartService.clearCart(userCart.id);
        }
      } catch (e) {
        console.error(e);
      }
    }
    setCartItems([]);
    setCoupon(null);
    saveCartToStorage([], user);
    sessionStorage.removeItem('foodie_cart');
    sessionStorage.removeItem('foodie_guest_cart');
    sessionStorage.removeItem('foodie_guest_cart_temp');
    sessionStorage.removeItem('foodie_guest_cart_unmerged');
    localStorage.removeItem('foodie_guest_cart');
    localStorage.removeItem('foodie_guest_cart_temp');
    localStorage.removeItem('foodie_guest_cart_unmerged');
    // Remove the checkout flag after a brief delay so the effect skips only once
    setTimeout(() => sessionStorage.removeItem('foodie_checkout_in_progress'), 3000);
  };

  const isTakeawayActive = (customTakeawayFlag) => {
    if (typeof customTakeawayFlag === 'boolean') return customTakeawayFlag;
    if (typeof customTakeawayFlag === 'string') {
      return customTakeawayFlag.toUpperCase() === 'TAKEAWAY';
    }
    return getOrderType() === 'TAKEAWAY';
  };

  const getEffectiveItems = () => {
    if (cartItems && cartItems.length > 0) return cartItems;
    try {
      const key = getCartStorageKey(user, tableContext);
      let saved = sessionStorage.getItem(key);
      if (!saved && !user) {
        saved = sessionStorage.getItem('foodie_guest_cart_temp') || sessionStorage.getItem('foodie_guest_cart');
      }
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch (e) { }
    return [];
  };

  const [isServiceChargeRemoved, setIsServiceChargeRemoved] = useState(() => {
    try {
      const saved = localStorage.getItem('foodie_service_tax_enabled');
      return saved !== null ? saved === 'false' : false;
    } catch (e) {
      return false;
    }
  });

  useEffect(() => {
    const handleTaxSync = (e) => {
      if (typeof e.detail?.enabled === 'boolean') {
        setIsServiceChargeRemoved(!e.detail.enabled);
      }
    };
    window.addEventListener('foodie_service_tax_changed', handleTaxSync);
    return () => window.removeEventListener('foodie_service_tax_changed', handleTaxSync);
  }, []);

  const toggleServiceChargeRemoval = () => {
    setIsServiceChargeRemoved(prev => !prev);
  };

  const getBillBreakdown = (customIsTakeaway) => {
    const isTakeaway = isTakeawayActive(customIsTakeaway);
    return calculateBillDetails({
      items: getEffectiveItems(),
      coupon: coupon,
      isTakeaway,
      gstRate: GST_RATE,
      isServiceChargeRemoved
    });
  };

  const getExtraCharges = (customIsTakeaway) => {
    return getBillBreakdown(customIsTakeaway).extraCharges;
  };

  const getPackingCharge = (customIsTakeaway) => {
    return getBillBreakdown(customIsTakeaway).packingCharge;
  };

  const getSubtotal = (customIsTakeaway) => {
    return getBillBreakdown(customIsTakeaway).subtotal;
  };

  const getItemDiscounts = (customIsTakeaway) => {
    return getBillBreakdown(customIsTakeaway).menuDiscounts;
  };

  const getCartNetSubtotal = (customIsTakeaway) => {
    return getBillBreakdown(customIsTakeaway).subtotal;
  };

  const getDiscount = (customIsTakeaway) => {
    return getBillBreakdown(customIsTakeaway).discount;
  };

  const getTax = (customIsTakeaway) => {
    return getBillBreakdown(customIsTakeaway).tax;
  };

  const getServiceCharge = (customIsTakeaway) => {
    return getBillBreakdown(customIsTakeaway).serviceCharge;
  };

  const getDeliveryFee = () => {
    return 0;
  };

  const getGrandTotal = (customIsTakeaway) => {
    return getBillBreakdown(customIsTakeaway).grandTotal;
  };

  const getOrderBillTotal = (customIsTakeaway) => {
    return getBillBreakdown(customIsTakeaway).grandTotal;
  };

  const removeCoupon = () => {
    if (coupon && (coupon.isAutomatic || coupon.autoApply || coupon.code === 'WELCOME100')) {
      userRemovedCouponRef.current = true;
    }
    setCoupon(null);
    const branch = typeof window !== 'undefined' ? sessionStorage.getItem('foodie_public_branch') : null;
    if (branch) {
      api.delete(`/cart/coupon/?branch=${branch}`).catch(() => {});
    }
  };

  const userRemovedCouponRef = useRef(false);
  const lastSubtotalRef = useRef(0);

  // Auto-apply WELCOME100 when subtotal >= 700 & auto-revalidate applied coupon on cart change
  useEffect(() => {
    let isMounted = true;
    const checkAndAutoApplyCoupon = async () => {
      const effectiveItems = getEffectiveItems();
      const breakdownNoCoupon = calculateBillDetails({
        items: effectiveItems,
        coupon: null,
        isTakeaway: isTakeawayActive(),
        gstRate: GST_RATE,
        isServiceChargeRemoved
      });
      const currentSubtotal = breakdownNoCoupon.subtotal;

      // Update last subtotal tracking (but don't automatically reset user's explicit coupon dismissal unless cart is emptied)
      if (Math.abs(currentSubtotal - lastSubtotalRef.current) > 0.01) {
        lastSubtotalRef.current = currentSubtotal;
      }

      // If cart is emptied, reset the dismissal states so new orders can get the coupon again
      if (currentSubtotal === 0) {
        userRemovedCouponRef.current = false;
      }

      const firstTime = await isFirstTimeCustomer(user);

      // If returning customer has WELCOME100 applied, remove it immediately
      if (!firstTime && coupon && (coupon.isFirstTimeOffer || coupon.is_first_time_offer)) {
        if (isMounted) setCoupon(null);
        return;
      }

      if (!coupon || coupon.isAutomatic) {
        const offers = await couponService.getCoupons().catch(() => []);
        const eligible = (offers || []).filter((offer) => {
          if (!offer.autoApply || offer.status === 'Inactive') return false;
          if (offer.isFirstTimeOffer && !firstTime) return false;
          const minReq = Number(offer.minOrderValue || offer.minimum_order_amount || 0);
          return currentSubtotal >= minReq;
        });
        eligible.sort((a, b) => calculateCouponDiscount(b, currentSubtotal) - calculateCouponDiscount(a, currentSubtotal));
        const best = eligible[0];
        if (!isMounted) return;
        if (userRemovedCouponRef.current) {
          if (coupon?.isAutomatic) setCoupon(null);
        } else if (best) {
          if (!coupon || coupon.code !== best.code) {
            setCoupon({ ...best, isAutomatic: true });
            const branch = sessionStorage.getItem('foodie_public_branch');
            if (branch) {
              api.post('/cart/coupon/', { branch: Number(branch), code: best.code }).catch(() => {});
            }
          }
        } else if (coupon?.isAutomatic) {
          setCoupon(null);
        }
      }

      if (coupon) {
        const breakdown = calculateBillDetails({
          items: effectiveItems,
          coupon: coupon,
          isTakeaway: isTakeawayActive(),
          gstRate: GST_RATE,
          isServiceChargeRemoved
        });
        if (!breakdown.isCouponEligible) {
          if (isMounted) setCoupon(null);
        }
      }

    };

    checkAndAutoApplyCoupon();
    return () => { isMounted = false; };
  }, [cartItems, coupon, user, isServiceChargeRemoved]);

  const applyCoupon = async (code) => {
    const codeUpper = (code || '').trim().toUpperCase();
    if (!codeUpper) return { success: false, message: 'Enter a coupon code.' };
    if (coupon && coupon.code === codeUpper) {
      return { success: true, message: `Coupon "${codeUpper}" is already applied.` };
    }
    const branch = typeof window !== 'undefined' ? sessionStorage.getItem('foodie_public_branch') : null;
    if (!branch) return { success: false, message: 'Choose a restaurant before applying a coupon.' };
    try {
      const res = await api.post('/cart/coupon/', { branch: Number(branch), code: codeUpper });
      const pricing = res.data?.pricing || {};
      const applied = (pricing.coupons || []).find((row) => String(row.code).toUpperCase() === codeUpper);
      const rejected = (pricing.rejected_coupons || []).find((row) => String(row.code).toUpperCase() === codeUpper);
      if (!applied) {
        return { success: false, message: rejected?.reason || 'This coupon cannot be applied to this order.' };
      }
      userRemovedCouponRef.current = false;
      setCoupon({ code: applied.code, discount: Number(applied.discount || 0), isAutomatic: Boolean(applied.auto_applied) });
      return { success: true, message: `Coupon "${codeUpper}" applied successfully!` };
    } catch (err) {
      return { success: false, message: err.response?.data?.detail || err.message || 'Failed to apply coupon' };
    }
  };



  // Places the order from the customer's server cart. The server prices it, enforces the Dine-In table rule
  // and marks that cart CONVERTED; the local mirror is reset only after the server confirms the order.
  const submitOrder = async (paymentMethod = 'COUNTER', explicitOrderType = null) => {
    const order = await placeCustomerOrder(explicitOrderType || getOrderType(), paymentMethod);
    setOrderLogs((prev) => [order, ...prev]);
    resetLocalCart();
    try {
      window.dispatchEvent(new CustomEvent('foodie_orders_updated', { detail: { orderId: order.id } }));
    } catch (e) { }
    return order;
  };

  const resetLocalCart = () => {
    sessionStorage.setItem('foodie_checkout_in_progress', '1');
    setCartItems([]);
    setCoupon(null);
    saveCartToStorage([], user);
    for (const key of ['foodie_cart', 'foodie_guest_cart', 'foodie_guest_cart_temp', 'foodie_guest_cart_unmerged']) {
      sessionStorage.removeItem(key);
      localStorage.removeItem(key);
    }
    if (user) sessionStorage.removeItem(getCartStorageKey(user));
    setTimeout(() => sessionStorage.removeItem('foodie_checkout_in_progress'), 3000);
  };

  const loadOrderIntoCart = (items) => {
    if (Array.isArray(items) && items.length > 0) {
      setCartItems(items);
      saveCartToStorage(items);
    }
  };

  return (
    <CartContext.Provider value={{
      cartItems,
      tableContext,
      coupon,
      orderLogs,
      addToCart,
      removeFromCart,
      increaseQuantity,
      decreaseQuantity,
      updateQuantity,
      clearCart,
      abandonStaffTableOrder,
      loadOrderIntoCart,
      applyCoupon,
      removeCoupon,
      setTable,
      getSubtotal,
      getItemDiscounts,
      getCartNetSubtotal,
      getExtraCharges,
      getPackingCharge,
      getTax,
      getServiceCharge,
      isServiceChargeRemoved,
      toggleServiceChargeRemoval,
      getDeliveryFee,
      getDiscount,
      getGrandTotal,
      submitOrder,
      placeOrder: submitOrder,
      getCartSubtotal: getSubtotal,
      getCartTax: getTax,
      getCartDeliveryFee: getDeliveryFee,
      getCartDiscount: getDiscount,
      getCartGrandTotal: getGrandTotal,
      updateItemInstructionsAndExtras,
      showOutOfStockModal,
      closeOutOfStockModal
    }}>
      {children}
      <OutOfStockModal
        isOpen={Boolean(outOfStockModalData)}
        onClose={closeOutOfStockModal}
        item={outOfStockModalData?.item}
        message={outOfStockModalData?.message}
        stock={outOfStockModalData?.stock}
        title={outOfStockModalData?.title}
      />
    </CartContext.Provider>
  );
};
export default CartContext;
