import React from 'react';
import { useNavigate } from 'react-router-dom';
import formatCurrency from '../../utils/formatCurrency';
import { FiUsers, FiTrendingUp, FiShoppingBag } from 'react-icons/fi';

export const BusinessData = ({ data }) => {
  const navigate = useNavigate();
  const stats = data || {
    customersCount: 0,
    ordersCount: 0,
    avgOrderValue: 0
  };

  return (
    <div 
      className="card border rounded-4 shadow-sm p-4 h-100"
      style={{ 
        backgroundColor: 'var(--surface-color)', 
        borderColor: 'var(--border-color)' 
      }}
    >
      <h5 className="fw-bold mb-4" style={{ color: 'var(--text-primary)' }}>Business Performance</h5>
      
      <div className="d-flex flex-column gap-3">
        <div 
          className="d-flex align-items-center justify-content-between p-3 border rounded-3"
          style={{ backgroundColor: 'var(--background-color)', borderColor: 'var(--border-subtle)' }}
        >
          <div className="d-flex align-items-center gap-3">
            <div className="rounded-3 p-2" style={{ backgroundColor: 'rgba(242, 13, 45, 0.1)', color: 'var(--primary-color)' }}>
              <FiUsers size={20} />
            </div>
            <div>
              <div className="small fw-semibold" style={{ color: 'var(--text-secondary)' }}>Customers Today</div>
              <h5 className="fw-bold mb-0" style={{ color: 'var(--text-primary)' }}>{stats.customersCount}</h5>
            </div>
          </div>
          <span className="badge rounded-pill px-2.5 py-1" style={{ backgroundColor: 'rgba(242, 13, 45, 0.1)', color: 'var(--primary-color)' }}>Today</span>
        </div>

        <div 
          className="d-flex align-items-center justify-content-between p-3 border rounded-3"
          style={{ backgroundColor: 'var(--background-color)', borderColor: 'var(--border-subtle)' }}
        >
          <div className="d-flex align-items-center gap-3">
            <div className="rounded-3 p-2" style={{ backgroundColor: 'rgba(22, 163, 74, 0.1)', color: '#16A34A' }}>
              <FiShoppingBag size={20} />
            </div>
            <div>
              <div className="small fw-semibold" style={{ color: 'var(--text-secondary)' }}>Total Orders Today</div>
              <h5 className="fw-bold mb-0" style={{ color: 'var(--text-primary)' }}>{stats.ordersCount}</h5>
            </div>
          </div>
          <span className="badge rounded-pill px-2.5 py-1" style={{ backgroundColor: 'rgba(22, 163, 74, 0.1)', color: '#16A34A' }}>Today</span>
        </div>

        <div 
          className="d-flex align-items-center justify-content-between p-3 border rounded-3"
          style={{ backgroundColor: 'var(--background-color)', borderColor: 'var(--border-subtle)' }}
        >
          <div className="d-flex align-items-center gap-3">
            <div className="rounded-3 p-2" style={{ backgroundColor: 'rgba(37, 99, 235, 0.1)', color: '#2563EB' }}>
              <FiTrendingUp size={20} />
            </div>
            <div>
              <div className="small fw-semibold" style={{ color: 'var(--text-secondary)' }}>Average Order Value</div>
              <h5 className="fw-bold mb-0" style={{ color: 'var(--text-primary)' }}>{formatCurrency(stats.avgOrderValue)}</h5>
            </div>
          </div>
          <span className="badge rounded-pill px-2.5 py-1" style={{ backgroundColor: 'rgba(37, 99, 235, 0.1)', color: '#2563EB' }}>Live</span>
        </div>
      </div>
    </div>
  );
};
export default BusinessData;
