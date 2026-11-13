import React, { useState } from 'react';
import Badge from '../common/Badge';
import formatCurrency from '../../utils/formatCurrency';
import { FiClock, FiLayers, FiEye, FiShoppingBag, FiChevronDown, FiChevronRight } from 'react-icons/fi';
import { formatOrderDisplayNumber } from '../../utils/orderNumber';

export const OrderCard = ({
  order,
  suborders = [],
  isExpanded = false,
  onToggleExpand,
  onViewDetails,
  onViewEBill
}) => {
  const itemsSummary = (order.items || []).map((i) => `${i.name} x${i.quantity}`).join(', ');

  const isTakeaway = String(order.orderType || order.order_type || order.source || '').toUpperCase().includes('TAKEAWAY') || 
    String(order.table || '').toLowerCase() === 'takeaway';
  
  const rawTable = order.table ? String(order.table).replace(/^(table\s*|t-?)/i, '').trim() : '';
  const displayTable = rawTable ? `T${rawTable.padStart(2, '0')}` : (order.table || '');
  const dinerCount = order.diners ?? order.number_of_diners ?? null;
  const dinerLabel = dinerCount ? `${dinerCount} ${Number(dinerCount) === 1 ? 'Diner' : 'Diners'}` : null;
  const hasSuborders = Array.isArray(suborders) && suborders.length > 0;

  return (
    <div className="card rounded-3 shadow-sm p-4 bg-white foodie-card mb-3">
      <div className="d-flex flex-column flex-sm-row justify-content-between align-items-start align-items-sm-center border-bottom pb-3 mb-3 gap-2">
        <div className="d-flex align-items-center gap-2 flex-wrap">
          {hasSuborders && (
            <button
              type="button"
              onClick={onToggleExpand}
              className="btn btn-sm btn-outline-secondary rounded-pill py-0.5 px-2 fw-semibold d-inline-flex align-items-center gap-1 shadow-xs"
              style={{ fontSize: '11px', borderColor: '#cbd5e1' }}
              title={isExpanded ? "Collapse Suborders" : "Expand Suborders"}
              aria-label={isExpanded ? "Collapse Suborders" : "Expand Suborders"}
            >
              {isExpanded ? <FiChevronDown size={14} className="text-danger" /> : <FiChevronRight size={14} />}
              <span>{suborders.length} {suborders.length === 1 ? 'Suborder' : 'Suborders'}</span>
            </button>
          )}
          <span className="fw-bold text-dark fs-5">Order #{formatOrderDisplayNumber(order, order.id)}</span>
          <div className="text-muted small d-flex align-items-center gap-1 ms-sm-2">
            <FiClock /> {order.date} at {order.time}
          </div>
        </div>
        <Badge status={order.status} />
      </div>

      <div className="row align-items-center">
        <div className="col-12 col-md-8 mb-3 mb-md-0">
          {isTakeaway ? (
            <div className="text-secondary small fw-semibold d-flex align-items-center gap-1.5">
              <FiShoppingBag className="text-danger" size={15} />
              <span className="badge bg-danger-subtle text-danger fw-bold px-2 py-0.5" style={{ fontSize: '11px', letterSpacing: '0.5px' }}>
                TAKEAWAY
              </span>
            </div>
          ) : (
            <div className="text-secondary small fw-semibold d-flex align-items-center gap-1">
              <FiLayers size={14} className="text-secondary" />
              <span>TABLE: <strong className="text-dark">{displayTable}</strong></span>
              {dinerLabel && (
                <>
                  <span className="text-muted mx-1">·</span>
                  <span className="text-secondary">{dinerLabel}</span>
                </>
              )}
            </div>
          )}
          <div className="fw-bold text-dark text-truncate mt-2" style={{ maxWidth: '400px' }}>
            {itemsSummary}
          </div>
          <div className="text-muted small mt-1 d-flex align-items-center gap-1.5 flex-wrap">
            <span>Source: <strong>{isTakeaway ? 'Takeaway' : (order.source || 'Dine-In')}</strong></span>
            <span>|</span>
            <span>Payment: </span>
            {String(order.paymentStatus || order.payment_status || '').toUpperCase() === 'PAID' ? (
              <span className="badge bg-success-subtle text-success rounded-pill px-2 py-0.5 fw-semibold" style={{ fontSize: '11px' }}>Paid</span>
            ) : (String(order.paymentStatus || order.payment_status || '').toUpperCase() === 'PENDING' || String(order.payment_method || '').toUpperCase() === 'UPI') ? (
              <span className="badge bg-warning-subtle text-warning-emphasis border border-warning-subtle rounded-pill px-2 py-0.5 fw-semibold" style={{ fontSize: '11px' }}>Pending Verification (UPI)</span>
            ) : (
              <span className="badge bg-secondary-subtle text-secondary rounded-pill px-2 py-0.5 fw-semibold" style={{ fontSize: '11px' }}>Unpaid</span>
            )}
          </div>
        </div>

        <div className="col-12 col-md-4 text-start text-md-end">
          <div className="text-secondary small">Total Amount</div>
          <h4 className="fw-bold text-danger mt-1 mb-3">{formatCurrency(order.total)}</h4>
          <div className="d-flex align-items-center justify-content-start justify-content-md-end flex-wrap" style={{ gap: '10px' }}>
            <button 
              type="button"
              onClick={(e) => { e.stopPropagation(); if(onViewEBill) onViewEBill(order); }}
              className="btn btn-outline-danger btn-sm rounded-pill px-3 py-1.5 fw-bold d-inline-flex align-items-center justify-content-center gap-2"
              style={{ fontSize: '12px', height: '32px' }}
              title="View E-Bill"
            >
              <FiEye size={13} className="flex-shrink-0" />
              <span>Show Bill</span>
            </button>
            <button 
              onClick={() => onViewDetails(order)} 
              className="btn btn-danger btn-sm rounded-pill px-3.5 py-1.5 fw-bold text-white shadow-xs d-inline-flex align-items-center justify-content-center"
              style={{ backgroundColor: 'var(--primary-color)', borderColor: 'var(--primary-color)', fontSize: '12px', minWidth: '60px', height: '32px' }}
            >
              View Details
            </button>
          </div>
        </div>
      </div>

      {/* Expandable Suborders Breakdown in Card View */}
      {hasSuborders && isExpanded && (
        <div 
          className="mt-3 pt-3 border-top" 
          style={{ 
            backgroundColor: '#f8fafc', 
            margin: '1rem -1.5rem -1.5rem -1.5rem', 
            padding: '1rem 1.5rem', 
            borderBottomLeftRadius: '0.5rem', 
            borderBottomRightRadius: '0.5rem',
            borderTop: '1px dashed #cbd5e1'
          }}
        >
          <div className="small fw-bold text-secondary mb-2 d-flex align-items-center gap-1">
            <span>Suborders</span>
            <span className="badge bg-secondary-subtle text-secondary rounded-pill">{suborders.length}</span>
          </div>
          <div className="d-flex flex-column gap-2">
            {suborders.map((sub, idx) => {
              const isLast = idx === suborders.length - 1;
              const subDisplayNo = formatOrderDisplayNumber(sub, sub.id);
              const isSubPaid = String(sub.paymentStatus || sub.payment_status || '').toUpperCase() === 'PAID';
              const subItemsCount = sub.items_count !== undefined ? sub.items_count : (sub.items ? sub.items.length : null);
              const subTime = sub.time || (sub.created_at ? new Date(sub.created_at).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true }) : '');

              return (
                <div 
                  key={sub.id || idx}
                  className="d-flex flex-column flex-sm-row align-items-start align-items-sm-center justify-content-between p-2.5 rounded-2 bg-white border shadow-xs gap-2"
                  style={{ borderLeft: '3px solid var(--primary-color, #F20D2D)' }}
                >
                  <div className="d-flex align-items-center gap-2 flex-wrap">
                    <span className="font-monospace fw-bold text-muted" style={{ fontSize: '13px', color: '#94a3b8' }}>
                      {isLast ? '└──' : '├──'}
                    </span>
                    <span className="badge bg-secondary-subtle text-dark border fw-bold font-monospace" style={{ fontSize: '11px' }}>
                      #{subDisplayNo}
                    </span>
                    {subTime && (
                      <span className="text-muted small d-flex align-items-center gap-1">
                        <FiClock size={11} /> {subTime}
                      </span>
                    )}
                    {subItemsCount !== null && (
                      <span className="text-secondary small">({subItemsCount} {subItemsCount === 1 ? 'item' : 'items'})</span>
                    )}
                  </div>
                  <div className="d-flex align-items-center gap-2 w-100 w-sm-auto justify-content-between justify-content-sm-end">
                    <span className="fw-bold text-dark font-monospace" style={{ fontSize: '13px' }}>
                      {formatCurrency(sub.total ?? sub.total_amount ?? 0)}
                    </span>
                    <Badge status={sub.status} />
                    {isSubPaid ? (
                      <span className="badge bg-success-subtle text-success rounded-pill px-2 py-0.5" style={{ fontSize: '10px' }}>Paid</span>
                    ) : (
                      <span className="badge bg-secondary-subtle text-secondary rounded-pill px-2 py-0.5" style={{ fontSize: '10px' }}>Unpaid</span>
                    )}
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); onViewDetails(sub); }}
                      className="btn btn-sm btn-outline-secondary rounded-pill px-2 py-0.5 shadow-xs"
                      style={{ fontSize: '11px' }}
                      title="View Suborder Details"
                    >
                      Details
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
export default OrderCard;
