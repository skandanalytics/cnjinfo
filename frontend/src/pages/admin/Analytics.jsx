import React from 'react';
import AdminLayout from '../../components/layout/AdminLayout';
import PageHeader from '../../components/layout/PageHeader';
import { FiTrendingUp, FiShoppingBag, FiActivity } from 'react-icons/fi';

export const Analytics = () => {
  return (
    <AdminLayout>
      <PageHeader title="Store Analytics" showBackButton />

      <div className="row g-4 mb-4">
        <div className="col-12 col-md-4">
          <div 
            className="card rounded-4 border shadow-sm p-4 text-center"
            style={{ backgroundColor: 'var(--surface-color)', borderColor: 'var(--border-color)' }}
          >
            <FiActivity size={36} className="mb-3 mx-auto" style={{ color: 'var(--primary-color)' }} />
            <h5 className="fw-bold" style={{ color: 'var(--text-primary)' }}>System Health</h5>
            <p className="text-secondary small mb-0">API Connection: <strong className="text-success">Online</strong></p>
            <p className="text-secondary small">Database Latency: <strong className="text-success">14ms</strong></p>
          </div>
        </div>
        <div className="col-12 col-md-4">
          <div 
            className="card rounded-4 border shadow-sm p-4 text-center"
            style={{ backgroundColor: 'var(--surface-color)', borderColor: 'var(--border-color)' }}
          >
            <FiShoppingBag size={36} className="mb-3 mx-auto" style={{ color: 'var(--primary-color)' }} />
            <h5 className="fw-bold" style={{ color: 'var(--text-primary)' }}>Order Stats</h5>
            <p className="text-secondary small mb-0">Conversion Rate: <strong style={{ color: 'var(--text-primary)' }}>88.4%</strong></p>
            <p className="text-secondary small">Cancel Rate: <strong className="text-danger">1.2%</strong></p>
          </div>
        </div>
        <div className="col-12 col-md-4">
          <div 
            className="card rounded-4 border shadow-sm p-4 text-center"
            style={{ backgroundColor: 'var(--surface-color)', borderColor: 'var(--border-color)' }}
          >
            <FiTrendingUp size={36} className="mb-3 mx-auto" style={{ color: 'var(--primary-color)' }} />
            <h5 className="fw-bold" style={{ color: 'var(--text-primary)' }}>Growth Metrics</h5>
            <p className="text-secondary small mb-0">New Diners: <strong className="text-success">+24%</strong></p>
            <p className="text-secondary small">Month-over-Month: <strong className="text-success">+15.8%</strong></p>
          </div>
        </div>
      </div>
    </AdminLayout>
  );
};
export default Analytics;
