import React, { useContext, useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import AdminLayout from '../../components/layout/AdminLayout';
import PageHeader from '../../components/layout/PageHeader';
import OrderCard from '../../components/orders/OrderCard';
import OrderDetailsModal from '../../components/orders/OrderDetailsModal';
import SearchBar from '../../components/common/SearchBar';
import EmptyState from '../../components/common/EmptyState';
import Loader from '../../components/common/Loader';
import { OrderContext } from '../../context/OrderContext';
import { restaurantService } from '../../services/restaurantService';
import { useAuth } from '../../hooks/useAuth';
import EBillModal from '../../components/orders/EBillModal';
import { FiEye, FiGrid, FiList } from 'react-icons/fi';
import formatCurrency from '../../utils/formatCurrency';
import { formatOrderDisplayNumber } from '../../utils/orderNumber';

export const Orders = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { orders, loading, updateStatus, fetchOrders } = useContext(OrderContext);
  const [search, setSearch] = useState('');
  const [restaurants, setRestaurants] = useState([]);
  const [branchFilter, setBranchFilter] = useState('ALL');
  const [employeeFilter, setEmployeeFilter] = useState('ALL');
  const [employees, setEmployees] = useState([]);
  const [eBillOrder, setEBillOrder] = useState(null);

  const getInitialTab = () => {
    const p = (searchParams.get('status') || searchParams.get('tab') || '').toLowerCase();
    if (p.includes('pend')) return 'Pending';
    if (p.includes('prep')) return 'Preparing';
    if (p.includes('ready')) return 'Ready';
    if (p.includes('serv')) return 'Serving';
    if (p.includes('comp')) return 'Completed';
    if (p.includes('canc')) return 'Cancelled';
    return 'All';
  };

  const [activeTab, setActiveTab] = useState(getInitialTab);
  const [typeFilter, setTypeFilter] = useState('ALL'); // 'ALL' | 'DINE_IN' | 'TAKEAWAY'
  const [viewMode, setViewMode] = useState('table'); // 'table' | 'cards'
  const [paymentFilter, setPaymentFilter] = useState('ALL');
  const [selectedOrder, setSelectedOrder] = useState(null);

  const [serviceTaxEnabled, setServiceTaxEnabled] = useState(() => {
    try {
      const saved = localStorage.getItem('foodie_service_tax_enabled');
      return saved !== null ? saved !== 'false' : true;
    } catch (e) {
      return true;
    }
  });

  const handleToggleServiceTax = (enabled) => {
    setServiceTaxEnabled(enabled);
    try {
      localStorage.setItem('foodie_service_tax_enabled', String(enabled));
    } catch (e) {}
    window.dispatchEvent(new CustomEvent('foodie_service_tax_changed', { detail: { enabled } }));
  };

  const adjustOrderForServiceTax = (order) => {
    if (!order) return order;
    if (serviceTaxEnabled) return order;

    const originalService = Number(order.service_charge_amount ?? order.serviceCharge ?? 0);
    const taxable = Number(order.taxable_amount ?? 0);
    const gst = Number(order.gst_amount ?? order.tax ?? 0);

    let newTotal = Number(order.total ?? order.total_amount ?? 0);
    let newRoundOff = Number(order.round_off ?? order.roundOff ?? 0);

    if (taxable > 0 || gst > 0) {
      const rawTotal = taxable + gst;
      newTotal = Math.round(rawTotal);
      newRoundOff = Math.round((newTotal - rawTotal) * 100) / 100;
    } else if (originalService > 0) {
      newTotal = Math.max(0, Math.round(newTotal - originalService));
    }

    return {
      ...order,
      service_charge_amount: 0,
      serviceCharge: 0,
      service_charge_rate: 0,
      round_off: newRoundOff,
      roundOff: newRoundOff,
      total: newTotal,
      total_amount: newTotal,
    };
  };

  useEffect(() => {
    fetchOrders(false);
    restaurantService.getRestaurants()
      .then(res => {
        const raw = res?.data || (Array.isArray(res) ? res : (res?.results || []));
        setRestaurants(Array.isArray(raw) ? raw : []);
      })
      .catch(() => setRestaurants([]));

    if (user?.role === 'employee') return;
    import('../../services/adminApi').then(({ listEmployees }) => {
      listEmployees().then(setEmployees).catch(() => setEmployees([]));
    });
  }, [user?.role]);

  useEffect(() => {
    const tabFromUrl = getInitialTab();
    setActiveTab(tabFromUrl);
  }, [searchParams]);

  const tabs = ['All', 'Pending', 'Preparing', 'Ready', 'Serving', 'Completed', 'Cancelled'];

  const handleTabClick = (tab) => {
    setActiveTab(tab);
    if (tab === 'All') {
      searchParams.delete('status');
      searchParams.delete('tab');
      setSearchParams(searchParams);
    } else {
      setSearchParams({ status: tab });
    }
  };

  const filteredOrders = (orders || []).filter((o) => {
    if (!o || (!o.id && !o.order_id)) return false;

    let currentUser = user;
    if (!currentUser?.id) {
      try {
        const stored = localStorage.getItem('foodie_auth_admin') || sessionStorage.getItem('foodie_auth_admin');
        if (stored) currentUser = JSON.parse(stored);
      } catch {}
    }
    const isEmployee = currentUser?.role === 'employee' || ['STAFF', 'CHEF', 'CASHIER'].includes(currentUser?.backendRole || currentUser?.role);
    if (isEmployee && currentUser?.id) {
      const placedId = String(o.placedById || o.placed_by_id || o.employeeId || '');
      if (placedId !== String(currentUser.id)) {
        return false;
      }
    }

    // Branch filter
    if (branchFilter !== 'ALL' && String(o.branchId || o.branch_id || '') !== String(branchFilter)) {
      return false;
    }

    if (employeeFilter !== 'ALL') {
      const selected = employees.find((emp) => String(emp.id) === String(employeeFilter));
      const wantedUser = selected?.userId != null ? String(selected.userId) : String(employeeFilter);
      if (String(o.placedById || '') !== wantedUser) return false;
    }

    const rawSearch = search.trim().toLowerCase();
    let matchesSearch = true;
    if (rawSearch) {
      const orderIdStr = String(o.id || o.orderNumber || '').toLowerCase();
      const orderTableStr = String(o.table || '').toLowerCase();

      const cleanOrderTableDigits = orderTableStr.replace(/^(table\s*|t-?)/i, '').replace(/^0+/, '') || orderTableStr;
      const cleanSearchDigits = rawSearch.replace(/^(table\s*|t-?)/i, '').replace(/^0+/, '') || rawSearch;
      const isSimpleNumber = /^\d{1,2}$/.test(rawSearch);

      // Table matching
      const directTableMatch =
        orderTableStr === rawSearch ||
        orderTableStr.includes(rawSearch) ||
        `table ${orderTableStr}`.includes(rawSearch) ||
        `table ${cleanOrderTableDigits}`.includes(rawSearch);

      const numericTableMatch = Boolean(
        cleanSearchDigits &&
        cleanOrderTableDigits &&
        cleanSearchDigits === cleanOrderTableDigits
      );

      const tableMatch = directTableMatch || numericTableMatch;

      // Order ID matching
      const idMatch = isSimpleNumber
        ? (orderIdStr === rawSearch || orderIdStr === `#${rawSearch}` || orderIdStr.startsWith(rawSearch))
        : (orderIdStr.includes(rawSearch) || `#${orderIdStr}`.includes(rawSearch));

      matchesSearch = tableMatch || idMatch;
    }

    let matchesTab = activeTab === 'All';
    if (activeTab !== 'All') {
      const statusLower = String(o.status || '').toLowerCase().trim();
      const tabLower = activeTab.toLowerCase().trim();
      if (tabLower === 'pending') {
        matchesTab = statusLower === 'pending' || statusLower === 'confirmed' || statusLower === 'placed' || statusLower === 'new' || !statusLower;
      } else if (tabLower === 'preparing') {
        matchesTab = statusLower === 'preparing' || statusLower === 'cooking' || statusLower === 'accepted' || statusLower === 'in_kitchen';
      } else if (tabLower === 'ready') {
        matchesTab = statusLower === 'ready' || statusLower === 'prepared' || statusLower === 'out_for_delivery';
      } else if (tabLower === 'serving') {
        matchesTab = statusLower === 'serving' || statusLower === 'served';
      } else if (tabLower === 'completed') {
        matchesTab = statusLower === 'completed' || statusLower === 'delivered' || statusLower === 'done' || statusLower === 'settled';
      } else if (tabLower === 'cancelled') {
        matchesTab = statusLower === 'cancelled' || statusLower === 'rejected';
      } else {
        matchesTab = statusLower === tabLower;
      }
    }

    const pay = String(o.paymentStatus || o.payment_status || '').toUpperCase();
    const matchesPayment = paymentFilter === 'ALL' || pay === paymentFilter;

    let matchesType = true;
    if (typeFilter !== 'ALL') {
      const isTakeaway = String(o.orderType || o.order_type || o.source || '').toUpperCase().includes('TAKEAWAY') || 
        String(o.table || '').toLowerCase() === 'takeaway';
      if (typeFilter === 'DINE_IN' && isTakeaway) matchesType = false;
      if (typeFilter === 'TAKEAWAY' && !isTakeaway) matchesType = false;
    }

    return matchesSearch && matchesTab && matchesPayment && matchesType;
  });

  const handleContinueOrder = (ord) => {
    setSelectedOrder(null);
    const targetUrl = user?.role === 'employee' ? '/employee/pos' : '/admin/pos';
    const targetTableId = ord?.table_id || ord?.tableId || (typeof ord?.table === 'object' ? ord?.table?.id : ord?.table);
    const targetOrderId = ord?.parent_order_id || ord?.parent_order || ord?.id;
    const rawPhone = ord?.customer_phone || ord?.customerPhone || ord?.customer?.phone || '';
    const rawName = ord?.customer_name || ord?.customerName || ord?.customer?.name || '';
    const params = new URLSearchParams();
    if (targetTableId) params.set('table', targetTableId);
    if (targetOrderId) params.set('order', targetOrderId);
    params.set('continue', '1');
    if (rawPhone) params.set('phone', rawPhone);
    if (rawName) params.set('name', rawName);
    navigate(`${targetUrl}?${params.toString()}`);
  };

  if (loading && (!orders || orders.length === 0)) {
    return (
      <AdminLayout>
        <Loader />
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <PageHeader
        title="Manage Orders & Bills"
        showBackButton
        actions={
          orders && orders.length > 0 ? (
            <div className="d-flex align-items-center gap-2 flex-wrap">
              {/* Service Tax Checkbox / Toggle */}
              <div
                className="form-check form-switch d-flex align-items-center gap-2 m-0 bg-white border border-secondary-subtle rounded-pill px-3 py-1.5 shadow-xs"
                style={{ minHeight: '32px' }}
                title={user?.role === 'employee' ? 'Only administrators can change service tax' : 'Enable or disable service tax'}
              >
                <input
                  id="service-tax-toggle"
                  className="form-check-input m-0 cursor-pointer"
                  type="checkbox"
                  role="switch"
                  checked={serviceTaxEnabled}
                  onChange={(e) => handleToggleServiceTax(e.target.checked)}
                  disabled={user?.role === 'employee'}
                />
                <label
                  htmlFor="service-tax-toggle"
                  className="form-check-label small fw-bold text-dark cursor-pointer user-select-none text-nowrap"
                  style={{ fontSize: '12px' }}
                >
                  Service Tax
                </label>
              </div>
              {restaurants.length > 0 && (
                <select
                  value={branchFilter}
                  onChange={(e) => setBranchFilter(e.target.value)}
                  className="form-select form-select-sm rounded-pill border-secondary-subtle fw-semibold px-3 py-1.5"
                  style={{ width: '160px', fontSize: '12px', cursor: 'pointer', backgroundColor: '#ffffff' }}
                  aria-label="Filter by Branch"
                >
                  <option value="ALL">All Branches</option>
                  {restaurants.map(r => (
                    <option key={r.id} value={String(r.id)}>
                      {r.name || `Branch #${r.id}`}
                    </option>
                  ))}
                </select>
              )}
              <select
                value={paymentFilter}
                onChange={(e) => setPaymentFilter(e.target.value)}
                className="form-select form-select-sm rounded-pill border-secondary-subtle fw-semibold px-3 py-1.5"
                style={{ width: '140px', fontSize: '12px', cursor: 'pointer', backgroundColor: '#ffffff' }}
                aria-label="Filter by Payment Method"
              >
                <option value="ALL">All Payments</option>
                <option value="UNPAID">Unpaid</option>
                <option value="PENDING">Payment pending</option>
                <option value="PAID">Paid</option>
                <option value="FAILED">Failed</option>
              </select>
              {user?.role !== 'employee' && (
              <select
                value={employeeFilter}
                onChange={(e) => setEmployeeFilter(e.target.value)}
                className="form-select form-select-sm rounded-pill border-secondary-subtle fw-semibold px-3 py-1.5"
                style={{ width: '160px', fontSize: '12px', cursor: 'pointer', backgroundColor: '#ffffff' }}
                aria-label="Filter by Employee"
              >
                <option value="ALL">All Employees</option>
                {employees.map(emp => (
                  <option key={emp.id} value={String(emp.id)}>
                    {emp.name || emp.username || `Employee #${emp.id}`}
                  </option>
                ))}
              </select>
              )}
              <SearchBar
                placeholder="Search Order ID or Table..."
                value={search}
                onChange={setSearch}
                records={(orders || []).map((order) => ({
                  id: order.id,
                  label: String(order.orderNumber || order.id),
                  title: `Order ${order.orderNumber || order.id}`,
                  subtitle: [order.status, order.orderType || (order.table ? `Table ${order.table}` : '')].filter(Boolean).join(' · '),
                  searchText: [order.id, order.orderNumber, order.table, order.status, order.orderType, order.customerPhone].filter(Boolean).join(' '),
                }))}
                onSelectSuggestion={(item) => {
                  const found = (orders || []).find((order) => String(order.id) === String(item?.id));
                  if (found) setSelectedOrder(found);
                }}
              />
            </div>
          ) : null
        }
      />

      {/* Panel 12 Filter Toolbar: Segmented Type Pills & View Mode */}
      <div className="card rounded-4 border-0 shadow-sm p-3 mb-4 bg-white d-flex flex-row align-items-center justify-content-between flex-wrap gap-2">
        <div className="d-flex align-items-center gap-2 flex-wrap">
          {/* Segmented Type Pills */}
          <div className="p-1 rounded-pill d-inline-flex align-items-center" style={{ backgroundColor: 'var(--surface-muted, #F1F5F9)' }}>
            <button
              type="button"
              onClick={() => setTypeFilter('ALL')}
              className={`btn btn-sm rounded-pill px-3 py-1.5 fw-bold transition-all border-0 ${
                typeFilter === 'ALL' ? 'bg-danger text-white shadow-xs' : 'text-secondary bg-transparent'
              }`}
              style={{ fontSize: '12px' }}
            >
              All
            </button>
            <button
              type="button"
              onClick={() => setTypeFilter('DINE_IN')}
              className={`btn btn-sm rounded-pill px-3 py-1.5 fw-bold transition-all border-0 ${
                typeFilter === 'DINE_IN' ? 'bg-danger text-white shadow-xs' : 'text-secondary bg-transparent'
              }`}
              style={{ fontSize: '12px' }}
            >
              Dine-In
            </button>
            <button
              type="button"
              onClick={() => setTypeFilter('TAKEAWAY')}
              className={`btn btn-sm rounded-pill px-3 py-1.5 fw-bold transition-all border-0 ${
                typeFilter === 'TAKEAWAY' ? 'bg-danger text-white shadow-xs' : 'text-secondary bg-transparent'
              }`}
              style={{ fontSize: '12px' }}
            >
              Takeaway
            </button>
          </div>

          {/* Status Filter Dropdown */}
          <select
            value={activeTab}
            onChange={(e) => handleTabClick(e.target.value)}
            className="form-select form-select-sm rounded-pill border-light-subtle fw-semibold px-3 py-1.5"
            style={{ width: '150px', fontSize: '12.5px', backgroundColor: 'var(--surface-muted, #F8FAFC)' }}
            aria-label="Filter by order status"
          >
            {tabs.map((tab) => (
              <option key={tab} value={tab}>{tab === 'All' ? 'All Statuses' : tab}</option>
            ))}
          </select>
        </div>

        {/* View Mode Switcher: Table vs Cards */}
        <div className="d-flex align-items-center gap-1 bg-light rounded-pill p-1 border">
          <button
            type="button"
            onClick={() => setViewMode('table')}
            className={`btn btn-sm rounded-circle p-1.5 border-0 ${viewMode === 'table' ? 'bg-white text-danger shadow-xs' : 'text-secondary'}`}
            title="Table View"
          >
            <FiList size={16} />
          </button>
          <button
            type="button"
            onClick={() => setViewMode('cards')}
            className={`btn btn-sm rounded-circle p-1.5 border-0 ${viewMode === 'cards' ? 'bg-white text-danger shadow-xs' : 'text-secondary'}`}
            title="Cards View"
          >
            <FiGrid size={16} />
          </button>
        </div>
      </div>

      {/* Order List / Table */}
      {loading ? (
        <Loader />
      ) : filteredOrders.length === 0 ? (
        <EmptyState
          title={orders.length === 0 ? "No Orders Yet" : "No Orders Found"}
          description={
            orders.length === 0
              ? "There are currently no placed orders."
              : activeTab !== 'All'
                ? `There are currently no orders with "${activeTab}" status.`
                : "There are no orders matching this search or filter."
          }
          icon="bi-basket2-fill"
        />
      ) : viewMode === 'table' ? (
        <div className="card rounded-4 border-0 shadow-sm overflow-hidden bg-white mb-4">
          <div className="table-responsive">
            <table className="table align-middle mb-0">
              <thead className="bg-light-subtle">
                <tr className="text-secondary small fw-semibold" style={{ fontSize: '12px', borderBottom: '1px solid var(--border-color, #E2E8F0)' }}>
                  <th className="ps-4 py-3">Order #</th>
                  <th className="py-3">Table</th>
                  <th className="py-3">Type</th>
                  <th className="py-3">Amount</th>
                  <th className="py-3">Status</th>
                  <th className="py-3">Payment</th>
                  <th className="text-end pe-4 py-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredOrders.map((order) => {
                  const adj = adjustOrderForServiceTax(order);
                  const isTakeaway = String(order.orderType || order.order_type || order.source || '').toUpperCase().includes('TAKEAWAY') || 
                    String(order.table || '').toLowerCase() === 'takeaway';
                  const rawTable = order.table ? String(order.table).replace(/^(table\s*|t-?)/i, '').trim() : '';
                  const displayTable = isTakeaway ? '—' : (rawTable ? `T${rawTable.padStart(2, '0')}` : (order.table || '—'));
                  const displayNo = formatOrderDisplayNumber(order, order.id);
                  const isPaid = String(order.paymentStatus || order.payment_status || '').toUpperCase() === 'PAID';

                  // Status Badge Variant
                  const st = String(order.status || '').toLowerCase().trim();
                  let stVariant = 'bg-secondary-subtle text-secondary';
                  let stLabel = order.status;
                  if (['pending', 'placed', 'new'].includes(st)) {
                    stVariant = 'bg-warning-subtle text-warning-emphasis';
                    stLabel = 'New';
                  } else if (['preparing', 'cooking', 'in_kitchen'].includes(st)) {
                    stVariant = 'bg-info-subtle text-info-emphasis';
                    stLabel = 'Preparing';
                  } else if (['ready', 'prepared'].includes(st)) {
                    stVariant = 'bg-primary-subtle text-primary';
                    stLabel = 'Ready';
                  } else if (['completed', 'delivered', 'done', 'settled'].includes(st)) {
                    stVariant = 'bg-success-subtle text-success';
                    stLabel = 'Completed';
                  } else if (['cancelled', 'canceled', 'rejected'].includes(st)) {
                    stVariant = 'bg-danger-subtle text-danger';
                    stLabel = 'Cancelled';
                  }

                  return (
                    <tr key={order.id} className="border-bottom border-light">
                      <td className="ps-4 py-3 fw-bold text-dark font-monospace" style={{ fontSize: '13px' }}>
                        #{displayNo}
                      </td>
                      <td className="py-3 text-secondary fw-semibold" style={{ fontSize: '13px' }}>
                        {displayTable}
                      </td>
                      <td className="py-3 text-secondary" style={{ fontSize: '13px' }}>
                        {isTakeaway ? 'Takeaway' : 'Dine-In'}
                      </td>
                      <td className="py-3 fw-bold text-dark" style={{ fontSize: '13.5px' }}>
                        {formatCurrency(adj.total || adj.total_amount)}
                      </td>
                      <td className="py-3">
                        <span className={`badge rounded-pill fw-semibold px-2.5 py-1 ${stVariant}`} style={{ fontSize: '11px' }}>
                          {stLabel}
                        </span>
                      </td>
                      <td className="py-3">
                        <span className={`badge rounded-pill fw-semibold px-2.5 py-1 ${isPaid ? 'bg-success-subtle text-success' : 'bg-light text-secondary border'}`} style={{ fontSize: '11px' }}>
                          {isPaid ? 'Paid' : 'Unpaid'}
                        </span>
                      </td>
                      <td className="text-end pe-4 py-3">
                        <div className="d-flex align-items-center justify-content-end gap-1.5">
                          <button
                            type="button"
                            onClick={() => setSelectedOrder(order)}
                            className="btn btn-sm btn-outline-danger rounded-pill px-3 py-1 fw-bold"
                            style={{ fontSize: '11.5px' }}
                          >
                            View
                          </button>
                          <button
                            type="button"
                            onClick={() => setEBillOrder(adj)}
                            className="btn btn-sm btn-link text-secondary p-1 border-0"
                            title="View Bill"
                          >
                            <FiEye size={15} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="row">
          {filteredOrders.map((order) => (
            <div key={order.id} className="col-12">
              <OrderCard
                order={adjustOrderForServiceTax(order)}
                onViewDetails={(ord) => setSelectedOrder(ord)}
                onViewEBill={(ord) => setEBillOrder(ord)}
              />
            </div>
          ))}
        </div>
      )}

      {/* Detail Modal */}
      {selectedOrder && (
        <OrderDetailsModal
          isOpen={!!selectedOrder}
          order={selectedOrder}
          onClose={() => setSelectedOrder(null)}
          onStatusChange={updateStatus}
          onViewEBill={(ord) => setEBillOrder(ord || selectedOrder)}
          onContinueOrder={handleContinueOrder}
          onOrderUpdated={(updated) => {
            setSelectedOrder(updated);
            fetchOrders(false);
          }}
          onPaymentRecorded={async () => {
            await fetchOrders(false);
          }}
        />
      )}

      {/* E-Bill Modal */}
      {eBillOrder && (
        <EBillModal
          isOpen={!!eBillOrder}
          order={adjustOrderForServiceTax(eBillOrder)}
          onClose={() => setEBillOrder(null)}
          onProceedToBill={async (ord) => {
            const targetOrder = ord || eBillOrder;
            if (!targetOrder) return;
            const targetId = targetOrder.backendOrderId || targetOrder.id || targetOrder.order_id;
            if (!targetId) return;
            try {
              const { proceedToBill } = await import('../../services/adminApi');
              await proceedToBill(targetId);
              await fetchOrders(false);
              window.dispatchEvent(new CustomEvent('foodie_orders_updated', { detail: { orderId: targetId, status: 'Completed' } }));
              window.dispatchEvent(new CustomEvent('foodie_tables_updated', { detail: { orderId: targetId } }));
              setEBillOrder(prev => prev ? { ...prev, status: 'Completed', backendStatus: 'COMPLETED' } : null);
              setSelectedOrder(prev => (prev && String(prev.id) === String(targetId)) ? { ...prev, status: 'Completed', backendStatus: 'COMPLETED' } : prev);
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
    </AdminLayout>
  );
};

export default Orders;
