import React from 'react';

export const StatCard = ({
  title,
  value,
  icon: Icon,
  color = 'primary', // primary, success, danger, warning, info
  pillText,
  pillVariant, // success, danger, warning, info
  subtext,
  onClick
}) => {
  const getTheme = () => {
    switch (color) {
      case 'success':
        return { 
          iconBg: 'rgba(34, 197, 94, 0.12)', 
          iconColor: '#16A34A',
          pillBg: '#DCFCE7',
          pillColor: '#15803D'
        };
      case 'danger':
        return { 
          iconBg: 'rgba(239, 68, 68, 0.12)', 
          iconColor: '#DC2626',
          pillBg: '#FEE2E2',
          pillColor: '#B91C1C'
        };
      case 'warning':
        return { 
          iconBg: 'rgba(245, 158, 11, 0.12)', 
          iconColor: '#D97706',
          pillBg: '#FEF3C7',
          pillColor: '#B45309'
        };
      case 'info':
        return { 
          iconBg: 'rgba(59, 130, 246, 0.12)', 
          iconColor: '#2563EB',
          pillBg: '#DBEAFE',
          pillColor: '#1D4ED8'
        };
      default:
        return { 
          iconBg: 'var(--primary-subtle)', 
          iconColor: 'var(--primary-color)',
          pillBg: 'var(--primary-light)',
          pillColor: 'var(--primary-dark)'
        };
    }
  };

  const theme = getTheme();
  const effectivePill = pillText || subtext;

  return (
    <div 
      className={`card border rounded-4 shadow-sm h-100 transition-all ${onClick ? 'cursor-pointer hover-lift' : ''}`}
      onClick={onClick}
      style={{ 
        cursor: onClick ? 'pointer' : 'default', 
        padding: '20px 22px',
        backgroundColor: 'var(--surface-color)',
        borderColor: 'var(--border-color)',
        transition: 'transform 0.2s ease, box-shadow 0.2s ease'
      }}
    >
      <div className="d-flex justify-content-between align-items-start">
        <div>
          <span className="text-secondary fw-semibold d-block" style={{ fontSize: '13px', color: 'var(--text-secondary, #64748B)' }}>
            {title}
          </span>
          <div className="fw-bold text-dark mt-1" style={{ fontSize: '26px', letterSpacing: '-0.5px' }}>
            {value}
          </div>
          {effectivePill && (
            <div 
              className="mt-2 d-inline-flex align-items-center gap-1 fw-semibold"
              style={{ 
                fontSize: '12px', 
                color: theme.pillColor || theme.iconColor 
              }}
            >
              {effectivePill}
            </div>
          )}
        </div>

        <div 
          className="rounded-circle d-flex align-items-center justify-content-center flex-shrink-0 shadow-xs"
          style={{ 
            width: '46px', 
            height: '46px', 
            backgroundColor: theme.iconBg, 
            color: theme.iconColor 
          }}
        >
          {Icon && <Icon size={22} />}
        </div>
      </div>
    </div>
  );
};
export default StatCard;
