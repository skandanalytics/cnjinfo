import React, { useContext, useState, useEffect, useRef } from 'react';
import AdminLayout from '../../components/layout/AdminLayout';
import PageHeader from '../../components/layout/PageHeader';
import { OrderContext } from '../../context/OrderContext';
import { AuthContext } from '../../context/AuthContext';
import { branchService } from '../../services/branchService';
import Loader from '../../components/common/Loader';
import EmptyState from '../../components/common/EmptyState';
import Button from '../../components/common/Button';
import EBillModal from '../../components/orders/EBillModal';

export const Kitchen = () => {
  const { orders, loading, updateStatus, fetchOrders } = useContext(OrderContext);
  const { user } = useContext(AuthContext);
  const [updatingId, setUpdatingId] = useState(null);
  const [updatingAction, setUpdatingAction] = useState(null);
  const [actionError, setActionError] = useState('');
  const [eBillOrder, setEBillOrder] = useState(null);
  const [branches, setBranches] = useState([]);
  const headerRef = useRef(null);
  const [gridHeight, setGridHeight] = useState(null);

  // Dynamic available height calculation for independent queue scrolling
  useEffect(() => {
    const calculateAvailableHeight = () => {
      if (window.innerWidth < 1200) {
        setGridHeight(null);
        return;
      }
      if (headerRef.current) {
        const headerRect = headerRef.current.getBoundingClientRect();
        const bottomPadding = 20;
        const available = window.innerHeight - headerRect.bottom - bottomPadding;
        if (available > 250) {
          setGridHeight(Math.floor(available));
        }
      }
    };

    calculateAvailableHeight();
    window.addEventListener('resize', calculateAvailableHeight);

    let ro = null;
    if (typeof ResizeObserver !== 'undefined' && headerRef.current) {
      ro = new ResizeObserver(() => calculateAvailableHeight());
      ro.observe(headerRef.current);
    }

    return () => {
      window.removeEventListener('resize', calculateAvailableHeight);
      if (ro) ro.disconnect();
    };
  }, [actionError, loading]);

  // Determine initial branch from user's assigned branch or fallback to main branch
  const userAssignedBranch = user?.branchId || user?.restaurant || user?.restaurant_id || null;
  const isBranchRestricted = Boolean(user?.role === 'employee' && userAssignedBranch);
  const [selectedBranch, setSelectedBranch] = useState(userAssignedBranch ? String(userAssignedBranch) : '');

  const isBranchUnderConstruction = (b) => {
    if (!b) return false;
    const status = String(b.status || b.construction_status || '').toLowerCase().trim();
    if (status.includes('construction') || status.includes('renovation')) return true;
    if (b.is_under_construction === true) return true;
    if (b.is_active === false) return true;
    return false;
  };

  useEffect(() => {
    fetchOrders(false);
    const handleSync = () => fetchOrders(false);
    window.addEventListener('foodie_orders_updated', handleSync);
    window.addEventListener('foodie_data_sync_refetch', handleSync);
    window.addEventListener('focus', handleSync);
    const handleVis = () => {
      if (document.visibilityState === 'visible') fetchOrders(false);
    };
    document.addEventListener('visibilitychange', handleVis);
    return () => {
      window.removeEventListener('foodie_orders_updated', handleSync);
      window.removeEventListener('foodie_data_sync_refetch', handleSync);
      window.removeEventListener('focus', handleSync);
      document.removeEventListener('visibilitychange', handleVis);
    };
  }, []);

  useEffect(() => {
    const loadBranches = async () => {
      try {
        const data = await branchService.getBranches();
        const branchList = Array.isArray(data) ? data : [];
        setBranches(branchList);
        if (user?.role === 'employee' && user?.branchId) {
          setSelectedBranch(String(user.branchId));
          return;
        }
        const activeMainBranch = branchList.find(b => b.isMainBranch && !isBranchUnderConstruction(b)) || branchList.find(b => !isBranchUnderConstruction(b)) || branchList[0];
        if (activeMainBranch) {
          setSelectedBranch(prev => {
            const currentObj = branchList.find(b => String(b.id) === String(prev));
            if (currentObj && !isBranchUnderConstruction(currentObj)) {
              return prev;
            }
            return String(activeMainBranch.id);
          });
        }
      } catch (e) {
        console.error("Error loading branches in Kitchen:", e);
      }
    };

    loadBranches();

    const handleBranchesUpdate = () => {
      loadBranches();
    };

    window.addEventListener('foodie_branches_updated', handleBranchesUpdate);
    return () => {
      window.removeEventListener('foodie_branches_updated', handleBranchesUpdate);
    };
  }, []);

  const handleAction = async (id, status) => {
    if (updatingId != null && String(updatingId) === String(id)) return;
    setUpdatingId(id);
    setUpdatingAction(status);
    setActionError('');
    try {
      await updateStatus(id, status);
    } catch (e) {
      setActionError(e.message || 'This status change is no longer valid. The queue was refreshed.');
    } finally {
      setUpdatingId(null);
      setUpdatingAction(null);
    }
  };

  const handleReject = async (id) => {
    if (updatingId != null && String(updatingId) === String(id)) return;
    const reason = window.prompt('Enter a reason for cancelling this order.');
    if (!reason || !reason.trim()) return;
    if (window.confirm("Are you sure you want to reject this order?")) {
      setUpdatingId(id);
      setUpdatingAction('reject');
      setActionError('');
      try {
        await updateStatus(id, 'Cancelled', reason.trim());
      } catch (e) {
        setActionError(e.message || 'The order could not be cancelled.');
      } finally {
        setUpdatingId(null);
        setUpdatingAction(null);
      }
    }
  };

  const isAccepting = (orderId) => String(updatingId) === String(orderId) && updatingAction === 'Preparing';
  const isRejecting = (orderId) => String(updatingId) === String(orderId) && updatingAction === 'reject';
  const isUpdatingStatus = (orderId, status) => String(updatingId) === String(orderId) && updatingAction === status;

  // Kitchen queue order (FIFO line-up per stage):
  // 1. New Tickets: in the line of when the order was taken/placed (first taken = top of line)
  const sortNewTickets = (list) => {
    return [...list].sort((a, b) => {
      const timeA = a.placedAt || a.statusTimes?.Pending || a.rawCreatedAt || (a.createdAt ? new Date(a.createdAt).getTime() : 0);
      const timeB = b.placedAt || b.statusTimes?.Pending || b.rawCreatedAt || (b.createdAt ? new Date(b.createdAt).getTime() : 0);
      if (timeA && timeB && timeA !== timeB) {
        return timeA - timeB; // Ascending: order taken earlier appears on top, newer below
      }
      return Number(a.id) - Number(b.id);
    });
  };

  // 2. Preparing: in the line of when accepted into kitchen (first accepted = top of line)
  const sortPreparingQueue = (list) => {
    return [...list].sort((a, b) => {
      const timeA = a.statusTimes?.Preparing || a.preparingAt || a.statusUpdatedAt || a.placedAt || a.rawCreatedAt || 0;
      const timeB = b.statusTimes?.Preparing || b.preparingAt || b.statusUpdatedAt || b.placedAt || b.rawCreatedAt || 0;
      if (timeA && timeB && timeA !== timeB) {
        return timeA - timeB; // Ascending: order accepted earlier appears on top, accepted later below
      }
      return Number(a.id) - Number(b.id);
    });
  };

  // 3. Ready: in the line of when marked ready (first ready = top of line)
  const sortReadyQueue = (list) => {
    return [...list].sort((a, b) => {
      const timeA = a.statusTimes?.Ready || a.readyAt || a.statusUpdatedAt || a.statusTimes?.Preparing || a.placedAt || 0;
      const timeB = b.statusTimes?.Ready || b.readyAt || b.statusUpdatedAt || b.statusTimes?.Preparing || b.placedAt || 0;
      if (timeA && timeB && timeA !== timeB) {
        return timeA - timeB; // Ascending: order marked ready earlier appears on top, marked ready later below
      }
      return Number(a.id) - Number(b.id);
    });
  };

  const getTicketItems = (ord) => {
    if (!ord) return [];
    const candidates = [
      ord.items,
      ord.order_items,
      ord.orderItems,
      ord.food_items,
      ord.dishes
    ];
    for (const c of candidates) {
      if (Array.isArray(c) && c.length > 0) return c;
      if (typeof c === 'string') {
        try {
          const parsed = JSON.parse(c);
          if (Array.isArray(parsed) && parsed.length > 0) return parsed;
        } catch (e) {}
      }
    }

    return [];
  };

  // 4. Completed: in the line of when served/completed (most recently served at top)
  const sortCompletedQueue = (list) => {
    return [...list].sort((a, b) => {
      const timeA = a.statusTimes?.Completed || a.statusTimes?.Serving || a.completedAt || a.statusUpdatedAt || a.placedAt || 0;
      const timeB = b.statusTimes?.Completed || b.statusTimes?.Serving || b.completedAt || b.statusUpdatedAt || b.placedAt || 0;
      if (timeA && timeB && timeA !== timeB) {
        return timeB - timeA; // Descending: latest completed at top
      }
      return Number(b.id) - Number(a.id);
    });
  };

  const isPending = (st) => {
    const s = String(st || '').toLowerCase().trim();
    if (!s) return true;
    if (s === 'cancelled' || s === 'canceled' || s === 'preparing' || s === 'cooking' || s === 'accepted' || s === 'in_kitchen' || s === 'ready' || s === 'out_for_delivery' || s === 'prepared' || s === 'ready_for_pickup' || s === 'completed' || s === 'serving' || s === 'served' || s === 'delivered' || s === 'done' || s === 'settled') {
      return false;
    }
    return true;
  };

  const isPreparing = (st) => {
    const s = String(st || '').toLowerCase().trim();
    return s === 'preparing' || s === 'cooking' || s === 'accepted' || s === 'in_kitchen';
  };

  const isReady = (st) => {
    const s = String(st || '').toLowerCase().trim();
    return s === 'ready' || s === 'out_for_delivery' || s === 'prepared' || s === 'ready_for_pickup';
  };

  const isCompleted = (st) => {
    const s = String(st || '').toLowerCase().trim();
    return s === 'completed' || s === 'serving' || s === 'served' || s === 'delivered' || s === 'done' || s === 'settled';
  };

  const formatTableBadge = (table) => {
    if (!table) return 'Table: N/A';
    const str = String(table).trim();
    if (str.toLowerCase() === 'takeaway') return 'Takeaway';
    if (/^table\s+/i.test(str)) return str;
    return `Table: ${str}`;
  };

  const isTakeawayOrder = (ord) => {
    if (!ord) return false;
    const type = String(ord.order_type || ord.orderType || '').toUpperCase();
    if (type === 'TAKEAWAY') return true;
    if (type === 'DINE_IN' || type === 'DINING') return false;
    const tbl = String(ord.tableNumber || ord.table_label || (typeof ord.table === 'object' ? ord.table?.table_number : ord.table) || '').toLowerCase().trim();
    return tbl === 'takeaway' || tbl === '';
  };

  const getCustomizationsList = (item) => {
    const list = item?.customizations || item?.extraIngredients || item?.toppings || item?.options || [];
    if (!Array.isArray(list)) return [];
    return list.map((c) => {
      if (typeof c === 'string') return c.trim();
      if (c && typeof c === 'object') {
        const name = (c.name || c.title || c.option_name || '').trim();
        const price = Number(c.extra_price ?? c.price ?? c.extraPrice ?? 0);
        if (price > 0) {
          return `${name} (+₹${price.toFixed(2)})`;
        }
        return name;
      }
      return '';
    }).filter(Boolean);
  };

  const getInstructions = (item) => {
    return String(item?.special_instructions || item?.instructions || item?.specialInstructions || '').trim();
  };

  const areOrdersDuplicate = (ordA, ordB) => {
    if (!ordA || !ordB) return false;
    const idA = String(ordA.id || ordA.order_id || ordA.orderId || '').trim();
    const idB = String(ordB.id || ordB.order_id || ordB.orderId || '').trim();
    if (idA && idB) {
      if (idA === idB) return true;
      const cleanA = idA.replace(/^(FD|ORD|order_|-)/gi, '').replace(/\D/g, '');
      const cleanB = idB.replace(/^(FD|ORD|order_|-)/gi, '').replace(/\D/g, '');
      if (cleanA && cleanB && cleanA === cleanB) return true;
      return false; // Distinct IDs should NEVER be merged!
    }

    const tableA = String(ordA.table || ordA.tableNumber || ordA.table_number || '').replace(/\D/g, '');
    const tableB = String(ordB.table || ordB.tableNumber || ordB.table_number || '').replace(/\D/g, '');
    if (tableA && tableB && tableA !== tableB) return false;

    const totalA = parseFloat(ordA.total || ordA.total_amount || ordA.totalPrice || ordA.amount || 0);
    const totalB = parseFloat(ordB.total || ordB.total_amount || ordB.totalPrice || ordB.amount || 0);
    const totalMatches = Math.abs(totalA - totalB) < 1.0;

    const itemsA = ordA.items || [];
    const itemsB = ordB.items || [];
    let itemsMatch = false;
    if (itemsA.length > 0 && itemsB.length > 0) {
      const namesA = itemsA.map(i => `${i.name || i.title || ''}x${i.quantity || 1}`.toLowerCase().trim()).sort().join('|');
      const namesB = itemsB.map(i => `${i.name || i.title || ''}x${i.quantity || 1}`.toLowerCase().trim()).sort().join('|');
      if (namesA === namesB) itemsMatch = true;
    }

    return (totalMatches && itemsMatch);
  };

  const allKitchenOrders = (orders || []).filter((ord) => ord && (ord.id || ord.order_id));
  // Branch and backend-driven filtering (NEVER filter by customer user_id)
  const activeBranchFilteredOrders = allKitchenOrders.filter((ord) => {
    if (!ord || (!ord.id && !ord.order_id)) return false;

    // Branch filtering. A branch employee already receives only their branch from the API.
    const staffUser = (() => {
      try { return JSON.parse(sessionStorage.getItem('foodie_auth_admin') || '{}').user; } catch { return null; }
    })();
    const branchEmployee = staffUser?.role === 'employee' && staffUser?.branchId;
    if (!branchEmployee && selectedBranch && selectedBranch !== 'ALL') {
      const orderBranch = ord.branchId || ord.branch_id || ord.restaurant || ord.restaurant_id || ord.restaurantId;
      const selectedBranchObj = branches.find(b => String(b.id) === String(selectedBranch));

      if (orderBranch) {
        const isMatch =
          String(orderBranch) === String(selectedBranch) ||
          (selectedBranchObj && (
            String(orderBranch) === String(selectedBranchObj.code) ||
            String(orderBranch).toLowerCase() === String(selectedBranchObj.name).toLowerCase()
          )) ||
          (selectedBranchObj?.isMainBranch && (orderBranch === 1 || String(orderBranch) === '1'));

        if (!isMatch) return false;
      }
    }

    return true;
  });

  const pendingOrders = sortNewTickets(activeBranchFilteredOrders.filter((o) => isPending(o.status) && !isPreparing(o.status) && !isReady(o.status) && !isCompleted(o.status)));
  const preparingOrders = sortPreparingQueue(activeBranchFilteredOrders.filter((o) => isPreparing(o.status)));
  const readyOrders = sortReadyQueue(activeBranchFilteredOrders.filter((o) => isReady(o.status)));
  const completedOrders = sortCompletedQueue(activeBranchFilteredOrders.filter((o) => isCompleted(o.status)));

  return (
    <AdminLayout fullHeight={true}>
      <div className="kitchen-queue-page">
        <div className="kitchen-queue-header" ref={headerRef}>
          <PageHeader
            title="Kitchen Queue & Live Status Monitor"
            showBackButton
            actions={
              <div className="d-flex align-items-center gap-2 pe-2 pe-md-3">
                {!isBranchRestricted && (
                  <div className="d-flex align-items-center gap-2">
                    <span className="text-secondary small fw-semibold d-none d-md-inline">Branch:</span>
                    <select
                      value={selectedBranch}
                      onChange={(e) => {
                        const targetId = e.target.value;
                        const targetBranch = branches.find(b => String(b.id) === String(targetId));
                        if (targetBranch && isBranchUnderConstruction(targetBranch)) return;
                        setSelectedBranch(targetId);
                      }}
                      className="form-select form-select-sm rounded-pill border-secondary-subtle fw-semibold ps-3 pe-4 py-1.5"
                      style={{ minWidth: '270px', fontSize: '13px', cursor: 'pointer', backgroundColor: '#ffffff' }}
                      aria-label="Filter Kitchen by Branch"
                    >
                      {branches.map(b => {
                        const underConst = isBranchUnderConstruction(b);
                        return (
                          <option key={b.id} value={String(b.id)} disabled={underConst}>
                            {b.name}{underConst ? ' — Under Construction' : ''}
                          </option>
                        );
                      })}
                    </select>
                  </div>
                )}
                <button
                  type="button"
                  className="btn btn-sm btn-outline-secondary rounded-pill px-3 py-1.5 fw-semibold d-flex align-items-center gap-1"
                  onClick={() => fetchOrders(true)}
                  title="Refresh Kitchen Queue from Backend"
                >
                  <i className="bi bi-arrow-clockwise"></i>
                </button>
              </div>
            }
          />

          {actionError && (
            <div className="alert alert-warning small py-2 mb-3" role="alert">{actionError}</div>
          )}
        </div>

        {loading ? (
          <Loader />
        ) : (
          <div 
            className="kitchen-queue-grid"
            style={gridHeight ? { height: `${gridHeight}px`, maxHeight: `${gridHeight}px` } : undefined}
          >
            {/* Column 1: New Tickets */}
            <div className="kitchen-queue-column">
              <div className="card border-0 rounded-3 shadow-sm bg-white kitchen-queue-card">
                <div className="kitchen-queue-column-header d-flex align-items-center justify-content-between p-3 border-bottom pb-2">
                  <div className="d-flex align-items-center gap-2">
                    <span className="p-1 rounded bg-danger-subtle text-danger">
                      <i className="bi bi-receipt"></i>
                    </span>
                    <h6 className="fw-bold text-dark mb-0">New Tickets</h6>
                  </div>
                  <span className="badge bg-danger rounded-pill px-2.5 py-1">{pendingOrders.length}</span>
                </div>

                <div className="kitchen-queue-column-content p-3 d-flex flex-column gap-3">
                {pendingOrders.length === 0 ? (
                  <EmptyState title="No New Tickets" description="Pending orders appear here." icon="bi-patch-check" />
                ) : (
                  pendingOrders.map((ord) => (
                    <div key={ord.id} className="p-3 border rounded-3 bg-light-subtle kitchen-ticket shadow-xs border-danger-subtle">
                      <div className="d-flex align-items-center justify-content-between fw-bold mb-2">
                        <span className="text-dark fs-6">#{ord.id}</span>
                        <span className="badge bg-danger text-white rounded-pill px-2.5 py-1">
                          {formatTableBadge(ord.table)}
                        </span>
                      </div>

                      <div className="small border-bottom pb-2 mb-2 text-secondary">
                        {(() => {
                          const itemsList = getTicketItems(ord);
                          const isFallback = itemsList.length === 0 || (itemsList.length === 1 && itemsList[0].name === 'Dish Item');

                          if (itemsList.length > 0 && !isFallback) {
                            return itemsList.map((i, idx) => (
                              <div key={idx} className="mb-2" title={i.name || i.title || i.food_name || i.dish_name}>
                                <div className="d-flex justify-content-between align-items-start">
                                  <span className="text-dark fw-medium">• {i.name || i.title || i.food_name || i.dish_name || 'Dish Item'}</span>
                                  <strong className="text-danger ms-2 flex-shrink-0">× {i.quantity || i.qty || 1}</strong>
                                </div>
                                {(() => {
                                  const customs = getCustomizationsList(i);
                                  const instructions = getInstructions(i);
                                  return (
                                    <>
                                      {customs.length > 0 && (
                                        <div className="text-secondary ms-2 text-wrap fw-medium mt-0.5" style={{ fontSize: '11px', whiteSpace: 'normal', lineHeight: '1.3', color: '#64748b' }}>
                                          <span className="fw-semibold text-dark">• Extra ingredients:</span> {customs.join(', ')}
                                        </div>
                                      )}
                                      {Boolean(instructions) && (
                                        <div className="text-muted fst-italic ms-2 text-wrap mt-0.5" style={{ fontSize: '11px', whiteSpace: 'normal', lineHeight: '1.3' }}>
                                          <span className="fw-semibold text-secondary fst-normal">• Instructions:</span> {instructions}
                                        </div>
                                      )}
                                    </>
                                  );
                                })()}
                              </div>
                            ));
                          }
                          return (
                            <div className="mb-1 text-truncate" style={{ maxWidth: '240px' }}>
                              <span className="text-dark fw-medium">• Dish Item</span> <strong className="text-danger">× 1</strong>
                            </div>
                          );
                        })()}
                        {ord.special_instructions && (
                          <div className="text-danger fw-semibold mt-1 fst-italic" style={{ fontSize: '11px' }}>
                            Order Note: {ord.special_instructions}
                          </div>
                        )}

                      </div>

                      <div className="d-flex align-items-center justify-content-between flex-wrap gap-2">
                        <span className="text-muted small" style={{ fontSize: '11.5px' }}>
                          {ord.time || 'Placed'}
                        </span>
                        <div className="d-flex align-items-center gap-2">
                          <Button
                            onClick={() => handleReject(ord.id)}
                            disabled={isRejecting(ord.id)}
                            loading={isRejecting(ord.id)}
                            size="sm"
                            variant="outline"
                            className="py-1 px-2.5 fw-bold shadow-xs"
                            style={{ fontSize: '11.5px' }}
                          >
                            Reject
                          </Button>
                          <Button
                            onClick={() => handleAction(ord.id, 'Preparing')}
                            disabled={isAccepting(ord.id)}
                            loading={isAccepting(ord.id)}
                            size="sm"
                            variant="primary"
                            className="py-1 px-3 fw-bold shadow-xs"
                            style={{ fontSize: '11.5px' }}
                          >
                            Accept
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>

          {/* Column 2: Preparing */}
          <div className="kitchen-queue-column">
            <div className="card border-0 rounded-3 shadow-sm bg-white kitchen-queue-card">
              <div className="kitchen-queue-column-header d-flex align-items-center justify-content-between p-3 border-bottom pb-2">
                <div className="d-flex align-items-center gap-2">
                  <span className="p-1 rounded bg-warning-subtle text-warning">
                    <i className="bi bi-fire"></i>
                  </span>
                  <h6 className="fw-bold text-dark mb-0">Preparing</h6>
                </div>
                <span className="badge bg-warning text-dark rounded-pill px-2.5 py-1">{preparingOrders.length}</span>
              </div>

              <div className="kitchen-queue-column-content p-3 d-flex flex-column gap-3">
                {preparingOrders.length === 0 ? (
                  <EmptyState title="Idle Kitchen" description="Cooking orders appear here." icon="bi-fire" />
                ) : (
                  preparingOrders.map((ord) => (
                    <div key={ord.id} className="p-3 border rounded-3 bg-light-subtle kitchen-ticket ticket-preparing shadow-xs">
                      <div className="d-flex align-items-center justify-content-between fw-bold mb-2">
                        <span className="text-dark fs-6">#{ord.id}</span>
                        <span className="badge bg-warning text-dark rounded-pill px-2.5 py-1">
                          {formatTableBadge(ord.table)}
                        </span>
                      </div>

                      <div className="small border-bottom pb-2 mb-2 text-secondary">
                        {(() => {
                          const itemsList = getTicketItems(ord);
                          const isFallback = itemsList.length === 0 || (itemsList.length === 1 && itemsList[0].name === 'Dish Item');

                          if (itemsList.length > 0 && !isFallback) {
                            return itemsList.map((i, idx) => (
                              <div key={idx} className="mb-2" title={i.name || i.title || i.food_name || i.dish_name}>
                                <div className="d-flex justify-content-between align-items-start">
                                  <span className="text-dark fw-medium">• {i.name || i.title || i.food_name || i.dish_name || 'Dish Item'}</span>
                                  <strong className="text-warning-emphasis ms-2 flex-shrink-0">× {i.quantity || i.qty || 1}</strong>
                                </div>
                                {(() => {
                                  const customs = getCustomizationsList(i);
                                  const instructions = getInstructions(i);
                                  return (
                                    <>
                                      {customs.length > 0 && (
                                        <div className="text-secondary ms-2 text-wrap fw-medium mt-0.5" style={{ fontSize: '11px', whiteSpace: 'normal', lineHeight: '1.3', color: '#64748b' }}>
                                          <span className="fw-semibold text-dark">• Extra ingredients:</span> {customs.join(', ')}
                                        </div>
                                      )}
                                      {Boolean(instructions) && (
                                        <div className="text-muted fst-italic ms-2 text-wrap mt-0.5" style={{ fontSize: '11px', whiteSpace: 'normal', lineHeight: '1.3' }}>
                                          <span className="fw-semibold text-secondary fst-normal">• Instructions:</span> {instructions}
                                        </div>
                                      )}
                                    </>
                                  );
                                })()}
                              </div>
                            ));
                          }
                          return (
                            <div className="mb-1 text-truncate" style={{ maxWidth: '240px' }}>
                              <span className="text-dark fw-medium">• Dish Item</span> <strong className="text-warning-emphasis">× 1</strong>
                            </div>
                          );
                        })()}
                        {ord.special_instructions && (
                          <div className="text-warning-emphasis fw-semibold mt-1 fst-italic" style={{ fontSize: '11px' }}>
                            Order Note: {ord.special_instructions}
                          </div>
                        )}

                      </div>

                      <div className="d-flex align-items-center justify-content-between">
                        <span className="text-muted small" style={{ fontSize: '11.5px' }}>
                          {ord.time || 'Cooking'}
                        </span>
                        <Button
                          onClick={() => handleAction(ord.id, isTakeawayOrder(ord) ? 'Served' : 'Ready')}
                          disabled={isUpdatingStatus(ord.id, isTakeawayOrder(ord) ? 'Served' : 'Ready')}
                          loading={isUpdatingStatus(ord.id, isTakeawayOrder(ord) ? 'Served' : 'Ready')}
                          size="sm"
                          variant="primary"
                          className="py-1 px-3 fw-bold shadow-xs"
                          style={{
                            backgroundColor: isTakeawayOrder(ord) ? '#198754' : '#fd7e14',
                            borderColor: isTakeawayOrder(ord) ? '#198754' : '#fd7e14'
                          }}
                        >
                          {isTakeawayOrder(ord) ? 'Mark Serving' : 'Mark Ready'}
                        </Button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>

          {/* Column 3: Ready for Counter */}
          <div className="kitchen-queue-column">
            <div className="card border-0 rounded-3 shadow-sm bg-white kitchen-queue-card">
              <div className="kitchen-queue-column-header d-flex align-items-center justify-content-between p-3 border-bottom pb-2">
                <div className="d-flex align-items-center gap-2">
                  <span className="p-1 rounded bg-info-subtle text-info">
                    <i className="bi bi-box-seam"></i>
                  </span>
                  <h6 className="fw-bold text-dark mb-0">Ready / Serving</h6>
                </div>
                <span className="badge bg-info text-white rounded-pill px-2.5 py-1">{readyOrders.length}</span>
              </div>

              <div className="kitchen-queue-column-content p-3 d-flex flex-column gap-3">
                {readyOrders.length === 0 ? (
                  <EmptyState title="Counter Cleared" description="Prepared food items appear here." icon="bi-collection-play" />
                ) : (
                  readyOrders.map((ord) => (
                    <div key={ord.id} className="p-3 border rounded-3 bg-light-subtle kitchen-ticket ticket-ready shadow-xs">
                      <div className="d-flex align-items-center justify-content-between fw-bold mb-2">
                        <span className="text-dark fs-6">#{ord.id}</span>
                        <span className="badge bg-info text-white rounded-pill px-2.5 py-1">
                          {formatTableBadge(ord.table)}
                        </span>
                      </div>

                      <div className="small border-bottom pb-2 mb-2 text-secondary">
                        {(() => {
                          const itemsList = getTicketItems(ord);
                          const isFallback = itemsList.length === 0 || (itemsList.length === 1 && itemsList[0].name === 'Dish Item');

                          if (itemsList.length > 0 && !isFallback) {
                            return itemsList.map((i, idx) => (
                              <div key={idx} className="mb-2" title={i.name || i.title || i.food_name || i.dish_name}>
                                <div className="d-flex justify-content-between align-items-start">
                                  <span className="text-dark fw-medium">• {i.name || i.title || i.food_name || i.dish_name || 'Dish Item'}</span>
                                  <strong className="text-info ms-2 flex-shrink-0">× {i.quantity || i.qty || 1}</strong>
                                </div>
                                {(() => {
                                  const customs = getCustomizationsList(i);
                                  const instructions = getInstructions(i);
                                  return (
                                    <>
                                      {customs.length > 0 && (
                                        <div className="text-secondary ms-2 text-wrap fw-medium mt-0.5" style={{ fontSize: '11px', whiteSpace: 'normal', lineHeight: '1.3', color: '#64748b' }}>
                                          <span className="fw-semibold text-dark">• Extra ingredients:</span> {customs.join(', ')}
                                        </div>
                                      )}
                                      {Boolean(instructions) && (
                                        <div className="text-muted fst-italic ms-2 text-wrap mt-0.5" style={{ fontSize: '11px', whiteSpace: 'normal', lineHeight: '1.3' }}>
                                          <span className="fw-semibold text-secondary fst-normal">• Instructions:</span> {instructions}
                                        </div>
                                      )}
                                    </>
                                  );
                                })()}
                              </div>
                            ));
                          }
                          return (
                            <div className="mb-1 text-truncate" style={{ maxWidth: '240px' }}>
                              <span className="text-dark fw-medium">• Dish Item</span> <strong className="text-info">× 1</strong>
                            </div>
                          );
                        })()}

                      </div>

                      <div className="d-flex align-items-center justify-content-between">
                        <span className="text-muted small" style={{ fontSize: '11.5px' }}>
                          {ord.time || 'Ready'}
                        </span>
                        <Button
                          onClick={() => handleAction(ord.id, 'Served')}
                          disabled={isUpdatingStatus(ord.id, 'Served')}
                          loading={isUpdatingStatus(ord.id, 'Served')}
                          size="sm"
                          variant="primary"
                          className="py-1 px-3 fw-bold shadow-xs"
                          style={{ backgroundColor: '#198754', borderColor: '#198754' }}
                        >
                          Mark Serving
                        </Button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>

          {/* Column 4: Completed */}
          <div className="kitchen-queue-column">
            <div className="card border-0 rounded-3 shadow-sm bg-white kitchen-queue-card">
              <div className="kitchen-queue-column-header d-flex align-items-center justify-content-between p-3 border-bottom pb-2">
                <div className="d-flex align-items-center gap-2">
                  <span className="p-1 rounded bg-success-subtle text-success">
                    <i className="bi bi-check2-circle"></i>
                  </span>
                  <h6 className="fw-bold text-dark mb-0">Completed</h6>
                </div>
                <span className="badge bg-success text-white rounded-pill px-2.5 py-1">{completedOrders.length}</span>
              </div>

              <div className="kitchen-queue-column-content p-3 d-flex flex-column gap-3">
                {completedOrders.length === 0 ? (
                  <EmptyState title="No Completed Orders" description="Served orders appear here." icon="bi-check2-all" />
                ) : (
                  completedOrders.map((ord) => (
                    <div key={ord.id} className="p-3 border rounded-3 bg-light-subtle kitchen-ticket ticket-completed shadow-xs">
                      <div className="d-flex align-items-center justify-content-between fw-bold mb-3">
                        <span className="text-dark fs-6">#{ord.id}</span>
                        <span className="badge bg-success text-white rounded-pill px-2.5 py-1">
                          {formatTableBadge(ord.table)}
                        </span>
                      </div>

                      <div className="small border-bottom pb-3 mb-3 text-secondary">
                        {(() => {
                          const itemsList = getTicketItems(ord);
                          if (itemsList.length > 0) {
                            return itemsList.map((i, idx) => (
                              <div key={idx} className="mb-2" title={i.name || i.title || i.food_name || i.dish_name}>
                                <div className="d-flex justify-content-between align-items-start">
                                  <span className="text-dark fw-medium">• {i.name || i.title || i.food_name || i.dish_name || 'Dish Item'}</span>
                                  <strong className="text-success ms-2 flex-shrink-0">× {i.quantity || i.qty || 1}</strong>
                                </div>
                                {(() => {
                                  const customs = getCustomizationsList(i);
                                  const instructions = getInstructions(i);
                                  return (
                                    <>
                                      {customs.length > 0 && (
                                        <div className="text-secondary ms-2 text-wrap fw-medium mt-0.5" style={{ fontSize: '11px', whiteSpace: 'normal', lineHeight: '1.3', color: '#64748b' }}>
                                          <span className="fw-semibold text-dark">• Extra ingredients:</span> {customs.join(', ')}
                                        </div>
                                      )}
                                      {Boolean(instructions) && (
                                        <div className="text-muted fst-italic ms-2 text-wrap mt-0.5" style={{ fontSize: '11px', whiteSpace: 'normal', lineHeight: '1.3' }}>
                                          <span className="fw-semibold text-secondary fst-normal">• Instructions:</span> {instructions}
                                        </div>
                                      )}
                                    </>
                                  );
                                })()}
                              </div>
                            ));
                          }
                          return (
                            <div className="mb-1 text-truncate" style={{ maxWidth: '240px' }}>
                              <span className="text-dark fw-medium">• Dish Item</span> <strong className="text-success ms-2">× 1</strong>
                            </div>
                          );
                        })()}
                      </div>

                      <div className="d-flex flex-wrap align-items-center gap-2 mt-2">
                        {String(ord.status).toLowerCase() === 'served' && !isTakeawayOrder(ord) && (
                          <Button
                            size="sm"
                            variant="primary"
                            className="py-1 px-3 text-nowrap"
                            style={{ fontSize: '12px', whiteSpace: 'nowrap', borderRadius: '999px' }}
                            onClick={() => handleAction(ord.id, 'Completed')}
                          >
                            Mark Completed
                          </Button>
                        )}
                        <button
                          type="button"
                          onClick={() => setEBillOrder(ord)}
                          className="badge bg-success-subtle text-success border border-success-subtle rounded-pill px-3 py-1 fw-bold btn btn-sm d-inline-flex align-items-center text-nowrap"
                          style={{ fontSize: '12px', cursor: 'pointer', whiteSpace: 'nowrap', height: '31px' }}
                        >
                          <i className="bi bi-receipt me-1"></i>View E-Bill
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      )}
      </div>

      {/* E-Bill Modal for completed orders */}
      {eBillOrder && (
        <EBillModal
          isOpen={!!eBillOrder}
          order={eBillOrder}
          onClose={() => setEBillOrder(null)}
        />
      )}
    </AdminLayout>
  );
};

export default Kitchen;
