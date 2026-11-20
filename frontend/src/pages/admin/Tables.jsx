import React, { useEffect, useState, useContext } from 'react';
import AdminLayout from '../../components/layout/AdminLayout';
import PageHeader from '../../components/layout/PageHeader';
import TableCard from '../../components/tables/TableCard';
import AddTableModal from '../../components/tables/AddTableModal';
import EditTableModal from '../../components/tables/EditTableModal';
import QRDisplayModal from '../../components/tables/QRDisplayModal';
import ConfirmModal from '../../components/common/ConfirmModal';
import Modal from '../../components/common/Modal';
import Button from '../../components/common/Button';
import Loader from '../../components/common/Loader';
import EmptyState from '../../components/common/EmptyState';
import SearchBar from '../../components/common/SearchBar';
import BranchRequiredState from '../../components/common/BranchRequiredState';
import { tableService } from '../../services/tableService';
import { useBranches } from '../../hooks/useBranches';
import { productService } from '../../services/productService';
import { menuService } from '../../services/menuService';
import { useAuth } from '../../hooks/useAuth';
import { FiPlus, FiShoppingCart, FiAlertTriangle, FiSearch } from 'react-icons/fi';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useCart } from '../../hooks/useCart';
import { OrderContext } from '../../context/OrderContext';
import TrackOrderModal from '../../components/orders/TrackOrderModal';
import OrderDetailsModal from '../../components/orders/OrderDetailsModal';
import EBillModal from '../../components/orders/EBillModal';
import Toast from '../../components/common/Toast';
import { orderService } from '../../services/orderService';

