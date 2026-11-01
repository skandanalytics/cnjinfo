import React, { useState } from 'react';
import Badge from '../common/Badge';
import formatCurrency from '../../utils/formatCurrency';
import { FiClock, FiLayers, FiEye, FiShoppingBag } from 'react-icons/fi';
import { formatOrderDisplayNumber } from '../../utils/orderNumber';

export const OrderCard = ({
  order,
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

  return (
    <div className="card rounded-3 shadow-sm p-4 bg-white foodie-card mb-3">
      <div className="d-flex flex-column flex-sm-row justify-content-between align-items-start align-items-sm-center border-bottom pb-3 mb-3 gap-2">
        <div>
          <span className="fw-bold text-dark fs-5">Order #{formatOrderDisplayNumber(order, order.id)}</span>
          <div className="text-muted small mt-1 d-flex align-items-center gap-1">
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
          <div className="text-muted small mt-1">
            Source: <strong>{isTakeaway ? 'Takeaway' : (order.source || 'Dine-In')}</strong> | Payment: <strong className={String(order.paymentStatus || order.payment_status || '').toUpperCase() === 'PAID' ? 'text-success' : 'text-danger'}>{String(order.paymentStatus || order.payment_status || '').toUpperCase() === 'PAID' ? 'Paid' : 'Unpaid'}</strong>
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
    </div>
  );
};
export default OrderCard;
