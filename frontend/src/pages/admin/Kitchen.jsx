import React, { useContext, useState, useEffect, useRef } from 'react';
import AdminLayout from '../../components/layout/AdminLayout';
import PageHeader from '../../components/layout/PageHeader';
import { OrderContext } from '../../context/OrderContext';
import { AuthContext } from '../../context/AuthContext';
import { branchService } from '../../services/branchService';
import Loader from '../../components/common/Loader';
import EmptyState from '../../components/common/EmptyState';
import Button from '../../components/common/Button';
import { FiUser, FiShoppingBag, FiClock, FiFileText, FiCheck, FiChevronRight } from 'react-icons/fi';
import EBillModal from '../../components/orders/EBillModal';
import Toast from '../../components/common/Toast';
import { tableService } from '../../services/tableService';
import { formatOrderDisplayNumber } from '../../utils/orderNumber';

export const Kitchen = () => {
  const { orders, loading, updateStatus, fetchOrders } = useContext(OrderContext);
  const { user } = useContext(AuthContext);
  const [updatingId, setUpdatingId] = useState(null);
  const [updatingAction, setUpdatingAction] = useState(null);
  const [actionError, setActionError] = useState('');
  const [eBillOrder, setEBillOrder] = useState(null);
  const [branches, setBranches] = useState([]);
  const [activeStageTab, setActiveStageTab] = useState('ALL');
  const [tables, setTables] = useState([]);
  const [clearingTableId, setClearingTableId] = useState(null);
  const [clearedOrderIds, setClearedOrderIds] = useState(new Set());
  const [toast, setToast] = useState({ show: false, message: '', type: 'add' });

  useEffect(() => {
    let mounted = true;
    const loadTables = async () => {
      try {
        const data = await tableService.getTables();
        if (mounted) setTables(Array.isArray(data) ? data : []);
      } catch (err) {}
    };
    loadTables();
    window.addEventListener('foodie_tables_updated', loadTables);
    return () => {
      mounted = false;
      window.removeEventListener('foodie_tables_updated', loadTables);
    };
  }, []);

  const handleCleanTable = async (ord) => {
    const rawVal = ord.tableNumber || ord.table_label || (typeof ord.table === 'object' ? (ord.table?.number || ord.table?.table_number || ord.table?.id) : ord.table);
    const canonNum = tableService.getCanonicalTableNumber(rawVal || '');
    const ordTableId = ord.table_id || ord.tableId || (typeof ord.table === 'object' ? ord.table?.id : null);
    
    const foundTable = tables.find(t => {
      if (ordTableId && String(t.id) === String(ordTableId)) return true;
      const tCanon = tableService.getCanonicalTableNumber(t.number || t.table_number || t.id);
      return tCanon && tCanon === canonNum;
    });

    const targetId = foundTable?.id || ordTableId;
    if (!targetId) {
      setToast({ show: true, message: `Could not identify table for this order.`, type: 'remove' });
      return;
    }

    setClearingTableId(ord.id);
    try {
      await tableService.cleanTable(targetId);
      setClearedOrderIds(prev => new Set(prev).add(ord.id).add(String(targetId)));
      const updatedTables = await tableService.getTables().catch(() => []);
      setTables(Array.isArray(updatedTables) ? updatedTables : []);
      const label = foundTable?.table_number || foundTable?.number || canonNum || 'assigned';
      setToast({ show: true, message: `Table ${label} cleared and marked Available!`, type: 'add' });
    } catch (err) {
      console.error('Failed to clean table:', err);
      await tableService.updateTableStatus(targetId, 'Available').catch(() => {});
      setClearedOrderIds(prev => new Set(prev).add(ord.id).add(String(targetId)));
      setToast({ show: true, message: `Table marked Available.`, type: 'add' });
    } finally {
      setClearingTableId(null);
    }
  };

  const isTableCleared = (ord) => {
    if (clearedOrderIds.has(ord.id)) return true;
    const rawVal = ord.tableNumber || ord.table_label || (typeof ord.table === 'object' ? (ord.table?.number || ord.table?.table_number || ord.table?.id) : ord.table);
    const canonNum = tableService.getCanonicalTableNumber(rawVal || '');
    const ordTableId = ord.table_id || ord.tableId || (typeof ord.table === 'object' ? ord.table?.id : null);
    if (ordTableId && clearedOrderIds.has(String(ordTableId))) return true;

    const foundTable = tables.find(t => {
      if (ordTableId && String(t.id) === String(ordTableId)) return true;
      const tCanon = tableService.getCanonicalTableNumber(t.number || t.table_number || t.id);
      return tCanon && tCanon === canonNum;
    });
    if (!foundTable) return false;
    return foundTable.status === 'Available' || foundTable.status === 'AVAILABLE' || foundTable.is_available === true;
  };
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
    if (!table) return 'N/A';
    const str = String(table).trim();
    if (str.toLowerCase() === 'takeaway') return 'Takeaway';
    if (/^table\s+/i.test(str)) return str;
    return `${str}`;
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
      if (typeof c === 'string') {
        return c.replace(/\s*\(\+?₹[0-9.]+\)/gi, '').trim();
      }
      if (c && typeof c === 'object') {
        const name = (c.name || c.title || c.option_name || '').trim();
        return name.replace(/\s*\(\+?₹[0-9.]+\)/gi, '').trim();
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
    <AdminLayout>
      <div className="kitchen-queue-page pb-4" style={{ overflow: "visible" }}>
        {/* Header (Matches Reference Screenshot 3) */}
        <div className="d-flex align-items-center justify-content-between flex-wrap gap-3 mb-3" ref={headerRef}>
          <div className="d-flex align-items-center gap-3">
            <div 
              className="rounded-circle d-flex align-items-center justify-content-center text-danger flex-shrink-0"
              style={{ width: '46px', height: '46px', backgroundColor: '#FEECEE' }}
            >
              <i className="bi bi-person-workspace fs-4"></i>
            </div>
            <div>
              <h2 className="fw-bold mb-0.5 text-dark" style={{ fontSize: '23px', letterSpacing: '-0.4px' }}>
                Kitchen Queue & Live Status Monitor
              </h2>
              <p className="text-secondary small mb-0" style={{ fontSize: '12.5px' }}>
                Manage, track and update kitchen orders in real-time.
              </p>
            </div>
          </div>

          <div className="d-flex align-items-center gap-2">
            {(!isBranchRestricted && (user?.role === 'admin' || user?.role === 'super_admin' || user?.isSuperAdmin) && branches.length > 1) && (
              <div className="d-flex align-items-center gap-2">
                <select
                  value={selectedBranch}
                  onChange={(e) => {
                    const targetId = e.target.value;
                    const targetBranch = branches.find(b => String(b.id) === String(targetId));
                    if (targetBranch && isBranchUnderConstruction(targetBranch)) return;
                    setSelectedBranch(targetId);
                  }}
                  className="form-select form-select-sm rounded-pill border bg-white fw-semibold ps-3 pe-4 py-1.5 shadow-2xs text-dark"
                  style={{ minWidth: '220px', fontSize: '12.5px', borderColor: '#CBD5E1' }}
                  aria-label="Filter Kitchen by Branch"
                >
                  {branches.map(b => {
                    const underConst = isBranchUnderConstruction(b);
                    return (
                      <option key={b.id} value={String(b.id)} disabled={underConst}>
                        Branch: {b.name}{underConst ? ' — Under Construction' : ''}
                      </option>
                    );
                  })}
                </select>
              </div>
            )}

            <select
              className="form-select form-select-sm rounded-pill border bg-white fw-semibold px-3 py-1.5 shadow-2xs text-dark"
              style={{ minWidth: '120px', fontSize: '12.5px', borderColor: '#CBD5E1' }}
              value={activeStageTab}
              onChange={(e) => setActiveStageTab(e.target.value)}
            >
              <option value="ALL">All Status</option>
              <option value="NEW">New</option>
              <option value="PREPARING">Preparing</option>
              <option value="READY">Ready</option>
              <option value="COMPLETED">Completed</option>
            </select>

            <button
              type="button"
              className="btn btn-sm btn-outline-secondary rounded-circle p-0 d-inline-flex align-items-center justify-content-center shadow-2xs bg-white"
              style={{ width: '34px', height: '34px', borderColor: '#CBD5E1' }}
              onClick={() => fetchOrders(true)}
              title="Refresh Kitchen Queue"
            >
              <i className="bi bi-arrow-clockwise fs-6"></i>
            </button>
          </div>
        </div>

        {actionError && (
          <div className="alert alert-warning small py-2 mb-3" role="alert">{actionError}</div>
        )}

        {/* Live updates indicator */}
        <div className="d-flex align-items-center justify-content-end flex-wrap gap-2 mb-3">
          <div className="d-flex align-items-center gap-2">
            <span className="badge rounded-pill fw-bold px-2.5 py-1 d-inline-flex align-items-center gap-1" style={{ backgroundColor: '#DCFCE7', color: '#16A34A', fontSize: '11px', border: '1px solid #BBF7D0' }}>
              <span className="rounded-circle" style={{ width: '6px', height: '6px', backgroundColor: '#16A34A' }}></span>
              Live Updates
            </span>
            <span className="text-muted small" style={{ fontSize: '11.5px' }}>
              Last updated: {new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}, {new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true })}
            </span>
          </div>
        </div>

        {/* 4 Top KPI Stat Cards (Matches Reference Screenshot 3) */}
        <div className="row g-3 mb-4">
          <div className="col-6 col-md-3">
            <div className="card p-3 rounded-4 shadow-xs border bg-white d-flex flex-row align-items-center gap-3" style={{ borderColor: '#E2E8F0' }}>
              <div className="rounded-circle d-flex align-items-center justify-content-center flex-shrink-0" style={{ width: '48px', height: '48px', backgroundColor: '#FEECEE', color: '#EF4444' }}>
                <i className="bi bi-receipt fs-4"></i>
              </div>
              <div className="text-start">
                <div className="text-secondary small fw-medium" style={{ fontSize: '12px' }}>New Tickets</div>
                <div className="fw-bold text-dark fs-3 mb-0">{pendingOrders.length}</div>
              </div>
            </div>
          </div>

          <div className="col-6 col-md-3">
            <div className="card p-3 rounded-4 shadow-xs border bg-white d-flex flex-row align-items-center gap-3" style={{ borderColor: '#E2E8F0' }}>
              <div className="rounded-circle d-flex align-items-center justify-content-center flex-shrink-0" style={{ width: '48px', height: '48px', backgroundColor: '#FEF3C7', color: '#F59E0B' }}>
                <i className="bi bi-fire fs-4"></i>
              </div>
              <div className="text-start">
                <div className="text-secondary small fw-medium" style={{ fontSize: '12px' }}>Preparing</div>
                <div className="fw-bold text-dark fs-3 mb-0">{preparingOrders.length}</div>
              </div>
            </div>
          </div>

          <div className="col-6 col-md-3">
            <div className="card p-3 rounded-4 shadow-xs border bg-white d-flex flex-row align-items-center gap-3" style={{ borderColor: '#E2E8F0' }}>
              <div className="rounded-circle d-flex align-items-center justify-content-center flex-shrink-0" style={{ width: '48px', height: '48px', backgroundColor: '#E0F2FE', color: '#0284C7' }}>
                <i className="bi bi-box-seam fs-4"></i>
              </div>
              <div className="text-start">
                <div className="text-secondary small fw-medium" style={{ fontSize: '12px' }}>Ready / Serving</div>
                <div className="fw-bold text-dark fs-3 mb-0">{readyOrders.length}</div>
              </div>
            </div>
          </div>

          <div className="col-6 col-md-3">
            <div className="card p-3 rounded-4 shadow-xs border bg-white d-flex flex-row align-items-center gap-3" style={{ borderColor: '#E2E8F0' }}>
              <div className="rounded-circle d-flex align-items-center justify-content-center flex-shrink-0" style={{ width: '48px', height: '48px', backgroundColor: '#DCFCE7', color: '#16A34A' }}>
                <i className="bi bi-check-circle fs-4"></i>
              </div>
              <div className="text-start">
                <div className="text-secondary small fw-medium" style={{ fontSize: '12px' }}>Completed (Today)</div>
                <div className="fw-bold text-dark fs-3 mb-0">{completedOrders.length}</div>
              </div>
            </div>
          </div>
        </div>

        {/* 4 Kanban Columns with Solid Color Headers (Matches Reference Screenshot 3) */}
        {loading ? (
          <Loader />
        ) : (
          <div className="row g-3 align-items-stretch">
            {/* Column 1: New Tickets */}
            <div className="col-12 col-md-6 col-xl-3 d-flex flex-column">
              <div className="card border-0 rounded-4 shadow-xs overflow-hidden d-flex flex-column h-100" style={{ backgroundColor: '#F8FAFC', height: '620px', maxHeight: 'calc(100vh - 300px)', minHeight: '440px' }}>
                {/* Solid Red Header Banner */}
                <div 
                  className="px-3 py-2.5 d-flex align-items-center justify-content-between text-white fw-bold shadow-2xs"
                  style={{ backgroundColor: '#EF4444', borderTopLeftRadius: '14px', borderTopRightRadius: '14px' }}
                >
                  <div className="d-flex align-items-center gap-2">
                    <i className="bi bi-receipt"></i>
                    <span style={{ fontSize: '14px' }}>New Tickets ({pendingOrders.length})</span>
                  </div>
                  <FiChevronRight size={16} />
                </div>

                <div className="p-2.5 d-flex flex-column gap-2.5 flex-grow-1" style={{ overflowY: 'auto', WebkitOverflowScrolling: 'touch', minHeight: 0 }}>
                  {pendingOrders.length === 0 ? (
                    <div className="card border-0 bg-white rounded-3 p-4 text-center my-auto shadow-2xs">
                      <i className="bi bi-check2-circle text-muted fs-1 mb-2"></i>
                      <h6 className="fw-bold text-dark mb-1">No New Tickets</h6>
                      <p className="text-muted small mb-0" style={{ fontSize: '12px' }}>Incoming orders will appear here.</p>
                    </div>
                  ) : (
                    pendingOrders.map((ord) => {
                      const itemsList = getTicketItems(ord);
                      const isTakeaway = isTakeawayOrder(ord);

                      return (
                        <div key={ord.id} className="card border rounded-3 p-3 bg-white shadow-2xs text-start" style={{ borderColor: '#E2E8F0' }}>
                          <div className="d-flex align-items-center justify-content-between mb-2">
                            <span className="fw-bold text-dark fs-6">#{formatOrderDisplayNumber(ord, ord.id)}</span>
                            <span className="text-muted small" style={{ fontSize: '11px' }}>{ord.time || '2 mins ago'}</span>
                          </div>

                          <div className="mb-2">
                            <span 
                              className="badge rounded-pill fw-semibold px-2.5 py-1 d-inline-flex align-items-center gap-1.5"
                              style={{ 
                                backgroundColor: isTakeaway ? '#FEF3C7' : '#FEE2E2', 
                                color: isTakeaway ? '#D97706' : '#DC2626',
                                border: isTakeaway ? '1px solid #FDE68A' : '1px solid #FECACA',
                                fontSize: '11px' 
                              }}
                            >
                              {isTakeaway ? <FiShoppingBag size={12} /> : <FiUser size={12} />}
                              <span>{isTakeaway ? 'Takeaway' : `Dine-in · Table ${formatTableBadge(ord.table)}`}</span>
                            </span>
                          </div>

                          {/* Items List */}
                          <div className="d-flex flex-column gap-1 py-2 border-top border-bottom" style={{ borderColor: '#F1F5F9' }}>
                            {itemsList.map((i, idx) => (
                              <div key={idx} className="d-flex align-items-center justify-content-between small" style={{ fontSize: '12.5px' }}>
                                <span className="text-dark fw-medium">
                                  {i.name || i.title || 'Dish'} <strong className="text-secondary ms-1">× {i.quantity || 1}</strong>
                                </span>
                                <span className="fw-bold text-dark">
                                  ₹{(Number(i.line_total || i.price || 0)).toFixed(2)}
                                </span>
                              </div>
                            ))}
                          </div>

                          {/* Special Instructions Note Box */}
                          {Boolean(ord.special_instructions || ord.notes) && (
                            <div className="rounded-2 p-2 mt-2 mb-1" style={{ backgroundColor: '#FFFBEB', border: '1px solid #FEF3C7', fontSize: '11px' }}>
                              <span className="text-secondary fw-bold d-block mb-0.5">Special Instructions</span>
                              <span className="text-dark">{ord.special_instructions || ord.notes}</span>
                            </div>
                          )}

                          {/* Action Buttons */}
                          <div className="d-flex align-items-center justify-content-between gap-2 pt-3 mt-1">
                            <button
                              type="button"
                              onClick={() => handleReject(ord.id)}
                              disabled={isRejecting(ord.id)}
                              className="btn btn-sm bg-white rounded-pill px-3 py-1.5 fw-bold flex-grow-1 shadow-2xs"
                              style={{ borderColor: '#F20D2D', color: '#F20D2D', border: '1px solid #F20D2D', fontSize: '12px' }}
                            >
                              Reject
                            </button>

                            <button
                              type="button"
                              onClick={() => handleAction(ord.id, 'Preparing')}
                              disabled={isAccepting(ord.id)}
                              className="btn btn-sm btn-danger rounded-pill px-3 py-1.5 fw-bold flex-grow-1 shadow-2xs text-white"
                              style={{ backgroundColor: '#F20D2D', borderColor: '#F20D2D', fontSize: '12px' }}
                            >
                              Start Preparing
                            </button>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            </div>

            {/* Column 2: Preparing */}
            <div className="col-12 col-md-6 col-xl-3 d-flex flex-column">
              <div className="card border-0 rounded-4 shadow-xs overflow-hidden d-flex flex-column h-100" style={{ backgroundColor: '#F8FAFC', height: '620px', maxHeight: 'calc(100vh - 300px)', minHeight: '440px' }}>
                {/* Solid Orange Header Banner */}
                <div 
                  className="px-3 py-2.5 d-flex align-items-center justify-content-between text-white fw-bold shadow-2xs"
                  style={{ backgroundColor: '#F59E0B', borderTopLeftRadius: '14px', borderTopRightRadius: '14px' }}
                >
                  <div className="d-flex align-items-center gap-2">
                    <i className="bi bi-fire"></i>
                    <span style={{ fontSize: '14px' }}>Preparing ({preparingOrders.length})</span>
                  </div>
                  <FiChevronRight size={16} />
                </div>

                <div className="p-2.5 d-flex flex-column gap-2.5 flex-grow-1" style={{ overflowY: 'auto', WebkitOverflowScrolling: 'touch', minHeight: 0 }}>
                  {preparingOrders.length === 0 ? (
                    <div className="card border-0 bg-white rounded-3 p-4 text-center my-auto shadow-2xs">
                      <div className="rounded-circle d-flex align-items-center justify-content-center mx-auto mb-2 text-warning" style={{ width: '48px', height: '48px', backgroundColor: '#FEF3C7' }}>
                        <i className="bi bi-fire fs-3"></i>
                      </div>
                      <h6 className="fw-bold text-dark mb-1">No more orders in Preparing</h6>
                      <p className="text-muted small mb-0" style={{ fontSize: '12px' }}>New orders will appear here.</p>
                    </div>
                  ) : (
                    preparingOrders.map((ord) => {
                      const itemsList = getTicketItems(ord);
                      const isTakeaway = isTakeawayOrder(ord);

                      return (
                        <div key={ord.id} className="card border rounded-3 p-3 bg-white shadow-2xs text-start" style={{ borderColor: '#E2E8F0' }}>
                          <div className="d-flex align-items-center justify-content-between mb-2">
                            <span className="fw-bold text-dark fs-6">#{formatOrderDisplayNumber(ord, ord.id)}</span>
                            <span className="text-muted small" style={{ fontSize: '11px' }}>{ord.time || '5 mins ago'}</span>
                          </div>

                          <div className="mb-2">
                            <span 
                              className="badge rounded-pill fw-semibold px-2.5 py-1 d-inline-flex align-items-center gap-1.5"
                              style={{ 
                                backgroundColor: isTakeaway ? '#FEF3C7' : '#FEE2E2', 
                                color: isTakeaway ? '#D97706' : '#DC2626',
                                border: isTakeaway ? '1px solid #FDE68A' : '1px solid #FECACA',
                                fontSize: '11px' 
                              }}
                            >
                              {isTakeaway ? <FiShoppingBag size={12} /> : <FiUser size={12} />}
                              <span>{isTakeaway ? 'Takeaway' : `Dine-in · Table ${formatTableBadge(ord.table)}`}</span>
                            </span>
                          </div>

                          <div className="d-flex flex-column gap-1 py-2 border-top border-bottom" style={{ borderColor: '#F1F5F9' }}>
                            {itemsList.map((i, idx) => (
                              <div key={idx} className="d-flex align-items-center justify-content-between small" style={{ fontSize: '12.5px' }}>
                                <span className="text-dark fw-medium">
                                  {i.name || i.title || 'Dish'} <strong className="text-secondary ms-1">× {i.quantity || 1}</strong>
                                </span>
                                <span className="fw-bold text-dark">
                                  ₹{(Number(i.line_total || i.price || 0)).toFixed(2)}
                                </span>
                              </div>
                            ))}
                          </div>

                          {Boolean(ord.special_instructions || ord.notes) && (
                            <div className="rounded-2 p-2 mt-2 mb-1" style={{ backgroundColor: '#FFFBEB', border: '1px solid #FEF3C7', fontSize: '11px' }}>
                              <span className="text-secondary fw-bold d-block mb-0.5">Special Instructions</span>
                              <span className="text-dark">{ord.special_instructions || ord.notes}</span>
                            </div>
                          )}

                          <div className="d-flex align-items-center justify-content-between gap-2 pt-3 mt-1">
                            <button
                              type="button"
                              onClick={() => setEBillOrder(ord)}
                              className="btn btn-sm bg-white rounded-pill px-3 py-1.5 fw-semibold flex-grow-1 shadow-2xs border text-secondary"
                              style={{ fontSize: '12px', borderColor: '#CBD5E1' }}
                            >
                              View Details
                            </button>

                            <button
                              type="button"
                              onClick={() => handleAction(ord.id, isTakeaway ? 'Served' : 'Ready')}
                              disabled={isUpdatingStatus(ord.id, isTakeaway ? 'Served' : 'Ready')}
                              className="btn btn-sm rounded-pill px-3 py-1.5 fw-bold flex-grow-1 shadow-2xs text-white"
                              style={{ backgroundColor: '#F59E0B', borderColor: '#F59E0B', fontSize: '12px' }}
                            >
                              Mark Ready
                            </button>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            </div>

            {/* Column 3: Ready / Serving */}
            <div className="col-12 col-md-6 col-xl-3 d-flex flex-column">
              <div className="card border-0 rounded-4 shadow-xs overflow-hidden d-flex flex-column h-100" style={{ backgroundColor: '#F8FAFC', height: '620px', maxHeight: 'calc(100vh - 300px)', minHeight: '440px' }}>
                {/* Solid Cyan / Blue Header Banner */}
                <div 
                  className="px-3 py-2.5 d-flex align-items-center justify-content-between text-white fw-bold shadow-2xs"
                  style={{ backgroundColor: '#0284C7', borderTopLeftRadius: '14px', borderTopRightRadius: '14px' }}
                >
                  <div className="d-flex align-items-center gap-2">
                    <i className="bi bi-box-seam"></i>
                    <span style={{ fontSize: '14px' }}>Ready / Serving ({readyOrders.length})</span>
                  </div>
                  <FiChevronRight size={16} />
                </div>

                <div className="p-2.5 d-flex flex-column gap-2.5 flex-grow-1" style={{ overflowY: 'auto', WebkitOverflowScrolling: 'touch', minHeight: 0 }}>
                  {readyOrders.length === 0 ? (
                    <div className="card border-0 bg-white rounded-3 p-4 text-center my-auto shadow-2xs">
                      <div className="rounded-circle d-flex align-items-center justify-content-center mx-auto mb-2 text-info" style={{ width: '48px', height: '48px', backgroundColor: '#E0F2FE' }}>
                        <i className="bi bi-collection-play fs-3"></i>
                      </div>
                      <h6 className="fw-bold text-dark mb-1">No more orders in Ready</h6>
                      <p className="text-muted small mb-0" style={{ fontSize: '12px' }}>Orders marked ready will appear here.</p>
                    </div>
                  ) : (
                    readyOrders.map((ord) => {
                      const itemsList = getTicketItems(ord);
                      const isTakeaway = isTakeawayOrder(ord);

                      return (
                        <div key={ord.id} className="card border rounded-3 p-3 bg-white shadow-2xs text-start" style={{ borderColor: '#E2E8F0' }}>
                          <div className="d-flex align-items-center justify-content-between mb-2">
                            <span className="fw-bold text-dark fs-6">#{formatOrderDisplayNumber(ord, ord.id)}</span>
                            <span className="text-muted small" style={{ fontSize: '11px' }}>{ord.time || '2 mins ago'}</span>
                          </div>

                          <div className="mb-2">
                            <span 
                              className="badge rounded-pill fw-semibold px-2.5 py-1 d-inline-flex align-items-center gap-1.5"
                              style={{ 
                                backgroundColor: isTakeaway ? '#FEF3C7' : '#E0F2FE', 
                                color: isTakeaway ? '#D97706' : '#0284C7',
                                border: isTakeaway ? '1px solid #FDE68A' : '1px solid #BAE6FD',
                                fontSize: '11px' 
                              }}
                            >
                              {isTakeaway ? <FiShoppingBag size={12} /> : <FiUser size={12} />}
                              <span>{isTakeaway ? 'Takeaway' : `Dine-in · Table ${formatTableBadge(ord.table)}`}</span>
                            </span>
                          </div>

                          <div className="d-flex flex-column gap-1 py-2 border-top border-bottom" style={{ borderColor: '#F1F5F9' }}>
                            {itemsList.map((i, idx) => (
                              <div key={idx} className="d-flex align-items-center justify-content-between small" style={{ fontSize: '12.5px' }}>
                                <span className="text-dark fw-medium">
                                  {i.name || i.title || 'Dish'} <strong className="text-secondary ms-1">× {i.quantity || 1}</strong>
                                </span>
                                <span className="fw-bold text-dark">
                                  ₹{(Number(i.line_total || i.price || 0)).toFixed(2)}
                                </span>
                              </div>
                            ))}
                          </div>

                          {Boolean(ord.special_instructions || ord.notes) && (
                            <div className="rounded-2 p-2 mt-2 mb-1" style={{ backgroundColor: '#FFFBEB', border: '1px solid #FEF3C7', fontSize: '11px' }}>
                              <span className="text-secondary fw-bold d-block mb-0.5">Special Instructions</span>
                              <span className="text-dark">{ord.special_instructions || ord.notes}</span>
                            </div>
                          )}

                          <div className="d-flex align-items-center justify-content-between gap-2 pt-3 mt-1">
                            <button
                              type="button"
                              onClick={() => setEBillOrder(ord)}
                              className="btn btn-sm bg-white rounded-pill px-3 py-1.5 fw-semibold flex-grow-1 shadow-2xs border text-secondary"
                              style={{ fontSize: '12px', borderColor: '#CBD5E1' }}
                            >
                              View Details
                            </button>

                            <button
                              type="button"
                              onClick={() => handleAction(ord.id, 'Served')}
                              disabled={isUpdatingStatus(ord.id, 'Served')}
                              className="btn btn-sm rounded-pill px-3 py-1.5 fw-bold flex-grow-1 shadow-2xs text-white"
                              style={{ backgroundColor: '#0284C7', borderColor: '#0284C7', fontSize: '12px' }}
                            >
                              Mark Serving
                            </button>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            </div>

            {/* Column 4: Completed */}
            <div className="col-12 col-md-6 col-xl-3 d-flex flex-column">
              <div className="card border-0 rounded-4 shadow-xs overflow-hidden d-flex flex-column h-100" style={{ backgroundColor: '#F8FAFC', height: '620px', maxHeight: 'calc(100vh - 300px)', minHeight: '440px' }}>
                {/* Solid Green Header Banner */}
                <div 
                  className="px-3 py-2.5 d-flex align-items-center justify-content-between text-white fw-bold shadow-2xs"
                  style={{ backgroundColor: '#16A34A', borderTopLeftRadius: '14px', borderTopRightRadius: '14px' }}
                >
                  <div className="d-flex align-items-center gap-2">
                    <i className="bi bi-check-circle"></i>
                    <span style={{ fontSize: '14px' }}>Completed ({completedOrders.length})</span>
                  </div>
                  <FiChevronRight size={16} />
                </div>

                <div className="p-2.5 d-flex flex-column gap-2.5 flex-grow-1" style={{ overflowY: 'auto', WebkitOverflowScrolling: 'touch', minHeight: 0 }}>
                  {completedOrders.length === 0 ? (
                    <div className="card border-0 bg-white rounded-3 p-4 text-center my-auto shadow-2xs">
                      <div className="rounded-circle d-flex align-items-center justify-content-center mx-auto mb-2 text-success" style={{ width: '48px', height: '48px', backgroundColor: '#DCFCE7' }}>
                        <i className="bi bi-check2-all fs-3"></i>
                      </div>
                      <h6 className="fw-bold text-dark mb-1">All caught up!</h6>
                      <p className="text-muted small mb-0" style={{ fontSize: '12px' }}>Completed orders will be listed here.</p>
                    </div>
                  ) : (
                    completedOrders.map((ord) => {
                      const itemsList = getTicketItems(ord);
                      const isTakeaway = isTakeawayOrder(ord);

                      return (
                        <div key={ord.id} className="card border rounded-3 p-3 bg-white shadow-2xs text-start" style={{ borderColor: '#E2E8F0' }}>
                          <div className="d-flex align-items-center justify-content-between mb-2">
                            <span className="fw-bold text-dark fs-6">#{formatOrderDisplayNumber(ord, ord.id)}</span>
                            <span className="badge rounded-pill px-2.5 py-0.5 fw-semibold" style={{ backgroundColor: '#DCFCE7', color: '#16A34A', fontSize: '10.5px' }}>
                              Completed
                            </span>
                          </div>

                          <div className="mb-2">
                            <span 
                              className="badge rounded-pill fw-semibold px-2.5 py-1 d-inline-flex align-items-center gap-1.5"
                              style={{ 
                                backgroundColor: isTakeaway ? '#FEF3C7' : '#DCFCE7', 
                                color: isTakeaway ? '#D97706' : '#16A34A',
                                border: isTakeaway ? '1px solid #FDE68A' : '1px solid #BBF7D0',
                                fontSize: '11px' 
                              }}
                            >
                              {isTakeaway ? <FiShoppingBag size={12} /> : <FiUser size={12} />}
                              <span>{isTakeaway ? 'Takeaway' : `Dine-in · Table ${formatTableBadge(ord.table)}`}</span>
                            </span>
                          </div>

                          <div className="d-flex flex-column gap-1 py-2 border-top border-bottom" style={{ borderColor: '#F1F5F9' }}>
                            {itemsList.map((i, idx) => (
                              <div key={idx} className="d-flex align-items-center justify-content-between small" style={{ fontSize: '12.5px' }}>
                                <span className="text-dark fw-medium">
                                  {i.name || i.title || 'Dish'} <strong className="text-secondary ms-1">× {i.quantity || 1}</strong>
                                </span>
                                <span className="fw-bold text-dark">
                                  ₹{(Number(i.line_total || i.price || 0)).toFixed(2)}
                                </span>
                              </div>
                            ))}
                          </div>

                          <div className="d-flex align-items-center justify-content-between pt-2 text-secondary small" style={{ fontSize: '12px' }}>
                            <span>Total Amount</span>
                            <span className="fw-bold fs-6" style={{ color: '#16A34A' }}>
                              ₹{(Number(ord.total_amount || ord.total || 0)).toFixed(2)}
                            </span>
                          </div>

                          <div className="d-flex align-items-center justify-content-between gap-2 pt-2 mt-2 border-top" style={{ borderColor: '#F1F5F9' }}>
                            <button
                              type="button"
                              onClick={() => setEBillOrder(ord)}
                              className="btn btn-sm bg-white rounded-pill px-3 py-1.5 fw-bold flex-grow-1 shadow-2xs"
                              style={{ border: '1px solid #16A34A', color: '#16A34A', fontSize: '12px' }}
                            >
                              <FiFileText size={13} className="me-1" />
                              View Bill
                            </button>

                            {!isTakeaway && (
                              <button
                                type="button"
                                onClick={() => handleCleanTable(ord)}
                                disabled={clearingTableId === ord.id || isTableCleared(ord)}
                                className={`btn btn-sm rounded-pill px-3 py-1.5 fw-bold d-inline-flex align-items-center justify-content-center gap-1.5 flex-grow-1 shadow-2xs transition-all ${
                                  isTableCleared(ord)
                                    ? 'bg-light border text-muted opacity-75'
                                    : 'btn-success text-white'
                                }`}
                                style={{
                                  backgroundColor: isTableCleared(ord) ? '#F1F5F9' : '#16A34A',
                                  borderColor: isTableCleared(ord) ? '#CBD5E1' : '#16A34A',
                                  color: isTableCleared(ord) ? '#64748B' : '#FFFFFF',
                                  fontSize: '12px',
                                  cursor: isTableCleared(ord) ? 'default' : 'pointer'
                                }}
                                title={isTableCleared(ord) ? "Table is already cleaned and available" : "Clear & mark table available"}
                              >
                                <FiCheck size={13} />
                                <span>
                                  {clearingTableId === ord.id
                                    ? 'Clearing...'
                                    : isTableCleared(ord)
                                    ? 'Table Cleared'
                                    : 'Table Cleaned'}
                                </span>
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      <EBillModal
        isOpen={Boolean(eBillOrder)}
        order={eBillOrder}
        onClose={() => setEBillOrder(null)}
      />

      <Toast
        isOpen={toast.show}
        message={toast.message}
        type={toast.type}
        onClose={() => setToast({ ...toast, show: false })}
      />
    </AdminLayout>
  );
};

export default Kitchen;
