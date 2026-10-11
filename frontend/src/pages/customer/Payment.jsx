import React, { useEffect, useRef, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { FiCreditCard, FiSmartphone, FiDollarSign } from 'react-icons/fi';
import CustomerLayout from '../../components/layout/CustomerLayout';
import ServerBillSummary from '../../components/customer/ServerBillSummary';
import { useCart } from '../../hooks/useCart';
import { useAuth } from '../../hooks/useAuth';
import Button from '../../components/common/Button';
import BackButton from '../../components/common/BackButton';
import { applyOrderContext, payOrderOnline, validateCheckout } from '../../services/customerCheckout';
import { TAKEAWAY, getOrderType, normalizeOrderType } from '../../utils/orderContext';

const METHOD_INFO = {
  CARD: { icon: FiCreditCard, title: 'Credit / Debit Card', hint: 'Card details are entered securely in the Razorpay window' },
  UPI: { icon: FiSmartphone, title: 'UPI Instant Payment', hint: 'Google Pay, PhonePe, Paytm, BHIM via Razorpay' },
  COUNTER: { icon: FiDollarSign, title: 'Pay at Counter', hint: 'Pay with cash or card at the restaurant counter' },
};

export const Payment = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { submitOrder } = useCart();
  const { user } = useAuth();
  const orderType = normalizeOrderType(location.state?.orderType) || getOrderType();

  const [review, setReview] = useState(null);
  const [preparing, setPreparing] = useState(true);
  const [paymentMethod, setPaymentMethod] = useState('COUNTER');
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

  const methods = (review?.payment_methods || []).map((m) => m.code).filter((code) => METHOD_INFO[code]);
  const onlineUnavailable = review?.ready && !methods.some((code) => code !== 'COUNTER');

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
    // From here the order exists; a payment problem is shown on the confirmation page with a retry,
    // and never creates a second order.
    let paymentResult = null;
    if (paymentMethod !== 'COUNTER') {
      paymentResult = await payOrderOnline(order, paymentMethod, user);
    }
    navigate(`/customer/order-confirmation?order=${order.id}`, {
      replace: true,
      state: { orderId: order.id, paymentResult },
    });
  };

  const ready = Boolean(review?.ready) && methods.includes(paymentMethod);

  return (
    <CustomerLayout>
      <main className="pt-2">
        <div className="d-flex align-items-center gap-3 mb-4">
          <BackButton />
          <h4 className="fw-bold text-dark mb-0">Select Payment</h4>
        </div>

        <form onSubmit={handlePaySubmit}>
          <div className="row g-4">
            <div className="col-12 col-lg-8">
              <div className="card rounded-3 border-0 shadow-sm p-3 p-sm-4 bg-white">
                <h5 className="fw-bold text-dark mb-1">Payment Options</h5>
                <p className="text-secondary small mb-3">
                  {orderType === TAKEAWAY ? 'Takeaway order' : `Dine-In${review?.cart?.table ? ` · Table ${review.cart.table.table_number}` : ''}`}
                </p>
                {preparing && <p className="text-secondary small">Checking your cart…</p>}
                {methods.map((code) => {
                  const { icon: Icon, title, hint } = METHOD_INFO[code];
                  const selected = paymentMethod === code;
                  return (
                    <label
                      key={code}
                      data-testid={`payment-method-${code}`}
                      className={`d-flex align-items-center justify-content-between p-3 border rounded-3 mb-3 ${selected ? 'border-danger bg-light-subtle' : 'border-light'}`}
                      style={{ cursor: loading ? 'not-allowed' : 'pointer' }}
                    >
                      <span className="d-flex align-items-center">
                        <Icon size={20} className="text-secondary me-3 flex-shrink-0" />
                        <span>
                          <span className="fw-bold text-dark d-block">{title}</span>
                          <span className="text-muted small d-block" style={{ fontSize: '11px' }}>{hint}</span>
                        </span>
                      </span>
                      <input
                        type="radio"
                        name="payment-method"
                        checked={selected}
                        onChange={() => setPaymentMethod(code)}
                        className="form-check-input accent-red"
                        disabled={loading}
                      />
                    </label>
                  );
                })}
                {onlineUnavailable && (
                  <p className="text-secondary small mb-0">Online payment is not available right now. Please pay at the counter.</p>
                )}
                {error && <div className="alert alert-danger small py-2 mt-2 mb-0" role="alert" data-testid="payment-error">{error}</div>}
              </div>
            </div>

            <div className="col-12 col-lg-4">
              <ServerBillSummary cart={review?.cart}>
                <div className="d-grid gap-2">
                  <Button
                    type="submit"
                    data-testid="place-order"
                    variant="primary"
                    loading={loading}
                    disabled={!ready}
                    className="py-2.5 fw-bold shadow-sm"
                  >
                    {paymentMethod === 'COUNTER' ? 'Place Order' : 'Place Order & Pay'}
                  </Button>
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
