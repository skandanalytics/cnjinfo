import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import CustomerLayout from '../../components/layout/CustomerLayout';
import { useCart } from '../../hooks/useCart';
import CartItem from '../../components/customer/CartItem';
import EmptyState from '../../components/common/EmptyState';
import Button from '../../components/common/Button';
import formatCurrency from '../../utils/formatCurrency';
import BackButton from '../../components/common/BackButton';
import useProducts from '../../hooks/useProducts';
import { getProductSellingPrice } from '../../utils/pricing';
import { couponService, isFirstTimeCustomer } from '../../services/couponService';
import { getImageUrl, FOOD_IMAGE_PLACEHOLDER } from '../../utils/imageUtils';
import { useAuth } from '../../hooks/useAuth';
import { normalizeFoodType } from '../../utils/filters';
import api from '../../services/api';
import { applyOrderContext, customerBranchId } from '../../services/customerCheckout';
import { getOrderType } from '../../utils/orderContext';
import ServerBillSummary from '../../components/customer/ServerBillSummary';
import CheckoutStepper from '../../components/customer/CheckoutStepper';

export const Cart = () => {
  const navigate = useNavigate();
  const { isAuthenticated, user, loading: authLoading } = useAuth();
  const {
    cartItems,
    addToCart,
    increaseQuantity,
    decreaseQuantity,
    updateQuantity,
    removeFromCart,
    applyCoupon,
    removeCoupon,
    coupon,
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
    updateItemInstructionsAndExtras
  } = useCart();

  const [promoCode, setPromoCode] = useState('');
  const [promoMessage, setPromoMessage] = useState('');
  const [promoSuccess, setPromoSuccess] = useState(null);
  const [showAllCoupons, setShowAllCoupons] = useState(false);
  const [availableCoupons, setAvailableCoupons] = useState([]);
  const [isFirstTime, setIsFirstTime] = useState(true);
  const hasEverHadItemsRef = useRef(false);

  const { products } = useProducts();

  useEffect(() => {
    if (cartItems.length > 0) {
      hasEverHadItemsRef.current = true;
    } else if (hasEverHadItemsRef.current) {
      // Deleting last item automatically redirects to customer home
      navigate('/customer/home', { replace: true });
    }
  }, [cartItems.length, navigate]);

  useEffect(() => {
    let isMounted = true;
    const fetchCouponsAndEligibility = async () => {
      const data = await couponService.getCoupons().catch(() => []);
      const now = new Date();
      const activeOnly = (Array.isArray(data) ? data : []).filter(c => {
        if (c.is_active === false || c.status === 'Inactive' || c.isActive === false) return false;
        if (c.valid_until && new Date(c.valid_until) < now) return false;
        return true;
      });
      if (isMounted) setAvailableCoupons(activeOnly);
      const firstTimeStatus = await isFirstTimeCustomer(user);
      if (isMounted) {
        setIsFirstTime(firstTimeStatus);
      }
    };
    fetchCouponsAndEligibility();
    return () => { isMounted = false; };
  }, [user, cartItems.length]);

  const isCustomer = (isAuthenticated && user?.role === 'customer')
    || sessionStorage.getItem('foodie_staff_ordering') === '1'
    || Boolean(sessionStorage.getItem('foodie_guest_token'));
  const [serverCart, setServerCart] = useState(() => {
    // Immediate seed from sessionStorage if available to eliminate initial flicker
    try {
      const cached = sessionStorage.getItem('foodie_cached_server_cart');
      return cached ? JSON.parse(cached) : null;
    } catch {
      return null;
    }
  });

  useEffect(() => {
    const branch = customerBranchId();
    if (!isCustomer || !branch) return undefined;
    let active = true;
    const fetchCart = async () => {
      try {
        const chosen = getOrderType();
        const load = chosen
          ? await applyOrderContext(chosen).catch(() => api.get(`/cart/?branch=${branch}`, { bypassCache: true }).then((res) => res.data))
          : await api.get(`/cart/?branch=${branch}`, { bypassCache: true }).then((res) => res.data);
        if (active && load) {
          setServerCart(load);
          sessionStorage.setItem('foodie_cached_server_cart', JSON.stringify(load));
        }
      } catch {
        if (active) setServerCart(null);
      }
    };

    // Immediate fetch on mount if no cached cart, or debounced update on edits
    const delay = serverCart ? 400 : 0;
    const timer = setTimeout(fetchCart, delay);
    return () => { active = false; clearTimeout(timer); };
  }, [isCustomer, cartItems, coupon]);

  const handleQuickApply = async (code) => {
    const res = await applyCoupon(code);
    setPromoMessage(res.message);
    setPromoSuccess(res.success);
    setPromoCode(code);
  };

  const handleRemovePromo = () => {
    removeCoupon();
    setPromoMessage('Coupon removed');
    setPromoSuccess(true);
    setPromoCode('');
  };

  if (cartItems.length === 0) {
    return (
      <CustomerLayout>
        <main className="px-3 pt-5 text-center">
          <EmptyState
            title="Your Cart is Empty"
            description="Browse our menu and add delicious food to order!"
            icon="bi-cart-x"
            buttonText="Browse Food"
            onButtonClick={() => navigate('/customer/home')}
          />
        </main>
      </CustomerLayout>
    );
  }

  const handleApplyPromo = async (e) => {
    e.preventDefault();
    if (!promoCode.trim()) return;

    const res = await applyCoupon(promoCode);
    setPromoMessage(res.message);
    setPromoSuccess(res.success);
  };

  const handleCheckout = () => {
    try {
      sessionStorage.setItem('foodie_cart', JSON.stringify(cartItems));
      sessionStorage.setItem('foodie_guest_cart', JSON.stringify(cartItems));
      sessionStorage.setItem('foodie_guest_cart_temp', JSON.stringify(cartItems));
      sessionStorage.setItem('foodie_guest_cart_unmerged', JSON.stringify(cartItems));
    } catch (e) {}

    const staffOrdering = sessionStorage.getItem('foodie_staff_ordering') === '1';
    if (isAuthenticated || staffOrdering) {
      navigate('/customer/checkout');
    } else {
      navigate('/customer/login', { state: { from: '/customer/checkout' } });
    }
  };

  const currentNetSubtotal = Math.round(Number(serverCart?.pricing?.merchandise_total ?? getSubtotal()) * 100) / 100;
  const suggestion = availableCoupons
    .filter((row) => row.is_active !== false && row.status !== 'Inactive')
    .filter((row) => isFirstTime || !(row.isFirstTimeOffer || row.is_first_time_offer))
    .map((row) => ({
      coupon: row,
      remaining: Math.max(0, Math.round((Number(row.minOrderValue || row.minimum_order_amount || 0) - currentNetSubtotal) * 100) / 100),
    }))
    .filter((row) => row.remaining > 0)
    .sort((a, b) => a.remaining - b.remaining)[0] || { coupon: null, remaining: 0 };

  const getItemFoodType = (item) => {
    if (!item) return 'veg';
    const raw = item.foodType ?? item.type ?? item.food_type ?? (item.is_veg === false || item.is_veg === 'false' || item.is_veg === 0 || item.is_veg === '0' ? 'non-veg' : 'veg');
    return normalizeFoodType(raw);
  };
  
  const getRecommendations = (remainingAmount) => {
    if (!products || products.length === 0 || !remainingAmount || remainingAmount <= 0) return [];

    // Classify cart items by dietary type (veg, non-veg, vegan, or mixed)
    const cartTypes = new Set(cartItems.map(getItemFoodType));
    const isPureVeg = cartTypes.size === 1 && cartTypes.has('veg');
    const isPureNonVeg = cartTypes.size === 1 && cartTypes.has('non-veg');
    const isPureVegan = cartTypes.size === 1 && cartTypes.has('vegan');
    const isMixed = cartTypes.size > 1;

    // Filter candidate products matching cart food preference
    let candidates = products.filter(p => {
      const inCart = cartItems.some(item => Number(item.id) === Number(p.id));
      const inStock = p.stock > 0;
      if (inCart || !inStock) return false;

      const pType = getItemFoodType(p);
      if (isPureVeg) return pType === 'veg';
      if (isPureNonVeg) return pType === 'non-veg';
      if (isPureVegan) return pType === 'vegan';
      if (isMixed) return cartTypes.has(pType);
      return true;
    });
    
    // Fallback to in-stock products matching dietary preference if candidates not in cart are exhausted
    if (candidates.length === 0) {
      candidates = products.filter(p => {
        if (p.stock <= 0) return false;
        const pType = getItemFoodType(p);
        if (isPureVeg) return pType === 'veg';
        if (isPureNonVeg) return pType === 'non-veg';
        if (isPureVegan) return pType === 'vegan';
        if (isMixed) return cartTypes.has(pType);
        return true;
      });
    }

    // Final fallback to any in-stock products
    if (candidates.length === 0) {
      candidates = products.filter(p => p.stock > 0);
    }

    if (candidates.length === 0) return [];
    
    let matches = candidates.filter(p => getProductSellingPrice(p) >= remainingAmount);
    
    if (matches.length === 0) {
      matches = candidates.sort((a, b) => getProductSellingPrice(b) - getProductSellingPrice(a));
    } else {
      matches = matches.sort((a, b) => getProductSellingPrice(a) - getProductSellingPrice(b));
    }
    
    return matches.slice(0, 3);
  };
  
  const recommendedItems = getRecommendations(suggestion.remaining);

  // Identify dietary category for recommendation subtitle
  const cartTypesSet = new Set(cartItems.map(getItemFoodType));
  const cartDietaryLabel = (cartTypesSet.size === 1 && cartTypesSet.has('veg'))
    ? 'Veg'
    : (cartTypesSet.size === 1 && cartTypesSet.has('non-veg'))
      ? 'Non-Veg'
      : (cartTypesSet.size === 1 && cartTypesSet.has('vegan'))
        ? 'Vegan'
        : 'Recommended';

  return (
    <CustomerLayout>
      <main className="pt-2">
        <CheckoutStepper currentStep={1} />


        <div className="d-flex align-items-center gap-3 mb-4">
          <BackButton />
          <h4 className="fw-bold text-dark mb-0">My Order</h4>
        </div>

        <div className="row g-4">
          {/* Left Column: Cart Items & Promo Codes */}
          <div className="col-12 col-lg-8">
            <div className="mb-4">
              {cartItems.map((item) => {
                 const lineKey = item.lineId || item.cartItemId || item.id;
                 return (
                 <CartItem
                  key={lineKey}
                  item={item}
                  onIncrease={() => increaseQuantity(lineKey)}
                  onDecrease={() => decreaseQuantity(lineKey)}
                  onChange={(val) => updateQuantity(lineKey, val)}
                  onRemove={() => removeFromCart(lineKey)}
                  onUpdateInstructions={updateItemInstructionsAndExtras}
                />
              );})}
            </div>

            {/* Smart Coupon Suggestion Box */}
            {!coupon && suggestion.coupon && suggestion.remaining > 0 ? (
              <div 
                className="card rounded-3 border-0 p-3 mb-4 text-start position-relative overflow-hidden shadow-sm"
                style={{
                  background: 'linear-gradient(135deg, #fffbeb 0%, #fef3c7 100%)',
                  border: '1px solid #fde68a'
                }}
              >
                <div className="d-flex align-items-start gap-2 mb-2">
                  <span className="fs-5">💡</span>
                  <div>
                    <h6 className="fw-bold text-dark mb-0.5" style={{ fontSize: '13px' }}>
                      Unlock {suggestion.coupon.code} Savings!
                    </h6>
                    <p className="text-secondary small mb-2" style={{ fontSize: '11px', lineHeight: '1.4' }}>
                      Add items worth <strong className="text-danger">{formatCurrency(suggestion.remaining)}</strong> more to save with this coupon.
                    </p>
                  </div>
                </div>

                {recommendedItems.length > 0 && (
                  <div>
                    <span className="small fw-semibold text-secondary mb-2 d-block" style={{ fontSize: '10px' }}>
                      Recommended {cartDietaryLabel} items to add:
                    </span>
                    <div className="row g-2">
                      {recommendedItems.map((dish) => {
                        const dishFoodType = getItemFoodType(dish);
                        return (
                          <div key={dish.id} className="col-12 col-sm-4">
                            <div className="d-flex align-items-center gap-2 p-2 bg-white rounded-3 border border-light shadow-sm h-100">
                              <img 
                                src={getImageUrl(dish.image)} 
                                alt={dish.name} 
                                className="rounded"
                                style={{ width: '40px', height: '40px', objectFit: 'cover' }}
                                onError={(event) => {
                                  console.error('Failed to load food image:', event.currentTarget.src);
                                  event.currentTarget.src = FOOD_IMAGE_PLACEHOLDER;
                                }}
                              />
                              <div className="flex-grow-1 min-width-0">
                                <div className="d-flex align-items-center gap-1">
                                  <span 
                                    className={dishFoodType === 'veg' ? 'veg-badge' : dishFoodType === 'vegan' ? 'vegan-badge' : 'non-veg-badge'}
                                    style={{ width: '10px', height: '10px' }}
                                    title={dishFoodType}
                                  ></span>
                                  <span className="fw-bold text-dark text-truncate" style={{ fontSize: '10px' }}>
                                    {dish.name}
                                  </span>
                                </div>
                                <div className="d-flex align-items-baseline gap-1 flex-wrap" style={{ fontSize: '10px' }}>
                                  {Boolean(dish.hasDiscount || (dish.discountPercent > 0 && dish.discountPercent < 100) || (dish.discountPrice > 0 && dish.discountPrice < (dish.originalPrice || dish.price))) ? (
                                    <>
                                      <span className="text-decoration-line-through text-muted small" style={{ fontSize: '9px' }}>
                                        {formatCurrency(dish.originalPrice || dish.price)}
                                      </span>
                                      <span className="text-danger fw-bold">
                                        {formatCurrency(getProductSellingPrice(dish))}
                                      </span>
                                    </>
                                  ) : (
                                    <span className="text-danger fw-bold">
                                      {formatCurrency(getProductSellingPrice(dish))}
                                    </span>
                                  )}
                                </div>
                              </div>
                              <button
                                type="button"
                                onClick={() => addToCart(dish, 1)}
                                className="btn btn-sm btn-outline-danger p-0 d-flex align-items-center justify-content-center rounded-circle"
                                style={{ width: '22px', height: '22px', border: '1px solid #CBD5E1', color: '#334155', backgroundColor: '#FFFFFF' }}
                                title={`Add ${dish.name} to cart`}
                              >
                                +
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Browse More Option */}
                <div className="d-flex justify-content-end align-items-center mt-2 pt-1">
                  <button
                    type="button"
                    onClick={() => navigate('/customer/home')}
                    className="btn btn-link p-0 text-danger fw-bold text-decoration-none small d-inline-flex align-items-center gap-1"
                    style={{ fontSize: '12px', cursor: 'pointer' }}
                    title="Browse all dishes from menu"
                  >
                    <span>Browse More</span>
                    <span style={{ fontSize: '14px' }}>&rarr;</span>
                  </button>
                </div>
              </div>
            ) : null}


            {/* Promo Code Card */}
            <div className="card rounded-3 border-0 shadow-sm p-3 bg-white mb-4">
              <span className="small fw-semibold text-secondary mb-2 d-block">Have a Promo Coupon?</span>
              
              {coupon ? (
                <>
                  <div className="card rounded-3 bg-success-subtle border border-success-subtle p-3 mb-2 text-start">
                    <div className="d-flex align-items-center justify-content-between flex-wrap gap-2">
                      <div>
                        <div className="d-flex align-items-center gap-2 mb-1 flex-wrap">
                          <span className="small text-success fw-bold">Applied Coupon:</span>
                          <span className="badge bg-success text-white font-monospace px-2.5 py-1 rounded" style={{ fontSize: '12px' }}>
                            {coupon.code}
                          </span>
                          <span className="badge rounded-pill fw-bold bg-success-subtle text-success border border-success-subtle px-2.5 py-0.5" style={{ fontSize: '11px' }}>
                            🎉 You save {formatCurrency(getDiscount())}!
                          </span>
                        </div>
                      </div>
                      <button 
                        onClick={handleRemovePromo} 
                        className="btn btn-sm btn-outline-danger rounded-pill px-3 py-1 fw-bold"
                        style={{ fontSize: '11px' }}
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                  {promoMessage && (
                    <div className={`small mb-2 fw-semibold text-start ${promoSuccess ? 'text-success' : 'text-danger'}`} style={{ fontSize: '11px' }}>
                      {promoMessage}
                    </div>
                  )}
                </>
              ) : (
                <>
                  <form onSubmit={handleApplyPromo} className="d-flex gap-2">
                    <input 
                      type="text" 
                      className="form-control rounded-pill text-uppercase py-1.5 ps-3"
                      placeholder="e.g. FOODIE50"
                      value={promoCode}
                      onChange={(e) => setPromoCode(e.target.value)}
                    />
                    <button 
                      type="submit" 
                      className="btn btn-danger rounded-pill px-4 fw-bold shadow-sm flex-shrink-0"
                      style={{ height: '40px', backgroundColor: 'var(--primary-color, #F20D2D)', borderColor: 'var(--primary-color, #F20D2D)' }}
                    >
                      Apply
                    </button>
                  </form>
                  {promoMessage && (
                    <div className={`small mt-2 fw-semibold text-start ${promoSuccess ? 'text-success' : 'text-danger'}`} style={{ fontSize: '11px' }}>
                      {promoMessage}
                    </div>
                  )}
                </>
              )}

              {/* Available Coupons Section */}
              <div className="mt-3 pt-3 border-top text-start">
                <span className="small fw-semibold text-secondary mb-2 d-block">{coupon ? 'More Coupons:' : 'Available Coupons:'}</span>
                <div className="d-flex flex-column gap-2">
                  {(() => {
                    const describeCoupon = (c) => {
                      const isPct = c.discount_type === 'PERCENTAGE' || c.type === 'percentage';
                      const value = Number(c.discount_value || c.discount || 0);
                      const minReq = Number(c.minOrderValue || c.minimum_order_amount || 0);
                      const maxOff = c.maxDiscount != null ? ` up to ${formatCurrency(c.maxDiscount)}` : '';
                      const valueLabel = isPct ? `${value}% off${maxOff}` : `${formatCurrency(value)} off`;
                      const until = c.valid_until ? new Date(c.valid_until) : null;
                      const from = c.valid_from ? new Date(c.valid_from) : null;
                      const now = new Date();
                      let reason = '';
                      let enabled = true;
                      if (c.is_active === false || c.status === 'Inactive') {
                        enabled = false;
                        reason = 'This coupon is inactive.';
                      } else if (from && now < from) {
                        enabled = false;
                        reason = 'This coupon is not valid yet.';
                      } else if (until && now > until) {
                        enabled = false;
                        reason = 'This coupon has expired.';
                      } else if ((c.isFirstTimeOffer || c.is_first_time_offer) && !isFirstTime) {
                        enabled = false;
                        reason = 'This coupon is only for first-time customers.';
                      } else if (currentNetSubtotal < minReq) {
                        enabled = false;
                        const needed = Math.max(0, Math.round((minReq - currentNetSubtotal) * 100) / 100);
                        reason = `Add items worth ${formatCurrency(needed)} more. Minimum order ${formatCurrency(minReq)}.`;
                      }
                      return {
                        valueLabel,
                        minReq,
                        enabled,
                        reason,
                        expiry: until && !Number.isNaN(until.getTime())
                          ? `Valid until ${until.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}`
                          : '',
                      };
                    };
                    const toDisplay = showAllCoupons ? availableCoupons : availableCoupons.slice(0, 4);
                    
                    return (
                      <>
                        {availableCoupons.length === 0 && (
                          <p className="text-secondary small mb-0">No coupons are configured for this restaurant.</p>
                        )}
                        {toDisplay.map((c) => {
                    const info = describeCoupon(c);
                    const minReq = info.minReq;
                    const isEligible = info.enabled;
                    const isApplied = coupon?.code === c.code || (serverCart?.pricing?.coupons || []).some((row) => row.code === c.code);

                    return (
                      <div 
                        key={c.code} 
                        className={`d-flex align-items-center justify-content-between p-2 rounded-3 border flex-wrap gap-2 transition-all ${
                          isApplied 
                            ? 'border-success bg-success-subtle shadow-xs' 
                            : isEligible 
                              ? 'border-dashed border-danger-subtle bg-light-subtle' 
                              : 'border-light bg-light opacity-75'
                        }`}
                      >
                        <div className="d-flex align-items-center gap-2 flex-wrap">
                          <span className={`badge border rounded px-2 py-1 fw-bold font-monospace ${
                            isApplied 
                              ? 'bg-success text-white border-success' 
                              : isEligible 
                                ? 'bg-danger-subtle text-danger border-danger-subtle' 
                                : 'bg-secondary-subtle text-secondary border-secondary-subtle'
                          }`} style={{ fontSize: '10px' }}>
                            {c.code}
                          </span>
                          <div>
                            <div className="small fw-semibold text-dark" style={{ fontSize: '11px' }}>
                              {info.valueLabel} · Min {formatCurrency(minReq)}
                            </div>
                            {c.description && <div className="text-secondary" style={{ fontSize: '10px' }}>{c.description}</div>}
                            {info.expiry && <div className="text-secondary" style={{ fontSize: '10px' }}>{info.expiry}</div>}
                            {!isEligible && (
                              <div className="text-danger small" style={{ fontSize: '10px' }}>{info.reason}</div>
                            )}
                          </div>
                        </div>
                        <div className="d-flex align-items-center gap-1.5 ms-auto">
                          {isApplied ? (
                            <div className="d-flex align-items-center gap-1.5">
                              <span className="badge bg-success text-white small fw-bold px-2.5 py-1 rounded-pill" style={{ fontSize: '11px' }}>
                                Applied
                              </span>
                              <button
                                type="button"
                                onClick={handleRemovePromo}
                                className="btn btn-sm btn-link text-danger fw-bold text-decoration-none py-0 px-1"
                                style={{ fontSize: '11px' }}
                              >
                                Remove
                              </button>
                            </div>
                          ) : isEligible ? (
                            <button 
                              onClick={() => handleQuickApply(c.code)}
                              className="btn btn-sm btn-link text-danger fw-bold text-decoration-none py-0 px-2"
                              style={{ fontSize: '11px' }}
                            >
                              Apply
                            </button>
                          ) : (
                            <button 
                              disabled
                              className="btn btn-sm btn-link text-muted fw-normal text-decoration-none py-0 px-2 opacity-50"
                              style={{ fontSize: '11px', cursor: 'not-allowed' }}
                              title={`Requires minimum order subtotal of ${formatCurrency(minReq)}`}
                            >
                              Apply
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                        {!showAllCoupons && availableCoupons.length > 4 && (
                          <div className="text-center mt-1">
                            <button 
                              type="button"
                              onClick={() => setShowAllCoupons(true)}
                              className="btn btn-link text-decoration-none fw-bold small p-0 text-danger"
                              style={{ fontSize: '12px' }}
                            >
                              View All →
                            </button>
                          </div>
                        )}
                        {showAllCoupons && availableCoupons.length > 4 && (
                          <div className="text-center mt-1">
                            <button 
                              type="button"
                              onClick={() => setShowAllCoupons(false)}
                              className="btn btn-link text-decoration-none fw-bold small p-0 text-secondary"
                              style={{ fontSize: '12px' }}
                            >
                              Show Less ↑
                            </button>
                          </div>
                        )}
                      </>
                    );
                  })()}
                </div>
              </div>
            </div>
          </div>

          {/* Right Column: Invoice Details */}
          <div className="col-12 col-lg-4">
            {isCustomer && serverCart ? (
              <ServerBillSummary cart={serverCart}>
                <div className="d-flex flex-column gap-2 mt-3">
                  <button 
                    type="button"
                    onClick={handleCheckout} 
                    className="btn btn-danger w-100 rounded-pill fw-bold shadow-sm d-flex align-items-center justify-content-center p-0"
                    style={{ height: '44px', backgroundColor: 'var(--primary-color, #F20D2D)', borderColor: 'var(--primary-color, #F20D2D)', fontSize: '14px' }}
                  >
                    Proceed to Checkout
                  </button>
                  <button
                    type="button"
                    onClick={() => navigate('/customer/home')}
                    className="btn btn-outline-danger w-100 rounded-pill py-2.5 fw-bold bg-white"
                    style={{ height: '44px', fontSize: '14px', borderColor: 'var(--primary-color, #F20D2D)', color: 'var(--primary-color, #F20D2D)' }}
                  >
                    Save and Continue (Add More Items)
                  </button>
                </div>
              </ServerBillSummary>
            ) : (
            <div className="card rounded-3 border-0 shadow-sm p-3 p-sm-4 bg-white mb-4">
              <h5 className="fw-bold text-dark mb-1">Estimated Bill</h5>
              {!authLoading && !isCustomer && (
                <p className="text-secondary small border-bottom pb-2 mb-3">
                  The final bill, including the restaurant's tax and charges, is calculated at checkout after you sign in.
                </p>
              )}
              
              <div className="d-flex align-items-center justify-content-between mb-2">
                <span className="text-secondary small">Item Subtotal</span>
                <span className="fw-bold text-dark">{formatCurrency(getSubtotal())}</span>
              </div>
              
              {getExtraCharges() > 0 && (
                <div className="d-flex align-items-center justify-content-between mb-2 text-danger">
                  <span className="small">Extra Charges</span>
                  <span className="fw-bold">+{formatCurrency(getExtraCharges())}</span>
                </div>
              )}

              {getPackingCharge() > 0 && (
                <div className="d-flex align-items-center justify-content-between mb-2 text-dark">
                  <span className="small text-secondary">Packing Charges (Takeaway)</span>
                  <span className="fw-bold text-dark">+{formatCurrency(getPackingCharge())}</span>
                </div>
              )}
              
              {getItemDiscounts() > 0 && (
                <div className="d-flex align-items-center justify-content-between mb-2 text-success">
                  <span className="small">Menu Discounts</span>
                  <span className="fw-bold">-{formatCurrency(getItemDiscounts())}</span>
                </div>
              )}

              {getDiscount() > 0 && (
                <div className="d-flex align-items-center justify-content-between mb-2 text-success">
                  <span className="small">Voucher Discount</span>
                  <span className="fw-bold">-{formatCurrency(getDiscount())}</span>
                </div>
              )}

              {coupon && (
                <div className="d-flex align-items-center justify-content-between mb-2">
                  <span className="text-secondary small">Voucher Applied</span>
                  <span className="fw-bold text-success font-monospace">{coupon.code || coupon}</span>
                </div>
              )}
              
              <div className="d-flex align-items-center justify-content-between mb-2">
                <span className="text-secondary small">Estimated Tax</span>
                <span className="fw-bold text-dark">{formatCurrency(getTax())}</span>
              </div>
              
              <div className="d-flex align-items-center justify-content-between mb-2">
                <div className="d-flex align-items-center gap-1.5">
                  <span className="text-secondary small">Estimated Service Charge</span>
                </div>
                <span className={`fw-bold ${isServiceChargeRemoved ? 'text-muted text-decoration-line-through' : 'text-dark'}`}>
                  {isServiceChargeRemoved ? formatCurrency(0) : formatCurrency(getServiceCharge())}
                </span>
              </div>
              
              <div className="d-flex align-items-center justify-content-between my-3 pt-3 border-top fw-bold fs-5 text-dark">
                <span>Estimated Total</span>
                <span className="text-danger fw-bold fs-4">{formatCurrency(getGrandTotal())}</span>
              </div>

              <div className="d-grid gap-2">
                <Button onClick={handleCheckout} variant="primary" className="fw-bold shadow-sm d-flex align-items-center justify-content-center p-0" style={{ height: '44px', fontSize: '14px' }}>
                  Proceed to Checkout
                </Button>
                <Button 
                  onClick={() => navigate('/customer/home')} 
                  variant="outline-primary" 
                  className="py-2.5 fw-bold border-danger text-danger bg-white" style={{ height: '44px', fontSize: '14px' }}
                >
                  Save and Continue (Add More Items)
                </Button>
              </div>
            </div>
            )}
          </div>
        </div>
      </main>
    </CustomerLayout>
  );
};

export default Cart;
