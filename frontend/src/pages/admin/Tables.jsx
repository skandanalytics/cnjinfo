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
import { tableService } from '../../services/tableService';
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

  const [tables, setTables] = useState([]);
  const [loading, setLoading] = useState(true);
  const [hasDishes, setHasDishes] = useState(true);
  const [activeArea, setActiveArea] = useState('All');
  const [views, setViews] = useState([]);
  const [newViewName, setNewViewName] = useState('');
  const [viewError, setViewError] = useState('');
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [editingTable, setEditingTable] = useState(null);
  const [deletingTable, setDeletingTable] = useState(null);
  const [qrModalTable, setQrModalTable] = useState(null);

  const areas = ['All', ...views.map((view) => view.name)];

  const loadViews = async () => {
    try {
      const { listTableViews } = await import('../../services/adminApi');
      const rows = await listTableViews();
      setViews(Array.isArray(rows) ? rows : []);
    } catch (err) {
      setViews([]);
    }
  };

  useEffect(() => {
    sessionStorage.removeItem('foodie_staff_ordering');
    loadViews();
  }, []);

  const fetchTables = async () => {
    setLoading(true);
    try {
      const [data, dishesData, catData] = await Promise.all([
        tableService.getTables().catch(() => []),
        productService.getProducts(true).catch(() => []),
        menuService.getMenus().catch(() => [])
      ]);
      if (Array.isArray(data) && data.length > 0) {
        setTables(data);
      } else if (Array.isArray(data)) {
        setTables(data);
      }
      const hasCats = (catData || []).length > 0;
      const hasProds = (dishesData || []).length > 0;
      setHasDishes(hasCats && hasProds);
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
      if (Array.isArray(data) && data.length > 0) {
        setTables(data);
      }
      const hasCats = (catData || []).length > 0;
      const hasProds = (dishesData || []).length > 0;
      setHasDishes(hasCats && hasProds);
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
    if (!isAdmin) return;
    try {
      const created = await tableService.createTable(tableData);
      if (created) {
        setTables(prev => {
          const canon = tableService.getCanonicalTableNumber(created.number);
          const filtered = prev.filter(t => tableService.getCanonicalTableNumber(t.number) !== canon);
          return [...filtered, created].sort((a, b) => {
            const aNum = parseInt(String(a.number || '').replace(/[^0-9]/g, '') || '0', 10);
            const bNum = parseInt(String(b.number || '').replace(/[^0-9]/g, '') || '0', 10);
            if (!isNaN(aNum) && !isNaN(bNum) && aNum !== bNum) {
              return aNum - bNum;
            }
            return String(a.number).localeCompare(String(b.number));
          });
        });
      }
      setActiveArea('All');
      await fetchTablesSilently();
    } catch (e) {
      console.error("Failed to add table:", e);
      throw e;
    }
  };

  const handleEditSave = async (id, tableData) => {
    if (!isAdmin) return;
    const cleanNum = tableService.getCanonicalTableNumber(tableData.number);
    setTables(prev => prev.map(t => {
      if (String(t.id) === String(id)) {
        return {
          ...t,
          ...tableData,
          number: cleanNum,
          table_number: cleanNum,
          name: `Table ${cleanNum}`
        };
      }
      return t;
    }));
    try {
      await tableService.updateTable(id, tableData);
      await fetchTablesSilently();
    } catch (e) {
      console.error("Failed to update table:", e);
      await fetchTables();
      throw e;
    }
  };

  const handleDeleteConfirm = async () => {
    if (!isAdmin) return;
    if (deletingTable) {
      const targetId = deletingTable.id;
      const targetNum = deletingTable.number || deletingTable.table_number;
      const canonNum = tableService.getCanonicalTableNumber(targetNum || targetId);
      setDeletingTable(null);
      // Optimistically remove table from UI immediately
      setTables(prev => prev.filter(t => 
        String(t.id) !== String(targetId) && 
        tableService.getCanonicalTableNumber(t.number) !== canonNum
      ));
      try {
        await tableService.deleteTable(targetId, targetNum);
        await fetchTablesSilently();
      } catch (e) {
        console.error("Failed to delete table:", e);
        await fetchTables();
      }
    }
  };

  const handleStatusChange = async (id, status) => {
    setTables(prev => prev.map(t => {
      if (String(t.id) === String(id)) {
        return {
          ...t,
          status,
          isAvailable: status === 'Available',
          is_available: status === 'Available',
          orderId: status === 'Occupied' ? t.orderId : undefined,
          reservationName: status === 'Reserved' ? t.reservationName : undefined
        };
      }
      return t;
    }));

    try {
      await tableService.updateTableStatus(id, status);
      await fetchTablesSilently();
    } catch (e) {
      console.error("Failed to update table status", e);
      alert("Unable to update table status. Please try again.");
      await fetchTablesSilently();
    }
  };

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
    if (activeArea === 'All') return true;
    const view = views.find((item) => item.name === activeArea);
    return (view && t.tableViewId === view.id) || (t.area || '') === activeArea;
  });

  if (loading && (!tables || tables.length === 0)) {
    return (
      <AdminLayout>
        <Loader />
      </AdminLayout>
    );
  }

  const handleTakeawayOrder = async () => {
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
                className="d-flex align-items-center gap-2 py-2 px-3 fw-bold bg-white text-danger border-danger shadow-xs"
              >
                <FiShoppingCart /> Takeaway Order
              </Button>
              {isAdmin && (
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
            viewOptions={views}
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
              className="d-flex align-items-center gap-2 py-2 px-3 fw-bold bg-white text-danger border-danger shadow-xs"
            >
              <FiShoppingCart /> Takeaway Order
            </Button>
            {isAdmin && (
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

      {/* Tabs */}
      <div className="d-flex flex-wrap gap-2 mb-4 border-bottom pb-3">
        {areas.map((area) => {
          const count = area === 'All'
            ? tables.length
            : tables.filter(t => (t.area || '') === area).length;

          return (
            <button
              key={area}
              onClick={() => setActiveArea(area)}
              className={`btn btn-sm rounded-pill px-3.5 py-1.5 border-0 fw-bold transition-all ${
                activeArea === area ? 'bg-danger text-white' : 'bg-white text-secondary border'
              }`}
              style={{ fontSize: '12px' }}
            >
              {area} ({count})
            </button>
          );
        })}
      </div>

      {isAdmin && (
        <form
          className="d-flex flex-wrap align-items-center gap-2 mb-3"
          onSubmit={async (event) => {
            event.preventDefault();
            const name = newViewName.trim();
            if (!name) return;
            try {
              const { createTableView } = await import('../../services/adminApi');
              const created = await createTableView(name);
              setNewViewName('');
              setViewError('');
              await loadViews();
              if (created?.name) setActiveArea(created.name);
            } catch (err) {
              setViewError(err.message || 'Could not add that view.');
            }
          }}
        >
          <input
            className="form-control form-control-sm rounded-pill"
            style={{ maxWidth: '220px' }}
            placeholder="New floor or view name"
            value={newViewName}
            onChange={(e) => setNewViewName(e.target.value)}
          />
          <button type="submit" className="btn btn-sm btn-outline-danger rounded-pill fw-bold">Add view</button>
          {viewError && <span className="text-danger small">{viewError}</span>}
        </form>
      )}

      {/* Grid */}
      {loading ? (
        <Loader />
      ) : filteredTables.length === 0 ? (
        <EmptyState
          title="No Tables Found"
          description="There are no tables assigned to this dining area."
          icon="bi-border-all"
        />
      ) : (
        <div className="row g-3">
          {filteredTables.map((table) => {
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
                  onDelete={(t) => setDeletingTable(t)}
                  onViewQR={(t) => setQrModalTable(t)}
                  isAdmin={isAdmin}
                  showActions
                  hasDishes={hasDishes}
                  hasActiveOrder={isTableOccupiedWithOrder}
                />
              </div>
            );
          })}
        </div>
      )}

      {/* Modals */}
      {isAdmin && isAddOpen && (
        <AddTableModal
          isOpen={isAddOpen}
          existingTables={tables}
          viewOptions={views}
          onClose={() => setIsAddOpen(false)}
          onAdd={handleAddTable}
        />
      )}

      {isAdmin && editingTable && (
        <EditTableModal
          isOpen={!!editingTable}
          viewOptions={views}
          table={editingTable}
          existingTables={tables}
          onClose={() => setEditingTable(null)}
          onSave={handleEditSave}
        />
      )}

      {qrModalTable && (
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
          message={`Are you sure you want to delete Table ${deletingTable.number || deletingTable.id}? This action cannot be undone.`}
          onConfirm={handleDeleteConfirm}
          onClose={() => setDeletingTable(null)}
        />
      )}
    </AdminLayout>
  );
};
export default Tables;
