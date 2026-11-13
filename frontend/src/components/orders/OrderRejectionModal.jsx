import React, { useState } from 'react';
import { FiAlertTriangle, FiX, FiCheck, FiInfo, FiLayers } from 'react-icons/fi';
import formatCurrency from '../../utils/formatCurrency';

/**
 * Custom Foodie Rejection Modal.
 * Replaces browser-native prompt/alert/confirm dialogs in order rejection workflows.
 * Supports:
 *  - Individual order rejection
 *  - Entire-session rejection for combined dine-in sessions (honors block_entire rule)
 *  - Optional cancellation reason
 *  - Proper stacking (z-index: 1070) above OrderDetailsModal
 */
export const OrderRejectionModal = ({
  isOpen,
  onClose,
  order,
  onConfirmReject,
  loading = false,
  error = '',
}) => {
  const [scope, setScope] = useState('INDIVIDUAL'); // 'INDIVIDUAL' | 'ENTIRE_SESSION'
  const [reason, setReason] = useState('');
  const [localError, setLocalError] = useState('');

  if (!isOpen || !order) return null;

  const isCombinedSession = Boolean(order.has_continuations || (order.continuations && order.continuations.length > 0) || order.parent_order_id);
  const continuations = order.continuations || [];
  const allSessionOrders = isCombinedSession
    ? [order, ...continuations]
    : [order];

  // Rule: block_completed & block_entire
  // Check if any order in session is completed or served
  const completedOrServedOrders = allSessionOrders.filter(o => {
    const st = String(o.status || o.backendStatus || '').toUpperCase();
    return st === 'COMPLETED' || st === 'SERVED';
  });

  const isCurrentOrderCompletedOrServed = String(order.status || order.backendStatus || '').toUpperCase() === 'COMPLETED' ||
    String(order.status || order.backendStatus || '').toUpperCase() === 'SERVED';

  const canRejectEntireSession = completedOrServedOrders.length === 0;

  const isPaid = String(order.paymentStatus || order.payment_status || '').toUpperCase() === 'PAID';
  const paymentMethod = order.paymentMethod || order.payment_method || order.paymentMethodName || 'N/A';
  const orderAmount = Number(order.total || order.total_amount || 0);

  const displayOrderNo = order.display_order_number || order.display_number || order.orderNumber || order.id;
  const parentSessionId = order.parent_order_display_number || order.parent_order_id || (order.has_continuations ? displayOrderNo : null);

  const handleSubmit = (e) => {
    e.preventDefault();
    setLocalError('');

    if (isCurrentOrderCompletedOrServed) {
      setLocalError(`Order #${displayOrderNo} is already ${order.status} and cannot be rejected.`);
      return;
    }

    if (scope === 'ENTIRE_SESSION' && !canRejectEntireSession) {
      const blockedList = completedOrServedOrders.map(o => `#${o.display_order_number || o.id} (${o.status})`).join(', ');
      setLocalError(`Cannot reject entire session because the following order(s) are completed or served: ${blockedList}. You may reject eligible orders individually.`);
      return;
    }

    if (onConfirmReject) {
      onConfirmReject({
        scope,
        reason: reason.trim(),
      });
    }
  };

  const activeError = localError || error;

  return (
    <div
      className="modal fade show d-block"
      style={{
        backgroundColor: 'rgba(15, 23, 42, 0.7)',
        backdropFilter: 'blur(4px)',
        zIndex: 1070,
      }}
      tabIndex="-1"
      role="dialog"
      aria-modal="true"
    >
      <div className="modal-dialog modal-dialog-centered" style={{ maxWidth: '560px' }}>
        <div className="modal-content rounded-4 border-0 shadow-2xl overflow-hidden" style={{ backgroundColor: '#FFFFFF' }}>

          {/* Modal Header */}
          <div className="modal-header px-4 py-3 border-bottom d-flex align-items-center justify-content-between" style={{ backgroundColor: '#FEF2F2' }}>
            <div className="d-flex align-items-center gap-2.5">
              <div
                className="rounded-circle d-flex align-items-center justify-content-center text-danger"
                style={{ width: '36px', height: '36px', backgroundColor: '#FEE2E2' }}
              >
                <FiAlertTriangle size={18} />
              </div>
              <div>
                <h5 className="modal-title fw-bold text-danger mb-0" style={{ fontSize: '16px' }}>
                  Reject Order #{displayOrderNo}
                </h5>
                <span className="text-secondary small" style={{ fontSize: '11.5px' }}>
                  {order.orderType || order.order_type || 'Order'} {order.table ? `• Table ${order.table}` : ''}
                </span>
              </div>
            </div>
            <button
              type="button"
              className="btn-close shadow-none"
              onClick={onClose}
              disabled={loading}
              aria-label="Close"
            />
          </div>

          {/* Modal Body */}
          <form onSubmit={handleSubmit}>
            <div className="modal-body p-4">

              {/* Error Alert */}
              {activeError && (
                <div className="alert alert-danger py-2.5 px-3 small rounded-3 mb-3 d-flex align-items-start gap-2" role="alert">
                  <FiAlertTriangle size={16} className="text-danger flex-shrink-0 mt-0.5" />
                  <div className="flex-grow-1">{activeError}</div>
                  <button type="button" className="btn-close btn-close-sm" onClick={() => setLocalError('')} aria-label="Close" style={{ fontSize: '10px' }} />
                </div>
              )}

              {/* Order Context Card */}
              <div className="p-3 rounded-3 border bg-light-subtle mb-3" style={{ fontSize: '12.5px' }}>
                <div className="d-flex justify-content-between align-items-center mb-1.5 pb-1.5 border-bottom border-light">
                  <span className="text-secondary">Order ID / Reference:</span>
                  <span className="fw-bold text-dark font-monospace">#{displayOrderNo}</span>
                </div>
                {parentSessionId && (
                  <div className="d-flex justify-content-between align-items-center mb-1.5 pb-1.5 border-bottom border-light">
                    <span className="text-secondary">Parent / Session Reference:</span>
                    <span className="fw-bold text-dark font-monospace">#{parentSessionId}</span>
                  </div>
                )}
                {order.customerName || order.customer_name ? (
                  <div className="d-flex justify-content-between align-items-center mb-1.5 pb-1.5 border-bottom border-light">
                    <span className="text-secondary">Customer:</span>
                    <span className="fw-semibold text-dark">{order.customerName || order.customer_name} {order.customerPhone ? `(${order.customerPhone})` : ''}</span>
                  </div>
                ) : null}
                <div className="d-flex justify-content-between align-items-center mb-1.5 pb-1.5 border-bottom border-light">
                  <span className="text-secondary">Payment State:</span>
                  <span className={`badge rounded-pill fw-bold px-2 py-0.5 ${isPaid ? 'bg-success-subtle text-success' : 'bg-danger-subtle text-danger'}`}>
                    {isPaid ? 'PAID' : 'UNPAID'} {paymentMethod !== 'N/A' ? `(${paymentMethod.toUpperCase()})` : ''}
                  </span>
                </div>
                <div className="d-flex justify-content-between align-items-center">
                  <span className="text-secondary">Order Amount:</span>
                  <span className="fw-bold text-dark fs-6">{formatCurrency(orderAmount)}</span>
                </div>
              </div>

              {/* Paid Warning & Refund Notice */}
              {isPaid ? (
                <div className="alert alert-warning py-2 px-3 small rounded-3 mb-3 d-flex align-items-start gap-2">
                  <FiInfo size={16} className="text-warning-emphasis flex-shrink-0 mt-0.5" />
                  <div style={{ fontSize: '12px' }}>
                    <strong>Paid Order Notice:</strong> This order has been paid. Rejecting it will mark its refund status as <strong>Refund Pending</strong>. Foodie uses manual refund recording; no automatic gateway charges will occur.
                  </div>
                </div>
              ) : (
                <div className="alert alert-info py-2 px-3 small rounded-3 mb-3 d-flex align-items-start gap-2">
                  <FiInfo size={16} className="text-info-emphasis flex-shrink-0 mt-0.5" />
                  <div style={{ fontSize: '12px' }}>
                    <strong>Unpaid Order:</strong> Rejecting an unpaid order sets refund status to <strong>Not Applicable</strong>.
                  </div>
                </div>
              )}

              {/* Combined Session Scope Selection */}
              {isCombinedSession && (
                <div className="mb-3">
                  <label className="form-label fw-bold small text-dark d-flex align-items-center gap-1.5 mb-1.5">
                    <FiLayers size={14} className="text-danger" />
                    Rejection Scope for Combined Dine-In Session
                  </label>

                  <div className="d-flex flex-column gap-2">
                    {/* Option 1: Reject Selected Order */}
                    <div
                      className={`p-2.5 rounded-3 border cursor-pointer transition-all ${scope === 'INDIVIDUAL' ? 'border-danger bg-danger-subtle' : 'bg-white'}`}
                      onClick={() => setScope('INDIVIDUAL')}
                      style={{ cursor: 'pointer' }}
                    >
                      <div className="d-flex align-items-center justify-content-between">
                        <div className="form-check m-0">
                          <input
                            type="radio"
                            className="form-check-input"
                            id="scope-individual"
                            name="rejection-scope"
                            checked={scope === 'INDIVIDUAL'}
                            onChange={() => setScope('INDIVIDUAL')}
                          />
                          <label className="form-check-label fw-bold text-dark ms-1" htmlFor="scope-individual" style={{ fontSize: '13px' }}>
                            Reject Selected Order Only (#{displayOrderNo})
                          </label>
                        </div>
                      </div>
                      <p className="text-secondary small mb-0 mt-1 ms-4" style={{ fontSize: '11.5px' }}>
                        Rejects only this order. Other orders on this table remain active. Table stays occupied if active orders remain.
                      </p>
                    </div>

                    {/* Option 2: Reject Entire Session */}
                    <div
                      className={`p-2.5 rounded-3 border transition-all ${scope === 'ENTIRE_SESSION' ? 'border-danger bg-danger-subtle' : 'bg-white'} ${!canRejectEntireSession ? 'opacity-75' : ''}`}
                      onClick={() => {
                        if (canRejectEntireSession) setScope('ENTIRE_SESSION');
                      }}
                      style={{ cursor: canRejectEntireSession ? 'pointer' : 'not-allowed' }}
                    >
                      <div className="d-flex align-items-center justify-content-between">
                        <div className="form-check m-0">
                          <input
                            type="radio"
                            className="form-check-input"
                            id="scope-entire"
                            name="rejection-scope"
                            checked={scope === 'ENTIRE_SESSION'}
                            disabled={!canRejectEntireSession}
                            onChange={() => {
                              if (canRejectEntireSession) setScope('ENTIRE_SESSION');
                            }}
                          />
                          <label className="form-check-label fw-bold text-dark ms-1" htmlFor="scope-entire" style={{ fontSize: '13px' }}>
                            Reject Entire Session ({allSessionOrders.length} orders on Table)
                          </label>
                        </div>
                      </div>
                      <p className="text-secondary small mb-0 mt-1 ms-4" style={{ fontSize: '11.5px' }}>
                        Atomically rejects all orders in this dine-in session. When all orders are rejected, table is released as Available.
                      </p>
                      {!canRejectEntireSession && (
                        <div className="text-danger small mt-1.5 ms-4 fw-medium" style={{ fontSize: '11px' }}>
                          ● Blocked: One or more orders are already Completed or Served. Entire session cannot be rejected.
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* Cancellation Reason (Optional) */}
              <div className="mb-2">
                <label className="form-label fw-bold small text-dark mb-1" htmlFor="rejection-reason">
                  Cancellation Reason <span className="text-muted fw-normal">(Optional)</span>
                </label>
                <textarea
                  id="rejection-reason"
                  className="form-control form-control-sm"
                  rows={2}
                  placeholder="e.g. Customer changed mind, item unavailable, accidental order"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  disabled={loading}
                  style={{ fontSize: '12.5px' }}
                />
              </div>

            </div>

            {/* Modal Footer */}
            <div className="modal-footer px-4 py-3 bg-light d-flex align-items-center justify-content-between border-top">
              <button
                type="button"
                className="btn btn-outline-secondary rounded-pill px-3.5 py-1.5 fw-bold"
                onClick={onClose}
                disabled={loading}
                style={{ fontSize: '13px' }}
              >
                Keep Order
              </button>
              <button
                type="submit"
                className="btn btn-danger rounded-pill px-4 py-1.5 fw-bold d-flex align-items-center gap-1.5 shadow-sm"
                disabled={loading || isCurrentOrderCompletedOrServed || (scope === 'ENTIRE_SESSION' && !canRejectEntireSession)}
                style={{ backgroundColor: '#DC2626', borderColor: '#DC2626', fontSize: '13px' }}
              >
                {loading ? (
                  <>
                    <span className="spinner-border spinner-border-sm" role="status" aria-hidden="true" />
                    <span>Processing Rejection...</span>
                  </>
                ) : (
                  <>
                    <FiCheck size={14} />
                    <span>Confirm Rejection</span>
                  </>
                )}
              </button>
            </div>
          </form>

        </div>
      </div>
    </div>
  );
};

export default OrderRejectionModal;

