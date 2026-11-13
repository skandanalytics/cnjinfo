import React, { useState, useEffect, useRef } from 'react';
import { 
  FiX, 
  FiSmartphone, 
  FiCreditCard, 
  FiDollarSign, 
  FiCheckCircle, 
  FiAlertCircle, 
  FiClock, 
  FiUser, 
  FiPhone, 
  FiMapPin, 
  FiTag,
  FiRefreshCw
} from 'react-icons/fi';
import formatCurrency from '../../utils/formatCurrency';
import api from '../../config/api';
import { 
  startRazorpayStandardCheckout, 
  checkOrderPaymentStatus 
} from '../../services/customerCheckout';

/**
 * Modernized Two-Section Payment Modal for POS and Admin/Employee Billing.
 *
 * Left Section:
 *  - Customer Details (Name, Phone, Branch, Table/Takeaway, Order Type)
 *  - Order Items with customization / special instructions
 *  - Price Breakdown: Subtotal, Customizations, Dish Discount, Coupon Discount with Name, Taxable, GST, Service Charge, Total Payable
 *
 * Right Section (Razorpay Standard Integration):
 *  - Methods:
 *      * UPI: Dynamic Razorpay UPI session & QR, auto-verification, zero static/manual IDs
 *      * Cash: Collect physical cash and record as CASH
 *      * Card: Razorpay Card Checkout (Visa, Mastercard, RuPay, Amex)
 */