export const Tables = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { setTable, clearCart } = useCart();
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const { orders } = useContext(OrderContext);

  const statusFilterParam = (searchParams.get('status') || searchParams.get('filter') || '').toLowerCase();
  const isAvailableOnly = statusFilterParam === 'available';

  const { loading: branchesLoading, hasBranches, branches } = useBranches();
  const isSuperAdmin = user?.backendRole === 'SUPER_ADMIN' || user?.is_superuser || (user?.role === 'admin' && !user?.branchId);
  const [tables, setTables] = useState([]);
  const [loading, setLoading] = useState(true);
  const [hasDishes, setHasDishes] = useState(true);
  const [targetBranchId, setTargetBranchId] = useState(null);
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [editingTable, setEditingTable] = useState(null);
  const [deletingTable, setDeletingTable] = useState(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState('');
  const [qrModalTable, setQrModalTable] = useState(null);
  const [qrEnabled, setQrEnabled] = useState(true);
  const [tablesLoadError, setTablesLoadError] = useState('');
  const [vacateNotice, setVacateNotice] = useState(null);
  const [tableNotice, setTableNotice] = useState(null);
  const [trackingTable, setTrackingTable] = useState(null);

  const isFetchingRef = React.useRef(false);
  const lastBranchRef = React.useRef(typeof window !== 'undefined' ? (localStorage.getItem('foodie_admin_selected_branch') || '') : '');
  const [trackingOrder, setTrackingOrder] = useState(null);
  const [trackingLoading, setTrackingLoading] = useState(false);
  const [viewingBillOrder, setViewingBillOrder] = useState(null);

  useEffect(() => {
    const loadQr = () => {
      import('../../services/staffClient').then(({ staffJson }) => staffJson('/settings/'))
        .then((data) => setQrEnabled(data?.qr_enabled !== false))
        .catch(() => setQrEnabled(true));
    };
    loadQr();
    window.addEventListener('foodie_settings_updated', loadQr);
    return () => window.removeEventListener('foodie_settings_updated', loadQr);
  }, []);

  useEffect(() => {
    sessionStorage.removeItem('foodie_staff_ordering');
    (async () => {
      try {
        const { currentBranchId } = await import('../../services/adminApi');
        setTargetBranchId(await currentBranchId());
      } catch {
        setTargetBranchId(null);
      }
    })();
  }, [hasBranches]);

  const tablesAuthMessage = (err) => {
    if (!err) return 'Tables could not be loaded.';
    if (err.status === 401 || err.status === 403) {
      return 'You are not authorized to view tables. Please log in again.';
    }
    return err.message || 'Tables could not be loaded.';
  };

  const fetchTables = async () => {
    if (isFetchingRef.current) return;
    isFetchingRef.current = true;
    setLoading(true);
    setTablesLoadError('');
    try {
      const data = await tableService.getTables(targetBranchId);
      setTables(Array.isArray(data) ? data : []);
    } catch (e) {
      setTables([]);
      setTablesLoadError(tablesAuthMessage(e));
    }
    try {
      const [dishesData] = await Promise.all([
        productService.getProducts(true, targetBranchId).catch(() => []),
        menuService.getMenus(targetBranchId).catch(() => []),
      ]);
      const orderable = (dishesData || []).some((dish) => Number(dish.stock) > 0 && dish.status !== 'Out of Stock');
      setHasDishes(orderable);
    } catch {
      setHasDishes(true);
    } finally {
      setLoading(false);
      isFetchingRef.current = false;
    }
  };

  const fetchTablesSilently = async () => {
    try {
      const data = await tableService.getTables(targetBranchId);
      if (Array.isArray(data)) {
        setTables(data);
        setTablesLoadError('');
      }
    } catch (e) {
      setTablesLoadError(tablesAuthMessage(e));
    }
    try {
      const dishesData = await productService.getProducts(true, targetBranchId).catch(() => []);
      const orderable = (dishesData || []).some((dish) => Number(dish.stock) > 0 && dish.status !== 'Out of Stock');
      setHasDishes(orderable);
    } catch {
      /* keep the last known dish availability */
    }
  };

  useEffect(() => {
    fetchTables();
    const handleUpdated = () => fetchTablesSilently();
    const handleBranchSync = (e) => {
      const nextBranch = String(e?.detail?.branchId ?? localStorage.getItem('foodie_admin_selected_branch') ?? '');
      if (lastBranchRef.current === nextBranch) return;
      lastBranchRef.current = nextBranch;
      if (e?.detail?.branchId && e.detail.branchId !== 'ALL') {
        setTargetBranchId(Number(e.detail.branchId));
      } else {
        setTargetBranchId(null);
      }
      fetchTables();
    };
    window.addEventListener('foodie_tables_updated', handleUpdated);
    window.addEventListener('foodie_orders_updated', handleUpdated);
    window.addEventListener('foodie_branch_selected', handleBranchSync);
    window.addEventListener('storage', handleUpdated);
    return () => {
      window.removeEventListener('foodie_tables_updated', handleUpdated);
      window.removeEventListener('foodie_orders_updated', handleUpdated);
      window.removeEventListener('foodie_branch_selected', handleBranchSync);
      window.removeEventListener('storage', handleUpdated);
    };
  }, []);

  const handleAddTable = async (tableData) => {
    if (!isAdmin || !hasBranches) return;
    await tableService.createTable(tableData);
    await fetchTablesSilently();
  };

  const handleEditSave = async (id, tableData) => {
    if (!isAdmin) return;
    await tableService.updateTable(id, tableData);
    await fetchTablesSilently();
  };

  const handleDeleteConfirm = async () => {
    if (!isAdmin || !deletingTable || deleteBusy) return;
    setDeleteBusy(true);
    setDeleteError('');
    try {
      await tableService.deleteTable(deletingTable.id);
      setDeletingTable(null);
      await fetchTablesSilently();
    } catch (e) {
      setDeleteError(e.message || 'The table could not be deleted.');
    } finally {
      setDeleteBusy(false);
    }
  };

  const handleStatusChange = async (id, status) => {
    const table = tables.find((row) => String(row.id) === String(id));
    const tableNumber = tableService.getCanonicalTableNumber(table?.number || table?.table_number || id);
    try {
      await tableService.updateTableStatus(id, status);
      await fetchTablesSilently();
    } catch (e) {
      await fetchTablesSilently();
      const unfinished = e.code === 'unfinished_orders' || /unfinished orders/i.test(e.message || '');
      const vacating = String(status).toLowerCase() === 'available';
      if (vacating && unfinished) {
        setVacateNotice({
          title: 'Cannot Vacate Table',
          message: 'This table has unfinished orders and cannot be vacated yet.',
          tableNumber,
          showViewOrders: true,
        });
        return;
      }
      setVacateNotice({
        title: vacating ? 'Cannot Vacate Table' : 'Table status could not be changed',
        message: e.message || 'The table status could not be changed.',
        tableNumber,
        showViewOrders: false,
      });
    }
  };

  const sameBranchTables = (branchId) => (branchId ? tables.filter((t) => String(t.branch) === String(branchId)) : tables);

  const startStaffOrder = async ({ orderType, table }) => {
    const targetUrl = isAdmin ? '/admin/pos' : '/employee/pos';
    if (orderType === 'DINE_IN' && table?.id) {
      navigate(`${targetUrl}?table=${table.id}`);
    } else {
      navigate(`${targetUrl}?type=takeaway`);
    }
  };

  const loadTrackingForTable = async (orderId, table) => {
    setTrackingLoading(true);
    setTrackingTable(table);
    try {
      const { fetchBillPreview, staffJson } = await import('../../services/adminApi');
      let orderData = null;
      try {
        orderData = await staffJson(`/orders/${orderId}/`);
      } catch (e) {
        try {
          orderData = await orderService.getOrderById(orderId);
        } catch (innerErr) {
          orderData = table?.active_order || (orders || []).find(o => String(o.id) === String(orderId)) || null;
        }
      }
      if (!orderData && table?.active_order) {
        orderData = table.active_order;
      }
      let combined = null;
      try {
        combined = await fetchBillPreview(orderId);
      } catch (e) {}

      const rawOrd = orderData || {};
      const mapped = {
        ...rawOrd,
        id: rawOrd.id || orderId,
        table: tableService.getCanonicalTableNumber(table?.number || table?.table_number || table?.id || rawOrd.table),
        tableNumber: tableService.getCanonicalTableNumber(table?.number || table?.table_number || table?.id || rawOrd.table),
        tableLocation: table?.location || table?.area || rawOrd.location || '',
        tableId: table?.id || rawOrd.table_id || rawOrd.tableId || null,
        table_id: table?.id || rawOrd.table_id || rawOrd.tableId || null,
        status: rawOrd.status || rawOrd.backendStatus || 'Pending',
        display_order_number: rawOrd.display_order_number || rawOrd.display_number || String(orderId),
        ...(combined ? {
          combined_items: combined.items,
          items: combined.items || rawOrd.items,
          combined_total: combined.total_amount,
          total: combined.total_amount || rawOrd.total,
          total_amount: combined.total_amount || rawOrd.total_amount,
          combined_items_subtotal: combined.items_subtotal,
          paid_amount: combined.paid_amount,
          balance_due: combined.balance_due,
          has_continuations: combined.has_continuations,
          display_order_number: combined.display_order_number || rawOrd.display_order_number || rawOrd.display_number || String(orderId),
        } : {}),
      };
      setTrackingOrder(mapped);
    } catch (err) {
      console.error('Error loading order for tracking:', err);
      if (table?.active_order) {
        setTrackingOrder({
          ...table.active_order,
          id: orderId,
          table: tableService.getCanonicalTableNumber(table.number || table.table_number || table.id),
          tableNumber: tableService.getCanonicalTableNumber(table.number || table.table_number || table.id),
          tableLocation: table.location || table.area || '',
          tableId: table.id,
          table_id: table.id,
          display_order_number: table.active_order.display_order_number || String(orderId),
        });
      } else {
        const canonTableNum = tableService.getCanonicalTableNumber(table?.number || table?.table_number || table?.id);
        setTableNotice({
          title: 'Order Details Unavailable',
          message: `Failed to load order details for Table ${canonTableNum}. Please check the Orders screen.`,
          tableNumber: canonTableNum,
        });
        setTrackingTable(null);
        setTrackingOrder(null);
      }
    } finally {
      setTrackingLoading(false);
    }
  };

  const handleTrackTableOrder = async (table) => {
    let activeOrderId = table.active_order_id || (table.active_order && table.active_order.id);
    if (!activeOrderId) {
      // Find from orders context if not directly on table
      const activeOrd = (orders || []).find(o => {
        if (!o) return false;
        const isNonTable = String(o.order_type || o.orderType || '').toUpperCase() === 'TAKEAWAY' ||
          String(o.order_type || o.orderType || '').toUpperCase() === 'SELF_SERVICE' ||
          String(o.table || '').toLowerCase() === 'takeaway' ||
          String(o.table || '').toLowerCase() === 'self service';
        if (isNonTable) return false;
        const INACTIVE = ['completed', 'cancelled', 'canceled', 'done', 'settled', 'delivered', 'rejected', 'void'];
        if (INACTIVE.includes(String(o.status || '').toLowerCase().trim())) return false;
        const tId = String(o.table_id || o.tableId || (typeof o.table === 'object' ? o.table?.id : (typeof o.table === 'number' ? o.table : ''))).trim();
        const oCanon = tableService.getCanonicalTableNumber(o.tableNumber || o.table_number || o.table || '');
        const tCanon = tableService.getCanonicalTableNumber(table.number || table.table_number || table.id);
        return (tId && tId === String(table.id)) || (oCanon && oCanon === tCanon);
      });
      if (activeOrd?.id) {
        activeOrderId = activeOrd.parent_order_id || activeOrd.parent_order || activeOrd.id;
      }
    }

    if (!activeOrderId && (table.status === 'Occupied' || table.status === 'OCCUPIED' || table.is_occupied)) {
      // If table is Occupied, check orders list for the latest non-cancelled session root on this table
      const sessionOrd = (orders || []).find(o => {
        if (!o) return false;
        const isNonTable = String(o.order_type || o.orderType || '').toUpperCase() === 'TAKEAWAY' ||
          String(o.order_type || o.orderType || '').toUpperCase() === 'SELF_SERVICE' ||
          String(o.table || '').toLowerCase() === 'takeaway' ||
          String(o.table || '').toLowerCase() === 'self service';
        if (isNonTable) return false;
        const s = String(o.status || '').toLowerCase().trim();
        if (s === 'cancelled' || s === 'canceled' || s === 'rejected') return false;
        const tId = String(o.table_id || o.tableId || (typeof o.table === 'object' ? o.table?.id : (typeof o.table === 'number' ? o.table : ''))).trim();
        const oCanon = tableService.getCanonicalTableNumber(o.tableNumber || o.table_number || o.table || '');
        const tCanon = tableService.getCanonicalTableNumber(table.number || table.table_number || table.id);
        return (tId && tId === String(table.id)) || (oCanon && oCanon === tCanon);
      });
      if (sessionOrd?.id) {
        activeOrderId = sessionOrd.parent_order_id || sessionOrd.parent_order || sessionOrd.id;
      }
    }

    if (!activeOrderId) {
      const canonTableNum = tableService.getCanonicalTableNumber(table.number || table.table_number || table.id);
      setTableNotice({
        title: 'Active Order Not Found',
        message: `No active order or dining session could be retrieved for Table ${canonTableNum}. The session may have already been settled or cancelled.`,
        tableNumber: canonTableNum,
      });
      return;
    }
    await loadTrackingForTable(activeOrderId, table);
  };

  const handleContinueFromModal = (ord) => {
    const rawStatus = String(ord?.backendStatus || ord?.status || '').toUpperCase();
    if (rawStatus === 'COMPLETED' || rawStatus === 'CANCELLED') {
      setTableNotice({
        title: 'Session Billed',
        message: 'This order has already proceeded to bill and cannot accept additional items.',
      });
      return;
    }
    const targetTableId = ord?.tableId || ord?.table_id || trackingTable?.id;
    const targetOrderId = ord?.parent_order_id || ord?.parent_order || ord?.id;
    const rawPhone = ord?.customer_phone || ord?.customerPhone || ord?.customer?.phone || trackingTable?.active_order?.customer_phone || '';
    const rawName = ord?.customer_name || ord?.customerName || ord?.customer?.name || trackingTable?.active_order?.customer_name || '';
    setTrackingTable(null);
    setTrackingOrder(null);
    const targetUrl = isAdmin ? '/admin/pos' : '/employee/pos';
    const params = new URLSearchParams();
    if (targetTableId) params.set('table', targetTableId);
    if (targetOrderId) params.set('order', targetOrderId);
    params.set('continue', '1');
    if (rawPhone) params.set('phone', rawPhone);
    if (rawName) params.set('name', rawName);
    navigate(`${targetUrl}?${params.toString()}`);
  };

  const handleProceedToBillFromModal = (ord) => {
    setTrackingTable(null);
    setTrackingOrder(null);
    const rootId = ord?.parent_order_id || ord?.parent_order || ord?.id;
    if (!rootId) return;
    const targetUrl = isAdmin ? '/admin/orders' : '/employee/orders';
    navigate(`${targetUrl}?orderId=${rootId}`);
  };

  const handleTakeOrder = async (table) => {
    if (table.is_active === false) {
      setTableNotice({
        title: 'Table Inactive',
        message: 'This table is currently inactive and cannot take a new order.',
      });
      return;
    }
    const targetUrl = isAdmin ? '/admin/pos' : '/employee/pos';
    const activeOrderId = table.active_order_id || (table.active_order && table.active_order.id);
    if ((table.status === 'Occupied' || table.status === 'OCCUPIED' || table.is_occupied) && activeOrderId) {
      const rawStatus = String(table.active_order?.status || '').toUpperCase();
      if (rawStatus === 'COMPLETED' || rawStatus === 'CANCELLED') {
        // Open the order tracking modal so staff can see the completed order and view invoice
        return handleTrackTableOrder(table);
      }
      const activePhone = table.active_order?.customer_phone || table.active_order?.customerPhone || '';
      const activeName = table.active_order?.customer_name || table.active_order?.customerName || '';
      const params = new URLSearchParams();
      params.set('table', table.id);
      params.set('order', activeOrderId);
      params.set('continue', '1');
      if (activePhone) params.set('phone', activePhone);
      if (activeName) params.set('name', activeName);
      navigate(`${targetUrl}?${params.toString()}`);
      return;
    }
    navigate(`${targetUrl}?table=${table.id}`);
  };

  const handleQrRefresh = (tableId, newStatus) => {
    if (tableId != null) {
      setTables((prev) => prev.map((t) => (t.id === tableId ? { ...t, qr_is_active: newStatus } : t)));
      if (qrModalTable?.id === tableId) {
        setQrModalTable((prev) => (prev ? { ...prev, qr_is_active: newStatus } : prev));
      }
    }
  };

  const [selectedLocation, setSelectedLocation] = useState('ALL');
  const [selectedStatusFilter, setSelectedStatusFilter] = useState('ALL');

  const uniqueLocations = Array.from(new Set(tables.map(t => t.location || t.area || 'Indoor').filter(Boolean)));

  const ONGOING_ORDER_STATUSES = ['pending', 'preparing', 'ready', 'serving', 'in_progress', 'accepted'];

  const getActiveOrderForTable = (table) => {
    // 1. Authoritative active order from backend table object
    if (table.active_order) {
      return table.active_order;
    }
    // 2. If table is available, never associate with past closed orders
    if (table.status === 'Available' || table.status === 'AVAILABLE' || table.status === 'Reserved' || table.status === 'RESERVED') {
      return null;
    }
    // 3. Fallback for occupied tables matching loaded orders
    const canonNum = tableService.getCanonicalTableNumber(table.number || table.table_number || table.id);
    const tableIdStr = String(table.id || '').trim();
    return (orders || []).find(o => {
      if (!o) return false;
      const isNonTable = String(o.order_type || o.orderType || '').toUpperCase() === 'TAKEAWAY' ||
        String(o.order_type || o.orderType || '').toUpperCase() === 'SELF_SERVICE' ||
        String(o.table || '').toLowerCase() === 'takeaway' ||
        String(o.table || '').toLowerCase() === 'self service';
      if (isNonTable) return false;
      const s = String(o.status || '').toLowerCase().trim();
      if (!ONGOING_ORDER_STATUSES.includes(s) && s !== 'completed') return false;

      const rawVal = o.tableNumber || o.table_number || o.table_no || (typeof o.table === 'object' ? (o.table?.number || o.table?.table_number || o.table?.id) : o.table);
      const oCanon = tableService.getCanonicalTableNumber(rawVal || '');
      const oTableId = String(o.table_id || o.tableId || (typeof o.table === 'object' ? o.table?.id : (typeof o.table === 'number' ? o.table : ''))).trim();

      return (oCanon && oCanon === canonNum) || (tableIdStr && oTableId && tableIdStr === oTableId);
    });
  };

  const isTableOccupied = (t) => {
    // The backend DiningTable.status and has_active_order is the single authoritative source of truth.
    // An Available table is clean and available - never override with stale orders from previous screens.
    return t.status === 'Occupied' || t.status === 'OCCUPIED' || Boolean(t.is_occupied) || Boolean(t.has_active_order);
  };

  const availableCount = tables.filter(t => !isTableOccupied(t) && t.status !== 'Inactive').length;
  const occupiedCount = tables.filter(t => isTableOccupied(t)).length;

  const [searchQuery, setSearchQuery] = useState('');

  const filteredTables = tables.filter((t) => {
    if (targetBranchId && targetBranchId !== 'ALL') {
      const bId = t.branch?.id || t.branch || t.branch_id;
      if (!bId || String(bId) !== String(targetBranchId)) return false;
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      const num = String(t.number || t.table_number || '').toLowerCase();
      const loc = String(t.location || t.area || '').toLowerCase();
      if (!num.includes(q) && !loc.includes(q) && !('t' + num).includes(q)) return false;
    }
    if (selectedLocation !== 'ALL') {
      const loc = t.location || t.area || 'Indoor';
      if (loc !== selectedLocation) return false;
    }
    const occupied = isTableOccupied(t);
    if (selectedStatusFilter === 'available') {
      return !occupied;
    }
    if (selectedStatusFilter === 'occupied') {
      return occupied;
    }
    if (isAvailableOnly) {
      return !occupied;
    }
    return true;
  });

  const branchGroups = filteredTables.reduce((groups, t) => {
    const key = String(t.branch || '');
    if (!groups.has(key)) groups.set(key, { name: t.branch_name || 'Branch', tables: [] });
    groups.get(key).tables.push(t);
    return groups;
  }, new Map());
  const showBranchHeadings = branchGroups.size > 1;

  if ((loading || branchesLoading) && (!tables || tables.length === 0)) {
    return (
      <AdminLayout contentClassName="p-0">
        <div className="tables-page-container">
          <Loader />
        </div>
      </AdminLayout>
    );
  }

  if (!hasBranches) {
    return (
      <AdminLayout contentClassName="p-0">
        <div className="tables-page-container">
          <PageHeader title="Manage Tables" showBackButton />
          <BranchRequiredState />
        </div>
      </AdminLayout>
    );
  }

  const handleTakeawayOrder = async () => {
    if (!hasDishes) {
      setTableNotice({
        title: 'Takeaway Ordering Unavailable',
        message: 'Takeaway ordering is unavailable because no dishes are currently available.',
      });
      return;
    }
    try {
      await startStaffOrder({ orderType: 'TAKEAWAY' });
    } catch (err) {
      setTableNotice({
        title: 'Takeaway Order Error',
        message: err.message || 'Takeaway ordering could not be started.',
      });
    }
  };

  if (!loading && tablesLoadError) {
    return (
      <AdminLayout contentClassName="p-0">
        <div className="tables-page-container">
          <PageHeader title="Manage Tables" showBackButton />
          <EmptyState
            title="Tables could not be loaded"
            description={tablesLoadError}
            icon="bi-exclamation-triangle"
          />
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout contentClassName="p-0">
      <div className="tables-page-container">
        <PageHeader 
          title="Tables" 
          showBackButton
          actions={
            <div className="d-flex align-items-center gap-3 flex-wrap">
              <SearchBar
                placeholder="Search table (e.g., T1)..."
                value={searchQuery}
                onChange={setSearchQuery}
                records={(tables || []).map(t => ({
                  id: t.id,
                  label: tableService.getCanonicalTableNumber(t.number || t.table_number || t.id),
                  title: `Table ${tableService.getCanonicalTableNumber(t.number || t.table_number || t.id)}`,
                  subtitle: `${t.location || 'Indoor'} • ${t.capacity || 4} Seats`,
                }))}
                style={{ width: '280px', height: '42px' }}
              />
              {isAdmin && hasBranches && (
                <Button 
                  onClick={() => setIsAddOpen(true)} 
                  variant="primary" 
                  className="d-flex align-items-center gap-2 py-2 px-3.5 rounded-pill fw-bold shadow-xs ms-2"
                  style={{ height: '42px', fontSize: '13px' }}
                >
                  <FiPlus /> Add Table
                </Button>
              )}
            </div>
          }
        />



        {/* 2 KPI Stat Cards & Filter Toolbar (Matches Reference Screenshot 1) */}
        <div className="row g-3 mb-4 align-items-center">
          {/* Stat Card 1: Available Tables */}
          <div className="col-12 col-sm-6 col-lg-3">
            <div 
              className="card h-100 p-3 rounded-4 shadow-xs border bg-white d-flex flex-row align-items-center gap-3 transition-all"
              style={{ 
                borderColor: selectedStatusFilter === 'available' ? '#16A34A' : '#E2E8F0', 
                cursor: 'pointer',
                backgroundColor: selectedStatusFilter === 'available' ? '#F6FBF7' : '#FFFFFF'
              }}
              onClick={() => setSelectedStatusFilter(selectedStatusFilter === 'available' ? 'ALL' : 'available')}
            >
              <div 
                className="rounded-circle d-flex align-items-center justify-content-center flex-shrink-0"
                style={{ width: '48px', height: '48px', backgroundColor: '#DCFCE7', color: '#16A34A' }}
              >
                <svg width="24" height="20" viewBox="0 0 24 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <ellipse cx="12" cy="7" rx="10" ry="4" />
                  <path d="M5 9V17" />
                  <path d="M19 9V17" />
                  <path d="M12 11V18" />
                </svg>
              </div>
              <div className="flex-grow-1 text-start">
                <div className="text-secondary small fw-medium" style={{ fontSize: '12px' }}>Available Tables</div>
                <div className="fw-bold text-dark fs-3 mb-0.5">{availableCount}</div>
                <span className="badge rounded-pill fw-bold p-1 d-inline-flex align-items-center justify-content-center" style={{ width: "20px", height: "20px", backgroundColor: "#DCFCE7" }} title="Available"><span className="rounded-circle" style={{ width: "6px", height: "6px", backgroundColor: "#16A34A" }}></span></span>
              </div>
            </div>
          </div>

          {/* Stat Card 2: Occupied Tables */}
          <div className="col-12 col-sm-6 col-lg-3">
            <div 
              className="card h-100 p-3 rounded-4 shadow-xs border bg-white d-flex flex-row align-items-center gap-3 transition-all"
              style={{ 
                borderColor: selectedStatusFilter === 'occupied' ? '#DC2626' : '#E2E8F0', 
                cursor: 'pointer',
                backgroundColor: selectedStatusFilter === 'occupied' ? '#FFF6F6' : '#FFFFFF'
              }}
              onClick={() => setSelectedStatusFilter(selectedStatusFilter === 'occupied' ? 'ALL' : 'occupied')}
            >
              <div 
                className="rounded-circle d-flex align-items-center justify-content-center flex-shrink-0"
                style={{ width: '48px', height: '48px', backgroundColor: '#FEE2E2', color: '#DC2626' }}
              >
                <svg width="24" height="20" viewBox="0 0 24 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <ellipse cx="12" cy="7" rx="10" ry="4" />
                  <path d="M5 9V17" />
                  <path d="M19 9V17" />
                  <path d="M12 11V18" />
                </svg>
              </div>
              <div className="flex-grow-1 text-start">
                <div className="text-secondary small fw-medium" style={{ fontSize: '12px' }}>Occupied Tables</div>
                <div className="fw-bold text-dark fs-3 mb-0.5">{occupiedCount}</div>
                <span className="badge rounded-pill fw-bold p-1 d-inline-flex align-items-center justify-content-center" style={{ width: "20px", height: "20px", backgroundColor: "#FEE2E2" }} title="Occupied"><span className="rounded-circle" style={{ width: "6px", height: "6px", backgroundColor: "#DC2626" }}></span></span>
              </div>
            </div>
          </div>

        </div>

        {/* Grid */}
        {loading ? (
          <Loader />
        ) : tablesLoadError ? (
          <EmptyState
            title="Tables could not be loaded"
            description={tablesLoadError}
            icon="bi-exclamation-triangle"
          />
        ) : filteredTables.length === 0 ? (
          <EmptyState
            title="No Tables Found"
            description="There are no available tables right now."
            icon="bi-border-all"
          />
        ) : (
          Array.from(branchGroups.entries()).map(([branchKey, group]) => (
            <div key={branchKey} className="mb-4">
              {showBranchHeadings && <h6 className="fw-bold text-dark mb-3">{group.name}</h6>}
              <div className="tables-grid">
                {group.tables.map((table) => {
                  const activeOrderForTable = getActiveOrderForTable(table);
                  const isTableOccupiedWithOrder = isTableOccupied(table);
                  const effectiveTable = {
                    ...table,
                    status: isTableOccupiedWithOrder ? 'Occupied' : (table.status === 'Reserved' ? 'Reserved' : 'Available')
                  };
                  return (
                    <TableCard
                      key={table.id}
                      table={effectiveTable}
                      onSelect={handleTakeOrder}
                      onTrackOrder={handleTrackTableOrder}
                      onStatusChange={handleStatusChange}
                      onEdit={(t) => setEditingTable(t)}
                      onDelete={(t) => { setDeleteError(''); setDeletingTable(t); }}
                      onViewQR={qrEnabled ? (t) => setQrModalTable(t) : undefined}
                      isAdmin={isAdmin}
                      showActions
                      hasDishes={hasDishes}
                      hasActiveOrder={isTableOccupiedWithOrder}
                    />
                  );
                })}
              </div>
            </div>
          ))
        )}

      {/* Modals */}
      {isAdmin && isAddOpen && (
        <AddTableModal
          isOpen={isAddOpen}
          existingTables={sameBranchTables(targetBranchId)}
          branches={branches}
          initialBranchId={targetBranchId}
          isSuperAdmin={isSuperAdmin}
          onClose={() => setIsAddOpen(false)}
          onAdd={handleAddTable}
        />
      )}

      {isAdmin && editingTable && (
        <EditTableModal
          isOpen={!!editingTable}
          table={editingTable}
          existingTables={sameBranchTables(editingTable.branch)}
          onClose={() => setEditingTable(null)}
          onSave={handleEditSave}
        />
      )}

      {qrEnabled && qrModalTable && (
        <QRDisplayModal
          isOpen={!!qrModalTable}
          table={qrModalTable}
          onClose={() => setQrModalTable(null)}
          onRefresh={handleQrRefresh}
        />
      )}

      {isAdmin && deletingTable && (
        <ConfirmModal
          isOpen={!!deletingTable}
          title="Delete Table"
          message={deleteError
            ? deleteError
            : `Delete Table ${deletingTable.number || deletingTable.id}? Past orders keep the table number. A table with an order in progress cannot be deleted.`}
          confirmText="Delete Table"
          loading={deleteBusy}
          onConfirm={handleDeleteConfirm}
          onClose={() => { if (!deleteBusy) { setDeletingTable(null); setDeleteError(''); } }}
        />
      )}

      <Modal
        isOpen={Boolean(vacateNotice)}
        title={vacateNotice?.title || 'Cannot Vacate Table'}
        onClose={() => setVacateNotice(null)}
        size="sm"
        footerActions={(
          <>
            {vacateNotice?.showViewOrders && (
              <Button
                variant="outline"
                onClick={() => {
                  setVacateNotice(null);
                  navigate(user?.role === 'admin' ? '/admin/kitchen' : '/employee/kitchen');
                }}
              >
                View Orders
              </Button>
            )}
            <Button variant="primary" onClick={() => setVacateNotice(null)}>
              Close
            </Button>
          </>
        )}
      >
        <div className="text-center px-2">
          <div className="d-inline-flex align-items-center justify-content-center rounded-circle mb-3" style={{ width: 56, height: 56, background: '#fee2e2' }}>
            <FiAlertTriangle size={28} className="text-danger" />
          </div>
          <p className="text-secondary small mb-2">{vacateNotice?.message}</p>
          {vacateNotice?.tableNumber && (
            <p className="fw-bold text-dark mb-0">Table {vacateNotice.tableNumber}</p>
          )}
        </div>
      </Modal>

      <Modal
        isOpen={Boolean(tableNotice)}
        title={tableNotice?.title || 'Table Notice'}
        onClose={() => setTableNotice(null)}
        size="sm"
        footerActions={(
          <Button variant="primary" onClick={() => setTableNotice(null)}>
            Close
          </Button>
        )}
      >
        <div className="text-center px-2">
          <div className="d-inline-flex align-items-center justify-content-center rounded-circle mb-3" style={{ width: 56, height: 56, background: '#fee2e2' }}>
            <FiAlertTriangle size={28} className="text-danger" />
          </div>
          <p className="text-secondary small mb-2">{tableNotice?.message}</p>
          {tableNotice?.tableNumber && (
            <p className="fw-bold text-dark mb-0">Table {tableNotice.tableNumber}</p>
          )}
        </div>
      </Modal>

      {/* Order Details Popup Modal (Triggered by Eye Icon on Occupied Tables) */}
      {trackingTable && trackingOrder && (
        <OrderDetailsModal
          isOpen={Boolean(trackingTable && trackingOrder)}
          order={trackingOrder}
          onClose={() => {
            setTrackingTable(null);
            setTrackingOrder(null);
          }}
          onStatusChange={async () => {
            fetchTables();
            setTrackingTable(null);
            setTrackingOrder(null);
          }}
          onContinueOrder={handleContinueFromModal}
          onViewEBill={(ord) => setViewingBillOrder(ord)}
          onOrderUpdated={() => fetchTables()}
        />
      )}

      {/* Combined E-Bill Modal */}
      {viewingBillOrder && (
        <EBillModal
          isOpen={Boolean(viewingBillOrder)}
          order={viewingBillOrder}
          onClose={() => setViewingBillOrder(null)}
          onProceedToBill={async (ord) => {
            const targetOrder = ord || viewingBillOrder;
            if (!targetOrder) return;
            const targetId = targetOrder.backendOrderId || targetOrder.id || targetOrder.order_id;
            if (!targetId) return;
            try {
              const { proceedToBill } = await import('../../services/adminApi');
              await proceedToBill(targetId);
              window.dispatchEvent(new CustomEvent('foodie_orders_updated', { detail: { orderId: targetId, status: 'Completed' } }));
              window.dispatchEvent(new CustomEvent('foodie_tables_updated', { detail: { orderId: targetId } }));
              fetchTables();
              setViewingBillOrder(prev => prev ? { ...prev, status: 'Completed', backendStatus: 'COMPLETED' } : null);
              setTableNotice({
                title: 'Order Completed',
                message: `Order #${targetOrder.orderNumber || targetOrder.display_order_number || targetId} has been marked as Completed.`,
              });
            } catch (err) {
              console.error('Failed to complete order on Proceed to Bill:', err);
              const msg = err?.response?.data?.detail || err?.message || 'Could not complete order.';
              setTableNotice({
                title: 'Proceed to Bill Error',
                message: msg,
              });
              throw err;
            }
          }}
        />
      )}
      </div>
    </AdminLayout>
  );
};
export default Tables;


