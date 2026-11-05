import React, { useState, useEffect } from 'react';
import { 
  FiX, 
  FiSmartphone, 
  FiCreditCard, 
  FiDollarSign, 
  FiCheckCircle, 
  FiAlertCircle, 
  FiClock, 
  FiUser, 
  FiPhone, 
  FiMapPin, 
  FiTag 
} from 'react-icons/fi';
import formatCurrency from '../../utils/formatCurrency';
import api from '../../config/api';

/**
 * Universal Two-Section Payment Modal for POS and Customer Ordering.
 *
 * Left Section:
 *  - Customer Details (Name, Phone, Branch, Table/Takeaway, Order Type)
 *  - Order Items with customization / special instructions
 *  - Price Breakdown: Subtotal, Customizations, Dish Discount, Coupon Discount with Name, Taxable, GST, Service Charge, Total Payable
 *
 * Right Section:
 *  - Payment Methods (UPI with temporary QR image, Cash / Counter, Card conditional on card_enabled setting)
 *  - Selected Method Content:
 *      * UPI: displays /assets/upi_qr.jpg, Amount, and "I Have Paid / Confirm Payment"
 *      * Cash / Counter: instructions to collect/pay cash at counter and "Confirm Cash Payment"
 *      * Card: card payment details / POS swipe instructions and "Confirm Card Payment"
 */
