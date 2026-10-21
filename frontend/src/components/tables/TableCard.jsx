import React from 'react';
import { FiLayers, FiShoppingCart, FiEdit2, FiTrash2 } from 'react-icons/fi';
import { tableService } from '../../services/tableService';

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
  const isOccupied = table.status === 'Occupied' || hasActiveOrder || Boolean(table.is_occupied);
  const isReserved = table.status === 'Reserved';
  const isInactive = table.is_active === false;

  const currentStatus = isOccupied ? 'Occupied' : isReserved ? 'Reserved' : (table.status || 'Available');
  const statusColor = currentStatus === 'Occupied' ? '#ef4444' : currentStatus === 'Reserved' ? '#f59e0b' : '#22c55e';

  const isTakeOrderDisabled = !hasDishes || isOccupied || isInactive;

  const getTakeOrderTooltip = () => {
    if (isOccupied) return 'Table is occupied.';
    if (isInactive) return 'This table is inactive.';
    if (!hasDishes) return 'Cannot take order: menu categories and dishes required.';
    return 'Take Order';
  };

  const rawNum = table.number || table.table_number || table.id || '';
  const displayTableNum = tableService.getCanonicalTableNumber(rawNum);

  return (
    <div className={`table-card transition-all ${
      table.status === 'Available' && !isOccupied ? 'table-available' : 
      isOccupied ? 'table-occupied' : 'table-reserved'
    }`}>
      {/* Top Header: Table Number & Status Indicator */}
      <div className="d-flex align-items-center justify-content-between mb-3 pb-2.5 border-bottom flex-shrink-0">
        <div className="d-flex align-items-center" style={{ gap: '8px' }}>
          <FiLayers size={18} className="text-secondary flex-shrink-0" />
          <span className="fw-bold text-dark text-nowrap fs-6" style={{ letterSpacing: '-0.2px' }}>
            Table {displayTableNum}
          </span>
          <span
            className="rounded-circle d-inline-block flex-shrink-0"
            style={{
              width: '9px',
              height: '9px',
              backgroundColor: statusColor,
              boxShadow: `0 0 0 2.5px ${statusColor}33`,
            }}
            title={currentStatus}
            aria-label={`Table status: ${currentStatus}`}
            role="status"
          />
        </div>
        <div className="d-flex align-items-center flex-shrink-0" style={{ gap: '8px' }}>
          {isAdmin && (
            <div className="d-flex align-items-center gap-1 ms-1">
              <button 
                type="button"
                onClick={(e) => { e.stopPropagation(); onEdit(table); }}
                className="btn btn-sm btn-outline-secondary p-0 border-0"
                style={{ borderRadius: '50%', width: '26px', height: '26px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                title="Edit Table"
              >
                <FiEdit2 size={13} />
              </button>
              <button 
                type="button"
                onClick={(e) => { e.stopPropagation(); onDelete(table); }}
                className="btn btn-sm btn-outline-danger p-0 border-0"
                style={{ borderRadius: '50%', width: '26px', height: '26px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                title="Delete Table"
              >
                <FiTrash2 size={13} />
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Middle Body: Capacity & Details */}
      <div className="text-start mb-3 text-secondary flex-grow-1" style={{ fontSize: '12.5px', lineHeight: '1.6' }}>
        <div className="mb-1 text-truncate">
          Capacity: <strong className="text-dark">{table.capacity || 4} Diners</strong>
        </div>
        <div className="mb-1 text-truncate">
          Location: <strong className="text-dark">{table.location || table.area || '—'}</strong>
        </div>
        {table.linkedMenus && (
          <div className="mb-1 text-truncate">
            Menu: <strong className="text-dark">{table.linkedMenus}</strong>
          </div>
        )}
        {isReserved && table.reservationName && (
          <div className="text-warning-emphasis fw-semibold text-truncate mt-1">
            Reserved for: {table.reservationName}
          </div>
        )}
      </div>

      {/* Footer Action Buttons */}
      {showActions && (
        <div className="d-flex gap-2 justify-content-end pt-3 border-top flex-wrap align-items-center mt-auto flex-shrink-0">
          {hasDishes && onViewQR && (
            <button 
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                e.preventDefault();
                onViewQR(table);
              }} 
              className="table-card-btn btn btn-outline-dark"
              title="View Table QR Code"
            >
              <i className="bi bi-qr-code"></i>
              QR Code
            </button>
          )}
          {table.status === 'Available' && !isOccupied && (
            <button 
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                e.preventDefault();
                if (!hasDishes) return;
                onStatusChange(table.id, 'Reserved');
              }} 
              disabled={!hasDishes}
              className={`table-card-btn btn ${!hasDishes ? 'btn-outline-secondary opacity-50' : 'btn-outline-warning'}`}
              style={{ cursor: !hasDishes ? 'not-allowed' : 'pointer' }}
              title={!hasDishes ? "Cannot reserve: menu categories and dishes required" : "Reserve Table"}
            >
              Reserve
            </button>
          )}
          {(isOccupied || isReserved) && (
            <button 
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                e.preventDefault();
                onStatusChange(table.id, 'Available');
              }} 
              className="table-card-btn btn btn-outline-success"
              style={{ cursor: 'pointer' }}
              title={isReserved ? "Release Reservation / Vacate" : "Vacate Table"}
            >
              Vacate
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
            className={`table-card-btn btn ${isTakeOrderDisabled ? 'btn-secondary opacity-50' : 'btn-danger shadow-xs'}`}
            style={{ cursor: isTakeOrderDisabled ? 'not-allowed' : 'pointer' }}
            title={getTakeOrderTooltip()}
          >
            <FiShoppingCart size={13} />
            Take Order
          </button>
        </div>
      )}
    </div>
  );
};
export default TableCard;
