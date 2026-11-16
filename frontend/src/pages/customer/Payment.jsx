import React, { useEffect, useRef, useState } from 'react';
import { useNavigate, useLocation, useSearchParams } from 'react-router-dom';
import { FiCreditCard, FiSmartphone, FiCheckCircle, FiX, FiCopy } from 'react-icons/fi';
import CustomerLayout from '../../components/layout/CustomerLayout';
import ServerBillSummary from '../../components/customer/ServerBillSummary';
import { useCart } from '../../hooks/useCart';
import { useAuth } from '../../hooks/useAuth';
import BackButton from '../../components/common/BackButton';
import CheckoutStepper from '../../components/customer/CheckoutStepper';
import {
  applyOrderContext,
  payOrderOnline,
  validateCheckout,
  fetchCustomerOrder,
  fetchCustomerBillPreview,
  startRazorpayStandardCheckout,
  verifyRazorpayPayment
} from '../../services/customerCheckout';
import { TAKEAWAY, getOrderType, normalizeOrderType } from '../../utils/orderContext';
import formatCurrency from '../../utils/formatCurrency';
import api from '../../services/api';

// Indian Rupee currency icon replacing dollar sign for Pay at Counter
const RupeeIcon = ({ size = 20, className = "" }) => (
  <span
    className={className}
    style={{
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontSize: `${size}px`,
      fontWeight: 'bold',
      lineHeight: 1,
      fontFamily: 'system-ui, -apple-system, sans-serif'
    }}
  >
    ₹
  </span>
);

const METHOD_INFO = {
  RAZORPAY_UPI: { 
    icon: FiSmartphone, 
    title: 'Razorpay UPI', 
    hint: 'Google Pay, PhonePe, Paytm, BHIM & UPI QR',
    badge: 'Fast & Secure'
  },
  RAZORPAY_CARD: { 
    icon: FiCreditCard, 
    title: 'Razorpay Card', 
    hint: 'Visa, Mastercard, RuPay, Amex',
    badge: null
  },
  COUNTER: { 
    icon: RupeeIcon, 
    title: 'Pay at Counter', 
    hint: 'Pay at the restaurant (Staff approval required)',
    badge: null
  },
};

