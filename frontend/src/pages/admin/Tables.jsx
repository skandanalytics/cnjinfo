import React, { useEffect, useState, useContext } from 'react';
import AdminLayout from '../../components/layout/AdminLayout';
import PageHeader from '../../components/layout/PageHeader';
import TableCard from '../../components/tables/TableCard';
import AddTableModal from '../../components/tables/AddTableModal';
import EditTableModal from '../../components/tables/EditTableModal';
import QRDisplayModal from '../../components/tables/QRDisplayModal';
import ConfirmModal from '../../components/common/ConfirmModal';
import Button from '../../components/common/Button';
import Loader from '../../components/common/Loader';
import EmptyState from '../../components/common/EmptyState';
import BranchRequiredState from '../../components/common/BranchRequiredState';
import { tableService } from '../../services/tableService';
import { useBranches } from '../../hooks/useBranches';
import { productService } from '../../services/productService';
import { menuService } from '../../services/menuService';
import { useAuth } from '../../hooks/useAuth';
import { FiPlus, FiShoppingCart } from 'react-icons/fi';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useCart } from '../../hooks/useCart';
import { OrderContext } from '../../context/OrderContext';

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

  const fetchTables = async () => {
    setLoading(true);
    try {
      const [data, dishesData, catData] = await Promise.all([
        tableService.getTables().catch(() => []),
        productService.getProducts(true).catch(() => []),
        menuService.getMenus().catch(() => [])
      ]);
      setTables(Array.isArray(data) ? data : []);
      const orderable = (dishesData || []).some((dish) => Number(dish.stock) > 0 && dish.status !== 'Out of Stock');
      setHasDishes(orderable);
    } catch (e) {
      console.error("fetchTables error:", e);
    }
    setLoading(false);
  };

  const fetchTablesSilently = async () => {
    try {
      const [data, dishesData, catData] = await Promise.all([
        tableService.getTables().catch(() => []),
        productService.getProducts(true).catch(() => []),
        menuService.getMenus().catch(() => [])
      ]);
      if (Array.isArray(data)) setTables(data);
      const orderable = (dishesData || []).some((dish) => Number(dish.stock) > 0 && dish.status !== 'Out of Stock');
      setHasDishes(orderable);
    } catch (e) {
      console.error("fetchTablesSilently error:", e);
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
    try {
      await tableService.updateTableStatus(id, status);
    } catch (e) {
      window.alert(e.message || 'The table status could not be changed.');
    }
    await fetchTablesSilently();
  };

  const sameBranchTables = (branchId) => (branchId ? tables.filter((t) => String(t.branch) === String(branchId)) : tables);

  const startStaffOrder = async ({ orderType, table }) => {
    const { currentBranchId } = await import('../../services/adminApi');
    const { staffJson } = await import('../../services/staffClient');
    const { setOrderType, setSelectedTableId } = await import('../../utils/orderContext');
    const branchId = table?.branch || await currentBranchId();
    sessionStorage.setItem('foodie_staff_ordering', '1');
    sessionStorage.setItem('foodie_public_branch', String(branchId));
    sessionStorage.setItem('foodie_branch_source', 'chosen');
    sessionStorage.removeItem('foodie_cart');
    setOrderType(orderType);
    const body = { branch: Number(branchId), order_type: orderType };
    if (orderType === 'DINE_IN') {
      setSelectedTableId(table.id);
      body.table = table.id;
    } else {
      setSelectedTableId(null);
    }
    await staffJson('/cart/context/', { method: 'PUT', body: JSON.stringify(body) });
    navigate('/customer/home');
  };

  const handleTakeOrder = async (table) => {
    if (String(table.status || '').toLowerCase().startsWith('occup')) {
      window.alert('This table already has an active order.');
      return;
    }
    try {
      await startStaffOrder({ orderType: 'DINE_IN', table });
    } catch (err) {
      window.alert(err.message || 'This table cannot be used for a new order.');
    }
  };

  const filteredTables = tables.filter((t) => {
    if (isAvailableOnly) {
      const st = String(t.status || '').toLowerCase().trim();
      const isAvail = st === 'available' || t.isAvailable === true || t.is_available === true;
      if (!isAvail) return false;
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
      <AdminLayout>
        <Loader />
      </AdminLayout>
    );
  }

  if (!hasBranches) {
    return (
      <AdminLayout>
        <PageHeader title="Manage Tables" showBackButton />
        <BranchRequiredState />
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

  if (!loading && (!tables || tables.length === 0)) {
    return (
      <AdminLayout>
        <PageHeader 
          title="Manage Tables" 
          showBackButton
          actions={
            <div className="d-flex align-items-center gap-2">
              <Button 
                onClick={handleTakeawayOrder} 
                variant="outline" 
                disabled={!hasDishes}
                title={hasDishes ? 'Start a takeaway order' : 'Takeaway ordering is unavailable because no dishes are currently available.'}
                className="d-flex align-items-center gap-2 py-2 px-3 fw-bold bg-white text-danger border-danger shadow-xs"
              >
                <FiShoppingCart /> Takeaway Order
              </Button>
              {isAdmin && hasBranches && (
                <Button 
                  onClick={() => setIsAddOpen(true)} 
                  variant="primary" 
                  className="d-flex align-items-center gap-2 py-2 px-3"
                >
                  <FiPlus /> Add Table
                </Button>
              )}
            </div>
          }
        />
        <EmptyState
          title="No Tables Found"
          description="There are currently no tables added yet."
          icon="bi-border-all"
        />

        {/* Add Table Modal */}
        {isAdmin && isAddOpen && (
          <AddTableModal
            isOpen={isAddOpen}
            existingTables={tables}
            onClose={() => setIsAddOpen(false)}
            onAdd={handleAddTable}
          />
        )}
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <PageHeader 
        title="Manage Tables" 
        showBackButton
        actions={
          <div className="d-flex align-items-center gap-2">
            <Button 
              onClick={handleTakeawayOrder} 
              variant="outline" 
              disabled={!hasDishes}
              title={hasDishes ? 'Start a takeaway order' : 'Takeaway ordering is unavailable because no dishes are currently available.'}
              className="d-flex align-items-center gap-2 py-2 px-3 fw-bold bg-white text-danger border-danger shadow-xs"
            >
              <FiShoppingCart /> Takeaway Order
            </Button>
            {isAdmin && hasBranches && (
              <Button 
                onClick={() => setIsAddOpen(true)} 
                variant="primary" 
                className="d-flex align-items-center gap-2 py-2 px-3"
              >
                <FiPlus /> Add Table
              </Button>
            )}
          </div>
        }
      />

      {!hasDishes && (
        <div className="alert alert-warning rounded-3 py-2 px-3 mb-3 small">
          Takeaway ordering is unavailable because no dishes are currently available.
        </div>
      )}

      {isAvailableOnly && (
        <div className="alert alert-info rounded-3 py-2 px-3 d-flex align-items-center justify-content-between mb-3 small shadow-xs">
          <span>Showing <strong>Available Tables Only</strong> ({filteredTables.length} available table{filteredTables.length === 1 ? '' : 's'})</span>
          <button
            onClick={() => {
              searchParams.delete('status');
              searchParams.delete('filter');
              setSearchParams(searchParams);
            }}
            className="btn btn-sm btn-outline-info rounded-pill px-3 py-1 fw-bold"
            style={{ fontSize: '11px' }}
          >
            Show All Tables
          </button>
        </div>
      )}

      {/* Grid */}
      {loading ? (
        <Loader />
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
        <div className="row g-3">
          {group.tables.map((table) => {
            const canonNum = tableService.getCanonicalTableNumber(table.number || table.table_number || table.id);
            const tableIdStr = String(table.id || '').trim();
            const activeOrderForTable = (orders || []).find(o => {
              if (!o) return false;
              const INACTIVE_STATUSES = ['completed', 'cancelled', 'canceled', 'cancel', 'done', 'settled', 'delivered', 'rejected', 'void', 'voided'];
              const isActive = !INACTIVE_STATUSES.includes(String(o.status || '').toLowerCase().trim());
              if (!isActive) return false;

              const rawVal = o.tableNumber || o.table_number || o.table_no || (typeof o.table === 'object' ? (o.table?.number || o.table?.table_number || o.table?.id) : o.table);
              const oCanon = tableService.getCanonicalTableNumber(rawVal || '');
              const oTableId = String(o.table_id || o.tableId || (typeof o.table === 'object' ? o.table?.id : (typeof o.table === 'number' ? o.table : ''))).trim();

              return (oCanon && oCanon === canonNum) || (tableIdStr && oTableId && tableIdStr === oTableId);
            });
            const isTableOccupiedWithOrder = table.status === 'Occupied' || !!activeOrderForTable;
            return (
              <div key={table.id} className="col-12 col-sm-6 col-md-4 col-lg-3">
                <TableCard
                  table={table}
                  onSelect={handleTakeOrder}
                  onStatusChange={handleStatusChange}
                  onEdit={(t) => setEditingTable(t)}
                  onDelete={(t) => { setDeleteError(''); setDeletingTable(t); }}
                  onViewQR={qrEnabled ? (t) => setQrModalTable(t) : undefined}
                  isAdmin={isAdmin}
                  showActions
                  hasDishes={hasDishes}
                  hasActiveOrder={isTableOccupiedWithOrder}
                />
              </div>
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
          onRefresh={fetchTables}
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
    </AdminLayout>
  );
};
export default Tables;
