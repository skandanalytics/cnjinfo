import React, { useState, useEffect } from 'react';
import Modal from '../common/Modal';
import Button from '../common/Button';
import formatCurrency from '../../utils/formatCurrency';
import { useAuth } from '../../hooks/useAuth';
import { FiEye, FiPlus } from 'react-icons/fi';

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
  const [loading, setLoading] = useState(false);
  const [togglingServiceCharge, setTogglingServiceCharge] = useState(false);
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

  const handleStatusUpdate = async (nextStatus) => {
    let reason;
    if (String(nextStatus).toLowerCase() === 'cancelled') {
      reason = window.prompt('Enter a reason for cancelling this order.');
      if (!reason || !reason.trim()) return;
      reason = reason.trim();
    }
    setLoading(true);
    try {
      await onStatusChange(currentOrder.id, nextStatus, reason);
    } catch (e) {
      setNotice({ kind: 'error', text: e.message || 'The status could not be updated.' });
    }
    setLoading(false);
    onClose();
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

  const handleCounterPay = async () => {
    if (isPaid) return;
    if (togglingServiceCharge || loading) return;
    setLoading(true);
    try {
      const { recordCounterPayment } = await import('../../services/adminApi');
      await recordCounterPayment(currentOrder.id);
      setNotice({ kind: 'success', text: 'Payment marked as paid successfully.' });
      if (onPaymentRecorded) await onPaymentRecorded();
    } catch (e) {
      setNotice({ kind: 'error', text: e.message || 'Counter payment was not recorded.' });
    }
    setLoading(false);
    onClose();
  };

  const displayItems = (currentOrder.combined_items && currentOrder.combined_items.length > 0)
    ? currentOrder.combined_items
    : (currentOrder.items || []);

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
            className="btn btn-outline-danger fw-bold d-flex align-items-center gap-1.5 rounded-pill px-3 py-2"
            style={{ fontSize: '13px' }}
          >
            <FiEye size={15} />
            <span>{isCompleted ? 'View E-Bill' : 'Proceed to Bill'}</span>
          </button>

          {onContinueOrder && isDineIn && isActive && (
            <button
              type="button"
              onClick={() => onContinueOrder(currentOrder)}
              className="btn btn-danger fw-bold d-flex align-items-center gap-1.5 rounded-pill px-3 py-2 shadow-xs"
              style={{ fontSize: '13px' }}
            >
              <FiPlus size={15} />
              <span>Continue Order</span>
            </button>
          )}
        </div>

        {isAdmin && (
          <div className="d-flex align-items-center gap-2 flex-wrap">
            {currentOrder.status === 'Pending' && (
              <>
                <Button variant="outline-danger" onClick={() => handleStatusUpdate('Cancelled')} disabled={loading || togglingServiceCharge} className="rounded-pill px-3">
                  Reject
                </Button>
                <Button variant="primary" onClick={() => handleStatusUpdate('Preparing')} loading={loading} disabled={togglingServiceCharge} className="rounded-pill px-3">
                  Start Preparing
                </Button>
              </>
            )}
            {currentOrder.status === 'Preparing' && (
              <Button variant="success" onClick={() => handleStatusUpdate('Ready')} loading={loading} disabled={togglingServiceCharge} className="rounded-pill px-3 bg-success border-success text-white">
                Mark Ready
              </Button>
            )}
            {currentOrder.status === 'Ready' && (
              <Button variant="primary" onClick={() => handleStatusUpdate('Serving')} loading={loading} disabled={togglingServiceCharge} className="rounded-pill px-3">
                Serve to Table
              </Button>
            )}
            {(currentOrder.status === 'Serving' || currentOrder.status === 'Served') && (
              <Button variant="primary" onClick={() => handleStatusUpdate('Completed')} loading={loading} disabled={togglingServiceCharge} className="rounded-pill px-3">
                Complete Session (Settle Bill)
              </Button>
            )}
            {isPaid ? (
              <span className="badge bg-success rounded-pill px-3 py-2 fw-bold">Paid</span>
            ) : String(currentOrder.status || '').toLowerCase() !== 'cancelled' && (
              <Button 
                variant="outline-danger" 
                onClick={handleCounterPay} 
                disabled={loading || togglingServiceCharge} 
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
          {currentOrder.has_continuations && (
            <div className="alert alert-info py-2 px-3 small rounded-3 mb-3 d-flex align-items-center justify-content-between">
              <div>
                <strong>Combined Dine-In Order</strong> (Includes continuation orders: #{currentOrder.display_order_number || currentOrder.id}
                {currentOrder.continuations?.map(c => `, #${c.display_order_number || c.id}`)})
              </div>
              <span className="badge bg-info text-dark">Combined</span>
            </div>
          )}

          <h6 className="fw-bold text-dark mb-3">Items Ordered</h6>
          <div className="bg-light p-3 rounded-3 mb-4">
            {displayItems && displayItems.length > 0 ? displayItems.map((item, idx) => (
              <div key={idx} className="d-flex align-items-start justify-content-between mb-2 small border-bottom border-light pb-2 last-border-0">
                <div className="text-dark fw-semibold text-break me-2">
                  {item.order_display_number && (
                    <span className="badge bg-light text-dark border me-1 px-1.5 py-0.5" style={{ fontSize: '10px' }}>
                      #{item.order_display_number}
                    </span>
                  )}
                  {item.name || 'Dish Item'} <strong className="text-danger ms-1">x{item.quantity || 1}</strong>
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
                <span className="fw-bold text-dark text-nowrap">{formatCurrency(item.lineTotal != null ? item.lineTotal : (item.price || 0) * (item.quantity || 1))}</span>
              </div>
            )) : (
              <div className="text-muted small">No items recorded for this order.</div>
            )}
          </div>

          <h6 className="fw-bold text-dark mb-3">Invoice calculations</h6>
          <div className="small p-2 border rounded-3">
            <div className="d-flex align-items-center justify-content-between mb-1">
              <span className="text-secondary">Subtotal</span>
              <span className="text-dark fw-bold">{formatCurrency(currentOrder.combined_items_subtotal ?? currentOrder.subtotal)}</span>
            </div>
            {currentOrder.discount > 0 && (
              <div className="d-flex align-items-center justify-content-between mb-1 text-success">
                <span>Voucher Discount</span>
                <span className="fw-bold">-{formatCurrency(currentOrder.discount)}</span>
              </div>
            )}
            {(currentOrder.voucher || currentOrder.voucherCode || currentOrder.coupon) && (
              <div className="d-flex align-items-center justify-content-between mb-1 text-success">
                <span>Voucher Applied</span>
                <span className="fw-bold font-monospace">{currentOrder.voucher || currentOrder.voucherCode || currentOrder.coupon}</span>
              </div>
            )}
            {Number(currentOrder.takeaway_charge || currentOrder.packingCharge || 0) > 0 && (
              <div className="d-flex align-items-center justify-content-between mb-1 text-dark">
                <span className="text-secondary">Takeaway charge</span>
                <span className="text-dark fw-bold">+{formatCurrency(currentOrder.takeaway_charge ?? currentOrder.packingCharge)}</span>
              </div>
            )}
            <div className="d-flex align-items-center justify-content-between mb-1">
              <span className="text-secondary">GST{currentOrder.gst_rate != null && currentOrder.gst_rate !== '' ? ` (${currentOrder.gst_rate}%)` : ''}</span>
              <span className="text-dark fw-bold">{formatCurrency(currentOrder.gst_amount ?? currentOrder.tax ?? 0)}</span>
            </div>
            <div className="d-flex align-items-center justify-content-between mb-1 py-0.5">
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
              <div className="d-flex align-items-center justify-content-between mb-1 text-success">
                <span>Paid Amount</span>
                <span className="fw-bold">{formatCurrency(currentOrder.paid_amount)}</span>
              </div>
            )}
            {currentOrder.balance_due != null && Number(currentOrder.balance_due) > 0 && (
              <div className="d-flex align-items-center justify-content-between mb-1 text-danger">
                <span>Balance Due</span>
                <span className="fw-bold">{formatCurrency(currentOrder.balance_due)}</span>
              </div>
            )}
            <div className="d-flex align-items-center justify-content-between border-top pt-2 mt-2 fw-bold text-danger fs-5">
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
            <div className="mb-2">Source: <strong>{currentOrder.source}</strong></div>
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
            <div className="mb-2">Payment Method: <strong>{currentOrder.paymentMethod || currentOrder.payment_method || 'COUNTER'}</strong></div>
            <div>Date/Time: <strong>{currentOrder.date} at {currentOrder.time}</strong></div>
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
    </Modal>
  );
};
export default OrderDetailsModal;
