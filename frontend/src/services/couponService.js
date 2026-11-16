import api from './api';
import { calculateCouponDiscount } from '../utils/pricing';

export const isFirstTimeCustomer = async (user = null) => {
  const hasCustomerToken = typeof window !== 'undefined' && (sessionStorage.getItem('foodie_token_customer') || localStorage.getItem('foodie_token_customer'));
  if (!user && !hasCustomerToken) return false;
  try {
    let customerUser = user;
    if (!customerUser && typeof window !== 'undefined') {
      try {
        const savedCustomerAuth = sessionStorage.getItem('foodie_auth_customer') || localStorage.getItem('foodie_auth_customer') || sessionStorage.getItem('foodie_auth') || localStorage.getItem('foodie_auth');
        if (savedCustomerAuth) {
          const parsed = JSON.parse(savedCustomerAuth);
          customerUser = parsed.user || parsed || null;
        }
      } catch (e) {}
    }

    const userId = customerUser?.id;
    const userPhone = customerUser?.phone;
    const userEmail = customerUser?.email;

    // Helper: evaluate whether an order represents a retained successful completed purchase
    const isRetainedPaidPurchase = (ord) => {
      if (!ord) return false;
      const payStatus = String(ord.payment_status || ord.paymentStatus || '').toUpperCase();
      const ordStatus = String(ord.status || ord.order_status || '').toUpperCase();
      const refundStatus = String(ord.refund_status || ord.refundStatus || '').toUpperCase();

      const isPaid = payStatus === 'PAID' || payStatus === 'SUCCESS';
      if (!isPaid) return false; // Unpaid or rejected orders do not count

      // A successfully paid order that was subsequently cancelled and fully refunded does not count
      if (ordStatus === 'CANCELLED' && refundStatus === 'FULLY_REFUNDED') {
        return false;
      }

      // Any other paid order (active, completed, or cancelled with only partial/no refund) is a retained purchase
      return true;
    };

    // 1. Query backend user orders via orderService
    const targetId = userId || userPhone || userEmail;
    if (targetId) {
      try {
        const { orderService } = await import('./orderService');
        if (orderService && typeof orderService.getOrders === 'function') {
          const userOrders = await orderService.getOrders(targetId, false, true).catch(() => []);
          if (Array.isArray(userOrders) && userOrders.some(isRetainedPaidPurchase)) {
            return false;
          }
        }
      } catch (e) {}
    }

    // 2. Query authenticated orders endpoint directly as secondary confirmation
    if (hasCustomerToken) {
      try {
        const res = await api.get('/orders/', { bypassCache: true }).catch(() => null);
        const rawOrders = res?.data?.data || (Array.isArray(res?.data) ? res.data : (res?.data?.results || []));
        if (Array.isArray(rawOrders) && rawOrders.some(isRetainedPaidPurchase)) {
          return false;
        }
      } catch (e) {}
    }
  } catch (e) {
    console.error("Error verifying first-time customer status with backend:", e);
  }

  return true;
};

export const mockCoupons = [
  {
    id: 1,
    code: "FOODIE50",
    discount: 50,
    discount_value: 50,
    type: "fixed",
    discount_type: "FIXED",
    minOrderValue: 500,
    minimum_order_amount: 500,
    expiryDate: "2028-12-31",
    status: "Active",
    description: "Flat ₹50 OFF on orders above ₹500"
  },
  {
    id: 2,
    code: "WELCOME100",
    discount: 100,
    discount_value: 100,
    type: "fixed",
    discount_type: "FIXED",
    minOrderValue: 700,
    minimum_order_amount: 700,
    expiryDate: "2028-12-31",
    status: "Active",
    description: "Flat ₹100 OFF on orders above ₹700"
  },
  {
    id: 3,
    code: "SUPER20",
    discount: 20,
    discount_value: 20,
    type: "percentage",
    discount_type: "PERCENTAGE",
    minOrderValue: 300,
    minimum_order_amount: 300,
    maxDiscount: 80,
    maximum_discount: 80,
    expiryDate: "2028-12-31",
    status: "Active",
    description: "20% OFF up to ₹80 on orders above ₹300"
  }
];

