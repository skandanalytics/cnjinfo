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

  const handleTakeOrder = async (table) => {
    if (table.is_active === false) {
      window.alert('This table is inactive and cannot take a new order.');
      return;
    }
    if (table.status === 'Occupied' || table.is_occupied) {
      window.alert('Table is occupied.');
      return;
    }
    const targetUrl = isAdmin ? '/admin/pos' : '/employee/pos';
    navigate(`${targetUrl}?table=${table.id}`);
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

  if (!loading && (!tables || tables.length === 0)) {
    return (
      <AdminLayout contentClassName="p-0">
        <div className="tables-page-container">
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
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout contentClassName="p-0">
      <div className="tables-page-container">
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
          <div className="alert alert-warning rounded-3 py-2 px-3 mb-4 small">
            Takeaway ordering is unavailable because no dishes are currently available.
          </div>
        )}

        {isAvailableOnly && (
          <div className="alert alert-info rounded-3 py-2 px-3 d-flex align-items-center justify-content-between mb-4 small shadow-xs">
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
                    const isActive = !INACTIVE_STATUSES.includes(String(o.status || '').toLowerCase().trim());
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
      </div>
    </AdminLayout>
  );
};
export default Tables;
