import React, { useState, useEffect } from 'react';
import { FiDollarSign, FiCheck, FiX, FiAlertTriangle, FiInfo, FiRotateCcw, FiFileText } from 'react-icons/fi';
import formatCurrency from '../../utils/formatCurrency';

/**
 * Manual Refund Modal.
 * Enables authorized staff (Admin, Super Admin, authorized Managers) to record
 * full or partial manual refunds (or failed attempts) for rejected/cancelled paid orders.
 * Strictly adheres to manual refund rules: NEVER calls automatic payment gateway APIs.
 */
export const ManualRefundModal = ({
  isOpen,
  onClose,
  order,
  onConfirmRefund,
  loading = false,
  error = '',
}) => {
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState('CASH');
  const [reference, setReference] = useState('');
  const [notes, setNotes] = useState('');
  const [isFailedAttempt, setIsFailedAttempt] = useState(false);
  const [localError, setLocalError] = useState('');

  const capturedAmount = Number(order?.captured_amount || order?.total || order?.total_amount || 0);
  const cumulativeRefunded = Number(order?.refunded_amount || 0);
  const remainingRefundable = Math.max(0, capturedAmount - cumulativeRefunded);

  useEffect(() => {
    if (order) {
      setAmount(remainingRefundable.toFixed(2));
      const defMethod = String(order.paymentMethod || order.payment_method || 'CASH').toUpperCase();
      if (defMethod.includes('UPI')) setMethod('RAZORPAY_UPI');
      else if (defMethod.includes('CARD')) setMethod('RAZORPAY_CARD');
      else if (defMethod.includes('RAZORPAY')) setMethod('RAZORPAY');
      else setMethod('CASH');
      setIsFailedAttempt(false);
      setLocalError('');
      setReference('');
      setNotes('');
    }
  }, [order, remainingRefundable]);

  if (!isOpen || !order) return null;

  const displayOrderNo = order.display_order_number || order.display_number || order.orderNumber || order.id;

  const handleFullRefundClick = () => {
    setAmount(remainingRefundable.toFixed(2));
    setLocalError('');
  };

  const handlePartialRefundClick = () => {
    const half = (remainingRefundable / 2).toFixed(2);
    setAmount(half);
    setLocalError('');
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    setLocalError('');

    if (isFailedAttempt) {
      if (onConfirmRefund) {
        onConfirmRefund({
          status: 'FAILED',
          method,
          reference: reference.trim(),
          notes: notes.trim() || 'Manual refund attempt failed',
          amount: 0,
        });
      }
      return;
    }

    const numAmount = parseFloat(amount);
    if (isNaN(numAmount) || numAmount <= 0) {
      setLocalError('Please enter a valid refund amount greater than ₹0.00.');
      return;
    }

    if (numAmount > remainingRefundable) {
      setLocalError(`Refund amount (${formatCurrency(numAmount)}) exceeds remaining refundable balance (${formatCurrency(remainingRefundable)}).`);
      return;
    }

    if (onConfirmRefund) {
      onConfirmRefund({
        status: 'SUCCESS',
        amount: numAmount,
        method,
        reference: reference.trim(),
        notes: notes.trim(),
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
      <div className="modal-dialog modal-dialog-centered" style={{ maxWidth: '540px' }}>
        <div className="modal-content rounded-4 border-0 shadow-2xl overflow-hidden" style={{ backgroundColor: '#FFFFFF' }}>

          {/* Modal Header */}
          <div className="modal-header px-4 py-3 border-bottom d-flex align-items-center justify-content-between" style={{ backgroundColor: '#F8FAFC' }}>
            <div className="d-flex align-items-center gap-2.5">
              <div
                className="rounded-circle d-flex align-items-center justify-content-center text-primary"
                style={{ width: '36px', height: '36px', backgroundColor: '#EFF6FF' }}
              >
                <FiDollarSign size={18} className="text-primary" />
              </div>
              <div>
                <h5 className="modal-title fw-bold text-dark mb-0" style={{ fontSize: '16px' }}>
                  Record Manual Refund
                </h5>
                <span className="text-secondary small" style={{ fontSize: '11.5px' }}>
                  Order #{displayOrderNo} • Customer: {order.customerName || order.customer_name || 'Walk-in'}
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

          <form onSubmit={handleSubmit}>
            <div className="modal-body p-4">

              {/* Error Notice */}
              {activeError && (
                <div className="alert alert-danger py-2.5 px-3 small rounded-3 mb-3 d-flex align-items-start gap-2" role="alert">
                  <FiAlertTriangle size={16} className="text-danger flex-shrink-0 mt-0.5" />
                  <div className="flex-grow-1">{activeError}</div>
                  <button type="button" className="btn-close btn-close-sm" onClick={() => setLocalError('')} aria-label="Close" style={{ fontSize: '10px' }} />
                </div>
              )}

              {/* Refund Balance Summary Cards */}
              <div className="row g-2 mb-3">
                <div className="col-4">
                  <div className="p-2.5 rounded-3 border bg-light text-center">
                    <span className="text-secondary small d-block" style={{ fontSize: '11px' }}>Captured</span>
                    <span className="fw-bold text-dark" style={{ fontSize: '13px' }}>{formatCurrency(capturedAmount)}</span>
                  </div>
                </div>
                <div className="col-4">
                  <div className="p-2.5 rounded-3 border bg-light text-center">
                    <span className="text-secondary small d-block" style={{ fontSize: '11px' }}>Refunded</span>
                    <span className="fw-bold text-success" style={{ fontSize: '13px' }}>{formatCurrency(cumulativeRefunded)}</span>
                  </div>
                </div>
                <div className="col-4">
                  <div className="p-2.5 rounded-3 border bg-primary-subtle text-center">
                    <span className="text-primary small d-block fw-semibold" style={{ fontSize: '11px' }}>Remaining</span>
                    <span className="fw-bold text-primary fs-6">{formatCurrency(remainingRefundable)}</span>
                  </div>
                </div>
              </div>

              {/* Operational Guidance Alert */}
              <div className="alert alert-light border py-2 px-3 small rounded-3 mb-3 d-flex align-items-start gap-2">
                <FiInfo size={15} className="text-muted flex-shrink-0 mt-0.5" />
                <div className="text-secondary" style={{ fontSize: '11.5px' }}>
                  Process the refund manually via your physical counter cash drawer or gateway portal, then confirm the record here. Gateway APIs are not invoked automatically.
                </div>
              </div>

              {/* Failed Attempt Toggle */}
              <div className="form-check form-switch mb-3 p-2 rounded-2 bg-light d-flex align-items-center justify-content-between">
                <label className="form-check-label small fw-semibold text-dark mb-0 ps-1 cursor-pointer" htmlFor="toggle-failed-refund">
                  Record as Failed Refund Attempt
                </label>
                <input
                  id="toggle-failed-refund"
                  className="form-check-input m-0 cursor-pointer"
                  type="checkbox"
                  role="switch"
                  checked={isFailedAttempt}
                  onChange={(e) => setIsFailedAttempt(e.target.checked)}
                  disabled={loading}
                  style={{ width: '34px', height: '18px' }}
                />
              </div>

              {!isFailedAttempt ? (
                <>
                  {/* Refund Amount Input with Quick Buttons */}
                  <div className="mb-3">
                    <div className="d-flex justify-content-between align-items-center mb-1">
                      <label className="form-label fw-bold small text-dark mb-0" htmlFor="refund-amount">
                        Refund Amount (₹) <span className="text-danger">*</span>
                      </label>
                      <div className="d-flex gap-1.5">
                        <button
                          type="button"
                          className="btn btn-xs btn-outline-secondary rounded-pill py-0.5 px-2"
                          style={{ fontSize: '10.5px' }}
                          onClick={handleFullRefundClick}
                          disabled={loading || remainingRefundable <= 0}
                        >
                          Full ({formatCurrency(remainingRefundable)})
                        </button>
                        {remainingRefundable > 10 && (
                          <button
                            type="button"
                            className="btn btn-xs btn-outline-secondary rounded-pill py-0.5 px-2"
                            style={{ fontSize: '10.5px' }}
                            onClick={handlePartialRefundClick}
                            disabled={loading}
                          >
                            50% Partial
                          </button>
                        )}
                      </div>
                    </div>

                    <div className="input-group input-group-sm">
                      <span className="input-group-text bg-white fw-bold">₹</span>
                      <input
                        id="refund-amount"
                        type="number"
                        step="0.01"
                        min="0.01"
                        max={remainingRefundable}
                        className="form-control form-control-sm fw-bold fs-6"
                        placeholder="0.00"
                        value={amount}
                        onChange={(e) => setAmount(e.target.value)}
                        disabled={loading || remainingRefundable <= 0}
                        required
                      />
                    </div>
                  </div>

                  {/* Refund Method */}
                  <div className="mb-3">
                    <label className="form-label fw-bold small text-dark mb-1">
                      Refund Method <span className="text-danger">*</span>
                    </label>
                    <select
                      className="form-select form-select-sm"
                      value={method}
                      onChange={(e) => setMethod(e.target.value)}
                      disabled={loading}
                      style={{ fontSize: '12.5px' }}
                    >
                      <option value="CASH">Cash (Physical Cash Return)</option>
                      <option value="RAZORPAY_UPI">Razorpay UPI (Manual Portal Refund)</option>
                      <option value="RAZORPAY_CARD">Razorpay Card / POS Swipe (Manual Return)</option>
                      <option value="RAZORPAY">Razorpay Standard (Manual Offline)</option>
                    </select>
                  </div>
                </>
              ) : (
                <div className="alert alert-warning py-2 px-3 small rounded-3 mb-3">
                  This will mark the order's refund status as <strong>Refund Failed</strong>. No refund amount will be credited, and an authorized user can record a subsequent attempt later.
                </div>
              )}

              {/* External Reference */}
              <div className="mb-3">
                <label className="form-label fw-bold small text-dark mb-1" htmlFor="refund-ref">
                  External Reference / UTR <span className="text-muted fw-normal">(Optional)</span>
                </label>
                <input
                  id="refund-ref"
                  type="text"
                  className="form-control form-control-sm"
                  placeholder="e.g. UTR12345678, Cash Receipt #88, Transfer Ref"
                  value={reference}
                  onChange={(e) => setReference(e.target.value)}
                  disabled={loading}
                  style={{ fontSize: '12px' }}
                />
              </div>

              {/* Notes / Reason */}
              <div className="mb-1">
                <label className="form-label fw-bold small text-dark mb-1" htmlFor="refund-notes">
                  Internal Notes / Reason <span className="text-muted fw-normal">(Optional)</span>
                </label>
                <textarea
                  id="refund-notes"
                  className="form-control form-control-sm"
                  rows={2}
                  placeholder="e.g. Returned ₹600 cash to customer at counter after order cancellation"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  disabled={loading}
                  style={{ fontSize: '12px' }}
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
                Cancel
              </button>
              <button
                type="submit"
                className={`btn rounded-pill px-4 py-1.5 fw-bold d-flex align-items-center gap-1.5 shadow-sm text-white ${isFailedAttempt ? 'btn-warning text-dark' : 'btn-primary'}`}
                disabled={loading || (!isFailedAttempt && remainingRefundable <= 0)}
                style={{ fontSize: '13px' }}
              >
                {loading ? (
                  <>
                    <span className="spinner-border spinner-border-sm" role="status" aria-hidden="true" />
                    <span>Saving...</span>
                  </>
                ) : isFailedAttempt ? (
                  <>
                    <FiAlertTriangle size={14} />
                    <span>Record Failed Attempt</span>
                  </>
                ) : (
                  <>
                    <FiCheck size={14} />
                    <span>Confirm Manual Refund</span>
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

export default ManualRefundModal;

