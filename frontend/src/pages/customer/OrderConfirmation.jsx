import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate, useLocation, useSearchParams } from 'react-router-dom';
import { FiCheckCircle, FiXCircle, FiCheck, FiFileText } from 'react-icons/fi';
import CustomerLayout from '../../components/layout/CustomerLayout';
import Button from '../../components/common/Button';
import formatCurrency from '../../utils/formatCurrency';
import BackButton from '../../components/common/BackButton';
import EBillModal from '../../components/orders/EBillModal';
import { useAuth } from '../../hooks/useAuth';
import { mapOrder } from '../../services/adminApi';
import { fetchCustomerOrder, payOrderOnline } from '../../services/customerCheckout';
import { extractApiErrorMessage } from '../../utils/errorUtils';
import { formatOrderDisplayNumber } from '../../utils/orderNumber';
import CheckoutStepper from '../../components/customer/CheckoutStepper';

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
  const [isBillConfirmed, setIsBillConfirmed] = useState(() => searchParams.get('proceedToBill') === '1');
  const [proceedingToBill, setProceedingToBill] = useState(false);

  const load = useCallback(async () => {
    if (!orderId) {
      setLoadError('No order was selected.');
      return;
    }
    try {
      const data = await fetchCustomerOrder(orderId);
      setRaw(data);
      setLoadError('');
    } catch (err) {
      setLoadError(err?.response?.status === 404 ? 'Order not found.' : extractApiErrorMessage(err, 'The order could not be loaded.'));
    }
  }, [orderId]);

  // Live polling & real-time updates to keep the tracker active
  useEffect(() => {
    load();
    const interval = setInterval(load, 3000);
    const handleSync = () => load();
    window.addEventListener('foodie_orders_updated', handleSync);
    window.addEventListener('focus', handleSync);
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') load();
    };
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      clearInterval(interval);
      window.removeEventListener('foodie_orders_updated', handleSync);
      window.removeEventListener('focus', handleSync);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [load]);

  const handleOpenBill = async () => {
    try {
      const { fetchCustomerBillPreview } = await import('../../services/customerCheckout');
      const preview = await fetchCustomerBillPreview(raw.id);
      setRaw(prev => ({
        ...prev,
        ...preview,
        items: preview.items || prev.items,
        combined_items: preview.items,
        total: preview.total_amount || prev.total,
        total_amount: preview.total_amount || prev.total_amount,
        display_order_number: preview.display_order_number || prev.display_order_number,
      }));
    } catch (e) {
      console.warn('Could not fetch bill preview', e);
    }
    setShowReceipt(true);
  };

  const handleProceedToBillConfirm = async (ord) => {
    try {
      const { proceedOrderToBill } = await import('../../services/customerCheckout');
      const targetId = ord?.backendOrderId || ord?.id || raw?.id;
      if (targetId) {
        const data = await proceedOrderToBill(targetId);
        const updatedOrder = data.order || data;
        const preview = data.bill || {};
        setRaw(prev => ({
          ...prev,
          ...updatedOrder,
          ...preview,
          status: updatedOrder.status || 'COMPLETED',
          backendStatus: updatedOrder.status || 'COMPLETED',
          items: preview.items || prev.items,
          combined_items: preview.items,
          total: preview.total_amount || prev.total,
          total_amount: preview.total_amount || prev.total_amount,
          display_order_number: preview.display_order_number || updatedOrder.display_order_number || prev.display_order_number,
        }));
      }
    } catch (e) {
      console.warn('Error confirming proceed to bill:', e);
    }
    setIsBillConfirmed(true);
  };

  const handleProceedToBillClick = async () => {
    if (proceedingToBill) return;
    if (isBillConfirmed || String(raw?.status).toUpperCase() === 'COMPLETED') {
      setShowReceipt(true);
      return;
    }
    setProceedingToBill(true);
    try {
      const { proceedOrderToBill } = await import('../../services/customerCheckout');
      const data = await proceedOrderToBill(raw.id);
      const updatedOrder = data.order || data;
      const preview = data.bill || {};
      setRaw(prev => ({
        ...prev,
        ...updatedOrder,
        ...preview,
        status: updatedOrder.status || 'COMPLETED',
        backendStatus: updatedOrder.status || 'COMPLETED',
        items: preview.items || prev.items,
        combined_items: preview.items,
        total: preview.total_amount || prev.total,
        total_amount: preview.total_amount || prev.total_amount,
        display_order_number: preview.display_order_number || updatedOrder.display_order_number || prev.display_order_number,
      }));
      setIsBillConfirmed(true);
      setShowReceipt(true);
    } catch (e) {
      console.warn('Could not proceed to bill', e);
      handleOpenBill();
    } finally {
      setProceedingToBill(false);
    }
  };

  useEffect(() => {
    if (searchParams.get('proceedToBill') === '1' && raw && !isBillConfirmed) {
      handleProceedToBillClick();
    }
  }, [raw?.id, searchParams.get('proceedToBill')]);

  const staffDestination = (page) => {
    let role = 'employee';
    try {
      role = JSON.parse(sessionStorage.getItem('foodie_auth_admin') || '{}').user?.role || 'employee';
    } catch { /* employee routes */ }
    const base = role === 'admin' ? '/admin' : '/employee';
    return page === 'tables' ? `${base}/tables` : `${base}/kitchen`;
  };

  const orderAgain = () => {
    if (raw && (raw.order_type === 'DINE_IN' || raw.orderType === 'Dine-In') && String(raw.status || '').toUpperCase() !== 'CANCELLED' && String(raw.status || '').toUpperCase() !== 'COMPLETED' && !isBillConfirmed && String(raw.payment_status || '').toUpperCase() !== 'PAID') {
      const rootId = raw.parent_order_id || raw.id;
      sessionStorage.setItem('foodie_parent_order_id', String(rootId));
      localStorage.setItem('foodie_parent_order_id', String(rootId));
      const tid = raw.table_id || raw.table?.id;
      if (tid) {
        sessionStorage.setItem('foodie_selected_table', String(tid));
        localStorage.setItem('foodie_selected_table', String(tid));
        sessionStorage.setItem('foodie_order_type', 'DINE_IN');
        localStorage.setItem('foodie_order_type', 'DINE_IN');
      }
    }
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
  const isPaid = String(raw.payment_status || '').toUpperCase() === 'PAID';
  const canPayOnline = !cancelled && !isPaid;
  const displayNo = formatOrderDisplayNumber(raw, raw.id || orderId);

  const isTakeawayOrder = raw.order_type === 'TAKEAWAY' ||
    raw.orderType === 'Takeaway' ||
    raw.table === 'Takeaway' ||
    String(raw.table?.label || raw.table || '').toLowerCase() === 'takeaway';

  const stages = isTakeawayOrder ? [
    { key: 'Pending', label: 'Order Confirmed', sub: 'We received your food ticket' },
    { key: 'Preparing', label: 'Preparing', sub: 'Our Chef is preparing your dish' },
    { key: 'Ready', label: 'Ready for Pickup', sub: 'Packed & ready for counter pickup' },
    { key: 'Completed', label: 'Completed', sub: isPaid ? 'Order fulfilled & bill settled' : 'Order fulfilled · payment pending' }
  ] : [
    { key: 'Pending', label: 'Order Confirmed', sub: 'We received your food ticket' },
    { key: 'Preparing', label: 'Preparing', sub: 'Our Chef is preparing your dish' },
    { key: 'Ready', label: 'Ready', sub: 'Food packaged at counter' },
    { key: 'Serving', label: 'Serving', sub: `Delivered to Table ${raw.table?.label || raw.table || ''}` },
    { key: 'Completed', label: 'Completed', sub: isPaid ? 'Bill settled successfully' : 'Dishes completed · payment pending' }
  ];

  const normalizeStatus = (status) => {
    if (!status) return 'Pending';
    const s = String(status).toLowerCase().trim();
    if (['placed', 'pending', 'confirmed', 'new', 'ordered', 'created', 'processing'].includes(s)) return 'Pending';
    if (['preparing', 'cooking', 'accepted', 'in_kitchen'].includes(s)) return 'Preparing';
    if (['ready', 'out_for_delivery', 'prepared', 'ready_for_pickup'].includes(s)) return 'Ready';
    if (['serving', 'served'].includes(s)) return isTakeawayOrder ? 'Completed' : 'Serving';
    if (['delivered', 'completed', 'done', 'settled'].includes(s)) return 'Completed';
    if (['cancelled', 'canceled', 'rejected', 'void'].includes(s)) return 'Cancelled';
    return status;
  };

  const currentStatus = normalizeStatus(raw.status);
  const getStatusIndex = (st) => {
    const keys = stages.map(s => s.key);
    const idx = keys.indexOf(st);
    if (idx >= 0) return idx;
    if (isTakeawayOrder && (st === 'Serving' || st === 'Served')) return keys.indexOf('Completed');
    return 0;
  };
  const currentIndex = getStatusIndex(currentStatus);

  return (
    <CustomerLayout>
      <main className="pt-2 text-center mx-auto" style={{ maxWidth: '640px' }}>
        <CheckoutStepper currentStep={4} />

        <div className="text-start mb-3">
          <BackButton to="/customer/home" />
        </div>
        <div
          className="d-flex align-items-center justify-content-center mb-4 rounded-circle mx-auto"
          style={{ 
            width: '84px', 
            height: '84px', 
            backgroundColor: cancelled ? '#FEE2E2' : '#DCFCE7', 
            border: cancelled ? '2px solid #EF4444' : '2px solid #16A34A',
            boxShadow: cancelled ? '0 0 0 6px rgba(239, 68, 68, 0.12)' : '0 0 0 6px rgba(34, 197, 94, 0.15)'
          }}
        >
          {cancelled ? <FiXCircle size={44} className="text-danger" /> : <FiCheck size={44} className="text-success" strokeWidth={3} />}
        </div>

        <h3 className="fw-bold text-dark mb-1" data-testid="confirmation-title">
          {cancelled ? 'Order Cancelled' : 'Order Placed!'}
        </h3>
        <p className="text-muted small mb-4">
          Order number <span className="font-monospace fw-bold" data-testid="order-number">{displayNo}</span>
        </p>

        {paymentNote && paymentNote.status !== 'PAID' && (
          <div className="alert alert-warning text-start small" role="alert">{paymentNote.message}</div>
        )}
        {isPaid ? (
          <div className="alert alert-success text-start small d-flex align-items-center gap-2 mb-3" role="alert">
            <FiCheckCircle size={16} className="text-success flex-shrink-0" />
            <div>
              <strong>Payment Received!</strong> Your bill has been settled successfully.
            </div>
          </div>
        ) : !cancelled ? (
          <div className="alert alert-warning text-start small d-flex align-items-center justify-content-between mb-3" role="alert">
            <div>
              <strong>Payment Pending:</strong> Please settle your bill online or at the counter.
            </div>
            <span className="badge bg-warning text-dark fw-bold">UNPAID</span>
          </div>
        ) : null}

        {isBillConfirmed && (
          <div className="alert alert-info py-2.5 px-3 rounded-3 small mb-3 text-start d-flex align-items-center justify-content-between">
            <div>
              <strong>Proceed to Bill Confirmed.</strong> Your bill is ready for settlement.
            </div>
            <button
              type="button"
              onClick={handleOpenBill}
              className="btn btn-xs btn-outline-primary rounded-pill fw-semibold"
            >
              View Bill
            </button>
          </div>
        )}

        {/* Live Order Tracker Pipeline (remains active and visible) */}
        {!cancelled && (
          <div className="card rounded-3 border-0 shadow-sm p-4 bg-white text-start mb-4">
            <div className="d-flex align-items-center justify-content-between mb-3">
              <h5 className="fw-bold text-dark mb-0">Live Order Tracker</h5>
              <span className={`badge rounded-pill px-2.5 py-1 fw-bold ${
                currentStatus === 'Completed' ? 'bg-success text-white' :
                currentStatus === 'Preparing' ? 'bg-warning text-dark' :
                currentStatus === 'Ready' ? 'bg-info text-dark' :
                currentStatus === 'Serving' ? 'bg-primary text-white' : 'bg-secondary text-white'
              }`}>
                {currentStatus}
              </span>
            </div>

            <div className="d-flex flex-column gap-3.5 border-start ps-4 position-relative ms-2 my-2">
              {stages.map((stage, idx) => {
                const isPast = currentIndex > idx;
                const isCurrent = currentIndex === idx;
                const isFinished = currentStatus === 'Completed' || (isTakeawayOrder && (raw.status === 'SERVED' || raw.status === 'Served'));
                const isDone = isPast || (isCurrent && isFinished);
                const isColoured = isPast || isCurrent || isFinished;

                return (
                  <div key={stage.key} className={`position-relative ${isDone ? 'text-dark' : isCurrent ? 'text-danger fw-bold' : 'text-muted'}`}>
                    <span
                      className="position-absolute rounded-circle d-flex align-items-center justify-content-center"
                      style={{
                        width: '18px',
                        height: '18px',
                        left: '-33px',
                        top: '3px',
                        backgroundColor: isColoured ? 'var(--primary-color, #dc3545)' : '#e2e8f0',
                        color: '#ffffff',
                        fontSize: '10px'
                      }}
                    >
                      {isDone ? <FiCheck size={10} /> : isCurrent ? <span className="bg-white rounded-circle" style={{ width: '6px', height: '6px' }}></span> : null}
                    </span>
                    <div className="small">
                      <span className="d-block text-dark fw-bold fs-6">
                        {stage.label}
                      </span>
                      <span className="text-secondary small d-block mt-0.5">{stage.sub}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Order Details Summary Card */}
        <div className="card rounded-3 border-0 shadow-sm p-3 bg-white text-start mb-4">
          <Row label="Order Number" testId="order-id">#{displayNo}</Row>
          <Row label="Status" testId="order-status">{order.status}</Row>
          <Row label="Order Type">{raw.order_type === 'TAKEAWAY' ? 'Takeaway' : 'Dine-In'}</Row>
          {raw.table && <Row label="Dining Table">{raw.table.label}</Row>}
          <Row label="Payment" testId="payment-status">{PAYMENT_LABEL[raw.payment_status] || raw.payment_status}</Row>
          {(raw.items || []).map((item) => (
            <Row key={item.id} label={`${item.name} × ${item.quantity}`}>
              {formatCurrency(Number(item.line_total))}
            </Row>
          ))}
          <div className="d-flex align-items-center justify-content-between pb-3">
            <span className="text-secondary small">Total</span>
            <span className="fw-bold text-danger" data-testid="order-total">{formatCurrency(Number(raw.total_amount))}</span>
          </div>

          {/* Primary Action Buttons from Screenshot 15 & 16 */}
          <div className="d-flex flex-column flex-sm-row align-items-center justify-content-center gap-2.5 pt-3 border-top mt-3">
            <button
              type="button"
              onClick={handleOpenBill}
              className="btn btn-outline-danger rounded-pill px-4 py-2.5 fw-bold w-100 w-sm-auto d-flex align-items-center justify-content-center gap-1.5 shadow-xs"
              style={{ fontSize: '13px', borderColor: 'var(--primary-color, #C8102E)', color: 'var(--primary-color, #C8102E)' }}
            >
              <FiFileText size={15} />
              <span>View E-Bill / Receipt</span>
            </button>

            <button
              type="button"
              onClick={() => navigate(`/customer/order-tracking/${raw.id}`)}
              className="btn btn-outline-danger rounded-pill px-4 py-2.5 fw-bold w-100 w-sm-auto d-flex align-items-center justify-content-center gap-1.5 shadow-xs"
              style={{ fontSize: '13px', borderColor: 'var(--primary-color, #C8102E)', color: 'var(--primary-color, #C8102E)' }}
            >
              <span>Track Order</span>
            </button>

            {(!isBillConfirmed && String(raw.status || '').toUpperCase() !== 'COMPLETED' && String(raw.payment_status || '').toUpperCase() !== 'PAID') && (
              <button
                type="button"
                onClick={orderAgain}
                className="btn btn-outline-danger rounded-pill px-4 py-2.5 fw-bold w-100 w-sm-auto d-flex align-items-center justify-content-center gap-1.5 shadow-xs"
                style={{ fontSize: '13px', borderColor: 'var(--primary-color, #C8102E)', color: 'var(--primary-color, #C8102E)' }}
              >
                <span>Order Again</span>
              </button>
            )}
          </div>
        </div>

        {/* Secondary Staff Redirects */}
        {sessionStorage.getItem('foodie_staff_ordering') === '1' && (
          <div className="row g-2 mt-2">
            <div className="col-6">
              <Button onClick={() => navigate(staffDestination('tables'))} variant="primary" className="w-100 py-2 rounded-pill fw-bold shadow-sm">
                Go to Tables
              </Button>
            </div>
            <div className="col-6">
              <Button onClick={() => navigate(staffDestination('kitchen'))} variant="secondary" className="w-100 py-2 rounded-pill fw-bold shadow-sm">
                Go to Kitchen Queue
              </Button>
            </div>
          </div>
        )}
        <div style={{ height: '40px' }} className="d-md-none w-100"></div>
      </main>

      <EBillModal
        isOpen={showReceipt}
        order={order}
        onClose={() => setShowReceipt(false)}
        onProceedToBill={handleProceedToBillConfirm}
      />
    </CustomerLayout>
  );
};

export default OrderConfirmation;
