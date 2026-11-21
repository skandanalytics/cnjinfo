import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import CustomerLayout from '../../components/layout/CustomerLayout';
import { orderService, getCustomerPhone } from '../../services/orderService';
import { useAuth } from '../../hooks/useAuth';
import { useCart } from '../../hooks/useCart';
import Loader from '../../components/common/Loader';
import BackButton from '../../components/common/BackButton';
import formatCurrency from '../../utils/formatCurrency';
import { FiClock, FiCheck, FiXCircle, FiFileText } from 'react-icons/fi';
import { fetchCustomerOrder } from '../../services/customerCheckout';
import { mapOrder } from '../../services/adminApi';
import { normalizeFoodType } from '../../utils/filters';
import EBillModal from '../../components/orders/EBillModal';
import { formatOrderDisplayNumber } from '../../utils/orderNumber';

export const OrderTracking = () => {
  const { orderId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const { loadOrderIntoCart } = useCart();

  const initialOrder = location.state?.order || null;
  const [resolvedOrderId, setResolvedOrderId] = useState(orderId || initialOrder?.id || null);
  const [order, setOrder] = useState(initialOrder);
  const [loading, setLoading] = useState(!initialOrder);
  const [error, setError] = useState(null);
  const [showReceiptModal, setShowReceiptModal] = useState(false);

  // Employee track order redirect to Tables
  useEffect(() => {
    if (user && (user.role === 'employee' || user.role === 'admin')) {
      navigate('/admin/tables', { replace: true });
    }
  }, [user, navigate]);

  const normalizeStatus = (status, isTakeaway = false) => {
    if (!status) return 'Pending';
    const s = String(status).toLowerCase().trim();
    if (s === 'placed' || s === 'pending' || s === 'confirmed' || s === 'new' || s === 'ordered' || s === 'created' || s === 'processing') return 'Pending';
    if (s === 'preparing' || s === 'cooking' || s === 'accepted' || s === 'in_kitchen') return 'Preparing';
    if (s === 'ready' || s === 'out_for_delivery' || s === 'prepared' || s === 'ready_for_pickup') return 'Ready';
    if (s === 'served' || s === 'serving') return isTakeaway ? 'Completed' : 'Serving';
    if (s === 'delivered' || s === 'completed' || s === 'done' || s === 'settled') return 'Completed';
    if (s === 'cancelled' || s === 'canceled' || s === 'rejected' || s === 'void') return 'Cancelled';
    return status;
  };

  const STATUS_RANK = {
    Pending: 0,
    Preparing: 1,
    Ready: 2,
    Serving: 3,
    Completed: 4,
    Cancelled: 5,
  };

  const getOrderTotal = (ord) => {
    if (!ord) return 0;
    const direct = parseFloat(ord.total ?? ord.total_amount ?? ord.totalAmount ?? ord.amount ?? 0);
    if (!isNaN(direct) && direct > 0) return direct;

    const isTakeaway = ord.orderType === 'Takeaway' || ord.table === 'Takeaway' || String(ord.table).toLowerCase() === 'takeaway' || ord.packingCharge > 0 || ord.packing_charge > 0;
    const totalQty = (ord.items || []).reduce((s, i) => s + (parseInt(i.quantity) || 1), 0) || 1;
    const packingCharge = parseFloat(ord.packingCharge || ord.packing_charge || (isTakeaway ? totalQty * 10 : 0));

    if (Array.isArray(ord.items) && ord.items.length > 0) {
      const itemsSum = ord.items.reduce((s, i) => s + (parseFloat(i.price || 0) * (parseInt(i.quantity) || 1)), 0);
      if (itemsSum > 0) {
        const discount = parseFloat(ord.discount || 0);
        const taxableAmount = Math.max(0, itemsSum - discount) + (isTakeaway ? packingCharge : 0);
        const tax = parseFloat(ord.tax || 0) || Math.round(taxableAmount * 0.05);
        const deliveryFee = parseFloat(ord.deliveryFee || ord.delivery_fee || 0);
        return Math.max(0, taxableAmount + tax + deliveryFee);
      }
    }

    try {
      const saved = JSON.parse(localStorage.getItem(`foodie_saved_order_${ord.id}`) || 'null');
      if (saved && parseFloat(saved.total) > 0) return parseFloat(saved.total);
    } catch (e) {}

    try {
      const last = JSON.parse(localStorage.getItem('foodie_last_placed_order') || 'null');
      if (last && String(last.id) === String(ord.id) && parseFloat(last.total) > 0) return parseFloat(last.total);
    } catch (e) {}

    return 0;
  };

  const statusRef = React.useRef(order?.status);

  useEffect(() => {
    statusRef.current = order?.status;
  }, [order?.status]);

  // When no explicit orderId param is given, find and track ONLY the single latest active order
  useEffect(() => {
    if (orderId && orderId !== 'undefined' && orderId !== 'null') {
      setResolvedOrderId(orderId);
      return;
    }
    let isMounted = true;
    const findLatestActiveOrder = async () => {
      setLoading(true);
      try {
        const query = user?.phone || getCustomerPhone() || user?.id;
        const allOrders = await orderService.getOrders(query, true, true);
        if (isMounted) {
          const list = Array.isArray(allOrders) ? allOrders : [];
          const activeList = list.filter(o => {
            const st = normalizeStatus(o.status);
            return st === 'Pending' || st === 'Preparing' || st === 'Ready' || st === 'Serving';
          });
          if (activeList.length > 0) {
            activeList.sort((a, b) => Number(b.id || 0) - Number(a.id || 0));
            const latest = activeList[0];
            setResolvedOrderId(latest.id);
            setOrder(latest);
          } else if (list.length > 0) {
            list.sort((a, b) => Number(b.id || 0) - Number(a.id || 0));
            setResolvedOrderId(list[0].id);
            setOrder(list[0]);
          } else {
            setOrder(null);
          }
        }
      } catch (e) {
        console.error('Error finding latest order:', e);
      } finally {
        if (isMounted) setLoading(false);
      }
    };
    findLatestActiveOrder();
    return () => { isMounted = false; };
  }, [orderId, user]);

  // Real-time polling, event sync, and authoritative backend retrieval
  useEffect(() => {
    if (!resolvedOrderId || resolvedOrderId === 'undefined' || resolvedOrderId === 'null') return;

    const fetchTrackingData = async (isInitial = false) => {
      if (isInitial && !order) setLoading(true);
      setError(null);

      try {
        const raw = await fetchCustomerOrder(resolvedOrderId);
        const currentData = raw?.id ? { ...mapOrder(raw), status: raw.status } : null;
        if (currentData) {
          const isTakeaway = currentData.orderType === 'Takeaway' ||
            currentData.order_type === 'TAKEAWAY' ||
            currentData.table === 'Takeaway' ||
            String(currentData.table || '').toLowerCase() === 'takeaway';

          const rawStatus = currentData.status;
          const normalizedNew = normalizeStatus(rawStatus, isTakeaway);
          const normalizedCurrent = normalizeStatus(statusRef.current, isTakeaway);

          // Guard against stale events overwriting newer status (Requirement 11)
          const newRank = STATUS_RANK[normalizedNew] ?? 0;
          const currRank = STATUS_RANK[normalizedCurrent] ?? 0;
          const effectiveStatus = (newRank >= currRank || normalizedNew === 'Cancelled' || !statusRef.current)
            ? rawStatus
            : statusRef.current;

          statusRef.current = effectiveStatus;
          const effectiveTotal = (currentData.total && Number(currentData.total) > 0)
            ? currentData.total
            : ((order && order.total && Number(order.total) > 0) ? order.total : getOrderTotal(currentData));
          const effectiveItems = (currentData.items && currentData.items.length > 0)
            ? currentData.items
            : (order?.items || []);

          setOrder(prev => ({
            ...(prev || {}),
            ...currentData,
            status: effectiveStatus,
            total: effectiveTotal,
            items: effectiveItems
          }));
        }
      } catch (err) {
        if (!order) {
          setError(err.message || 'Unable to load order tracking. Please try again.');
        }
      }
      if (isInitial) setLoading(false);
    };

    fetchTrackingData(!order);

    const interval = setInterval(() => {
      fetchTrackingData(false);
    }, 3000);

    const handleSync = () => {
      fetchTrackingData(false);
    };

    window.addEventListener('foodie_orders_updated', handleSync);
    window.addEventListener('focus', handleSync);
    window.addEventListener('online', handleSync);
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') fetchTrackingData(false);
    };
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      clearInterval(interval);
      window.removeEventListener('foodie_orders_updated', handleSync);
      window.removeEventListener('focus', handleSync);
      window.removeEventListener('online', handleSync);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [resolvedOrderId]);

  if (loading && !order) {
    return (
      <CustomerLayout>
        <div className="min-vh-50 d-flex flex-column align-items-center justify-content-center py-5">
          <Loader />
          <p className="text-secondary small mt-3">Loading order tracking details...</p>
        </div>
      </CustomerLayout>
    );
  }

  if (!order) {
    return (
      <CustomerLayout>
        <div className="text-center py-5 mx-auto" style={{ maxWidth: '480px' }}>
          <div 
            className="rounded-circle d-inline-flex align-items-center justify-content-center mb-3"
            style={{ width: '64px', height: '64px', backgroundColor: '#F1F5F9', color: '#64748B' }}
          >
            <FiClock size={32} />
          </div>
          <h4 className="fw-bold text-dark mb-2">No Active Orders</h4>
          <p className="text-secondary small mb-4">
            {error || "You don't have any active orders currently in progress. Older orders are accessible via Order History."}
          </p>
          <div className="d-flex justify-content-center gap-3">
            <button
              type="button"
              onClick={() => navigate('/customer/orders')}
              className="btn btn-outline-danger px-4 rounded-pill fw-bold"
              style={{ borderColor: '#F20D2D', color: '#F20D2D' }}
            >
              View Order History
            </button>
            <button
              type="button"
              onClick={() => navigate('/customer/home')}
              className="btn btn-danger px-4 rounded-pill fw-bold"
              style={{ backgroundColor: '#F20D2D', borderColor: '#F20D2D' }}
            >
              Browse Menu
            </button>
          </div>
        </div>
      </CustomerLayout>
    );
  }

  const isTakeawayOrder = order.orderType === 'Takeaway' ||
    order.order_type === 'TAKEAWAY' ||
    order.table === 'Takeaway' ||
    String(order.table || '').toLowerCase() === 'takeaway';

  const isPaid = Boolean(
    order.is_paid ||
    order.isPaid ||
    String(order.payment_status || order.paymentStatus || '').toUpperCase() === 'PAID'
  );

  // Pipeline order stages mapping (Takeaway orders omit the Dine-in only Serving stage)
  const stages = isTakeawayOrder ? [
    { key: 'Pending', label: 'Order Confirmed', sub: 'We received your food ticket' },
    { key: 'Preparing', label: 'Preparing', sub: 'Our Chef is preparing your dish' },
    { key: 'Ready', label: 'Ready for Pickup', sub: 'Packed & ready for counter pickup' },
    { key: 'Completed', label: 'Completed', sub: isPaid ? 'Order fulfilled & bill settled' : 'Order fulfilled · payment pending' }
  ] : [
    { key: 'Pending', label: 'Order Confirmed', sub: 'We received your food ticket' },
    { key: 'Preparing', label: 'Preparing', sub: 'Our Chef is preparing your dish' },
    { key: 'Ready', label: 'Ready', sub: 'Food packaged at counter' },
    { key: 'Serving', label: 'Serving', sub: `Delivered to Table ${order.table || ''}` },
    { key: 'Completed', label: 'Completed', sub: isPaid ? 'Bill settled successfully' : 'Dishes completed · payment pending' }
  ];

  const resolveCurrentStatus = () => {
    return normalizeStatus(order.status, isTakeawayOrder);
  };

  const currentStatus = resolveCurrentStatus();
  const getStatusIndex = (status) => {
    const keys = stages.map(s => s.key);
    const idx = keys.indexOf(status);
    if (idx >= 0) return idx;
    if (isTakeawayOrder && (status === 'Serving' || status === 'Served')) {
      return keys.indexOf('Completed');
    }
    return 0;
  };

  const currentIndex = getStatusIndex(currentStatus);

  return (
    <CustomerLayout>
      <main className="pt-3 pb-5 mx-auto" style={{ maxWidth: '960px' }}>
        <div className="d-flex align-items-center justify-content-between gap-3 mb-4 flex-wrap">
          <div className="d-flex align-items-center gap-3">
            <BackButton to="/customer/home" />
            <div>
              <h3 className="fw-bold text-dark mb-1">Track Order</h3>
              <p className="text-secondary small mb-0">
                {Boolean(order.parent_order_id || order.parent_order || (order.continuation_index > 0)) ? 'Sub Order ' : 'Order '}
                <span className="font-monospace fw-bold text-dark">#{formatOrderDisplayNumber(order, resolvedOrderId || orderId)}</span>
                {(order.time || order.created_at) && ` · Placed on ${order.time || order.created_at}`}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => navigate('/customer/orders')}
            className="btn btn-outline-danger btn-sm rounded-pill px-3.5 py-1.5 fw-bold"
            style={{ borderColor: '#F20D2D', color: '#F20D2D', fontSize: '13px' }}
          >
            View Order History
          </button>
        </div>

        {/* Horizontal Status Timeline Card (Screenshot 10) */}
        <div className="card rounded-4 border border-light-subtle shadow-sm p-4 bg-white mb-4">
          <div className="d-flex align-items-center justify-content-between flex-wrap gap-2 mb-3 pb-2 border-bottom">
            <div className="d-flex align-items-center gap-2">
              <span className="fw-bold text-dark fs-6">
                Order #{formatOrderDisplayNumber(order, resolvedOrderId || orderId)}
              </span>
              <span className={`badge rounded-pill px-3 py-1 fw-bold ${
                currentStatus === 'Completed' ? 'bg-success text-white' :
                currentStatus === 'Cancelled' ? 'bg-danger text-white' :
                'bg-warning text-dark'
              }`}>
                Status: {currentStatus === 'Preparing' ? 'Cooking' : currentStatus}
              </span>
            </div>
            <div className="text-secondary small">
              <span className="fw-semibold text-dark">Estimated Time: </span>
              <span className="fw-bold text-danger">
                {currentStatus === 'Completed' ? 'Fulfilled' : currentStatus === 'Cancelled' ? 'Cancelled' : currentStatus === 'Ready' ? '~2 mins' : '~15 mins'}
              </span>
            </div>
          </div>
          <div className="position-relative py-3">
            {/* Background connecting line */}
            <div 
              className="position-absolute" 
              style={{ 
                top: '32px', 
                left: '10%', 
                right: '10%', 
                height: '3px', 
                backgroundColor: '#E2E8F0',
                zIndex: 0
              }} 
            />
            {/* Active connecting line */}
            <div 
              className="position-absolute" 
              style={{ 
                top: '32px', 
                left: '10%', 
                width: currentIndex === 0 ? '0%' : currentIndex === 1 ? '27%' : currentIndex === 2 ? '54%' : '80%', 
                height: '3px', 
                backgroundColor: '#F20D2D',
                transition: 'width 0.4s ease',
                zIndex: 0
              }} 
            />

            <div className="d-flex justify-content-between position-relative" style={{ zIndex: 1 }}>
              {[
                { key: 'Pending', label: 'Order Placed', time: order.time || '11:42 AM' },
                { key: 'Preparing', label: 'Cooking in Kitchen', time: 'In Kitchen' },
                { key: 'Ready', label: 'Ready for Serving', time: 'Prepared' },
                { key: 'Completed', label: 'Completed', time: 'Completed' },
              ].map((stage, idx) => {
                const isFinished = currentStatus === 'Completed' || (isTakeawayOrder && (order?.status === 'SERVED' || order?.status === 'Served'));
                const isDone = currentIndex > idx || (idx === currentIndex && isFinished);
                const isCurrent = currentIndex === idx && !isFinished;

                let circleBg = '#E2E8F0';
                let circleColor = '#94A3B8';
                let circleBorder = '3px solid #FFFFFF';

                if (isDone) {
                  circleBg = '#16A34A';
                  circleColor = '#FFFFFF';
                } else if (isCurrent) {
                  circleBg = '#F20D2D';
                  circleColor = '#FFFFFF';
                  circleBorder = '4px solid #FEE2E2';
                }

                return (
                  <div key={stage.key} className="text-center" style={{ width: '130px' }}>
                    <div 
                      className="rounded-circle mx-auto d-flex align-items-center justify-content-center shadow-xs"
                      style={{ 
                        width: '36px', 
                        height: '36px', 
                        backgroundColor: circleBg, 
                        color: circleColor,
                        border: circleBorder,
                        fontSize: '13px',
                        transition: 'all 0.3s'
                      }}
                    >
                      {isDone ? (
                        <FiCheck size={16} strokeWidth={3} />
                      ) : isCurrent ? (
                        <span className="spinner-grow spinner-grow-sm" role="status" style={{ width: '10px', height: '10px' }}></span>
                      ) : (
                        <span>{idx + 1}</span>
                      )}
                    </div>
                    <div className="mt-2.5">
                      <span className={`d-block small ${isCurrent ? 'fw-bold text-danger' : isDone ? 'fw-bold text-dark' : 'text-muted'}`} style={{ fontSize: '13px' }}>
                        {stage.label}
                      </span>
                      {stage.key === 'Pending' && order.time && (
                        <span className="text-secondary" style={{ fontSize: '11px' }}>{order.time}</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {order.status === 'Cancelled' && (
          <div className="alert alert-danger rounded-4 p-3 fw-bold small text-center mb-4 shadow-sm">
            This order has been cancelled.
          </div>
        )}

        {/* Two-Column Workspace: Order Items (Left) + Order Summary (Right) */}
        <div className="row g-4">
          {/* Left Column: Order Items */}
          <div className="col-12 col-lg-7">
            <div className="card rounded-4 border border-light-subtle shadow-sm p-4 bg-white h-100">
              <h5 className="fw-bold text-dark mb-3">Order Items</h5>
              <div className="d-flex flex-column gap-3">
                {Array.isArray(order.items) && order.items.length > 0 ? (
                  order.items.map((i, idx) => (
                    <div key={idx} className="d-flex align-items-center justify-content-between py-2 border-bottom border-light last-border-none">
                      <div className="d-flex align-items-center gap-3">
                        <div 
                          className="rounded-3 d-flex align-items-center justify-content-center bg-light flex-shrink-0"
                          style={{ width: '48px', height: '48px', overflow: 'hidden' }}
                        >
                          {i.image ? (
                            <img src={i.image} alt={i.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                          ) : (
                            <span className={`${normalizeFoodType(i.foodType || i.type || (i.is_veg === false || i.is_veg === 'false' ? 'non-veg' : 'veg')) === 'veg' ? 'veg-badge' : 'non-veg-badge'}`}></span>
                          )}
                        </div>
                        <div>
                          <div className="d-flex align-items-center gap-1.5">
                            <span className="fw-bold text-dark">{i.name || 'Dish Item'}</span>
                            <span className="text-secondary small fw-medium">× {i.quantity || 1}</span>
                          </div>
                          {(i.instructions || i.special_instructions) && (
                            <div className="text-muted small fst-italic">
                              Note: {i.instructions || i.special_instructions}
                            </div>
                          )}
                        </div>
                      </div>
                      <span className="fw-bold text-dark">{formatCurrency((i.price || 0) * (i.quantity || 1))}</span>
                    </div>
                  ))
                ) : (
                  <p className="text-muted small mb-0">Order received and confirmed.</p>
                )}
              </div>
            </div>
          </div>

          {/* Right Column: Order Summary */}
          <div className="col-12 col-lg-5">
            <div className="card rounded-4 border border-light-subtle shadow-sm p-4 bg-white">
              <h5 className="fw-bold text-dark mb-3">Order Summary</h5>
              
              <div className="d-flex flex-column gap-2 mb-3">
                <div className="d-flex justify-content-between text-secondary small">
                  <span>Items Total</span>
                  <span className="fw-semibold text-dark">
                    {formatCurrency(Number(order.items_total || order.subtotal || getOrderTotal(order)))}
                  </span>
                </div>

                {Number(order.discount || order.menu_discount || 0) > 0 && (
                  <div className="d-flex justify-content-between small text-success">
                    <span>Menu Discount</span>
                    <span className="fw-semibold">-{formatCurrency(Number(order.discount || order.menu_discount))}</span>
                  </div>
                )}

                {Number(order.coupon_discount || order.voucher_discount || 0) > 0 && (
                  <div className="d-flex justify-content-between small text-success">
                    <span>Coupon Discount</span>
                    <span className="fw-semibold">-{formatCurrency(Number(order.coupon_discount || order.voucher_discount))}</span>
                  </div>
                )}

                {Number(order.tax || 0) > 0 && (
                  <div className="d-flex justify-content-between text-secondary small">
                    <span>GST (5%)</span>
                    <span className="fw-semibold text-dark">{formatCurrency(Number(order.tax))}</span>
                  </div>
                )}

                <div className="d-flex justify-content-between align-items-center pt-3 border-top border-light mt-1">
                  <span className="fw-bold text-dark">Grand Total</span>
                  <span className="fw-bold fs-5" style={{ color: '#F20D2D' }}>
                    {formatCurrency(getOrderTotal(order))}
                  </span>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="d-flex flex-column pt-3" style={{ gap: '14px' }}>
                <button
                  type="button"
                  onClick={async () => {
                    try {
                      const { fetchCustomerBillPreview } = await import('../../services/customerCheckout');
                      const preview = await fetchCustomerBillPreview(order.id || orderId);
                      setOrder(prev => ({
                        ...prev,
                        ...preview,
                        items: preview.items || prev.items,
                        combined_items: preview.items,
                        total: preview.total_amount || prev.total,
                        total_amount: preview.total_amount || prev.total_amount,
                      }));
                    } catch (e) {
                      console.warn('Could not fetch bill preview', e);
                    }
                    setShowReceiptModal(true);
                  }}
                  className="btn btn-outline-danger w-100 py-2.5 fw-bold rounded-pill"
                  style={{ borderColor: '#F20D2D', color: '#F20D2D', fontSize: '13px', backgroundColor: '#FFFFFF' }}
                >
                  <FiFileText size={16} className="me-1.5" />
                  <span>View E-Bill</span>
                </button>

                {/* Unpaid Order Actions: Proceed to Bill and Order Again */}
                {!isPaid && (
                  <>
                    <button
                      type="button"
                      onClick={async () => {
                        const targetId = order.id || orderId;
                        navigate(`/customer/payment?order=${targetId}`);
                      }}
                      className="btn btn-danger w-100 py-2.5 fw-bold rounded-pill shadow-xs d-flex align-items-center justify-content-center gap-2 text-white"
                      style={{ backgroundColor: '#F20D2D', borderColor: '#F20D2D', fontSize: '13px' }}
                    >
                      <span>View Bill</span>
                    </button>

                    <button
                      type="button"
                      onClick={async () => {
                        const rootId = order.parent_order_id || (typeof order.parent_order === 'object' ? order.parent_order?.id : order.parent_order) || order.id || orderId;
                        sessionStorage.setItem('foodie_parent_order_id', String(rootId));
                        localStorage.setItem('foodie_parent_order_id', String(rootId));
                        let tid = order.table_id || (typeof order.table === 'object' ? order.table?.id : (Number(order.table) || null)) || order.tableId;
                        const tNum = order.table_number || order.tableNumber || (typeof order.table === 'object' ? order.table?.table_number || order.table?.label : order.table);

                        if (!tid && tNum) {
                          try {
                            const { resolvePublicBranchId, availableTables } = await import('../../services/customerCheckout');
                            const branchId = order.branch || order.branch_id || await resolvePublicBranchId();
                            if (branchId) {
                              const tables = await availableTables(branchId);
                              const cleanTarget = String(tNum).toUpperCase().trim();
                              const matched = tables.find(t =>
                                String(t.table_number).toUpperCase().trim() === cleanTarget ||
                                String(t.table_number).toUpperCase().trim() === cleanTarget.replace(/^TABLE\s*/i, '') ||
                                `T${String(t.table_number).replace(/\D/g, '').padStart(2, '0')}` === cleanTarget
                              );
                              if (matched) tid = matched.id;
                            }
                          } catch (e) {
                            console.warn('Could not resolve table id by number:', e);
                          }
                        }

                        if (tid) {
                          sessionStorage.setItem('foodie_selected_table', String(tid));
                          localStorage.setItem('foodie_selected_table', String(tid));
                        }
                        const ordType = (order.orderType || order.order_type || 'DINE_IN').toUpperCase();
                        sessionStorage.setItem('foodie_order_type', ordType);
                        localStorage.setItem('foodie_order_type', ordType);

                        const phone = order.customer_phone || order.customerPhone || order.phone;
                        if (phone) {
                          sessionStorage.setItem('customer_mobile', String(phone));
                          localStorage.setItem('customer_mobile', String(phone));
                        }
                        const name = order.customer_name || order.customerName;
                        if (name && typeof name === 'string') {
                          sessionStorage.setItem('customer_name', String(name));
                          localStorage.setItem('customer_name', String(name));
                        }

                        navigate('/customer/home');
                      }}
                      className="btn btn-outline-danger w-100 py-2.5 fw-bold rounded-pill d-flex align-items-center justify-content-center gap-2"
                      style={{ borderColor: '#F20D2D', color: '#F20D2D', fontSize: '13px', backgroundColor: '#FFFFFF' }}
                    >
                      <span>Order Again</span>
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      </main>

      <EBillModal
        isOpen={showReceiptModal}
        order={order}
        onClose={() => setShowReceiptModal(false)}
        onProceedToBill={async (ord) => {
          const targetId = ord?.id || order?.id || orderId;
          try {
            const { proceedOrderToBill } = await import('../../services/customerCheckout');
            await proceedOrderToBill(targetId);
          } catch (e) {
            console.warn('Could not proceed to bill in modal', e);
          }
          setShowReceiptModal(false);
          navigate(`/customer/order-confirmation?order=${targetId}&proceedToBill=1`);
        }}
      />
    </CustomerLayout>
  );
};

export default OrderTracking;
