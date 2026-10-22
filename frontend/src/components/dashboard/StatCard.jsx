import React from 'react';

export const StatCard = ({
  title,
  value,
  icon: Icon,
  color = 'primary', // primary, success, danger, warning, info
  subtext,
  onClick
}) => {
  const getColors = () => {
    switch (color) {
      case 'success':
        return { bg: 'rgba(34, 165, 89, 0.1)', text: 'var(--success-color)' };
      case 'danger':
        return { bg: 'rgba(239, 68, 68, 0.1)', text: 'var(--danger-color)' };
      case 'warning':
        return { bg: 'rgba(242, 178, 51, 0.1)', text: 'var(--warning-color)' };
      case 'info':
        return { bg: 'rgba(51, 102, 221, 0.1)', text: 'var(--info-color)' };
      default:
        return { bg: 'var(--primary-light)', text: 'var(--primary-color)' };
    }
  };

  const colors = getColors();

  return (
    <div 
      className={`card rounded-3 shadow-sm bg-white h-100 stat-card-hover ${onClick ? 'hover-lift' : ''}`}
      onClick={onClick}
      style={{ cursor: onClick ? 'pointer' : 'default', padding: '20px 22px' }}
    >
      <div className="d-flex align-items-center justify-content-between gap-3">
        <div style={{ minWidth: 0 }}>
          <div className="text-secondary fw-semibold d-block mb-1" style={{ fontSize: '11px', letterSpacing: '0.5px', textTransform: 'uppercase' }}>
            {title}
          </div>
          <h3 className="fw-bold text-dark mb-0" style={{ marginTop: '6px', lineHeight: 1.2 }}>{value}</h3>
          {/* Always reserve one line of space so cards with/without subtext stay equal height */}
          <p className="text-secondary mb-0" style={{ fontSize: '10px', marginTop: '4px', minHeight: '15px' }}>
            {subtext || ''}
          </p>
        </div>
        <div 
          className="rounded-circle d-flex align-items-center justify-content-center flex-shrink-0"
          style={{ width: '54px', height: '54px', minWidth: '54px', backgroundColor: colors.bg, color: colors.text }}
        >
          <Icon size={24} />
        </div>
      </div>
    </div>
  );
};
export default StatCard;
