import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import CustomerLayout from '../../components/layout/CustomerLayout';
import { orderService, getCustomerPhone } from '../../services/orderService';
import { useAuth } from '../../hooks/useAuth';
import Loader from '../../components/common/Loader';
import EmptyState from '../../components/common/EmptyState';
import Badge from '../../components/common/Badge';
import formatCurrency from '../../utils/formatCurrency';
import { FiClock, FiChevronRight, FiFileText, FiEye } from 'react-icons/fi';
import Modal from '../../components/common/Modal';
import BackButton from '../../components/common/BackButton';
import { normalizeFoodType } from '../../utils/filters';
import { EBillModal } from '../../components/orders/EBillModal';

export const OrderHistory = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [viewingBillOrder, setViewingBillOrder] = useState(null);

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

  if (loading) {
    return (
      <CustomerLayout>
        <div className="min-vh-100 d-flex align-items-center justify-content-center">
          <Loader />
        </div>
      </CustomerLayout>
    );
  }

  const isStepActive = (orderStatus, targetStatus, isTakeaway = false) => {
    const statusOrder = isTakeaway
      ? ['Pending', 'Preparing', 'Ready', 'Completed']
      : ['Pending', 'Preparing', 'Ready', 'Serving', 'Completed'];
    const norm = (s) => {
      const lower = String(s || '').toLowerCase().trim();
      if (lower === 'placed' || lower === 'pending' || lower === 'confirmed' || lower === 'new' || lower === 'ordered' || lower === 'created') return 'Pending';
      if (lower === 'preparing' || lower === 'cooking' || lower === 'accepted' || lower === 'in_kitchen') return 'Preparing';
      if (lower === 'ready' || lower === 'out_for_delivery' || lower === 'prepared' || lower === 'ready_for_pickup') return 'Ready';
      if (lower === 'served' || lower === 'serving') return isTakeaway ? 'Completed' : 'Serving';
      if (lower === 'delivered' || lower === 'completed' || lower === 'done' || lower === 'settled') return 'Completed';
      return s;
    };
    const currentIdx = statusOrder.indexOf(norm(orderStatus));
    const targetIdx = statusOrder.indexOf(norm(targetStatus));
    return currentIdx !== -1 && targetIdx !== -1 && currentIdx >= targetIdx;
  };

  const getStatusStepClass = (orderStatus, targetStatus, isTakeaway = false) => {
    return isStepActive(orderStatus, targetStatus, isTakeaway) ? 'text-danger fw-bold' : 'text-muted';
  };

  const currentPhone = user?.phone || getCustomerPhone();

  return (
    <CustomerLayout>
      <main className="pt-2">
        <div className="d-flex align-items-center gap-3 mb-4">
          <BackButton />
          <div>
            <h4 className="fw-bold text-dark mb-0">My Orders</h4>
            <p className="text-muted small mb-0">Track and view all past orders</p>
          </div>
        </div>

        {orders.length === 0 ? (
          <EmptyState
            title="No Orders Found"
            description={currentPhone ? `No orders found for mobile number +91 ${currentPhone}. Head back to the menu to place an order!` : "You haven't placed any orders yet. Head back to the menu!"}
            icon="bi-clock-history"
          />
        ) : (
          <div className="row g-3">
            {orders.map((ord) => {
              const itemSummary = ord.items.map((i) => `${i.name} x${i.quantity}`).join(', ');
              return (
                <div key={ord.id} className="col-12 col-md-6 col-lg-4">
                  <div 
                    onClick={() => setSelectedOrder(ord)}
                    className="card h-100 rounded-3 border-0 shadow-sm p-3 bg-white cursor-pointer foodie-card"
                    style={{ cursor: 'pointer' }}
                  >
                    <div className="d-flex align-items-center justify-content-between mb-2">
                      <span className="fw-bold text-dark">Order #{ord.id || ord.order_id || ord.orderId}</span>
                      <Badge status={ord.status} />
                    </div>
                    
                    <div className="text-secondary small text-truncate mb-2" title={itemSummary}>
                      {ord.items.map((i, idx) => {
                        const ft = normalizeFoodType(i.foodType || i.type || (i.is_veg === false || i.is_veg === 'false' ? 'non-veg' : 'veg'));
                        return (
                          <React.Fragment key={idx}>
                            <span 
                              className={`d-inline-block me-1 align-text-bottom ${ft === 'veg' ? 'veg-badge' : ft === 'vegan' ? 'vegan-badge' : 'non-veg-badge'}`} 
                              style={{ transform: 'scale(0.7)' }}
                            ></span>
                            {i.name} x{i.quantity}
                            {idx < ord.items.length - 1 ? ', ' : ''}
                          </React.Fragment>
                        );
                      })}
                    </div>
                    
                    <div className="d-flex align-items-center justify-content-between pt-2 border-top border-light mt-auto small">
                      <span className="text-muted d-flex align-items-center gap-1">
                        <FiClock /> {ord.time}
                      </span>
                      <div className="d-flex align-items-center gap-2">
                        <strong className="text-danger">{formatCurrency(ord.total)}</strong>
                          <div className="d-flex align-items-center gap-2">
                            <button
                              type="button"
                              onClick={(e) => { e.stopPropagation(); setViewingBillOrder(ord); }}
                              className="btn btn-xs btn-outline-dark rounded-pill px-2 py-0.5 d-flex align-items-center gap-1"
                              style={{ fontSize: '11px' }}
                              title="View Bill"
                            >
                              <FiEye size={11} />
                              <span>View Bill</span>
                            </button>
                          </div>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Modal showing progress tracking states */}
        {selectedOrder && (() => {
          const isTakeaway = Boolean(
            selectedOrder.orderType === 'Takeaway' ||
            selectedOrder.order_type === 'TAKEAWAY' ||
            String(selectedOrder.table || '').toLowerCase() === 'takeaway' ||
            selectedOrder.service_type === 'takeaway' ||
            selectedOrder.serviceType === 'takeaway'
          );

          return (
            <Modal 
              isOpen={!!selectedOrder} 
              title={`Track Order #${selectedOrder.id || selectedOrder.order_id || selectedOrder.orderId}`} 
              onClose={() => setSelectedOrder(null)}
            >
              <div className="p-2">
                <h6 className="fw-bold text-dark mb-3">Order Status Pipeline</h6>
                
                <div className="d-flex flex-column gap-4 border-start ps-3 position-relative ms-2">
                  <div className={`position-relative ${getStatusStepClass(selectedOrder.status, 'Pending', isTakeaway)}`}>
                    <span className={`position-absolute rounded-circle ${isStepActive(selectedOrder.status, 'Pending', isTakeaway) ? 'bg-danger' : 'bg-secondary'}`} style={{ width: '10px', height: '10px', left: '-22px', top: '6px' }}></span>
                    <div className="fw-bold">Order Placed</div>
                    <div className="small text-muted">We received your food ticket</div>
                  </div>
                  
                  <div className={`position-relative ${getStatusStepClass(selectedOrder.status, 'Preparing', isTakeaway)}`}>
                    <span className={`position-absolute rounded-circle ${isStepActive(selectedOrder.status, 'Preparing', isTakeaway) ? 'bg-danger' : 'bg-secondary'}`} style={{ width: '10px', height: '10px', left: '-22px', top: '6px' }}></span>
                    <div className="fw-bold">Cooking in Kitchen</div>
                    <div className="small text-muted">Our Chef is preparing your dish</div>
                  </div>

                  <div className={`position-relative ${getStatusStepClass(selectedOrder.status, 'Ready', isTakeaway)}`}>
                    <span className={`position-absolute rounded-circle ${isStepActive(selectedOrder.status, 'Ready', isTakeaway) ? 'bg-danger' : 'bg-secondary'}`} style={{ width: '10px', height: '10px', left: '-22px', top: '6px' }}></span>
                    <div className="fw-bold">{isTakeaway ? 'Ready for Pickup' : 'Ready for Delivery'}</div>
                    <div className="small text-muted">{isTakeaway ? 'Food packaged at pickup counter' : 'Food packaged at counter'}</div>
                  </div>

                  {!isTakeaway && (
                    <div className={`position-relative ${getStatusStepClass(selectedOrder.status, 'Serving', isTakeaway)}`}>
                      <span className={`position-absolute rounded-circle ${isStepActive(selectedOrder.status, 'Serving', isTakeaway) ? 'bg-danger' : 'bg-secondary'}`} style={{ width: '10px', height: '10px', left: '-22px', top: '6px' }}></span>
                      <div className="fw-bold">Food Served</div>
                      <div className="small text-muted">Delivered to Table {selectedOrder.table}</div>
                    </div>
                  )}

                  <div className={`position-relative ${getStatusStepClass(selectedOrder.status, 'Completed', isTakeaway)}`}>
                    <span className={`position-absolute rounded-circle ${isStepActive(selectedOrder.status, 'Completed', isTakeaway) ? 'bg-danger' : 'bg-secondary'}`} style={{ width: '10px', height: '10px', left: '-22px', top: '6px' }}></span>
                    <div className="fw-bold">{isTakeaway ? 'Order Completed' : 'Session Completed'}</div>
                    <div className="small text-muted">{isTakeaway ? 'Order fulfilled successfully' : 'Bill settled successfully'}</div>
                  </div>
                </div>

                {/* Items preview with customizations */}
                {selectedOrder.items && selectedOrder.items.length > 0 && (
                  <div className="mt-4 pt-3 border-top">
                    <h6 className="fw-bold text-dark mb-2" style={{ fontSize: '13px' }}>Order Items</h6>
                    <div className="d-flex flex-column gap-2">
                      {selectedOrder.items.map((it, idx) => {
                        const toppings = Array.isArray(it.extraIngredients || it.toppings || it.customizations)
                          ? (it.extraIngredients || it.toppings || it.customizations).map(t => typeof t === 'string' ? t : (t.name || t.topping_name || t.ingredient_name)).filter(Boolean)
                          : [];
                        const instructions = it.instructions || it.special_instructions || it.notes;
                        return (
                          <div key={idx} className="small bg-light p-2 rounded">
                            <div className="d-flex justify-content-between fw-semibold">
                              <span>{it.name} × {it.quantity}</span>
                              <span>{formatCurrency(Number(it.price || 0) * (it.quantity || 1))}</span>
                            </div>
                            {toppings.length > 0 && (
                              <div className="text-muted" style={{ fontSize: '11px' }}>
                                • Extra ingredients: {toppings.join(', ')}
                              </div>
                            )}
                            {instructions && (
                              <div className="text-muted fst-italic" style={{ fontSize: '11px' }}>
                                • Instructions: {instructions}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

              <div className="mt-4 pt-3 border-top d-flex justify-content-between align-items-center flex-wrap gap-2">
                <span className="text-secondary small">Total: <strong className="text-danger">{formatCurrency(selectedOrder.total)}</strong></span>
                <div className="d-flex align-items-center gap-2">
                  <div className="d-flex align-items-center gap-2">
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); setViewingBillOrder(selectedOrder); setSelectedOrder(null); }}
                        className="btn btn-sm btn-outline-dark fw-bold rounded-pill px-3 py-1.5 d-flex align-items-center gap-1"
                        style={{ fontSize: '12px' }}
                      >
                        <FiEye size={13} />
                        <span>View Bill</span>
                      </button>
                    </div>
                  <button
                    type="button"
                    onClick={() => {
                      const ord = selectedOrder;
                      setSelectedOrder(null);
                      navigate(`/customer/order-tracking/${ord.id}`, { state: { order: ord } });
                    }}
                    className="btn btn-sm btn-danger text-white fw-bold rounded-pill px-3 py-1.5 shadow-sm d-flex align-items-center gap-1"
                    style={{ backgroundColor: 'var(--primary-color)', borderColor: 'var(--primary-color)', fontSize: '12px' }}
                  >
                    <span>Track Full Order</span>
                    <FiChevronRight size={14} />
                  </button>
                </div>
              </div>
            </div>
          </Modal>
          );
        })()}
        
        {/* E-Bill Modal */}
        <EBillModal 
          isOpen={!!viewingBillOrder} 
          order={viewingBillOrder} 
          onClose={() => setViewingBillOrder(null)} 
        />
      </main>
    </CustomerLayout>
  );
};

export default OrderHistory;
