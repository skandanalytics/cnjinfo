import React from 'react';

export const Badge = ({
  status,
  className = '',
  withDot = true,
  ...props
}) => {
  const norm = String(status || '').trim();
  const lower = norm.toLowerCase();

  const getStyle = () => {
    // Green statuses
    if (['completed', 'available', 'active', 'in stock', 'paid'].includes(lower)) {
      return {
        bg: 'var(--success-light, #DCFCE7)',
        text: 'var(--success-color, #16A34A)',
        border: 'rgba(22, 163, 74, 0.25)',
        dot: 'var(--success-color, #16A34A)',
      };
    }
    // Red statuses
    if (['occupied', 'inactive', 'out of stock', 'unpaid', 'cancelled', 'rejected'].includes(lower)) {
      return {
        bg: 'var(--danger-light, #FEE2E2)',
        text: 'var(--danger-color, #EF4444)',
        border: 'rgba(239, 68, 68, 0.25)',
        dot: 'var(--danger-color, #EF4444)',
      };
    }
    // Amber / Warning statuses
    if (['preparing', 'low stock', 'reserved', 'new', 'pending'].includes(lower)) {
      return {
        bg: 'var(--warning-light, #FEF3C7)',
        text: 'var(--warning-color, #D97706)',
        border: 'rgba(245, 158, 11, 0.25)',
        dot: 'var(--warning-color, #D97706)',
      };
    }
    // Blue / Info statuses
    if (['ready', 'serving', 'served', 'takeaway'].includes(lower)) {
      return {
        bg: 'var(--info-light, #EFF6FF)',
        text: 'var(--info-color, #2563EB)',
        border: 'rgba(37, 99, 235, 0.25)',
        dot: 'var(--info-color, #2563EB)',
      };
    }
    // Purple statuses
    if (['refunded', 'dine-in', 'dine in'].includes(lower)) {
      if (lower.startsWith('dine')) {
        return {
          bg: 'var(--danger-light, #FEE2E2)',
          text: 'var(--primary-color, #F20D2D)',
          border: 'rgba(242, 13, 45, 0.2)',
          dot: 'var(--primary-color, #F20D2D)',
        };
      }
      return {
        bg: '#F3E8FF',
        text: '#9333EA',
        border: 'rgba(147, 51, 234, 0.25)',
        dot: '#9333EA',
      };
    }
    return {
      bg: 'var(--surface-muted, #F8FAFC)',
      text: 'var(--text-secondary, #64748B)',
      border: 'var(--border-color, #DCE6F2)',
      dot: 'var(--text-secondary, #64748B)',
    };
  };

  const style = getStyle();

  return (
    <span 
      className={`d-inline-flex align-items-center gap-1.5 rounded-pill px-2.5 py-1 fw-bold ${className}`}
      style={{
        backgroundColor: style.bg,
        color: style.text,
        border: `1px solid ${style.border}`,
        fontSize: '11.5px',
        lineHeight: 1,
        letterSpacing: '0.1px',
      }}
      {...props}
    >
      {withDot && (
        <span 
          className="rounded-circle flex-shrink-0"
          style={{ width: '6px', height: '6px', backgroundColor: style.dot }}
        />
      )}
      <span>{norm}</span>
    </span>
  );
};
export default Badge;
