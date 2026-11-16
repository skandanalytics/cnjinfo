import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import AdminLayout from '../../components/layout/AdminLayout';
import Loader from '../../components/common/Loader';
import EmptyState from '../../components/common/EmptyState';
import Modal from '../../components/common/Modal';
import ConfirmModal from '../../components/common/ConfirmModal';
import Badge from '../../components/common/Badge';
import formatCurrency from '../../utils/formatCurrency';
import { useAuth } from '../../hooks/useAuth';
import { tableService } from '../../services/tableService';
import { productService } from '../../services/productService';
import { menuService } from '../../services/menuService';
import { couponService } from '../../services/couponService';
import { branchService } from '../../services/branchService';
import { currentBranchId, createAssistedOrder, getPricingQuote, staffJson } from '../../services/adminApi';
import { orderService } from '../../services/orderService';
import { notifyOrderCreated } from '../../services/notificationService';
import { normalizeFoodType } from '../../utils/filters';
import { getCategoryIcon } from '../../utils/categoryIcons';
import EBillModal from '../../components/orders/EBillModal';
import PaymentModal from '../../components/common/PaymentModal';
import OrderDetailsModal from '../../components/orders/OrderDetailsModal';
import TrackOrderModal from '../../components/orders/TrackOrderModal';
import Toast from '../../components/common/Toast';
import { 
  FiSearch, FiX, FiPlus, FiMinus, FiTrash2, FiShoppingBag, 
  FiLayers, FiTag, FiCheck, FiDollarSign, FiClock, FiPercent,
  FiPrinter, FiUser, FiPhone, FiAlertCircle, FiRefreshCw, FiChevronLeft,
  FiCreditCard, FiGrid, FiList, FiSave, FiShoppingCart, FiEdit2
} from 'react-icons/fi';
import { getShortTableNumber } from '../../components/tables/TableCard';

const PREPARATION_PRESETS = [
  'Less Spicy', 'Extra Spicy', 'No Onion', 'No Garlic', 
  'Less Salt', 'No Cheese', 'Well Cooked', 'Serve Hot'
];

