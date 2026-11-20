import React, { useState, useEffect } from 'react';
import { FiX, FiTag, FiSearch, FiCheck, FiPercent, FiInfo } from 'react-icons/fi';
import formatCurrency from '../../utils/formatCurrency';

export const AvailableCouponsModal = ({
  isOpen,
  onClose,
  coupons = [],
  loading = false,
  currentOrder,
  onApplyCoupon,
  onRemoveCoupon,
  isProcessing = false,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [processingCode, setProcessingCode] = useState(null);
  const [pendingReplace, setPendingReplace] = useState(null);

  useEffect(() => {
    if (isOpen) {
      setSearchTerm('');
      setPendingReplace(null);
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
      setPendingReplace(null);
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const appliedCouponsList = Array.isArray(currentOrder?.applied_coupons) && currentOrder.applied_coupons.length > 0
    ? currentOrder.applied_coupons
    : (Array.isArray(currentOrder?.coupon_codes) && currentOrder.coupon_codes.length > 0
        ? currentOrder.coupon_codes
        : String(currentOrder?.coupon_code || currentOrder?.voucher || currentOrder?.voucherCode || currentOrder?.coupon || '')
            .split(',')
            .map(s => s.trim())
            .filter(Boolean)
      ).map(c => typeof c === 'object' ? c : { code: c, discount: null });

  const appliedCodes = appliedCouponsList.map(a => String(a.code || '').trim().toUpperCase()).filter(Boolean);
  const hasAppliedCoupon = Number(currentOrder?.coupon_discount_total || 0) > 0 || appliedCodes.length > 0;

  const eligibleList = coupons.filter(c => c.is_eligible);
  const eligibleCount = eligibleList.length;

  const filteredCoupons = coupons.filter((c) => {
    if (!searchTerm.trim()) return true;
    const term = searchTerm.trim().toLowerCase();
    const codeMatch = String(c.code || '').toLowerCase().includes(term);
    const descMatch = String(c.description || '').toLowerCase().includes(term);
    const typeMatch = String(c.discount_type || '').toLowerCase().includes(term);
    return codeMatch || descMatch || typeMatch;
  });

  const handleApplyClick = async (coupon) => {
    if (isProcessing) return;
    if (!coupon.is_eligible) return;

    const targetCode = String(coupon.code || '').trim().toUpperCase();
    if (appliedCodes.includes(targetCode)) return;

    const isTargetNewUser = Boolean(coupon.is_first_time_auto);

    // Identify which applied coupons are New User vs Regular
    const appliedNewUser = appliedCouponsList.find(a => {
      const code = String(a.code || '').toUpperCase();
      if (a.is_first_time) return true;
      const match = coupons.find(x => String(x.code).toUpperCase() === code);
      return Boolean(match?.is_first_time_auto);
    });

    const appliedRegular = appliedCouponsList.find(a => {
      const code = String(a.code || '').toUpperCase();
      if (a.is_first_time) return false;
      const match = coupons.find(x => String(x.code).toUpperCase() === code);
      return match ? !match.is_first_time_auto : true;
    });

    // Check if replacing an existing coupon in the SAME category:
    // Only prompt replacement if another coupon of the SAME type is already applied.
    // New User + Regular coupon are allowed together without any replacement confirmation!
    let conflictCode = null;
    if (isTargetNewUser && appliedNewUser) {
      conflictCode = appliedNewUser.code;
    } else if (!isTargetNewUser && appliedRegular) {
      conflictCode = appliedRegular.code;
    }

    if (conflictCode && conflictCode.toUpperCase() !== targetCode) {
      setPendingReplace({
        oldCode: conflictCode,
        newCoupon: coupon,
      });
      return;
    }

    await executeApply(coupon.code);
  };

  const executeApply = async (code) => {
    setPendingReplace(null);
    setProcessingCode(code);
    try {
      await onApplyCoupon(code);
      if (onClose) onClose();
    } finally {
      setProcessingCode(null);
    }
  };

  const handleRemoveClick = async (code = null) => {
    if (isProcessing) return;
    setPendingReplace(null);
    setProcessingCode(code || '__REMOVE__');
    try {
      await onRemoveCoupon(code);
    } finally {
      setProcessingCode(null);
    }
  };

  const formatValidDate = (isoStr) => {
    if (!isoStr) return '';
    try {
      const d = new Date(isoStr);
      return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
    } catch {
      return isoStr;
    }
  };

  return (
    <div
      className="modal fade show d-block"
      tabIndex="-1"
      role="dialog"
      aria-modal="true"
      style={{ backgroundColor: 'rgba(15, 23, 42, 0.55)', zIndex: 1060 }}
    >
      <div className="modal-dialog modal-dialog-centered" style={{ maxWidth: '560px' }}>
        <div className="modal-content border-0 shadow-lg rounded-4 overflow-hidden">
          {/* Header */}
          <div className="modal-header bg-white border-bottom px-4 py-3 d-flex align-items-center justify-content-between w-100 position-relative">
            <div className="d-flex align-items-center gap-2.5 me-3">
              <div
                className="rounded-circle d-flex align-items-center justify-content-center text-danger flex-shrink-0"
                style={{ width: '36px', height: '36px', backgroundColor: '#FEE2E2' }}
              >
                <FiPercent size={18} />
              </div>
              <div>
                <div className="d-flex align-items-center gap-2">
                  <h5 className="modal-title fw-bold text-dark mb-0 fs-6">
                    Available Coupons
                  </h5>
                  {eligibleCount > 0 && (
                    <span
                      className="badge rounded-pill fw-semibold px-2 py-0.5"
                      style={{ backgroundColor: '#FEE2E2', color: '#DC2626', fontSize: '11px' }}
                    >
                      {eligibleCount} {eligibleCount === 1 ? 'offer' : 'offers'}
                    </span>
                  )}
                </div>
                <div className="text-muted" style={{ fontSize: '11.5px' }}>
                  Select or apply an eligible coupon for this order
                </div>
              </div>
            </div>
            <button
              type="button"
              className="btn btn-sm btn-light rounded-circle p-0 d-flex align-items-center justify-content-center ms-auto flex-shrink-0"
              onClick={onClose}
              disabled={isProcessing}
              aria-label="Close"
              style={{ width: '32px', height: '32px', cursor: 'pointer' }}
            >
              <FiX size={18} />
            </button>
          </div>

          {/* Search bar */}
          <div className="p-3 bg-light border-bottom">
            <div className="position-relative">
              <FiSearch
                className="position-absolute text-muted"
                style={{ left: '12px', top: '10px' }}
                size={14}
              />
              <input
                type="text"
                className="form-control form-control-sm ps-5 bg-white border-light-subtle rounded-pill"
                placeholder="Search by code, offer name or keyword..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                style={{ height: '34px', fontSize: '12px' }}
              />
              {searchTerm && (
                <button
                  type="button"
                  className="btn btn-link btn-sm position-absolute text-muted p-0"
                  style={{ right: '12px', top: '7px', textDecoration: 'none' }}
                  onClick={() => setSearchTerm('')}
                >
                  <FiX size={14} />
                </button>
              )}
            </div>
          </div>

          {/* Body / Coupon List */}
          <div className="modal-body p-3 bg-light" style={{ maxHeight: '420px', overflowY: 'auto' }}>
            {pendingReplace && (
              <div className="alert alert-warning border border-warning-subtle shadow-xs rounded-3 p-3 mb-3">
                <div className="d-flex align-items-start gap-2 mb-2">
                  <FiInfo className="text-warning-emphasis flex-shrink-0 mt-0.5" size={16} />
                  <div className="small text-dark">
                    Coupon <strong className="font-monospace text-danger">{pendingReplace.oldCode}</strong> is currently applied. Do you want to replace it with <strong className="font-monospace text-success">{pendingReplace.newCoupon.code}</strong>?
                  </div>
                </div>
                <div className="d-flex align-items-center justify-content-end gap-2">
                  <button
                    type="button"
                    className="btn btn-sm btn-light border rounded-pill px-3 py-1"
                    style={{ fontSize: '11.5px' }}
                    onClick={() => setPendingReplace(null)}
                    disabled={isProcessing}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="btn btn-sm btn-danger rounded-pill px-3 py-1 fw-bold text-white"
                    style={{ fontSize: '11.5px', backgroundColor: '#F20D2D', borderColor: '#F20D2D' }}
                    onClick={() => executeApply(pendingReplace.newCoupon.code)}
                    disabled={isProcessing}
                  >
                    {processingCode === pendingReplace.newCoupon.code ? 'Applying...' : 'Replace & Apply'}
                  </button>
                </div>
              </div>
            )}

            {loading ? (
              <div className="text-center py-5">
                <span className="spinner-border text-danger mb-2" role="status" style={{ width: '28px', height: '28px' }} />
                <div className="small text-muted">Checking available coupons...</div>
              </div>
            ) : filteredCoupons.length === 0 ? (
              <div className="text-center py-5 bg-white rounded-3 border border-light-subtle p-4">
                <FiInfo className="text-muted mb-2" size={24} />
                <h6 className="fw-bold text-dark mb-1 fs-6">No coupons available</h6>
                <p className="text-muted small mb-0" style={{ fontSize: '12px' }}>
                  {searchTerm
                    ? `No coupons match "${searchTerm}".`
                    : 'No eligible coupons are available for this order at this time.'}
                </p>
              </div>
            ) : (
              <div className="d-flex flex-column gap-2.5">
                {filteredCoupons.map((c) => {
                  const isCurrentApplied = appliedCodes.includes(String(c.code).toUpperCase());
                  const isEligible = c.is_eligible;
                  const discountVal = parseFloat(c.discount_value || 0);
                  const minOrder = parseFloat(c.min_order_value || 0);
                  const maxDisc = c.max_discount ? parseFloat(c.max_discount) : null;
                  const estSavings = Number(c.calculated_discount || 0);
                  const isProcessingThis = processingCode === c.code || (isCurrentApplied && (processingCode === '__REMOVE__' || processingCode === c.code));

                  return (
                    <div
                      key={c.id || c.code}
                      className={`p-3 rounded-3 border transition-all ${
                        isCurrentApplied
                          ? 'bg-success-subtle border-success shadow-xs'
                          : isEligible
                          ? 'bg-white border-light-subtle shadow-xs'
                          : 'bg-white border-light-subtle opacity-75'
                      }`}
                    >
                      <div className="d-flex align-items-start justify-content-between mb-2">
                        <div className="d-flex align-items-center gap-2 flex-wrap">
                          <span
                            className="badge font-monospace fw-bold px-2.5 py-1 border rounded-pill d-inline-flex align-items-center gap-1"
                            style={{
                              backgroundColor: isCurrentApplied ? '#16A34A' : '#FEE2E2',
                              color: isCurrentApplied ? '#ffffff' : '#DC2626',
                              borderColor: isCurrentApplied ? '#16A34A' : '#FCA5A5',
                              fontSize: '12px',
                            }}
                          >
                            <FiTag size={11} />
                            {c.code}
                          </span>
                          <span className="fw-bold text-dark fs-6">
                            {c.discount_type === 'PERCENT' ? `${discountVal}% OFF` : `Flat ₹${discountVal} OFF`}
                          </span>
                        </div>
                        {isCurrentApplied ? (
                          <span className="badge bg-success text-white rounded-pill px-2.5 py-1 fw-bold d-inline-flex align-items-center gap-1" style={{ fontSize: '11px' }}>
                            <FiCheck size={12} /> Applied
                          </span>
                        ) : isEligible ? (
                          <span className="badge bg-success-subtle text-success border border-success-subtle rounded-pill px-2 py-0.5 fw-semibold" style={{ fontSize: '11px' }}>
                            Eligible
                          </span>
                        ) : (
                          <span className="badge bg-secondary-subtle text-secondary rounded-pill px-2 py-0.5 fw-semibold" style={{ fontSize: '11px' }}>
                            Unavailable
                          </span>
                        )}
                      </div>

                      {/* Conditions & Details */}
                      <div className="text-secondary small d-flex flex-wrap align-items-center gap-x-2 gap-y-1 mb-1.5" style={{ fontSize: '11.5px' }}>
                        <span>Min. order: <strong>₹{minOrder}</strong></span>
                        {maxDisc && <span>• Max discount: <strong>₹{maxDisc}</strong></span>}
                        {c.valid_to && <span>• Valid until: <strong>{formatValidDate(c.valid_to)}</strong></span>}
                      </div>

                      {c.description && (
                        <div className="text-dark small mb-1.5" style={{ fontSize: '11.5px' }}>
                          {c.description}
                        </div>
                      )}

                      {/* Ineligible reason if applicable */}
                      {!isEligible && c.ineligible_reason && (
                        <div className="text-danger small mb-2 d-flex align-items-center gap-1" style={{ fontSize: '11px' }}>
                          <FiInfo size={12} className="flex-shrink-0" />
                          <span>{c.ineligible_reason}</span>
                        </div>
                      )}

                      {/* Bottom row: estimated savings and Action button */}
                      <div className="d-flex align-items-center justify-content-between pt-2 border-top border-light-subtle mt-2">
                        <div>
                          {isEligible && estSavings > 0 && (
                            <span className="small fw-bold text-success" style={{ fontSize: '12px' }}>
                              Estimated savings: {formatCurrency(estSavings)}
                            </span>
                          )}
                          {!isEligible && (
                            <span className="small text-muted" style={{ fontSize: '11px' }}>
                              Conditions not satisfied
                            </span>
                          )}
                        </div>

                        {isCurrentApplied ? (
                          <button
                            type="button"
                            onClick={() => handleRemoveClick(c.code)}
                            disabled={isProcessing}
                            className="btn btn-sm btn-outline-danger rounded-pill px-3 py-1 fw-bold d-inline-flex align-items-center gap-1"
                            style={{ fontSize: '11.5px' }}
                          >
                            {isProcessingThis ? (
                              <span className="spinner-border spinner-border-sm" role="status" style={{ width: '12px', height: '12px' }} />
                            ) : (
                              <><FiX size={13} /> Remove</>
                            )}
                          </button>
                        ) : isEligible ? (
                          <button
                            type="button"
                            onClick={() => handleApplyClick(c)}
                            disabled={isProcessing}
                            className="btn btn-sm btn-danger rounded-pill px-3 py-1 fw-bold d-inline-flex align-items-center gap-1 text-white"
                            style={{
                              fontSize: '11.5px',
                              backgroundColor: '#F20D2D',
                              borderColor: '#F20D2D',
                            }}
                          >
                            {isProcessingThis ? (
                              <span className="spinner-border spinner-border-sm text-white" role="status" style={{ width: '12px', height: '12px' }} />
                            ) : (
                              <><FiCheck size={13} /> Apply</>
                            )}
                          </button>
                        ) : (
                          <button
                            type="button"
                            disabled
                            className="btn btn-sm btn-light border rounded-pill px-3 py-1 text-muted"
                            style={{ fontSize: '11.5px', cursor: 'not-allowed' }}
                          >
                            Not Eligible
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="modal-footer bg-white border-top px-4 py-2.5 d-flex justify-content-between align-items-center">
            <span className="small text-muted" style={{ fontSize: '11px' }}>
              {eligibleCount} eligible {eligibleCount === 1 ? 'coupon' : 'coupons'} for this order
            </span>
            <button
              type="button"
              className="btn btn-sm btn-secondary rounded-pill px-3 py-1"
              onClick={onClose}
              disabled={isProcessing}
              style={{ fontSize: '12px' }}
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AvailableCouponsModal;

