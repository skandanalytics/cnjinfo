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
  PENDING: 'Pending Verification',
  FAILED: 'Payment failed',
  REFUNDED: 'Refunded',
};

const Row = ({ label, children, testId }) => (
  <div className="d-flex align-items-center justify-content-between mb-2 pb-2 border-bottom border-light">
    <span className="text-secondary small">{label}</span>
    <span className="fw-bold text-dark" data-testid={testId}>{children}</span>
  </div>
);

const formatPaymentMethodLabel = (method) => {
  if (!method) return '';
  const m = String(method).toUpperCase();
  if (m === 'RAZORPAY_UPI' || m === 'UPI') return 'Razorpay UPI';
  if (m === 'RAZORPAY_CARD' || m === 'CARD') return 'Razorpay Card';
  if (m === 'CASH' || m === 'COUNTER') return 'Cash / Counter';
  return method;
};

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

  // Clean up parent order id when settled or cancelled to prevent hanging on reorders (B30-09)
  useEffect(() => {
    if (raw) {
      const isSettled = (String(raw.status || '').toUpperCase() === 'COMPLETED' && String(raw.payment_status || '').toUpperCase() === 'PAID') ||
                        String(raw.payment_status || '').toUpperCase() === 'PAID';
      const isCancelled = String(raw.status || '').toUpperCase() === 'CANCELLED';
      if (isSettled || isCancelled) {
        const parentId = sessionStorage.getItem('foodie_parent_order_id') || localStorage.getItem('foodie_parent_order_id');
        if (parentId && (String(parentId) === String(raw.id) || String(parentId) === String(raw.parent_order_id))) {
          sessionStorage.removeItem('foodie_parent_order_id');
          localStorage.removeItem('foodie_parent_order_id');
        }
      }
    }
  }, [raw?.status, raw?.payment_status, raw?.id, raw?.parent_order_id]);

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

  const handleContinueOrder = async () => {
    if (!raw) return;
    const isTakeaway = raw.order_type === 'TAKEAWAY' || raw.orderType === 'Takeaway' || String(raw.table).toLowerCase() === 'takeaway';
    if (!isTakeaway) {
      const rootId = raw.parent_order_id || raw.parent_order || raw.id;
      sessionStorage.setItem('foodie_parent_order_id', String(rootId));
      localStorage.setItem('foodie_parent_order_id', String(rootId));

      let tid = raw.table_id || (typeof raw.table === 'object' ? raw.table?.id : (Number(raw.table) || null)) || raw.tableId;
      const tNum = raw.table_number || raw.tableNumber || (typeof raw.table === 'object' ? raw.table?.table_number || raw.table?.label : raw.table);

      if (!tid && tNum) {
        try {
          const { resolvePublicBranchId, availableTables } = await import('../../services/customerCheckout');
          const branchId = raw.branch || raw.branch_id || await resolvePublicBranchId();
          if (branchId) {
            const tables = await availableTables(branchId);
            const cleanTarget = String(tNum).toUpperCase().trim();
            const matched = tables.find(t =>
              String(t.table_number).toUpperCase().trim() === cleanTarget ||
              String(t.table_number).toUpperCase().trim() === cleanTarget.replace(/^TABLE\s*/i, '') ||
              `T${String(t.table_number).replace(/\D/g, '').padStart(2, '0')}` === cleanTarget
            );
            if (matched) tid = matched.id;
          }
        } catch (e) {
          console.warn('Could not resolve table id by number:', e);
        }
      }

      if (tid) {
        sessionStorage.setItem('foodie_selected_table', String(tid));
        localStorage.setItem('foodie_selected_table', String(tid));
      }
      sessionStorage.setItem('foodie_order_type', 'DINE_IN');
      localStorage.setItem('foodie_order_type', 'DINE_IN');

      const phone = raw.customer_phone || raw.customerPhone || raw.phone;
      if (phone) {
        sessionStorage.setItem('customer_mobile', String(phone));
        localStorage.setItem('customer_mobile', String(phone));
      }
      const name = raw.customer_name || raw.customerName;
      if (name && typeof name === 'string') {
        sessionStorage.setItem('customer_name', String(name));
        localStorage.setItem('customer_name', String(name));
      }

      try {
        const { applyOrderContext } = await import('../../services/customerCheckout');
        await applyOrderContext('DINE_IN', tid);
      } catch (e) {
        console.warn('Could not apply context on continue order:', e);
      }
    }
    navigate('/customer/home');
  };

  const orderAgain = handleContinueOrder;

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
      <main className="pt-2 text-center mx-auto" style={{ maxWidth: '640px', paddingBottom: '60px' }}>
        <CheckoutStepper currentStep={4} />

        <div className="card rounded-4 border border-light-subtle shadow-sm p-4 p-md-5 bg-white text-center mt-3 mb-4">
          <div
            className="d-flex align-items-center justify-content-center mb-3 rounded-circle mx-auto"
            style={{ 
              width: '76px', 
              height: '76px', 
              backgroundColor: cancelled ? '#FEE2E2' : '#DCFCE7', 
              border: cancelled ? '2px solid #EF4444' : '2px solid #16A34A',
              boxShadow: cancelled ? '0 0 0 6px rgba(239, 68, 68, 0.12)' : '0 0 0 6px rgba(34, 197, 94, 0.15)'
            }}
          >
            {cancelled ? (
              <FiXCircle size={40} className="text-danger" />
            ) : (
              <FiCheck size={40} className="text-success" strokeWidth={3} />
            )}
          </div>

          <h3 className="fw-bold text-dark mb-1" data-testid="confirmation-title">
            {cancelled ? 'Order Cancelled' : 'Order Placed Successfully!'}
          </h3>
          <p className="text-muted small mb-4">
            {Boolean(raw.parent_order_id || raw.parent_order || (raw.continuation_index > 0)) ? 'Sub Order ' : 'Order '}
            <span className="font-monospace fw-bold text-dark" data-testid="order-number">#{displayNo}</span>
          </p>

          {/* Key Value Details matching Screenshot 8 & 9 */}
          <div className="w-100 text-start border-top border-bottom py-3 my-2">
            <div className="d-flex align-items-center justify-content-between mb-2.5">
              <span className="text-secondary small fw-medium">Status</span>
              <span className={`badge rounded-pill px-3 py-1 fw-bold ${
                cancelled ? 'bg-danger text-white' :
                currentStatus === 'Completed' ? 'bg-success text-white' :
                currentStatus === 'Preparing' ? 'bg-warning text-dark' : 'bg-success-subtle text-success'
              }`} data-testid="order-status">
                {cancelled ? 'Cancelled' : currentStatus === 'Completed' ? 'Completed' : 'Preparing'}
              </span>
            </div>

            <div className="d-flex align-items-center justify-content-between py-2 border-bottom border-light">
              <span className="text-secondary small fw-medium">Order Type</span>
              <span className="fw-bold text-dark">{isTakeawayOrder ? 'Takeaway' : 'Dine-in'}</span>
            </div>

            {!isTakeawayOrder && (raw.table || raw.table_number) && (
              <div className="d-flex align-items-center justify-content-between py-2 border-bottom border-light">
                <span className="text-secondary small fw-medium">Dining Table</span>
                <span className="fw-bold text-dark">
                  {typeof raw.table === 'object' ? raw.table?.label || raw.table?.table_number : raw.table || raw.table_number}
                </span>
              </div>
            )}

            <div className="d-flex align-items-center justify-content-between py-2 border-bottom border-light">
              <span className="text-secondary small fw-medium">Payment</span>
              <span className="fw-bold text-dark" data-testid="payment-status">
                {isPaid ? (
                  <span className="badge bg-success-subtle text-success rounded-pill px-2.5 py-1">
                    Paid {raw.payment_method ? `(${formatPaymentMethodLabel(raw.payment_method)})` : ''}
                  </span>
                ) : (String(raw.payment_status || '').toUpperCase() === 'PENDING' || String(raw.payment_method || '').toUpperCase() === 'UPI') ? (
                  <span className="badge bg-warning-subtle text-warning-emphasis border border-warning-subtle rounded-pill px-2.5 py-1">
                    Pending Verification (UPI)
                  </span>
                ) : (
                  <span className="badge bg-secondary-subtle text-secondary rounded-pill px-2.5 py-1">
                    {PAYMENT_LABEL[raw.payment_status] || 'Pay at the counter'}
                  </span>
                )}
              </span>
            </div>

            {!isPaid && (String(raw.payment_status || '').toUpperCase() === 'PENDING' || String(raw.payment_method || '').toUpperCase() === 'UPI') && (
              <div 
                className="py-2.5 px-3 rounded-3 my-2.5 text-start d-flex align-items-start gap-2 shadow-xs" 
                style={{ 
                  backgroundColor: '#FFFBEB', 
                  border: '1px solid #FDE68A',
                  color: '#92400E',
                  fontSize: '12.5px' 
                }}
              >
                <i className="bi bi-info-circle flex-shrink-0 mt-0.5" style={{ color: '#D97706' }}></i>
                <span>Your UPI payment has been submitted and will be verified by the restaurant cashier.</span>
              </div>
            )}

            <div className="d-flex align-items-center justify-content-between py-2 border-bottom border-light">
              <span className="text-secondary small fw-medium">Items</span>
              <span className="fw-bold text-dark">
                {(raw.items || []).length} items
              </span>
            </div>

            <div className="d-flex align-items-center justify-content-between pt-3">
              <span className="text-secondary small fw-bold">Total</span>
              <span className="fw-bold fs-5" style={{ color: '#F20D2D' }} data-testid="order-total">
                {formatCurrency(Number(raw.total_amount || raw.total || 0))}
              </span>
            </div>
          </div>

          {/* Action Pill Buttons */}
          <div className="d-flex flex-column flex-md-row align-items-stretch justify-content-center pt-3" style={{ gap: '14px' }}>
            <button
              type="button"
              onClick={handleOpenBill}
              className="btn btn-outline-danger rounded-pill px-3 py-2.5 fw-bold d-flex align-items-center justify-content-center gap-2 flex-grow-1"
              style={{ borderColor: '#F20D2D', color: '#F20D2D', fontSize: '13px', backgroundColor: '#FFFFFF' }}
            >
              <FiFileText size={16} />
              <span>View E-Bill / Receipt</span>
            </button>

            <button
              type="button"
              onClick={() => navigate(`/customer/order-tracking/${raw.id}`)}
              className="btn btn-outline-danger rounded-pill px-3 py-2.5 fw-bold d-flex align-items-center justify-content-center gap-2 flex-grow-1"
              style={{ borderColor: '#F20D2D', color: '#F20D2D', fontSize: '13px', backgroundColor: '#FFFFFF' }}
            >
              <span>Track Order</span>
            </button>

            {!isPaid && (
              <button
                type="button"
                onClick={orderAgain}
                className="btn btn-outline-danger rounded-pill px-3 py-2.5 fw-bold d-flex align-items-center justify-content-center gap-2 flex-grow-1"
                style={{ borderColor: '#F20D2D', color: '#F20D2D', fontSize: '13px', backgroundColor: '#FFFFFF' }}
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
