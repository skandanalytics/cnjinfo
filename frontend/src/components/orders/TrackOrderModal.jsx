import React from 'react';
import Modal from '../common/Modal';
import Button from '../common/Button';
import formatCurrency from '../../utils/formatCurrency';
import { FiPlus, FiFileText, FiX, FiClock, FiUser, FiPhone, FiMapPin } from 'react-icons/fi';

const STATUS_BADGE_STYLE = {
  PENDING: { bg: 'bg-warning-subtle text-warning-emphasis border-warning-subtle', label: 'Pending / New' },
  PREPARING: { bg: 'bg-info-subtle text-info-emphasis border-info-subtle', label: 'Preparing' },
  READY: { bg: 'bg-primary-subtle text-primary border-primary-subtle', label: 'Ready (Kitchen)' },
  SERVED: { bg: 'bg-info-subtle text-info-emphasis border-info-subtle', label: 'Served' },
  COMPLETED: { bg: 'bg-success-subtle text-success border-success-subtle', label: 'Completed' },
  CANCELLED: { bg: 'bg-danger-subtle text-danger border-danger-subtle', label: 'Cancelled' },
};

export const TrackOrderModal = ({
  isOpen,
  order,
  table,
  onClose,
  onContinueOrder,
  onProceedToBill,
  loading = false,
}) => {
  if (!isOpen) return null;

  const rawStatus = String(order?.status || 'PENDING').toUpperCase();
  const statusCfg = STATUS_BADGE_STYLE[rawStatus] || {
    bg: 'bg-secondary-subtle text-secondary border-secondary-subtle',
    label: order?.status || 'Pending',
  };

  const isPaid = Boolean(
    order?.is_paid ||
    order?.isPaid ||
    String(order?.payment_status || order?.paymentStatus || '').toUpperCase() === 'PAID'
  );

  const displayOrderNo = order?.display_order_number || order?.display_number || order?.order_number || order?.id || '';
  const tableNum = table?.number || table?.table_number || order?.table || order?.table_number || order?.table_label || '—';
  const tableLocation = table?.location || table?.area || order?.tableLocation || order?.location || '';
  const customerName = order?.customerName || order?.customer_name || order?.customer?.name || '';
  const customerPhone = order?.customerPhone || order?.customer_phone || order?.customer?.phone || '';

  const displayItems = (order?.combined_items && order?.combined_items.length > 0)
    ? order.combined_items
    : (order?.items || []);

  const subtotal = Number(order?.combined_items_subtotal ?? order?.items_subtotal ?? order?.subtotal ?? 0);
  const tax = Number(order?.gst_amount ?? order?.tax ?? 0);
  const serviceCharge = Number(order?.service_charge_amount ?? order?.serviceCharge ?? 0);
  const grandTotal = Number(order?.combined_total ?? order?.total_amount ?? order?.total ?? 0);
  const paidAmount = Number(order?.paid_amount ?? 0);
  const balanceDue = Number(order?.balance_due ?? (grandTotal - paidAmount));

  const whenStr = order?.created_at
    ? new Date(order.created_at).toLocaleString('en-IN', {
        dateStyle: 'medium',
        timeStyle: 'short',
      })
    : [order?.date, order?.time].filter(Boolean).join(' at ');

  const footerActions = (
    <div className="d-flex align-items-center justify-content-between w-100 gap-2 flex-wrap">
      <button 
        type="button" 
        onClick={onClose} 
        className="btn btn-light rounded-pill px-4 border text-dark fw-semibold"
        style={{ height: '42px', fontSize: '13px' }}
      >
        Close
      </button>
      <div className="d-flex align-items-center gap-2">
        {rawStatus !== 'COMPLETED' && rawStatus !== 'CANCELLED' && (
          <button
            type="button"
            onClick={() => onContinueOrder && onContinueOrder(order)}
            disabled={loading || !order}
            className="btn rounded-pill px-4 fw-bold"
            style={{ 
              height: '42px', 
              fontSize: '13px', 
              backgroundColor: '#FFFFFF', 
              color: 'var(--primary-color, #F20D2D)', 
              border: '1.5px solid var(--primary-color, #F20D2D)' 
            }}
          >
            Continue Order
          </button>
        )}
        <button
          type="button"
          onClick={() => onProceedToBill && onProceedToBill(order)}
          disabled={loading || !order}
          className="btn btn-danger rounded-pill px-4 fw-bold shadow-sm"
          style={{ 
            height: '42px', 
            fontSize: '13px', 
            backgroundColor: 'var(--primary-color, #F20D2D)', 
            borderColor: 'var(--primary-color, #F20D2D)' 
          }}
        >
          {rawStatus === 'COMPLETED' ? 'View E-Bill' : 'View Bill'}
        </button>
      </div>
    </div>
  );

  return (
    <Modal
      isOpen={isOpen}
      title=""
      onClose={onClose}
      footerActions={footerActions}
      size="lg"
    >
      {/* Header Context (Matches Reference 10) */}
      <div className="d-flex align-items-start justify-content-between pb-3 mb-3 border-bottom">
        <div>
          <div className="text-secondary fw-semibold small mb-1" style={{ fontSize: '13px' }}>
            Table {tableNum} - Existing Order
          </div>
          <h4 className="fw-bold text-dark mb-1" style={{ fontSize: '22px', letterSpacing: '-0.5px' }}>
            Order #{displayOrderNo}
          </h4>
          <div className="small text-muted d-flex align-items-center gap-2 flex-wrap" style={{ fontSize: '12px' }}>
            <span>{order?.order_type || 'Dine-in'} • {whenStr || 'Today'}</span>
            {customerPhone && (
              <span className="fw-semibold text-secondary">Customer: {customerPhone}</span>
            )}
          </div>
        </div>

        <div>
          <span 
            className="badge rounded-pill px-3 py-1.5 fw-bold text-white shadow-xs"
            style={{ backgroundColor: '#10B981', fontSize: '12px' }}
          >
            {rawStatus === 'COMPLETED' ? 'Completed' : 'Ongoing'}
          </span>
        </div>
      </div>

      {/* Red Header Bar Items Table (Matches Screenshot 10) */}
      <div className="rounded-3 overflow-hidden border mb-3">
        <div 
          className="d-flex align-items-center justify-content-between px-3 py-2 text-white fw-bold small" 
          style={{ backgroundColor: 'var(--primary-color, #F20D2D)', fontSize: '13px' }}
        >
          <span style={{ flex: 2 }}>Item</span>
          <span className="text-center" style={{ flex: 1 }}>Qty</span>
          <span className="text-end" style={{ flex: 1 }}>Amount</span>
        </div>

        <div style={{ maxHeight: '220px', overflowY: 'auto' }}>
          {displayItems.length === 0 ? (
            <div className="p-3 text-center text-muted small">No items recorded in this ticket.</div>
          ) : (
            displayItems.map((item, idx) => (
              <div 
                key={item.id || idx} 
                className="d-flex align-items-center justify-content-between px-3 py-2 border-bottom small"
                style={{ fontSize: '13px' }}
              >
                <div style={{ flex: 2 }} className="text-truncate">
                  <span className="fw-semibold text-dark">{item.name || item.food_name || 'Dish'}</span>
                  {item.special_instructions && (
                    <span className="text-muted d-block" style={{ fontSize: '11px' }}>({item.special_instructions})</span>
                  )}
                </div>
                <span className="text-center text-dark" style={{ flex: 1 }}>{item.quantity || 1}</span>
                <span className="text-end fw-bold text-dark" style={{ flex: 1 }}>
                  {formatCurrency(item.line_total != null ? item.line_total : item.lineTotal != null ? item.lineTotal : ((item.unit_price || item.price || 0) * (item.quantity || 1)))}
                </span>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Financial Breakdown */}
      <div className="d-flex flex-column gap-1.5 pt-2 border-top">
        <div className="d-flex justify-content-between text-secondary small" style={{ fontSize: '13px' }}>
          <span>Subtotal</span>
          <span>{formatCurrency(subtotal)}</span>
        </div>
        {Number(order?.discount || order?.coupon_discount || 0) > 0 && (
          <div className="d-flex justify-content-between small text-success" style={{ fontSize: '13px' }}>
            <span>Menu Discount</span>
            <span>-{formatCurrency(order?.discount || order?.coupon_discount || 0)}</span>
          </div>
        )}
        <div className="d-flex justify-content-between text-secondary small" style={{ fontSize: '13px' }}>
          <span>GST (5%)</span>
          <span>{formatCurrency(tax)}</span>
        </div>
        <div className="d-flex justify-content-between fw-bold fs-5 pt-2 border-top mt-1" style={{ color: 'var(--primary-color, #F20D2D)' }}>
          <span>Grand Total</span>
          <span>{formatCurrency(grandTotal)}</span>
        </div>
      </div>
    </Modal>
  );
};

export default TrackOrderModal;