export const Pos = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';

  // Loading & Data State
  const [loading, setLoading] = useState(true);
  const [branches, setBranches] = useState([]);
  const [selectedBranchId, setSelectedBranchId] = useState(null);
  const [tables, setTables] = useState([]);
  const [tablesLoading, setTablesLoading] = useState(false);
  const [tablesError, setTablesError] = useState(null);
  const [dishes, setDishes] = useState([]);
  const [categories, setCategories] = useState([]);
  const [coupons, setCoupons] = useState([]);

  // Filtering & Search
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategories, setSelectedCategories] = useState([]);
  const [foodTypeFilter, setFoodTypeFilter] = useState({
    veg: false,
    'non-veg': false,
    vegan: false,
  });
  const [selectedCategory, setSelectedCategory] = useState('ALL');
  const [selectedFoodType, setSelectedFoodType] = useState('ALL'); // 'ALL' | 'VEG' | 'NON_VEG'
  const [availabilityFilter, setAvailabilityFilter] = useState('ALL'); // 'ALL' | 'IN_STOCK' | 'LOW_STOCK' | 'OUT_OF_STOCK'
  const [posViewMode, setPosViewMode] = useState('grid');

  // POS Order State
  const initialType = (searchParams.get('type') || '').toLowerCase() === 'takeaway' ? 'TAKEAWAY' : 'DINE_IN';
  const [orderType, setOrderType] = useState(() => {
    try {
      const stored = sessionStorage.getItem('foodie_pos_cart');
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed?.orderType) return parsed.orderType;
      }
    } catch (e) {}
    return initialType;
  });
  const [selectedTable, setSelectedTable] = useState(() => {
    try {
      const stored = sessionStorage.getItem('foodie_pos_cart');
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed?.table) return parsed.table;
      }
    } catch (e) {}
    return null;
  });
  const [customerPhone, setCustomerPhone] = useState(() => {
    try {
      const stored = sessionStorage.getItem('foodie_pos_cart');
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed?.customerPhone) return parsed.customerPhone;
      }
    } catch (e) {}
    return '';
  });
  const [customerName, setCustomerName] = useState(() => {
    try {
      const stored = sessionStorage.getItem('foodie_pos_cart');
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed?.customerName) return parsed.customerName;
      }
    } catch (e) {}
    return '';
  });
  const [cartItems, setCartItems] = useState(() => {
    try {
      const stored = sessionStorage.getItem('foodie_pos_cart');
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed?.items)) return parsed.items;
      }
    } catch (e) {
      console.warn('Failed to parse cached POS cart:', e);
    }
    return [];
  });
  const [appliedCoupon, setAppliedCoupon] = useState(() => {
    try {
      const stored = sessionStorage.getItem('foodie_pos_cart');
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed?.coupon) return parsed.coupon;
      }
    } catch (e) {
      console.warn('Failed to parse cached POS coupon:', e);
    }
    return null;
  });
  const [couponCodeInput, setCouponCodeInput] = useState('');
  const [couponError, setCouponError] = useState('');
  const userDismissedCouponRef = useRef(false);
  const [hasSavedCart, setHasSavedCart] = useState(() => {
    try {
      const stored = sessionStorage.getItem('foodie_pos_cart');
      if (stored) {
        const parsed = JSON.parse(stored);
        return Array.isArray(parsed?.items) && parsed.items.length > 0;
      }
    } catch (e) { }
    return false;
  });

  // Sync cart state automatically to sessionStorage
  useEffect(() => {
    try {
      if (cartItems.length > 0) {
        const payload = {
          items: cartItems,
          orderType,
          coupon: appliedCoupon,
          tableId: selectedTable?.id || null,
          table: selectedTable || null,
          customerPhone,
          customerName,
          branchId: selectedBranchId,
          timestamp: Date.now(),
        };
        sessionStorage.setItem('foodie_pos_cart', JSON.stringify(payload));
        setHasSavedCart(true);
      } else {
        sessionStorage.removeItem('foodie_pos_cart');
        setHasSavedCart(false);
      }
    } catch (e) {
      console.warn('Failed to save POS cart to sessionStorage:', e);
    }
  }, [cartItems, orderType, appliedCoupon, selectedTable, customerPhone, customerName, selectedBranchId]);

  const handleContinueSavedCart = () => {
    try {
      const stored = sessionStorage.getItem('foodie_pos_cart');
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed?.items) && parsed.items.length > 0) {
          setCartItems(parsed.items);
          if (parsed.orderType) setOrderType(parsed.orderType);
          if (parsed.coupon) setAppliedCoupon(parsed.coupon);
          if (parsed.customerPhone) setCustomerPhone(parsed.customerPhone);
          if (parsed.customerName) setCustomerName(parsed.customerName);
          if (parsed.tableId && tables && tables.length > 0) {
            const tbl = tables.find(t => String(t.id) === String(parsed.tableId));
            if (tbl) setSelectedTable(tbl);
          }
          setToast({ show: true, message: 'Saved cart restored successfully.', type: 'info' });
        }
      }
    } catch (e) {
      console.warn('Failed to restore saved cart:', e);
    }
  };

  const [serviceTaxEnabled, setServiceTaxEnabled] = useState(() => {
    try {
      const saved = localStorage.getItem('foodie_service_tax_enabled');
      return saved !== null ? saved !== 'false' : true;
    } catch (e) {
      return true;
    }
  });

  useEffect(() => {
    const handleTaxSync = (e) => {
      if (typeof e.detail?.enabled === 'boolean') {
        setServiceTaxEnabled(e.detail.enabled);
      }
    };
    window.addEventListener('foodie_service_tax_changed', handleTaxSync);
    return () => window.removeEventListener('foodie_service_tax_changed', handleTaxSync);
  }, []);

  // Modals
  const [customizingItem, setCustomizingItem] = useState(null);
  const [showClearConfirm, setShowClearConfirm] = useState(false); // { dish, cartIndex, selectedOptions: [], specialInstructions: '' }
  const [showTablePicker, setShowTablePicker] = useState(false);
  const [tableFilter, setTableFilter] = useState('ALL');
  const [tableSearchQuery, setTableSearchQuery] = useState('');
  const [showCouponModal, setShowCouponModal] = useState(false);
  const [submittingOrder, setSubmittingOrder] = useState(false);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [orderError, setOrderError] = useState('');
  const [toast, setToast] = useState({ show: false, message: '', type: 'remove' });
  const [placedOrder, setPlacedOrder] = useState(null);
  const [viewingEBill, setViewingEBill] = useState(null);
  const [mobilePosTab, setMobilePosTab] = useState('menu'); // 'menu' | 'order'
  const [isMobile, setIsMobile] = useState(() => typeof window !== 'undefined' ? window.innerWidth < 992 : false);

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 992);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const [parentOrder, setParentOrder] = useState(null);
  const [trackedOrder, setTrackedOrder] = useState(null);
  const [showTrackedOrderModal, setShowTrackedOrderModal] = useState(false);

  // Initialize and load branches
  useEffect(() => {
    let isMounted = true;
    const initBranches = async () => {
      try {
        const branchList = await branchService.getBranches().catch(() => []);
        if (!isMounted) return;
        setBranches(Array.isArray(branchList) ? branchList : []);
        
        let branchId = null;
        if (user?.role === 'employee' && user?.branchId) {
          branchId = Number(user.branchId);
        } else {
          try {
            branchId = await currentBranchId();
          } catch {
            branchId = branchList[0]?.id || 1;
          }
        }
        setSelectedBranchId(Number(branchId));
      } catch (err) {
        console.error('Failed to init branches in POS:', err);
      }
    };
    initBranches();
    return () => { isMounted = false; };
  }, [user]);

  const getSelectedTableLabel = (tbl) => {
    if (!tbl) return '';
    const rawNum = tbl.number || tbl.table_number || (typeof tbl.table === 'string' ? tbl.table : tbl.table?.label);
    if (rawNum) return tableService.getCanonicalTableNumber(rawNum);
    const inList = tables.find(t => String(t.id) === String(tbl.id));
    if (inList?.number || inList?.table_number) {
      return tableService.getCanonicalTableNumber(inList.number || inList.table_number);
    }
    return '';
  };

  const handleTrackExistingOrder = async (orderId, tableInput) => {
    let safeTable = tableInput || tables.find(t => String(t.id) === String(tableInput?.id || searchParams.get('table'))) || {};
    try {
      setLoading(true);
      const { fetchBillPreview, staffJson } = await import('../../services/adminApi');
      let orderData = null;
      try {
        orderData = await staffJson(`/orders/${orderId}/`);
      } catch (err) {
        try {
          orderData = await orderService.getOrderById(orderId);
        } catch (innerErr) {
          orderData = safeTable?.active_order || null;
        }
      }
      if (!orderData && safeTable?.active_order) {
        orderData = safeTable.active_order;
      }
      let combined = null;
      try {
        combined = await fetchBillPreview(orderId);
      } catch (e) {
        console.warn('Could not fetch bill preview, falling back to order data', e);
      }
      const rawOrd = orderData || {};
      const rawNum = safeTable.number || safeTable.table_number || rawOrd.table_number || rawOrd.tableNumber || (typeof rawOrd.table === 'string' ? rawOrd.table : rawOrd.table?.label);
      const tableLabel = rawNum ? tableService.getCanonicalTableNumber(rawNum) : '';
      const mapped = {
        ...rawOrd,
        id: rawOrd.id || orderId,
        table: tableLabel,
        tableId: safeTable.id || rawOrd.table_id || rawOrd.tableId,
        table_id: safeTable.id || rawOrd.table_id || rawOrd.tableId,
        tableLocation: safeTable.location || safeTable.area || rawOrd.table_location || rawOrd.location || '',
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
      setTrackedOrder(mapped);
      setShowTrackedOrderModal(true);
    } catch (err) {
      console.error('Track order error:', err);
      if (safeTable?.active_order) {
        const fallbackRawNum = safeTable.number || safeTable.table_number || (typeof safeTable.table === 'string' ? safeTable.table : safeTable.table?.label);
        setTrackedOrder({
          ...safeTable.active_order,
          id: orderId,
          table: fallbackRawNum ? tableService.getCanonicalTableNumber(fallbackRawNum) : '',
          tableId: safeTable.id,
          table_id: safeTable.id,
          tableLocation: safeTable.location || safeTable.area || '',
          display_order_number: safeTable.active_order.display_order_number || String(orderId),
        });
        setShowTrackedOrderModal(true);
      } else {
        window.alert('Failed to load order details for this table.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleContinueOrderFromModal = async (ord, tablesListOverride = null) => {
    setShowTrackedOrderModal(false);
    setShowTablePicker(false);

    const rawStatus = String(ord?.backendStatus || ord?.status || '').toUpperCase();
    if (rawStatus === 'COMPLETED' || rawStatus === 'CANCELLED') {
      window.alert('This order has proceeded to bill and cannot be continued.');
      setParentOrder(null);
      return;
    }

    const tableList = (tablesListOverride && tablesListOverride.length > 0)
      ? tablesListOverride
      : (tables && tables.length > 0 ? tables : []);

    const targetTableId = ord?.tableId || ord?.table_id || (typeof ord?.table === 'object' ? ord?.table?.id : ord?.table);
    const matchedTable = tableList.find(t => String(t.id) === String(targetTableId))
      || (selectedTable && String(selectedTable.id) === String(targetTableId) ? selectedTable : null);

    const fallbackNumber = ord?.tableNumber || ord?.table_number || (typeof ord?.table === 'string' ? ord?.table : ord?.table?.label) || '';

    const table = matchedTable || {
      id: targetTableId,
      number: fallbackNumber,
      table_number: fallbackNumber,
      status: 'Occupied',
      is_active: true,
    };

    setSelectedTable(table);
    setOrderType('DINE_IN');

    let rawPhone = 
      ord?.customerPhone || 
      ord?.customer_phone || 
      ord?.customer?.phone || 
      ord?.customer?.customer_phone || 
      (table.active_order && (table.active_order.customer_phone || table.active_order.customerPhone)) || 
      (selectedTable && selectedTable.active_order && (selectedTable.active_order.customer_phone || selectedTable.active_order.customerPhone)) || 
      searchParams.get('phone') || 
      '';
    let rawName = 
      ord?.customerName || 
      ord?.customer_name || 
      ord?.customer?.name || 
      (table.active_order && (table.active_order.customer_name || table.active_order.customerName)) || 
      (selectedTable && selectedTable.active_order && (selectedTable.active_order.customer_name || selectedTable.active_order.customerName)) || 
      searchParams.get('name') || 
      '';

    if ((!rawPhone || String(rawPhone).replace(/\D/g, '').length < 7) && ord?.id) {
      try {
        const rootId = ord.parent_order_id || ord.parent_order || ord.id;
        const fetched = await staffJson(`/orders/${rootId}/`);
        if (fetched) {
          rawPhone = rawPhone || fetched.customer_phone || fetched.customerPhone || fetched.customer?.phone || fetched.customer?.customer_phone || '';
          rawName = rawName || fetched.customer_name || fetched.customerName || fetched.customer?.name || '';
        }
      } catch (e) {
        console.warn('Could not fetch root order customer details:', e);
      }
    }

    const cleanDigits = String(rawPhone || '').replace(/\D/g, '').slice(-10);
    const resolvedPhone = cleanDigits || (rawPhone ? String(rawPhone).trim() : '');
    const resolvedName = rawName ? String(rawName).trim() : '';

    setParentOrder({
      id: ord.id,
      parent_order_id: ord.parent_order_id || ord.parent_order || ord.id,
      display_order_number: ord.display_order_number || ord.display_number || String(ord.id),
      customer_phone: resolvedPhone,
      customer_name: resolvedName,
    });
    setCustomerPhone(resolvedPhone);
    setCustomerName(resolvedName);
    setCartItems([]);
    setAppliedCoupon(null);
    setOrderError('');
  };

  const handleProceedToBillFromModal = async (ord) => {
    try {
      setLoading(true);
      const { proceedToBill, fetchBillPreview } = await import('../../services/adminApi');
      const rootId = ord.parent_order_id || ord.parent_order || ord.id;
      let preview;
      try {
        const res = await proceedToBill(rootId);
        preview = res.bill;
      } catch (e) {
        preview = await fetchBillPreview(rootId);
      }
      setShowTrackedOrderModal(false);
      setShowTablePicker(false);
      setViewingEBill(preview || ord);
    } catch (err) {
      window.alert(err.message || 'Could not load bill preview.');
    } finally {
      setLoading(false);
    }
  };

  // Load Menu, Tables, and Coupons when selected branch changes
  const loadPosData = async (branchId, isSilent = false) => {
    if (!branchId) return;
    if (!isSilent) setLoading(true);
    setOrderError('');
    setTablesLoading(true);
    setTablesError(null);

    try {
      let tableList = [];
      try {
        tableList = await tableService.getTables(branchId);
      } catch (tblErr) {
        console.error('Error fetching tables in loadPosData:', tblErr);
        setTablesError(tblErr.message || 'Failed to load tables for this branch.');
      }

      const [dishList, catList, couponList] = await Promise.all([
        productService.getProducts(true, branchId).catch(() => []),
        menuService.getMenus().catch(() => []),
        couponService.getCoupons().catch(() => [])
      ]);

      const filteredTables = Array.isArray(tableList) 
        ? tableList.filter(t => !t.branch || Number(t.branch) === Number(branchId))
        : [];
      setTables(filteredTables);

      // Restore saved table from sessionStorage if available
      try {
        const stored = sessionStorage.getItem('foodie_pos_cart');
        if (stored) {
          const parsed = JSON.parse(stored);
          if (parsed?.tableId) {
            const matched = filteredTables.find(t => String(t.id) === String(parsed.tableId));
            if (matched) setSelectedTable(matched);
          }
        }
      } catch (e) {}
      const rawDishes = Array.isArray(dishList) ? dishList : [];
      const seenDishIds = new Set();
      const dedupedDishes = [];
      for (const d of rawDishes) {
        if (!seenDishIds.has(String(d.id))) {
          seenDishIds.add(String(d.id));
          dedupedDishes.push(d);
        }
      }
      setDishes(dedupedDishes);

      // Extract unique categories from dishes & menus
      const rawCategories = Array.isArray(catList) ? catList : [];
      const catNames = new Set(dishList.map(d => d.category).filter(Boolean));
      rawCategories.forEach(c => { if (c.name) catNames.add(c.name); });
      setCategories(['ALL', ...Array.from(catNames)]);

      setCoupons(Array.isArray(couponList) ? couponList : []);

      // Auto-select table from URL query param if present
      const queryTableId = searchParams.get('table');
      if (queryTableId) {
        const found = filteredTables.find(t => String(t.id) === String(queryTableId));
        if (found) {
          setSelectedTable(found);
          setOrderType('DINE_IN');
          const queryOrderId = searchParams.get('order');
          const activeOrderId = queryOrderId || found.active_order_id || (found.active_order && found.active_order.id);
          const isTrack = searchParams.get('track') === '1';
          const isContinue = searchParams.get('continue') === '1';
          if (isTrack && activeOrderId) {
            handleTrackExistingOrder(activeOrderId, found);
          } else if (isContinue && activeOrderId) {
            staffJson(`/orders/${activeOrderId}/`).then((ord) => {
              if (ord) {
                const rawStatus = String(ord.status || '').toUpperCase();
                if (rawStatus === 'COMPLETED' || rawStatus === 'CANCELLED') {
                  window.alert('This order has proceeded to bill and cannot be continued.');
                  setParentOrder(null);
                  return;
                }
                handleContinueOrderFromModal({
                  ...ord,
                  tableId: found.id,
                  table_id: found.id,
                  tableNumber: found.number,
                  table_number: found.number,
                  table: found,
                }, filteredTables);
                setSearchParams({ table: found.id }, { replace: true });
              }
            }).catch(() => {
              if (found.active_order) {
                handleContinueOrderFromModal({
                  ...found.active_order,
                  id: activeOrderId,
                  tableId: found.id,
                  table_id: found.id,
                  tableNumber: found.number,
                  table_number: found.number,
                  table: found,
                }, filteredTables);
                setSearchParams({ table: found.id }, { replace: true });
              }
            });
          }
        }
      }
    } catch (e) {
      console.error('Error loading POS data:', e);
    } finally {
      setTablesLoading(false);
      if (!isSilent) setLoading(false);
    }
  };

  const reloadTables = async (branchIdOverride) => {
    const targetBranch = branchIdOverride || selectedBranchId;
    if (!targetBranch || tablesLoading) return;
    setTablesLoading(true);
    setTablesError(null);
    try {
      const tableList = await tableService.getTables(targetBranch);
      const filteredTables = Array.isArray(tableList)
        ? tableList.filter(t => !t.branch || Number(t.branch) === Number(targetBranch))
        : [];
      setTables(filteredTables);
      setTablesError(null);
    } catch (err) {
      console.error('Error reloading tables:', err);
      setTablesError(err.message || 'Failed to fetch tables for this branch.');
    } finally {
      setTablesLoading(false);
    }
  };

  useEffect(() => {
    if (selectedBranchId) {
      loadPosData(selectedBranchId, false);
    }
  }, [selectedBranchId]);

  // React to URL navigation with table / continue / track params
  useEffect(() => {
    const isContinue = searchParams.get('continue') === '1';
    const isTrack = searchParams.get('track') === '1';
    const queryTableId = searchParams.get('table');
    const queryOrderId = searchParams.get('order');

    if (!tables || tables.length === 0 || (!isContinue && !isTrack)) return;

    if (queryTableId) {
      const found = tables.find(t => String(t.id) === String(queryTableId));
      if (found) {
        setSelectedTable(found);
        setOrderType('DINE_IN');
        const activeOrderId = queryOrderId || found.active_order_id || (found.active_order && found.active_order.id);

        if (isTrack && activeOrderId) {
          handleTrackExistingOrder(activeOrderId, found);
          setSearchParams({ table: found.id }, { replace: true });
        } else if (isContinue && activeOrderId) {
          staffJson(`/orders/${activeOrderId}/`).then((ord) => {
            if (ord) {
              const rawStatus = String(ord.status || '').toUpperCase();
              if (rawStatus === 'COMPLETED' || rawStatus === 'CANCELLED') {
                window.alert('This order has proceeded to bill and cannot be continued.');
                setParentOrder(null);
                return;
              }
              handleContinueOrderFromModal({
                ...ord,
                tableId: found.id,
                table_id: found.id,
                tableNumber: found.number,
                table_number: found.number,
                table: found,
              }, tables);
              setSearchParams({ table: found.id }, { replace: true });
            }
            }).catch(() => {
              if (found.active_order) {
                handleContinueOrderFromModal({
                  ...found.active_order,
                  id: activeOrderId,
                  tableId: found.id,
                  table_id: found.id,
                  tableNumber: found.number,
                  table_number: found.number,
                  table: found,
                }, tables);
                setSearchParams({ table: found.id }, { replace: true });
              }
            });
        }
      }
    }
  }, [searchParams, tables]);

  // Listen to live realtime events
  useEffect(() => {
    const handleSync = () => {
      if (selectedBranchId) loadPosData(selectedBranchId, true);
    };

    window.addEventListener('foodie_orders_updated', handleSync);
    window.addEventListener('foodie_tables_updated', handleSync);
    window.addEventListener('foodie_products_updated', handleSync);
    window.addEventListener('foodie_inventory_updated', handleSync);
    window.addEventListener('foodie_offers_updated', handleSync);
    window.addEventListener('foodie_data_sync_refetch', handleSync);

    return () => {
      window.removeEventListener('foodie_orders_updated', handleSync);
      window.removeEventListener('foodie_tables_updated', handleSync);
      window.removeEventListener('foodie_products_updated', handleSync);
      window.removeEventListener('foodie_inventory_updated', handleSync);
      window.removeEventListener('foodie_offers_updated', handleSync);
      window.removeEventListener('foodie_data_sync_refetch', handleSync);
    };
  }, [selectedBranchId]);

  // Handle switching order type
  const handleToggleOrderType = (type) => {
    setOrderType(type);
    setOrderError('');
    if (type === 'TAKEAWAY') {
      setSelectedTable(null);
      setParentOrder(null);
      setSearchParams({ type: 'takeaway' }, { replace: true });
    } else {
      setSearchParams({}, { replace: true });
    }
  };

  // Select Table for Dine-In
  const handleSelectTable = (table) => {
    if (!table.is_active) {
      window.alert('This table is inactive.');
      return;
    }
    const isOccupied = table.status === 'Occupied' || Boolean(table.is_occupied) || table.status === 'Reserved';
    if (isOccupied) {
      const activeOrderId = table.active_order_id || (table.active_order && table.active_order.id);
      if (activeOrderId) {
        handleTrackExistingOrder(activeOrderId, table);
        return;
      }
      window.alert(table.status === 'Reserved' ? 'Table is reserved.' : 'Table is occupied.');
      return;
    }
    setSelectedTable(table);
    setOrderType('DINE_IN');
    setShowTablePicker(false);
    setOrderError('');
    setSearchParams({ table: table.id }, { replace: true });
  };

  // Check available food types in dishes
  const { hasVeg, hasNonVeg, hasVegan } = useMemo(() => {
    let veg = false;
    let nonVeg = false;
    let vegan = false;
    for (const d of dishes) {
      const ft = normalizeFoodType(d.foodType || d.type || (d.is_veg === false || d.is_veg === 'false' ? 'non-veg' : 'veg'));
      if (ft === 'veg') veg = true;
      if (ft === 'non-veg') nonVeg = true;
      if (ft === 'vegan') vegan = true;
    }
    return { hasVeg: veg, hasNonVeg: nonVeg, hasVegan: vegan };
  }, [dishes]);

  // Reset active food type filter if matching dishes no longer exist
  useEffect(() => {
    setFoodTypeFilter((prev) => {
      let changed = false;
      const next = { ...prev };
      if (!hasNonVeg && next['non-veg']) {
        next['non-veg'] = false;
        changed = true;
      }
      if (!hasVegan && next.vegan) {
        next.vegan = false;
        changed = true;
      }
      return changed ? next : prev;
    });
  }, [hasNonVeg, hasVegan]);

  // Food Type Toggle
  const toggleFoodType = (type) => {
    setFoodTypeFilter(prev => ({ ...prev, [type]: !prev[type] }));
  };

  // Category Counts for Category Pills
  const categoryCounts = useMemo(() => {
    const counts = { ALL: dishes.length };
    dishes.forEach(d => {
      const cat = (d.category || '').trim();
      if (cat) {
        counts[cat] = (counts[cat] || 0) + 1;
      }
    });
    return counts;
  }, [dishes]);

  const getCategoryIcon = (catName) => {
    const c = String(catName).toLowerCase();
    if (c === 'all' || c === 'all dishes') return <FiGrid size={15} />;
    if (c.includes('chat') || c.includes('snack')) return <span>🍲</span>;
    if (c.includes('main') || c.includes('curry')) return <span>🍛</span>;
    if (c.includes('south') || c.includes('dosa') || c.includes('idli')) return <span>🥞</span>;
    if (c.includes('beverage') || c.includes('drink') || c.includes('tea') || c.includes('coffee')) return <span>☕</span>;
    if (c.includes('fast') || c.includes('burger') || c.includes('pizza')) return <span>🍔</span>;
    if (c.includes('rice') || c.includes('biryani')) return <span>🍚</span>;
    if (c.includes('dessert') || c.includes('sweet')) return <span>🍰</span>;
    return <FiLayers size={14} />;
  };

  // Filtered Dishes
  const filteredDishes = useMemo(() => {
    return dishes.filter(dish => {
      // Search filter
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase().trim();
        const matchesName = String(dish.name || '').toLowerCase().includes(query);
        const matchesDesc = String(dish.description || '').toLowerCase().includes(query);
        const matchesCat = String(dish.category || '').toLowerCase().includes(query);
        if (!matchesName && !matchesDesc && !matchesCat) return false;
      }

      // Category filter (selected category from pill or dropdown)
      if (selectedCategory && selectedCategory !== 'ALL') {
        const dishCat = String(dish.category || '').trim().toLowerCase();
        if (dishCat !== String(selectedCategory).trim().toLowerCase()) return false;
      } else if (selectedCategories.length > 0) {
        const dishCat = String(dish.category || '').trim().toLowerCase();
        const matchesAnyCat = selectedCategories.some(cat => {
          const c = String(cat).trim().toLowerCase();
          return dishCat === c;
        });
        if (!matchesAnyCat) return false;
      }

      // Food type filter (All, Veg, Non-Veg, Vegan with multi-select support)
      const hasFtFilter = foodTypeFilter.veg || foodTypeFilter['non-veg'] || foodTypeFilter.vegan;
      if (hasFtFilter) {
        const dt = normalizeFoodType(dish.foodType || dish.type);
        if (dt === 'veg' && !foodTypeFilter.veg) return false;
        if (dt === 'non-veg' && !foodTypeFilter['non-veg']) return false;
        if (dt === 'vegan' && !foodTypeFilter.vegan) return false;
      }

      // Availability filter
      const isOut = dish.status === 'Out of Stock' || dish.status === 'OUT_OF_STOCK' || Number(dish.stock) <= 0 || dish.is_orderable === false || dish.isOrderable === false;
      const isLow = !isOut && Number(dish.stock) > 0 && Number(dish.stock) <= 5;

      if (availabilityFilter === 'IN_STOCK') {
        if (isOut || isLow) return false;
      } else if (availabilityFilter === 'LOW_STOCK') {
        if (!isLow) return false;
      } else if (availabilityFilter === 'OUT_OF_STOCK') {
        if (!isOut) return false;
      }

      return true;
    });
  }, [dishes, searchQuery, selectedCategory, selectedCategories, selectedFoodType, foodTypeFilter, availabilityFilter]);

  // Cart Management
  const findCartIndex = (dishId, options = [], instructions = '') => {
    const optIds = (options || []).map(o => typeof o === 'object' ? o.id : o).sort().join(',');
    return cartItems.findIndex(i => 
      String(i.dish.id) === String(dishId) &&
      (i.options || []).map(o => typeof o === 'object' ? o.id : o).sort().join(',') === optIds &&
      String(i.specialInstructions || '').trim() === String(instructions || '').trim()
    );
  };

  const handleAddDish = (dish) => {
    const isOutOfStock = 
      dish.status === 'Out of Stock' || 
      dish.status === 'OUT_OF_STOCK' || 
      Number(dish.stock) <= 0 || 
      dish.is_orderable === false || 
      dish.isOrderable === false;

    if (isOutOfStock) {
      const msg = "This item is currently out of stock.";
      setOrderError(msg);
      setToast({ show: true, message: msg, type: 'remove' });
      return;
    }

    const currentTotalQty = cartItems
      .filter(i => String(i.dish.id) === String(dish.id))
      .reduce((sum, i) => sum + (Number(i.quantity) || 0), 0);

    const maxStock = (dish.stock !== undefined && dish.stock !== null) ? Number(dish.stock) : null;
    if (maxStock !== null && !isNaN(maxStock) && currentTotalQty + 1 > maxStock) {
      const msg = maxStock === 1 ? "Only 1 item is available." : `Only ${maxStock} of '${dish.name}' left.`;
      setOrderError(msg);
      setToast({ show: true, message: msg, type: 'remove' });
      return;
    }

    setOrderError('');

    // If dish has customizations, open modal directly for choice
    if (Array.isArray(dish.customizations) && dish.customizations.length > 0) {
      setCustomizingItem({
        dish,
        cartIndex: -1,
        selectedOptions: [],
        specialInstructions: '',
      });
      return;
    }

    setCartItems(prev => {
      const idx = prev.findIndex(i => 
        String(i.dish.id) === String(dish.id) &&
        (!i.options || i.options.length === 0) &&
        !i.specialInstructions
      );
      if (idx >= 0) {
        const updated = [...prev];
        updated[idx] = {
          ...updated[idx],
          quantity: Number(updated[idx].quantity || 0) + 1,
        };
        return updated;
      } else {
        return [...prev, {
          dish,
          quantity: 1,
          options: [],
          specialInstructions: '',
        }];
      }
    });
  };

  const handleIncrementDish = (dish) => {
    setCartItems(prev => {
      let idx = -1;
      for (let i = prev.length - 1; i >= 0; i--) {
        if (String(prev[i].dish.id) === String(dish.id)) {
          idx = i;
          break;
        }
      }

      if (idx === -1) {
        // If not in cart, add it directly
        return [...prev, {
          dish,
          quantity: 1,
          options: [],
          specialInstructions: '',
        }];
      }

      const item = prev[idx];
      const currentTotalQty = prev
        .filter(i => String(i.dish.id) === String(item.dish.id))
        .reduce((sum, i) => sum + (Number(i.quantity) || 0), 0);

      const maxStock = (dish.stock !== undefined && dish.stock !== null) 
        ? Number(dish.stock) 
        : ((item.dish.stock !== undefined && item.dish.stock !== null) ? Number(item.dish.stock) : null);

      if (maxStock !== null && !isNaN(maxStock) && currentTotalQty + 1 > maxStock) {
        const msg = maxStock <= 0 
          ? "This item is currently out of stock." 
          : (maxStock === 1 ? "Only 1 item is available." : `Only ${maxStock} of '${item.dish.name}' left.`);
        setOrderError(msg);
        setToast({ show: true, message: msg, type: 'remove' });
        return prev;
      }

      setOrderError('');
      const updated = [...prev];
      updated[idx] = {
        ...item,
        quantity: Number(item.quantity || 0) + 1,
      };
      return updated;
    });
  };

  const handleDecrementDish = (dish) => {
    setCartItems(prev => {
      let idx = -1;
      for (let i = prev.length - 1; i >= 0; i--) {
        if (String(prev[i].dish.id) === String(dish.id)) {
          idx = i;
          break;
        }
      }

      if (idx === -1) return prev;
      const item = prev[idx];
      const newQty = Number(item.quantity || 0) - 1;
      const updated = [...prev];
      if (newQty <= 0) {
        updated.splice(idx, 1);
      } else {
        updated[idx] = {
          ...item,
          quantity: newQty,
        };
      }
      setOrderError('');
      return updated;
    });
  };

  const handleUpdateQuantity = (index, delta) => {
    setCartItems(prev => {
      const item = prev[index];
      if (!item) return prev;
      if (delta > 0) {
        const currentTotalQty = prev
          .filter(i => String(i.dish.id) === String(item.dish.id))
          .reduce((sum, i) => sum + (Number(i.quantity) || 0), 0);
        const maxStock = (item.dish.stock !== undefined && item.dish.stock !== null) ? Number(item.dish.stock) : null;
        if (maxStock !== null && !isNaN(maxStock) && currentTotalQty + delta > maxStock) {
          const msg = maxStock <= 0 
            ? "This item is currently out of stock." 
            : (maxStock === 1 ? "Only 1 item is available." : `Only ${maxStock} of '${item.dish.name}' left.`);
          setOrderError(msg);
          setToast({ show: true, message: msg, type: 'remove' });
          return prev;
        }
      }
      const newQty = Number(item.quantity || 0) + delta;
      const updated = [...prev];
      if (newQty <= 0) {
        updated.splice(index, 1);
      } else {
        updated[index] = {
          ...item,
          quantity: newQty,
        };
      }
      setOrderError('');
      return updated;
    });
  };

  const handleRemoveItem = (index) => {
    setCartItems(prev => prev.filter((_, i) => i !== index));
  };

  const handleOpenCustomize = (dish, cartIndex = -1) => {
    const existing = cartIndex >= 0 ? cartItems[cartIndex] : null;
    setCustomizingItem({
      dish,
      cartIndex,
      selectedOptions: existing ? [...(existing.options || [])] : [],
      specialInstructions: existing ? (existing.specialInstructions || '') : '',
    });
  };

  const handleSaveCustomization = () => {
    if (!customizingItem) return;
    const { dish, cartIndex, selectedOptions, specialInstructions } = customizingItem;

    if (cartIndex >= 0) {
      setCartItems(prev => {
        const updated = [...prev];
        updated[cartIndex] = {
          ...updated[cartIndex],
          options: selectedOptions,
          specialInstructions,
        };
        return updated;
      });
    } else {
      const currentTotalQty = cartItems
        .filter(i => String(i.dish.id) === String(dish.id))
        .reduce((sum, i) => sum + (Number(i.quantity) || 0), 0);
      const maxStock = (dish.stock !== undefined && dish.stock !== null) ? Number(dish.stock) : null;
      if (maxStock !== null && !isNaN(maxStock) && currentTotalQty + 1 > maxStock) {
        const msg = maxStock <= 0 
          ? "This item is currently out of stock." 
          : (maxStock === 1 ? "Only 1 item is available." : `Only ${maxStock} of '${dish.name}' left.`);
        setOrderError(msg);
        setToast({ show: true, message: msg, type: 'remove' });
        return;
      }
      // Check if identical item already exists in cart:
      const optIds = (selectedOptions || []).map(o => String(o.id || o)).sort().join(',');
      const cleanInst = (specialInstructions || '').trim().toLowerCase();
      
      setCartItems(prev => {
        const matchIdx = prev.findIndex(item => {
          if (String(item.dish.id) !== String(dish.id)) return false;
          const itemOptIds = (item.options || []).map(o => String(o.id || o)).sort().join(',');
          const itemInst = (item.specialInstructions || '').trim().toLowerCase();
          return itemOptIds === optIds && itemInst === cleanInst;
        });

        if (matchIdx >= 0) {
          const updated = [...prev];
          updated[matchIdx] = {
            ...updated[matchIdx],
            quantity: Number(updated[matchIdx].quantity || 0) + 1,
          };
          return updated;
        }

        return [...prev, {
          dish,
          quantity: 1,
          options: selectedOptions,
          specialInstructions,
        }];
      });
    }
    setOrderError('');
    setCustomizingItem(null);
  };

  // Bill Calculations
  const billSummary = useMemo(() => {
    let itemsSubtotal = 0;
    let addOnsTotal = 0;
    let dishDiscountsTotal = 0;
    let totalQuantity = 0;

    cartItems.forEach(item => {
      const qty = item.quantity || 1;
      totalQuantity += qty;
      const originalPrice = Number(item.dish.price || item.dish.originalPrice || item.dish.sellingPrice || 0);
      const sellingPrice = Number(item.dish.sellingPrice || item.dish.discountPrice || originalPrice);
      itemsSubtotal += originalPrice * qty;

      // Add-ons extra
      const optionsExtra = (item.options || []).reduce((acc, opt) => {
        return acc + Number(opt.extra_price ?? opt.price ?? 0);
      }, 0);
      addOnsTotal += optionsExtra * qty;

      // Menu dish discount: exact difference between original price and selling price
      if (item.dish.hasDiscount && originalPrice > sellingPrice) {
        dishDiscountsTotal += (originalPrice - sellingPrice) * qty;
      }
    });

    const merchandise = itemsSubtotal + addOnsTotal - dishDiscountsTotal;

    // Coupon discount calculation (Active only for Takeaway in POS; Dine-in coupons applied at Complete Session)
    let couponDiscount = 0;
    if (orderType === 'TAKEAWAY' && appliedCoupon && merchandise >= (appliedCoupon.minOrderValue || appliedCoupon.minimum_order_amount || 0)) {
      if (appliedCoupon.type === 'percentage' || appliedCoupon.discount_type === 'PERCENTAGE') {
        const pct = appliedCoupon.discount || appliedCoupon.discount_value || 0;
        let disc = (merchandise * pct) / 100;
        if (appliedCoupon.maxDiscount || appliedCoupon.maximum_discount) {
          disc = Math.min(disc, Number(appliedCoupon.maxDiscount || appliedCoupon.maximum_discount));
        }
        couponDiscount = disc;
      } else {
        couponDiscount = Number(appliedCoupon.discount || appliedCoupon.discount_value || 0);
      }
    }

    const foodAfterCoupon = Math.max(0, merchandise - couponDiscount);

    // Packing Charge: ₹10 per item strictly for Takeaway
    const packingCharge = orderType === 'TAKEAWAY' ? totalQuantity * 10 : 0;

    const taxableAmount = foodAfterCoupon + packingCharge;
    const gstRate = 5; // standard 5% GST
    const gstAmount = Math.round((taxableAmount * gstRate) / 100 * 100) / 100;

    const rawTotal = taxableAmount + gstAmount;
    const grandTotal = Math.round(rawTotal);
    const roundOff = Math.round((grandTotal - rawTotal) * 100) / 100;

    return {
      itemsSubtotal,
      addOnsTotal,
      dishDiscountsTotal,
      merchandise,
      couponDiscount,
      packingCharge,
      taxableAmount,
      gstRate,
      gstAmount,
      roundOff,
      grandTotal,
      totalQuantity,
    };
  }, [cartItems, orderType, appliedCoupon]);

  // Auto-apply eligible coupon when cart changes (Takeaway only; Dine-in coupons applied at Complete Session)
  useEffect(() => {
    if (orderType === 'DINE_IN') {
      if (appliedCoupon) setAppliedCoupon(null);
      return;
    }

    if (cartItems.length === 0) {
      userDismissedCouponRef.current = false;
      if (appliedCoupon?.isAutomatic) {
        setAppliedCoupon(null);
      }
      return;
    }

    if (userDismissedCouponRef.current) {
      return;
    }

    // Calculate current merchandise subtotal
    const merchandise = cartItems.reduce((sum, item) => {
      const p = item.dish?.price || 0;
      const d = (item.dish?.hasDiscount || item.dish?.discountPercent > 0 || (item.dish?.discountPrice > 0 && item.dish?.discountPrice < p))
        ? (item.dish.discountPrice > 0 ? (p - item.dish.discountPrice) : ((p * (item.dish.discountPercent || 0)) / 100))
        : 0;
      const itemFinalPrice = Math.max(0, p - d);
      const optTotal = (item.options || []).reduce((s, o) => s + (Number(o?.price) || 0), 0);
      return sum + ((itemFinalPrice + optTotal) * item.quantity);
    }, 0);

    // Find all active auto-apply coupons eligible for this merchandise
    const eligibleAutoCoupons = (coupons || []).filter(c => {
      const isAuto = Boolean(c.autoApply || c.auto_apply);
      const isActive = c.status !== 'Inactive' && c.is_active !== false;
      const minOrder = Number(c.minOrderValue || c.minimum_order_amount || 0);
      return isAuto && isActive && merchandise >= minOrder;
    });

    if (eligibleAutoCoupons.length > 0) {
      // Pick the coupon that gives highest discount
      const best = eligibleAutoCoupons.reduce((prev, curr) => {
        const getDisc = (cpn) => {
          let val = 0;
          if (cpn.type === 'percentage' || cpn.discount_type === 'PERCENTAGE') {
            const pct = Number(cpn.discount || cpn.discount_value || 0);
            val = (merchandise * pct) / 100;
            const maxD = Number(cpn.maxDiscount || cpn.maximum_discount || 0);
            if (maxD > 0) val = Math.min(val, maxD);
          } else {
            val = Number(cpn.discount || cpn.discount_value || 0);
          }
          return val;
        };
        return getDisc(curr) > getDisc(prev) ? curr : prev;
      });

      if (!appliedCoupon || appliedCoupon.isAutomatic) {
        if (!appliedCoupon || String(appliedCoupon.code).toUpperCase() !== String(best.code).toUpperCase()) {
          setAppliedCoupon({ ...best, isAutomatic: true });
        }
      }
    } else if (appliedCoupon?.isAutomatic) {
      setAppliedCoupon(null);
    }
  }, [cartItems, coupons, appliedCoupon]);

  // Apply Coupon
  const handleApplyCoupon = (code) => {
    setCouponError('');
    if (!code || !code.trim()) {
      setCouponError('Please enter a coupon code.');
      return;
    }
    const cleanCode = code.trim().toUpperCase();
    if (appliedCoupon && String(appliedCoupon.code || '').trim().toUpperCase() === cleanCode) {
      setCouponError('This coupon is already applied.');
      return;
    }
    const found = coupons.find(c => String(c.code).toUpperCase() === cleanCode);
    if (!found) {
      setCouponError('Invalid coupon code.');
      return;
    }
    if (found.status === 'Inactive' || found.is_active === false) {
      setCouponError('This coupon is no longer active.');
      return;
    }
    const minOrder = Number(found.minOrderValue || found.minimum_order_amount || 0);
    if (billSummary.merchandise < minOrder) {
      setCouponError(`Minimum order amount of ${formatCurrency(minOrder)} required.`);
      return;
    }
    userDismissedCouponRef.current = false;
    setAppliedCoupon({ ...found, isAutomatic: false });
    setCouponCodeInput('');
    setShowCouponModal(false);
  };

  const handleRemoveCoupon = () => {
    userDismissedCouponRef.current = true;
    setAppliedCoupon(null);
    setCouponError('');
  };

  // Submit Order Action
  const handleSubmitOrder = async (isPaid = false, selectedMethod = 'CASH') => {
    setOrderError('');
    if (cartItems.length === 0) {
      setOrderError('Add at least one dish to the order.');
      return;
    }

    if (orderType === 'DINE_IN' && !selectedTable) {
      setOrderError('Please select a table for Dine-In order.');
      setShowTablePicker(true);
      return;
    }

    let effectivePhone = customerPhone.trim();
    if (!effectivePhone || effectivePhone.replace(/\D/g, '').length < 7) {
      if (parentOrder?.customer_phone) {
        effectivePhone = parentOrder.customer_phone;
      } else if (selectedTable?.active_order?.customer_phone) {
        effectivePhone = selectedTable.active_order.customer_phone;
      }
    }

    // Only validate phone when NOT continuing an existing order
    if (!parentOrder) {
      if (!effectivePhone) {
        setOrderError('Customer mobile number is required.');
        return;
      }
      const cleanDigits = effectivePhone.replace(/\D/g, '');
      if (cleanDigits.length < 10) {
        setOrderError('Please enter a valid 10-digit customer mobile number.');
        return;
      }
    }

    setSubmittingOrder(true);
    const idempotencyKey = `pos-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

    const itemsPayload = cartItems.map(item => ({
      food: Number(item.dish.id),
      quantity: Number(item.quantity),
      options: (item.options || []).map(o => Number(o.id || o)),
      special_instructions: item.specialInstructions || '',
    }));

    const cleanDigits = effectivePhone ? effectivePhone.replace(/\D/g, '').slice(-10) : '';
    const resolvedPhone = cleanDigits || (effectivePhone ? effectivePhone.trim() : (parentOrder?.customer_phone ? String(parentOrder.customer_phone).trim() : ''));
    const resolvedName = customerName.trim() || parentOrder?.customer_name || selectedTable?.active_order?.customer_name || '';

    const methodMap = {
      'UPI': 'RAZORPAY_UPI',
      'RAZORPAY_UPI': 'RAZORPAY_UPI',
      'COUNTER': 'CASH',
      'CASH': 'CASH',
      'CARD': 'RAZORPAY_CARD',
      'RAZORPAY_CARD': 'RAZORPAY_CARD',
    };
    const apiPaymentMethod = methodMap[selectedMethod] || 'CASH';

    const payload = {
      order_type: orderType,
      table: orderType === 'DINE_IN' ? Number(selectedTable?.id) : null,
      branch: Number(selectedBranchId),
      items: itemsPayload,
      idempotency_key: idempotencyKey,
      coupon_code: orderType === 'TAKEAWAY' ? (appliedCoupon ? appliedCoupon.code : (userDismissedCouponRef.current ? 'NONE' : '')) : '',
      customer_phone: resolvedPhone,
      customer_name: resolvedName,
      payment_method: apiPaymentMethod,
      mark_paid: isPaid,
      service_tax_enabled: serviceTaxEnabled,
    };

    if (parentOrder) {
      payload.parent_order = Number(parentOrder.id);
      payload.parent_order_id = Number(parentOrder.id);
    }

    try {
      const order = await createAssistedOrder(payload);
      setShowPaymentModal(false);
      setPlacedOrder({
        ...order,
        is_paid: isPaid,
      });

      // Clear current cart & inputs
      userDismissedCouponRef.current = false;
      setCartItems([]);
      setAppliedCoupon(null);
      setCustomerPhone('');
      setCustomerName('');
      setParentOrder(null);
      if (orderType === 'DINE_IN') {
        setSelectedTable(null);
        setSearchParams({}, { replace: true });
      }

      // Live sync trigger & notification
      notifyOrderCreated({
        id: order.id,
        order_number: order.order_number || order.orderNumber,
        table: selectedTable?.number || selectedTable?.table_number || (orderType === 'TAKEAWAY' ? 'Takeaway' : 'N/A'),
        total_amount: billSummary.grandTotal
      });
      window.dispatchEvent(new CustomEvent('foodie_orders_updated', { detail: { orderId: order.id, order } }));
      window.dispatchEvent(new CustomEvent('foodie_tables_updated', { detail: { orderId: order.id } }));
      window.dispatchEvent(new CustomEvent('foodie_inventory_updated', { detail: { orderId: order.id } }));
    } catch (err) {
      setOrderError(err.message || 'Failed to place order. Please try again.');
    } finally {
      setSubmittingOrder(false);
    }
  };

  const handleResetOrder = () => {
    if (cartItems.length > 0) {
      setShowClearConfirm(true);
      return;
    }
    executeClearOrder();
  };

  const executeClearOrder = () => {
    setCartItems([]);
    setAppliedCoupon(null);
    setParentOrder(null);
    setOrderError('');
    setCouponError('');
    setShowClearConfirm(false);
  };

  const canSubmitOrder = !submittingOrder && cartItems.length > 0 && (orderType === 'TAKEAWAY' || Boolean(selectedTable));

  // Block Cooks / Kitchen Staff from creating POS assisted orders
  const isCook = Boolean(
    user?.role === 'CHEF' ||
    (user?.jobTitle && /cook|chef/i.test(user.jobTitle)) ||
    (user?.designation && /cook|chef/i.test(user.designation)) ||
    (user?.department && /kitchen/i.test(user.department) && user?.role !== 'admin')
  );

  if (isCook) {
    return (
      <AdminLayout>
        <div className="container py-5 text-center">
          <div className="card p-5 border-0 shadow-sm rounded-4 mx-auto" style={{ maxWidth: '480px' }}>
            <div className="text-danger mb-3">
              <FiAlertCircle size={48} />
            </div>
            <h5 className="fw-bold text-dark mb-2">POS Access Restricted</h5>
            <p className="text-muted small mb-4">
              Kitchen staff and cooks are not permitted to place assisted orders. Please monitor the Kitchen Queue instead.
            </p>
            <div>
              <button
                type="button"
                onClick={() => navigate('/employee/kitchen')}
                className="btn btn-danger rounded-pill px-4 py-2 fw-bold"
              >
                Go to Kitchen Queue
              </button>
            </div>
          </div>
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout fullHeight={true} contentClassName="p-0 d-flex flex-column flex-grow-1 overflow-hidden">
      <div className="pos-main-container d-flex flex-column w-100 h-100 overflow-hidden bg-light">
        


        {/* Mobile Tab Switcher (Visible on screens < 992px) */}
        <div className="d-flex d-lg-none bg-white border-bottom px-3 py-2 gap-2 flex-shrink-0">
          <button
            type="button"
            onClick={() => setMobilePosTab('menu')}
            className={`btn btn-sm flex-grow-1 rounded-pill fw-bold py-2 ${
              mobilePosTab === 'menu' ? 'btn-danger text-white shadow-xs' : 'btn-light text-muted'
            }`}
            style={{ fontSize: '13px' }}
          >
            🍽️ Dishes ({filteredDishes.length})
          </button>
          <button
            type="button"
            onClick={() => setMobilePosTab('order')}
            className={`btn btn-sm flex-grow-1 rounded-pill fw-bold py-2 position-relative ${
              mobilePosTab === 'order' ? 'btn-danger text-white shadow-xs' : 'btn-light text-muted'
            }`}
            style={{ fontSize: '13px' }}
          >
            🛒 Order Ticket ({cartItems.length})
            {cartItems.length > 0 && (
              <span className="ms-1.5 badge bg-white text-danger rounded-pill px-2 py-0.5" style={{ fontSize: '11px' }}>
                {formatCurrency(billSummary.grandTotal)}
              </span>
            )}
          </button>
        </div>

        {/* Main Two-Column POS Workspace */}
        <div className="pos-workspace-wrapper d-flex flex-grow-1 min-h-0 overflow-hidden p-2.5 p-xl-3 gap-3 gap-xl-3">
          
          {/* LEFT COLUMN: Food Selection Workspace (~65%) */}
          <div 
            className={`pos-food-catalog-area flex-column min-h-0 overflow-y-auto ${mobilePosTab !== 'menu' ? 'd-none d-lg-flex' : 'd-flex'}`}
            style={{ 
              flex: isMobile ? '1 1 100%' : '0 0 65%', 
              maxWidth: isMobile ? '100%' : '65%', 
              width: isMobile ? '100%' : undefined,
              paddingRight: isMobile ? '0' : '4px' 
            }}
          >
            
            {/* 1. Header Row: Cart Icon, Heading, Subtitle & Search Bar */}
            <div className="d-flex align-items-center justify-content-between flex-wrap gap-3 mb-3">
              <div className="d-flex align-items-center gap-3">
                <button
                  type="button"
                  onClick={() => navigate(-1)}
                  className="btn btn-light rounded-circle p-0 border d-inline-flex align-items-center justify-content-center flex-shrink-0 shadow-2xs"
                  style={{ width: '38px', height: '38px', backgroundColor: '#FFFFFF', borderColor: '#E2E8F0' }}
                  title="Go Back"
                >
                  <FiChevronLeft size={20} className="text-secondary" />
                </button>
                <div>
                  <h4 className="fw-bold text-dark mb-0" style={{ fontSize: '24px', letterSpacing: '-0.3px' }}>
                    POS / Take Order
                  </h4>
                  <p className="text-secondary small mb-0 mt-0.5" style={{ fontSize: '13px', color: '#64748B' }}>
                    Create a new order for dine-in or takeaway
                  </p>
                </div>


              </div>

              {/* Search dishes input & Availability dropdown aligned to the right (Hidden when no dishes in branch per Bug 4) */}
              {dishes.length > 0 && (
                <div className="d-flex align-items-center gap-2">
                  <div className="position-relative" style={{ width: '280px', maxWidth: '100%' }}>
                    <FiSearch 
                      className="position-absolute text-danger" 
                      style={{ left: '14px', top: '13px', fontSize: '15px' }} 
                    />
                    <input
                      type="text"
                      className="form-control rounded-pill ps-5 bg-white border shadow-xs"
                      style={{
                        height: '42px',
                        fontSize: '13px',
                        borderColor: '#E2E8F0',
                        paddingRight: searchQuery ? '36px' : '14px'
                      }}
                      placeholder="Search dishes by name or category..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                    />
                    {searchQuery && (
                      <button
                        type="button"
                        className="btn btn-link position-absolute p-0 text-muted border-0"
                        style={{ right: '12px', top: '11px' }}
                        onClick={() => setSearchQuery('')}
                      >
                        <FiX size={16} />
                      </button>
                    )}
                  </div>

                  {/* Availability Filter beside Search Bar */}
                  <select
                    className="form-select rounded-pill shadow-xs fw-semibold border"
                    style={{
                      width: 'auto',
                      minWidth: '140px',
                      height: '42px',
                      borderColor: '#E2E8F0',
                      fontSize: '12.5px',
                      backgroundColor: '#FFFFFF',
                      color: '#334155',
                      cursor: 'pointer'
                    }}
                    value={availabilityFilter}
                    onChange={(e) => setAvailabilityFilter(e.target.value)}
                    aria-label="Filter dishes by availability"
                  >
                    <option value="ALL">All Status</option>
                    <option value="IN_STOCK">In Stock</option>
                    <option value="LOW_STOCK">Low Stock</option>
                    <option value="OUT_OF_STOCK">Out of Stock</option>
                  </select>
                </div>
              )}
            </div>

            {/* 2. Category Selectable Buttons with Icon and Category Name (Hidden when no dishes per Bug 4) */}
            {dishes.length > 0 && (
              <div className="d-flex align-items-center gap-2 overflow-x-auto pb-2 scrollbar-hidden mb-3">
                {/* All Categories Button */}
                <button
                  type="button"
                  onClick={() => {
                    setSelectedCategory('ALL');
                    setSelectedCategories([]);
                  }}
                  className={`btn text-nowrap d-flex align-items-center gap-2 px-3 py-1.5 fw-semibold transition-all rounded-pill ${
                    selectedCategories.length === 0 && selectedCategory === 'ALL'
                      ? 'btn-danger text-white shadow-xs'
                      : 'bg-white text-dark border shadow-xs'
                  }`}
                  style={{
                    fontSize: '13px',
                    height: '36px',
                    borderColor: selectedCategories.length === 0 && selectedCategory === 'ALL' ? '#F20D2D' : '#E2E8F0',
                    cursor: 'pointer'
                  }}
                  title="All Categories"
                >
                  <span>All Dishes ({dishes.length})</span>
                </button>

                {categories.filter(c => c !== 'ALL').map((cat, idx) => {
                  const count = categoryCounts[cat] || 0;
                  const isCatActive = selectedCategories.includes(cat);

                  const handlePillClick = () => {
                    setSelectedCategory('ALL'); // Multi-select mode
                    setSelectedCategories((prev) => {
                      if (prev.includes(cat)) {
                        return prev.filter(c => c !== cat);
                      } else {
                        return [...prev, cat];
                      }
                    });
                  };

                  return (
                    <button
                      key={idx}
                      type="button"
                      onClick={handlePillClick}
                      className={`btn text-nowrap d-flex align-items-center gap-2 px-3 py-1.5 fw-semibold transition-all rounded-pill ${
                        isCatActive
                          ? 'btn-danger text-white shadow-xs'
                          : 'bg-white text-dark border shadow-xs'
                      }`}
                      style={{
                        fontSize: '13px',
                        height: '36px',
                        borderColor: isCatActive ? '#F20D2D' : '#E2E8F0',
                        cursor: 'pointer'
                      }}
                      title={`${cat} (${count})`}
                    >
                      <span>{cat} ({count})</span>
                    </button>
                  );
                })}
              </div>
            )}

            {/* 3. Filter Toolbar Row: Food Type (Hidden when no dishes per Bug 4) */}
            {dishes.length > 0 && (
              <div className="d-flex align-items-center justify-content-between flex-wrap gap-2 mb-3">
                <div className="d-flex align-items-center gap-2 flex-wrap">
                  <span className="small fw-bold text-secondary me-1" style={{ fontSize: '12px' }}>Food Type:</span>
                  
                  {/* Food Type Buttons (Icon Only, Checkbox Toggle) */}
                  <div className="d-inline-flex align-items-center gap-1.5 p-1 bg-white rounded-pill border border-light-subtle shadow-xs">
                    <button
                      type="button"
                      onClick={() => setFoodTypeFilter({ veg: false, 'non-veg': false, vegan: false })}
                      className={`btn btn-sm rounded-circle p-0 d-inline-flex align-items-center justify-content-center transition-all ${
                        !foodTypeFilter.veg && !foodTypeFilter['non-veg'] && !foodTypeFilter.vegan ? 'btn-danger text-white shadow-xs' : 'btn-light text-secondary'
                      }`}
                      style={{ width: '32px', height: '32px' }}
                      title="All Food Types"
                      aria-label="All Food Types"
                    >
                      <FiGrid size={15} />
                    </button>

                    <button
                      type="button"
                      onClick={() => setFoodTypeFilter(prev => ({ ...prev, veg: !prev.veg }))}
                      className={`btn btn-sm rounded-circle p-0 d-inline-flex align-items-center justify-content-center transition-all ${
                        foodTypeFilter.veg ? 'btn-success text-white shadow-xs' : 'btn-light'
                      }`}
                      style={{ width: '32px', height: '32px' }}
                      title="Vegetarian"
                      aria-label="Vegetarian"
                    >
                      <span className="veg-badge" style={{ width: '15px', height: '15px' }}></span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setFoodTypeFilter(prev => ({ ...prev, 'non-veg': !prev['non-veg'] }))}
                      className={`btn btn-sm rounded-circle p-0 d-inline-flex align-items-center justify-content-center transition-all ${
                        foodTypeFilter['non-veg'] ? 'btn-danger text-white shadow-xs' : 'btn-light'
                      }`}
                      style={{ width: '32px', height: '32px' }}
                      title="Non-Vegetarian"
                      aria-label="Non-Vegetarian"
                    >
                      <span className="non-veg-badge" style={{ width: '15px', height: '15px' }}></span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setFoodTypeFilter(prev => ({ ...prev, vegan: !prev.vegan }))}
                      className={`btn btn-sm rounded-circle p-0 d-inline-flex align-items-center justify-content-center transition-all ${
                        foodTypeFilter.vegan ? 'btn-success text-white shadow-xs' : 'btn-light'
                      }`}
                      style={{ width: '32px', height: '32px' }}
                      title="Vegan"
                      aria-label="Vegan"
                    >
                      <span className="vegan-badge" style={{ width: '15px', height: '15px' }}></span>
                    </button>
                  </div>
                </div>

                {/* View Mode Toggle: Grid Icon (Card View) vs Table/List Icon (Table View) */}
                <div className="btn-group p-1 bg-white rounded-pill border border-light-subtle shadow-xs" role="group" aria-label="POS view mode">
                  <button
                    type="button"
                    onClick={() => setPosViewMode('grid')}
                    className={`btn btn-sm rounded-pill p-0 fw-bold transition-all border-0 d-inline-flex align-items-center justify-content-center ${
                      posViewMode === 'grid' ? 'btn-danger text-white shadow-xs' : 'text-secondary bg-transparent'
                    }`}
                    style={{ width: '32px', height: '30px' }}
                    title="Card View"
                    aria-label="Card View"
                  >
                    <FiGrid size={15} />
                  </button>
                  <button
                    type="button"
                    onClick={() => setPosViewMode('table')}
                    className={`btn btn-sm rounded-pill p-0 fw-bold transition-all border-0 d-inline-flex align-items-center justify-content-center ${
                      posViewMode === 'table' ? 'btn-danger text-white shadow-xs' : 'text-secondary bg-transparent'
                    }`}
                    style={{ width: '32px', height: '30px' }}
                    title="Table View"
                    aria-label="Table View"
                  >
                    <FiList size={15} />
                  </button>
                </div>
              </div>
            )}

            {/* 4. Food Cards Responsive 4-Column Grid / Table View */}
            <div className="flex-grow-1 min-h-0">
              {loading ? (
                <div className="min-vh-50 d-flex align-items-center justify-content-center py-5">
                  <Loader />
                </div>
              ) : filteredDishes.length === 0 ? (
                <div className="p-5 text-center bg-white rounded-4 border border-light-subtle shadow-xs my-3">
                  <div className="text-secondary opacity-50 mb-2">
                    <FiSearch size={36} />
                  </div>
                  <h6 className="fw-bold text-dark mb-1">No Dishes Found</h6>
                  <p className="text-muted small mb-0">
                    {dishes.length === 0 
                      ? 'No dishes are configured for the selected branch.' 
                      : 'Try adjusting your category, food type, or search term.'}
                  </p>
                </div>
              ) : posViewMode === 'table' ? (
                <div className="card rounded-4 border shadow-sm overflow-hidden mb-4 bg-white" style={{ borderColor: '#E2E8F0' }}>
                  <div className="table-responsive">
                    <table className="table align-middle mb-0">
                      <thead>
                        <tr className="small fw-semibold text-secondary" style={{ fontSize: '12px', backgroundColor: '#F8FAFC', borderBottom: '1px solid #E2E8F0' }}>
                          <th className="ps-3 py-3" style={{ width: '32%', minWidth: '160px' }}>Dish Name</th>
                          <th className="py-3" style={{ width: '13%' }}>Original Price</th>
                          <th className="py-3" style={{ width: '13%' }}>Discount</th>
                          <th className="py-3" style={{ width: '14%' }}>Final Price</th>
                          <th className="py-3" style={{ width: '14%' }}>Availability</th>
                          <th className="text-end pe-3 py-3" style={{ width: '14%' }}>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredDishes.map((dish) => {
                          const isOutOfStock = 
                            dish.status === 'Out of Stock' || 
                            dish.status === 'OUT_OF_STOCK' || 
                            Number(dish.stock) <= 0 || 
                            dish.is_orderable === false || 
                            dish.isOrderable === false;
                          const isLowStock = !isOutOfStock && Number(dish.stock) > 0 && Number(dish.stock) <= 5;
                          const ft = normalizeFoodType(dish.foodType || dish.type);
                          const isVeg = ft === 'veg' || ft === 'vegan';
                          const originalPrice = Number(dish.price || dish.originalPrice || dish.sellingPrice || 0);
                          const finalPrice = Number(dish.sellingPrice || dish.discountPrice || originalPrice);
                          const hasDiscount = Boolean(dish.hasDiscount && originalPrice > finalPrice);
                          const discountAmount = hasDiscount ? (originalPrice - finalPrice) : 0;
                          const discountPercent = dish.discountPercent || (hasDiscount && originalPrice > 0 ? Math.round((discountAmount / originalPrice) * 100) : 0);
                          const cartItem = cartItems.find(i => String(i.dish.id) === String(dish.id));
                          const cartQty = cartItem?.quantity || 0;

                          return (
                            <tr key={dish.id} style={{ borderBottom: '1px solid #F1F5F9' }}>
                              <td className="ps-3 py-2.5">
                                <div className="d-flex align-items-center gap-2">
                                  <span 
                                    className={`flex-shrink-0 ${isVeg ? 'veg-badge' : 'non-veg-badge'}`} 
                                    style={{ width: '15px', height: '15px' }} 
                                    title={isVeg ? 'Vegetarian' : 'Non-Vegetarian'}
                                  />
                                  <div className="min-w-0">
                                    <div className="fw-bold text-dark text-truncate" style={{ fontSize: '13px', maxWidth: '260px' }}>
                                      {dish.name}
                                    </div>
                                    <div className="text-secondary small text-truncate" style={{ fontSize: '11px', color: '#64748B' }}>
                                      {dish.category || 'General'}
                                    </div>
                                  </div>
                                </div>
                              </td>

                              {/* Original Price */}
                              <td className="py-2.5" style={{ fontSize: '13px' }}>
                                {hasDiscount ? (
                                  <span className="text-muted text-decoration-line-through">
                                    {formatCurrency(originalPrice)}
                                  </span>
                                ) : (
                                  <span className="text-secondary">
                                    {formatCurrency(originalPrice)}
                                  </span>
                                )}
                              </td>

                              {/* Discount */}
                              <td className="py-2.5">
                                {hasDiscount ? (
                                  <span className="badge bg-success-subtle text-success rounded-pill px-2 py-0.5 fw-semibold" style={{ fontSize: '11px' }}>
                                    {discountPercent > 0 ? `${discountPercent}% OFF` : `-${formatCurrency(discountAmount)}`}
                                  </span>
                                ) : (
                                  <span className="text-muted small">—</span>
                                )}
                              </td>

                              {/* Final Price */}
                              <td className="py-2.5 fw-bold" style={{ fontSize: '13.5px', color: '#F20D2D' }}>
                                {formatCurrency(finalPrice)}
                              </td>

                              {/* Availability */}
                              <td className="py-2.5">
                                <span 
                                  className={`badge rounded-pill fw-semibold px-2 py-0.5 ${
                                    isOutOfStock 
                                      ? 'bg-danger-subtle text-danger border border-danger-subtle' 
                                      : isLowStock 
                                        ? 'bg-warning-subtle text-warning-emphasis border border-warning-subtle' 
                                        : 'bg-success-subtle text-success border border-success-subtle'
                                  }`}
                                  style={{ fontSize: '11px' }}
                                >
                                  ● {isOutOfStock ? 'Out of Stock' : isLowStock ? 'Low Stock' : 'In Stock'}
                                </span>
                              </td>

                              {/* Actions: Customize & Add / Stepper */}
                              <td className="text-end pe-3 py-2.5">
                                <div className="d-flex align-items-center justify-content-end gap-2">
                                  <button
                                    type="button"
                                    onClick={() => handleOpenCustomize(dish)}
                                    className="btn btn-sm p-0 rounded-circle bg-white d-inline-flex align-items-center justify-content-center shadow-xs"
                                    style={{ width: '30px', height: '30px', border: '1.5px solid #F20D2D', color: '#F20D2D' }}
                                    title="Customize & Add Special Instructions"
                                    disabled={isOutOfStock}
                                  >
                                    <FiEdit2 size={13} />
                                  </button>

                                  {cartQty > 0 ? (
                                    <div 
                                      className="d-flex align-items-center justify-content-between bg-white border px-1.5 shadow-xs"
                                      style={{ height: '30px', borderRadius: '15px', borderColor: '#CBD5E1', minWidth: '78px' }}
                                    >
                                      <button
                                        type="button"
                                        className="btn btn-link p-0 text-danger border-0 fw-bold d-flex align-items-center justify-content-center"
                                        style={{ width: '22px', height: '22px', textDecoration: 'none', fontSize: '15px', lineHeight: 1 }}
                                        onClick={() => handleDecrementDish(dish)}
                                        title="Decrease quantity"
                                      >
                                        −
                                      </button>
                                      <span className="fw-bold small px-1 text-center" style={{ fontSize: '12px', minWidth: '16px' }}>
                                        {cartQty}
                                      </span>
                                      <button
                                        type="button"
                                        className="btn btn-link p-0 border-0 fw-bold d-flex align-items-center justify-content-center"
                                        style={{ color: '#F20D2D', textDecoration: 'none', fontSize: '15px', lineHeight: 1 }}
                                        onClick={() => handleIncrementDish(dish)}
                                        title="Increase quantity"
                                      >
                                        +
                                      </button>
                                    </div>
                                  ) : (
                                    <button
                                      type="button"
                                      onClick={() => handleAddDish(dish)}
                                      className="btn btn-sm px-2.5 py-1 d-inline-flex align-items-center justify-content-center gap-1 rounded-pill shadow-xs fw-semibold"
                                      style={{
                                        height: '30px',
                                        backgroundColor: '#F20D2D',
                                        borderColor: '#F20D2D',
                                        color: '#FFFFFF',
                                        cursor: isOutOfStock ? 'not-allowed' : 'pointer',
                                        opacity: isOutOfStock ? 0.4 : 1,
                                        fontSize: '12px'
                                      }}
                                      disabled={isOutOfStock}
                                      title={isOutOfStock ? "Out of Stock" : `Add ${dish.name} to order`}
                                    >
                                      <FiPlus size={13} /> Add
                                    </button>
                                  )}
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
                <div className="row row-cols-1 row-cols-sm-2 row-cols-md-3 row-cols-xl-4 g-3 pb-4">
                  {filteredDishes.map((dish, dIdx) => {
                    const isOutOfStock = 
                      dish.status === 'Out of Stock' || 
                      dish.status === 'OUT_OF_STOCK' || 
                      Number(dish.stock) <= 0 || 
                      dish.is_orderable === false || 
                      dish.isOrderable === false;
                    const isLowStock = !isOutOfStock && Number(dish.stock) > 0 && Number(dish.stock) <= 5;
                    const ft = normalizeFoodType(dish.foodType || dish.type);
                    const isVeg = ft === 'veg' || ft === 'vegan';

                    const matchingCartItems = cartItems.filter(i => String(i.dish.id) === String(dish.id));
                    const cartQty = matchingCartItems.reduce((sum, i) => sum + Number(i.quantity || 0), 0);
                    const hasToppings = Array.isArray(dish.customizations) && dish.customizations.length > 0;

                    const isBestseller = dish.is_bestseller || dish.order_count > 40 || dIdx === 0;
                    const isPopular = !isBestseller && (dish.discountPercent > 10 || dIdx === 6);

                    return (
                      <div key={dish.id} className="col">
                        <div 
                          className="card h-100 border-0 shadow-xs transition-all overflow-hidden pos-dish-card"
                          style={{
                            borderRadius: '12px',
                            backgroundColor: '#FFFFFF',
                            border: '1px solid #E2E8F0',
                            transition: 'transform 0.2s ease, box-shadow 0.2s ease',
                            minHeight: '210px'
                          }}
                        >
{/* Header row with Veg/Non-Veg icon & optional Bestseller/Popular pill (Dish images hidden in POS) */}
                          <div className="card-body p-3 d-flex flex-column h-100">
                            <div>
                              <div className="d-flex align-items-center justify-content-between mb-2">
                                <div 
                                  className="shadow-2xs d-flex align-items-center justify-content-center bg-white"
                                  style={{
                                    width: '18px',
                                    height: '18px',
                                    border: isVeg ? '1.5px solid #22c55e' : '1.5px solid #ef4444',
                                    borderRadius: '3px'
                                  }}
                                  title={isVeg ? 'Vegetarian' : 'Non-Vegetarian'}
                                >
                                  {isVeg ? (
                                    <div style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: '#22c55e' }} />
                                  ) : (
                                    <div style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: '#ef4444' }} />
                                  )}
                                </div>

                                {isBestseller ? (
                                  <span 
                                    className="badge rounded-pill fw-semibold shadow-2xs"
                                    style={{
                                      backgroundColor: '#FEE2E2',
                                      color: '#DC2626',
                                      fontSize: '10.5px',
                                      padding: '2px 8px'
                                    }}
                                  >
                                    Bestseller
                                  </span>
                                ) : isPopular ? (
                                  <span 
                                    className="badge rounded-pill fw-semibold shadow-2xs"
                                    style={{
                                      backgroundColor: '#FEF3C7',
                                      color: '#D97706',
                                      fontSize: '10.5px',
                                      padding: '2px 8px'
                                    }}
                                  >
                                    Popular
                                  </span>
                                ) : null}
                              </div>
                              <div style={{ minHeight: '42px', maxHeight: '42px', overflow: 'hidden' }}>
                                <h6
                                  className="fw-bold text-dark mb-0"
                                  title={dish.name}
                                  style={{
                                    fontSize: '14.5px',
                                    lineHeight: '1.3',
                                    display: '-webkit-box',
                                    WebkitLineClamp: 2,
                                    WebkitBoxOrient: 'vertical',
                                    overflow: 'hidden',
                                  }}
                                >
                                  {dish.name}
                                </h6>
                              </div>
                              <div className="text-secondary small mt-0.5 text-truncate" style={{ fontSize: '12px', color: '#64748B', minHeight: '18px' }}>
                                {dish.category || 'General'}
                              </div>
                            </div>

                            {/* Price Row with Availability Status Dot (Anchored at fixed position) */}
                            <div className="d-flex align-items-center justify-content-between mt-auto pt-2 flex-wrap gap-2" style={{ minHeight: '28px' }}>
                              <div className="d-flex align-items-baseline gap-1.5 flex-wrap">
                                <span className="fw-bold" style={{ color: '#F20D2D', fontSize: '16px' }}>
                                  {formatCurrency(dish.sellingPrice || dish.price)}
                                </span>
                                {dish.hasDiscount && dish.price > (dish.sellingPrice || dish.price) && (
                                  <span className="text-muted text-decoration-line-through small" style={{ fontSize: '12px', color: '#94A3B8' }}>
                                    {formatCurrency(dish.price)}
                                  </span>
                                )}
                              </div>

                              {/* Stock status pill/dot in price row where it never collides with buttons */}
                              <div className="d-inline-flex align-items-center" style={{ gap: '8px' }} title={isOutOfStock ? 'Out of Stock' : isLowStock ? 'Low Stock' : 'In Stock'}>
                                <span
                                  className="rounded-circle flex-shrink-0"
                                  style={{
                                    width: '8px',
                                    height: '8px',
                                    backgroundColor: isOutOfStock ? '#DC2626' : isLowStock ? '#D97706' : '#16A34A',
                                    boxShadow: isOutOfStock ? '0 0 0 2px rgba(220, 38, 38, 0.2)' : isLowStock ? '0 0 0 2px rgba(217, 119, 6, 0.2)' : '0 0 0 2px rgba(22, 163, 74, 0.2)'
                                  }}
                                />
                                <span style={{ fontSize: '11px', color: isOutOfStock ? '#DC2626' : isLowStock ? '#D97706' : '#16A34A', fontWeight: 500 }}>
                                  {isOutOfStock ? 'Out of Stock' : isLowStock ? 'Low Stock' : 'In Stock'}
                                </span>
                              </div>
                            </div>

                            {/* Action Row: Customize Button & Add/Stepper Button with full responsive wrapping */}
                            <div className="d-flex align-items-center justify-content-between mt-2 pt-2 border-top border-light-subtle flex-wrap gap-2" style={{ minHeight: '38px' }}>
                              {/* Left: Customize button (visible for all dishes to add instructions/customizations) */}
                              <div>
                                <button
                                  type="button"
                                  onClick={() => handleOpenCustomize(dish)}
                                  className="btn btn-sm px-2 py-1 fw-medium rounded-pill bg-white flex-shrink-0 d-inline-flex align-items-center justify-content-center"
                                  style={{ 
                                    width: '32px',
                                    height: '32px', 
                                    border: '1.5px solid #F20D2D', 
                                    color: '#F20D2D',
                                  }}
                                  title="Customize & Add Special Instructions"
                                  disabled={isOutOfStock}
                                >
                                  <FiEdit2 size={13} />
                                </button>
                              </div>

                              {/* Right: Add / Stepper container (Initial state has only Add) */}
                              <div className="d-flex align-items-center ms-auto">
                                {cartQty > 0 ? (
                                  <div 
                                    className="d-flex align-items-center justify-content-between bg-white border px-2 shadow-xs"
                                    style={{
                                      height: '32px',
                                      borderRadius: '16px',
                                      borderColor: '#E2E8F0',
                                      minWidth: '80px'
                                    }}
                                  >
                                    <button
                                      type="button"
                                      className="btn btn-link p-0 border-0 fw-bold d-flex align-items-center justify-content-center"
                                      style={{ color: '#F20D2D', textDecoration: 'none', fontSize: '16px', lineHeight: 1 }}
                                      onClick={() => handleDecrementDish(dish)}
                                      title="Decrease quantity"
                                    >
                                      −
                                    </button>
                                    <span className="fw-bold small px-1.5" style={{ fontSize: '13px', color: '#0F172A' }}>
                                      {cartQty}
                                    </span>
                                    <button
                                      type="button"
                                      className="btn btn-link p-0 border-0 fw-bold d-flex align-items-center justify-content-center"
                                      style={{ color: '#F20D2D', textDecoration: 'none', fontSize: '16px', lineHeight: 1 }}
                                      onClick={() => handleIncrementDish(dish)}
                                      title="Increase quantity"
                                    >
                                      +
                                    </button>
                                  </div>
                                ) : (
                                  <button
                                    type="button"
                                    onClick={() => handleAddDish(dish)}
                                    className="btn btn-sm px-3 py-1 d-inline-flex align-items-center justify-content-center gap-1 rounded-pill shadow-xs transition-all fw-semibold flex-shrink-0"
                                    style={{
                                      height: '32px',
                                      minWidth: '78px',
                                      backgroundColor: '#F20D2D',
                                      borderColor: '#F20D2D',
                                      color: '#FFFFFF',
                                      cursor: isOutOfStock ? 'not-allowed' : 'pointer',
                                      opacity: isOutOfStock ? 0.4 : 1,
                                      fontSize: '12px',
                                      whiteSpace: 'nowrap'
                                    }}
                                    disabled={isOutOfStock}
                                    title={isOutOfStock ? "Out of Stock" : `Add ${dish.name} to order`}
                                  >
                                    <FiPlus size={14} /> Add
                                  </button>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

          </div>

          {/* RIGHT COLUMN: Order Panel (~35%) */}
          <div 
            className={`pos-order-panel-container flex-column min-h-0 ${mobilePosTab !== 'order' ? 'd-none d-lg-flex' : 'd-flex'}`}
            style={{ 
              flex: isMobile ? '1 1 100%' : '0 0 35%', 
              maxWidth: isMobile ? '100%' : '35%', 
              width: isMobile ? '100%' : undefined 
            }}
          >
            <div 
              className="card border-0 shadow-sm d-flex flex-column h-100 overflow-hidden"
              style={{
                borderRadius: '18px',
                border: '1px solid #E2E8F0',
                backgroundColor: '#FFFFFF',
                padding: '16px',
                gap: '12px'
              }}
            >
              
              {/* 1. Service Type Toggle: Dine-In vs Takeaway */}
              <div className="d-flex align-items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleToggleOrderType('DINE_IN')}
                  className="btn flex-grow-1 d-flex align-items-center justify-content-center gap-2 fw-semibold transition-all shadow-xs"
                  style={{
                    height: '42px',
                    borderRadius: '12px',
                    fontSize: '13.5px',
                    backgroundColor: orderType === 'DINE_IN' ? '#F20D2D' : '#FFFFFF',
                    color: orderType === 'DINE_IN' ? '#FFFFFF' : '#334155',
                    borderColor: orderType === 'DINE_IN' ? '#F20D2D' : '#E2E8F0',
                    borderWidth: '1px',
                    borderStyle: 'solid'
                  }}
                >
                  <FiLayers size={16} />
                  <span>Dine-in</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleToggleOrderType('TAKEAWAY')}
                  className="btn flex-grow-1 d-flex align-items-center justify-content-center gap-2 fw-semibold transition-all shadow-xs"
                  style={{
                    height: '42px',
                    borderRadius: '12px',
                    fontSize: '13.5px',
                    backgroundColor: orderType === 'TAKEAWAY' ? '#F20D2D' : '#FFFFFF',
                    color: orderType === 'TAKEAWAY' ? '#FFFFFF' : '#334155',
                    borderColor: orderType === 'TAKEAWAY' ? '#F20D2D' : '#E2E8F0',
                    borderWidth: '1px',
                    borderStyle: 'solid'
                  }}
                >
                  <FiShoppingBag size={16} />
                  <span>Takeaway</span>
                </button>
              </div>

              {/* 2. Dining / Customer Selectors Row */}
              <div className="row g-2">
                
                {/* Select Table * (or Counter for Takeaway) */}
                <div className="col-6">
                  <label className="form-label mb-1 fw-bold text-dark" style={{ fontSize: '11.5px', color: '#1E293B' }}>
                    {orderType === 'DINE_IN' ? 'Select Table *' : 'Service Counter'}
                  </label>
                  {orderType === 'DINE_IN' ? (
                    <div 
                      className="position-relative cursor-pointer"
                      onClick={() => setShowTablePicker(true)}
                    >
                      <FiLayers className="position-absolute text-muted" style={{ left: '11px', top: '12px', fontSize: '14px' }} />
                      <div
                        className="form-control form-control-sm shadow-xs fw-semibold d-flex align-items-center justify-content-between bg-white cursor-pointer"
                        style={{
                          minHeight: selectedTable ? '48px' : '38px',
                          borderRadius: '10px',
                          paddingLeft: '32px',
                          paddingRight: '12px',
                          paddingTop: selectedTable ? '4px' : '6px',
                          paddingBottom: selectedTable ? '4px' : '6px',
                          fontSize: '12px',
                          borderColor: '#E2E8F0',
                          cursor: 'pointer'
                        }}
                        role="button"
                        tabIndex={0}
                        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') setShowTablePicker(true); }}
                      >
                        {selectedTable ? (
                          <div className="d-flex flex-column text-start line-height-1">
                            <span className="text-dark fw-bold" style={{ fontSize: '12.5px' }}>
                              {getShortTableNumber(selectedTable.number || selectedTable.table_number || selectedTable.id)} ({selectedTable.capacity || 4} Seats)
                            </span>
                            <span className="text-secondary small" style={{ fontSize: '11px', marginTop: '2px' }}>
                              {selectedTable.location || selectedTable.area || 'Indoor Main'}
                            </span>
                          </div>
                        ) : (
                          <span className="text-muted fw-normal">Select Table for Dine-In...</span>
                        )}
                        <span className="text-secondary small ms-2" style={{ fontSize: '10px' }}>▼</span>
                      </div>
                    </div>
                  ) : (
                    <div 
                      className="d-flex align-items-center gap-2 px-2.5 py-1.5 bg-light rounded-3 border border-light-subtle"
                      style={{ height: '38px', fontSize: '12px', color: '#475569' }}
                    >
                      <FiShoppingBag className="text-danger flex-shrink-0" />
                      <span className="fw-semibold text-truncate">Takeaway Counter</span>
                    </div>
                  )}
                </div>

                {/* Customer (Optional) */}
                <div className="col-6">
                  <label className="form-label mb-1 fw-bold text-dark" style={{ fontSize: '11.5px', color: '#1E293B' }}>
                    Customer (Optional)
                  </label>
                  <div className="position-relative">
                    <FiUser className="position-absolute text-muted" style={{ left: '11px', top: '12px', fontSize: '14px' }} />
                    <input
                      type="text"
                      className="form-control form-control-sm shadow-xs"
                      style={{
                        height: '38px',
                        borderRadius: '10px',
                        paddingLeft: '32px',
                        fontSize: '12.5px',
                        borderColor: '#E2E8F0'
                      }}
                      placeholder="Ravi Kumar"
                      value={customerName}
                      onChange={(e) => setCustomerName(e.target.value)}
                    />
                  </div>
                </div>

                {/* Customer Mobile (required for order record if new order) */}
                <div className="col-12 mt-1">
                  <div className="input-group input-group-sm">
                    <span className="input-group-text bg-light border-light-subtle text-muted px-2.5" style={{ height: '38px', borderRadius: '10px 0 0 10px' }}>
                      <FiPhone size={14} />
                    </span>
                    <input
                      type="tel"
                      className="form-control form-control-sm border-light-subtle shadow-xs"
                      style={{ height: '38px', borderRadius: '0 10px 10px 0', fontSize: '12.5px' }}
                      placeholder="Customer Mobile (e.g. 9876543210)"
                      value={customerPhone}
                      onChange={(e) => {
                        setCustomerPhone(e.target.value.replace(/\D/g, '').slice(0, 10));
                        if (orderError && orderError.toLowerCase().includes('mobile')) setOrderError('');
                      }}
                    />
                  </div>
                </div>
              </div>

              {/* 3. Apply Coupon Bar (Takeaway only; Dine-in coupons applied at Complete Session) */}
              {orderType === 'TAKEAWAY' && (
                <>
                  <div 
                    className="d-flex flex-column gap-2 p-2.5 shadow-xs"
                    style={{
                      backgroundColor: '#FFF5F5',
                      border: '1px dashed #FECDD3',
                      borderRadius: '12px'
                    }}
                  >
                    <div className="d-flex align-items-center justify-content-between">
                      <div className="d-flex align-items-center gap-2 ps-1">
                        <FiTag style={{ color: '#F20D2D', fontSize: '16px' }} />
                        <span className="fw-semibold text-dark" style={{ fontSize: '13px' }}>
                          Apply Coupon
                        </span>
                      </div>

                      {/* View Coupons Button */}
                      <button
                        type="button"
                        onClick={() => setShowCouponModal(true)}
                        className="btn btn-sm p-0 text-danger fw-bold text-decoration-none d-inline-flex align-items-center gap-1"
                        style={{ fontSize: '12px' }}
                      >
                        <span>View Coupons ({coupons.length})</span>
                        <span style={{ fontSize: '10px' }}>›</span>
                      </button>
                    </div>

                    {appliedCoupon ? (
                      <div className="d-flex align-items-center justify-content-between bg-white px-2.5 py-1.5 rounded-3 border border-danger-subtle">
                        <div className="d-flex align-items-center gap-2">
                          <span className="badge bg-danger text-white rounded-pill px-2.5 py-1" style={{ fontSize: '11px' }}>
                            {appliedCoupon.code}
                          </span>
                          <span className="small fw-bold text-success" style={{ fontSize: '12px' }}>
                            -{formatCurrency(billSummary.couponDiscount)} OFF
                          </span>
                        </div>
                        <button 
                          type="button" 
                          onClick={handleRemoveCoupon} 
                          className="btn btn-sm btn-link p-0 text-danger border-0"
                          title="Remove coupon"
                        >
                          <FiX size={16} />
                        </button>
                      </div>
                    ) : (
                      <div className="d-flex align-items-center gap-1.5 w-100">
                        <input
                          type="text"
                          className="form-control form-control-sm border-light-subtle shadow-xs"
                          style={{ height: '34px', borderRadius: '8px', fontSize: '12px', paddingLeft: '10px' }}
                          placeholder="Enter promo coupon code"
                          value={couponCodeInput}
                          onChange={(e) => setCouponCodeInput(e.target.value.toUpperCase())}
                        />
                        <button
                          type="button"
                          onClick={() => handleApplyCoupon(couponCodeInput)}
                          className="btn btn-sm fw-semibold shadow-xs text-nowrap"
                          style={{
                            height: '34px',
                            border: '1.5px solid #F20D2D',
                            color: '#F20D2D',
                            backgroundColor: '#FFFFFF',
                            borderRadius: '8px',
                            fontSize: '12px',
                            padding: '0 14px'
                          }}
                        >
                          Apply
                        </button>
                      </div>
                    )}
                  </div>

                  {couponError && (
                    <div className="text-danger small mt-n2" style={{ fontSize: '11px' }}>
                      {couponError}
                    </div>
                  )}
                </>
              )}

              {/* 4. Order Items Section (Independently scrollable) */}
              <div className="d-flex flex-column flex-grow-1 min-h-0 overflow-hidden" style={{ minHeight: '110px' }}>
                <div className="d-flex align-items-center justify-content-between mb-2 pb-1 border-bottom border-light-subtle flex-shrink-0">
                  <span className="fw-bold text-dark" style={{ fontSize: '14.5px' }}>
                    Order Items ({cartItems.length})
                  </span>
                  {cartItems.length > 0 && (
                    <button
                      type="button"
                      onClick={handleResetOrder}
                      className="btn btn-link p-0 text-danger small text-decoration-none fw-semibold d-flex align-items-center gap-1"
                      style={{ fontSize: '12px' }}
                    >
                      <FiTrash2 size={13} />
                      <span>Clear All</span>
                    </button>
                  )}
                </div>

                {/* Items Scrollable List */}
                <div className="flex-grow-1 min-h-0 overflow-y-auto pe-1 d-flex flex-column gap-2" style={{ overscrollBehavior: 'contain' }}>
                  {cartItems.length === 0 ? (
                    <div className="p-3 text-center rounded-3 bg-light text-muted border border-dashed my-auto">
                      <FiShoppingBag size={26} className="mb-1 text-secondary opacity-50" />
                      <p className="small mb-0 fw-bold text-dark" style={{ fontSize: '12.5px' }}>No dishes in order ticket.</p>
                      <p className="text-secondary small mb-0 mt-0.5" style={{ fontSize: '11px' }}>Select dishes from the menu to start order.</p>
                      {hasSavedCart && (
                        <div className="mt-2">
                          <button
                            type="button"
                            onClick={handleContinueSavedCart}
                            className="btn btn-sm btn-outline-danger rounded-pill px-3 py-1 fw-bold d-inline-flex align-items-center gap-1.5 shadow-xs"
                            style={{ fontSize: '11.5px' }}
                          >
                            <FiRefreshCw size={12} />
                            <span>Continue Saved Order</span>
                          </button>
                        </div>
                      )}
                    </div>
                  ) : (
                    cartItems.map((item, idx) => {
                      const originalPrice = Number(item.dish.price || item.dish.originalPrice || item.dish.sellingPrice || 0);
                      const sellingPrice = Number(item.dish.sellingPrice || item.dish.discountPrice || originalPrice);
                      const optionsTotal = (item.options || []).reduce((acc, opt) => acc + Number(opt.extra_price ?? opt.price ?? 0), 0);
                      const itemUnitPrice = sellingPrice + optionsTotal;
                      const lineTotal = itemUnitPrice * item.quantity;

                      return (
                        <div 
                          key={`${item.dish.id}-${idx}`}
                          className="d-flex align-items-center justify-content-between p-2 rounded-3 border border-light-subtle bg-white shadow-xs gap-2 flex-shrink-0"
                        >
                          {/* Thumbnail */}
                          <div 
                            className="rounded-3 overflow-hidden flex-shrink-0 bg-light d-flex align-items-center justify-content-center"
                            style={{ width: '42px', height: '42px' }}
                          >
                            {item.dish.image ? (
                              <img src={item.dish.image} alt={item.dish.name} className="w-100 h-100 object-fit-cover" />
                            ) : (
                              <span>🍲</span>
                            )}
                          </div>

                          {/* Info & Item Instructions */}
                          <div className="flex-grow-1 min-w-0 text-start">
                            <div className="fw-bold text-dark text-truncate" style={{ fontSize: '12.5px' }}>
                              {item.dish.name}
                            </div>
                            <div className="d-flex align-items-baseline gap-1.5 flex-wrap">
                              <span className="fw-bold text-danger" style={{ fontSize: '12px' }}>
                                {formatCurrency(itemUnitPrice)}
                              </span>
                              {item.dish.hasDiscount && originalPrice > sellingPrice && (
                                <span className="text-muted text-decoration-line-through small" style={{ fontSize: '11px', color: '#94A3B8' }}>
                                  {formatCurrency(originalPrice + optionsTotal)}
                                </span>
                              )}
                            </div>
                            {item.dish.hasDiscount && originalPrice > sellingPrice && (
                              <div className="text-success fw-semibold" style={{ fontSize: '10.5px' }}>
                                -{formatCurrency((originalPrice - sellingPrice) * item.quantity)} off
                              </div>
                            )}
                            {item.specialInstructions && (
                              <div className="mt-1 small text-danger fw-medium" style={{ fontSize: '10.5px' }}>
                                <span className="text-secondary me-1">Note:</span>{item.specialInstructions}
                              </div>
                            )}
                            {Array.isArray(item.options) && item.options.length > 0 && (
                              <div className="text-muted" style={{ fontSize: '10px' }}>
                                + {item.options.map(o => o.name).join(', ')}
                              </div>
                            )}
                          </div>

                          {/* Controls Row: Stepper, Price & Delete with proper spacing */}
                          <div className="d-flex align-items-center gap-2.5 flex-shrink-0">
                            {/* Stepper */}
                            <div 
                              className="d-flex align-items-center justify-content-between bg-white border px-1 shadow-xs flex-shrink-0"
                              style={{ height: '28px', borderRadius: '14px', borderColor: '#CBD5E1', minWidth: '74px' }}
                            >
                              <button
                                type="button"
                                onClick={() => handleUpdateQuantity(idx, -1)}
                                className="btn btn-link p-0 text-danger border-0 fw-bold d-flex align-items-center justify-content-center"
                                style={{ width: '22px', height: '22px', textDecoration: 'none', fontSize: '15px', lineHeight: 1 }}
                                title="Decrease quantity"
                              >
                                −
                              </button>
                              <span className="fw-bold small px-1 text-center" style={{ fontSize: '12px', minWidth: '18px' }}>
                                {item.quantity}
                              </span>
                              <button
                                type="button"
                                onClick={() => handleUpdateQuantity(idx, 1)}
                                className="btn btn-link p-0 text-danger border-0 fw-bold d-flex align-items-center justify-content-center"
                                style={{ width: '22px', height: '22px', textDecoration: 'none', fontSize: '15px', lineHeight: 1 }}
                                title="Increase quantity"
                              >
                                +
                              </button>
                            </div>

                            {/* Line Total with proper clearance */}
                            <span 
                              className="fw-bold text-dark text-nowrap text-end" 
                              style={{ fontSize: '13.5px', minWidth: '60px' }}
                            >
                              {formatCurrency(lineTotal)}
                            </span>

                            {/* Remove Trash Button */}
                            <button
                              type="button"
                              onClick={() => handleRemoveItem(idx)}
                              className="btn btn-link p-1 text-danger border-0 flex-shrink-0 d-flex align-items-center justify-content-center"
                              style={{ width: '26px', height: '26px' }}
                              title="Remove item"
                            >
                              <FiTrash2 size={15} style={{ color: '#EF4444' }} />
                            </button>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>

              {/* 5. Sticky Footer: Bill Summary & Action Buttons */}
              <div 
                className="pos-order-footer d-flex flex-column gap-2 pt-2 border-top border-light-subtle flex-shrink-0"
                style={{
                  backgroundColor: '#FFFFFF',
                  zIndex: 5,
                  marginTop: 'auto'
                }}
              >
                <div className="d-flex align-items-center justify-content-between text-secondary" style={{ fontSize: '12px' }}>
                  <span>Subtotal</span>
                  <span className="fw-semibold text-dark">{formatCurrency(billSummary.itemsSubtotal + billSummary.addOnsTotal)}</span>
                </div>

                {billSummary.dishDiscountsTotal > 0 && (
                  <div className="d-flex align-items-center justify-content-between" style={{ fontSize: '12px', color: '#10B981' }}>
                    <span>Item Discount</span>
                    <span className="fw-semibold">-{formatCurrency(billSummary.dishDiscountsTotal)}</span>
                  </div>
                )}

                {billSummary.couponDiscount > 0 && (
                  <div className="d-flex align-items-center justify-content-between" style={{ fontSize: '12px', color: '#10B981' }}>
                    <span>Coupon ({appliedCoupon?.code || 'Discount'})</span>
                    <span className="fw-semibold">-{formatCurrency(billSummary.couponDiscount)}</span>
                  </div>
                )}

                {orderType === 'TAKEAWAY' && billSummary.packingCharge > 0 && (
                  <div className="d-flex align-items-center justify-content-between text-secondary" style={{ fontSize: '12px' }}>
                    <span>Takeaway Packing Charge</span>
                    <span className="fw-semibold text-dark">+{formatCurrency(billSummary.packingCharge)}</span>
                  </div>
                )}

                <div className="d-flex align-items-center justify-content-between text-secondary" style={{ fontSize: '12px' }}>
                  <span>GST (5%)</span>
                  <span className="fw-semibold text-dark">{formatCurrency(billSummary.gstAmount)}</span>
                </div>

                {/* Grand Total Banner */}
                <div 
                  className="d-flex align-items-center justify-content-between px-3 py-2 mt-0.5 shadow-xs"
                  style={{
                    backgroundColor: '#FEECEE',
                    borderRadius: '12px',
                  }}
                >
                  <span className="fw-bold text-dark" style={{ fontSize: '14px' }}>
                    Grand Total
                  </span>
                  <span className="fw-bold" style={{ fontSize: '20px', color: '#F20D2D', letterSpacing: '-0.3px' }}>
                    {formatCurrency(billSummary.grandTotal)}
                  </span>
                </div>

                {/* Error Message if any */}
                {orderError && (
                  <div className="alert alert-danger p-2 rounded-3 small mb-0 d-flex align-items-center gap-2" style={{ fontSize: '11.5px' }}>
                    <FiAlertCircle className="flex-shrink-0" />
                    <span>{orderError}</span>
                  </div>
                )}

                {/* 6. Action Buttons Row: Confirm Order (Dine-In) or Save Order & Proceed to Payment (Takeaway) */}
                <div className="d-flex align-items-center gap-2 pt-1">
                  <button
                    type="button"
                    disabled={!canSubmitOrder || submittingOrder}
                    onClick={() => handleSubmitOrder(false)}
                    className={`btn flex-fill fw-bold d-flex align-items-center justify-content-center gap-2 transition-all ${
                      orderType === 'DINE_IN' ? 'text-white shadow-sm' : 'shadow-xs'
                    }`}
                    style={{
                      height: '44px',
                      borderRadius: '12px',
                      fontSize: '13px',
                      backgroundColor: orderType === 'DINE_IN' ? '#F20D2D' : '#FFFFFF',
                      borderColor: '#F20D2D',
                      borderWidth: '1.5px',
                      borderStyle: 'solid',
                      color: orderType === 'DINE_IN' ? '#FFFFFF' : '#F20D2D',
                      boxShadow: orderType === 'DINE_IN' ? '0 4px 12px rgba(242, 13, 45, 0.25)' : 'none',
                      opacity: !canSubmitOrder ? 0.5 : 1
                    }}
                    title={!canSubmitOrder && orderType === 'DINE_IN' && !selectedTable ? "Please choose a table number to continue." : ""}
                  >
                    {submittingOrder ? (
                      <span>Placing...</span>
                    ) : (
                      <>
                        <FiSave size={16} />
                        <span>Confirm Order</span>
                      </>
                    )}
                  </button>

                  {orderType === 'TAKEAWAY' && (
                    <button
                      type="button"
                      disabled={!canSubmitOrder || submittingOrder}
                      onClick={() => {
                        if (!canSubmitOrder) return;
                        setOrderError('');
                        setShowPaymentModal(true);
                      }}
                      className="btn flex-fill fw-bold d-flex align-items-center justify-content-center gap-2 text-white shadow-sm transition-all"
                      style={{
                        height: '44px',
                        borderRadius: '12px',
                        fontSize: '13px',
                        backgroundColor: '#F20D2D',
                        borderColor: '#F20D2D',
                        borderWidth: '1.5px',
                        borderStyle: 'solid',
                        boxShadow: '0 4px 12px rgba(242, 13, 45, 0.25)',
                        opacity: !canSubmitOrder ? 0.5 : 1
                      }}
                    >
                      <FiCreditCard size={17} />
                      <span>Proceed to Payment</span>
                    </button>
                  )}
                </div>
              </div>

            </div>
          </div>

        </div>

        {/* Clear Order Confirmation Modal */}
        <ConfirmModal
          isOpen={showClearConfirm}
          title="Clear Entire Order Ticket?"
          message="Are you sure you want to remove all items from the current order ticket? This action cannot be undone."
          confirmText="Yes, Clear Order"
          cancelText="Cancel"
          type="danger"
          onClose={() => setShowClearConfirm(false)}
          onConfirm={executeClearOrder}
        />

        {/* Customization Modal */}
        {customizingItem && (
          <Modal
            isOpen={!!customizingItem}
            title={`Customize: ${customizingItem.dish.name}`}
            onClose={() => setCustomizingItem(null)}
          >
            <div className="p-3">
              <div className="d-flex align-items-center justify-content-between mb-3 pb-2 border-bottom">
                <span className="text-secondary small">Base Price</span>
                <span className="fw-bold text-dark fs-6">{formatCurrency(customizingItem.dish.sellingPrice || customizingItem.dish.price)}</span>
              </div>

              {/* Preparation Preset Notes */}
              <div className="mb-3">
                <label className="fw-bold text-dark small mb-1.5 d-block" style={{ fontSize: '12px' }}>
                  Select Preparation Note
                </label>
                <div className="d-flex flex-wrap gap-1.5">
                  {PREPARATION_PRESETS.map((preset, idx) => {
                    const isSelected = (customizingItem.specialInstructions || '').includes(preset);
                    return (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => {
                          const current = (customizingItem.specialInstructions || '').trim();
                          const updated = isSelected 
                            ? current.replace(preset, '').replace(/,\s*,/g, ',').trim()
                            : (current ? `${current}, ${preset}` : preset);
                          setCustomizingItem(prev => ({ ...prev, specialInstructions: updated }));
                        }}
                        className={`btn btn-xs rounded-pill px-2.5 py-1 ${
                          isSelected ? 'btn-danger text-white' : 'btn-outline-secondary border-light-subtle'
                        }`}
                        style={{ fontSize: '11px' }}
                      >
                        {preset}
                      </button>
                    );
                  })}
                </div>
                <input
                  type="text"
                  className="form-control form-control-sm rounded-pill mt-2 border-light-subtle"
                  placeholder="Or enter custom instructions..."
                  value={customizingItem.specialInstructions || ''}
                  onChange={(e) => setCustomizingItem(prev => ({ ...prev, specialInstructions: e.target.value }))}
                  style={{ fontSize: '12px' }}
                />
              </div>

              {/* Extra Ingredients & Toppings Options */}
              {Array.isArray(customizingItem.dish.customizations) && customizingItem.dish.customizations.length > 0 && (
                <div className="mb-3">
                  <label className="fw-bold text-dark small mb-1.5 d-block" style={{ fontSize: '12px' }}>
                    Add Extra Ingredients & Toppings
                  </label>
                  <div className="d-flex flex-column gap-2">
                    {customizingItem.dish.customizations.map((opt) => {
                      const optPrice = Number(opt.extra_price ?? opt.price ?? 0);
                      const isChecked = (customizingItem.selectedOptions || []).some(o => String(o.id) === String(opt.id));

                      return (
                        <label
                          key={opt.id}
                          className={`p-2.5 rounded-3 border d-flex align-items-center justify-content-between cursor-pointer ${
                            isChecked ? 'bg-danger-subtle border-danger' : 'bg-white border-light-subtle'
                          }`}
                          style={{ cursor: 'pointer' }}
                        >
                          <div className="d-flex align-items-center gap-2">
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={() => {
                                setCustomizingItem(prev => {
                                  const existing = prev.selectedOptions || [];
                                  const alreadySelected = existing.some(o => String(o.id) === String(opt.id));
                                  const updated = alreadySelected 
                                    ? existing.filter(o => String(o.id) !== String(opt.id))
                                    : [...existing, opt];
                                  return { ...prev, selectedOptions: updated };
                                });
                              }}
                              className="form-check-input mt-0"
                            />
                            <span className="small fw-semibold text-dark">{opt.name}</span>
                          </div>
                          <span className="fw-bold text-danger small">+{formatCurrency(optPrice)}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Footer Actions */}
              <div className="pt-3 border-top d-flex align-items-center justify-content-end gap-2">
                <button
                  type="button"
                  onClick={() => setCustomizingItem(null)}
                  className="btn btn-sm btn-outline-secondary rounded-pill px-3"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSaveCustomization}
                  className="btn btn-sm btn-danger text-white rounded-pill px-4 fw-bold"
                >
                  {customizingItem?.cartIndex >= 0 ? "Save Customization" : "Add to Cart"}
                </button>
              </div>
            </div>
          </Modal>
        )}

        {/* Table Selection Modal */}
        {showTablePicker && (() => {
          const availableCount = tables.filter(t => t.status === 'Available' && !t.is_occupied && t.is_active !== false).length;
          const occupiedCount = tables.filter(t => t.status === 'Occupied' || Boolean(t.is_occupied) || t.status === 'Reserved').length;
          const filteredTableList = tables.filter(t => {
            if (tableSearchQuery && tableSearchQuery.trim()) {
              const q = tableSearchQuery.trim().toLowerCase();
              const numStr = String(t.number || t.table_number || t.id).toLowerCase();
              const shortStr = getShortTableNumber(t.number || t.table_number || t.id).toLowerCase();
              if (!numStr.includes(q) && !shortStr.includes(q)) return false;
            }
            if (tableFilter === 'ALL') return true;
            if (tableFilter === 'AVAILABLE') return t.status === 'Available' && !t.is_occupied && t.is_active !== false;
            if (tableFilter === 'OCCUPIED') return t.status === 'Occupied' || Boolean(t.is_occupied) || t.status === 'Reserved';
            return true;
          });

          return (
            <Modal
              isOpen={showTablePicker}
              title="Select Table for Dine-In"
              size="lg"
              onClose={() => setShowTablePicker(false)}
            >
              <div className="p-3">
                {/* Scenario D: Loading State */}
                {tablesLoading && (
                  <div className="text-center py-5">
                    <div className="spinner-border text-danger spinner-border-sm mb-2" role="status">
                      <span className="visually-hidden">Loading tables...</span>
                    </div>
                    <div className="text-muted small">Loading tables for this branch...</div>
                  </div>
                )}

                {/* Scenario D: API Failure State with Retry */}
                {!tablesLoading && tablesError && (
                  <div className="text-center py-4 px-3">
                    <div className="text-danger mb-2">
                      <FiAlertCircle size={32} />
                    </div>
                    <h6 className="fw-bold text-dark mb-1">Failed to Load Tables</h6>
                    <p className="text-muted small mb-3">{tablesError}</p>
                    <div className="d-flex justify-content-center gap-2">
                      <button
                        type="button"
                        onClick={() => reloadTables()}
                        disabled={tablesLoading}
                        className="btn btn-sm btn-danger rounded-pill px-3 d-inline-flex align-items-center gap-1.5"
                      >
                        <FiRefreshCw size={13} className={tablesLoading ? 'spin' : ''} />
                        <span>Retry</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setShowTablePicker(false)}
                        className="btn btn-sm btn-outline-secondary rounded-pill px-3"
                      >
                        Close
                      </button>
                    </div>
                  </div>
                )}

                {/* Scenario A: No tables configured for selected branch */}
                {!tablesLoading && !tablesError && tables.length === 0 && (
                  <div className="text-center py-4 px-3">
                    <div className="p-3 bg-light rounded-circle d-inline-flex align-items-center justify-content-center text-muted mb-3" style={{ width: '56px', height: '56px' }}>
                      <FiLayers size={26} />
                    </div>
                    <h6 className="fw-bold text-dark mb-1">No Tables Configured</h6>
                    <p className="text-muted small mb-3" style={{ maxWidth: '300px', margin: '0 auto' }}>
                      No tables have been configured for this branch.
                    </p>
                    <div className="d-flex justify-content-center gap-2">
                      {isAdmin && (
                        <button
                          type="button"
                          onClick={() => {
                            setShowTablePicker(false);
                            navigate('/admin/tables');
                          }}
                          className="btn btn-sm btn-danger rounded-pill px-3"
                        >
                          Manage Tables
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => setShowTablePicker(false)}
                        className="btn btn-sm btn-outline-secondary rounded-pill px-3"
                      >
                        Close
                      </button>
                    </div>
                  </div>
                )}

                {/* Tables exist: Scenarios B & C */}
                {!tablesLoading && !tablesError && tables.length > 0 && (
                  <>
                    {/* Scenario B: Tables exist but none available */}
                    {availableCount === 0 && (
                      <div className="alert alert-warning py-2 px-3 small d-flex align-items-center gap-2 mb-3 rounded-3" role="alert">
                        <FiAlertCircle className="flex-shrink-0" size={16} />
                        <div>
                          <strong>No tables are currently available.</strong> All configured tables are occupied or reserved.
                        </div>
                      </div>
                    )}

                    {/* Search Tables Input */}
                    <div className="mb-3">
                      <input
                        type="text"
                        className="form-control form-control-sm rounded-pill px-3 border-light-subtle"
                        placeholder="Search table (e.g. 1, T1, 2)..."
                        value={tableSearchQuery}
                        onChange={(e) => setTableSearchQuery(e.target.value)}
                        style={{ fontSize: '12px', height: '36px' }}
                      />
                    </div>

                    {/* Table Filter Tabs */}
                    <div className="d-flex align-items-center gap-1.5 mb-3 bg-light p-1 rounded-pill">
                      {[
                        { key: 'ALL', label: `ALL (${tables.length})` },
                        { key: 'AVAILABLE', label: `AVAILABLE (${availableCount})` },
                        { key: 'OCCUPIED', label: `OCCUPIED (${occupiedCount})` }
                      ].map((tab) => (
                        <button
                          key={tab.key}
                          type="button"
                          onClick={() => setTableFilter(tab.key)}
                          className={`btn btn-xs flex-grow-1 rounded-pill fw-semibold ${
                            tableFilter === tab.key ? 'btn-white bg-white text-dark shadow-xs' : 'btn-link text-muted'
                          }`}
                          style={{ fontSize: '11px', textDecoration: 'none' }}
                        >
                          {tab.label}
                        </button>
                      ))}
                    </div>

                    {/* Filtered Empty State */}
                    {filteredTableList.length === 0 ? (
                      <div className="text-center py-4 text-muted small">
                        {tableFilter === 'AVAILABLE'
                          ? 'No tables are currently available.'
                          : 'No tables match the selected filter.'}
                      </div>
                    ) : (
                      /* Table Grid */
                      <div className="row row-cols-2 row-cols-sm-3 row-cols-md-4 row-cols-lg-5 g-2.5 overflow-auto" style={{ maxHeight: '420px' }}>
                        {filteredTableList.map((table) => {
                          const isSelected = selectedTable && String(selectedTable.id) === String(table.id);
                          const shortName = getShortTableNumber(table.number || table.table_number || table.id);
                          const isOccupied = table.status === 'Occupied' || Boolean(table.is_occupied) || table.status === 'Reserved' || table.is_active === false;
                          const activeOrderId = table.active_order_id || (table.active_order && table.active_order.id);
                          const statusText = isOccupied ? (table.status === 'Reserved' ? 'Reserved' : 'Occupied') : 'Available';

                          return (
                            <div key={table.id} className="col">
                              <div
                                onClick={() => {
                                  if (isOccupied) return;
                                  handleSelectTable(table);
                                }}
                                className={`p-3 border text-start transition-all d-flex flex-column justify-content-between ${
                                  isOccupied 
                                    ? 'opacity-85'
                                    : isSelected 
                                    ? 'shadow-xs cursor-pointer' 
                                    : 'hover-shadow cursor-pointer'
                                }`}
                                style={{ 
                                  cursor: isOccupied ? 'not-allowed' : 'pointer', 
                                  minHeight: '52px',
                                  borderRadius: '0px',
                                  backgroundColor: isOccupied ? '#FEF2F2' : '#F0FDF4',
                                  border: isOccupied ? '1.5px solid #FECACA' : isSelected ? '2px solid #16A34A' : '1.5px solid #BBF7D0'
                                }}
                                title={isOccupied ? `${shortName} is ${statusText} (Cannot be selected)` : `Select ${shortName}`}
                              >
                                <div>
                                  <div className="d-flex align-items-center justify-content-between">
                                    <span className="fw-bold fs-6 text-dark">
                                      {shortName}
                                    </span>
                                    <span
                                      className="rounded-circle d-inline-block flex-shrink-0"
                                      style={{
                                        width: '10px',
                                        height: '10px',
                                        backgroundColor: isOccupied ? '#DC2626' : '#16A34A'
                                      }}
                                      title={statusText}
                                    />
                                  </div>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}

                    <div className="mt-3 pt-3 border-top text-end">
                      <button
                        type="button"
                        onClick={() => setShowTablePicker(false)}
                        className="btn btn-sm btn-outline-secondary rounded-pill px-3"
                      >
                        Close
                      </button>
                    </div>
                  </>
                )}
              </div>
            </Modal>
          );
        })()}

        {/* Coupons Available Modal */}
        {showCouponModal && (
          <Modal
            isOpen={showCouponModal}
            title="Available Promo Coupons"
            onClose={() => setShowCouponModal(false)}
          >
            <div className="p-3">
              {coupons.length === 0 ? (
                <EmptyState
                  title="No Coupons Available"
                  description="There are currently no active offers configured."
                  icon="bi-tag"
                />
              ) : (
                <div className="d-flex flex-column gap-2 overflow-auto" style={{ maxHeight: '350px' }}>
                  {(() => {
                    // Check if higher-tier coupon (min >= 500) qualifies
                    const hasEligibleHigherTier = coupons.some(cp => 
                      Number(cp.minOrderValue || cp.minimum_order_amount || 0) >= 500 &&
                      billSummary.merchandise >= Number(cp.minOrderValue || cp.minimum_order_amount || 0) &&
                      (cp.status === 'Active' || cp.is_active !== false)
                    );

                    return coupons.map((c) => {
                      const minVal = Number(c.minOrderValue || c.minimum_order_amount || 0);
                      const meetsMin = billSummary.merchandise >= minVal;
                      const isLowerTierDisabled = hasEligibleHigherTier && minVal < 500;
                      const isEligible = meetsMin && !isLowerTierDisabled && (c.status === 'Active' || c.is_active !== false);
                      const isApplied = Boolean(
                        appliedCoupon && 
                        String(appliedCoupon.code || '').trim().toUpperCase() === String(c.code || '').trim().toUpperCase()
                      );

                      return (
                        <div 
                          key={c.code}
                          className={`p-3 rounded-3 border d-flex align-items-center justify-content-between gap-3 ${
                            isApplied
                              ? 'bg-white border-success shadow-xs'
                              : isEligible 
                                ? 'bg-white border-light-subtle' 
                                : 'bg-light border-light-subtle opacity-75'
                          }`}
                        >
                          <div>
                            <div className="d-flex align-items-center gap-2">
                              <span className="badge bg-danger rounded-pill px-2.5 py-1 fw-bold">
                                {c.code}
                              </span>
                              <span className="fw-bold text-dark small">
                                {c.type === 'percentage' || c.discount_type === 'PERCENTAGE' 
                                  ? `${c.discount || c.discount_value}% OFF`
                                  : `Flat ₹${c.discount || c.discount_value} OFF`}
                              </span>
                            </div>
                            <p className="text-secondary small mb-0 mt-1" style={{ fontSize: '11px' }}>
                              {isLowerTierDisabled 
                                ? 'Disabled: A higher-value coupon is eligible for this order.'
                                : (c.description || `Applicable on orders above ${formatCurrency(minVal)}`)}
                            </p>
                          </div>

                          {isApplied ? (
                            <span 
                              className="badge bg-success-subtle text-success border border-success-subtle px-2.5 py-1.5 fw-bold flex-shrink-0" 
                              style={{ fontSize: '11.5px' }}
                            >
                              Applied
                            </span>
                          ) : (
                            <button
                              type="button"
                              disabled={!isEligible || isApplied}
                              onClick={() => handleApplyCoupon(c.code)}
                              className="btn btn-sm btn-outline-danger rounded-pill px-3 py-1 fw-bold flex-shrink-0"
                              style={{ fontSize: '11.5px' }}
                            >
                              Apply
                            </button>
                          )}
                        </div>
                      );
                    });
                  })()}
                </div>
              )}

              <div className="mt-3 pt-3 border-top text-end">
                <button
                  type="button"
                  onClick={() => setShowCouponModal(false)}
                  className="btn btn-sm btn-outline-secondary rounded-pill px-3"
                >
                  Close
                </button>
              </div>
            </div>
          </Modal>
        )}

                {/* Universal Two-Section Payment Modal */}
        {showPaymentModal && (
          <PaymentModal
            isOpen={showPaymentModal}
            onClose={() => setShowPaymentModal(false)}
            orderDetails={{
              customerName: customerName.trim() || parentOrder?.customer_name || selectedTable?.active_order?.customer_name || 'Guest Customer',
              customerPhone: customerPhone.trim() || parentOrder?.customer_phone || selectedTable?.active_order?.customer_phone || '',
              branchName: branches.find(b => String(b.id) === String(selectedBranchId))?.name || 'Main Branch',
              tableLabel: selectedTable?.number || selectedTable?.table_number || '',
              orderType: orderType,
              items: cartItems.map(item => ({
                dish: item.dish,
                quantity: item.quantity,
                options: item.options,
                specialInstructions: item.specialInstructions,
                line_total: ((Number(item.dish?.price || 0) + (item.options || []).reduce((s, o) => s + Number(o?.price || 0), 0)) * item.quantity),
              })),
              pricing: {
                items_subtotal: billSummary.itemsSubtotal,
                customization_total: billSummary.addOnsTotal,
                dish_discount_total: billSummary.dishDiscountsTotal,
                coupon_discount_total: billSummary.couponDiscount,
                takeaway_charge: billSummary.packingCharge,
                gst_rate: 5,
                gst_amount: billSummary.gstAmount,
                total_amount: billSummary.grandTotal,
              },
              couponCode: appliedCoupon?.code || '',
              couponDiscount: billSummary.couponDiscount || 0,
            }}
            onConfirmPayment={(method, paymentResult) => {
              handleSubmitOrder(true, method, paymentResult);
            }}
            loading={submittingOrder}
            error={orderError}
            isStaff={true}
          />
        )}

        {/* Order Placed Success Modal */}
        {placedOrder && (
          <Modal
            isOpen={!!placedOrder}
            title="Order Placed Successfully!"
            onClose={() => setPlacedOrder(null)}
          >
            <div className="p-3 text-center">
              <div className="bg-success-subtle text-success rounded-circle p-3 d-inline-flex align-items-center justify-content-center mb-3">
                <FiCheck size={36} />
              </div>
              <h5 className="fw-bold text-dark mb-1">
                Order #{placedOrder.order_number || placedOrder.orderNumber || placedOrder.id}
              </h5>
              <p className="text-muted small mb-3">
                {placedOrder.order_type === 'TAKEAWAY' || placedOrder.orderType === 'Takeaway'
                  ? 'Takeaway Order ticket dispatched to kitchen'
                  : (() => {
                      const rawT = placedOrder.table_label || placedOrder.table_number || placedOrder.table;
                      const num = tableService.getCanonicalTableNumber(rawT);
                      const short = num ? (num.replace(/^T0*/i, 'T') || num) : '';
                      return `Table ${short || num} ticket dispatched to kitchen`;
                    })()}
              </p>

              <div className="p-3 rounded-3 bg-light text-start mb-4">
                <div className="d-flex justify-content-between mb-1 small">
                  <span className="text-muted">Payment Status:</span>
                  <strong className={placedOrder.is_paid || String(placedOrder.payment_status).toUpperCase() === 'PAID' ? 'text-success' : 'text-danger'}>
                    {placedOrder.is_paid || String(placedOrder.payment_status).toUpperCase() === 'PAID' ? 'PAID (Cash)' : 'UNPAID'}
                  </strong>
                </div>
                {placedOrder.coupon_code && (
                  <div className="d-flex justify-content-between mb-1 small text-success">
                    <span>Applied Coupon:</span>
                    <strong>{placedOrder.coupon_code} {placedOrder.coupon_discount ? `(-${formatCurrency(placedOrder.coupon_discount)})` : ''}</strong>
                  </div>
                )}
                {placedOrder.item_discount && Number(placedOrder.item_discount) > 0 && (
                  <div className="d-flex justify-content-between mb-1 small text-success">
                    <span>Item Discount:</span>
                    <strong>-{formatCurrency(placedOrder.item_discount)}</strong>
                  </div>
                )}
                <div className="d-flex justify-content-between mb-1 small">
                  <span className="text-muted">Total Amount:</span>
                  <strong className="text-dark fs-6">{formatCurrency(placedOrder.total_amount || placedOrder.total)}</strong>
                </div>
                <div className="d-flex justify-content-between small">
                  <span className="text-muted">Kitchen Status:</span>
                  <strong className="text-warning-emphasis">PENDING (New Ticket)</strong>
                </div>
              </div>

              <div className="d-flex align-items-center justify-content-center gap-2">
                <button
                  type="button"
                  onClick={async () => {
                    const ord = placedOrder;
                    setPlacedOrder(null);
                    const rootId = ord?.parent_order_id || ord?.parent_order || ord?.parentOrderId || parentOrder?.id;
                    if (rootId) {
                      try {
                        const { fetchBillPreview } = await import('../../services/adminApi');
                        const preview = await fetchBillPreview(rootId);
                        if (preview) {
                          setViewingEBill(preview);
                          return;
                        }
                      } catch (e) {}
                    }
                    setViewingEBill(ord);
                  }}
                  className="btn btn-sm btn-outline-dark rounded-pill px-3 py-1.5 fw-bold d-flex align-items-center gap-1"
                >
                  <FiPrinter size={14} />
                  <span>View / Print E-Bill</span>
                </button>
                <button
                  type="button"
                  onClick={() => setPlacedOrder(null)}
                  className="btn btn-sm btn-danger text-white rounded-pill px-4 py-1.5 fw-bold"
                  style={{ backgroundColor: 'var(--primary-color, #dc3545)', borderColor: 'var(--primary-color, #dc3545)' }}
                >
                  Start New Order
                </button>
              </div>
            </div>
          </Modal>
        )}

        {/* Tracked Order Details Modal */}
        {showTrackedOrderModal && trackedOrder && (
          <TrackOrderModal
            isOpen={showTrackedOrderModal}
            order={trackedOrder}
            table={selectedTable || tables.find(t => String(t.id) === String(trackedOrder.tableId || trackedOrder.table_id))}
            onClose={() => setShowTrackedOrderModal(false)}
            onContinueOrder={handleContinueOrderFromModal}
            onProceedToBill={handleProceedToBillFromModal}
            loading={loading}
          />
        )}

        {/* E-Bill Receipt Modal */}
        <EBillModal
          isOpen={!!viewingEBill}
          order={viewingEBill}
          onClose={() => setViewingEBill(null)}
          onProceedToBill={async (ord) => {
            const targetOrder = ord || viewingEBill;
            if (!targetOrder) return;
            const targetId = targetOrder.backendOrderId || targetOrder.id || targetOrder.order_id;
            if (!targetId) return;
            try {
              const { proceedToBill } = await import('../../services/adminApi');
              await proceedToBill(targetId);
              window.dispatchEvent(new CustomEvent('foodie_orders_updated', { detail: { orderId: targetId, status: 'Completed' } }));
              window.dispatchEvent(new CustomEvent('foodie_tables_updated', { detail: { orderId: targetId } }));
              setViewingEBill(prev => prev ? { ...prev, status: 'Completed', backendStatus: 'COMPLETED' } : null);
              window.alert(`Order #${targetOrder.orderNumber || targetOrder.display_order_number || targetId} marked as Completed.`);
            } catch (err) {
              console.error('Failed to complete order on Proceed to Bill:', err);
              const msg = err?.response?.data?.detail || err?.message || 'Could not complete order.';
              window.alert(msg);
              throw err;
            }
          }}
        />

        {/* Floating Mobile Cart Bar (when dishes tab is active and cart has items) */}
        {isMobile && mobilePosTab === 'menu' && cartItems.length > 0 && (
          <div 
            className="d-lg-none position-fixed bottom-0 start-0 end-0 p-2.5 bg-white border-top shadow-lg"
            style={{ zIndex: 1020 }}
          >
            <button
              type="button"
              onClick={() => setMobilePosTab('order')}
              className="btn btn-danger w-100 py-2.5 rounded-pill fw-bold d-flex align-items-center justify-content-between px-3.5 shadow-sm"
              style={{ fontSize: '13px' }}
            >
              <span>🛒 {cartItems.reduce((acc, i) => acc + (i.quantity || 1), 0)} items • {formatCurrency(billSummary.grandTotal)}</span>
              <span className="d-flex align-items-center gap-1">View Order Ticket →</span>
            </button>
          </div>
        )}

        {/* Toast Notification for Stock Availability */}
        <Toast
          show={toast.show}
          message={toast.message}
          type={toast.type}
          onClose={() => setToast((prev) => ({ ...prev, show: false }))}
        />
      </div>
    </AdminLayout>
  );
};

export default Pos;
