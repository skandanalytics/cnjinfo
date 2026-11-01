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
import BranchRequiredState from '../../components/common/BranchRequiredState';
import { tableService } from '../../services/tableService';
import { useBranches } from '../../hooks/useBranches';
import { productService } from '../../services/productService';
import { menuService } from '../../services/menuService';
import { useAuth } from '../../hooks/useAuth';
import { FiPlus, FiShoppingCart, FiAlertTriangle } from 'react-icons/fi';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useCart } from '../../hooks/useCart';
import { OrderContext } from '../../context/OrderContext';
import TrackOrderModal from '../../components/orders/TrackOrderModal';
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

  const { loading: branchesLoading, hasBranches } = useBranches();
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
  const [trackingTable, setTrackingTable] = useState(null);
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
    setLoading(true);
    setTablesLoadError('');
    try {
      const data = await tableService.getTables();
      setTables(Array.isArray(data) ? data : []);
    } catch (e) {
      setTables([]);
      setTablesLoadError(tablesAuthMessage(e));
    }
    try {
      const [dishesData] = await Promise.all([
        productService.getProducts(true).catch(() => []),
        menuService.getMenus().catch(() => []),
      ]);
      const orderable = (dishesData || []).some((dish) => Number(dish.stock) > 0 && dish.status !== 'Out of Stock');
      setHasDishes(orderable);
    } catch {
      setHasDishes(true);
    }
    setLoading(false);
  };

  const fetchTablesSilently = async () => {
    try {
      const data = await tableService.getTables();
      if (Array.isArray(data)) {
        setTables(data);
        setTablesLoadError('');
      }
    } catch (e) {
      setTablesLoadError(tablesAuthMessage(e));
    }
    try {
      const dishesData = await productService.getProducts(true).catch(() => []);
      const orderable = (dishesData || []).some((dish) => Number(dish.stock) > 0 && dish.status !== 'Out of Stock');
      setHasDishes(orderable);
    } catch {
      /* keep the last known dish availability */
    }
  };

  useEffect(() => {
    fetchTables();
    const handleUpdated = () => fetchTablesSilently();
    window.addEventListener('foodie_tables_updated', handleUpdated);
    window.addEventListener('foodie_orders_updated', handleUpdated);
    window.addEventListener('storage', handleUpdated);
    return () => {
      window.removeEventListener('foodie_tables_updated', handleUpdated);
      window.removeEventListener('foodie_orders_updated', handleUpdated);
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
        window.alert('Failed to load order details for this table.');
        setTrackingTable(null);
        setTrackingOrder(null);
      }
    } finally {
      setTrackingLoading(false);
    }
  };

  const handleTrackTableOrder = async (table) => {
    const activeOrderId = table.active_order_id || (table.active_order && table.active_order.id);
    if (!activeOrderId) {
      // Find from orders context if not directly on table
      const activeOrd = (orders || []).find(o => {
        if (!o) return false;
        const INACTIVE = ['completed', 'cancelled', 'canceled', 'done', 'settled', 'delivered', 'rejected', 'void'];
        if (INACTIVE.includes(String(o.status || '').toLowerCase().trim())) return false;
        const tId = String(o.table_id || o.tableId || (typeof o.table === 'object' ? o.table?.id : (typeof o.table === 'number' ? o.table : ''))).trim();
        const oCanon = tableService.getCanonicalTableNumber(o.tableNumber || o.table_number || o.table || '');
        const tCanon = tableService.getCanonicalTableNumber(table.number || table.table_number || table.id);
        return (tId && tId === String(table.id)) || (oCanon && oCanon === tCanon);
      });
      if (activeOrd?.id) {
        return loadTrackingForTable(activeOrd.id, table);
      }
      window.alert('No active order found for this table.');
      return;
    }
    await loadTrackingForTable(activeOrderId, table);
  };

  const handleContinueFromModal = (ord) => {
    const rawStatus = String(ord?.backendStatus || ord?.status || '').toUpperCase();
    if (rawStatus === 'COMPLETED' || rawStatus === 'CANCELLED') {
      window.alert('This order has proceeded to bill and cannot be continued.');
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

  const handleProceedToBillFromModal = async (ord) => {
    setTrackingTable(null);
    setTrackingOrder(null);
    try {
      const { fetchBillPreview } = await import('../../services/adminApi');
      const rootId = ord.parent_order_id || ord.parent_order || ord.id;
      const preview = await fetchBillPreview(rootId);
      setViewingBillOrder({
        ...ord,
        ...preview,
        items: preview.items || ord.items,
        combined_items: preview.items,
        total: preview.total_amount || ord.total,
        total_amount: preview.total_amount || ord.total_amount,
      });
    } catch (e) {
      setViewingBillOrder(ord);
    }
  };

  const handleTakeOrder = async (table) => {
    if (table.is_active === false) {
      window.alert('This table is inactive and cannot take a new order.');
      return;
    }
    const targetUrl = isAdmin ? '/admin/pos' : '/employee/pos';
    const activeOrderId = table.active_order_id || (table.active_order && table.active_order.id);
    if ((table.status === 'Occupied' || table.is_occupied) && activeOrderId) {
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

  const availableCount = tables.filter(t => {
    const isOccupied = t.status === 'Occupied' || t.is_occupied;
    return !isOccupied && t.status !== 'Inactive';
  }).length;

  const occupiedCount = tables.filter(t => t.status === 'Occupied' || t.is_occupied).length;

  const filteredTables = tables.filter((t) => {
    if (selectedLocation !== 'ALL') {
      const loc = t.location || t.area || 'Indoor';
      if (loc !== selectedLocation) return false;
    }
    const isOccupied = t.status === 'Occupied' || t.is_occupied;
    if (selectedStatusFilter === 'available') {
      return !isOccupied;
    }
    if (selectedStatusFilter === 'occupied') {
      return isOccupied;
    }
    if (isAvailableOnly) {
      return !isOccupied;
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
      window.alert('Takeaway ordering is unavailable because no dishes are currently available.');
      return;
    }
    try {
      await startStaffOrder({ orderType: 'TAKEAWAY' });
    } catch (err) {
      window.alert(err.message || 'Takeaway ordering could not be started.');
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
            <div className="d-flex align-items-center gap-2">
              <Button 
                onClick={handleTakeawayOrder} 
                variant="outline" 
                disabled={!hasDishes}
                title={hasDishes ? 'Start a takeaway order' : 'Takeaway ordering is unavailable because no dishes are currently available.'}
                className="d-flex align-items-center gap-2 py-2 px-3 fw-bold bg-white text-danger border-danger shadow-xs rounded-pill"
                style={{ fontSize: '13px' }}
              >
                <FiShoppingCart /> Takeaway Order
              </Button>
              {isAdmin && hasBranches && (
                <Button 
                  onClick={() => setIsAddOpen(true)} 
                  variant="primary" 
                  className="d-flex align-items-center gap-2 py-2 px-3.5 rounded-pill fw-bold"
                  style={{ fontSize: '13px' }}
                >
                  <FiPlus /> Add Table
                </Button>
              )}
            </div>
          }
        />

        {/* Panel 9 Filter Toolbar: Location display boxes & Status pills */}
        <div className="card rounded-4 border-0 shadow-sm p-3 mb-4 bg-white d-flex flex-row align-items-center justify-content-between flex-wrap gap-3">
          <div className="d-flex align-items-center gap-2 flex-wrap">
            <span className="small fw-bold text-dark me-1" style={{ fontSize: '13px' }}>
              Locations:
            </span>
            <button
              type="button"
              onClick={() => setSelectedLocation('ALL')}
              className={`btn btn-sm rounded-3 px-3 py-1.5 fw-semibold transition-all d-flex align-items-center gap-1.5 ${
                selectedLocation === 'ALL'
                  ? 'btn-danger text-white shadow-xs'
                  : 'bg-light text-dark border border-light-subtle shadow-2xs'
              }`}
              style={{ fontSize: '12.5px', cursor: 'pointer' }}
            >
              <span>All Locations</span>
            </button>
            {uniqueLocations.map(loc => (
              <button
                key={loc}
                type="button"
                onClick={() => setSelectedLocation(selectedLocation === loc ? 'ALL' : loc)}
                className={`btn btn-sm rounded-3 px-3 py-1.5 fw-semibold transition-all d-flex align-items-center gap-1.5 ${
                  selectedLocation === loc
                    ? 'btn-danger text-white shadow-xs'
                    : 'bg-light text-dark border border-light-subtle shadow-2xs'
                }`}
                style={{ fontSize: '12.5px', cursor: 'pointer' }}
              >
                <i className={`bi bi-geo-alt ${selectedLocation === loc ? 'text-white' : 'text-danger opacity-75'}`}></i>
                <span>{loc}</span>
              </button>
            ))}
          </div>

          <div className="d-flex align-items-center gap-2">
            <button
              type="button"
              onClick={() => setSelectedStatusFilter(selectedStatusFilter === 'available' ? 'ALL' : 'available')}
              className={`btn btn-sm rounded-pill px-3 py-1.5 fw-bold d-flex align-items-center gap-1.5 transition-all ${
                selectedStatusFilter === 'available' ? 'bg-success text-white shadow-xs' : 'bg-success-subtle text-success border border-success-subtle'
              }`}
              style={{ fontSize: '12px' }}
            >
              <span className="rounded-circle bg-success d-inline-block" style={{ width: '6px', height: '6px' }}></span>
              <span>Available ({availableCount})</span>
            </button>
            <button
              type="button"
              onClick={() => setSelectedStatusFilter(selectedStatusFilter === 'occupied' ? 'ALL' : 'occupied')}
              className={`btn btn-sm rounded-pill px-3 py-1.5 fw-bold d-flex align-items-center gap-1.5 transition-all ${
                selectedStatusFilter === 'occupied' ? 'bg-danger text-white shadow-xs' : 'bg-danger-subtle text-danger border border-danger-subtle'
              }`}
              style={{ fontSize: '12px' }}
            >
              <span className="rounded-circle bg-danger d-inline-block" style={{ width: '6px', height: '6px' }}></span>
              <span>Occupied ({occupiedCount})</span>
            </button>
            {selectedStatusFilter !== 'ALL' && (
              <button
                type="button"
                onClick={() => setSelectedStatusFilter('ALL')}
                className="btn btn-sm btn-link text-secondary text-decoration-none fw-semibold p-0 ms-1"
                style={{ fontSize: '12px' }}
              >
                Clear
              </button>
            )}
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
                  const canonNum = tableService.getCanonicalTableNumber(table.number || table.table_number || table.id);
                  const tableIdStr = String(table.id || '').trim();
                  const activeOrderForTable = (orders || []).find(o => {
                    if (!o) return false;
                    const INACTIVE_STATUSES = ['completed', 'cancelled', 'canceled', 'cancel', 'done', 'settled', 'delivered', 'rejected', 'void', 'voided'];
                    const isCancelled = ['cancelled', 'canceled', 'cancel', 'rejected', 'void', 'voided'].includes(String(o.status || '').toLowerCase().trim());
                    if (isCancelled) return false;
                    const isUnpaid = String(o.paymentStatus || o.payment_status || '').toUpperCase() !== 'PAID';
                    const isActive = !INACTIVE_STATUSES.includes(String(o.status || '').toLowerCase().trim()) || isUnpaid;
                    if (!isActive) return false;

                    const rawVal = o.tableNumber || o.table_number || o.table_no || (typeof o.table === 'object' ? (o.table?.number || o.table?.table_number || o.table?.id) : o.table);
                    const oCanon = tableService.getCanonicalTableNumber(rawVal || '');
                    const oTableId = String(o.table_id || o.tableId || (typeof o.table === 'object' ? o.table?.id : (typeof o.table === 'number' ? o.table : ''))).trim();

                    return (oCanon && oCanon === canonNum) || (tableIdStr && oTableId && tableIdStr === oTableId);
                  });
                  const isTableOccupiedWithOrder = table.status === 'Occupied' || !!activeOrderForTable;
                  return (
                    <TableCard
                      key={table.id}
                      table={table}
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

      {/* Track Existing Order Popup Modal */}
      {trackingTable && trackingOrder && (
        <TrackOrderModal
          isOpen={Boolean(trackingTable && trackingOrder)}
          order={trackingOrder}
          table={trackingTable}
          onClose={() => {
            setTrackingTable(null);
            setTrackingOrder(null);
          }}
          onContinueOrder={handleContinueFromModal}
          onProceedToBill={handleProceedToBillFromModal}
          loading={trackingLoading}
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
      </div>
    </AdminLayout>
  );
};
export default Tables;