const LOCAL_STORAGE_KEY = 'foodie_coupons_store';

const getStoredCoupons = () => {
  try {
    const data = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (data) {
      return JSON.parse(data);
    }
  } catch (e) {
    console.error("Error reading coupons from localStorage:", e);
  }
  return null;
};

const setStoredCoupons = (coupons) => {
  try {
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(coupons));
  } catch (e) {
    console.error("Error saving coupons to localStorage:", e);
  }
};

export const couponService = {
  getCoupons: async () => {
    const { isStaffScreen, listCoupons } = await import('./adminApi');
    if (isStaffScreen()) return listCoupons();
    const { resolveAuthoritativeBranch } = await import('./branchResolution');
    const branchId = await resolveAuthoritativeBranch();
    if (!branchId) return [];
    let menu;
    try {
      menu = await api.get(`/public/branches/${branchId}/menu/`);
    } catch (err) {
      if (err?.response?.status === 404) {
        sessionStorage.removeItem('foodie_public_branch');
        localStorage.removeItem('foodie_public_branch');
      }
      return [];
    }
    const offers = Array.isArray(menu.data?.offers) ? menu.data.offers : [];
    return offers
      .filter((c) => c.is_active !== false && c.status !== 'Inactive')
      .map((c) => {
        const isPct = c.discount_type === 'PERCENT';
        const discVal = parseFloat(c.discount_value || 0);
        const minVal = parseFloat(c.min_order_value || 0);
        const maxVal = c.max_discount != null ? parseFloat(c.max_discount) : null;
        return {
          id: c.code,
          code: c.code,
          discount: discVal,
          discount_value: discVal,
          type: isPct ? 'percentage' : 'fixed',
          discount_type: isPct ? 'PERCENTAGE' : 'FIXED',
          minOrderValue: minVal,
          minimum_order_amount: minVal,
          maxDiscount: maxVal,
          status: c.is_active === false ? 'Inactive' : 'Active',
          is_active: c.is_active !== false,
          description: c.description || (isPct ? `${discVal}% off` : `Flat ₹${discVal} off`),
          autoApply: Boolean(c.auto_apply),
          isFirstTimeOffer: Boolean(c.is_first_time_offer),
          valid_from: c.valid_from,
          valid_until: c.valid_to,
        };
      });
  },

  createCoupon: async (couponData) => {
    const { isStaffScreen, createCoupon, explain } = await import('./adminApi');
    if (isStaffScreen()) {
      try { return await createCoupon(couponData); } catch (err) { throw new Error(explain(err)); }
    }
    const cleanCode = String(couponData.code || '').trim().toUpperCase();
    const discountVal = parseFloat(couponData.discount || couponData.discount_value || 0);
    const minVal = parseFloat(couponData.minOrderValue || couponData.minimum_order_amount || 0);
    if (minVal <= discountVal) {
      throw new Error('Minimum order value must be greater than the discount value.');
    }
    const isPct = couponData.type === 'percentage' || couponData.discount_type === 'PERCENTAGE';
    const desc = couponData.description || (isPct ? `${discountVal}% OFF on orders above ₹${minVal}` : `Flat ₹${discountVal} OFF on orders above ₹${minVal}`);

    const newCoupon = {
      id: Date.now(),
      code: cleanCode,
      discount: discountVal,
      discount_value: discountVal,
      type: isPct ? 'percentage' : 'fixed',
      discount_type: isPct ? 'PERCENTAGE' : 'FIXED',
      minOrderValue: minVal,
      minimum_order_amount: minVal,
      maxDiscount: couponData.maxDiscount || couponData.maximum_discount || null,
      maximum_discount: couponData.maxDiscount || couponData.maximum_discount || null,
      expiryDate: couponData.validity || couponData.expiryDate || couponData.end_date || '',
      validity: couponData.validity || couponData.expiryDate || couponData.end_date || '',
      status: 'Active',
      description: desc
    };

    // Remove from deleted list if recreated
    try {
      const deletedCodes = JSON.parse(localStorage.getItem('foodie_deleted_coupons') || '[]');
      const filtered = deletedCodes.filter(c => c !== cleanCode);
      localStorage.setItem('foodie_deleted_coupons', JSON.stringify(filtered));
    } catch (e) {}

    try {
      await api.post('/coupons/', {
        code: cleanCode,
        discount_value: String(newCoupon.discount),
        discount_type: newCoupon.type === 'percentage' ? 'PERCENTAGE' : 'FIXED',
        minimum_order_amount: String(newCoupon.minOrderValue),
        maximum_discount: newCoupon.maxDiscount ? String(newCoupon.maxDiscount) : null,
        start_date: new Date().toISOString(),
        end_date: new Date(newCoupon.expiryDate).toISOString(),
        is_active: true,
        description: newCoupon.description
      }).catch(async () => {
        await api.post('/admin/coupons/', {
          code: cleanCode,
          discount_amount: newCoupon.discount,
          discount_type: newCoupon.type === 'percentage' ? 'PERCENTAGE' : 'FLAT',
          min_order_amount: newCoupon.minOrderValue,
          valid_to: newCoupon.expiryDate,
          is_active: true,
          description: newCoupon.description
        });
      });
    } catch (e) {
      console.warn("Backend coupon creation fallback to local persistence:", e);
    }

    let stored = getStoredCoupons() || mockCoupons;
    const updated = [newCoupon, ...stored.filter(c => String(c.code).toUpperCase() !== cleanCode)];
    setStoredCoupons(updated);
    return newCoupon;
  },

  updateCoupon: async (id, couponData) => {
    const { isStaffScreen, updateCoupon, explain } = await import('./adminApi');
    if (isStaffScreen()) {
      try { return await updateCoupon(id, couponData); } catch (err) { throw new Error(explain(err)); }
    }
    const cleanCode = String(couponData.code || '').trim().toUpperCase();
    const discountVal = parseFloat(couponData.discount || couponData.discount_value || 0);
    const minVal = parseFloat(couponData.minOrderValue || couponData.minimum_order_amount || 0);
    if (minVal <= discountVal) {
      throw new Error('Minimum order value must be greater than the discount value.');
    }
    const isPct = couponData.type === 'percentage' || couponData.discount_type === 'PERCENT' || couponData.discount_type === 'PERCENTAGE';
    if (isPct && (discountVal <= 0 || discountVal > 100)) {
      throw new Error('Percent discount must be between 1 and 100.');
    }
    let stored = getStoredCoupons() || mockCoupons;
    const updated = stored.map(c => {
      if (c.id === id || String(c.id) === String(id) || String(c.code).toUpperCase() === cleanCode) {
        return {
          ...c,
          code: cleanCode,
          discount: discountVal,
          discount_value: discountVal,
          type: isPct ? 'percentage' : 'fixed',
          discount_type: isPct ? 'PERCENTAGE' : 'FIXED',
          minOrderValue: minVal,
          minimum_order_amount: minVal,
          expiryDate: couponData.validity || c.expiryDate,
          validity: couponData.validity || c.validity,
          autoApply: Boolean(couponData.autoApply),
        };
      }
      return c;
    });
    setStoredCoupons(updated);
    return updated.find(c => c.id === id || String(c.code).toUpperCase() === cleanCode);
  },

  setAutoApply: async (id, autoApply) => {
    const { isStaffScreen, setCouponAutoApply, explain } = await import('./adminApi');
    if (!isStaffScreen()) {
      throw new Error('Only staff can change automatic coupons.');
    }
    try {
      return await setCouponAutoApply(id, autoApply);
    } catch (err) {
      throw new Error(explain(err));
    }
  },

  toggleStatus: async (id, code, currentStatus) => {
    const { isStaffScreen, toggleCoupon, explain } = await import('./adminApi');
    if (isStaffScreen()) {
      try { return await toggleCoupon(id, currentStatus); } catch (err) { throw new Error(explain(err)); }
    }
    const newStatus = currentStatus === 'Active' ? 'Inactive' : 'Active';
    try {
      if (id && typeof id === 'number' && id < 100000) {
        await api.patch(`/coupons/${id}/`, {
          is_active: newStatus === 'Active'
        }).catch(async () => {
          await api.patch(`/admin/coupons/${id}/`, {
            is_active: newStatus === 'Active'
          });
        });
      }
    } catch (e) {}

    let stored = getStoredCoupons() || mockCoupons;
    const updated = stored.map(c => {
      const match = (c.id === id || String(c.id) === String(id)) || 
                    (code && String(c.code).toUpperCase() === String(code).toUpperCase());
      return match ? { ...c, status: newStatus } : c;
    });
    setStoredCoupons(updated);
    return updated;
  },

  deleteCoupon: async (id, code) => {
    const { isStaffScreen, deleteCoupon, listCoupons, explain } = await import('./adminApi');
    if (isStaffScreen()) {
      try {
        let targetId = id;
        if (!targetId || isNaN(Number(targetId))) {
          const allCoupons = await listCoupons();
          const found = allCoupons.find(c => String(c.code).toUpperCase() === String(code).toUpperCase());
          if (found && found.id) targetId = found.id;
        }
        return await deleteCoupon(targetId);
      } catch (err) {
        throw new Error(explain(err));
      }
    }
    try {
      if (id && typeof id === 'number' && id < 100000) {
        await api.delete(`/coupons/${id}/`).catch(async () => {
          await api.delete(`/admin/coupons/${id}/`);
        });
      }
    } catch (e) {
      console.error("Failed to delete coupon in backend:", e);
    }

    const cleanCode = code ? String(code).toUpperCase() : null;
    try {
      const deletedCodes = JSON.parse(localStorage.getItem('foodie_deleted_coupons') || '[]');
      if (cleanCode && !deletedCodes.includes(cleanCode)) {
        deletedCodes.push(cleanCode);
      }
      if (id && !deletedCodes.includes(String(id))) {
        deletedCodes.push(String(id));
      }
      localStorage.setItem('foodie_deleted_coupons', JSON.stringify(deletedCodes));
    } catch (e) {}

    let stored = getStoredCoupons() || mockCoupons;
    const updated = stored.filter(c => {
      if (id && (c.id === id || String(c.id) === String(id))) return false;
      if (cleanCode && String(c.code).toUpperCase() === cleanCode) return false;
      return true;
    });
    setStoredCoupons(updated);
    return updated;
  },
  
  validateCoupon: async (code, subtotalBeforeGst, user = null) => {
    const codeUpper = String(code || '').trim().toUpperCase();
    const coupons = await couponService.getCoupons();
    const c = coupons.find(coupon => String(coupon.code).toUpperCase() === codeUpper);
    if (!c) {
      throw new Error("Invalid coupon code");
    }
    if (c.status !== "Active" || c.is_active === false) {
      throw new Error("This coupon is inactive.");
    }

    if (codeUpper === 'WELCOME100') {
      const firstTime = await isFirstTimeCustomer(user);
      if (!firstTime) {
        throw new Error("WELCOME100 coupon is valid for first-time customers only.");
      }
    }

    const now = new Date();
    const expiry = new Date(c.expiryDate);
    if (now > expiry) {
      throw new Error("This coupon has expired");
    }
    const minOrder = Number(c.minOrderValue || c.minimum_order_amount || 0);
    if (subtotalBeforeGst < minOrder) {
      const remaining = Math.round(minOrder - subtotalBeforeGst);
      throw new Error(`Add ₹${remaining} more to use this coupon (minimum order ₹${minOrder}).`);
    }

    const discountAmount = calculateCouponDiscount(c, subtotalBeforeGst);
    return {
      valid: true,
      code: c.code,
      discountAmount,
      coupon: c
    };
  }
};

export default couponService;

