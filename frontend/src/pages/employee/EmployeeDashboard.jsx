import React, { useState, useEffect, useContext } from 'react';
import { useNavigate } from 'react-router-dom';
import AdminLayout from '../../components/layout/AdminLayout';
import PageHeader from '../../components/layout/PageHeader';
import Button from '../../components/common/Button';
import EmptyState from '../../components/common/EmptyState';
import { OrderContext } from '../../context/OrderContext';
import { tableService } from '../../services/tableService';
import { FiLayers, FiShoppingBag, FiCheckCircle, FiClock } from 'react-icons/fi';
import formatCurrency from '../../utils/formatCurrency';
import EBillModal from '../../components/orders/EBillModal';
import { formatOrderDisplayNumber } from '../../utils/orderNumber';

export const EmployeeDashboard = () => {
  const navigate = useNavigate();
  const { orders, updateStatus, fetchOrders } = useContext(OrderContext);
  const [updatingId, setUpdatingId] = useState(null);
  const [updatingAction, setUpdatingAction] = useState(null);
  const [actionError, setActionError] = useState('');
  const [eBillOrder, setEBillOrder] = useState(null);

  const [tables, setTables] = useState([]);
  const [tablesLoading, setTablesLoading] = useState(true);
  const [filterDate, setFilterDate] = useState('');

  const fetchTablesSilently = async () => {
    try {
      const tablesData = await tableService.getTables().catch(() => []);
      setTables(Array.isArray(tablesData) ? tablesData : []);
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    fetchOrders(false);
    fetchTablesSilently();

    const handleTables = () => { fetchTablesSilently(); };
    const handleStorage = (e) => {
      if (e.key === 'foodie_orders_sync_trigger' || e.key === 'foodie_data_sync') {
        fetchTablesSilently();
      }
    };

    window.addEventListener('foodie_tables_updated', handleTables);
    window.addEventListener('foodie_orders_updated', handleTables);
    window.addEventListener('storage', handleStorage);

    return () => {
      window.removeEventListener('foodie_tables_updated', handleTables);
      window.removeEventListener('foodie_orders_updated', handleTables);
      window.removeEventListener('storage', handleStorage);
    };
  }, []);

  const handleOrderAction = async (id, nextStatus, reason) => {
    if (updatingId != null && String(updatingId) === String(id)) return;
    setUpdatingId(id);
    setUpdatingAction(nextStatus);
    setActionError('');
    try {
      await updateStatus(id, nextStatus, reason);
    } catch (e) {
      setActionError(e.message || 'The status could not be updated.');
    } finally {
      setUpdatingId(null);
      setUpdatingAction(null);
    }
  };

  const handleCounterPay = async (ord) => {
    if (String(ord.payment_status || '').toUpperCase() === 'PAID') return;
    if (updatingId != null && String(updatingId) === String(ord.id)) return;
    setUpdatingId(ord.id);
    setUpdatingAction('paid');
    setActionError('');
    try {
      const { recordCounterPayment } = await import('../../services/adminApi');
      await recordCounterPayment(ord.id);
      if (typeof fetchOrders === 'function') await fetchOrders(false);
    } catch (e) {
      setActionError(e.message || 'Counter payment was not recorded.');
    } finally {
      setUpdatingId(null);
      setUpdatingAction(null);
    }
  };

  const isRejecting = (orderId) => String(updatingId) === String(orderId) && updatingAction === 'Cancelled';
  const isUpdatingStatus = (orderId, status) => String(updatingId) === String(orderId) && updatingAction === status;


  const isCompleted = (status) => {
    const s = String(status || '').toLowerCase().trim();
    return s === 'completed' || s === 'delivered' || s === 'done' || s === 'settled';
  };

  const isCancelled = (status) => {
    const s = String(status || '').toLowerCase().trim();
    return s === 'cancelled' || s === 'rejected';
  };

  const dateFilteredOrders = orders.filter(o => {
    if (!filterDate) return true;
    const orderTime = o.placedAt || o.rawCreatedAt || o.created_at || o.createdAt || o.date || o.time;
    if (!orderTime) return true;

    try {
      const d = new Date(orderTime);
      if (!isNaN(d.getTime())) {
        const localDateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        return localDateStr === filterDate;
      }
      
      const strTime = String(orderTime);
      const parts = filterDate.split('-');
      if (parts.length === 3) {
        const [y, m, d] = parts;
        return strTime.includes(filterDate) || strTime.includes(`${d}/${m}/${y}`) || strTime.includes(`${d}-${m}-${y}`);
      }
    } catch(e) {}
    
    return String(orderTime).includes(filterDate) || String(o.date).includes(filterDate);
  });

  const activeOrders = dateFilteredOrders.filter(o => !isCompleted(o.status) && !isCancelled(o.status));
  const completedOrders = dateFilteredOrders.filter(o => isCompleted(o.status));

  const getNextStatusAction = (currentStatus) => {
    const s = String(currentStatus || '').toLowerCase().trim();
    if (s === 'pending' || s === 'confirmed' || s === 'placed' || !s) {
      return { label: 'Accept to Kitchen', nextStatus: 'Preparing', variant: 'primary' };
    }
    if (s === 'preparing' || s === 'cooking' || s === 'accepted') {
      return { label: 'Mark Ready', nextStatus: 'Ready', variant: 'warning' };
    }
    if (s === 'ready' || s === 'out_for_delivery') {
      return { label: 'Mark Served', nextStatus: 'Served', variant: 'success' };
    }
    if (s === 'serving' || s === 'served') {
      return { label: 'Complete Order', nextStatus: 'Completed', variant: 'success' };
    }
    return null;
  };

  const getStatusBadgeClass = (status) => {
    const s = String(status || '').toLowerCase().trim();
    if (s === 'pending' || s === 'confirmed' || s === 'placed') return 'bg-danger-subtle text-danger border border-danger-subtle';
    if (s === 'preparing' || s === 'cooking' || s === 'accepted') return 'bg-warning-subtle text-warning-emphasis border border-warning-subtle';
    if (s === 'ready' || s === 'out_for_delivery') return 'bg-info-subtle text-info-emphasis border border-info-subtle';
    if (s === 'serving' || s === 'served') return 'bg-primary-subtle text-primary border border-primary-subtle';
    if (s === 'completed' || s === 'delivered' || s === 'done') return 'bg-success-subtle text-success border border-success-subtle';
    return 'bg-secondary-subtle text-secondary border border-secondary-subtle';
  };

  return (
    <AdminLayout>
      <PageHeader 
        title="Employee Dashboard" 
        actions={
          <div className="d-flex align-items-center gap-2">
            <button
              onClick={() => navigate('/employee/pos')}
              className="btn btn-sm btn-danger text-white rounded-pill px-3 py-1.5 fw-bold d-flex align-items-center gap-1.5 shadow-sm"
              style={{ backgroundColor: 'var(--primary-color, #dc3545)', borderColor: 'var(--primary-color, #dc3545)' }}
            >
              <span>+ Take Order (POS)</span>
            </button>
            <span className="small text-secondary fw-semibold ms-2">Filter Date:</span>
            <div className="position-relative d-inline-block" style={{ width: '160px' }}>
              <input
                type="date"
                className="form-control form-control-sm rounded-pill px-3 py-1.5 border-light-subtle shadow-xs position-absolute w-100 h-100"
                style={{ left: 0, top: 0, cursor: 'pointer', zIndex: 2, opacity: 0 }}
                value={filterDate}
                max={new Date().toISOString().slice(0, 10)}
                onChange={(e) => setFilterDate(e.target.value)}
              />
              <div className="form-control form-control-sm rounded-pill px-3 py-1.5 border-light-subtle shadow-xs d-flex justify-content-between align-items-center bg-white" style={{ zIndex: 1 }}>
                <span className={filterDate ? 'text-dark' : 'text-muted'}>
                  {filterDate ? filterDate.split('-').reverse().join('/') : 'dd/mm/yyyy'}
                </span>
                <i className="bi bi-calendar3 text-secondary small"></i>
              </div>
            </div>
            {filterDate && (
              <button
                onClick={() => setFilterDate('')}
                className="btn btn-sm btn-outline-secondary rounded-pill px-2 py-1 small"
                title="Clear Date Filter"
              >
                Clear
              </button>
            )}
          </div>
        }
      />

      {/* Overview Stat Cards */}
      <div className="row g-3 mb-4 text-start">
        <div className="col-12 col-sm-6 col-md-3">
          <div className="card rounded-4 border-0 shadow-sm p-3 bg-white" onClick={() => navigate('/employee/tables')} style={{ cursor: 'pointer' }}>
            <div className="d-flex align-items-center justify-content-between">
              <div>
                <span className="small text-secondary fw-bold text-uppercase">Total Tables</span>
                <h3 className="fw-bold text-dark mb-0">{tables.length}</h3>
              </div>
              <div className="bg-primary-subtle text-primary p-3 rounded-circle">
                <FiLayers size={22} />
              </div>
            </div>
          </div>
        </div>

        <div className="col-12 col-sm-6 col-md-3">
          <div className="card rounded-4 border-0 shadow-sm p-3 bg-white" onClick={() => navigate('/employee/orders?status=Preparing')} style={{ cursor: 'pointer' }}>
            <div className="d-flex align-items-center justify-content-between">
              <div>
                <span className="small text-secondary fw-bold text-uppercase">Active Orders</span>
                <h3 className="fw-bold text-danger mb-0">{activeOrders.length}</h3>
              </div>
              <div className="bg-danger-subtle text-danger p-3 rounded-circle">
                <FiClock size={22} />
              </div>
            </div>
          </div>
        </div>

        <div className="col-12 col-sm-6 col-md-3">
          <div className="card rounded-4 border-0 shadow-sm p-3 bg-white" onClick={() => navigate('/employee/orders?status=Completed')} style={{ cursor: 'pointer' }}>
            <div className="d-flex align-items-center justify-content-between">
              <div>
                <span className="small text-secondary fw-bold text-uppercase">Completed Today</span>
                <h3 className="fw-bold text-success mb-0">{completedOrders.length}</h3>
              </div>
              <div className="bg-success-subtle text-success p-3 rounded-circle">
                <FiCheckCircle size={22} />
              </div>
            </div>
          </div>
        </div>

        <div className="col-12 col-sm-6 col-md-3">
          <div className="card rounded-4 border-0 shadow-sm p-3 bg-white" onClick={() => navigate('/employee/kitchen')} style={{ cursor: 'pointer' }}>
            <div className="d-flex align-items-center justify-content-between">
              <div>
                <span className="small text-secondary fw-bold text-uppercase">Kitchen Queue</span>
                <h3 className="fw-bold text-warning mb-0">{dateFilteredOrders.filter(o => {
                  const s = String(o.status || '').toLowerCase().trim();
                  return s === 'pending' || s === 'placed' || s === 'preparing' || s === 'cooking' || s === 'accepted' || s === 'ready';
                }).length}</h3>
              </div>
              <div className="bg-warning-subtle text-warning p-3 rounded-circle">
                <FiShoppingBag size={22} />
              </div>
            </div>
          </div>
        </div>
      </div>

{/* Informational banner removed as per requirements */}
      {actionError && (
        <div className="alert alert-danger rounded-4 small text-start" role="alert">{actionError}</div>
      )}

      {/* Main Grid: Active Orders & Completed Orders */}
      <div className="row g-4 text-start">
        {/* Active Orders Section */}
        <div className="col-12 col-lg-6">
          <div className="card rounded-4 border-0 shadow-sm p-4 bg-white h-100">
            <div className="d-flex align-items-center justify-content-between mb-3 border-bottom pb-3">
              <div className="d-flex align-items-center gap-2">
                <h5 className="fw-bold text-dark mb-0">Active Orders</h5>
                <span className="badge bg-danger rounded-pill px-2.5 py-1 fw-bold" style={{ fontSize: '11px' }}>
                  {activeOrders.length}
                </span>
              </div>
              <button 
                onClick={() => navigate('/employee/orders')}
                className="btn btn-sm btn-link text-danger text-decoration-none fw-bold p-0 small"
                style={{ fontSize: '12px' }}
              >
                View All Orders &rarr;
              </button>
            </div>

            {activeOrders.length === 0 ? (
              <EmptyState
                title="No Active Orders"
                description="All orders have been served or there are no active customer requests."
                icon="bi-check2-circle"
              />
            ) : (
              <div className="d-flex flex-column gap-3">
                {activeOrders.map((ord) => {
                  const action = getNextStatusAction(ord.status);
                  return (
                    <div key={ord.id} className="p-3.5 rounded-3 bg-light border border-light-subtle shadow-xs">
                      <div className="d-flex align-items-start justify-content-between flex-wrap gap-2 mb-2">
                        <div>
                          <div className="d-flex align-items-center gap-2 mb-1">
                            <span className="fw-bold text-dark font-monospace fs-6">#{formatOrderDisplayNumber(ord, ord.orderNumber || ord.id)}</span>
                            <span className="badge bg-danger text-white fw-bold rounded-pill px-2.5 py-0.5" style={{ fontSize: '10.5px' }}>
                              Table {ord.table || 'Takeaway'}
                            </span>
                            <span className={`badge rounded-pill px-2.5 py-0.5 fw-bold text-uppercase ${getStatusBadgeClass(ord.status)}`} style={{ fontSize: '10px' }}>
                              {ord.status || 'Pending'}
                            </span>
                          </div>
                          <span className="text-muted small" style={{ fontSize: '11.5px' }}>
                            Placed at: <strong className="text-dark">{ord.time || 'Today'}</strong>
                          </span>
                        </div>
                        <span className="fw-extrabold text-danger fs-5">
                          {formatCurrency(ord.total || 0)}
                        </span>
                      </div>

                      {/* Items Summary */}
                      <div className="py-2 border-top border-bottom border-light-subtle mb-3 small text-secondary">
                        {Array.isArray(ord.items) && ord.items.length > 0 ? (
                          <div className="d-flex flex-wrap gap-2">
                            {ord.items.map((i, idx) => (
                              <span key={idx} className="badge bg-white text-dark border px-2 py-1 rounded">
                                {i.name} <strong className="text-danger">x{i.quantity || 1}</strong>
                              </span>
                            ))}
                          </div>
                        ) : (
                          <span className="text-muted fst-italic">Standard menu order items</span>
                        )}
                      </div>

                      {/* Actions */}
                      <div className="d-flex align-items-center justify-content-between flex-wrap gap-2">
                        <span className="text-muted small" style={{ fontSize: '11px' }}>
                          Payment: <strong className="text-dark">{ord.payment_status || 'UNPAID'}</strong>
                        </span>
                        <div className="d-flex align-items-center gap-2 ms-auto">
                          {(!ord.status || String(ord.status).toLowerCase() === 'pending' || String(ord.status).toLowerCase() === 'placed' || String(ord.status).toLowerCase() === 'new') && (
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={isRejecting(ord.id)}
                              loading={isRejecting(ord.id)}
                              onClick={() => {
                                const reason = window.prompt('Enter a reason for cancelling this order.');
                                if (!reason || !reason.trim()) return;
                                if (window.confirm("Are you sure you want to reject this order?")) {
                                  handleOrderAction(ord.id, 'Cancelled', reason.trim());
                                }
                              }}
                              className="py-1 px-2.5 fw-bold rounded-pill"
                              style={{ fontSize: '11.5px' }}
                            >
                              Reject
                            </Button>
                          )}
                          {action && (
                            <Button
                              size="sm"
                              variant={action.variant}
                              disabled={isUpdatingStatus(ord.id, action.nextStatus)}
                              loading={isUpdatingStatus(ord.id, action.nextStatus)}
                              onClick={() => handleOrderAction(ord.id, action.nextStatus)}
                              className="py-1 px-3 fw-bold rounded-pill shadow-xs"
                              style={{ fontSize: '11.5px' }}
                            >
                              {action.label}
                            </Button>
                          )}
                          {String(ord.payment_status || '').toUpperCase() === 'PAID' ? (
                            <span className="badge bg-success rounded-pill px-2 py-1">Paid</span>
                          ) : (
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={isUpdatingStatus(ord.id, 'paid')}
                              loading={isUpdatingStatus(ord.id, 'paid')}
                              onClick={() => handleCounterPay(ord)}
                              className="py-1 px-2.5 fw-bold rounded-pill"
                              style={{ fontSize: '11.5px' }}
                            >
                              Mark as Paid
                            </Button>
                          )}
                          <Button
                            size="sm"
                            variant="outline-danger"
                            onClick={() => setEBillOrder(ord)}
                            className="py-1 px-2.5 fw-bold rounded-pill"
                            style={{ fontSize: '11.5px' }}
                          >
                            E-Bill
                          </Button>
                          <Button
                            size="sm"
                            variant="outline-secondary"
                            onClick={() => navigate('/employee/orders')}
                            className="py-1 px-2.5 fw-bold rounded-pill"
                            style={{ fontSize: '11.5px' }}
                          >
                            Details
                          </Button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Completed Orders Section */}
        <div className="col-12 col-lg-6">
          <div className="card rounded-4 border-0 shadow-sm p-4 bg-white h-100">
            <div className="d-flex align-items-center justify-content-between mb-3 border-bottom pb-3">
              <div className="d-flex align-items-center gap-2">
                <h5 className="fw-bold text-dark mb-0">Completed Orders</h5>
                <span className="badge bg-success rounded-pill px-2.5 py-1 fw-bold" style={{ fontSize: '11px' }}>
                  {completedOrders.length}
                </span>
              </div>
              <button 
                onClick={() => navigate('/employee/orders?status=Completed')}
                className="btn btn-sm btn-link text-success text-decoration-none fw-bold p-0 small"
                style={{ fontSize: '12px' }}
              >
                View History &rarr;
              </button>
            </div>

            {completedOrders.length === 0 ? (
              <EmptyState
                title="No Completed Orders Yet"
                description="Orders that are served and settled today will appear here."
                icon="bi-receipt"
              />
            ) : (
              <div className="d-flex flex-column gap-3">
                {completedOrders.slice(0, 10).map((ord) => (
                  <div key={ord.id} className="p-3 rounded-3 bg-light border border-light-subtle shadow-xs">
                    <div className="d-flex align-items-start justify-content-between flex-wrap gap-2">
                      <div>
                        <div className="d-flex align-items-center gap-2 mb-1">
                          <span className="fw-bold text-dark font-monospace">#{formatOrderDisplayNumber(ord, ord.orderNumber || ord.id)}</span>
                          <span className="badge bg-success-subtle text-success border border-success-subtle rounded-pill px-2.5 py-0.5 fw-bold" style={{ fontSize: '10.5px' }}>
                            Table {ord.table || 'Takeaway'}
                          </span>
                          <span className="badge bg-success text-white rounded-pill px-2 py-0.5 fw-semibold" style={{ fontSize: '10px' }}>
                            <i className="bi bi-check2-circle me-1"></i>Completed
                          </span>
                        </div>
                        <div className="small text-muted" style={{ fontSize: '11px' }}>
                          {ord.date} {ord.time} • Payment: <strong className="text-dark">{ord.payment_status || 'UNPAID'}</strong>
                        </div>
                      </div>
                      <div className="text-end">
                        <span className="fw-bold text-success fs-6 d-block mb-2">
                          {formatCurrency(ord.total || 0)}
                        </span>
                        <button 
                          onClick={() => setEBillOrder(ord)}
                          className="btn btn-outline-success btn-sm rounded-pill py-0.5 px-2.5 fw-bold"
                          style={{ fontSize: '10px' }}
                        >
                          E-Bill
                        </button>
                      </div>
                    </div>

                    {Array.isArray(ord.items) && ord.items.length > 0 && (
                      <div className="pt-2 mt-2 border-top border-light-subtle small text-secondary d-flex flex-wrap gap-1">
                        {ord.items.map((i, idx) => (
                          <span key={idx} className="badge bg-white text-dark border px-2 py-0.5 rounded" style={{ fontSize: '10.5px' }}>
                            {i.name} x{i.quantity || 1}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* E-Bill Modal */}
      {eBillOrder && (
        <EBillModal
          isOpen={!!eBillOrder}
          order={eBillOrder}
          onClose={() => setEBillOrder(null)}
          onProceedToBill={async (ord) => {
            const targetOrder = ord || eBillOrder;
            if (!targetOrder) return;
            const targetId = targetOrder.backendOrderId || targetOrder.id || targetOrder.order_id;
            if (!targetId) return;
            try {
              const { proceedToBill } = await import('../../services/adminApi');
              await proceedToBill(targetId);
              await fetchOrders(false);
              window.dispatchEvent(new CustomEvent('foodie_orders_updated', { detail: { orderId: targetId, status: 'Completed' } }));
              window.dispatchEvent(new CustomEvent('foodie_tables_updated', { detail: { orderId: targetId } }));
              setEBillOrder(prev => prev ? { ...prev, status: 'Completed', backendStatus: 'COMPLETED' } : null);
              window.alert(`Order #${targetOrder.orderNumber || targetOrder.display_order_number || targetId} marked as Completed.`);
            } catch (err) {
              console.error('Failed to complete order on Proceed to Bill:', err);
              const msg = err?.response?.data?.detail || err?.message || 'Could not complete order.';
              window.alert(msg);
              throw err;
            }
          }}
        />
      )}
    </AdminLayout>
  );
};

export default EmployeeDashboard;
