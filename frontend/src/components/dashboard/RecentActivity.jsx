import React from 'react';
import { useNavigate } from 'react-router-dom';
import formatCurrency from '../../utils/formatCurrency';
import { FiClock } from 'react-icons/fi';

export const RecentActivity = ({ activities = [] }) => {
  const navigate = useNavigate();

  return (
    <div 
      className="card border rounded-4 shadow-sm p-4 h-100"
      style={{ 
        backgroundColor: 'var(--surface-color)', 
        borderColor: 'var(--border-color)' 
      }}
    >
      <div className="d-flex align-items-center justify-content-between mb-4">
        <h5 className="fw-bold mb-0" style={{ color: 'var(--text-primary)' }}>Recent Activities</h5>
        <button
          onClick={() => navigate('/admin/orders')}
          className="btn btn-sm btn-link text-decoration-none fw-semibold p-0"
          style={{ fontSize: '12px', color: 'var(--primary-color)' }}
        >
          View All
        </button>
      </div>
      
      {activities.length === 0 ? (
        <div className="text-center py-4 text-secondary">
          <FiClock size={36} className="text-muted mb-2 opacity-50" />
          <p className="small mb-1 fw-semibold text-dark">No Recent Activities</p>
          <p className="small text-muted mb-0" style={{ fontSize: '11.5px' }}>
            New customer orders and status updates will be logged here live.
          </p>
        </div>
      ) : (
        <div className="d-flex flex-column gap-3">
          {activities.map((act) => {
            const displayTitle = act.message || (act.orderId ? `Order #${act.orderId} (${act.table || 'T01'}) is being prepared` : `${act.type || 'Order'} Event`);

            return (
              <div 
                key={act.id} 
                onClick={() => navigate('/admin/orders')}
                className="d-flex align-items-start justify-content-between pb-3 border-bottom cursor-pointer"
                style={{ cursor: 'pointer', borderColor: 'var(--border-subtle)' }}
              >
                <div>
                  <div className="small fw-bold mb-1" style={{ color: 'var(--text-primary)' }}>{displayTitle}</div>
                  <span className="small" style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>{act.time}</span>
                </div>
                
                {act.amount !== undefined && act.amount !== null && (
                  <span className="fw-bold small" style={{ color: 'var(--primary-color)' }}>{formatCurrency(act.amount)}</span>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
export default RecentActivity;
