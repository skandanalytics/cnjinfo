import React, { useEffect, useState, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import AdminLayout from '../../components/layout/AdminLayout';
import PageHeader from '../../components/layout/PageHeader';
import Badge from '../../components/common/Badge';
import Loader from '../../components/common/Loader';
import EmptyState from '../../components/common/EmptyState';
import BranchRequiredState from '../../components/common/BranchRequiredState';
import { useBranches } from '../../hooks/useBranches';
import SearchBar from '../../components/common/SearchBar';
import Modal from '../../components/common/Modal';
import ConfirmModal from '../../components/common/ConfirmModal';
import Input from '../../components/common/Input';
import Button from '../../components/common/Button';
import { inventoryService } from '../../services/inventoryService';
import { menuService } from '../../services/menuService';
import { useAuth } from '../../hooks/useAuth';
import api from '../../services/api';
import { getFrontendCategoryName, normalizeCategoryName } from '../../utils/categoryUtils';
import { classifyStock } from '../../utils/stockStatus';
import { FiAlertCircle, FiAlertTriangle, FiCheckCircle, FiPackage, FiFilter, FiTrash2 } from 'react-icons/fi';

export const Inventory = () => {
  const { user } = useAuth();
  const { hasBranches, loading: branchesLoading } = useBranches();
  const canManageStock = user?.role === 'admin' || user?.role === 'employee' || !user?.role;
  const [searchParams, setSearchParams] = useSearchParams();

  const getInitialStatus = () => {
    const s = (searchParams.get('status') || '').toLowerCase();
    if (s.includes('out')) return 'OUT_OF_STOCK';
    if (s.includes('low')) return 'LOW_STOCK';
    if (s.includes('in')) return 'IN_STOCK';
    return 'ALL';
  };

  const [allMenus, setAllMenus] = useState([]);
  const [stockItems, setStockItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('All');
  const [stockStatusFilter, setStockStatusFilter] = useState(getInitialStatus);

  // Restock modal state
  const [restockingItem, setRestockingItem] = useState(null);
  const [restockQuantity, setRestockQuantity] = useState('');
  
  const [validationError, setValidationError] = useState('');
  const [saveLoading, setSaveLoading] = useState(false);

  // Delete inventory item state
  const [deletingItem, setDeletingItem] = useState(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  useEffect(() => {
    const s = getInitialStatus();
    setStockStatusFilter(s);
  }, [searchParams]);

  const handleToggleStatus = (status) => {
    const nextStatus = stockStatusFilter === status ? 'ALL' : status;
    setStockStatusFilter(nextStatus);
    if (nextStatus === 'ALL') {
      searchParams.delete('status');
      setSearchParams(searchParams);
    } else {
      setSearchParams({ status: nextStatus.toLowerCase() });
    }
  };

  const fetchInventory = async (showLoading = true) => {
    if (showLoading) setLoading(true);
    try {
      const [menuData, stockData] = await Promise.all([
        menuService.getMenus(true),
        inventoryService.getInventory(true)
      ]);
      setAllMenus(menuData || []);
      setStockItems(stockData || []);
    } catch (e) {
      console.error("Error loading inventory:", e);
    }
    if (showLoading) setLoading(false);
  };

  const fetchInventorySilently = async () => {
    try {
      const [menuData, stockData] = await Promise.all([
        menuService.getMenus(true),
        inventoryService.getInventory(true)
      ]);
      setAllMenus(menuData || []);
      setStockItems(stockData || []);
    } catch (e) {
      console.error("Error silently refreshing inventory:", e);
    }
  };

  useEffect(() => {
    fetchInventory();

    const handleUpdateEvents = () => {
      fetchInventorySilently();
    };

    const handleStorageEvent = (e) => {
      if (
        e.key === 'foodie_inventory_sync_trigger' || 
        e.key === 'foodie_dish_stocks' ||
        e.key === 'foodie_orders_sync_trigger'
      ) {
        fetchInventorySilently();
      }
    };

    window.addEventListener('foodie_categories_updated', handleUpdateEvents);
    window.addEventListener('foodie_products_updated', handleUpdateEvents);
    window.addEventListener('foodie_inventory_updated', handleUpdateEvents);
    window.addEventListener('foodie_orders_updated', handleUpdateEvents);
    window.addEventListener('storage', handleStorageEvent);

    return () => {
      window.removeEventListener('foodie_categories_updated', handleUpdateEvents);
      window.removeEventListener('foodie_products_updated', handleUpdateEvents);
      window.removeEventListener('foodie_inventory_updated', handleUpdateEvents);
      window.removeEventListener('foodie_orders_updated', handleUpdateEvents);
      window.removeEventListener('storage', handleStorageEvent);
    };
  }, []);

  const handleStartRestock = (item) => {
    setRestockingItem(item);
    setRestockQuantity('');
    setValidationError('');
  };

  const handleSaveRestock = async (e) => {
    e.preventDefault();
    setValidationError('');

    if (!restockQuantity.trim()) {
      setValidationError('Quantity cannot be empty.');
      return;
    }

    const numericQty = Number(restockQuantity);
    if (!Number.isInteger(numericQty) || numericQty <= 0) {
      setValidationError('Enter a positive whole number.');
      return;
    }

    setSaveLoading(true);
    try {
      const { restockFood, explain } = await import('../../services/adminApi');
      try {
        await restockFood(restockingItem.id, numericQty);
      } catch (err) {
        throw new Error(explain(err));
      }
      setRestockingItem(null);
      await fetchInventorySilently();
    } catch (err) {
      setValidationError(err.message || 'Restock failed.');
    } finally {
      setSaveLoading(false);
    }
  };

  // Derive unique categories matching Edit Menu page exactly
  const allCategories = useMemo(() => {
    const map = new Map();
    (allMenus || []).forEach(m => {
      const feName = getFrontendCategoryName(m.name);
      const norm = normalizeCategoryName(feName);
      if (!map.has(norm)) {
        map.set(norm, feName);
      }
    });
    (stockItems || []).forEach(d => {
      const cat = d.category || 'Other';
      const feName = getFrontendCategoryName(cat);
      const norm = normalizeCategoryName(feName);
      if (!map.has(norm)) {
        map.set(norm, feName);
      }
    });
    return ['All', ...Array.from(map.values())];
  }, [allMenus, stockItems]);

  // Derived stock status statistics
  const isOutOfStockItem = (item) => classifyStock(item.stock) === 'Out of Stock';
  const isLowStockItem = (item) => classifyStock(item.stock) === 'Low Stock';

  const totalCount = stockItems.length;
  const outOfStockItems = useMemo(() => stockItems.filter(isOutOfStockItem), [stockItems]);
  const lowStockItems = useMemo(() => stockItems.filter(isLowStockItem), [stockItems]);
  const inStockItems = useMemo(() => stockItems.filter((item) => !isOutOfStockItem(item) && !isLowStockItem(item)), [stockItems]);

  // Combine search, category, and highlighted stock status toggle filter
  const filteredItems = stockItems.filter((item) => {
    const term = search.trim().toLowerCase();
    const matchesSearch = !term ||
      item.name.toLowerCase().includes(term) ||
      (item.category && item.category.toLowerCase().includes(term));

    let matchesCategory = true;
    if (categoryFilter !== 'All') {
      const itemCatNorm = normalizeCategoryName(item.category || '');
      const filterCatNorm = normalizeCategoryName(categoryFilter);
      const itemFeCatNorm = normalizeCategoryName(getFrontendCategoryName(item.category || ''));
      const filterFeCatNorm = normalizeCategoryName(getFrontendCategoryName(categoryFilter));

      matchesCategory = 
        item.category === categoryFilter ||
        itemCatNorm === filterCatNorm ||
        itemFeCatNorm === filterCatNorm ||
        itemCatNorm === filterFeCatNorm ||
        itemFeCatNorm === filterFeCatNorm ||
        (itemCatNorm.includes(filterCatNorm) && filterCatNorm.length > 3) ||
        (filterCatNorm.includes(itemCatNorm) && itemCatNorm.length > 3);
    }

    const isOut = isOutOfStockItem(item);
    const isLow = isLowStockItem(item);
    const isIn = !isOut && !isLow;

    let matchesStatus = true;
    if (stockStatusFilter === 'OUT_OF_STOCK') {
      matchesStatus = isOut;
    } else if (stockStatusFilter === 'LOW_STOCK') {
      matchesStatus = isLow;
    } else if (stockStatusFilter === 'IN_STOCK') {
      matchesStatus = isIn;
    } else if (stockStatusFilter === 'ALERTS') {
      matchesStatus = isOut || isLow;
    }

    return matchesSearch && matchesCategory && matchesStatus;
  });

  return (
    <AdminLayout>
      {loading || branchesLoading ? (
        <div className="py-5 text-center">
          <Loader />
          <p className="text-muted small mt-2">Loading inventory data...</p>
        </div>
      ) : !hasBranches ? (
        <>
          <PageHeader title="Inventory Management" showBackButton />
          <BranchRequiredState />
        </>
      ) : stockItems.length === 0 ? (
        <>
          <PageHeader title="Inventory Management" showBackButton />
          <EmptyState
            icon="bi-box"
            title="No inventory items"
            description="Inventory appears after dishes are added to a branch menu."
          />
        </>
      ) : (
        <>
          <PageHeader 
            title="Inventory Management" 
            showBackButton
            actions={
              <div className="d-flex align-items-center gap-3 flex-wrap">
                <SearchBar 
                  placeholder="Search items..." 
                  value={search} 
                  onChange={setSearch}
                  records={stockItems.map((item) => ({
                    id: item.id,
                    label: item.name,
                    title: item.name,
                    subtitle: `${item.stock ?? 0} available · ${classifyStock(item.stock)}`,
                    searchText: [item.name, item.category, item.status].filter(Boolean).join(' '),
                  }))}
                  style={{ width: '220px' }}
                />
                <div className="d-flex align-items-center gap-2">
                  <label className="text-secondary small fw-bold mb-0">Category:</label>
                  <select 
                    className="form-select form-select-sm rounded-pill px-3 py-1.5"
                    style={{ width: '160px', height: '36px' }}
                    value={categoryFilter}
                    onChange={(e) => setCategoryFilter(e.target.value)}
                  >
                    {allCategories.map(cat => (
                      <option key={cat} value={cat}>{cat === 'All' ? 'All Categories' : cat}</option>
                    ))}
                  </select>
                </div>
              </div>
            }
          />

          {/* Interactive Stock Status Quick Toggle Cards */}
          <div className="row g-3 mb-4">
            {/* All Products Card */}
            <div className="col-12 col-sm-6 col-xl-3">
              <div 
                onClick={() => handleToggleStatus('ALL')}
                className={`card rounded-4 border-0 p-3 h-100 transition-all cursor-pointer ${
                  stockStatusFilter === 'ALL' 
                    ? 'shadow border border-2 border-dark bg-white' 
                    : 'shadow-sm bg-white'
                }`}
                style={{ cursor: 'pointer', transition: 'all 0.2s ease' }}
              >
                <div className="d-flex align-items-center justify-content-between">
                  <div>
                    <span className="small text-secondary fw-bold text-uppercase d-block mb-1">Total Products</span>
                    <h3 className="fw-bold text-dark mb-0">{totalCount}</h3>
                  </div>
                  <div className={`p-3 rounded-circle ${stockStatusFilter === 'ALL' ? 'bg-dark text-white' : 'bg-light text-secondary'}`}>
                    <FiPackage size={22} />
                  </div>
                </div>
                <div className="mt-2 small fw-bold text-secondary" style={{ fontSize: '11px' }}>
                  {stockStatusFilter === 'ALL' ? '● Showing all items' : 'Click to show all'}
                </div>
              </div>
            </div>

            {/* Out of Stock Card / Toggle (HIGHLIGHTED) */}
            <div className="col-12 col-sm-6 col-xl-3">
              <div 
                onClick={() => handleToggleStatus('OUT_OF_STOCK')}
                className={`card rounded-4 border-0 p-3 h-100 transition-all cursor-pointer ${
                  stockStatusFilter === 'OUT_OF_STOCK' 
                    ? 'shadow-lg border border-2 border-danger bg-danger text-white' 
                    : outOfStockItems.length > 0
                      ? 'shadow-sm bg-white border border-danger-subtle'
                      : 'shadow-sm bg-white'
                }`}
                style={{ cursor: 'pointer', transition: 'all 0.2s ease' }}
              >
                <div className="d-flex align-items-center justify-content-between">
                  <div>
                    <span className={`small fw-bold text-uppercase d-block mb-1 ${stockStatusFilter === 'OUT_OF_STOCK' ? 'text-white opacity-90' : 'text-danger'}`}>
                      Out of Stock
                    </span>
                    <h3 className={`fw-bold mb-0 ${stockStatusFilter === 'OUT_OF_STOCK' ? 'text-white' : 'text-danger'}`}>
                      {outOfStockItems.length}
                    </h3>
                  </div>
                  <div className={`p-3 rounded-circle ${stockStatusFilter === 'OUT_OF_STOCK' ? 'bg-white text-danger' : 'bg-danger-subtle text-danger'}`}>
                    <FiAlertCircle size={22} />
                  </div>
                </div>
                <div className={`mt-2 small fw-bold ${stockStatusFilter === 'OUT_OF_STOCK' ? 'text-white' : 'text-danger'}`} style={{ fontSize: '11px' }}>
                  {stockStatusFilter === 'OUT_OF_STOCK' ? 'Showing out of stock (click to clear)' : 'Click to view Out of Stock'}
                </div>
              </div>
            </div>

            <div className="col-12 col-sm-6 col-xl-3">
              <div
                onClick={() => handleToggleStatus('LOW_STOCK')}
                className={`card rounded-4 border-0 p-3 h-100 transition-all cursor-pointer ${
                  stockStatusFilter === 'LOW_STOCK'
                    ? 'shadow-lg border border-2 border-warning bg-warning text-dark'
                    : lowStockItems.length > 0
                      ? 'shadow-sm bg-white border border-warning-subtle'
                      : 'shadow-sm bg-white'
                }`}
                style={{ cursor: 'pointer', transition: 'all 0.2s ease' }}
              >
                <div className="d-flex align-items-center justify-content-between">
                  <div>
                    <span className={`small fw-bold text-uppercase d-block mb-1 ${stockStatusFilter === 'LOW_STOCK' ? 'text-dark opacity-90' : 'text-warning-emphasis'}`}>
                      Low Stock
                    </span>
                    <h3 className={`fw-bold mb-0 ${stockStatusFilter === 'LOW_STOCK' ? 'text-dark' : 'text-warning-emphasis'}`}>
                      {lowStockItems.length}
                    </h3>
                  </div>
                  <div className={`p-3 rounded-circle ${stockStatusFilter === 'LOW_STOCK' ? 'bg-dark text-warning' : 'bg-warning-subtle text-warning-emphasis'}`}>
                    <FiAlertTriangle size={22} />
                  </div>
                </div>
                <div className={`mt-2 small fw-bold ${stockStatusFilter === 'LOW_STOCK' ? 'text-dark' : 'text-warning-emphasis'}`} style={{ fontSize: '11px' }}>
                  {stockStatusFilter === 'LOW_STOCK' ? 'Showing low stock (click to clear)' : 'Click to view Low Stock'}
                </div>
              </div>
            </div>

            {/* In Stock Card */}
            <div className="col-12 col-sm-6 col-xl-3">
              <div 
                onClick={() => handleToggleStatus('IN_STOCK')}
                className={`card rounded-4 border-0 p-3 h-100 transition-all cursor-pointer ${
                  stockStatusFilter === 'IN_STOCK' 
                    ? 'shadow border border-2 border-success bg-success text-white' 
                    : 'shadow-sm bg-white'
                }`}
                style={{ cursor: 'pointer', transition: 'all 0.2s ease' }}
              >
                <div className="d-flex align-items-center justify-content-between">
                  <div>
                    <span className={`small fw-bold text-uppercase d-block mb-1 ${stockStatusFilter === 'IN_STOCK' ? 'text-white opacity-90' : 'text-success'}`}>
                      In Stock (6 or more)
                    </span>
                    <h3 className={`fw-bold mb-0 ${stockStatusFilter === 'IN_STOCK' ? 'text-white' : 'text-success'}`}>
                      {inStockItems.length}
                    </h3>
                  </div>
                  <div className={`p-3 rounded-circle ${stockStatusFilter === 'IN_STOCK' ? 'bg-white text-success' : 'bg-success-subtle text-success'}`}>
                    <FiCheckCircle size={22} />
                  </div>
                </div>
                <div className={`mt-2 small fw-bold ${stockStatusFilter === 'IN_STOCK' ? 'text-white' : 'text-success'}`} style={{ fontSize: '11px' }}>
                  {stockStatusFilter === 'IN_STOCK' ? '✓ Filter active (Click to clear)' : 'Click to view In Stock'}
                </div>
              </div>
            </div>
          </div>

          <div className="card border-0 shadow-sm rounded-3 p-4 bg-white">
            <div className="d-flex align-items-center justify-content-between flex-wrap gap-2 mb-3">
              <div>
                <h5 className="fw-bold text-dark mb-0">Item Stock Inventory</h5>
                <span className="text-secondary small">
                  Showing {filteredItems.length} of {totalCount} items
                  {stockStatusFilter !== 'ALL' && ` (Filtered by ${stockStatusFilter.replace('_', ' ')})`}
                </span>
              </div>
            </div>
            
            {filteredItems.length === 0 ? (
              <EmptyState
                title={stockStatusFilter === 'OUT_OF_STOCK' ? 'No Out of Stock Items' : stockStatusFilter === 'LOW_STOCK' ? 'No Low Stock Items' : 'No Items Found'}
                description={stockStatusFilter === 'OUT_OF_STOCK'
                  ? 'No dishes are out of stock for the current branch.'
                  : stockStatusFilter === 'LOW_STOCK'
                    ? 'No dishes have between 1 and 5 units left.'
                    : 'There are no inventory items matching the selected search or category filters.'}
                icon="bi-box-seam"
              />
            ) : (
              <div className="table-responsive">
                <table className="table align-middle">
                  <thead>
                    <tr className="text-secondary small">
                      <th>PRODUCT</th>
                      <th>CATEGORY</th>
                      <th>STOCK LEVEL</th>
                      <th>STATUS</th>
                      {canManageStock && <th className="text-end">ACTIONS</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {filteredItems.map((item) => (
                      <tr key={item.id} className="small">
                        <td className="fw-bold text-dark">
                          <div className="d-flex align-items-center gap-2 flex-wrap">
                            <span>{item.name}</span>
                            {(item.hasDiscount || item.discountPercent > 0 || (item.discountPrice > 0 && item.discountPrice < item.price)) && (
                              <span className="badge bg-danger-subtle text-danger border border-danger-subtle fw-bold rounded-pill px-2 py-0.5" style={{ fontSize: '10px' }}>
                                🔥 {item.discountPercent > 0 ? `${item.discountPercent}% OFF` : 'OFFER'}
                              </span>
                            )}
                          </div>
                        </td>
                        <td>{item.category}</td>
                        <td className="fw-bold">
                          <span className={isOutOfStockItem(item) ? 'text-danger fw-bold' : isLowStockItem(item) ? 'text-warning-emphasis' : 'text-dark'}>
                            {item.stock <= 0 ? 'Out of Stock' : `${item.stock} Units`}
                          </span>
                        </td>
                        <td>
                          <Badge status={isOutOfStockItem(item) ? 'Out of Stock' : isLowStockItem(item) ? 'Low Stock' : 'In Stock'} style={{ fontSize: '10px' }} />
                        </td>
                        {canManageStock && (
                          <td className="text-end">
                            <div className="d-flex align-items-center justify-content-end gap-2">
                              <button 
                                onClick={() => handleStartRestock(item)}
                                className="btn btn-sm btn-outline-danger rounded-pill px-3 fw-bold"
                                style={{ fontSize: '11px' }}
                              >
                                Restock
                              </button>
                              <button 
                                onClick={() => setDeletingItem(item)}
                                className="btn btn-sm btn-outline-secondary rounded-pill px-2 py-1"
                                title="Delete Item"
                                style={{ fontSize: '11px' }}
                              >
                                <FiTrash2 size={13} className="text-danger" />
                              </button>
                            </div>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      {/* Restock Modal */}
      {canManageStock && restockingItem && (
        <Modal 
          isOpen={!!restockingItem} 
          title="Restock Item" 
          onClose={() => setRestockingItem(null)}
          footerActions={
            <>
              <Button variant="light" onClick={() => setRestockingItem(null)} disabled={saveLoading}>
                Cancel
              </Button>
              <Button variant="primary" onClick={handleSaveRestock} loading={saveLoading}>
                Restock
              </Button>
            </>
          }
        >
          <form onSubmit={handleSaveRestock}>
            <div className="mb-3">
              <label className="form-label small fw-semibold text-secondary">Product Name</label>
              <input type="text" className="form-control rounded-3 py-2 bg-light border-0" value={restockingItem.name} readOnly disabled />
            </div>
            
            <div className="mb-3">
              <label className="form-label small fw-semibold text-secondary">Current Stock</label>
              <input type="text" className="form-control rounded-3 py-2 bg-light border-0" value={restockingItem.stock} readOnly disabled />
            </div>

            <Input 
              label="Quantity to Add" 
              type="number"
              placeholder="e.g. 20" 
              value={restockQuantity} 
              onChange={(e) => {
                setRestockQuantity(e.target.value);
                setValidationError('');
              }} 
              required 
            />
            {validationError && (
              <div className="text-danger small fw-semibold mt-1 mb-2">{validationError}</div>
            )}
          </form>
        </Modal>
      )}

      {/* Delete Confirmation Modal */}
      {canManageStock && (
        <ConfirmModal
          isOpen={Boolean(deletingItem)}
          title="Delete Inventory Item"
          message={`Are you sure you want to delete "${deletingItem?.name}" from inventory? This action cannot be undone.`}
          onClose={() => setDeletingItem(null)}
          onConfirm={async () => {
            if (!deletingItem) return;
            setDeleteLoading(true);
            try {
              await inventoryService.deleteInventoryItem(deletingItem.id);
              await fetchInventorySilently();
            } catch (e) {
              window.alert(e.message || 'The inventory record could not be deleted.');
            }
            setDeleteLoading(false);
            setDeletingItem(null);
          }}
          loading={deleteLoading}
        />
      )}
    </AdminLayout>
  );
};

export default Inventory;