export const Payment = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const existingOrderId = searchParams.get('order') || location.state?.orderId;
  const { submitOrder } = useCart();
  const { user } = useAuth();

  const [existingOrder, setExistingOrder] = useState(null);
  const [existingBillPreview, setExistingBillPreview] = useState(null);
  const [isOrderPaid, setIsOrderPaid] = useState(false);
  const [cartReview, setCartReview] = useState(null);
  const [preparing, setPreparing] = useState(true);
  const [paymentMethod, setPaymentMethod] = useState('RAZORPAY_UPI');
  const [cardEnabled, setCardEnabled] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const submitted = useRef(false);

  const fallbackOrderType = normalizeOrderType(location.state?.orderType) || getOrderType();
  const effectiveOrderType = existingOrder
    ? normalizeOrderType(existingOrder.order_type || existingOrder.orderType)
    : fallbackOrderType;

  useEffect(() => {
    let active = true;
    api.get('/public/settings/')
      .then(res => {
        if (active && res.data) {
          setCardEnabled(res.data.card_enabled !== false);
        }
      })
      .catch(() => {});
    (async () => {
      setPreparing(true);
      setError('');
      if (existingOrderId) {
        // Mode A: Paying for an existing placed order
        try {
          const ord = await fetchCustomerOrder(existingOrderId);
          if (!active) return;
          setExistingOrder(ord);
          const paySt = String(ord.payment_status || ord.paymentStatus || '').toUpperCase();
          if (paySt === 'PAID') {
            setIsOrderPaid(true);
          }
          try {
            const preview = await fetchCustomerBillPreview(existingOrderId);
            if (active && preview) {
              setExistingBillPreview(preview);
            }
          } catch (e) {
            console.warn('Could not load bill preview for existing order:', e);
          }
        } catch (err) {
          if (active) setError(err.message || 'Could not load existing order.');
        } finally {
          if (active) setPreparing(false);
        }
      } else {
        // Mode B: Standard cart checkout
        if (!fallbackOrderType) {
          navigate('/customer/checkout', { replace: true });
          return;
        }
        try {
          await applyOrderContext(fallbackOrderType);
          const data = await validateCheckout();
          if (active) setCartReview(data);
        } catch (err) {
          if (active) {
            setError(err.message);
            setCartReview(err.cart ? { cart: err.cart, payment_methods: [] } : null);
          }
        } finally {
          if (active) setPreparing(false);
        }
      }
    })();
    return () => { active = false; };
  }, [existingOrderId, fallbackOrderType, navigate]);

  const methods = cardEnabled ? ['RAZORPAY_UPI', 'RAZORPAY_CARD', 'COUNTER'] : ['RAZORPAY_UPI', 'COUNTER'];

  // Calculate pricing & total amount depending on Mode A or Mode B
  let pricing = null;
  let items = [];
  let tableInfo = null;

  if (existingOrderId && (existingBillPreview || existingOrder)) {
    const src = existingBillPreview || existingOrder;
    items = existingBillPreview?.items || existingOrder?.items || [];
    const isTakeaway = effectiveOrderType === TAKEAWAY;
    const itemsSubtotal = Number(src.items_subtotal ?? items.reduce((s, i) => s + Number(i.line_total || 0), 0));
    const addOns = Number(src.customization_total || 0);
    const dishDiscount = Number(src.dish_discount_total || 0);
    const couponDiscount = Number(src.coupon_discount_total || 0);
    const takeawayCharge = isTakeaway ? Number(src.takeaway_charge || (items.reduce((sum, item) => sum + Number(item.quantity || 1), 0) * 10)) : 0;
    const taxable = Number(src.taxable_amount ?? (itemsSubtotal + addOns - dishDiscount - couponDiscount + takeawayCharge));
    const gstRate = Number(src.gst_rate ?? 5);
    const gstAmount = Number(src.gst_amount ?? Math.round((taxable * (gstRate / 100)) * 100) / 100);
    const serviceCharge = Number(src.service_charge_amount || 0);
    const totalAmountNum = Number(src.total_amount || src.total || (taxable + gstAmount + serviceCharge));
    const roundOff = Number(src.round_off || 0);

    pricing = {
      items_subtotal: itemsSubtotal,
      customization_total: addOns,
      dish_discount_total: dishDiscount,
      coupon_discount_total: couponDiscount,
      takeaway_charge: takeawayCharge,
      taxable_amount: taxable,
      gst_rate: gstRate,
      gst_amount: gstAmount,
      service_charge_amount: serviceCharge,
      service_charge_rate: src.service_charge_rate || 0,
      round_off: roundOff,
      total_amount: totalAmountNum,
    };
    tableInfo = existingOrder?.table || (existingBillPreview?.table_label ? { table_number: existingBillPreview.table_label } : null);
  } else if (cartReview?.cart?.pricing) {
    pricing = cartReview.cart.pricing;
    items = cartReview.cart.items || [];
    tableInfo = cartReview.cart.table;
  }

  const totalAmount = pricing?.total_amount || 0;

  const handleProceedClick = (e) => {
    if (e && e.preventDefault) e.preventDefault();
    if (loading || submitted.current || isOrderPaid) return;
    handlePaySubmit();
  };

  const handlePaySubmit = async (e) => {
    if (e && e.preventDefault) e.preventDefault();
    if (loading || submitted.current || isOrderPaid) return;
    submitted.current = true;
    setLoading(true);
    setError('');

    // Case 1: Mode A - Paying for an existing pre-placed order
    if (existingOrderId) {
      if (paymentMethod === 'COUNTER') {
        navigate(`/customer/order-confirmation?order=${existingOrderId}`, {
          replace: true,
          state: { orderId: existingOrderId, paymentResult: { status: 'PENDING', method: 'COUNTER' } },
        });
        return;
      }

      let paymentResult = null;
      try {
        paymentResult = await payOrderOnline(existingOrder, paymentMethod, user);
      } catch (err) {
        paymentResult = { status: 'FAILED', message: err.message };
      }

      setLoading(false);
      submitted.current = false;

      if (paymentResult?.status === 'PAID') {
        setIsOrderPaid(true);
        navigate(`/customer/order-confirmation?order=${existingOrderId}`, {
          replace: true,
          state: { orderId: existingOrderId, paymentResult },
        });
      } else {
        setError(paymentResult?.message || 'Payment could not be completed. Please try again.');
      }
      return;
    }

    // Case 2: Mode B - Checkout from Cart with Pay at Counter
    if (paymentMethod === 'COUNTER') {
      let order = null;
      try {
        order = await submitOrder('COUNTER', effectiveOrderType);
      } catch (err) {
        console.error('Order placement error:', err);
        setError(`Order Placement Failed: ${err.message}`);
        setLoading(false);
        submitted.current = false;
        return;
      }
      navigate(`/customer/order-confirmation?order=${order.id}`, {
        replace: true,
        state: { orderId: order.id, paymentResult: { status: 'PENDING', method: 'COUNTER' } },
      });
      return;
    }

    // Case 3: Mode B - Checkout from Cart with Online Payment (RAZORPAY_UPI / RAZORPAY_CARD)
    // DO NOT clear cart or create order before payment verification!
    const totalPaise = Math.round(Number(totalAmount) * 100);
    if (totalPaise < 100) {
      setError('Order amount must be at least ₹1.00 for online payment.');
      setLoading(false);
      submitted.current = false;
      return;
    }

    let paymentResult = null;
    try {
      paymentResult = await startRazorpayStandardCheckout({
        amount: totalPaise,
        currency: 'INR',
        paymentMethod,
        customer: user,
      });
    } catch (err) {
      paymentResult = { status: 'FAILED', message: err.message };
    }

    if (paymentResult?.status !== 'PAID') {
      // Payment was cancelled or failed:
      // Cart remains 100% intact! No order is created!
      setLoading(false);
      submitted.current = false;
      setError(paymentResult?.message || 'Payment could not be completed. Please try again.');
      return;
    }

    // Payment Verified via Razorpay signature!
    // Now create the customer order, link verified payment, clear cart, and navigate to confirmation.
    let placedOrder = null;
    try {
      placedOrder = await submitOrder(paymentMethod, effectiveOrderType);
    } catch (err) {
      console.error('Order creation error after payment:', err);
      setError(`Payment succeeded (ID: ${paymentResult.paymentId}), but creating order encountered an issue: ${err.message}. Please contact restaurant staff.`);
      setLoading(false);
      submitted.current = false;
      return;
    }

    // Link payment with newly placed order in backend
    try {
      await verifyRazorpayPayment({
        razorpay_order_id: paymentResult.razorpay_order_id,
        razorpay_payment_id: paymentResult.razorpay_payment_id,
        razorpay_signature: paymentResult.razorpay_signature,
        order_id: placedOrder.id,
        payment_method: paymentMethod,
      });
    } catch (e) {
      console.warn('Could not link payment to order in verify endpoint:', e);
    }

    setLoading(false);
    submitted.current = false;
    setIsOrderPaid(true);
    navigate(`/customer/order-confirmation?order=${placedOrder.id}`, {
      replace: true,
      state: { orderId: placedOrder.id, paymentResult },
    });
  };

  const syntheticCart = {
    order_type: effectiveOrderType,
    items,
    pricing,
    table: tableInfo,
  };

  return (
    <CustomerLayout>
      <main className="pt-2 text-start">
        {/* 4-Step Checkout Stepper (Step 3: Payment active) */}
        <CheckoutStepper currentStep={3} />

        <div className="d-flex align-items-center gap-3 mb-4">
          <BackButton />
          <h4 className="fw-bold text-dark mb-0">Select Payment</h4>
        </div>

        {isOrderPaid ? (
          <div className="card border-0 shadow-sm p-4 bg-white text-center mx-auto my-4" style={{ maxWidth: '540px', borderRadius: '18px' }}>
            <div className="text-success mb-3">
              <FiCheckCircle size={52} />
            </div>
            <h4 className="fw-bold text-dark mb-2">Order Already Paid</h4>
            <p className="text-secondary small mb-4">
              This order #{existingOrder?.display_order_number || existingOrder?.id || existingOrderId} has already been settled.
            </p>
            <div className="d-flex align-items-center justify-content-center gap-2">
              <button
                type="button"
                onClick={() => navigate(`/customer/order-tracking/${existingOrderId}`)}
                className="btn btn-danger rounded-pill px-4 py-2 fw-bold"
              >
                Track Order
              </button>
              <button
                type="button"
                onClick={() => navigate('/customer/home')}
                className="btn btn-outline-secondary rounded-pill px-4 py-2 fw-bold"
              >
                Back to Menu
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleProceedClick}>
            <div className="row g-4">
              
              {/* Left Column: Select Payment Method Card */}
              <div className="col-12 col-lg-8">
                <div 
                  className="card border-0 shadow-sm p-4 bg-white"
                  style={{ borderRadius: '18px', border: '1px solid #E2E8F0' }}
                >
                  <h5 className="fw-bold text-dark mb-1" style={{ fontSize: '18px' }}>
                    Select Payment Method
                  </h5>
                  <p className="text-secondary small mb-4" style={{ fontSize: '12.5px', color: '#64748B' }}>
                    {effectiveOrderType === TAKEAWAY ? 'Takeaway order' : `Table Dine-In${tableInfo ? ` · Table ${tableInfo.table_number || tableInfo.label || ''}` : ''}`}
                    {existingOrderId && ` · Order #${existingOrder?.display_order_number || existingOrder?.id || existingOrderId}`}
                  </p>

                  {preparing && <p className="text-secondary small">Loading order details…</p>}

                  <div className="d-flex flex-column gap-3 mb-2">
                    {methods.map((code) => {
                      const info = METHOD_INFO[code];
                      const Icon = info.icon;
                      const selected = paymentMethod === code;

                      return (
                        <div
                          key={code}
                          onClick={() => { if (!loading) { setPaymentMethod(code); setError(''); } }}
                          className="p-3.5 rounded-4 d-flex align-items-center justify-content-between transition-all shadow-xs cursor-pointer"
                          style={{
                            cursor: loading ? 'not-allowed' : 'pointer',
                            border: `2px solid ${selected ? '#F20D2D' : '#E2E8F0'}`,
                            backgroundColor: selected ? '#FFF5F5' : '#FFFFFF'
                          }}
                        >
                          <div className="d-flex align-items-center gap-3">
                            <div 
                              className="rounded-3 d-flex align-items-center justify-content-center flex-shrink-0"
                              style={{
                                width: '46px',
                                height: '46px',
                                backgroundColor: selected ? '#FFE4E6' : '#F1F5F9',
                                color: '#F20D2D'
                              }}
                            >
                              <Icon size={22} />
                            </div>
                            <div>
                              <div className="fw-bold text-dark fs-6 d-flex align-items-center gap-2">
                                <span>{info.title}</span>
                                {info.badge && (
                                  <span className="badge bg-success-subtle text-success border border-success-subtle rounded-pill px-2 py-0.5" style={{ fontSize: '10px' }}>
                                    {info.badge}
                                  </span>
                                )}
                              </div>
                              <span className="text-secondary small d-block mt-0.5" style={{ fontSize: '12px', color: '#64748B' }}>
                                {info.hint}
                              </span>
                            </div>
                          </div>

                          {selected ? (
                            <div className="text-danger ps-2">
                              <FiCheckCircle size={22} style={{ fill: '#F20D2D', color: '#FFFFFF' }} />
                            </div>
                          ) : (
                            <div 
                              className="rounded-circle border"
                              style={{ width: '20px', height: '20px', borderColor: '#CBD5E1' }}
                            />
                          )}
                        </div>
                      );
                    })}
                  </div>

                  {error && (
                    <div className="alert alert-danger small py-2 mt-3 mb-0" role="alert">
                      {error}
                    </div>
                  )}
                </div>
              </div>

              {/* Right Column: Order Summary Card & Pay Button */}
              <div className="col-12 col-lg-4">
                <ServerBillSummary cart={syntheticCart}>
                  <div className="d-grid gap-2 mt-3">
                    <button
                      type="submit"
                      data-testid="place-order"
                      disabled={loading || !pricing}
                      className="btn btn-danger py-3 fw-bold shadow-sm d-flex align-items-center justify-content-center gap-2"
                      style={{
                        height: '48px',
                        borderRadius: '12px',
                        backgroundColor: '#F20D2D',
                        borderColor: '#F20D2D',
                        fontSize: '15px',
                        boxShadow: '0 4px 14px rgba(242, 13, 45, 0.25)'
                      }}
                    >
                      {loading ? (
                        <>
                          <span className="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span>
                          <span>Processing...</span>
                        </>
                      ) : (
                        paymentMethod === 'COUNTER' 
                          ? `Place Order · ${formatCurrency(totalAmount)}` 
                          : `Pay with Razorpay · ${formatCurrency(totalAmount)}`
                      )}
                    </button>
                  </div>
                </ServerBillSummary>
              </div>

            </div>
          </form>
        )}
      </main>
    </CustomerLayout>
  );
};

export default Payment;
