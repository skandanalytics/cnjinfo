import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate, useLocation, useSearchParams } from 'react-router-dom';
import { FiCheckCircle, FiXCircle } from 'react-icons/fi';
import CustomerLayout from '../../components/layout/CustomerLayout';
import Button from '../../components/common/Button';
import formatCurrency from '../../utils/formatCurrency';
import BackButton from '../../components/common/BackButton';
import EBillModal from '../../components/orders/EBillModal';
import { useAuth } from '../../hooks/useAuth';
import { mapOrder } from '../../services/adminApi';
import { fetchCustomerOrder, payOrderOnline } from '../../services/customerCheckout';
import { extractApiErrorMessage } from '../../utils/errorUtils';
const PAYMENT_LABEL = {
  PAID: 'Paid',
  UNPAID: 'Pay at the counter',
  PENDING: 'Awaiting online payment',
  FAILED: 'Payment failed',
  REFUNDED: 'Refunded',
};

const Row = ({ label, children, testId }) => (
  <div className="d-flex align-items-center justify-content-between mb-2 pb-2 border-bottom border-light">
    <span className="text-secondary small">{label}</span>
    <span className="fw-bold text-dark" data-testid={testId}>{children}</span>
  </div>
);

export const OrderConfirmation = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const { user } = useAuth();
  const orderId = location.state?.orderId || searchParams.get('order');

  const [raw, setRaw] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [paymentNote, setPaymentNote] = useState(location.state?.paymentResult || null);
  const [paying, setPaying] = useState(false);
  const [showReceipt, setShowReceipt] = useState(false);

  const load = useCallback(async () => {
    if (!orderId) {
      setLoadError('No order was selected.');
      return;
    }
    try {
      setRaw(await fetchCustomerOrder(orderId));
      setLoadError('');
    } catch (err) {
      setLoadError(err?.response?.status === 404 ? 'Order not found.' : extractApiErrorMessage(err, 'The order could not be loaded.'));
    }
  }, [orderId]);

  useEffect(() => { load(); }, [load]);

  const staffDestination = (page) => {
    let role = 'employee';
    try {
      role = JSON.parse(sessionStorage.getItem('foodie_auth_admin') || '{}').user?.role || 'employee';
    } catch { /* employee routes */ }
    const base = role === 'admin' ? '/admin' : '/employee';
    return page === 'tables' ? `${base}/tables` : `${base}/kitchen`;
  };

  const orderAgain = () => {
    navigate('/customer/home');
  };

  const payAgain = async (method) => {
    if (!raw || paying) return;
    setPaying(true);
    const result = await payOrderOnline(raw, method, user);
    setPaymentNote(result);
    await load();
    setPaying(false);
  };

  if (loadError) {
    return (
      <CustomerLayout>
        <main className="pt-4 text-center mx-auto" style={{ maxWidth: '600px' }}>
          <div className="alert alert-danger" role="alert">{loadError}</div>
          <Button onClick={() => navigate('/customer/orders')} variant="primary">My Orders</Button>
        </main>
      </CustomerLayout>
    );
  }

  if (!raw) {
    return (
      <CustomerLayout>
        <main className="pt-5 text-center text-secondary">Loading your order…</main>
      </CustomerLayout>
    );
  }

  const order = mapOrder(raw);
  order.paymentMethod = PAYMENT_LABEL[raw.payment_status] || raw.payment_status;
  const cancelled = raw.status === 'CANCELLED';
  const canPayOnline = !cancelled && (raw.payment_status === 'PENDING' || raw.payment_status === 'FAILED');

  return (
    <CustomerLayout>
      <main className="pt-4 text-center mx-auto" style={{ maxWidth: '600px' }}>
        <div className="text-start mb-3">
          <BackButton to="/customer/home" />
        </div>
        <div
          className="d-flex align-items-center justify-content-center mb-4 rounded-circle mx-auto"
          style={{ width: '90px', height: '90px', backgroundColor: 'var(--primary-light)', border: '2px solid var(--primary-color)' }}
        >
          {cancelled ? <FiXCircle size={44} className="text-danger" /> : <FiCheckCircle size={44} className="text-danger" />}
        </div>

        <h3 className="fw-bold text-dark mb-1" data-testid="confirmation-title">
          {cancelled ? 'Order Cancelled' : 'Order Placed!'}
        </h3>
        <p className="text-muted small mb-4">Order number <span className="font-monospace fw-bold" data-testid="order-number">{raw.order_number}</span></p>

        {paymentNote && paymentNote.status !== 'PAID' && (
          <div className="alert alert-warning text-start small" role="alert">{paymentNote.message}</div>
        )}
        {paymentNote?.status === 'PAID' && raw.payment_status === 'PAID' && (
          <div className="alert alert-success text-start small" role="alert">Payment received.</div>
        )}

        <div className="card rounded-3 border-0 shadow-sm p-3 bg-white text-start mb-4">
          <Row label="Order ID" testId="order-id">#{raw.id}</Row>
          <Row label="Status" testId="order-status">{order.status}</Row>
          <Row label="Order Type">{raw.order_type === 'TAKEAWAY' ? 'Takeaway' : 'Dine-In'}</Row>
          {raw.table && <Row label="Dining Table">{raw.table.label}</Row>}
          <Row label="Payment" testId="payment-status">{PAYMENT_LABEL[raw.payment_status] || raw.payment_status}</Row>
          {(raw.items || []).map((item) => (
            <Row key={item.id} label={`${item.name} × ${item.quantity}`}>{formatCurrency(Number(item.line_total))}</Row>
          ))}
          <div className="d-flex align-items-center justify-content-between pb-3">
            <span className="text-secondary small">Total</span>
            <span className="fw-bold text-danger" data-testid="order-total">{formatCurrency(Number(raw.total_amount))}</span>
          </div>

          {canPayOnline && (
            <div className="d-flex gap-2 mb-3">
              <Button onClick={() => payAgain('UPI')} variant="primary" className="w-100" loading={paying}>Pay with UPI</Button>
              <Button onClick={() => payAgain('CARD')} variant="outline" className="w-100" disabled={paying}>Pay with Card</Button>
            </div>
          )}

          <button
            type="button"
            onClick={() => setShowReceipt(true)}
            className="btn btn-outline-danger w-100 py-2 fw-bold rounded-3"
          >
            View E-Bill / Receipt
          </button>
          {raw.status !== 'COMPLETED' && (
            <p className="text-secondary small mt-2 mb-0">The downloadable e-bill is available once the order is completed.</p>
          )}
        </div>

        <div className="row g-3">
          {sessionStorage.getItem('foodie_staff_ordering') === '1' ? (
            <>
              <div className="col-6">
                <Button onClick={() => navigate(staffDestination('tables'))} variant="primary" className="w-100 py-2.5 fw-bold shadow-sm">
                  Go to Tables
                </Button>
              </div>
              <div className="col-6">
                <Button onClick={() => navigate(staffDestination('kitchen'))} variant="secondary" className="w-100 py-2.5 fw-bold shadow-sm">
                  Go to Kitchen Queue
                </Button>
              </div>
            </>
          ) : (
            <>
              <div className="col-6">
                <Button onClick={() => navigate(`/customer/order-tracking/${raw.id}`)} variant="primary" className="w-100 py-2.5 fw-bold shadow-sm">
                  Track Order
                </Button>
              </div>
              <div className="col-6">
                <Button onClick={() => navigate('/customer/home')} variant="secondary" className="w-100 py-2.5 fw-bold shadow-sm">
                  Go to Menu
                </Button>
              </div>
              <div className="col-12">
                <Button onClick={orderAgain} variant="outline" className="w-100 py-2.5 fw-bold">
                  Order Again
                </Button>
              </div>
            </>
          )}
        </div>
        <div style={{ height: '40px' }} className="d-md-none w-100"></div>
      </main>

      <EBillModal isOpen={showReceipt} order={order} onClose={() => setShowReceipt(false)} />
    </CustomerLayout>
  );
};

export default OrderConfirmation;
