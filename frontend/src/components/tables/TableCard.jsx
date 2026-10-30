import React from 'react';
import { FiLayers, FiShoppingCart, FiEdit2, FiTrash2 } from 'react-icons/fi';

export function getShortTableNumber(val) {
  if (!val && val !== 0) return 'T1';
  const str = String(val).trim();
  const digits = str.replace(/\D/g, '');
  if (digits) {
    return `T${parseInt(digits, 10)}`;
  }
  return str.startsWith('T') ? str : `T${str}`;
}

export const TableCard = ({
  table,
  onSelect,
  onStatusChange,
  onEdit,
  onDelete,
  onViewQR,
  isAdmin = false,
  showActions = false,
  hasDishes = true,
  hasActiveOrder = false
}) => {
  const isOccupied = table.status === 'Occupied' || hasActiveOrder || Boolean(table.has_active_order) || Boolean(table.is_occupied);
  const isReserved = table.status === 'Reserved';
  const isInactive = table.is_active === false;

  const statusColor = isOccupied ? '#ef4444' : isReserved ? '#f59e0b' : '#22c55e';
  const statusLabel = isOccupied ? 'Occupied' : isReserved ? 'Reserved' : 'Available';

  const isTakeOrderDisabled = !hasDishes || isOccupied || isInactive;
  const hasUnfinishedOrders = Boolean(table.has_active_order || hasActiveOrder);

  const getTakeOrderTooltip = () => {
    if (isOccupied) return 'Table is occupied.';
    if (isInactive) return 'This table is inactive.';
    if (!hasDishes) return 'Cannot take order: menu categories and dishes required.';
    return 'Take Order';
  };

  const rawNum = table.number || table.table_number || table.id || '';
  const shortNum = getShortTableNumber(rawNum);

  return (
    <div className={`table-card transition-all ${
      !isOccupied && !isReserved ? 'table-available' : 
      isOccupied ? 'table-occupied' : 'table-reserved'
    } ${isInactive ? 'opacity-75' : ''}`}>
      {/* Top Header: Table Short Name & Availability Indicator */}
      <div className="d-flex align-items-center justify-content-between mb-2.5 pb-2 border-bottom flex-shrink-0">
        <div className="d-flex align-items-center" style={{ gap: '8px' }}>
          <FiLayers size={17} className="text-secondary flex-shrink-0" />
          <span className="fw-bold text-dark text-nowrap fs-6" style={{ letterSpacing: '-0.2px' }}>
            {shortNum}
          </span>
          <span
            className="rounded-circle d-inline-block flex-shrink-0"
            style={{
              width: '9px',
              height: '9px',
              backgroundColor: statusColor,
              boxShadow: `0 0 0 2.5px ${statusColor}33`,
            }}
            title={statusLabel}
            aria-label={`Table status: ${statusLabel}`}
            role="status"
          />
        </div>
        <div className="d-flex align-items-center flex-shrink-0" style={{ gap: '6px' }}>
          {isAdmin && (
            <div className="d-flex align-items-center gap-1 ms-1">
              <button 
                type="button"
                onClick={(e) => { e.stopPropagation(); onEdit(table); }}
                className="btn btn-sm btn-outline-secondary p-0 border-0"
                style={{ borderRadius: '50%', width: '24px', height: '24px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                title="Edit Table"
              >
                <FiEdit2 size={12} />
              </button>
              <button 
                type="button"
                onClick={(e) => { e.stopPropagation(); onDelete(table); }}
                className="btn btn-sm btn-outline-danger p-0 border-0"
                style={{ borderRadius: '50%', width: '24px', height: '24px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                title="Delete Table"
              >
                <FiTrash2 size={12} />
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Middle Body: Capacity & Details */}
      <div className="text-start mb-2.5 text-secondary flex-grow-1" style={{ fontSize: '12px', lineHeight: '1.5' }}>
        <div className="mb-1 text-truncate">
          Capacity: <strong className="text-dark">{table.capacity || 4} Diners</strong>
        </div>
        <div className="mb-1 text-truncate">
          Location: <strong className="text-dark">{table.location || table.area || 'Indoor Main'}</strong>
        </div>
        {isReserved && table.reservationName && (
          <div className="text-warning-emphasis fw-semibold text-truncate mt-1" style={{ fontSize: '11.5px' }}>
            Reserved for: {table.reservationName}
          </div>
        )}
      </div>

      {/* Footer Action Buttons */}
      {showActions && (
        <div className="d-flex justify-content-end align-items-center pt-2.5 border-top mt-auto flex-shrink-0 flex-nowrap" style={{ gap: '8px' }}>
          {hasDishes && onViewQR && (
            <button 
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                e.preventDefault();
                onViewQR(table);
              }} 
              className="table-card-btn btn btn-outline-dark d-inline-flex align-items-center justify-content-center text-nowrap flex-grow-1 flex-shrink-0"
              title="View Table QR Code"
              style={{ fontSize: '11.5px', padding: '4px 10px', height: '32px' }}
            >
              <i className="bi bi-qr-code me-1"></i>
              <span>QR Code</span>
            </button>
          )}
          {!isOccupied && !isReserved && (
            <button 
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                e.preventDefault();
                if (!hasDishes) return;
                onStatusChange(table.id, 'Reserved');
              }} 
              disabled={!hasDishes}
              className={`table-card-btn btn d-inline-flex align-items-center justify-content-center text-nowrap flex-grow-1 flex-shrink-0 ${!hasDishes ? 'btn-outline-secondary opacity-50' : 'btn-outline-warning'}`}
              style={{ cursor: !hasDishes ? 'not-allowed' : 'pointer', fontSize: '11.5px', padding: '4px 10px', height: '32px' }}
              title={!hasDishes ? "Cannot reserve: menu categories and dishes required" : "Reserve Table"}
            >
              <span>Reserve</span>
            </button>
          )}
          {(isOccupied || isReserved) && (
            <button 
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                e.preventDefault();
                if (hasUnfinishedOrders) return;
                onStatusChange(table.id, 'Available');
              }} 
              disabled={hasUnfinishedOrders}
              className={`table-card-btn btn d-inline-flex align-items-center justify-content-center text-nowrap flex-grow-1 flex-shrink-0 ${hasUnfinishedOrders ? 'btn-outline-secondary opacity-50' : 'btn-outline-success'}`}
              style={{ cursor: hasUnfinishedOrders ? 'not-allowed' : 'pointer', fontSize: '11.5px', padding: '4px 10px', height: '32px' }}
              title={hasUnfinishedOrders ? "Cannot vacate: active order in progress" : (isReserved ? "Release Reservation / Vacate" : "Vacate Table")}
            >
              <span>Vacate</span>
            </button>
          )}
          <button 
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              e.preventDefault();
              if (isTakeOrderDisabled) return;
              onSelect(table);
            }} 
            disabled={isTakeOrderDisabled}
            className={`table-card-btn btn d-inline-flex align-items-center justify-content-center text-nowrap flex-grow-1 flex-shrink-0 ${isTakeOrderDisabled ? 'btn-secondary opacity-50' : 'btn-danger shadow-xs'}`}
            style={{ cursor: isTakeOrderDisabled ? 'not-allowed' : 'pointer', fontSize: '11.5px', padding: '4px 10px', height: '32px' }}
            title={getTakeOrderTooltip()}
          >
            <FiShoppingCart size={12} className="me-1" />
            <span>Take Order</span>
          </button>
        </div>
      )}
    </div>
  );
};

export default TableCard;
