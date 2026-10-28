import React from 'react';
import formatCurrency from '../../utils/formatCurrency';

const Row = ({ label, value, className = '' }) => (
  <div className={`d-flex align-items-center justify-content-between mb-2 ${className}`}>
    <span className="small">{label}</span>
    <span className="fw-bold">{value}</span>
  </div>
);

// Renders the pricing block of a server cart view (GET/PUT /cart/..., POST /checkout/validate/).
export const ServerBillSummary = ({ cart, children }) => {
  const isTakeaway = String(cart?.order_type || '').toUpperCase() === 'TAKEAWAY';
  const pricing = cart?.pricing;
  const takeawayCharge = isTakeaway ? Number(pricing?.takeaway_charge || 0) : 0;
  return (
    <div className="card rounded-3 border-0 shadow-sm p-3 p-sm-4 bg-white mb-4 text-start" data-testid="server-bill">
      <h5 className="fw-bold text-dark mb-3 border-bottom pb-2">Order Bill Summary</h5>
      {!pricing ? (
        <p className="text-secondary small mb-0">The bill appears once your cart has items that can be ordered.</p>
      ) : (
        <>
          <Row label="Items Total" value={formatCurrency(Number(pricing.items_subtotal))} className="text-dark" />
          {Number(pricing.customization_total) > 0 && (
            <Row label="Add-ons" value={`+${formatCurrency(Number(pricing.customization_total))}`} className="text-dark" />
          )}
          {Number(pricing.dish_discount_total) > 0 && (
            <Row label="Menu Discounts" value={`-${formatCurrency(Number(pricing.dish_discount_total))}`} className="text-success" />
          )}
          {isTakeaway && takeawayCharge > 0 && (
            <Row label="Packing Charge (Takeaway)" value={`+${formatCurrency(takeawayCharge)}`} className="text-dark" />
          )}
          {Number(pricing.service_charge_amount || 0) > 0 && (
            <Row
              label={`Service Charge (${Number(pricing.service_charge_rate) || 0}%)`}
              value={formatCurrency(Number(pricing.service_charge_amount || 0))}
              className="text-dark"
            />
          )}
          {pricing.taxable_amount != null && (
            <Row label="Taxable Amount" value={formatCurrency(Number(pricing.taxable_amount))} className="text-dark" />
          )}
          {(pricing.coupons || []).map((c) => (
            <Row key={c.code} label={`Coupon Discount (${c.code})`} value={`-${formatCurrency(Number(c.discount))}`} className="text-success" />
          ))}
          <Row label={`GST (${Number(pricing.gst_rate) || 0}%)`} value={formatCurrency(Number(pricing.gst_amount || 0))} className="text-dark" />
          {Number(pricing.round_off || 0) !== 0 && (
            <Row label="Round Off" value={formatCurrency(Number(pricing.round_off || 0))} className="text-dark" />
          )}
          <div className="d-flex align-items-center justify-content-between my-3 pt-3 border-top fw-bold fs-5 text-dark">
            <span>Grand Total</span>
            <span className="text-danger fw-bold fs-4" data-testid="server-total">
              {formatCurrency(Number(pricing.total_amount))}
            </span>
          </div>
        </>
      )}
      {((cart?.issues || []).filter(issue => !String(issue.detail || '').toLowerCase().includes("scan the table qr code"))).length > 0 && (
        <div className="alert alert-warning small py-2 mb-3" role="alert">
          {cart.issues
            .filter(issue => !String(issue.detail || '').toLowerCase().includes("scan the table qr code"))
            .map((issue, idx) => <div key={idx}>{issue.detail}</div>)}
        </div>
      )}
      {children}
    </div>
  );
};

export default ServerBillSummary;
