import React, { useEffect, useRef, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { FiCreditCard, FiSmartphone, FiDollarSign, FiCheckCircle } from 'react-icons/fi';
import CustomerLayout from '../../components/layout/CustomerLayout';
import ServerBillSummary from '../../components/customer/ServerBillSummary';
import { useCart } from '../../hooks/useCart';
import { useAuth } from '../../hooks/useAuth';
import BackButton from '../../components/common/BackButton';
import CheckoutStepper from '../../components/customer/CheckoutStepper';
import { applyOrderContext, payOrderOnline, validateCheckout } from '../../services/customerCheckout';
import { TAKEAWAY, getOrderType, normalizeOrderType } from '../../utils/orderContext';
import formatCurrency from '../../utils/formatCurrency';

const METHOD_INFO = {
  UPI: { 
    icon: FiSmartphone, 
    title: 'UPI', 
    hint: 'Pay with any UPI app',
    badge: 'Fast & Secure'
  },
  CARD: { 
    icon: FiCreditCard, 
    title: 'Credit / Debit Card', 
    hint: 'Visa, Mastercard, Rupay',
    badge: null
  },
  COUNTER: { 
    icon: FiDollarSign, 
    title: 'Pay at Counter', 
    hint: 'Pay at the restaurant',
    badge: null
  },
};

export const Payment = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { submitOrder } = useCart();
  const { user } = useAuth();
  const orderType = normalizeOrderType(location.state?.orderType) || getOrderType();

  const [review, setReview] = useState(null);
  const [preparing, setPreparing] = useState(true);
  const [paymentMethod, setPaymentMethod] = useState('UPI');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const submitted = useRef(false);

  useEffect(() => {
    if (!orderType) {
      navigate('/customer/checkout', { replace: true });
      return;
    }
    let active = true;
    (async () => {
      try {
        await applyOrderContext(orderType);
        const data = await validateCheckout();
        if (active) setReview(data);
      } catch (err) {
        if (active) {
          setError(err.message);
          setReview(err.cart ? { cart: err.cart, payment_methods: [] } : null);
        }
      } finally {
        if (active) setPreparing(false);
      }
    })();
    return () => { active = false; };
  }, [orderType, navigate]);

  const methods = ['UPI', 'CARD', 'COUNTER'];
  const totalAmount = review?.cart?.pricing?.total_amount || 0;

  const handlePaySubmit = async (e) => {
    if (e && e.preventDefault) e.preventDefault();
    if (loading || submitted.current) return;
    submitted.current = true;
    setLoading(true);
    setError('');
    let order;
    try {
      order = await submitOrder(paymentMethod, orderType);
    } catch (err) {
      console.error('Order placement error:', err);
      setError(`Order Placement Failed: ${err.message}`);
      setLoading(false);
      submitted.current = false;
      return;
    }

    let paymentResult = null;
    if (paymentMethod !== 'COUNTER') {
      paymentResult = await payOrderOnline(order, paymentMethod, user);
    }
    navigate(`/customer/order-confirmation?order=${order.id}`, {
      replace: true,
      state: { orderId: order.id, paymentResult },
    });
  };

  const ready = Boolean(review?.ready);

  return (
    <CustomerLayout>
      <main className="pt-2 text-start">
        {/* 4-Step Checkout Stepper (Step 3: Payment active) */}
        <CheckoutStepper currentStep={3} />

        <div className="d-flex align-items-center gap-3 mb-4">
          <BackButton />
          <h4 className="fw-bold text-dark mb-0">Select Payment</h4>
        </div>

        <form onSubmit={handlePaySubmit}>
          <div className="row g-4">
            
            {/* Left Column: Select Payment Method Card (Matches Reference 7) */}
            <div className="col-12 col-lg-8">
              <div 
                className="card border-0 shadow-sm p-4 bg-white"
                style={{ borderRadius: '18px', border: '1px solid #E2E8F0' }}
              >
                <h5 className="fw-bold text-dark mb-1" style={{ fontSize: '18px' }}>
                  Select Payment Method
                </h5>
                <p className="text-secondary small mb-4" style={{ fontSize: '12.5px', color: '#64748B' }}>
                  {orderType === TAKEAWAY ? 'Takeaway order' : `Table Dine-In${review?.cart?.table ? ` · Table ${review.cart.table.table_number}` : ''}`}
                </p>

                {preparing && <p className="text-secondary small">Checking your cart…</p>}

                <div className="d-flex flex-column gap-3 mb-2">
                  {methods.map((code) => {
                    const info = METHOD_INFO[code];
                    const Icon = info.icon;
                    const selected = paymentMethod === code;

                    return (
                      <div
                        key={code}
                        onClick={() => !loading && setPaymentMethod(code)}
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
              <ServerBillSummary cart={review?.cart}>
                <div className="d-grid gap-2 mt-3">
                  <button
                    type="submit"
                    data-testid="place-order"
                    disabled={loading}
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
                        <span>Processing Payment...</span>
                      </>
                    ) : (
                      paymentMethod === 'COUNTER' 
                        ? `Place Order · ${formatCurrency(totalAmount)}` 
                        : `Pay ${formatCurrency(totalAmount)}`
                    )}
                  </button>
                </div>
              </ServerBillSummary>
            </div>

          </div>
        </form>
      </main>
    </CustomerLayout>
  );
};

export default Payment;