export const PaymentModal = ({
  isOpen,
  onClose,
  orderDetails,
  onConfirmPayment,
  loading = false,
  error = '',
  isStaff = false,
}) => {
  const [selectedMethod, setSelectedMethod] = useState('UPI');
  const [cardEnabled, setCardEnabled] = useState(true);
  const [paymentState, setPaymentState] = useState('IDLE'); // IDLE | PROCESSING | PAID | FAILED
  const [paymentMessage, setPaymentMessage] = useState('');
  const [localError, setLocalError] = useState('');
  const pollTimerRef = useRef(null);

  useEffect(() => {
    let active = true;
    api.get('/public/settings/')
      .then(res => {
        if (active && res.data) {
          setCardEnabled(res.data.card_enabled !== false);
        }
      })
      .catch(() => {
        if (isStaff) {
          import('../../services/staffClient')
            .then(({ staffJson }) => staffJson('/settings/'))
            .then(data => {
              if (active && data) setCardEnabled(data.card_enabled !== false);
            })
            .catch(() => {});
        }
      });
    return () => { active = false; };
  }, [isStaff]);

  // Clean up polling timer on unmount or close
  useEffect(() => {
    return () => {
      if (pollTimerRef.current) clearInterval(pollTimerRef.current);
    };
  }, []);

  if (!isOpen || !orderDetails) return null;

  const {
    orderId,
    customerName,
    customerPhone,
    branchName,
    tableLabel,
    orderType = 'DINE_IN',
    items = [],
    pricing = {},
    couponCode = '',
    couponDiscount = 0,
  } = orderDetails;

  const subtotal = Number(pricing.items_subtotal ?? pricing.subtotal ?? 0);
  const customizationTotal = Number(pricing.customization_total ?? 0);
  const dishDiscount = Number(pricing.dish_discount_total ?? pricing.discount ?? 0);
  const effectiveCouponDiscount = Number(couponDiscount || pricing.coupon_discount_total || 0);
  const takeawayCharge = Number(pricing.takeaway_charge ?? 0);
  const taxableAmount = Number(pricing.taxable_amount ?? (subtotal + customizationTotal - dishDiscount - effectiveCouponDiscount + takeawayCharge));
  const gstAmount = Number(pricing.gst_amount ?? pricing.tax ?? 0);
  const gstRate = Number(pricing.gst_rate ?? 5);
  const serviceChargeAmount = Number(pricing.service_charge_amount ?? 0);
  const grandTotal = Number(pricing.total_amount ?? pricing.grandTotal ?? pricing.total ?? 0);

  const isTakeaway = orderType === 'TAKEAWAY' || orderType === 'Takeaway';

  // Real-time polling if order is already saved in backend
  const startStatusPolling = (targetOrderId) => {
    if (!targetOrderId) return;
    if (pollTimerRef.current) clearInterval(pollTimerRef.current);

    pollTimerRef.current = setInterval(async () => {
      try {
        const res = await checkOrderPaymentStatus(targetOrderId);
        if (res && res.is_paid) {
          if (pollTimerRef.current) clearInterval(pollTimerRef.current);
          setPaymentState('PAID');
          setPaymentMessage('Payment successfully received & verified!');
          setTimeout(() => {
            if (onConfirmPayment) {
              onConfirmPayment('RAZORPAY_UPI', { status: 'PAID' });
            }
          }, 1200);
        }
      } catch (e) {
        /* ignore polling errors */
      }
    }, 2500);
  };

  // Launch Razorpay UPI Checkout flow
  const handleLaunchRazorpayUpi = async () => {
    setLocalError('');
    setPaymentState('PROCESSING');
    setPaymentMessage('Launching Razorpay UPI session...');

    const amountInPaise = Math.round(grandTotal * 100);
    if (amountInPaise < 100) {
      setLocalError('Amount must be at least ₹1.00 for online checkout.');
      setPaymentState('IDLE');
      return;
    }

    if (orderId) {
      startStatusPolling(orderId);
    }

    try {
      const res = await startRazorpayStandardCheckout({
        amount: amountInPaise,
        currency: 'INR',
        orderId: orderId || null,
        orderNumber: orderDetails.orderNumber || orderId || null,
        notes: {
          customer_name: customerName || '',
          customer_phone: customerPhone || '',
          branch: branchName || '',
        },
        paymentMethod: 'RAZORPAY_UPI',
        customer: {
          name: customerName,
          phone: customerPhone,
        },
        onSuccess: (result) => {
          if (pollTimerRef.current) clearInterval(pollTimerRef.current);
          setPaymentState('PAID');
          setPaymentMessage('✓ Payment verified via Razorpay UPI!');
          setTimeout(() => {
            if (onConfirmPayment) {
              onConfirmPayment('RAZORPAY_UPI', result);
            }
          }, 1000);
        },
        onFailure: (result) => {
          setPaymentState('FAILED');
          setLocalError(result.message || 'UPI Payment was not completed.');
        },
        onDismiss: () => {
          if (paymentState !== 'PAID') {
            setPaymentState('IDLE');
          }
        },
      });

      if (res?.status === 'PAID') {
        if (pollTimerRef.current) clearInterval(pollTimerRef.current);
        setPaymentState('PAID');
        setPaymentMessage('✓ Payment verified via Razorpay UPI!');
        setTimeout(() => {
          if (onConfirmPayment) {
            onConfirmPayment('RAZORPAY_UPI', res);
          }
        }, 1000);
      }
    } catch (err) {
      setPaymentState('FAILED');
      setLocalError(err.message || 'Could not initiate Razorpay UPI checkout.');
    }
  };

  // Launch Razorpay Card Checkout flow
  const handleLaunchRazorpayCard = async () => {
    setLocalError('');
    setPaymentState('PROCESSING');
    setPaymentMessage('Launching Razorpay Card checkout...');

    const amountInPaise = Math.round(grandTotal * 100);
    if (amountInPaise < 100) {
      setLocalError('Amount must be at least ₹1.00 for card checkout.');
      setPaymentState('IDLE');
      return;
    }

    try {
      const res = await startRazorpayStandardCheckout({
        amount: amountInPaise,
        currency: 'INR',
        orderId: orderId || null,
        orderNumber: orderDetails.orderNumber || orderId || null,
        notes: {
          customer_name: customerName || '',
          customer_phone: customerPhone || '',
          branch: branchName || '',
        },
        paymentMethod: 'RAZORPAY_CARD',
        customer: {
          name: customerName,
          phone: customerPhone,
        },
        onSuccess: (result) => {
          setPaymentState('PAID');
          setPaymentMessage('✓ Card payment verified successfully!');
          setTimeout(() => {
            if (onConfirmPayment) {
              onConfirmPayment('RAZORPAY_CARD', result);
            }
          }, 1000);
        },
        onFailure: (result) => {
          setPaymentState('FAILED');
          setLocalError(result.message || 'Card payment failed.');
        },
        onDismiss: () => {
          if (paymentState !== 'PAID') {
            setPaymentState('IDLE');
          }
        },
      });

      if (res?.status === 'PAID') {
        setPaymentState('PAID');
        setPaymentMessage('✓ Card payment verified successfully!');
        setTimeout(() => {
          if (onConfirmPayment) {
            onConfirmPayment('RAZORPAY_CARD', res);
          }
        }, 1000);
      }
    } catch (err) {
      setPaymentState('FAILED');
      setLocalError(err.message || 'Could not initiate Razorpay Card checkout.');
    }
  };

  // Confirm cash payment
  const handleConfirmCash = () => {
    if (onConfirmPayment) {
      onConfirmPayment('CASH');
    }
  };

  return (
    <div 
      className="modal fade show d-block" 
      style={{ backgroundColor: 'rgba(15, 23, 42, 0.65)', backdropFilter: 'blur(3px)', zIndex: 1060 }}
      tabIndex="-1"
    >
      <div className="modal-dialog modal-dialog-centered modal-xl" style={{ maxWidth: '960px' }}>
        <div 
          className="modal-content rounded-4 border-0 shadow-2xl overflow-hidden" 
          style={{ backgroundColor: '#FFFFFF' }}
        >
          {/* Modal Header */}
          <div className="modal-header px-4 py-3 border-bottom d-flex align-items-center justify-content-between" style={{ backgroundColor: '#F8FAFC' }}>
            <div className="d-flex align-items-center gap-2">
              <span className="badge rounded-pill bg-danger-subtle text-danger fw-bold px-2.5 py-1" style={{ fontSize: '11px' }}>
                PAYMENT CHECKOUT
              </span>
              <h5 className="modal-title fw-bold text-dark mb-0 fs-6">
                Complete Your Order Payment
              </h5>
            </div>
            <button 
              type="button" 
              className="btn-close shadow-none" 
              onClick={onClose} 
              disabled={loading || paymentState === 'PROCESSING'}
              aria-label="Close" 
            />
          </div>

          {/* Modal Body: Two Column Section */}
          <div className="modal-body p-0">
            <div className="row g-0">

              {/* LEFT COLUMN: Customer & Order Breakdown */}
              <div className="col-12 col-lg-7 p-4 border-end" style={{ backgroundColor: '#FFFFFF' }}>
                {/* Customer Details Pill Card */}
                <div className="p-3 rounded-3 mb-3 border bg-light-subtle">
                  <div className="d-flex align-items-center justify-content-between mb-2 pb-2 border-bottom">
                    <div className="d-flex align-items-center gap-2">
                      <div className="rounded-circle bg-danger-subtle text-danger p-1.5 d-flex align-items-center justify-content-center" style={{ width: '28px', height: '28px' }}>
                        <FiUser size={14} />
                      </div>
                      <span className="fw-bold text-dark" style={{ fontSize: '13.5px' }}>
                        {customerName || 'Walk-in Customer'}
                      </span>
                    </div>
                    {customerPhone && (
                      <span className="text-secondary small d-flex align-items-center gap-1" style={{ fontSize: '12px' }}>
                        <FiPhone size={12} /> {customerPhone}
                      </span>
                    )}
                  </div>

                  <div className="d-flex align-items-center justify-content-between small text-secondary" style={{ fontSize: '12px' }}>
                    <span className="d-flex align-items-center gap-1">
                      <FiMapPin size={12} className="text-danger" /> {branchName || 'Main Branch'}
                    </span>
                    <span className="badge bg-secondary-subtle text-dark border px-2 py-0.5 rounded-pill">
                      {isTakeaway ? '🥡 Takeaway' : `🪑 ${tableLabel ? `Table ${tableLabel}` : 'Dine In'}`}
                    </span>
                  </div>
                </div>

                {/* Items List (Scrollable) */}
                <h6 className="fw-bold text-dark small mb-2 text-uppercase text-muted" style={{ letterSpacing: '0.5px', fontSize: '11px' }}>
                  Ordered Items ({items.length})
                </h6>
                <div 
                  className="rounded-3 border mb-3 p-2 bg-white"
                  style={{ maxHeight: '160px', overflowY: 'auto' }}
                >
                  {items.length === 0 ? (
                    <div className="text-center text-muted small py-3">No items in order</div>
                  ) : (
                    items.map((item, idx) => {
                      const dishName = item.dish?.name || item.name || `Item ${idx + 1}`;
                      const qty = item.quantity || 1;
                      const lineTotal = item.line_total || ((Number(item.dish?.price || item.price || 0)) * qty);
                      const options = item.options || [];
                      const note = item.specialInstructions || item.special_instructions || '';

                      return (
                        <div key={idx} className="d-flex justify-content-between align-items-start py-1.5 px-2 border-bottom last:border-bottom-0" style={{ fontSize: '12.5px' }}>
                          <div className="flex-grow-1 pe-2">
                            <div className="fw-semibold text-dark">
                              <span className="text-danger fw-bold me-1.5">{qty}×</span>
                              {dishName}
                            </div>
                            {options.length > 0 && (
                              <div className="text-muted small" style={{ fontSize: '11px' }}>
                                + {options.map(o => o.name || o).join(', ')}
                              </div>
                            )}
                            {note && (
                              <div className="text-secondary fst-italic small" style={{ fontSize: '11px' }}>
                                "{note}"
                              </div>
                            )}
                          </div>
                          <span className="fw-semibold text-dark flex-shrink-0">
                            {formatCurrency(lineTotal)}
                          </span>
                        </div>
                      );
                    })
                  )}
                </div>

                {/* Price Breakdown */}
                <div className="p-3 rounded-3 border bg-light-subtle" style={{ fontSize: '12.5px' }}>
                  <div className="d-flex justify-content-between text-secondary mb-1">
                    <span>Items Subtotal</span>
                    <span className="fw-medium text-dark">{formatCurrency(subtotal)}</span>
                  </div>

                  {customizationTotal > 0 && (
                    <div className="d-flex justify-content-between text-secondary mb-1">
                      <span>Add-ons / Customizations</span>
                      <span className="fw-medium text-dark">+{formatCurrency(customizationTotal)}</span>
                    </div>
                  )}

                  {dishDiscount > 0 && (
                    <div className="d-flex justify-content-between text-success mb-1">
                      <span>Dish Discounts</span>
                      <span className="fw-medium">-{formatCurrency(dishDiscount)}</span>
                    </div>
                  )}

                  {effectiveCouponDiscount > 0 && (
                    <div className="d-flex justify-content-between text-success mb-1">
                      <span className="d-flex align-items-center gap-1">
                        <FiTag size={12} /> Coupon {couponCode && <code className="text-success fw-bold bg-success-subtle px-1 rounded">{couponCode}</code>}
                      </span>
                      <span className="fw-medium">-{formatCurrency(effectiveCouponDiscount)}</span>
                    </div>
                  )}

                  {isTakeaway && takeawayCharge > 0 && (
                    <div className="d-flex justify-content-between text-secondary mb-1">
                      <span>Takeaway Packaging</span>
                      <span className="fw-medium text-dark">+{formatCurrency(takeawayCharge)}</span>
                    </div>
                  )}

                  <div className="d-flex justify-content-between text-secondary mb-1 pt-1 border-top">
                    <span>Taxable Amount</span>
                    <span className="fw-medium text-dark">{formatCurrency(taxableAmount)}</span>
                  </div>

                  <div className="d-flex justify-content-between text-secondary mb-1">
                    <span>GST ({gstRate}%)</span>
                    <span className="fw-medium text-dark">+{formatCurrency(gstAmount)}</span>
                  </div>

                  {serviceChargeAmount > 0 && (
                    <div className="d-flex justify-content-between text-secondary mb-1">
                      <span>Service Charge</span>
                      <span className="fw-medium text-dark">+{formatCurrency(serviceChargeAmount)}</span>
                    </div>
                  )}

                  <div className="d-flex justify-content-between align-items-center pt-2 mt-1 border-top fw-bold text-dark fs-6">
                    <span>Total Amount Payable</span>
                    <span className="text-danger fs-5">{formatCurrency(grandTotal)}</span>
                  </div>
                </div>
              </div>

              {/* RIGHT COLUMN: Modern Razorpay Payment Selection */}
              <div className="col-12 col-lg-5 p-4 d-flex flex-column justify-content-between" style={{ backgroundColor: '#FAFAFA' }}>
                <div>
                  <h6 className="fw-bold text-dark small mb-3 text-uppercase text-muted" style={{ letterSpacing: '0.5px', fontSize: '11px' }}>
                    Select Payment Method
                  </h6>

                  {/* Payment Method Tabs */}
                  <div className="d-flex gap-2 mb-4">
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedMethod('UPI');
                        setLocalError('');
                        handleLaunchRazorpayUpi();
                      }}
                      className={`btn flex-fill py-2.5 px-3 rounded-3 d-flex align-items-center justify-content-center gap-2 fw-semibold transition-all ${
                        selectedMethod === 'UPI' 
                          ? 'btn-danger text-white shadow-xs' 
                          : 'btn-outline-secondary bg-light text-dark border'
                      }`}
                      style={{ fontSize: '13px' }}
                    >
                      <FiSmartphone size={16} /> Razorpay UPI
                    </button>

                    <button
                      type="button"
                      onClick={() => { setSelectedMethod('COUNTER'); setLocalError(''); }}
                      className={`btn flex-fill py-2.5 px-3 rounded-3 d-flex align-items-center justify-content-center gap-2 fw-semibold transition-all ${
                        selectedMethod === 'COUNTER' 
                          ? 'btn-danger text-white shadow-xs' 
                          : 'btn-outline-secondary bg-light text-dark border'
                      }`}
                      style={{ fontSize: '13px' }}
                    >
                      <FiDollarSign size={16} /> Cash
                    </button>

                    {cardEnabled && (
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedMethod('CARD');
                          setLocalError('');
                          handleLaunchRazorpayCard();
                        }}
                        className={`btn flex-fill py-2.5 px-3 rounded-3 d-flex align-items-center justify-content-center gap-2 fw-semibold transition-all ${
                          selectedMethod === 'CARD' 
                            ? 'btn-danger text-white shadow-xs' 
                            : 'btn-outline-secondary bg-light text-dark border'
                        }`}
                        style={{ fontSize: '13px' }}
                      >
                        <FiCreditCard size={16} /> Card
                      </button>
                    )}
                  </div>

                  {/* Method View Container */}
                  <div style={{ minHeight: '320px' }} className="d-flex flex-column justify-content-center">
                    
                    {/* Method View: Modern Razorpay UPI Flow */}
                    {selectedMethod === 'UPI' && (
                      <div className="text-center p-4 rounded-3 border bg-white h-100 d-flex flex-column justify-content-center align-items-center shadow-xs">
                        <div className="mb-2">
                          <span className="badge bg-success-subtle text-success border border-success-subtle rounded-pill px-2.5 py-1 fw-bold" style={{ fontSize: '11px' }}>
                            ⚡ Razorpay Dynamic UPI QR
                          </span>
                        </div>

                        <div className="my-2">
                          <span className="text-secondary small d-block mb-1">Payable Total</span>
                          <span className="fw-bold fs-3 text-danger">{formatCurrency(grandTotal)}</span>
                        </div>

                        {paymentState === 'PAID' ? (
                          <div className="p-3 bg-success-subtle border border-success-subtle text-success rounded-3 w-100 my-2">
                            <FiCheckCircle size={32} className="mb-2 d-block mx-auto" />
                            <div className="fw-bold fs-6">Payment Verified Successfully!</div>
                            <small className="text-secondary">Order is marked as Paid.</small>
                          </div>
                        ) : paymentState === 'PROCESSING' ? (
                          <div className="p-3 bg-light rounded-3 border w-100 my-2 text-center">
                            <span className="spinner-border spinner-border-sm text-danger mb-2" role="status" />
                            <div className="fw-bold text-dark small">{paymentMessage || 'Waiting for customer payment...'}</div>
                            <small className="text-secondary d-block mt-1">Listening for instant confirmation...</small>
                          </div>
                        ) : (
                          <div className="my-2 w-100">
                            <p className="text-secondary small mb-3" style={{ fontSize: '12px' }}>
                              Supports <strong>Google Pay, PhonePe, Paytm, BHIM & Dynamic UPI QR</strong>. Automatically generates an order session and auto-verifies upon payment.
                            </p>
                            <button
                              type="button"
                              onClick={handleLaunchRazorpayUpi}
                              disabled={loading || grandTotal <= 0}
                              className="btn btn-danger w-100 py-2.5 rounded-pill fw-bold shadow-sm d-flex align-items-center justify-content-center gap-2"
                              style={{ backgroundColor: '#F20D2D', borderColor: '#F20D2D', height: '46px' }}
                            >
                              <FiSmartphone size={17} />
                              <span>Show Razorpay UPI QR / Pay</span>
                            </button>
                          </div>
                        )}

                        <div className="mt-2 text-muted small" style={{ fontSize: '11px' }}>
                          Secured by Razorpay · Signature Verified
                        </div>
                      </div>
                    )}

                    {/* Method View: Cash Flow */}
                    {selectedMethod === 'COUNTER' && (
                      <div className="p-4 rounded-3 border bg-white text-center h-100 d-flex flex-column justify-content-center align-items-center shadow-xs">
                        <div className="rounded-circle bg-warning-subtle text-warning-emphasis d-inline-flex p-3 mb-2">
                          <FiDollarSign size={32} />
                        </div>
                        <h6 className="fw-bold text-dark mb-1">Cash Payment at Counter</h6>
                        <p className="text-secondary small mb-3" style={{ fontSize: '12.5px', maxWidth: '320px' }}>
                          Collect the physical cash amount from customer at billing counter before confirming.
                        </p>
                        <div className="p-2.5 bg-light rounded-3 border text-dark fw-bold w-100 mb-3" style={{ maxWidth: '280px' }}>
                          Collect Amount: <span className="text-danger fs-5">{formatCurrency(grandTotal)}</span>
                        </div>
                        <button
                          type="button"
                          onClick={handleConfirmCash}
                          disabled={loading || grandTotal <= 0}
                          className="btn btn-danger w-100 py-2.5 rounded-pill fw-bold shadow-sm d-flex align-items-center justify-content-center gap-2"
                          style={{ backgroundColor: '#F20D2D', borderColor: '#F20D2D', height: '46px', maxWidth: '280px' }}
                        >
                          <FiCheckCircle size={17} />
                          <span>Confirm Cash Payment</span>
                        </button>
                      </div>
                    )}

                    {/* Method View: Card Flow */}
                    {selectedMethod === 'CARD' && cardEnabled && (
                      <div className="p-4 rounded-3 border bg-white text-center h-100 d-flex flex-column justify-content-center align-items-center shadow-xs">
                        <div className="rounded-circle bg-primary-subtle text-primary d-inline-flex p-3 mb-2">
                          <FiCreditCard size={32} />
                        </div>
                        <h6 className="fw-bold text-dark mb-1">Razorpay Card Checkout</h6>
                        <p className="text-secondary small mb-2" style={{ fontSize: '12px', maxWidth: '320px' }}>
                          Accepts <strong>Visa, Mastercard, RuPay & Amex</strong>. 
                        </p>
                        <div className="badge bg-secondary-subtle text-dark border px-2.5 py-1 mb-3 rounded-pill" style={{ fontSize: '10.5px' }}>
                          POS Terminal: Web Card Integration Active
                        </div>

                        {paymentState === 'PAID' ? (
                          <div className="p-3 bg-success-subtle border border-success-subtle text-success rounded-3 w-100 my-2">
                            <FiCheckCircle size={32} className="mb-2 d-block mx-auto" />
                            <div className="fw-bold fs-6">Card Payment Verified!</div>
                          </div>
                        ) : paymentState === 'PROCESSING' ? (
                          <div className="p-3 bg-light rounded-3 border w-100 my-2 text-center">
                            <span className="spinner-border spinner-border-sm text-danger mb-2" role="status" />
                            <div className="fw-bold text-dark small">{paymentMessage || 'Processing card checkout...'}</div>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={handleLaunchRazorpayCard}
                            disabled={loading || grandTotal <= 0}
                            className="btn btn-danger w-100 py-2.5 rounded-pill fw-bold shadow-sm d-flex align-items-center justify-content-center gap-2"
                            style={{ backgroundColor: '#F20D2D', borderColor: '#F20D2D', height: '46px', maxWidth: '280px' }}
                          >
                            <FiCreditCard size={17} />
                            <span>Open Card Checkout ({formatCurrency(grandTotal)})</span>
                          </button>
                        )}
                      </div>
                    )}
                  </div>

                  {(localError || error) && (
                    <div className="alert alert-danger py-2 small my-3 d-flex align-items-center gap-2">
                      <FiAlertCircle className="flex-shrink-0" />
                      <span>{localError || error}</span>
                    </div>
                  )}
                </div>

                {/* Footer Actions */}
                <div className="d-flex align-items-center justify-content-between pt-3 border-top mt-3">
                  <button
                    type="button"
                    onClick={onClose}
                    disabled={loading || paymentState === 'PROCESSING'}
                    className="btn btn-outline-secondary rounded-pill px-4 fw-semibold"
                    style={{ height: '44px', fontSize: '13.5px' }}
                  >
                    Close
                  </button>
                  <span className="text-muted small" style={{ fontSize: '11px' }}>
                    Payment Mode: <strong>{selectedMethod === 'UPI' ? 'RAZORPAY_UPI' : selectedMethod === 'CARD' ? 'RAZORPAY_CARD' : 'CASH'}</strong>
                  </span>
                </div>
              </div>

            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PaymentModal;
