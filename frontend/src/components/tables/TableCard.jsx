import React from 'react';
import { FiEdit2, FiEye, FiTrash2, FiRotateCw } from 'react-icons/fi';
import { tableService } from '../../services/tableService';

export function getShortTableNumber(val) {
  if (!val && val !== 0) return '1';
  const str = String(val).trim();
  const digits = str.replace(/\D/g, '');
  if (digits) {
    return String(parseInt(digits, 10));
  }
  return str;
}

export const TableCard = ({
  table,
  onSelect,
  onStatusChange,
  onEdit,
  onDelete,
  onViewQR,
  onTrackOrder,
  onOrderAgain,
  isAdmin = false,
  showActions = true,
  hasDishes = true,
  hasActiveOrder = false
}) => {
  const isOccupied = table.status === 'Occupied' || hasActiveOrder || Boolean(table.has_active_order) || Boolean(table.is_occupied);
  const isReserved = table.status === 'Reserved';
  const isInactive = table.is_active === false;

  const currentStatus = isOccupied ? 'Occupied' : isReserved ? 'Reserved' : (table.status || 'Available');
  const rawNum = table.number || table.table_number || table.id || '';
  const displayTableNum = getShortTableNumber(rawNum);

  return (
    <div 
      className={`card shadow-xs transition-all position-relative d-flex flex-column justify-content-between ${isInactive ? 'opacity-75' : ''}`}
      onClick={(e) => {
        if (!isInactive && onSelect) {
          onSelect(table);
        }
      }}
      style={{
        aspectRatio: '1 / 1',
        borderRadius: '12px',
        backgroundColor: isOccupied ? '#FEF2F2' : '#F0FDF4',
        border: isOccupied ? '1.5px solid #FECACA' : '1.5px solid #BBF7D0',
        padding: '8px',
        cursor: isInactive ? 'not-allowed' : 'pointer',
        userSelect: 'none'
      }}
      title={`Table ${displayTableNum} (${currentStatus})`}
    >
      {/* Top action row */}
      <div className="d-flex justify-content-between align-items-center w-100">
        {isAdmin && onDelete ? (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onDelete(table); }}
            className="btn btn-sm btn-link text-danger p-0 border-0 opacity-50 hover-opacity-100"
            title="Delete Table"
            style={{ fontSize: '12px', lineHeight: 1 }}
          >
            <FiTrash2 size={12} />
          </button>
        ) : <span />}

        {onViewQR && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onViewQR(table);
            }}
            className="btn btn-sm btn-link text-muted p-0 border-0"
            title="View Table QR Code"
            aria-label="QR Code"
            style={{ lineHeight: 1 }}
          >
            <i className="bi bi-qr-code" style={{ fontSize: '12px' }} />
          </button>
        )}
      </div>

      {/* Center: Table Number ONLY */}
      <div className="d-flex align-items-center justify-content-center flex-grow-1 my-1">
        <span 
          className="fw-bold" 
          style={{ 
            fontSize: '28px', 
            letterSpacing: '-0.5px',
            color: isOccupied ? '#DC2626' : '#16A34A',
            lineHeight: 1
          }}
        >
          {displayTableNum}
        </span>
      </div>

      {/* Bottom Action Buttons */}
      <div className="d-flex align-items-center justify-content-center gap-1.5 w-100 pt-1" onClick={(e) => e.stopPropagation()}>
        {onEdit && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onEdit(table);
            }}
            className="btn btn-sm bg-white rounded-circle p-0 d-inline-flex align-items-center justify-content-center shadow-2xs border text-secondary"
            style={{ width: '26px', height: '26px', borderColor: '#CBD5E1' }}
            title="Edit Table"
            aria-label="Edit Table"
          >
            <FiEdit2 size={11} className="text-muted" />
          </button>
        )}

        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            if (isOccupied && onTrackOrder) {
              onTrackOrder(table);
            } else if (!isOccupied && onSelect) {
              onSelect(table);
            } else if (onTrackOrder) {
              onTrackOrder(table);
            }
          }}
          className="btn btn-sm bg-white rounded-circle p-0 d-inline-flex align-items-center justify-content-center shadow-2xs border text-secondary"
          style={{ width: '26px', height: '26px', borderColor: '#CBD5E1' }}
          title={isOccupied ? "View Order Details" : "Take Order"}
          aria-label={isOccupied ? "View Order Details" : "Take Order"}
        >
          <FiEye size={12} className="text-muted" />
        </button>

        {isOccupied && onOrderAgain && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onOrderAgain(table);
            }}
            className="btn btn-sm bg-white rounded-circle p-0 d-inline-flex align-items-center justify-content-center shadow-2xs border text-secondary"
            style={{ width: '26px', height: '26px', borderColor: '#CBD5E1' }}
            title="Order Again"
            aria-label="Order Again"
          >
            <FiRotateCw size={11} className="text-danger" />
          </button>
        )}
      </div>
    </div>
  );
};

export default TableCard;

