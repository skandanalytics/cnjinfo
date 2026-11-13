import React, { useState, useEffect } from 'react';
import Modal from '../common/Modal';
import Button from '../common/Button';
import formatCurrency from '../../utils/formatCurrency';
import { useAuth } from '../../hooks/useAuth';
import { FiChevronRight, FiCreditCard, FiDollarSign, FiEye, FiInfo, FiPercent, FiPlus, FiRotateCcw, FiTag, FiX } from 'react-icons/fi';
import AvailableCouponsModal from './AvailableCouponsModal';
import PaymentModal from '../common/PaymentModal';
import OrderRejectionModal from './OrderRejectionModal';
import ManualRefundModal from './ManualRefundModal';

export const OrderDetailsModal = ({
  isOpen,
  order,
  onClose,
  onStatusChange,
  onViewEBill,
  onPaymentRecorded,
  onOrderUpdated,
  onContinueOrder,
  onProceedToBill,
}) => {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin' || user?.role === 'employee' || user?.role === 'SUPER_ADMIN';
  const canConfirmRefund = Boolean(
    user?.is_superuser ||
    user?.role === 'SUPER_ADMIN' ||
    user?.backendRole === 'SUPER_ADMIN' ||
    user?.role === 'ADMIN' ||
    user?.backendRole === 'ADMIN' ||
    user?.employee?.can_confirm_refund ||
    (user?.role === 'admin' && user?.backendRole !== 'CASHIER' && user?.backendRole !== 'CHEF' && user?.backendRole !== 'STAFF')
  );
  const [loading, setLoading] = useState(false);
  const [togglingServiceCharge, setTogglingServiceCharge] = useState(false);
  const [couponLoading, setCouponLoading] = useState(false);
  const [couponInput, setCouponInput] = useState('');
  const [couponError, setCouponError] = useState('');
  const [availableCoupons, setAvailableCoupons] = useState([]);
  const [couponsLoading, setCouponsLoading] = useState(false);
  const [couponsError, setCouponsError] = useState('');
  const [selectedCoupon, setSelectedCoupon] = useState(null);
  const [isCouponsModalOpen, setIsCouponsModalOpen] = useState(false);
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [paymentProcessing, setPaymentProcessing] = useState(false);
  const [paymentError, setPaymentError] = useState('');
  const [isRejectionModalOpen, setIsRejectionModalOpen] = useState(false);
  const [rejectionLoading, setRejectionLoading] = useState(false);
  const [rejectionError, setRejectionError] = useState('');
  const [isRefundModalOpen, setIsRefundModalOpen] = useState(false);
  const [refundLoading, setRefundLoading] = useState(false);
  const [refundError, setRefundError] = useState('');
  const [notice, setNotice] = useState(null);
  const [currentOrder, setCurrentOrder] = useState(order);

  useEffect(() => {
    setCurrentOrder(order);
  }, [order]);

  useEffect(() => {
    if (notice) {
      const timer = setTimeout(() => setNotice(null), 2500);
      return () => clearTimeout(timer);
    }
  }, [notice]);

  if (!currentOrder) return null;

  const isDineIn = currentOrder.orderType !== 'Takeaway' && currentOrder.order_type !== 'TAKEAWAY' && String(currentOrder.table || '').toLowerCase() !== 'takeaway';
  const isCompleted = ['Completed', 'COMPLETED', 'Delivered', 'DELIVERED', 'Done', 'DONE', 'Settled', 'SETTLED'].includes(currentOrder.status);
  const isActive = !['Cancelled', 'CANCELLED', 'Completed', 'COMPLETED'].includes(currentOrder.status);
  const isPaid = String(currentOrder.payment_status || '').toUpperCase() === 'PAID';
  const isServiceChargeActive = Number(currentOrder.service_charge_amount ?? currentOrder.serviceCharge ?? 0) > 0 || Number(currentOrder.service_charge_rate ?? 0) > 0;
  const appliedCouponsList = Array.isArray(currentOrder.applied_coupons) && currentOrder.applied_coupons.length > 0
    ? currentOrder.applied_coupons
    : (Array.isArray(currentOrder.coupon_codes) && currentOrder.coupon_codes.length > 0
        ? currentOrder.coupon_codes
        : String(currentOrder.coupon_code || currentOrder.voucher || currentOrder.voucherCode || currentOrder.coupon || '')
            .split(',')
            .map(s => s.trim())
            .filter(Boolean)
      ).map(c => typeof c === 'object' ? c : { code: c, discount: null });
  const appliedCouponDiscount = Number(currentOrder.coupon_discount_total || 0);
  const hasAppliedCoupon = appliedCouponDiscount > 0 || appliedCouponsList.length > 0;

  const formatPaymentMethod = (order) => {
    const rawMethod = String(
      order.paymentMethodName ||
      order.payment_method ||
      (order.paymentMethod && !['PAID', 'UNPAID', 'PENDING', 'FAILED', 'SUCCESS'].includes(String(order.paymentMethod).toUpperCase()) ? order.paymentMethod : '') ||
      ''
    ).toUpperCase().trim();

    if (!rawMethod) {
      const isOrderPaid = String(order.payment_status || order.paymentStatus || '').toUpperCase() === 'PAID';
      return isOrderPaid ? 'Cash' : 'Pending';
    }

    if (rawMethod.includes('RAZORPAY_UPI') || rawMethod === 'UPI') return 'UPI';
    if (rawMethod.includes('RAZORPAY_CARD') || rawMethod === 'CARD' || rawMethod.includes('CREDIT')) return 'Card';
    if (rawMethod === 'RAZORPAY') return 'Razorpay';
    if (rawMethod.includes('CASH') || rawMethod.includes('COD') || rawMethod.includes('COUNTER') || rawMethod.includes('PAY ON COUNTER')) return 'Cash';

    return rawMethod.charAt(0) + rawMethod.slice(1).toLowerCase();
  };

  const handleStatusUpdate = async (nextStatus) => {
    if (String(nextStatus).toLowerCase() === 'cancelled') {
      setIsRejectionModalOpen(true);
      return;
    }
    setLoading(true);
    try {
      await onStatusChange(currentOrder.id, nextStatus, '');
    } catch (e) {
      setNotice({ kind: 'error', text: e.message || 'The status could not be updated.' });
    }
    setLoading(false);
    onClose();
  };

  const handleConfirmRejection = async ({ scope, reason }) => {
    setRejectionLoading(true);
    setRejectionError('');
    try {
      const { rejectOrder } = await import('../../services/adminApi');
      const updated = await rejectOrder(currentOrder.id, { scope, reason });
      setCurrentOrder(updated);
      setIsRejectionModalOpen(false);
      setNotice({ kind: 'success', text: `Order #${updated.display_order_number || updated.display_number || updated.id} rejected successfully.` });
      if (onOrderUpdated) onOrderUpdated(updated);
      if (onStatusChange) onStatusChange(updated.id, 'Cancelled', reason);
      window.dispatchEvent(new CustomEvent('foodie_orders_updated', { detail: { orderId: currentOrder.id } }));
    } catch (e) {
      const msg = e?.response?.data?.detail || e?.message || 'Failed to reject order.';
      setRejectionError(msg);
    } finally {
      setRejectionLoading(false);
    }
  };

  const handleConfirmRefund = async (payload) => {
    setRefundLoading(true);
    setRefundError('');
    try {
      const { recordOrderRefund, getStaffOrder } = await import('../../services/adminApi');
      await recordOrderRefund(currentOrder.id, payload);
      const fresh = await getStaffOrder(currentOrder.id);
      setCurrentOrder(fresh);
      setIsRefundModalOpen(false);
      setNotice({ kind: 'success', text: payload.status === 'FAILED' ? 'Failed refund recorded.' : 'Manual refund confirmed successfully.' });
      if (onOrderUpdated) onOrderUpdated(fresh);
      window.dispatchEvent(new CustomEvent('foodie_orders_updated', { detail: { orderId: currentOrder.id } }));
    } catch (e) {
      const msg = e?.response?.data?.detail || e?.message || 'Failed to record refund.';
      setRefundError(msg);
    } finally {
      setRefundLoading(false);
    }
  };

  const handleToggleServiceCharge = async (nextChecked) => {
    if (togglingServiceCharge || loading) return;
    setTogglingServiceCharge(true);
    setNotice(null);
    try {
      const { updateOrderServiceCharge } = await import('../../services/adminApi');
      const updated = await updateOrderServiceCharge(currentOrder.id, nextChecked);
      setCurrentOrder(updated);
      if (onOrderUpdated) {
        onOrderUpdated(updated);
      }
      setNotice({
        kind: 'success',
        text: nextChecked
          ? `Service charge (${updated.service_charge_rate != null ? `${updated.service_charge_rate}%` : ''}) enabled for this order.`
          : 'Service charge removed for this order.',
      });
    } catch (e) {
      setNotice({
        kind: 'error',
        text: e?.message || 'Failed to update service charge for this order.',
      });
    } finally {
      setTogglingServiceCharge(false);
    }
  };

  const targetOrderId = currentOrder?.parent_order_id || currentOrder?.parent_order || currentOrder?.id;

  const loadEligibleCoupons = async () => {
    if (!targetOrderId || isPaid || isCompleted || String(currentOrder?.status || '').toLowerCase() === 'cancelled') {
      return;
    }
    setCouponsLoading(true);
    setCouponsError('');
    try {
      const { getOrderEligibleCoupons } = await import('../../services/adminApi');
      const res = await getOrderEligibleCoupons(targetOrderId);
      const list = Array.isArray(res?.coupons) ? res.coupons : [];
      setAvailableCoupons(list);
    } catch (err) {
      console.error('Failed to load eligible coupons:', err);
      setCouponsError('Failed to load coupons. Please try again.');
    } finally {
      setCouponsLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen && currentOrder && !isPaid && !isCompleted && String(currentOrder.status || '').toLowerCase() !== 'cancelled') {
      loadEligibleCoupons();
    }
  }, [isOpen, targetOrderId, isPaid, isCompleted, currentOrder?.status]);

  const handleSelectCoupon = (coupon) => {
    if (!coupon || !coupon.is_eligible) return;
    setSelectedCoupon(coupon);
    setCouponInput(coupon.code);
    setCouponError('');
  };

  const handleApplyCoupon = async (explicitCode = null) => {
    const codeToApply = (explicitCode || couponInput || selectedCoupon?.code || '').trim().toUpperCase();
    if (!codeToApply) {
      setCouponError('Please enter or select a coupon code.');
      return;
    }
    setCouponError('');
    setCouponLoading(true);
    try {
      const { applyOrderCoupon } = await import('../../services/adminApi');
      const targetId = currentOrder.parent_order_id || currentOrder.parent_order || currentOrder.id;
      const updated = await applyOrderCoupon(targetId, codeToApply);
      setCurrentOrder(updated);
      setCouponInput('');
      setSelectedCoupon(null);
      if (onOrderUpdated) onOrderUpdated(updated);
      setNotice({ kind: 'success', text: `Coupon ${codeToApply} applied successfully!` });
      loadEligibleCoupons();
    } catch (e) {
      const msg = e?.response?.data?.detail || e?.message || 'Failed to apply coupon.';
      const cleanMsg = typeof msg === 'string' && !msg.startsWith('<!DOCTYPE') && !msg.includes('Traceback') && !msg.includes('Python')
        ? msg
        : 'Failed to apply coupon. Please check coupon code and try again.';
      setCouponError(cleanMsg);
    } finally {
      setCouponLoading(false);
    }
  };

  const handleRemoveCoupon = async (specificCode = null) => {
    setCouponError('');
    setCouponLoading(true);
    try {
      const { removeOrderCoupon } = await import('../../services/adminApi');
      const targetId = currentOrder.parent_order_id || currentOrder.parent_order || currentOrder.id;
      const updated = await removeOrderCoupon(targetId, specificCode);
      setCurrentOrder(updated);
      setSelectedCoupon(null);
      setCouponInput('');
      if (onOrderUpdated) onOrderUpdated(updated);
      setNotice({ kind: 'success', text: specificCode ? `Coupon ${specificCode} removed successfully.` : 'Coupon removed successfully.' });
      loadEligibleCoupons();
    } catch (e) {
      const msg = e?.response?.data?.detail || e?.message || 'Failed to remove coupon.';
      setCouponError(msg);
    } finally {
      setCouponLoading(false);
    }
  };

  const handleCounterPay = async () => {
    if (isPaid) return;
    if (togglingServiceCharge || loading || paymentProcessing) return;
    setLoading(true);
    try {
      const { recordCounterPayment, getStaffOrder } = await import('../../services/adminApi');
      const targetId = currentOrder.parent_order_id || currentOrder.parent_order || currentOrder.id;
      await recordCounterPayment(targetId, 'COUNTER');
      setNotice({ kind: 'success', text: 'Payment marked as paid successfully.' });
      const updated = await getStaffOrder(targetId);
      setCurrentOrder(updated);
      if (onPaymentRecorded) await onPaymentRecorded(updated);
      if (onOrderUpdated) onOrderUpdated(updated);
      window.dispatchEvent(new CustomEvent('foodie_orders_updated'));
    } catch (e) {
      setNotice({ kind: 'error', text: e.message || 'Counter payment was not recorded.' });
    } finally {
      setLoading(false);
    }
  };

  const handleConfirmPayment = async (method, paymentResult) => {
    setPaymentProcessing(true);
    setPaymentError('');
    try {
      const targetId = currentOrder.parent_order_id || currentOrder.parent_order || currentOrder.id;
      if (method === 'CASH') {
        const { recordCounterPayment } = await import('../../services/adminApi');
        await recordCounterPayment(targetId, 'CASH');
      }
      // For RAZORPAY_UPI and RAZORPAY_CARD, payment was verified on backend by startRazorpayStandardCheckout
      const { getStaffOrder } = await import('../../services/adminApi');
      const updated = await getStaffOrder(targetId);
      setCurrentOrder(updated);
      setIsPaymentModalOpen(false);
      setNotice({ kind: 'success', text: `Payment confirmed successfully (${method === 'CASH' ? 'Cash' : 'Online'})!` });
      if (onPaymentRecorded) await onPaymentRecorded(updated);
      if (onOrderUpdated) onOrderUpdated(updated);
      window.dispatchEvent(new CustomEvent('foodie_orders_updated'));
    } catch (err) {
      const msg = err?.response?.data?.detail || err?.message || 'Failed to complete payment.';
      setPaymentError(msg);
      setNotice({ kind: 'error', text: msg });
    } finally {
      setPaymentProcessing(false);
    }
  };

  const displayItems = (currentOrder.combined_items && currentOrder.combined_items.length > 0)
    ? currentOrder.combined_items
    : (currentOrder.items || []);

  const paymentItems = displayItems.map((item, idx) => {
    const itemUnitPrice = Number(
      item.price != null ? item.price :
      item.unit_price != null ? item.unit_price :
      item.unitPrice != null ? item.unitPrice :
      item.sellingPrice != null ? item.sellingPrice :
      item.dish_price != null ? item.dish_price : 0
    );
    const itemQty = parseInt(item.quantity || item.qty || 1, 10) || 1;
    const itemLineTotal = Number(
      item.lineTotal != null ? item.lineTotal :
      item.line_total != null ? item.line_total :
      item.totalPrice != null ? item.totalPrice :
      item.total != null ? item.total :
      (itemUnitPrice * itemQty)
    );
    return {
      name: item.name || item.food_name || item.dish?.name || `Item ${idx + 1}`,
      quantity: itemQty,
      price: itemUnitPrice,
      line_total: itemLineTotal,
      options: item.extraIngredients ? item.extraIngredients.map(ex => typeof ex === 'string' ? { name: ex } : { name: ex?.name || ex?.title || '' }) : (item.options || []),
      specialInstructions: item.instructions || item.specialInstructions || item.special_instructions || '',
    };
  });

  const paymentOrderDetails = {
    orderId: currentOrder.parent_order_id || currentOrder.parent_order || currentOrder.id,
    orderNumber: currentOrder.display_order_number || currentOrder.display_number || currentOrder.order_number || currentOrder.id,
    customerName: currentOrder.customer_name || currentOrder.customer?.name || 'Walk-in Customer',
    customerPhone: currentOrder.customer_phone || currentOrder.customer?.phone || '',
    branchName: currentOrder.branch_name || currentOrder.branch?.name || 'Main Branch',
    tableLabel: currentOrder.table || currentOrder.table_label || currentOrder.table_number || '',
    orderType: currentOrder.orderType || currentOrder.order_type || (isDineIn ? 'DINE_IN' : 'TAKEAWAY'),
    items: paymentItems,
    pricing: {
      items_subtotal: currentOrder.combined_items_subtotal ?? currentOrder.subtotal ?? 0,
      customization_total: currentOrder.customization_total ?? 0,
      dish_discount_total: currentOrder.combined_dish_discount_total ?? currentOrder.dish_discount_total ?? currentOrder.dish_discount ?? currentOrder.menu_discount ?? 0,
      coupon_discount_total: appliedCouponDiscount,
      takeaway_charge: currentOrder.takeaway_charge ?? currentOrder.packingCharge ?? 0,
      gst_rate: currentOrder.gst_rate != null ? Number(currentOrder.gst_rate) : 5,
      gst_amount: currentOrder.combined_gst_amount ?? currentOrder.gst_amount ?? currentOrder.tax ?? 0,
      service_charge_amount: currentOrder.combined_service_charge_amount ?? currentOrder.service_charge_amount ?? currentOrder.serviceCharge ?? 0,
      total_amount: currentOrder.combined_total ?? currentOrder.total ?? 0,
    },
    couponCode: currentOrder.coupon_code || currentOrder.voucher || currentOrder.voucherCode || currentOrder.coupon || '',
    couponDiscount: appliedCouponDiscount,
  };

  const getActionButtons = () => {
    return (
      <div className="d-flex align-items-center justify-content-between w-100 flex-wrap gap-2">
        <div className="d-flex align-items-center gap-2">
          <button
            type="button"
            onClick={() => {
              if (onViewEBill) onViewEBill(currentOrder);
              else if (onProceedToBill) onProceedToBill(currentOrder);
            }}
            className="btn btn-outline-danger fw-bold d-flex align-items-center rounded-pill px-3.5 py-2"
            style={{ fontSize: '13px', gap: '8px' }}
          >
            <FiEye size={15} />
            <span>{isCompleted ? 'View E-Bill' : 'Proceed to Bill'}</span>
          </button>

          {onContinueOrder && isDineIn && isActive && (
            <button
              type="button"
              onClick={() => onContinueOrder(currentOrder)}
              className="btn btn-danger fw-bold d-flex align-items-center rounded-pill px-3.5 py-2 shadow-xs"
              style={{ fontSize: '13px', gap: '8px' }}
            >
              <FiPlus size={15} />
              <span>Continue Order</span>
            </button>
          )}
        </div>

        {isAdmin && (
          <div className="d-flex align-items-center gap-2 flex-wrap">
            {currentOrder.status === 'Pending' && (
              <Button
                variant="outline-danger"
                onClick={() => handleStatusUpdate('Cancelled')}
                disabled={loading || togglingServiceCharge || paymentProcessing}
                className="rounded-pill px-3"
              >
                Reject
              </Button>
            )}
            {currentOrder.status === 'Preparing' && (
              <Button
                variant="success"
                onClick={() => handleStatusUpdate('Ready')}
                loading={loading}
                disabled={togglingServiceCharge || paymentProcessing}
                className="rounded-pill px-3 bg-success border-success text-white"
              >
                Mark Ready
              </Button>
            )}
            {currentOrder.status === 'Ready' && (
              <Button
                variant="primary"
                onClick={() => handleStatusUpdate('Serving')}
                loading={loading}
                disabled={togglingServiceCharge || paymentProcessing}
                className="rounded-pill px-3"
              >
                Serve to Table
              </Button>
            )}
            {(currentOrder.status === 'Serving' || currentOrder.status === 'Served') && (
              <Button
                variant="primary"
                onClick={() => handleStatusUpdate('Completed')}
                loading={loading}
                disabled={togglingServiceCharge || paymentProcessing}
                className="rounded-pill px-3"
              >
                Complete Session (Settle Bill)
              </Button>
            )}
            {!isPaid && String(currentOrder.status || '').toLowerCase() !== 'cancelled' && (
              <Button
                variant="primary"
                onClick={() => setIsPaymentModalOpen(true)}
                disabled={loading || togglingServiceCharge || paymentProcessing}
                className="rounded-pill px-3.5 d-flex align-items-center gap-1.5 fw-bold"
                style={{ backgroundColor: '#F20D2D', borderColor: '#F20D2D' }}
              >
                <FiCreditCard size={15} />
                <span>Payment</span>
              </Button>
            )}
            {isPaid ? (
              <span className="badge bg-success rounded-pill px-3 py-2 fw-bold">Paid</span>
            ) : String(currentOrder.status || '').toLowerCase() !== 'cancelled' && (
              <Button 
                variant="outline-danger" 
                onClick={handleCounterPay} 
                disabled={loading || togglingServiceCharge || paymentProcessing} 
                className="rounded-pill px-3 fw-bold"
              >
                {(String(currentOrder.payment_status || '').toUpperCase() === 'PENDING' || String(currentOrder.payment_method || '').toUpperCase() === 'UPI')
                  ? 'Confirm Payment (UPI Received)'
                  : 'Mark as Paid'}
              </Button>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <Modal isOpen={isOpen} title={`Order details #${currentOrder.display_order_number || currentOrder.display_number || currentOrder.id}`} onClose={onClose} footerActions={getActionButtons()} size="lg">
      {notice && (
        <div className={`alert ${notice.kind === 'error' ? 'alert-danger' : 'alert-success'} py-2 px-3 small fw-semibold d-flex align-items-center justify-content-between mb-3`} role="status">
          <span>{notice.text}</span>
          <button type="button" className="btn-close btn-close-sm" onClick={() => setNotice(null)} style={{ fontSize: '10px' }} aria-label="Close" />
        </div>
      )}
      <div className="row g-4">
        {/* Left Column: Items and summary */}
        <div className="col-12 col-md-7">
          {currentOrder.parent_order_id && (
            <div className="alert alert-secondary py-2 px-3 small rounded-3 mb-3 d-flex align-items-center justify-content-between">
              <div>
                <strong>Continuation Order #{currentOrder.display_order_number || currentOrder.display_number || currentOrder.id}</strong>
                <span className="text-secondary ms-1">
                  (Parent Session: #{currentOrder.parent_order_display_number || currentOrder.parent_order_id})
                </span>
              </div>
              <span className="badge bg-secondary text-white">Suborder</span>
            </div>
          )}

          {currentOrder.has_continuations && (
            <div className="alert alert-info py-2 px-3 small rounded-3 mb-3 d-flex align-items-center justify-content-between">
              <div>
                <strong>Combined Dine-In Order</strong> (Includes continuation orders: #{currentOrder.display_order_number || currentOrder.id}
                {currentOrder.continuations?.map(c => `, #${c.display_order_number || c.id}`)})
              </div>
              <span className="badge bg-info text-dark">Combined</span>
            </div>
          )}

          {/* Refund Status Banner for Cancelled/Rejected Orders */}
          {String(currentOrder.status || '').toLowerCase() === 'cancelled' && (
            <div className={`p-3 rounded-3 mb-3 border ${
              currentOrder.refund_status === 'FULLY_REFUNDED' ? 'bg-success-subtle border-success-subtle text-success' :
              currentOrder.refund_status === 'PARTIALLY_REFUNDED' ? 'bg-warning-subtle border-warning-subtle text-warning-emphasis' :
              currentOrder.refund_status === 'FAILED' ? 'bg-danger-subtle border-danger-subtle text-danger' :
              currentOrder.refund_status === 'PENDING' ? 'bg-warning-subtle border-warning-subtle text-dark' :
              'bg-light border-light text-secondary'
            }`} style={{ fontSize: '12.5px' }}>
              <div className="d-flex align-items-center justify-content-between flex-wrap gap-2">
                <div className="d-flex align-items-center gap-2">
                  <FiRotateCcw size={16} />
                  <div>
                    <span className="fw-bold">
                      Refund Status:{' '}
                      {currentOrder.refund_status === 'FULLY_REFUNDED' ? 'Fully Refunded' :
                       currentOrder.refund_status === 'PARTIALLY_REFUNDED' ? 'Partially Refunded' :
                       currentOrder.refund_status === 'PENDING' ? 'Refund Pending' :
                       currentOrder.refund_status === 'FAILED' ? 'Refund Failed' :
                       'Not Applicable'}
                    </span>
                    {Number(currentOrder.refunded_amount || 0) > 0 && (
                      <span className="ms-1.5 fw-semibold">
                        ({formatCurrency(currentOrder.refunded_amount)} of {formatCurrency(currentOrder.total_amount || currentOrder.total)} refunded)
                      </span>
                    )}
                    {currentOrder.cancel_reason && (
                      <div className="text-muted small mt-0.5" style={{ fontSize: '11px' }}>
                        Reason: {currentOrder.cancel_reason}
                      </div>
                    )}
                  </div>
                </div>

                {/* Manual Refund Action Button */}
                {isAdmin && (currentOrder.refund_status === 'PENDING' || currentOrder.refund_status === 'PARTIALLY_REFUNDED' || currentOrder.refund_status === 'FAILED') && (
                  <div>
                    {canConfirmRefund ? (
                      <button
                        type="button"
                        onClick={() => setIsRefundModalOpen(true)}
                        className="btn btn-sm btn-danger rounded-pill px-3 py-1 fw-bold d-flex align-items-center gap-1 shadow-2xs"
                        style={{ fontSize: '12px', backgroundColor: '#F20D2D', borderColor: '#F20D2D' }}
                      >
                        <FiDollarSign size={13} />
                        <span>Process Manual Refund</span>
                      </button>
                    ) : (
                      <span className="badge bg-secondary-subtle text-secondary border px-2 py-1" title="Refunds must be confirmed by an Administrator or authorized Manager" style={{ fontSize: '11px' }}>
                        Admin Refund Authorization Required
                      </span>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          <h6 className="fw-bold text-dark mb-3">Items Ordered</h6>
          <div className="bg-light p-3 rounded-3 mb-4">
            {displayItems && displayItems.length > 0 ? displayItems.map((item, idx) => {
              const itemUnitPrice = Number(
                item.price != null ? item.price :
                item.unit_price != null ? item.unit_price :
                item.unitPrice != null ? item.unitPrice :
                item.sellingPrice != null ? item.sellingPrice :
                item.dish_price != null ? item.dish_price : 0
              );
              const itemQty = parseInt(item.quantity || item.qty || 1, 10) || 1;
              const itemLineTotal = Number(
                item.lineTotal != null ? item.lineTotal :
                item.line_total != null ? item.line_total :
                item.totalPrice != null ? item.totalPrice :
                item.total != null ? item.total :
                (itemUnitPrice * itemQty)
              );

              return (
                <div key={idx} className="d-flex align-items-start justify-content-between mb-2 small border-bottom border-light pb-2 last-border-0">
                  <div className="text-dark fw-semibold text-break me-2">
                    {item.order_display_number && (
                      <span className="badge bg-light text-dark border me-1 px-1.5 py-0.5" style={{ fontSize: '10px' }}>
                        #{item.order_display_number}
                      </span>
                    )}
                    {item.name || item.food_name || 'Dish Item'} <strong className="text-danger ms-1">x{itemQty}</strong>
                    {(item.discount > 0 || item.dish_discount > 0 || item.discount_amount > 0) && (
                      <div className="text-success fw-medium mt-0.5" style={{ fontSize: '11px' }}>
                        -{formatCurrency(item.dish_discount || item.discount || item.discount_amount)} off
                      </div>
                    )}
                    {item.instructions && <div className="text-muted fw-normal mt-1" style={{ fontSize: '11px' }}>Instructions: {item.instructions}</div>}
                    {item.extraIngredients && item.extraIngredients.length > 0 && (
                      <div className="text-muted fw-normal mt-1" style={{ fontSize: '11px' }}>
                        Extra ingredients: {item.extraIngredients.map(ex => {
                          if (typeof ex === 'string') return ex;
                          const name = ex?.name || ex?.title || '';
                          const price = Number(ex?.extra_price ?? ex?.price ?? 0);
                          return price > 0 ? `${name} (+₹${price.toFixed(2)})` : name;
                        }).filter(Boolean).join(', ')}
                      </div>
                    )}
                  </div>
                  <span className="fw-bold text-dark text-nowrap">{formatCurrency(itemLineTotal)}</span>
                </div>
              );
            }) : (
              <div className="text-muted small">No items recorded for this order.</div>
            )}
          </div>

          <div className="d-flex align-items-center justify-content-between mb-2.5">
            <h6 className="fw-bold text-dark mb-0">Invoice calculations</h6>
            <div className="d-flex align-items-center gap-2">
              {hasAppliedCoupon && (
                <span className="badge bg-success-subtle text-success border border-success-subtle rounded-pill px-2.5 py-1" style={{ fontSize: '11px' }}>
                  {appliedCouponsList.length > 1 ? `${appliedCouponsList.length} Coupons Applied` : 'Coupon Applied'}
                </span>
              )}
              {!isPaid && !isCompleted && String(currentOrder.status || '').toLowerCase() !== 'cancelled' && (
                <button
                  type="button"
                  onClick={() => {
                    loadEligibleCoupons();
                    setIsCouponsModalOpen(true);
                  }}
                  className="btn btn-link btn-sm p-0 text-danger fw-bold text-decoration-none d-inline-flex align-items-center gap-1"
                  style={{ fontSize: '12px', cursor: 'pointer' }}
                  title="View all available coupons"
                >
                  View More <FiChevronRight size={13} />
                </button>
              )}
            </div>
          </div>

          {/* REQ-5 & REQ-33 & REQ-50: Applied coupons and promo coupon input */}
          {!isPaid && !isCompleted && String(currentOrder.status || '').toLowerCase() !== 'cancelled' && (
            <div className="p-2.5 bg-light rounded-3 mb-3 border">
              {appliedCouponsList.length > 0 && (
                <div className={`d-flex flex-column gap-2 ${appliedCouponsList.length < 2 ? 'mb-2.5 pb-2 border-bottom' : ''}`}>
                  {appliedCouponsList.map((ac) => {
                    const code = ac.code;
                    const disc = ac.discount ? Number(ac.discount) : (appliedCouponsList.length === 1 ? appliedCouponDiscount : null);
                    return (
                      <div key={code} className="d-flex align-items-center justify-content-between">
                        <div className="d-flex align-items-center gap-2 flex-wrap">
                          <span
                            className="badge font-monospace fw-bold px-2.5 py-1 border rounded-pill d-inline-flex align-items-center gap-1"
                            style={{ backgroundColor: '#DCFCE7', color: '#166534', borderColor: '#BBF7D0', fontSize: '11px' }}
                          >
                            <FiTag size={11} /> {code}
                          </span>
                          {ac.is_first_time && (
                            <span className="badge bg-danger-subtle text-danger rounded-pill px-2 py-0.5" style={{ fontSize: '10px' }}>
                              New User
                            </span>
                          )}
                          {disc !== null && (
                            <span className="small fw-bold text-success">
                              -{formatCurrency(disc)}
                            </span>
                          )}
                        </div>
                        <button
                          type="button"
                          onClick={() => handleRemoveCoupon(code)}
                          disabled={couponLoading || loading}
                          className="btn btn-sm btn-outline-danger rounded-pill px-2.5 py-0.5 fw-semibold d-inline-flex align-items-center gap-1"
                          style={{ fontSize: '11px' }}
                          title={`Remove coupon ${code}`}
                        >
                          {couponLoading ? '...' : <><FiX size={12} /> Remove</>}
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}

              {appliedCouponsList.length < 2 && (
                <div>
                  <div className="d-flex align-items-center gap-2">
                    <FiTag className="text-danger flex-shrink-0" size={15} />
                    <input
                      type="text"
                      className="form-control form-control-sm bg-white"
                      placeholder={appliedCouponsList.length === 1 ? "Add second eligible coupon" : "Enter promo coupon code"}
                      value={couponInput}
                      onChange={(e) => {
                        const val = e.target.value.toUpperCase();
                        setCouponInput(val);
                        if (selectedCoupon && selectedCoupon.code !== val) {
                          setSelectedCoupon(null);
                        }
                      }}
                      onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleApplyCoupon(); } }}
                      disabled={couponLoading || loading}
                      style={{ height: '34px', fontSize: '12px' }}
                    />
                    <button
                      type="button"
                      onClick={() => handleApplyCoupon()}
                      disabled={couponLoading || loading || !(couponInput.trim() || selectedCoupon?.code)}
                      className="btn btn-sm btn-danger rounded-pill px-3.5 fw-bold text-nowrap"
                      style={{ height: '34px', fontSize: '12px', backgroundColor: '#F20D2D', borderColor: '#F20D2D' }}
                    >
                      {couponLoading ? 'Applying...' : 'Apply'}
                    </button>
                  </div>
                  {couponError && (
                    <div className="text-danger small mt-1.5 ms-1" style={{ fontSize: '11px' }}>
                      {couponError}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          <div className="small p-3 border rounded-3 bg-white shadow-xs">
            <div className="d-flex align-items-center justify-content-between mb-1.5">
              <span className="text-secondary">Subtotal</span>
              <span className="text-dark fw-bold">{formatCurrency(currentOrder.combined_items_subtotal ?? currentOrder.subtotal)}</span>
            </div>
            {Number(currentOrder.combined_dish_discount_total ?? currentOrder.dish_discount_total ?? currentOrder.dish_discount ?? currentOrder.menu_discount ?? 0) > 0 && (
              <div className="d-flex align-items-center justify-content-between mb-1.5 text-success">
                <span>Menu Discounts</span>
                <span className="fw-bold">-{formatCurrency(currentOrder.combined_dish_discount_total ?? currentOrder.dish_discount_total ?? currentOrder.dish_discount ?? currentOrder.menu_discount)}</span>
              </div>
            )}
            {hasAppliedCoupon && (
              <div className="d-flex align-items-center justify-content-between mb-1.5 text-success">
                <span>Coupon / Voucher Discount</span>
                <span className="fw-bold">-{formatCurrency(appliedCouponDiscount)}</span>
              </div>
            )}
            {appliedCouponsList.length > 1 ? (
              appliedCouponsList.map((ac) => {
                const disc = ac.discount ? Number(ac.discount) : null;
                return (
                  <div key={ac.code} className="d-flex align-items-center justify-content-between mb-1 ps-2 text-success" style={{ fontSize: '11.5px' }}>
                    <span>• {ac.code}{ac.is_first_time ? ' (New User)' : ''}</span>
                    {disc !== null && <span className="font-monospace fw-semibold">-{formatCurrency(disc)}</span>}
                  </div>
                );
              })
            ) : (
              hasAppliedCoupon && Boolean(currentOrder.coupon_code || currentOrder.voucher || currentOrder.voucherCode || currentOrder.coupon) && (
                <div className="d-flex align-items-center justify-content-between mb-1.5 text-success">
                  <span>Voucher Code</span>
                  <span className="fw-bold font-monospace">{currentOrder.coupon_code || currentOrder.voucher || currentOrder.voucherCode || currentOrder.coupon}</span>
                </div>
              )
            )}
            {Number(currentOrder.takeaway_charge || currentOrder.packingCharge || 0) > 0 && (
              <div className="d-flex align-items-center justify-content-between mb-1.5 text-dark">
                <span className="text-secondary">Takeaway charge</span>
                <span className="text-dark fw-bold">+{formatCurrency(currentOrder.takeaway_charge ?? currentOrder.packingCharge)}</span>
              </div>
            )}
            <div className="d-flex align-items-center justify-content-between mb-1.5">
              <span className="text-secondary">GST{currentOrder.gst_rate != null && currentOrder.gst_rate !== '' ? ` (${currentOrder.gst_rate}%)` : ''}</span>
              <span className="text-dark fw-bold">{formatCurrency(currentOrder.gst_amount ?? currentOrder.tax ?? 0)}</span>
            </div>
            <div className="d-flex align-items-center justify-content-between mb-1.5 py-0.5">
              <div className="d-flex align-items-center gap-2">
                <span className="text-secondary">
                  Service charge{currentOrder.service_charge_rate != null && currentOrder.service_charge_rate !== '' ? ` (${currentOrder.service_charge_rate}%)` : ''}
                </span>
                {isAdmin && (
                  <div className="form-check form-switch m-0 d-inline-flex align-items-center" style={{ minHeight: 'auto' }}>
                    <input
                      id="order-service-charge-toggle"
                      className="form-check-input cursor-pointer m-0"
                      type="checkbox"
                      role="switch"
                      checked={isServiceChargeActive}
                      onChange={(e) => handleToggleServiceCharge(e.target.checked)}
                      disabled={togglingServiceCharge || loading}
                      title={isServiceChargeActive ? "Disable service charge for this order" : "Enable service charge for this order"}
                      style={{ width: '32px', height: '17px', cursor: (togglingServiceCharge || loading) ? 'not-allowed' : 'pointer' }}
                    />
                  </div>
                )}
              </div>
              <span className="text-dark fw-bold d-flex align-items-center gap-1">
                {togglingServiceCharge ? (
                  <span className="spinner-border spinner-border-sm text-secondary" style={{ width: '12px', height: '12px' }} />
                ) : (
                  formatCurrency(currentOrder.service_charge_amount ?? currentOrder.serviceCharge ?? 0)
                )}
              </span>
            </div>
            {Number(currentOrder.paid_amount || 0) > 0 && (
              <div className="d-flex align-items-center justify-content-between mb-1.5 text-success">
                <span>Paid Amount</span>
                <span className="fw-bold">{formatCurrency(currentOrder.paid_amount)}</span>
              </div>
            )}
            {currentOrder.balance_due != null && Number(currentOrder.balance_due) > 0 && (
              <div className="d-flex align-items-center justify-content-between mb-1.5 text-danger">
                <span>Balance Due</span>
                <span className="fw-bold">{formatCurrency(currentOrder.balance_due)}</span>
              </div>
            )}
            <div className="d-flex align-items-center justify-content-between border-top pt-2.5 mt-2.5 fw-bold text-danger fs-5">
              <span>Grand Total</span>
              <span>{formatCurrency(currentOrder.combined_total ?? currentOrder.total)}</span>
            </div>
          </div>
        </div>

        {/* Right Column: Order Context Info and history logs */}
        <div className="col-12 col-md-5 border-start border-light-subtle">
          <h6 className="fw-bold text-dark mb-3">Order Details</h6>
          <div className="p-3 border rounded-3 bg-light mb-4 small">
            <div className="mb-2">Order Type: <strong className="text-danger">{currentOrder.orderType === 'Takeaway' || String(currentOrder.table).toLowerCase() === 'takeaway' ? 'Takeaway' : 'Table Dine-In'}</strong></div>
            {currentOrder.orderType !== 'Takeaway' && String(currentOrder.table).toLowerCase() !== 'takeaway' && (
              <>
                <div className="mb-2">Table No: <strong>{currentOrder.table}</strong></div>
                {(currentOrder.diners || currentOrder.number_of_diners) && (
                  <div className="mb-2">Diners: <strong>{currentOrder.diners || currentOrder.number_of_diners} {Number(currentOrder.diners || currentOrder.number_of_diners) === 1 ? 'Diner' : 'Diners'}</strong></div>
                )}
              </>
            )}
            {(currentOrder.customer_phone || currentOrder.customerPhone || currentOrder.customer?.phone) && (
              <div className="mb-2">Customer Phone: <strong className="text-dark">{currentOrder.customer_phone || currentOrder.customerPhone || currentOrder.customer?.phone}</strong></div>
            )}
            {(currentOrder.customer_name || currentOrder.customerName || currentOrder.customer?.name) && (
              <div className="mb-2">Customer Name: <strong className="text-dark">{currentOrder.customer_name || currentOrder.customerName || currentOrder.customer?.name}</strong></div>
            )}
            <div className="mb-2 d-flex align-items-center gap-1.5 flex-wrap">
              <span>Payment Status: </span>
              {isPaid ? (
                <span className="badge bg-success-subtle text-success rounded-pill px-2.5 py-0.5 fw-bold" style={{ fontSize: '11px' }}>Paid</span>
              ) : (String(currentOrder.payment_status || '').toUpperCase() === 'PENDING' || String(currentOrder.payment_method || '').toUpperCase() === 'UPI') ? (
                <span className="badge bg-warning-subtle text-warning-emphasis border border-warning-subtle rounded-pill px-2.5 py-0.5 fw-bold" style={{ fontSize: '11px' }}>Pending Verification (UPI)</span>
              ) : (
                <span className="badge bg-secondary-subtle text-secondary rounded-pill px-2.5 py-0.5 fw-bold" style={{ fontSize: '11px' }}>Unpaid</span>
              )}
            </div>
            <div className="mb-2">Payment Method: <strong>{formatPaymentMethod(currentOrder)}</strong></div>
            <div>Date/Time: <strong>{[currentOrder.date, currentOrder.time].filter(Boolean).join(' ')}</strong></div>
          </div>

          <h6 className="fw-bold text-dark mb-3">Operation History</h6>
          <div className="d-flex flex-column gap-3 small border-start ps-3" style={{ maxHeight: '180px', overflowY: 'auto' }}>
            {currentOrder.history?.map((h, idx) => (
              <div key={idx} className="position-relative mb-2">
                <span className="position-absolute bg-danger rounded-circle" style={{ width: '8px', height: '8px', left: '-21px', top: '5px' }}></span>
                <div className="fw-bold text-dark">{h.action}</div>
                <div className="text-secondary" style={{ fontSize: '11px' }}>{h.operator} | {h.time}</div>
                <p className="text-muted mb-0 mt-0.5" style={{ fontSize: '11px' }}>{h.message}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Dedicated View More Coupons Popup */}
      <AvailableCouponsModal
        isOpen={isCouponsModalOpen}
        onClose={() => setIsCouponsModalOpen(false)}
        coupons={availableCoupons}
        loading={couponsLoading}
        currentOrder={currentOrder}
        onApplyCoupon={async (code) => {
          await handleApplyCoupon(code);
        }}
        onRemoveCoupon={async (code) => {
          await handleRemoveCoupon(code);
        }}
        isProcessing={couponLoading}
      />

      {/* Universal Two-Section Payment Modal */}
      {isPaymentModalOpen && (
        <PaymentModal
          isOpen={isPaymentModalOpen}
          onClose={() => {
            setIsPaymentModalOpen(false);
            setPaymentError('');
          }}
          orderDetails={paymentOrderDetails}
          onConfirmPayment={handleConfirmPayment}
          loading={paymentProcessing}
          error={paymentError}
          isStaff={isAdmin}
        />
      )}

      {/* Custom Foodie Order Rejection Modal */}
      {isRejectionModalOpen && (
        <OrderRejectionModal
          isOpen={isRejectionModalOpen}
          onClose={() => {
            setIsRejectionModalOpen(false);
            setRejectionError('');
          }}
          order={currentOrder}
          onConfirmReject={handleConfirmRejection}
          loading={rejectionLoading}
          error={rejectionError}
        />
      )}

      {/* Manual Refund Management Modal */}
      {isRefundModalOpen && (
        <ManualRefundModal
          isOpen={isRefundModalOpen}
          onClose={() => {
            setIsRefundModalOpen(false);
            setRefundError('');
          }}
          order={currentOrder}
          onConfirmRefund={handleConfirmRefund}
          loading={refundLoading}
          error={refundError}
        />
      )}
    </Modal>
  );
};
export default OrderDetailsModal;
