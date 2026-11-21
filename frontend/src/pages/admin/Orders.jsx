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
import { useBranch } from '../../context/BranchContext';
import EBillModal from '../../components/orders/EBillModal';
import Toast from '../../components/common/Toast';
import { FiEye, FiFileText, FiGrid, FiList, FiChevronDown, FiChevronRight, FiClock, FiCheck } from 'react-icons/fi';
import formatCurrency from '../../utils/formatCurrency';
import { formatOrderDisplayNumber } from '../../utils/orderNumber';

export const Orders = () => {
  const { user } = useAuth();
  const { workingBranchId, selectedBranch, primaryBranch } = useBranch();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { orders, setOrders, loading, updateStatus, fetchOrders } = useContext(OrderContext);
  const [search, setSearch] = useState('');
  const [restaurants, setRestaurants] = useState([]);
  const effectiveBranch = selectedBranch === 'ALL'
    ? 'ALL'
    : (selectedBranch || workingBranchId || (primaryBranch ? String(primaryBranch.id) : 'ALL'));
  const branchFilter = effectiveBranch;
  const [employeeFilter, setEmployeeFilter] = useState('ALL');
  const [employees, setEmployees] = useState([]);
  const [eBillOrder, setEBillOrder] = useState(null);
  const [toast, setToast] = useState({ show: false, message: '', type: 'add' });
  const [cleaningOrderId, setCleaningOrderId] = useState(null);
  const [cleanedOrders, setCleanedOrders] = useState(() => {
    try {
      return new Set(JSON.parse(localStorage.getItem('foodie_cleaned_order_ids') || '[]').map(String));
    } catch {
      return new Set();
    }
  });

  useEffect(() => {
    const handleStorage = (e) => {
      if (e.key === 'foodie_cleaned_order_ids') {
        try {
          setCleanedOrders(new Set(JSON.parse(e.newValue || '[]').map(String)));
        } catch {}
      }
    };
    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, []);

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
  const [viewMode, setViewMode] = useState(() => (typeof window !== 'undefined' && window.innerWidth < 768) ? 'cards' : 'table'); // 'table' | 'cards'
  const [paymentFilter, setPaymentFilter] = useState('ALL');
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [expandedParents, setExpandedParents] = useState(() => new Set());

  const toggleExpand = (parentId) => {
    if (!parentId) return;
    setExpandedParents((prev) => {
      const next = new Set(prev);
      const key = String(parentId);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

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
    // Note: OrderContext automatically loads staff orders when mounting on /admin/orders.
    // fetchOrders(false) here was redundant and triggered duplicate /orders/ API calls on navigation.
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

  // Handle opening order details when navigated with ?orderId= or ?order= (REQ-6)
  useEffect(() => {
    const targetOrderId = searchParams.get('orderId') || searchParams.get('order');
    if (!targetOrderId) return;
    if (orders && orders.length > 0) {
      const found = orders.find(o =>
        String(o.id) === String(targetOrderId) ||
        String(o.order_number) === String(targetOrderId) ||
        String(o.display_order_number) === String(targetOrderId)
      );
      if (found) {
        setSelectedOrder(found);
        if (found.parent_order_id) {
          setExpandedParents(prev => new Set(prev).add(String(found.parent_order_id)));
        } else {
          setExpandedParents(prev => new Set(prev).add(String(found.id)));
        }
        return;
      }
    }
    // Direct fetch fallback if order not yet loaded in context
    import('../../services/adminApi').then(({ getStaffOrder }) => {
      getStaffOrder(targetOrderId).then(ord => {
        if (ord) {
          setSelectedOrder(ord);
          if (ord.parent_order_id) {
            setExpandedParents(prev => new Set(prev).add(String(ord.parent_order_id)));
          } else {
            setExpandedParents(prev => new Set(prev).add(String(ord.id)));
          }
        }
      }).catch(() => {});
    });
  }, [searchParams, orders]);

  const handleCleanTable = async (ord) => {
    const tableId = ord.tableId || ord.table_id || (typeof ord.table === 'object' ? ord.table?.id : null);
    if (!tableId) {
      setToast({ show: true, message: 'No table assigned to this order.', type: 'remove' });
      return;
    }
    setCleaningOrderId(ord.id);
    try {
      const { tableService } = await import('../../services/tableService');
      await tableService.cleanTable(tableId);
      const ordIdStr = String(ord.id);
      setCleanedOrders((prev) => {
        const next = new Set(prev);
        next.add(ordIdStr);
        try {
          localStorage.setItem('foodie_cleaned_order_ids', JSON.stringify([...next]));
        } catch {}
        return next;
      });
      setToast({ show: true, message: 'Table marked as Cleaned!', type: 'add' });
      window.dispatchEvent(new CustomEvent('foodie_tables_updated'));
      window.dispatchEvent(new CustomEvent('foodie_orders_updated'));
      await fetchOrders(false);
    } catch (err) {
      console.error('Failed to clean table:', err);
      setToast({ show: true, message: err?.message || 'Could not clean table.', type: 'remove' });
    } finally {
      setCleaningOrderId(null);
    }
  };

  const renderTableStatusBadge = (order, isPaid, isSelfService, isTakeaway) => {
    // 1. Takeaway orders: show '—'
    if (isTakeaway) {
      return <span className="text-muted fw-semibold">—</span>;
    }

    // 2. Self Service orders: show '—'
    if (isSelfService) {
      return <span className="text-muted fw-semibold">—</span>;
    }

    // 3. Check if order has a table assigned
    const hasTable = Boolean(
      order.tableId ||
      order.table_id ||
      (typeof order.table === 'object' && order.table?.id) ||
      (typeof order.table === 'string' && order.table.trim() && !['takeaway', 'self service'].includes(order.table.toLowerCase().trim()))
    );

    if (!hasTable) {
      return <span className="text-muted fw-semibold">—</span>;
    }

    // 4. Check order completion status
    const isCompletedSt = ['completed', 'delivered', 'done', 'settled'].includes(
      String(order.status || order.backendStatus || '').toLowerCase().trim()
    );

    // 5. Disabled cases:
    // If Payment = Unpaid OR Order Status is Pending / Preparing / Ready / Serving / Cancelled
    if (!isPaid || !isCompletedSt) {
      return (
        <span
          className="badge rounded-pill fw-medium px-2.5 py-1 text-muted"
          style={{
            backgroundColor: '#F1F5F9',
            color: '#64748B',
            border: '1px solid #E2E8F0',
            fontSize: '11px',
            letterSpacing: '0.2px'
          }}
          title={!isPaid ? 'Payment must be Paid before table can be cleaned' : 'Order must be Completed before table can be cleaned'}
        >
          Not Available
        </span>
      );
    }

    // 6. Dine-In Orders with Payment = Paid AND Order Status = Completed:
    const isCleaned = cleanedOrders.has(String(order.id));
    const isCleaning = cleaningOrderId === order.id;

    if (isCleaned) {
      return (
        <span
          className="badge rounded-pill fw-semibold px-2.5 py-1 d-inline-flex align-items-center gap-1"
          style={{
            backgroundColor: 'rgba(22, 163, 74, 0.1)',
            color: '#16A34A',
            border: '1px solid rgba(22, 163, 74, 0.25)',
            fontSize: '11px'
          }}
          title="Table is cleaned and available"
        >
          <FiCheck size={12} className="text-success" />
          Cleaned
        </span>
      );
    }

    return (
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          handleCleanTable(order);
        }}
        disabled={isCleaning}
        className="btn btn-sm rounded-pill fw-semibold px-3 py-1.5 d-inline-flex align-items-center gap-2 shadow-xs border"
        style={{
          backgroundColor: '#FEE2E2',
          color: '#DC2626',
          borderColor: '#FECACA',
          fontSize: '11.5px',
          cursor: isCleaning ? 'wait' : 'pointer',
          transition: 'all 0.15s ease'
        }}
        onMouseEnter={(e) => {
          if (!isCleaning) {
            e.currentTarget.style.backgroundColor = '#FCDADA';
            e.currentTarget.style.borderColor = '#F87171';
          }
        }}
        onMouseLeave={(e) => {
          if (!isCleaning) {
            e.currentTarget.style.backgroundColor = '#FEE2E2';
            e.currentTarget.style.borderColor = '#FECACA';
          }
        }}
        title="Click to mark table as Cleaned"
        aria-label="Mark Table Cleaned"
      >
        <span
          style={{
            width: '7px',
            height: '7px',
            borderRadius: '50%',
            backgroundColor: '#DC2626',
            display: 'inline-block'
          }}
        />
        {isCleaning ? 'Cleaning...' : 'Ready To Clean'}
      </button>
    );
  };

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

  // Detect if an order is a suborder (continuation of a parent order)
  const isSuborder = (order) => {
    if (!order) return false;
    if (order.parent_order_id || (typeof order.parent_order === 'object' && order.parent_order?.id) || order.parent_order || order.parentOrderId) {
      return true;
    }
    if (order.continuation_index && Number(order.continuation_index) > 0) {
      return true;
    }
    const disp = String(order.display_order_number || order.orderNumber || order.display_number || '');
    if (disp.includes('.') && /^\d+\.\d+/.test(disp)) {
      return true;
    }
    return false;
  };

  const getParentKey = (order) => {
    if (!order) return null;
    const pId = order.parent_order_id || (typeof order.parent_order === 'object' ? order.parent_order?.id : order.parent_order) || order.parentOrderId;
    if (pId) return String(pId);
    const disp = String(order.display_order_number || order.orderNumber || order.display_number || '');
    if (disp.includes('.')) {
      const rootPart = disp.split('.')[0].replace(/^#/, '').trim();
      if (rootPart) return rootPart;
    }
    return null;
  };

  // Group suborders by parent order ID / key
  const subordersMap = React.useMemo(() => {
    const map = new Map();

    // 1. Group any standalone suborders from orders list
    (orders || []).forEach((o) => {
      if (isSuborder(o)) {
        const pKey = getParentKey(o);
        if (pKey) {
          if (!map.has(pKey)) map.set(pKey, []);
          const list = map.get(pKey);
          if (!list.some((existing) => String(existing.id) === String(o.id))) {
            list.push(o);
          }
        }
      }
    });

    // 2. Merge any continuations attached to parent orders
    (orders || []).forEach((p) => {
      if (!isSuborder(p) && Array.isArray(p.continuations) && p.continuations.length > 0) {
        const pKey = String(p.id);
        if (!map.has(pKey)) map.set(pKey, []);
        const list = map.get(pKey);
        p.continuations.forEach((c) => {
          const exists = list.some((existing) => String(existing.id) === String(c.id));
          if (!exists) {
            const fullMatch = (orders || []).find((ord) => String(ord.id) === String(c.id));
            list.push(
              fullMatch || {
                ...c,
                parent_order_id: p.id,
                table: p.table,
                orderType: p.orderType,
                customerName: p.customerName || p.customer_name,
                customerPhone: p.customerPhone || p.customer_phone,
                total: Number(c.total_amount || 0),
                total_amount: c.total_amount,
                status: c.status,
                paymentStatus: c.payment_status || 'UNPAID',
                time: c.created_at
                  ? new Date(c.created_at).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true })
                  : p.time,
                date: c.created_at
                  ? new Date(c.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
                  : p.date,
              }
            );
          }
        });
      }
    });

    // 3. Sort suborders by continuation index or id
    map.forEach((list) => {
      list.sort((a, b) => {
        const idxA = Number(a.continuation_index || 0);
        const idxB = Number(b.continuation_index || 0);
        if (idxA !== idxB) return idxA - idxB;
        return Number(a.id || 0) - Number(b.id || 0);
      });
    });

    return map;
  }, [orders]);

  // Canonical Serial Numbering Map for Parent Orders:
  // Maintains consistent, authoritative numbering matching backend database records across all screens
  const parentSerialMap = React.useMemo(() => {
    const map = new Map();

    (orders || []).forEach((parent) => {
      if (!isSuborder(parent)) {
        const canonicalDisplay = formatOrderDisplayNumber(parent, parent.id);
        map.set(String(parent.id), String(canonicalDisplay));
        if (parent.orderNumber) {
          map.set(String(parent.orderNumber), String(canonicalDisplay));
        }
      }
    });

    return map;
  }, [orders]);

  // Criteria matcher for an individual order or suborder
  const matchesOrderCriteria = (o, searchStr, tab, payFilter, tFilter, bFilter, empFilter) => {
    if (!o || (!o.id && !o.order_id)) return false;

    let currentUser = user;
    if (!currentUser?.id) {
      try {
        const stored = localStorage.getItem('foodie_auth_admin') || sessionStorage.getItem('foodie_auth_admin');
        if (stored) currentUser = JSON.parse(stored);
      } catch {}
    }
    const isEmployee =
      currentUser?.role === 'employee' ||
      ['STAFF', 'CHEF', 'CASHIER'].includes(currentUser?.backendRole || currentUser?.role);
    if (isEmployee && currentUser?.id) {
      const placedId = String(o.placedById || o.placed_by_id || o.employeeId || '');
      if (placedId && placedId !== String(currentUser.id)) {
        return false;
      }
    }

    // Branch filter
    if (bFilter && bFilter !== 'ALL') {
      const ordBranch = o.branchId || o.branch_id || (typeof o.branch === 'object' ? o.branch?.id : o.branch);
      if (!ordBranch || String(ordBranch) !== String(bFilter)) {
        return false;
      }
    }

    // Employee filter
    if (empFilter !== 'ALL') {
      const selected = employees.find((emp) => String(emp.id) === String(empFilter));
      const wantedUser = selected?.userId != null ? String(selected.userId) : String(empFilter);
      if (String(o.placedById || '') !== wantedUser) return false;
    }

    // Search filter
    if (searchStr && searchStr.trim()) {
      const rawSearch = searchStr.trim().toLowerCase();
      const cleanSearch = rawSearch.replace(/^#/, '');
      const orderIdStr = String(o.id || o.orderNumber || '').toLowerCase();
      const orderTableStr = String(o.table || '').toLowerCase();

      const cleanOrderTableDigits = orderTableStr.replace(/^(table\s*|t-?)/i, '').replace(/^0+/, '') || orderTableStr;
      const cleanSearchDigits = cleanSearch.replace(/^(table\s*|t-?)/i, '').replace(/^0+/, '') || cleanSearch;

      // Table matching
      const directTableMatch =
        orderTableStr === cleanSearch ||
        orderTableStr.includes(cleanSearch) ||
        `table ${orderTableStr}`.includes(cleanSearch) ||
        `table ${cleanOrderTableDigits}`.includes(cleanSearch);

      const numericTableMatch = Boolean(
        cleanSearchDigits &&
        cleanOrderTableDigits &&
        cleanSearchDigits === cleanOrderTableDigits
      );

      const tableMatch = directTableMatch || numericTableMatch;

      // Order ID / Display number / Serial number matching
      const parentSerial = parentSerialMap ? parentSerialMap.get(String(o.id)) : null;
      const displayNo = String(parentSerial || formatOrderDisplayNumber(o, o.id) || '').toLowerCase();
      const parentIdStr = String(o.parent_order_id || o.parent_order || o.parentOrderId || '').toLowerCase();

      const idMatch =
        orderIdStr === cleanSearch ||
        orderIdStr.includes(cleanSearch) ||
        displayNo === cleanSearch ||
        displayNo.includes(cleanSearch) ||
        (parentSerial && (parentSerial === cleanSearch || `#${parentSerial}` === cleanSearch)) ||
        parentIdStr === cleanSearch;

      const customerMatch =
        (o.customerName && o.customerName.toLowerCase().includes(rawSearch)) ||
        (o.customer_name && o.customer_name.toLowerCase().includes(rawSearch)) ||
        (o.customerPhone && o.customerPhone.includes(rawSearch)) ||
        (o.customer_phone && o.customer_phone.includes(rawSearch));

      if (!tableMatch && !idMatch && !customerMatch) {
        return false;
      }
    }

    // Tab status filter
    if (tab !== 'All') {
      const statusLower = String(o.status || o.backendStatus || '').toLowerCase().trim();
      const tabLower = tab.toLowerCase().trim();
      let matchesTab = false;
      if (tabLower === 'pending') {
        matchesTab =
          statusLower === 'pending' ||
          statusLower === 'confirmed' ||
          statusLower === 'placed' ||
          statusLower === 'new' ||
          !statusLower;
      } else if (tabLower === 'preparing') {
        matchesTab =
          statusLower === 'preparing' ||
          statusLower === 'cooking' ||
          statusLower === 'accepted' ||
          statusLower === 'in_kitchen';
      } else if (tabLower === 'ready') {
        matchesTab = statusLower === 'ready' || statusLower === 'prepared' || statusLower === 'out_for_delivery';
      } else if (tabLower === 'serving') {
        matchesTab = statusLower === 'serving' || statusLower === 'served';
      } else if (tabLower === 'completed') {
        matchesTab =
          statusLower === 'completed' ||
          statusLower === 'delivered' ||
          statusLower === 'done' ||
          statusLower === 'settled';
      } else if (tabLower === 'cancelled') {
        matchesTab = statusLower === 'cancelled' || statusLower === 'rejected';
      } else {
        matchesTab = statusLower === tabLower;
      }
      if (!matchesTab) return false;
    }

    // Payment filter
    if (payFilter !== 'ALL') {
      const pay = String(o.paymentStatus || o.payment_status || '').toUpperCase();
      const isPaid = pay === 'PAID' || pay === 'COUNTER_PAID' || o.is_paid || o.isPaid;
      if (payFilter === 'PAID' && !isPaid) return false;
      if (payFilter === 'UNPAID' && isPaid) return false;
    }

    // Type filter
    if (tFilter !== 'ALL') {
      const isSelfService =
        String(o.orderType || o.order_type || o.source || '').toUpperCase().includes('SELF_SERVICE') ||
        String(o.orderType || o.order_type || '').toLowerCase().includes('self service') ||
        String(o.table || '').toLowerCase() === 'self service';
      const isTakeaway = !isSelfService && (
        String(o.orderType || o.order_type || o.source || '').toUpperCase().includes('TAKEAWAY') ||
        String(o.table || '').toLowerCase() === 'takeaway'
      );
      const isDineIn = !isSelfService && !isTakeaway;

      if (tFilter === 'DINE_IN' && !isDineIn) return false;
      if (tFilter === 'TAKEAWAY' && !isTakeaway) return false;
      if (tFilter === 'SELF_SERVICE' && !isSelfService) return false;
    }

    return true;
  };

  // Extract and sort root parent orders strictly by parent serial sequence descending
  const rootOrders = React.useMemo(() => {
    const parents = (orders || []).filter((o) => !isSuborder(o));
    return parents.sort((a, b) => {
      const serialA = Number(parentSerialMap.get(String(a.id)) || a.id);
      const serialB = Number(parentSerialMap.get(String(b.id)) || b.id);
      if (!isNaN(serialA) && !isNaN(serialB) && serialA !== serialB) {
        return serialB - serialA; // Descending: #114, #113, #112, #111, #110
      }
      const timeA = a.rawCreatedAt || (a.created_at ? new Date(a.created_at).getTime() : Number(a.id) || 0);
      const timeB = b.rawCreatedAt || (b.created_at ? new Date(b.created_at).getTime() : Number(b.id) || 0);
      return timeB - timeA;
    });
  }, [orders, parentSerialMap]);

  // Determine which parent orders match and which suborders trigger auto-expansion
  const { filteredParentOrders, autoExpandedParentIds } = React.useMemo(() => {
    const autoExpand = new Set();
    const filtered = [];
    const searchTrimmed = search.trim().toLowerCase();
    const cleanSearchQuery = searchTrimmed.replace(/^#/, '');

    rootOrders.forEach((parent) => {
      const pKey = String(parent.id);
      const suborders = subordersMap.get(pKey) || subordersMap.get(String(parent.orderNumber)) || [];

      const parentMatches = matchesOrderCriteria(
        parent,
        search,
        activeTab,
        paymentFilter,
        typeFilter,
        branchFilter,
        employeeFilter
      );

      const matchingSuborders = suborders.filter((sub) =>
        matchesOrderCriteria(sub, search, activeTab, paymentFilter, typeFilter, branchFilter, employeeFilter)
      );

      // If search query matches a suborder display number or ID, auto-expand parent
      if (cleanSearchQuery) {
        const parentSerial = parentSerialMap.get(pKey) || formatOrderDisplayNumber(parent, parent.id);
        const subMatchesSearch = suborders.some((sub, sIdx) => {
          const subSerial = `${parentSerial}-${sub.continuation_index || (sIdx + 1)}`;
          const subDisplay = String(formatOrderDisplayNumber(sub, sub.id) || '').toLowerCase();
          const cleanSub = subDisplay.replace(/^#/, '');
          return (
            subSerial === cleanSearchQuery ||
            `#${subSerial}` === cleanSearchQuery ||
            cleanSub === cleanSearchQuery ||
            cleanSub.includes(cleanSearchQuery) ||
            String(sub.id) === cleanSearchQuery
          );
        });
        if (subMatchesSearch) {
          autoExpand.add(pKey);
        }
      }

      if (parentMatches || matchingSuborders.length > 0) {
        filtered.push(parent);
      }
    });

    return { filteredParentOrders: filtered, autoExpandedParentIds: autoExpand };
  }, [rootOrders, subordersMap, parentSerialMap, search, activeTab, paymentFilter, typeFilter, branchFilter, employeeFilter]);

  const isExpanded = (parentId) => {
    const key = String(parentId);
    return expandedParents.has(key) || autoExpandedParentIds.has(key);
  };

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
              <select
                value={paymentFilter}
                onChange={(e) => setPaymentFilter(e.target.value)}
                className="form-select form-select-sm rounded-pill border-secondary-subtle fw-semibold px-3 py-1.5"
                style={{ width: '140px', fontSize: '12px', cursor: 'pointer', backgroundColor: '#ffffff' }}
                aria-label="Filter by Payment Method"
              >
                <option value="ALL">All Payments</option>
                <option value="UNPAID">Unpaid</option>
                <option value="PAID">Paid</option>
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
                records={rootOrders.map((order) => {
                  const serial = parentSerialMap.get(String(order.id)) || formatOrderDisplayNumber(order, order.id);
                  return {
                    id: order.id,
                    label: String(serial),
                    title: `Order #${serial}`,
                    subtitle: [order.status, order.orderType || (order.table ? `Table ${order.table}` : '')].filter(Boolean).join(' · '),
                    searchText: [order.id, serial, `#${serial}`, order.orderNumber, order.table, order.status, order.orderType, order.customerPhone].filter(Boolean).join(' '),
                  };
                })}
                onSelectSuggestion={(item) => {
                  const found = (orders || []).find((order) => String(order.id) === String(item?.id));
                  if (found) {
                    const serial = parentSerialMap.get(String(found.id)) || formatOrderDisplayNumber(found, found.id);
                    setSelectedOrder({ ...found, serialNumber: serial, display_order_number: serial });
                  }
                }}
              />
            </div>
          ) : null
        }
      />

      {/* Panel 12 Filter Toolbar: Segmented Type Pills & View Mode */}
      <div 
        className="card rounded-4 border shadow-sm p-3 mb-4 d-flex flex-row align-items-center justify-content-between flex-wrap gap-2"
        style={{ backgroundColor: 'var(--surface-color)', borderColor: 'var(--border-color)' }}
      >
        <div className="d-flex align-items-center gap-2 flex-wrap">
          {/* Segmented Type Pills */}
          <div className="p-1 rounded-pill d-inline-flex align-items-center" style={{ backgroundColor: 'var(--surface-muted, #F1F5F9)' }}>
            <button
              type="button"
              onClick={() => setTypeFilter('ALL')}
              className={`btn btn-sm rounded-pill px-3 py-1.5 fw-bold transition-all border-0 ${
                typeFilter === 'ALL' ? 'text-white shadow-xs' : 'text-secondary bg-transparent'
              }`}
              style={{ fontSize: '12px', backgroundColor: typeFilter === 'ALL' ? 'var(--primary-color, #F20D2D)' : 'transparent' }}
            >
              All Orders
            </button>
            <button
              type="button"
              onClick={() => setTypeFilter('DINE_IN')}
              className={`btn btn-sm rounded-pill px-3 py-1.5 fw-bold transition-all border-0 ${
                typeFilter === 'DINE_IN' ? 'text-white shadow-xs' : 'text-secondary bg-transparent'
              }`}
              style={{ fontSize: '12px', backgroundColor: typeFilter === 'DINE_IN' ? 'var(--primary-color, #F20D2D)' : 'transparent' }}
            >
              Dine-In
            </button>
            <button
              type="button"
              onClick={() => setTypeFilter('TAKEAWAY')}
              className={`btn btn-sm rounded-pill px-3 py-1.5 fw-bold transition-all border-0 ${
                typeFilter === 'TAKEAWAY' ? 'text-white shadow-xs' : 'text-secondary bg-transparent'
              }`}
              style={{ fontSize: '12px', backgroundColor: typeFilter === 'TAKEAWAY' ? 'var(--primary-color, #F20D2D)' : 'transparent' }}
            >
              Takeaway
            </button>
            <button
              type="button"
              onClick={() => setTypeFilter('SELF_SERVICE')}
              className={`btn btn-sm rounded-pill px-3 py-1.5 fw-bold transition-all border-0 ${
                typeFilter === 'SELF_SERVICE' ? 'text-white shadow-xs' : 'text-secondary bg-transparent'
              }`}
              style={{ fontSize: '12px', backgroundColor: typeFilter === 'SELF_SERVICE' ? 'var(--primary-color, #F20D2D)' : 'transparent' }}
            >
              Self Service
            </button>
          </div>

          {/* Order Status Filter Pills */}
          <div className="p-1 rounded-pill d-inline-flex align-items-center flex-wrap gap-1" style={{ backgroundColor: 'var(--surface-muted, #F1F5F9)' }}>
            {tabs.map((tab) => {
              const isActive = activeTab === tab;
              return (
                <button
                  key={tab}
                  type="button"
                  onClick={() => handleTabClick(tab)}
                  className={`btn btn-sm rounded-pill px-3 py-1.5 fw-bold transition-all border-0 ${
                    isActive ? 'bg-danger text-white shadow-xs' : 'text-secondary bg-transparent'
                  }`}
                  style={{ fontSize: '12px' }}
                >
                  {tab}
                </button>
              );
            })}
          </div>
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
      ) : filteredParentOrders.length === 0 ? (
        <EmptyState
          title={rootOrders.length === 0 ? "No Orders Yet" : "No Orders Found"}
          description={
            rootOrders.length === 0
              ? "There are currently no placed orders."
              : activeTab !== 'All'
                ? `There are currently no orders with "${activeTab}" status.`
                : "There are no orders matching this search or filter."
          }
          icon="bi-basket2-fill"
        />
      ) : viewMode === 'table' ? (
        <div 
          className="card rounded-4 border shadow-sm overflow-hidden mb-4"
          style={{ backgroundColor: 'var(--surface-color)', borderColor: 'var(--border-color)' }}
        >
          <div className="table-responsive">
            <table className="table align-middle mb-0" style={{ backgroundColor: 'transparent' }}>
              <thead>
                <tr className="small fw-semibold" style={{ fontSize: '12px', backgroundColor: 'var(--background-color)', borderBottom: '1px solid var(--border-color)', color: 'var(--text-secondary)' }}>
                  <th className="ps-4 py-3">Order No</th>
                  <th className="py-3">Table</th>
                  <th className="py-3">Order Type</th>
                  <th className="py-3">Customer</th>
                  <th className="py-3">Amount</th>
                  <th className="py-3">Status</th>
                  <th className="py-3">Payment</th>
                  <th className="py-3">Table Status</th>
                  <th className="text-end pe-4 py-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredParentOrders.map((order) => {
                  const pKey = String(order.id);
                  const suborders = subordersMap.get(pKey) || subordersMap.get(String(order.orderNumber)) || [];
                  const expanded = isExpanded(order.id);
                  const hasSuborders = suborders.length > 0;
                  const adj = adjustOrderForServiceTax(order);
                  const isSelfService = String(order.orderType || order.order_type || order.source || '').toUpperCase().includes('SELF_SERVICE') || 
                    String(order.orderType || order.order_type || '').toLowerCase().includes('self service') ||
                    String(order.table || '').toLowerCase() === 'self service';
                  const isTakeaway = !isSelfService && (String(order.orderType || order.order_type || order.source || '').toUpperCase().includes('TAKEAWAY') || 
                    String(order.table || '').toLowerCase() === 'takeaway');
                  const rawTable = order.table ? String(order.table).replace(/^(table\s*|t-?)/i, '').trim() : '';
                  const displayTable = isSelfService ? 'Self Service' : (isTakeaway ? '—' : (rawTable ? `T${rawTable.padStart(2, '0')}` : (order.table || '—')));
                  const parentSerial = parentSerialMap.get(pKey) || formatOrderDisplayNumber(order, order.id);
                  const displayNo = parentSerial;
                  const isCounterPaid = isSelfService || String(order.paymentStatus || order.payment_status || '').toUpperCase() === 'COUNTER_PAID';
                  const isPaid = isCounterPaid || String(order.paymentStatus || order.payment_status || '').toUpperCase() === 'PAID' || Boolean(order.is_paid || order.isPaid);
                  const customerDisplay = order.customerName || order.customer_name || (order.customerPhone || order.customer_phone ? order.customerPhone || order.customer_phone : 'Walk-in');

                  // Status Badge Variant
                  const st = String(order.status || order.backendStatus || '').toLowerCase().trim();
                  let stVariant = 'bg-secondary-subtle text-secondary';
                  let stLabel = order.status || 'Pending';
                  if (['pending', 'placed', 'new'].includes(st)) {
                    stVariant = 'bg-secondary-subtle text-secondary border';
                    stLabel = 'Pending';
                  } else if (['preparing', 'cooking', 'in_kitchen'].includes(st)) {
                    stVariant = 'bg-warning-subtle text-warning-emphasis border border-warning-subtle';
                    stLabel = 'Preparing';
                  } else if (['ready', 'prepared'].includes(st)) {
                    stVariant = 'bg-info-subtle text-info-emphasis border border-info-subtle';
                    stLabel = 'Ready';
                  } else if (['serving', 'served'].includes(st)) {
                    stVariant = 'bg-primary-light text-danger border border-danger-subtle';
                    stLabel = 'Serving';
                  } else if (['completed', 'delivered', 'done', 'settled'].includes(st)) {
                    stVariant = 'bg-success-subtle text-success border border-success-subtle';
                    stLabel = 'Completed';
                  } else if (['cancelled', 'canceled', 'rejected'].includes(st)) {
                    stVariant = 'bg-danger-subtle text-danger border border-danger-subtle';
                    stLabel = 'Cancelled';
                  }

                  return (
                    <React.Fragment key={order.id}>
                      {/* Parent Order Row */}
                      <tr 
                        style={{ 
                          borderBottom: hasSuborders && expanded ? 'none' : '1px solid var(--border-subtle)',
                          cursor: hasSuborders ? 'pointer' : 'default',
                          backgroundColor: expanded && hasSuborders ? 'rgba(242, 13, 45, 0.02)' : 'transparent',
                          transition: 'background-color 0.15s ease'
                        }}
                        onClick={() => {
                          if (hasSuborders) toggleExpand(order.id);
                        }}
                      >
                        <td className="ps-4 py-3 fw-bold font-monospace" style={{ fontSize: '13px', color: 'var(--text-primary)' }}>
                          <div className="d-flex align-items-center gap-1.5 flex-wrap">
                            {hasSuborders ? (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  toggleExpand(order.id);
                                }}
                                className="btn btn-sm p-0 border-0 text-secondary d-inline-flex align-items-center justify-content-center me-1"
                                style={{ width: '22px', height: '22px' }}
                                aria-label={expanded ? "Collapse suborders" : "Expand suborders"}
                                title={expanded ? "Collapse suborders" : "Expand suborders"}
                              >
                                {expanded ? (
                                  <FiChevronDown size={17} className="text-danger fw-bold" />
                                ) : (
                                  <FiChevronRight size={17} />
                                )}
                              </button>
                            ) : (
                              <span style={{ width: '22px', display: 'inline-block' }} />
                            )}
                            <span>#{displayNo}</span>
                            {hasSuborders && (
                              <span 
                                className="badge rounded-pill border fw-semibold ms-1"
                                style={{ 
                                  fontSize: '10.5px', 
                                  backgroundColor: expanded ? 'rgba(242, 13, 45, 0.08)' : '#f1f5f9',
                                  color: expanded ? 'var(--primary-color, #F20D2D)' : '#64748b',
                                  borderColor: expanded ? 'rgba(242, 13, 45, 0.2)' : '#e2e8f0'
                                }}
                              >
                                {suborders.length} {suborders.length === 1 ? 'suborder' : 'suborders'}
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="py-3 fw-semibold" style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
                          {displayTable}
                        </td>
                        <td className="py-3" style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
                          <span 
                            className="badge rounded-pill px-2.5 py-1" 
                            style={{ 
                              backgroundColor: isSelfService ? 'rgba(16, 185, 129, 0.1)' : isTakeaway ? 'rgba(37, 99, 235, 0.1)' : 'rgba(242, 13, 45, 0.08)', 
                              color: isSelfService ? '#059669' : isTakeaway ? '#2563EB' : 'var(--primary-color)' 
                            }}
                          >
                            {isSelfService ? 'Self Service' : isTakeaway ? 'Takeaway' : 'Dine-In'}
                          </span>
                        </td>
                        <td className="py-3 fw-medium text-truncate" style={{ fontSize: '13px', maxWidth: '140px', color: 'var(--text-primary)' }}>
                          {customerDisplay}
                        </td>
                        <td className="py-3 fw-bold" style={{ fontSize: '13.5px', color: 'var(--text-primary)' }}>
                          {formatCurrency(adj.total || adj.total_amount)}
                        </td>
                        <td className="py-3">
                          <span className={`badge rounded-pill fw-semibold px-2.5 py-1 ${stVariant}`} style={{ fontSize: '11px' }}>
                            ● {stLabel}
                          </span>
                        </td>
                        <td className="py-3">
                          <div className="d-flex flex-column align-items-start gap-1">
                            {isCounterPaid ? (
                              <span className="badge rounded-pill fw-semibold px-2.5 py-1 d-inline-flex align-items-center gap-1.5" style={{ fontSize: '11px', backgroundColor: '#DCFCE7', color: '#16A34A', border: '1px solid #BBF7D0' }}>
                                <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: '#16A34A' }} />
                                Counter Paid
                              </span>
                            ) : isPaid ? (
                              <span className="badge rounded-pill fw-semibold px-2.5 py-1 d-inline-flex align-items-center gap-1.5" style={{ fontSize: '11px', backgroundColor: '#DCFCE7', color: '#16A34A', border: '1px solid #BBF7D0' }}>
                                <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: '#16A34A' }} />
                                Paid
                              </span>
                            ) : (String(order.paymentStatus || order.payment_status || '').toUpperCase() === 'PENDING' || String(order.payment_method || '').toUpperCase() === 'UPI') ? (
                              <span className="badge rounded-pill fw-semibold px-2.5 py-1 d-inline-flex align-items-center gap-1.5" style={{ fontSize: '11px', backgroundColor: '#FEF3C7', color: '#B45309', border: '1px solid #FCD34D' }}>
                                <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: '#D97706' }} />
                                Pending Verification
                              </span>
                            ) : (
                              <span className="badge rounded-pill fw-semibold px-2.5 py-1 d-inline-flex align-items-center gap-1.5 mt-0.5" style={{ fontSize: '11px', backgroundColor: '#FEE2E2', color: '#DC2626', border: '1px solid #FECACA' }}>
                                <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: '#DC2626' }} />
                                Unpaid
                              </span>
                            )}
                            {(order.paymentMethodName || order.payment_method) && !isCounterPaid && (
                              <span className="text-secondary small fw-medium" style={{ fontSize: '10.5px' }}>
                                {String(order.paymentMethodName || order.payment_method).toUpperCase()}
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="py-3" onClick={(e) => e.stopPropagation()}>
                          {renderTableStatusBadge(order, isPaid, isSelfService, isTakeaway)}
                        </td>
                        <td className="text-end pe-4 py-3" onClick={(e) => e.stopPropagation()}>
                          <div className="d-flex align-items-center justify-content-end" style={{ gap: '10px' }}>
                            <button
                              type="button"
                              onClick={() => setSelectedOrder({ ...order, serialNumber: parentSerial, display_order_number: parentSerial })}
                              className="btn btn-sm btn-outline-secondary rounded-circle p-0 d-inline-flex align-items-center justify-content-center shadow-xs"
                              style={{ width: '32px', height: '32px' }}
                              title="View Order Details"
                              aria-label="View Order Details"
                            >
                              <FiEye size={14} />
                            </button>
                            <button
                              type="button"
                              onClick={() => setEBillOrder({ ...adj, serialNumber: parentSerial, display_order_number: parentSerial })}
                              className="btn btn-sm btn-outline-danger rounded-circle p-0 d-inline-flex align-items-center justify-content-center shadow-xs"
                              style={{ width: '32px', height: '32px' }}
                              title="View E-Bill"
                              aria-label="View E-Bill"
                            >
                              <FiFileText size={14} />
                            </button>
                          </div>
                        </td>
                      </tr>

                      {/* Suborders Expanded Hierarchy Rows */}
                      {hasSuborders && expanded && suborders.map((sub, sIdx) => {
                        const isLastSub = sIdx === suborders.length - 1;
                        const subAdj = adjustOrderForServiceTax(sub);
                        const subContinuationIndex = sub.continuation_index || (sIdx + 1);
                        const subDisplayNo = `${parentSerial}-${subContinuationIndex}`;
                        const subIsCounterPaid = isSelfService || String(sub.paymentStatus || sub.payment_status || '').toUpperCase() === 'COUNTER_PAID';
                        const subIsPaid = subIsCounterPaid || String(sub.paymentStatus || sub.payment_status || '').toUpperCase() === 'PAID' || Boolean(sub.is_paid || sub.isPaid);
                        const subCustomer = sub.customerName || sub.customer_name || customerDisplay;
                        const subTime = sub.time || (sub.created_at ? new Date(sub.created_at).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true }) : '');

                        // Suborder status styling
                        const subSt = String(sub.status || sub.backendStatus || '').toLowerCase().trim();
                        let subStVariant = 'bg-secondary-subtle text-secondary';
                        let subStLabel = sub.status || 'Pending';
                        if (['pending', 'placed', 'new'].includes(subSt)) {
                          subStVariant = 'bg-secondary-subtle text-secondary border';
                          subStLabel = 'Pending';
                        } else if (['preparing', 'cooking', 'in_kitchen'].includes(subSt)) {
                          subStVariant = 'bg-warning-subtle text-warning-emphasis border border-warning-subtle';
                          subStLabel = 'Preparing';
                        } else if (['ready', 'prepared'].includes(subSt)) {
                          subStVariant = 'bg-info-subtle text-info-emphasis border border-info-subtle';
                          subStLabel = 'Ready';
                        } else if (['serving', 'served'].includes(subSt)) {
                          subStVariant = 'bg-primary-light text-danger border border-danger-subtle';
                          subStLabel = 'Serving';
                        } else if (['completed', 'delivered', 'done', 'settled'].includes(subSt)) {
                          subStVariant = 'bg-success-subtle text-success border border-success-subtle';
                          subStLabel = 'Completed';
                        } else if (['cancelled', 'canceled', 'rejected'].includes(subSt)) {
                          subStVariant = 'bg-danger-subtle text-danger border border-danger-subtle';
                          subStLabel = 'Cancelled';
                        }

                        return (
                          <tr 
                            key={sub.id || `${order.id}-sub-${sIdx}`}
                            style={{ 
                              backgroundColor: '#f8fafc',
                              borderBottom: isLastSub ? '1px solid var(--border-subtle)' : '1px dashed #e2e8f0'
                            }}
                          >
                            <td className="ps-4 py-2.5 font-monospace" style={{ fontSize: '12.5px' }}>
                              <div className="d-flex align-items-center" style={{ paddingLeft: '20px' }}>
                                <span className="text-secondary fw-bold me-2 font-monospace" style={{ fontSize: '13px', color: '#94a3b8' }}>
                                  {isLastSub ? '└──' : '├──'}
                                </span>
                                <span className="badge bg-secondary-subtle text-dark border me-1.5" style={{ fontSize: '10px' }}>
                                  Suborder
                                </span>
                                <span className="fw-bold text-dark">#{subDisplayNo}</span>
                              </div>
                            </td>
                            <td className="py-2.5 text-muted small" style={{ fontSize: '12px' }}>
                              {displayTable}
                            </td>
                            <td className="py-2.5 text-muted small" style={{ fontSize: '12px' }}>
                              <span className="text-secondary">Continuation</span>
                            </td>
                            <td className="py-2.5 text-muted small text-truncate" style={{ fontSize: '12px', maxWidth: '140px' }}>
                              {subTime ? `${subTime}` : subCustomer}
                            </td>
                            <td className="py-2.5 fw-bold" style={{ fontSize: '12.5px', color: 'var(--text-primary)' }}>
                              {formatCurrency(subAdj.total || subAdj.total_amount)}
                            </td>
                            <td className="py-2.5">
                              <span className={`badge rounded-pill fw-semibold px-2 py-0.5 ${subStVariant}`} style={{ fontSize: '10.5px' }}>
                                ● {subStLabel}
                              </span>
                            </td>
                            <td className="py-2.5">
                              <div className="d-flex flex-column align-items-start gap-0.5">
                                {subIsCounterPaid ? (
                                  <span className="badge rounded-pill fw-semibold px-2 py-0.5 d-inline-flex align-items-center gap-1" style={{ fontSize: '10.5px', backgroundColor: '#DCFCE7', color: '#16A34A', border: '1px solid #BBF7D0' }}>
                                    <span style={{ width: '5px', height: '5px', borderRadius: '50%', backgroundColor: '#16A34A' }} />
                                    Counter Paid
                                  </span>
                                ) : subIsPaid ? (
                                  <span className="badge rounded-pill fw-semibold px-2 py-0.5 d-inline-flex align-items-center gap-1" style={{ fontSize: '10.5px', backgroundColor: '#DCFCE7', color: '#16A34A', border: '1px solid #BBF7D0' }}>
                                    <span style={{ width: '5px', height: '5px', borderRadius: '50%', backgroundColor: '#16A34A' }} />
                                    Paid
                                  </span>
                                ) : (
                                  <span className="badge rounded-pill fw-semibold px-2 py-0.5 d-inline-flex align-items-center gap-1 mt-0.5" style={{ fontSize: '10.5px', backgroundColor: '#FEE2E2', color: '#DC2626', border: '1px solid #FECACA' }}>
                                    <span style={{ width: '5px', height: '5px', borderRadius: '50%', backgroundColor: '#DC2626' }} />
                                    Unpaid
                                  </span>
                                )}
                                {(sub.payment_method || sub.paymentMethodName || order.payment_method) && (
                                  <span className="text-muted small" style={{ fontSize: '10px' }}>
                                    {String(sub.payment_method || sub.paymentMethodName || order.payment_method).toUpperCase()}
                                  </span>
                                )}
                              </div>
                            </td>
                            <td className="py-2.5 text-muted small">
                              —
                            </td>
                            <td className="text-end pe-4 py-2.5">
                              <div className="d-flex align-items-center justify-content-end" style={{ gap: '8px' }}>
                                <button
                                  type="button"
                                  onClick={() => setSelectedOrder({
                                    ...sub,
                                    serialNumber: subDisplayNo,
                                    display_order_number: subDisplayNo,
                                    parent_order_id: order.id,
                                    parent_order_display_number: parentSerial,
                                  })}
                                  className="btn btn-sm btn-outline-secondary rounded-circle p-0 d-inline-flex align-items-center justify-content-center shadow-xs"
                                  style={{ width: '28px', height: '28px' }}
                                  title="View Suborder Details"
                                  aria-label="View Suborder Details"
                                >
                                  <FiEye size={12} />
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="row">
          {filteredParentOrders.map((order) => {
            const pKey = String(order.id);
            const parentSerial = parentSerialMap.get(pKey) || formatOrderDisplayNumber(order, order.id);
            const rawSuborders = subordersMap.get(pKey) || subordersMap.get(String(order.orderNumber)) || [];
            const suborders = rawSuborders.map((sub, sIdx) => {
              const subIndex = sub.continuation_index !== undefined && sub.continuation_index !== null ? sub.continuation_index : (sIdx + 1);
              const subSerial = `${parentSerial}-${subIndex}`;
              return {
                ...sub,
                serialNumber: subSerial,
                display_order_number: subSerial,
              };
            });
            const expanded = isExpanded(order.id);
            const orderWithSerial = {
              ...order,
              serialNumber: parentSerial,
              display_order_number: parentSerial,
            };
            return (
              <div key={order.id} className="col-12">
                <OrderCard
                  order={adjustOrderForServiceTax(orderWithSerial)}
                  suborders={suborders}
                  isExpanded={expanded}
                  onToggleExpand={() => toggleExpand(order.id)}
                  onViewDetails={(ord) => setSelectedOrder(ord)}
                  onViewEBill={(ord) => setEBillOrder(ord)}
                />
              </div>
            );
          })}
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

      <Toast show={toast.show} message={toast.message} type={toast.type} onClose={() => setToast(prev => ({ ...prev, show: false }))} />

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
              setEBillOrder(null);
              setSelectedOrder(null);
              await fetchOrders(false);
              window.dispatchEvent(new CustomEvent('foodie_orders_updated', { detail: { orderId: targetId, status: 'Completed' } }));
              window.dispatchEvent(new CustomEvent('foodie_tables_updated', { detail: { orderId: targetId } }));
              setToast({
                show: true,
                message: `Order #${targetOrder.orderNumber || targetOrder.display_order_number || targetId} marked as Completed.`,
                type: 'add'
              });
            } catch (err) {
              console.error('Failed to complete order on Proceed to Bill:', err);
              const msg = err?.response?.data?.detail || err?.message || 'Could not complete order.';
              setToast({
                show: true,
                message: msg,
                type: 'remove'
              });
              throw err;
            }
          }}
        />
      )}
    </AdminLayout>
  );
};

export default Orders;
