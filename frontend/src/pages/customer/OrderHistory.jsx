import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import CustomerLayout from '../../components/layout/CustomerLayout';
import { orderService, getCustomerPhone } from '../../services/orderService';
import { useAuth } from '../../hooks/useAuth';
import Loader from '../../components/common/Loader';
import EmptyState from '../../components/common/EmptyState';
import formatCurrency from '../../utils/formatCurrency';
import { FiClock, FiFileText, FiEye, FiArrowRight } from 'react-icons/fi';
import Modal from '../../components/common/Modal';
import BackButton from '../../components/common/BackButton';
import { normalizeFoodType } from '../../utils/filters';
import { EBillModal } from '../../components/orders/EBillModal';
import { formatOrderDisplayNumber } from '../../utils/orderNumber';

export const OrderHistory = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [viewingBillOrder, setViewingBillOrder] = useState(null);
  const [activeTab, setActiveTab] = useState('ALL');

  const fetchHistorySilently = async () => {
    try {
      const activeQuery = user?.phone || getCustomerPhone() || user?.id;
      const data = await orderService.getOrders(activeQuery, true, true);
      setOrders(data);
      if (selectedOrder) {
        const updated = data.find(o => String(o.id || o.order_id) === String(selectedOrder.id || selectedOrder.order_id));
        if (updated) setSelectedOrder(updated);
      }
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    const fetchHistory = async () => {
      setLoading(true);
      try {
        const activeQuery = user?.phone || getCustomerPhone() || user?.id;
        const data = await orderService.getOrders(activeQuery, true, true);
        setOrders(data);
      } catch (e) {
        console.error(e);
      }
      setLoading(false);
    };
    fetchHistory();
    const handleUpdate = () => fetchHistorySilently();
    window.addEventListener('foodie_orders_updated', handleUpdate);
    return () => {
      window.removeEventListener('foodie_orders_updated', handleUpdate);
    };
  }, [user]);

  const normalizeStatus = (status) => {
    const s = String(status || '').toLowerCase().trim();
    if (['completed', 'delivered', 'done', 'settled'].includes(s)) return 'Completed';
    if (['cancelled', 'canceled', 'rejected', 'void'].includes(s)) return 'Cancelled';
    if (['preparing', 'cooking', 'in_kitchen', 'ready', 'serving', 'served', 'placed', 'pending', 'new'].includes(s)) return 'Active';
    return 'Active';
  };

  const activeCount = useMemo(() => orders.filter(o => normalizeStatus(o.status) === 'Active').length, [orders]);
  const completedCount = useMemo(() => orders.filter(o => normalizeStatus(o.status) === 'Completed').length, [orders]);
  const cancelledCount = useMemo(() => orders.filter(o => normalizeStatus(o.status) === 'Cancelled').length, [orders]);

  const filteredOrders = useMemo(() => {
    if (activeTab === 'ACTIVE') return orders.filter(o => normalizeStatus(o.status) === 'Active');
    if (activeTab === 'COMPLETED') return orders.filter(o => normalizeStatus(o.status) === 'Completed');
    if (activeTab === 'CANCELLED') return orders.filter(o => normalizeStatus(o.status) === 'Cancelled');
    return orders;
  }, [orders, activeTab]);

  if (loading) {
    return (
      <CustomerLayout>
        <div className="min-vh-100 d-flex align-items-center justify-content-center">
          <Loader />
        </div>
      </CustomerLayout>
    );
  }

  const currentPhone = user?.phone || getCustomerPhone();

  return (
    <CustomerLayout>
      <main className="pt-3 pb-5 mx-auto" style={{ maxWidth: '840px' }}>
        <div className="d-flex align-items-center justify-content-between mb-4">
          <div>
            <h3 className="fw-bold text-dark mb-1">My Orders</h3>
            <p className="text-secondary small mb-0">Track and view all past orders</p>
          </div>
          <BackButton to="/customer/home" />
        </div>

        {/* Filter Tabs matching Screenshot 11 */}
        <div className="d-flex align-items-center gap-2 mb-4 overflow-auto pb-1">
          {[
            { id: 'ALL', label: 'All Orders' },
            { id: 'ACTIVE', label: `Active (${activeCount})` },
            { id: 'COMPLETED', label: `Completed (${completedCount})` },
            { id: 'CANCELLED', label: `Cancelled (${cancelledCount})` },
          ].map(tab => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className="btn rounded-pill px-4 py-2 fw-semibold text-nowrap"
              style={{
                backgroundColor: activeTab === tab.id ? '#F20D2D' : '#FFFFFF',
                color: activeTab === tab.id ? '#FFFFFF' : '#64748B',
                border: activeTab === tab.id ? '1px solid #F20D2D' : '1px solid #E2E8F0',
                fontSize: '13px',
                transition: 'all 0.2s',
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {filteredOrders.length === 0 ? (
          <EmptyState
            title="No Orders Found"
            description={currentPhone ? `No orders found for mobile number +91 ${currentPhone}. Head back to the menu to place an order!` : "You haven't placed any orders yet. Head back to the menu!"}
            icon="bi-clock-history"
          />
        ) : (
          <div className="d-flex flex-column gap-3">
            {filteredOrders.map((ord) => {
              const displayNo = formatOrderDisplayNumber(ord, ord.id || ord.order_id || ord.orderId);
              const normSt = normalizeStatus(ord.status);
              const isTakeaway = ord.orderType === 'Takeaway' || ord.order_type === 'TAKEAWAY' || String(ord.table || '').toLowerCase() === 'takeaway';
              const itemCount = (ord.items || []).length;
              const tableLabel = ord.table ? (typeof ord.table === 'object' ? ord.table?.label || ord.table?.table_number : ord.table) : '';

              return (
                <div 
                  key={ord.id} 
                  className="card rounded-4 border border-light-subtle shadow-sm p-4 bg-white"
                >
                  {/* Top Row: Order ID, Date, Status pill, Price */}
                  <div className="d-flex align-items-center justify-content-between flex-wrap gap-2 mb-2">
                    <div>
                      <span className="font-monospace fw-bold text-dark fs-6">#{displayNo}</span>
                      <div className="text-secondary small mt-0.5">
                        {ord.time || ord.created_at || 'Recent order'}
                      </div>
                    </div>

                    <div className="d-flex align-items-center gap-3">
                      <span className={`badge rounded-pill px-3 py-1.5 fw-bold ${
                        normSt === 'Completed' ? 'bg-success-subtle text-success' :
                        normSt === 'Cancelled' ? 'bg-danger-subtle text-danger' :
                        'bg-warning-subtle text-dark'
                      }`} style={{ fontSize: '12px' }}>
                        {normSt === 'Active' ? (ord.status || 'Preparing') : normSt}
                      </span>
                      <span className="fw-bold fs-5 text-dark">
                        {formatCurrency(ord.total || ord.total_amount || 0)}
                      </span>
                    </div>
                  </div>

                  {/* Middle Line: Dining Type, Table, Item count */}
                  <div className="text-secondary small mb-3">
                    <span>{isTakeaway ? 'Takeaway' : 'Dine-in'}</span>
                    {!isTakeaway && tableLabel && <span> • Table {tableLabel}</span>}
                    <span> • {itemCount} {itemCount === 1 ? 'item' : 'items'}</span>
                  </div>

                  {/* Bottom Row: 3 Action Pill Buttons */}
                  <div className="d-flex align-items-center gap-2 pt-3 border-top border-light flex-wrap">
                    <button
                      type="button"
                      onClick={() => setSelectedOrder(ord)}
                      className="btn btn-outline-danger rounded-pill px-3 py-1.5 fw-bold d-flex align-items-center gap-2"
                      style={{ borderColor: '#F20D2D', color: '#F20D2D', fontSize: '12px', backgroundColor: '#FFFFFF' }}
                    >
                      <FiEye size={13} />
                      <span>View Details</span>
                    </button>

                    {normSt !== 'Cancelled' ? (
                      <>
                        <button
                          type="button"
                          onClick={() => navigate(`/customer/order-tracking/${ord.id}`, { state: { order: ord } })}
                          className="btn btn-outline-danger rounded-pill px-3 py-1.5 fw-bold d-flex align-items-center gap-2"
                          style={{ borderColor: '#F20D2D', color: '#F20D2D', fontSize: '12px', backgroundColor: '#FFFFFF' }}
                        >
                          <span>Track Order</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => setViewingBillOrder(ord)}
                          className="btn btn-outline-danger rounded-pill px-3 py-1.5 fw-bold d-flex align-items-center gap-2"
                          style={{ borderColor: '#F20D2D', color: '#F20D2D', fontSize: '12px', backgroundColor: '#FFFFFF' }}
                        >
                          <FiFileText size={13} />
                          <span>View Invoice</span>
                        </button>
                      </>
                    ) : (
                      <button
                        type="button"
                        onClick={() => navigate('/customer/home')}
                        className="btn btn-outline-danger rounded-pill px-3 py-1.5 fw-bold d-flex align-items-center gap-2"
                        style={{ borderColor: '#F20D2D', color: '#F20D2D', fontSize: '12px', backgroundColor: '#FFFFFF' }}
                      >
                        <span>Order Again</span>
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Order Details Modal */}
        {selectedOrder && (
          <Modal 
            isOpen={!!selectedOrder} 
            title={`Order Details #${formatOrderDisplayNumber(selectedOrder, selectedOrder.id)}`} 
            onClose={() => setSelectedOrder(null)}
          >
            <div className="p-3">
              <div className="d-flex justify-content-between align-items-center mb-3">
                <span className="text-secondary small">Status</span>
                <span className="badge rounded-pill px-3 py-1 bg-success-subtle text-success fw-bold">
                  {selectedOrder.status || 'Active'}
                </span>
              </div>

              <div className="border-top border-bottom py-3 my-2">
                <h6 className="fw-bold text-dark mb-2">Order Items</h6>
                <div className="d-flex flex-column gap-2">
                  {(selectedOrder.items || []).map((it, idx) => (
                    <div key={idx} className="d-flex justify-content-between align-items-center text-dark small">
                      <span>{it.name} × {it.quantity}</span>
                      <span className="fw-semibold">{formatCurrency(Number(it.price || 0) * (it.quantity || 1))}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="d-flex justify-content-between align-items-center pt-2">
                <span className="fw-bold text-dark">Total Amount</span>
                <span className="fw-bold fs-5 text-danger">{formatCurrency(selectedOrder.total || 0)}</span>
              </div>

              <div className="d-flex gap-2 mt-4 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    const ord = selectedOrder;
                    setSelectedOrder(null);
                    setViewingBillOrder(ord);
                  }}
                  className="btn btn-danger rounded-pill w-100 py-2 fw-bold text-white"
                  style={{ backgroundColor: '#F20D2D', borderColor: '#F20D2D', fontSize: '13px' }}
                >
                  View Invoice
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const ord = selectedOrder;
                    setSelectedOrder(null);
                    navigate(`/customer/order-tracking/${ord.id}`, { state: { order: ord } });
                  }}
                  className="btn btn-danger rounded-pill w-100 py-2 fw-bold text-white"
                  style={{ backgroundColor: '#F20D2D', borderColor: '#F20D2D', fontSize: '13px' }}
                >
                  Track Order
                </button>
              </div>
            </div>
          </Modal>
        )}

        {/* E-Bill Modal */}
        <EBillModal 
          isOpen={!!viewingBillOrder} 
          order={viewingBillOrder} 
          onClose={() => setViewingBillOrder(null)} 
          onProceedToBill={(ord) => {
            const id = ord?.id || viewingBillOrder?.id;
            setViewingBillOrder(null);
            navigate(`/customer/order-confirmation?order=${id}&proceedToBill=1`);
          }}
        />
      </main>
    </CustomerLayout>
  );
};

export default OrderHistory;
