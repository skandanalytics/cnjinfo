import React from 'react';
import { FiEdit2, FiEye, FiMapPin, FiUsers } from 'react-icons/fi';
import { tableService } from '../../services/tableService';

export function getShortTableNumber(val) {
  if (!val && val !== 0) return 'T1';
  const str = String(val).trim();
  const digits = str.replace(/\D/g, '');
  if (digits) {
    return 'T' + parseInt(digits, 10);
  }
  return str.startsWith('T') ? str : 'T' + str;
}



// Cute restaurant table & chairs SVG graphic matching reference screenshot
const TableIllustration = ({ isOccupied }) => (
  <svg width="68" height="52" viewBox="0 0 68 52" fill="none" xmlns="http://www.w3.org/2000/svg" className="flex-shrink-0">
    {/* Left Chair */}
    <rect x="2" y="16" width="6" height="24" rx="3" fill={isOccupied ? '#DC2626' : '#B45309'} />
    <path d="M5 24H12V32C12 33.1 11.1 34 10 34H5V24Z" fill={isOccupied ? '#EF4444' : '#D97706'} />
    <rect x="4" y="34" width="3" height="14" rx="1.5" fill="#78350F" />

    {/* Right Chair */}
    <rect x="60" y="16" width="6" height="24" rx="3" fill={isOccupied ? '#DC2626' : '#B45309'} />
    <path d="M56 24H63V34H58C56.9 34 56 33.1 56 32V24Z" fill={isOccupied ? '#EF4444' : '#D97706'} />
    <rect x="61" y="34" width="3" height="14" rx="1.5" fill="#78350F" />

    {/* Center Tabletop */}
    <ellipse cx="34" cy="24" rx="24" ry="11" fill="#F59E0B" stroke="#B45309" strokeWidth="2" />
    <ellipse cx="34" cy="23" rx="20" ry="8" fill="#FDE68A" />

    {/* Table Center Vase / Flower */}
    <circle cx="34" cy="20" r="3.5" fill="#10B981" />
    <path d="M34 14C34 14 31 17 34 19C37 17 34 14 34 14Z" fill="#059669" />

    {/* Table Legs & Base */}
    <rect x="32" y="32" width="4" height="14" rx="1" fill="#92400E" />
    <ellipse cx="34" cy="46" rx="10" ry="3" fill="#78350F" />
  </svg>
);

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
  const isOccupied = table.status === 'Occupied' || hasActiveOrder || Boolean(table.has_active_order) || Boolean(table.is_occupied);
  const isReserved = table.status === 'Reserved';
  const isInactive = table.is_active === false;

  const currentStatus = isOccupied ? 'Occupied' : isReserved ? 'Reserved' : (table.status || 'Available');
  const rawNum = table.number || table.table_number || table.id || '';
  const displayTableNum = tableService.getCanonicalTableNumber(rawNum);
  const locationLabel = table.location || table.area || 'Indoor';
  const capacityNumber = table.capacity || table.seating_capacity || 4;

  return (
    <div 
      className="card shadow-xs transition-all position-relative overflow-hidden"
      style={{
        borderRadius: '16px',
        backgroundColor: isOccupied ? '#FFF6F6' : '#F6FBF7',
        border: isOccupied ? '1.5px solid #FCDAD9' : '1.5px solid #D6EFE0',
        padding: '14px 16px',
        cursor: 'default'
      }}
    >
      {/* Top Status Pill (Right Aligned) */}
      <div className="d-flex justify-content-end mb-1">
        <span 
          className="badge rounded-pill fw-bold px-2.5 py-1 d-inline-flex align-items-center gap-1.5 shadow-2xs"
          style={{
            fontSize: '11px',
            backgroundColor: isOccupied ? '#FEE2E2' : '#DCFCE7',
            color: isOccupied ? '#DC2626' : '#16A34A',
            border: isOccupied ? '1px solid #FECACA' : '1px solid #BBF7D0'
          }}
        >
          <span 
            className="rounded-circle d-inline-block"
            style={{ 
              width: '6px', 
              height: '6px', 
              backgroundColor: isOccupied ? '#DC2626' : '#16A34A' 
            }}
          />
          <span>{currentStatus}</span>
        </span>
      </div>

      {/* Middle Row: Table Illustration on Left, Info on Right */}
      <div className="d-flex align-items-center gap-3 my-1">
        <TableIllustration isOccupied={isOccupied} />

        <div className="text-start flex-grow-1">
          <h4 className="fw-bold mb-1 text-dark" style={{ fontSize: '19px', letterSpacing: '-0.3px' }}>
            {displayTableNum.startsWith('T') ? displayTableNum : `T${String(displayTableNum).padStart(2, '0')}`}
          </h4>

          <div className="d-flex flex-column gap-0.5 text-secondary" style={{ fontSize: '11.5px' }}>
            <div className="d-flex align-items-center gap-1.5 fw-medium text-secondary">
              <FiMapPin size={12} className="text-muted flex-shrink-0" />
              <span>{locationLabel}</span>
            </div>
            <div className="d-flex align-items-center gap-1.5 fw-medium text-muted">
              <FiUsers size={12} className="text-muted flex-shrink-0" />
              <span>{capacityNumber} Seats</span>
            </div>
          </div>
        </div>
      </div>

      {/* Footer Action Buttons (3 Buttons: Edit, View Order, QR Code) */}
      <div className="d-flex align-items-center justify-content-between gap-1.5 pt-3 mt-2 border-top" style={{ borderColor: isOccupied ? '#FEE2E2' : '#E2F3E9' }}>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            if (onEdit) onEdit(table);
          }}
          className="btn btn-sm bg-white rounded-pill px-2.5 py-1.5 fw-semibold d-inline-flex align-items-center justify-content-center gap-1 flex-grow-1 shadow-2xs border text-secondary"
          style={{ fontSize: '11px', borderColor: '#CBD5E1' }}
          title="Edit Table"
        >
          <FiEdit2 size={12} className="text-muted" />
          <span>Edit</span>
        </button>

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
          className="btn btn-sm bg-white rounded-pill px-2.5 py-1.5 fw-semibold d-inline-flex align-items-center justify-content-center gap-1 flex-grow-1 shadow-2xs border text-secondary"
          style={{ fontSize: '11px', borderColor: '#CBD5E1' }}
          title={isOccupied ? "View active order" : "Take table order"}
        >
          <FiEye size={12} className="text-muted" />
          <span>View Order</span>
        </button>

        {onViewQR && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onViewQR(table);
            }}
            className="btn btn-sm bg-white rounded-pill px-2.5 py-1.5 fw-semibold d-inline-flex align-items-center justify-content-center gap-1 flex-grow-1 shadow-2xs border text-secondary"
            style={{ fontSize: '11px', borderColor: '#CBD5E1' }}
            title="View Table QR Code"
          >
            <i className="bi bi-qr-code text-muted" style={{ fontSize: '11px' }} />
            <span>QR Code</span>
          </button>
        )}
      </div>
    </div>
  );
};

export default TableCard;