export const PaymentModal = ({
  isOpen,
  onClose,
  orderDetails,
  onConfirmPayment,
  loading = false,
  error = '',
  isStaff = false,
}) => {
  const [selectedMethod, setSelectedMethod] = useState('UPI');
  const [cardEnabled, setCardEnabled] = useState(true);
  const [copiedUpi, setCopiedUpi] = useState(false);

  useEffect(() => {
    let active = true;
    api.get('/public/settings/')
      .then(res => {
        if (active && res.data) {
          setCardEnabled(res.data.card_enabled !== false);
        }
      })
      .catch(() => {
        // Fallback: check staff endpoint if isStaff
        if (isStaff) {
          import('../../services/staffClient')
            .then(({ staffJson }) => staffJson('/settings/'))
            .then(data => {
              if (active && data) setCardEnabled(data.card_enabled !== false);
            })
            .catch(() => {});
        }
      });
    return () => { active = false; };
  }, [isStaff]);

  if (!isOpen || !orderDetails) return null;

  const {
    customerName,
    customerPhone,
    branchName,
    tableLabel,
    orderType = 'DINE_IN',
    items = [],
    pricing = {},
    couponCode = '',
    couponDiscount = 0,
  } = orderDetails;

  const subtotal = Number(pricing.items_subtotal ?? pricing.subtotal ?? 0);
  const customizationTotal = Number(pricing.customization_total ?? 0);
  const dishDiscount = Number(pricing.dish_discount_total ?? pricing.discount ?? 0);
  const effectiveCouponDiscount = Number(couponDiscount || pricing.coupon_discount_total || 0);
  const takeawayCharge = Number(pricing.takeaway_charge ?? 0);
  const taxableAmount = Number(pricing.taxable_amount ?? (subtotal + customizationTotal - dishDiscount - effectiveCouponDiscount + takeawayCharge));
  const gstAmount = Number(pricing.gst_amount ?? pricing.tax ?? 0);
  const gstRate = Number(pricing.gst_rate ?? 5);
  const serviceChargeAmount = Number(pricing.service_charge_amount ?? 0);
  const grandTotal = Number(pricing.total_amount ?? pricing.grandTotal ?? pricing.total ?? 0);

  const isTakeaway = orderType === 'TAKEAWAY' || orderType === 'Takeaway';

  const handleCopyUpi = () => {
    navigator.clipboard?.writeText('7981354982@omni');
    setCopiedUpi(true);
    setTimeout(() => setCopiedUpi(false), 2500);
  };

  const handleConfirm = () => {
    if (onConfirmPayment) {
      onConfirmPayment(selectedMethod);
    }
  };

  return (
    <div 
      className="modal fade show d-block" 
      style={{ backgroundColor: 'rgba(15, 23, 42, 0.65)', backdropFilter: 'blur(3px)', zIndex: 1060 }}
      tabIndex="-1"
    >
      <div className="modal-dialog modal-dialog-centered modal-xl" style={{ maxWidth: '960px' }}>
        <div 
          className="modal-content rounded-4 border-0 shadow-2xl overflow-hidden" 
          style={{ backgroundColor: '#FFFFFF' }}
        >
          {/* Modal Header */}
          <div className="modal-header px-4 py-3 border-bottom d-flex align-items-center justify-content-between" style={{ backgroundColor: '#F8FAFC' }}>
            <div className="d-flex align-items-center gap-2">
              <span className="badge rounded-pill bg-danger-subtle text-danger fw-bold px-2.5 py-1" style={{ fontSize: '11px' }}>
                PAYMENT CHECKOUT
              </span>
              <h5 className="modal-title fw-bold text-dark mb-0 fs-6">
                Complete Your Order Payment
              </h5>
            </div>
            <button 
              type="button" 
              className="btn-close shadow-none" 
              onClick={onClose} 
              disabled={loading}
              aria-label="Close" 
            />
          </div>

          {/* Modal Body: Two Column Section */}
          <div className="modal-body p-0">
            <div className="row g-0">

              {/* LEFT SECTION: Order Details, Items & Bill Breakdown */}
              <div 
                className="col-12 col-md-6 p-4 border-end" 
                style={{ backgroundColor: '#FAFAFA', maxHeight: '72vh', overflowY: 'auto' }}
              >
                {/* Customer & Branch Context Card */}
                <div className="bg-white p-3 rounded-3 border mb-3 shadow-2xs">
                  <div className="d-flex align-items-center justify-content-between mb-2">
                    <span className="badge bg-light text-dark border fw-bold px-2.5 py-1" style={{ fontSize: '11px' }}>
                      {isTakeaway ? '🥡 Takeaway' : `🍽️ Dine-In${tableLabel ? ` (Table ${tableLabel})` : ''}`}
                    </span>
                    {branchName && (
                      <span className="text-secondary small d-flex align-items-center gap-1" style={{ fontSize: '12px' }}>
                        <FiMapPin size={12} className="text-danger" /> {branchName}
                      </span>
                    )}
                  </div>

                  {(customerName || customerPhone) && (
                    <div className="small text-secondary pt-1 border-top border-light mt-2 d-flex flex-wrap gap-3">
                      {customerName && (
                        <span className="d-flex align-items-center gap-1 text-dark fw-medium">
                          <FiUser size={13} className="text-secondary" /> {customerName}
                        </span>
                      )}
                      {customerPhone && (
                        <span className="d-flex align-items-center gap-1 text-dark fw-medium">
                          <FiPhone size={13} className="text-secondary" /> {customerPhone}
                        </span>
                      )}
                    </div>
                  )}
                </div>

                {/* Items List */}
                <div className="mb-3">
                  <h6 className="fw-bold text-dark small mb-2 text-uppercase text-muted" style={{ letterSpacing: '0.5px', fontSize: '11px' }}>
                    Order Items ({items.length})
                  </h6>
                  <div className="d-flex flex-column gap-2">
                    {items.map((item, idx) => {
                      const dishName = item.dish?.name || item.name || item.title || 'Food Item';
                      const qty = Number(item.quantity || 1);
                      const price = Number(item.dish?.price ?? item.price ?? 0);
                      const lineTotal = Number(item.line_total ?? (price * qty));
                      const customDetails = (item.options || item.customizations || []).map(o => o.name || o).join(', ');

                      return (
                        <div key={idx} className="bg-white p-2.5 rounded-3 border d-flex align-items-start justify-content-between gap-2">
                          <div className="min-w-0 flex-grow-1">
                            <div className="d-flex align-items-center gap-2">
                              <span className="badge bg-light text-dark border px-1.5 py-0.5 rounded fw-bold" style={{ fontSize: '11px' }}>
                                {qty}x
                              </span>
                              <span className="fw-semibold text-dark text-truncate" style={{ fontSize: '13px' }} title={dishName}>
                                {dishName}
                              </span>
                            </div>
                            {customDetails && (
                              <div className="text-secondary mt-0.5 ps-4" style={{ fontSize: '11px' }}>
                                + {customDetails}
                              </div>
                            )}
                            {item.specialInstructions && (
                              <div className="text-warning-emphasis mt-0.5 ps-4 fst-italic" style={{ fontSize: '11px' }}>
                                note: "{item.specialInstructions}"
                              </div>
                            )}
                          </div>
                          <span className="fw-bold text-dark small text-nowrap">
                            {formatCurrency(lineTotal)}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Bill Breakdown */}
                <div className="bg-white p-3 rounded-3 border">
                  <h6 className="fw-bold text-dark small mb-2.5 text-uppercase text-muted" style={{ letterSpacing: '0.5px', fontSize: '11px' }}>
                    Bill Breakdown
                  </h6>

                  <div className="d-flex justify-content-between small text-secondary mb-1.5" style={{ fontSize: '12.5px' }}>
                    <span>Items Subtotal</span>
                    <span className="text-dark fw-medium">{formatCurrency(subtotal)}</span>
                  </div>

                  {customizationTotal > 0 && (
                    <div className="d-flex justify-content-between small text-secondary mb-1.5" style={{ fontSize: '12.5px' }}>
                      <span>Add-ons / Customizations</span>
                      <span className="text-dark fw-medium">+{formatCurrency(customizationTotal)}</span>
                    </div>
                  )}

                  {dishDiscount > 0 && (
                    <div className="d-flex justify-content-between small text-success mb-1.5" style={{ fontSize: '12.5px' }}>
                      <span>Item Discount</span>
                      <span className="fw-medium">-{formatCurrency(dishDiscount)}</span>
                    </div>
                  )}

                  {effectiveCouponDiscount > 0 && (
                    <div className="d-flex justify-content-between small text-success mb-1.5" style={{ fontSize: '12.5px' }}>
                      <span className="d-flex align-items-center gap-1">
                        <FiTag size={12} /> Coupon ({couponCode || 'APPLIED'})
                      </span>
                      <span className="fw-medium">-{formatCurrency(effectiveCouponDiscount)}</span>
                    </div>
                  )}

                  {isTakeaway && takeawayCharge > 0 && (
                    <div className="d-flex justify-content-between small text-secondary mb-1.5" style={{ fontSize: '12.5px' }}>
                      <span>Takeaway Packaging</span>
                      <span className="text-dark fw-medium">+{formatCurrency(takeawayCharge)}</span>
                    </div>
                  )}

                  <div className="d-flex justify-content-between small text-secondary mb-1.5" style={{ fontSize: '12.5px' }}>
                    <span>GST ({gstRate}%)</span>
                    <span className="text-dark fw-medium">+{formatCurrency(gstAmount)}</span>
                  </div>

                  {serviceChargeAmount > 0 && (
                    <div className="d-flex justify-content-between small text-secondary mb-1.5" style={{ fontSize: '12.5px' }}>
                      <span>Service Charge</span>
                      <span className="text-dark fw-medium">+{formatCurrency(serviceChargeAmount)}</span>
                    </div>
                  )}

                  <div className="d-flex justify-content-between align-items-center pt-2.5 mt-2 border-top">
                    <div>
                      <span className="fw-bold text-dark fs-6 d-block">Grand Total</span>
                      <span className="text-muted small" style={{ fontSize: '11px' }}>Inclusive of all taxes</span>
                    </div>
                    <span className="fw-bold fs-5 text-danger">
                      {formatCurrency(grandTotal)}
                    </span>
                  </div>
                </div>
              </div>

              {/* RIGHT SECTION: Payment Methods & Action */}
              <div 
                className="col-12 col-md-6 p-4 d-flex flex-column justify-content-between" 
                style={{ backgroundColor: '#FFFFFF', minHeight: '440px' }}
              >
                <div>
                  <h6 className="fw-bold text-dark small mb-3 text-uppercase text-muted" style={{ letterSpacing: '0.5px', fontSize: '11px' }}>
                    Select Payment Method
                  </h6>

                  {/* Payment Method Tabs */}
                  <div className="d-flex gap-2 mb-4">
                    <button
                      type="button"
                      onClick={() => setSelectedMethod('UPI')}
                      className={`btn flex-fill py-2.5 px-3 rounded-3 d-flex align-items-center justify-content-center gap-2 fw-semibold transition-all ${
                        selectedMethod === 'UPI' 
                          ? 'btn-danger text-white shadow-xs' 
                          : 'btn-outline-secondary bg-light text-dark border'
                      }`}
                      style={{ fontSize: '13px' }}
                    >
                      <FiSmartphone size={16} /> UPI QR
                    </button>

                    <button
                      type="button"
                      onClick={() => setSelectedMethod('COUNTER')}
                      className={`btn flex-fill py-2.5 px-3 rounded-3 d-flex align-items-center justify-content-center gap-2 fw-semibold transition-all ${
                        selectedMethod === 'COUNTER' 
                          ? 'btn-danger text-white shadow-xs' 
                          : 'btn-outline-secondary bg-light text-dark border'
                      }`}
                      style={{ fontSize: '13px' }}
                    >
                      <FiDollarSign size={16} /> {isStaff ? 'Cash' : 'Pay on Counter'}
                    </button>

                    {cardEnabled && (
                      <button
                        type="button"
                        onClick={() => setSelectedMethod('CARD')}
                        className={`btn flex-fill py-2.5 px-3 rounded-3 d-flex align-items-center justify-content-center gap-2 fw-semibold transition-all ${
                          selectedMethod === 'CARD' 
                            ? 'btn-danger text-white shadow-xs' 
                            : 'btn-outline-secondary bg-light text-dark border'
                        }`}
                        style={{ fontSize: '13px' }}
                      >
                        <FiCreditCard size={16} /> Card
                      </button>
                    )}
                  </div>

                  {/* Method View: UPI QR */}
                  {selectedMethod === 'UPI' && (
                    <div className="text-center p-3 rounded-3 border bg-light-subtle mb-3">
                      <div className="mb-2">
                        <span className="badge bg-success-subtle text-success border border-success-subtle rounded-pill px-2.5 py-0.5 fw-bold" style={{ fontSize: '10.5px' }}>
                          ⚡ Instant UPI Scan & Pay
                        </span>
                      </div>

                      <div 
                        className="mx-auto rounded-3 p-1.5 bg-white border shadow-sm mb-2.5 d-flex align-items-center justify-content-center"
                        style={{ width: '210px', height: '210px' }}
                      >
                        <img 
                          src="/assets/upi_qr.jpg" 
                          alt="OmniCard UPI QR" 
                          className="w-100 h-100 rounded-2"
                          style={{ objectFit: 'contain' }}
                          onError={(e) => {
                            e.currentTarget.style.display = 'none';
                          }}
                        />
                      </div>

                      <div className="small text-secondary mb-1">
                        Scan with Google Pay, PhonePe, Paytm or BHIM
                      </div>

                      <div className="d-flex align-items-center justify-content-center gap-2">
                        <code className="text-dark fw-bold bg-white px-2 py-0.5 border rounded small">
                          7981354982@omni
                        </code>
                        <button
                          type="button"
                          onClick={handleCopyUpi}
                          className="btn btn-sm btn-link p-0 text-decoration-none fw-semibold"
                          style={{ fontSize: '12px' }}
                        >
                          {copiedUpi ? '✓ Copied' : 'Copy UPI ID'}
                        </button>
                      </div>

                      <div className="mt-2 text-muted" style={{ fontSize: '11px' }}>
                        Account Name: <strong className="text-dark">YAMIN PRASANNA REDDY BALIJEPALLI</strong>
                      </div>
                    </div>
                  )}

                  {/* Method View: Counter / Cash */}
                  {selectedMethod === 'COUNTER' && (
                    <div className="p-4 rounded-3 border bg-light-subtle text-center mb-3">
                      <div className="rounded-circle bg-warning-subtle text-warning-emphasis d-inline-flex p-3 mb-2">
                        <FiDollarSign size={32} />
                      </div>
                      <h6 className="fw-bold text-dark mb-1">
                        {isStaff ? 'Cash Payment at Counter' : 'Pay Cash at Restaurant Counter'}
                      </h6>
                      <p className="text-secondary small mb-0" style={{ fontSize: '12.5px' }}>
                        {isStaff 
                          ? 'Collect the physical cash amount from customer at billing counter before confirming.' 
                          : 'Your order will be sent to the kitchen. Please proceed to the billing counter to pay.'}
                      </p>
                      <div className="mt-3 p-2.5 bg-white rounded-3 border text-dark fw-bold">
                        Payable Amount: <span className="text-danger">{formatCurrency(grandTotal)}</span>
                      </div>
                    </div>
                  )}

                  {/* Method View: Card */}
                  {selectedMethod === 'CARD' && cardEnabled && (
                    <div className="p-4 rounded-3 border bg-light-subtle text-center mb-3">
                      <div className="rounded-circle bg-primary-subtle text-primary d-inline-flex p-3 mb-2">
                        <FiCreditCard size={32} />
                      </div>
                      <h6 className="fw-bold text-dark mb-1">Credit / Debit Card Payment</h6>
                      <p className="text-secondary small mb-0" style={{ fontSize: '12.5px' }}>
                        {isStaff 
                          ? 'Swipe or tap customer card on the POS machine, verify successful receipt, then confirm.' 
                          : 'Use your credit/debit card on the secure payment gateway to complete payment.'}
                      </p>
                      <div className="mt-3 p-2.5 bg-white rounded-3 border text-dark fw-bold">
                        Payable Amount: <span className="text-danger">{formatCurrency(grandTotal)}</span>
                      </div>
                    </div>
                  )}

                  {error && (
                    <div className="alert alert-danger py-2 small mb-3 d-flex align-items-center gap-2">
                      <FiAlertCircle className="flex-shrink-0" />
                      <span>{error}</span>
                    </div>
                  )}
                </div>

                {/* Footer Actions */}
                <div className="d-flex align-items-center gap-3 pt-3 border-top mt-3">
                  <button
                    type="button"
                    onClick={onClose}
                    disabled={loading}
                    className="btn btn-outline-secondary rounded-pill px-4 fw-semibold"
                    style={{ height: '44px', fontSize: '13.5px' }}
                  >
                    Cancel
                  </button>

                  <button
                    type="button"
                    onClick={handleConfirm}
                    disabled={loading || grandTotal <= 0}
                    className="btn btn-danger rounded-pill flex-grow-1 fw-bold d-flex align-items-center justify-content-center gap-2 shadow-sm"
                    style={{
                      height: '44px',
                      backgroundColor: 'var(--primary-color, #F20D2D)',
                      borderColor: 'var(--primary-color, #F20D2D)',
                      fontSize: '14px'
                    }}
                  >
                    {loading ? (
                      <>
                        <span className="spinner-border spinner-border-sm" role="status" aria-hidden="true" />
                        <span>Processing...</span>
                      </>
                    ) : (
                      <>
                        <FiCheckCircle size={16} />
                        <span>
                          {selectedMethod === 'UPI' 
                            ? `I Have Paid ${formatCurrency(grandTotal)}` 
                            : selectedMethod === 'COUNTER' 
                              ? `Confirm Cash Order (${formatCurrency(grandTotal)})` 
                              : `Pay with Card (${formatCurrency(grandTotal)})`}
                        </span>
                      </>
                    )}
                  </button>
                </div>
              </div>

            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PaymentModal;

