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
  onTrackOrder,
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
  const locationLabel = table.location || table.area || 'Indoor';

  return (
    <div 
      className={`card border rounded-4 shadow-sm p-3 h-100 transition-all ${
        isOccupied ? 'border-danger-subtle' : 'border-success-subtle'
      }`}
      style={{
        backgroundColor: 'var(--surface-color)',
        transition: 'all 0.2s ease',
        cursor: 'pointer'
      }}
      onClick={() => {
        if (isOccupied && onTrackOrder) onTrackOrder(table);
        else if (onSelect) onSelect(table);
      }}
    >
      {/* Top Header: Table Number & Admin Actions */}
      <div className="d-flex align-items-center justify-content-between mb-2 pb-1">
        <h5 className="fw-bold text-dark mb-0 fs-5">
          {displayTableNum.startsWith('T') ? displayTableNum : `T${String(displayTableNum).padStart(2, '0')}`}
        </h5>

        <div className="d-flex align-items-center gap-1" onClick={(e) => e.stopPropagation()}>
          {isAdmin && (
            <>
              <button 
                type="button"
                onClick={(e) => { e.stopPropagation(); onEdit(table); }}
                className="btn btn-sm btn-link text-secondary p-1 border-0"
                title="Edit Table"
              >
                <FiEdit2 size={13} />
              </button>
              <button 
                type="button"
                onClick={(e) => { e.stopPropagation(); onDelete(table); }}
                className="btn btn-sm btn-link text-danger p-1 border-0"
                title="Delete Table"
              >
                <FiTrash2 size={13} />
              </button>
            </>
          )}
        </div>
      </div>

      {/* Middle Body: Location & Capacity */}
      <div className="mb-3 text-secondary" style={{ fontSize: '12px' }}>
        <div className="fw-semibold text-secondary mb-0.5">{locationLabel}</div>
        <div className="text-muted" style={{ fontSize: '11px' }}>{table.capacity || 4} Diners</div>
      </div>

      {/* Status Pill Badge */}
      <div className="mt-auto d-flex align-items-center justify-content-between pt-2 border-top">
        <span 
          className={`badge rounded-pill fw-bold px-2.5 py-1 d-inline-flex align-items-center gap-1.5 ${
            isOccupied 
              ? 'bg-danger-subtle text-danger border border-danger-subtle' 
              : 'bg-success-subtle text-success border border-success-subtle'
          }`}
          style={{ fontSize: '11px' }}
        >
          <span 
            className={`rounded-circle d-inline-block ${isOccupied ? 'bg-danger' : 'bg-success'}`}
            style={{ width: '6px', height: '6px' }}
          />
          {isOccupied ? 'Occupied' : 'Available'}
        </span>

        {isOccupied ? (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              if (onTrackOrder) onTrackOrder(table);
            }}
            className="btn btn-xs btn-outline-danger rounded-pill px-2.5 py-0.5 fw-bold"
            style={{ fontSize: '10.5px' }}
          >
            Track Order
          </button>
        ) : (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              if (onSelect) onSelect(table);
            }}
            className="btn btn-xs btn-danger text-white rounded-pill px-2.5 py-0.5 fw-bold shadow-xs"
            style={{ fontSize: '10.5px', backgroundColor: 'var(--primary-color)', borderColor: 'var(--primary-color)' }}
          >
            Take Order
          </button>
        )}
      </div>
    </div>
  );
};
export default TableCard;
