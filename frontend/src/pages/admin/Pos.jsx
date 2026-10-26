import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import AdminLayout from '../../components/layout/AdminLayout';
import Loader from '../../components/common/Loader';
import EmptyState from '../../components/common/EmptyState';
import Modal from '../../components/common/Modal';
import Badge from '../../components/common/Badge';
import formatCurrency from '../../utils/formatCurrency';
import { useAuth } from '../../hooks/useAuth';
import { tableService } from '../../services/tableService';
import { productService } from '../../services/productService';
import { menuService } from '../../services/menuService';
import { couponService } from '../../services/couponService';
import { branchService } from '../../services/branchService';
import { currentBranchId, createAssistedOrder, getPricingQuote } from '../../services/adminApi';
import { normalizeFoodType } from '../../utils/filters';
import EBillModal from '../../components/orders/EBillModal';
import { 
  FiSearch, FiX, FiPlus, FiMinus, FiTrash2, FiShoppingBag, 
  FiLayers, FiTag, FiCheck, FiDollarSign, FiClock, FiPercent,
  FiPrinter, FiUser, FiPhone, FiAlertCircle, FiRefreshCw
} from 'react-icons/fi';

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
  const [selectedCategory, setSelectedCategory] = useState('ALL');
  const [foodTypeFilter, setFoodTypeFilter] = useState({
    veg: false,
    'non-veg': false,
    vegan: false,
  });

  // POS Order State
  const initialType = (searchParams.get('type') || '').toLowerCase() === 'takeaway' ? 'TAKEAWAY' : 'DINE_IN';
  const [orderType, setOrderType] = useState(initialType);
  const [selectedTable, setSelectedTable] = useState(null);
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [cartItems, setCartItems] = useState([]);
  const [appliedCoupon, setAppliedCoupon] = useState(null);
  const [couponCodeInput, setCouponCodeInput] = useState('');
  const [couponError, setCouponError] = useState('');

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
  const [customizingItem, setCustomizingItem] = useState(null); // { dish, cartIndex, selectedOptions: [], specialInstructions: '' }
  const [showTablePicker, setShowTablePicker] = useState(false);
  const [tableFilter, setTableFilter] = useState('ALL');
  const [showCouponModal, setShowCouponModal] = useState(false);
  const [submittingOrder, setSubmittingOrder] = useState(false);
  const [orderError, setOrderError] = useState('');
  const [placedOrder, setPlacedOrder] = useState(null);
  const [viewingEBill, setViewingEBill] = useState(null);
  const [mobilePosTab, setMobilePosTab] = useState('menu'); // 'menu' | 'order'

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
        productService.getProducts(true).catch(() => []),
        menuService.getMenus().catch(() => []),
        couponService.getCoupons().catch(() => [])
      ]);

      const filteredTables = Array.isArray(tableList) 
        ? tableList.filter(t => !t.branch || Number(t.branch) === Number(branchId))
        : [];
      setTables(filteredTables);
      setDishes(Array.isArray(dishList) ? dishList : []);

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
    if (table.status === 'Occupied' || table.is_occupied) {
      window.alert('Table is occupied.');
      return;
    }
    setSelectedTable(table);
    setOrderType('DINE_IN');
    setShowTablePicker(false);
    setOrderError('');
    setSearchParams({ table: table.id }, { replace: true });
  };

  // Food Type Toggle
  const toggleFoodType = (type) => {
    setFoodTypeFilter(prev => ({ ...prev, [type]: !prev[type] }));
  };

  // Filtered Dishes
  const filteredDishes = useMemo(() => {
    return dishes.filter(dish => {
      // Search filter
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase().trim();
        const matchesName = String(dish.name || '').toLowerCase().includes(query);
        const matchesDesc = String(dish.description || '').toLowerCase().includes(query);
        if (!matchesName && !matchesDesc) return false;
      }

      // Category filter
      if (selectedCategory !== 'ALL') {
        if (dish.category !== selectedCategory) return false;
      }

      // Food type filter
      const activeTypes = Object.entries(foodTypeFilter).filter(([_, active]) => active).map(([t]) => t);
      if (activeTypes.length > 0) {
        const dishType = normalizeFoodType(dish.foodType || dish.type);
        if (!activeTypes.includes(dishType)) return false;
      }

      return true;
    });
  }, [dishes, searchQuery, selectedCategory, foodTypeFilter]);

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
    if (dish.status === 'Out of Stock' || Number(dish.stock) <= 0) {
      return;
    }

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

    const idx = findCartIndex(dish.id);
    if (idx >= 0) {
      const updated = [...cartItems];
      updated[idx].quantity += 1;
      setCartItems(updated);
    } else {
      setCartItems(prev => [...prev, {
        dish,
        quantity: 1,
        options: [],
        specialInstructions: '',
      }]);
    }
  };

  const handleUpdateQuantity = (index, delta) => {
    setCartItems(prev => {
      const updated = [...prev];
      const newQty = updated[index].quantity + delta;
      if (newQty <= 0) {
        updated.splice(index, 1);
      } else {
        updated[index].quantity = newQty;
      }
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
      setCartItems(prev => [...prev, {
        dish,
        quantity: 1,
        options: selectedOptions,
        specialInstructions,
      }]);
    }
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
      const basePrice = Number(item.dish.price || item.dish.sellingPrice || 0);
      itemsSubtotal += basePrice * qty;

      // Add-ons extra
      const optionsExtra = (item.options || []).reduce((acc, opt) => {
        return acc + Number(opt.extra_price ?? opt.price ?? 0);
      }, 0);
      addOnsTotal += optionsExtra * qty;

      // Menu dish discount
      if (item.dish.hasDiscount && item.dish.discountPrice && item.dish.price > item.dish.discountPrice) {
        dishDiscountsTotal += (item.dish.price - item.dish.discountPrice) * qty;
      }
    });

    const merchandise = itemsSubtotal + addOnsTotal - dishDiscountsTotal;

    // Coupon discount calculation
    let couponDiscount = 0;
    if (appliedCoupon && merchandise >= (appliedCoupon.minOrderValue || appliedCoupon.minimum_order_amount || 0)) {
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

  // Apply Coupon
  const handleApplyCoupon = (code) => {
    setCouponError('');
    if (!code || !code.trim()) {
      setCouponError('Please enter a coupon code.');
      return;
    }
    const cleanCode = code.trim().toUpperCase();
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
    setAppliedCoupon(found);
    setCouponCodeInput('');
    setShowCouponModal(false);
  };

  const handleRemoveCoupon = () => {
    setAppliedCoupon(null);
    setCouponError('');
  };

  // Submit Order Action
  const handleSubmitOrder = async (isPaid = false) => {
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

    const cleanPhone = customerPhone.trim();
    if (!cleanPhone) {
      setOrderError('Customer mobile number is required.');
      return;
    }
    const cleanDigits = cleanPhone.replace(/\D/g, '');
    if (cleanDigits.length < 10) {
      setOrderError('Please enter a valid 10-digit customer mobile number.');
      return;
    }

    setSubmittingOrder(true);
    const idempotencyKey = `pos-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

    const itemsPayload = cartItems.map(item => ({
      food: Number(item.dish.id),
      quantity: Number(item.quantity),
      options: (item.options || []).map(o => Number(o.id || o)),
      special_instructions: item.specialInstructions || '',
    }));

    const payload = {
      order_type: orderType,
      table: orderType === 'DINE_IN' ? Number(selectedTable?.id) : null,
      branch: Number(selectedBranchId),
      items: itemsPayload,
      idempotency_key: idempotencyKey,
      coupon_code: appliedCoupon ? appliedCoupon.code : '',
      customer_phone: customerPhone.trim(),
      customer_name: customerName.trim(),
      payment_method: 'CASH',
      mark_paid: isPaid,
      service_tax_enabled: serviceTaxEnabled,
    };

    try {
      const order = await createAssistedOrder(payload);
      setPlacedOrder({
        ...order,
        is_paid: isPaid,
      });

      // Clear current cart & inputs
      setCartItems([]);
      setAppliedCoupon(null);
      setCustomerPhone('');
      setCustomerName('');
      if (orderType === 'DINE_IN') {
        setSelectedTable(null);
        setSearchParams({}, { replace: true });
      }

      // Live sync trigger
      window.dispatchEvent(new CustomEvent('foodie_orders_updated', { detail: { orderId: order.id } }));
      window.dispatchEvent(new CustomEvent('foodie_tables_updated', { detail: { orderId: order.id } }));
      window.dispatchEvent(new CustomEvent('foodie_inventory_updated', { detail: { orderId: order.id } }));
    } catch (err) {
      setOrderError(err.message || 'Failed to place order. Please try again.');
    } finally {
      setSubmittingOrder(false);
    }
  };

  const handleResetOrder = () => {
    if (cartItems.length > 0 && !window.confirm('Are you sure you want to clear this order?')) {
      return;
    }
    setCartItems([]);
    setAppliedCoupon(null);
    setOrderError('');
    setCouponError('');
  };

  const canSubmitOrder = !submittingOrder && cartItems.length > 0 && (orderType === 'TAKEAWAY' || Boolean(selectedTable));

  return (
    <AdminLayout fullHeight={true} contentClassName="p-0 d-flex flex-column flex-grow-1 overflow-hidden">
      <div className="pos-container d-flex flex-column w-100 h-100 overflow-hidden" style={{ backgroundColor: '#f8f9fa' }}>
        
        {/* Top POS Header Toolbar */}
        <header className="pos-topbar bg-white border-bottom px-4 py-3 d-flex align-items-center justify-content-between flex-wrap gap-3 flex-shrink-0">
          <div className="d-flex align-items-center gap-3">
            <h5 className="fw-bold text-dark mb-0 d-flex align-items-center gap-2">
              <span className="badge bg-danger rounded-circle p-1.5" style={{ fontSize: '13px' }}>🍔</span>
              <span>POS / Take Order</span>
            </h5>
            
            {/* Branch Selector (if multiple branches exist) */}
            {branches.length > 1 && isAdmin && (
              <div className="d-flex align-items-center gap-2 ps-3 border-start">
                <span className="small text-muted fw-semibold">Branch:</span>
                <select 
                  className="form-select form-select-sm rounded-pill fw-semibold border-light-subtle shadow-xs"
                  style={{ width: 'auto', minWidth: '150px', paddingTop: '4px', paddingBottom: '4px', paddingLeft: '12px' }}
                  value={selectedBranchId || ''}
                  onChange={(e) => setSelectedBranchId(Number(e.target.value))}
                >
                  {branches.map(b => (
                    <option key={b.id} value={b.id}>
                      {b.name} {b.city ? `(${b.city})` : ''}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {/* Search Input */}
          <div className="d-flex align-items-center gap-2 flex-grow-1" style={{ maxWidth: '440px' }}>
            <div className="position-relative w-100">
              <FiSearch className="position-absolute text-muted" style={{ left: '16px', top: '12px' }} />
              <input
                type="text"
                className="form-control rounded-pill ps-5 pe-4 py-2 border-light-subtle shadow-xs"
                style={{ height: '38px', fontSize: '13px' }}
                placeholder="Search dishes by name (e.g. pizza, pasta)..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
              {searchQuery && (
                <button
                  type="button"
                  className="btn btn-link position-absolute p-0 text-muted border-0"
                  style={{ right: '14px', top: '9px' }}
                  onClick={() => setSearchQuery('')}
                >
                  <FiX size={16} />
                </button>
              )}
            </div>
          </div>
        </header>

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

        {/* Main POS Content Area with Independent Scroll Columns */}
        <div className="pos-layout-wrapper">
          
          {/* CENTER: Menu & Catalog Grid (Independent Scroll Area) */}
          <main className={`pos-menu-panel border-end ${mobilePosTab !== 'menu' ? 'd-none d-lg-flex' : ''}`}>
            
            {/* Category Pills & Food-Type Filters Toolbar (Fixed top) */}
            <div className="pos-menu-toolbar">
              
              {/* Category Bar */}
              <div className="d-flex align-items-center gap-2 overflow-auto py-1 scrollbar-hidden">
                {categories.map((cat, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => setSelectedCategory(cat)}
                    className={`btn btn-sm rounded-pill text-nowrap px-3 py-1.5 fw-semibold transition-all ${
                      selectedCategory === cat
                        ? 'btn-danger shadow-xs'
                        : 'btn-outline-secondary border-light-subtle bg-white text-dark'
                    }`}
                    style={{ fontSize: '12.5px' }}
                  >
                    {cat === 'ALL' ? '🍽️ All Dishes' : cat}
                  </button>
                ))}
              </div>

              {/* Food Type Checkbox Filter Bar */}
              <div className="d-flex align-items-center justify-content-between flex-wrap gap-2">
                <div className="d-flex align-items-center gap-2">
                  <span className="small text-muted fw-bold text-uppercase" style={{ fontSize: '11px', letterSpacing: '0.5px' }}>
                    Food Type:
                  </span>
                  
                  {/* Veg Checkbox */}
                  <label 
                    onClick={() => toggleFoodType('veg')}
                    className={`btn btn-sm rounded-pill px-2.5 py-1 d-flex align-items-center gap-1.5 cursor-pointer user-select-none border ${
                      foodTypeFilter.veg 
                        ? 'bg-success-subtle border-success text-success fw-bold' 
                        : 'bg-white border-light-subtle text-secondary'
                    }`}
                    style={{ cursor: 'pointer', fontSize: '11.5px' }}
                  >
                    <span className="veg-badge" style={{ transform: 'scale(0.8)' }}></span>
                    <span>Veg</span>
                  </label>

                  {/* Non-Veg Checkbox */}
                  <label 
                    onClick={() => toggleFoodType('non-veg')}
                    className={`btn btn-sm rounded-pill px-2.5 py-1 d-flex align-items-center gap-1.5 cursor-pointer user-select-none border ${
                      foodTypeFilter['non-veg'] 
                        ? 'bg-danger-subtle border-danger text-danger fw-bold' 
                        : 'bg-white border-light-subtle text-secondary'
                    }`}
                    style={{ cursor: 'pointer', fontSize: '11.5px' }}
                  >
                    <span className="non-veg-badge" style={{ transform: 'scale(0.8)' }}></span>
                    <span>Non-Veg</span>
                  </label>

                  {/* Vegan Checkbox */}
                  <label 
                    onClick={() => toggleFoodType('vegan')}
                    className={`btn btn-sm rounded-pill px-2.5 py-1 d-flex align-items-center gap-1.5 cursor-pointer user-select-none border ${
                      foodTypeFilter.vegan 
                        ? 'bg-success-subtle border-success-emphasis text-success-emphasis fw-bold' 
                        : 'bg-white border-light-subtle text-secondary'
                    }`}
                    style={{ cursor: 'pointer', fontSize: '11.5px' }}
                  >
                    <span className="vegan-badge" style={{ transform: 'scale(0.8)' }}></span>
                    <span>Vegan</span>
                  </label>
                </div>

                <div className="small text-muted">
                  Showing <strong>{filteredDishes.length}</strong> items
                </div>
              </div>
            </div>

            {/* Dish Cards Grid (Independently scrollable) */}
            <div className="pos-menu-content">
              {loading ? (
                <div className="min-vh-50 d-flex align-items-center justify-content-center py-5">
                  <Loader />
                </div>
              ) : filteredDishes.length === 0 ? (
                <EmptyState
                  title="No Dishes Found"
                  description="Try adjusting your category, food type, or search term."
                  icon="bi-search"
                />
              ) : (
                <div className="pos-dish-grid">
                  {filteredDishes.map((dish) => {
                    const isOutOfStock = dish.status === 'Out of Stock' || Number(dish.stock) <= 0;
                    const ft = normalizeFoodType(dish.foodType || dish.type);
                    const cartItem = cartItems.find(i => String(i.dish.id) === String(dish.id));
                    const cartQty = cartItem ? cartItem.quantity : 0;
                    const hasToppings = Array.isArray(dish.customizations) && dish.customizations.length > 0;

                    return (
                      <div 
                        key={dish.id} 
                        className={`pos-dish-card ${isOutOfStock ? 'opacity-50' : ''}`}
                      >
                        {/* Dish Image */}
                        <div className="position-relative" style={{ height: '140px', backgroundColor: '#f1f3f5' }}>
                          {dish.image ? (
                            <img
                              src={dish.image}
                              alt={dish.name}
                              className="w-100 h-100 object-fit-cover"
                              onError={(e) => { e.target.style.display = 'none'; }}
                            />
                          ) : (
                            <div className="w-100 h-100 d-flex align-items-center justify-content-center text-secondary">
                              <span className="fs-1">🍲</span>
                            </div>
                          )}

                          {/* Food Type Icon Badge (Top-Right) */}
                          <div className="position-absolute top-0 end-0 m-2 bg-white bg-opacity-90 rounded-circle p-1 shadow-xs d-flex align-items-center justify-content-center">
                            <span 
                              className={ft === 'veg' ? 'veg-badge' : ft === 'vegan' ? 'vegan-badge' : 'non-veg-badge'}
                              style={{ transform: 'scale(0.8)' }}
                            ></span>
                          </div>

                          {/* Discount Badge (Top-Left) */}
                          {dish.hasDiscount && dish.discountPercent > 0 && (
                            <div className="position-absolute top-0 start-0 m-2">
                              <span className="badge bg-danger rounded-pill px-2 py-1 shadow-xs fw-bold" style={{ fontSize: '10.5px' }}>
                                {dish.discountPercent}% OFF
                              </span>
                            </div>
                          )}

                          {/* Stock Badge (Bottom-Left) */}
                          <div className="position-absolute bottom-0 start-0 m-2">
                            {isOutOfStock ? (
                              <span className="badge bg-dark text-white rounded-pill px-2 py-0.5" style={{ fontSize: '10px' }}>
                                Out of Stock
                              </span>
                            ) : Number(dish.stock) <= 5 ? (
                              <span className="badge bg-warning text-dark rounded-pill px-2 py-0.5 shadow-xs" style={{ fontSize: '10px' }}>
                                Low: {dish.stock} left
                              </span>
                            ) : null}
                          </div>
                        </div>

                        {/* Dish Card Body */}
                        <div className="pos-dish-card-body">
                          <h6 className="fw-bold text-dark mb-1 text-truncate" title={dish.name} style={{ fontSize: '14px' }}>
                            {dish.name}
                          </h6>
                          <p className="text-muted small mb-2" style={{ fontSize: '11.5px', height: '32px', overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', lineHeight: '1.4' }}>
                            {dish.description || 'Delicious culinary preparation freshly made to order.'}
                          </p>

                          {/* Toppings / Instructions Link (Consistent 28px slot across all cards) */}
                          <div className="d-flex align-items-center" style={{ height: '28px', marginBottom: '8px' }}>
                            {hasToppings && (
                              <button
                                type="button"
                                onClick={() => handleOpenCustomize(dish)}
                                className="btn btn-xs btn-outline-secondary rounded-pill px-2.5 py-1 d-inline-flex align-items-center justify-content-center gap-1 w-100"
                                style={{ fontSize: '11px', height: '26px' }}
                              >
                                <span>Instructions</span>
                              </button>
                            )}
                          </div>

                          <div className="mt-auto pt-2 border-top border-light-subtle d-flex align-items-center justify-content-between">
                            {/* Price */}
                            <div>
                              {dish.hasDiscount && dish.price > dish.sellingPrice && (
                                <span className="text-muted text-decoration-line-through me-1 small" style={{ fontSize: '11.5px' }}>
                                  {formatCurrency(dish.price)}
                                </span>
                              )}
                              <span className="fw-bold text-dark fs-6">
                                {formatCurrency(dish.sellingPrice || dish.price)}
                              </span>
                            </div>

                            {/* Action: Add or Stepper */}
                            <div>
                              {isOutOfStock ? (
                                <button disabled className="btn btn-sm btn-secondary opacity-50 rounded-pill px-3 py-1" style={{ fontSize: '11.5px', height: '32px' }}>
                                  Unavailable
                                </button>
                              ) : cartQty > 0 ? (
                                <div className="d-flex align-items-center gap-1 bg-light border rounded-pill px-2 shadow-xs" style={{ height: '32px' }}>
                                  <button
                                    type="button"
                                    className="btn btn-xs btn-link text-danger p-0 border-0"
                                    onClick={() => {
                                      const idx = cartItems.findIndex(i => String(i.dish.id) === String(dish.id));
                                      if (idx >= 0) handleUpdateQuantity(idx, -1);
                                    }}
                                  >
                                    <FiMinus size={13} />
                                  </button>
                                  <span className="px-2 fw-bold text-dark small" style={{ fontSize: '12px' }}>
                                    {cartQty}
                                  </span>
                                  <button
                                    type="button"
                                    className="btn btn-xs btn-link text-danger p-0 border-0"
                                    onClick={() => handleAddDish(dish)}
                                  >
                                    <FiPlus size={13} />
                                  </button>
                                </div>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => handleAddDish(dish)}
                                  className="btn btn-sm btn-danger text-white rounded-pill px-3 py-1 fw-bold shadow-xs d-flex align-items-center gap-1"
                                  style={{ backgroundColor: 'var(--primary-color, #dc3545)', borderColor: 'var(--primary-color, #dc3545)', fontSize: '12px', height: '32px' }}
                                >
                                  <FiPlus size={14} />
                                  <span>Add</span>
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Mobile Bottom Floating Checkout Bar (Visible on < 992px when viewing menu) */}
            {mobilePosTab === 'menu' && cartItems.length > 0 && (
              <div className="d-lg-none p-3 bg-white border-top shadow-lg position-sticky bottom-0 z-3">
                <button
                  type="button"
                  onClick={() => setMobilePosTab('order')}
                  className="btn btn-danger w-100 rounded-pill py-2.5 fw-bold d-flex align-items-center justify-content-between px-4 shadow-sm"
                  style={{ fontSize: '13px' }}
                >
                  <span>🛒 {cartItems.length} item{cartItems.length === 1 ? '' : 's'} in Ticket</span>
                  <span>{formatCurrency(billSummary.grandTotal)} • View Ticket →</span>
                </button>
              </div>
            )}
          </main>

          {/* RIGHT: Order Panel & Checkout Actions (Independent Scroll Area) */}
          <aside className={`pos-order-panel ${mobilePosTab !== 'order' ? 'd-none d-lg-flex' : ''}`}>
            
            {/* 1. Dining Mode Toggle (Dine-In vs Takeaway) */}
            <div className="pos-order-section p-2 bg-light">
              <div className="d-flex align-items-center gap-1">
                <button
                  type="button"
                  onClick={() => handleToggleOrderType('DINE_IN')}
                  className={`btn btn-sm flex-grow-1 rounded-pill fw-bold d-flex align-items-center justify-content-center gap-1.5 transition-all ${
                    orderType === 'DINE_IN'
                      ? 'btn-danger text-white shadow-xs'
                      : 'btn-white text-muted border-0 bg-white'
                  }`}
                  style={{ fontSize: '12px', height: '34px' }}
                >
                  <FiLayers size={13} />
                  <span>Table Dine-In</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleToggleOrderType('TAKEAWAY')}
                  className={`btn btn-sm flex-grow-1 rounded-pill fw-bold d-flex align-items-center justify-content-center gap-1.5 transition-all ${
                    orderType === 'TAKEAWAY'
                      ? 'btn-danger text-white shadow-xs'
                      : 'btn-white text-muted border-0 bg-white'
                  }`}
                  style={{ fontSize: '12px', height: '34px' }}
                >
                  <FiShoppingBag size={13} />
                  <span>Takeaway</span>
                </button>
              </div>
            </div>

            {/* 2. Table / Takeaway Identification Card */}
            <div className="pos-order-section">
              {orderType === 'DINE_IN' ? (
                <div className="d-flex align-items-center justify-content-between">
                  <div>
                    <span className="small text-muted fw-bold text-uppercase" style={{ fontSize: '10.5px', letterSpacing: '0.5px' }}>Dine-In Table</span>
                    <div className="d-flex align-items-center gap-2 mt-0.5">
                      {selectedTable ? (
                        <span className="fw-bold text-dark fs-6">
                          Table {tableService.getCanonicalTableNumber(selectedTable.number || selectedTable.table_number || selectedTable.id)}
                        </span>
                      ) : (
                        <span className="text-danger fw-semibold small">No Table Selected</span>
                      )}
                      {selectedTable && (
                        <span
                          className="rounded-circle d-inline-block flex-shrink-0"
                          style={{
                            width: '8px',
                            height: '8px',
                            backgroundColor: selectedTable.status === 'Occupied' ? '#ef4444' : selectedTable.status === 'Reserved' ? '#f59e0b' : '#22c55e'
                          }}
                          title={selectedTable.status}
                        />
                      )}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setShowTablePicker(true);
                      reloadTables();
                    }}
                    className="btn btn-sm btn-outline-dark rounded-pill px-3 fw-bold"
                    style={{ fontSize: '11.5px', height: '30px' }}
                  >
                    {selectedTable ? 'Change' : 'Choose Table'}
                  </button>
                </div>
              ) : (
                <div>
                  <span className="small text-muted fw-bold text-uppercase" style={{ fontSize: '10.5px', letterSpacing: '0.5px' }}>Service Mode</span>
                  <div className="fw-bold text-dark fs-6 mt-0.5 d-flex align-items-center gap-1.5">
                    <FiShoppingBag className="text-danger" />
                    <span>Takeaway Counter</span>
                  </div>
                </div>
              )}
            </div>

            {/* 3. Customer Information */}
            <div className="pos-order-section">
              <span className="small text-muted fw-bold text-uppercase mb-1" style={{ fontSize: '10.5px', letterSpacing: '0.5px' }}>Customer Info</span>
              <div className="row g-2">
                <div className="col-7">
                  <div className="input-group input-group-sm">
                    <span className="input-group-text bg-light text-muted border-light-subtle px-2" style={{ height: '32px' }}>
                      <FiPhone size={12} />
                    </span>
                    <input
                      type="tel"
                      className="form-control border-light-subtle"
                      placeholder="Mobile Number *"
                      value={customerPhone}
                      onChange={(e) => {
                        setCustomerPhone(e.target.value.replace(/\D/g, '').slice(0, 10));
                        if (orderError && orderError.toLowerCase().includes('mobile')) setOrderError('');
                      }}
                      style={{ fontSize: '11.5px', height: '32px' }}
                      required
                    />
                  </div>
                </div>
                <div className="col-5">
                  <div className="input-group input-group-sm">
                    <span className="input-group-text bg-light text-muted border-light-subtle px-2" style={{ height: '32px' }}>
                      <FiUser size={12} />
                    </span>
                    <input
                      type="text"
                      className="form-control border-light-subtle"
                      placeholder="Name (Optional)"
                      value={customerName}
                      onChange={(e) => setCustomerName(e.target.value)}
                      style={{ fontSize: '11.5px', height: '32px' }}
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* 4 & 5. Order Items */}
            <div className="pos-order-section">
              <div className="d-flex align-items-center justify-content-between mb-2">
                <div className="d-flex align-items-center gap-2">
                  <span className="fw-bold text-dark text-uppercase" style={{ fontSize: '12px', letterSpacing: '0.6px' }}>
                    ORDER ITEMS
                  </span>
                  <span className="badge bg-secondary-subtle text-secondary-emphasis rounded-pill px-2 py-0.5 fw-bold" style={{ fontSize: '11px' }}>
                    {cartItems.length}
                  </span>
                </div>
                {cartItems.length > 0 && (
                  <button
                    type="button"
                    onClick={handleResetOrder}
                    className="btn btn-link p-0 text-danger small text-decoration-none fw-semibold"
                    style={{ fontSize: '11.5px' }}
                  >
                    Clear All
                  </button>
                )}
              </div>

              {cartItems.length === 0 ? (
                <div className="p-4 text-center rounded-3 bg-light text-muted border border-dashed my-1">
                  <FiShoppingBag size={28} className="mb-2 text-secondary opacity-50" />
                  <p className="small mb-0 fw-bold text-dark" style={{ fontSize: '12.5px' }}>No dishes in order ticket.</p>
                  <p className="text-secondary small mb-0 mt-1" style={{ fontSize: '11px' }}>Click dishes from the menu to add items.</p>
                </div>
              ) : (
                <div className="d-flex flex-column gap-2">
                  {cartItems.map((item, idx) => {
                    const basePrice = Number(item.dish.price || item.dish.sellingPrice || 0);
                    const optionsTotal = (item.options || []).reduce((acc, opt) => acc + Number(opt.extra_price ?? opt.price ?? 0), 0);
                    const itemUnitPrice = basePrice + optionsTotal;
                    const lineTotal = itemUnitPrice * item.quantity;
                    const ft = normalizeFoodType(item.dish.foodType || item.dish.type);

                    return (
                      <div key={idx} className="p-2.5 rounded-3 border bg-light-subtle">
                        <div className="d-flex align-items-start justify-content-between gap-2">
                          <div className="flex-grow-1 text-truncate">
                            <div className="d-flex align-items-center gap-1.5">
                              <span 
                                className={ft === 'veg' ? 'veg-badge' : ft === 'vegan' ? 'vegan-badge' : 'non-veg-badge'}
                                style={{ transform: 'scale(0.7)' }}
                              ></span>
                              <strong className="text-dark small text-truncate" style={{ fontSize: '13px' }}>{item.dish.name}</strong>
                            </div>
                            <div className="text-muted small mt-0.5" style={{ fontSize: '11.5px' }}>
                              {formatCurrency(itemUnitPrice)} × {item.quantity}
                            </div>
                          </div>

                          <div className="d-flex align-items-center gap-2 flex-shrink-0">
                            <span className="fw-bold text-dark small" style={{ fontSize: '13px' }}>
                              {formatCurrency(lineTotal)}
                            </span>
                            
                            {/* Stepper */}
                            <div className="d-flex align-items-center gap-1 bg-white border rounded-pill px-2 py-0.5" style={{ height: '28px' }}>
                              <button
                                type="button"
                                onClick={() => handleUpdateQuantity(idx, -1)}
                                className="btn btn-xs btn-link text-secondary p-0 border-0"
                              >
                                <FiMinus size={11} />
                              </button>
                              <span className="fw-bold px-1.5 small" style={{ fontSize: '11.5px' }}>{item.quantity}</span>
                              <button
                                type="button"
                                onClick={() => handleUpdateQuantity(idx, 1)}
                                className="btn btn-xs btn-link text-secondary p-0 border-0"
                              >
                                <FiPlus size={11} />
                              </button>
                            </div>

                            <button
                              type="button"
                              onClick={() => handleRemoveItem(idx)}
                              className="btn btn-xs btn-link text-danger p-0 border-0 ms-1"
                              title="Remove item"
                            >
                              <FiTrash2 size={14} />
                            </button>
                          </div>
                        </div>

                        {/* Extra Ingredients / Instructions Display */}
                        {((item.options && item.options.length > 0) || item.specialInstructions) && (
                          <div className="mt-2 pt-2 border-top border-light-subtle text-muted" style={{ fontSize: '11px' }}>
                            {item.options && item.options.length > 0 && (
                              <div className="mb-0.5">
                                • Extra ingredients: {item.options.map(o => `${o.name} (+₹${Number(o.extra_price ?? o.price ?? 0)})`).join(', ')}
                              </div>
                            )}
                            {item.specialInstructions && (
                              <div className="fst-italic text-secondary">
                                • Instructions: {item.specialInstructions}
                              </div>
                            )}
                            <button
                              type="button"
                              onClick={() => handleOpenCustomize(item.dish, idx)}
                              className="btn btn-link p-0 text-primary small text-decoration-none mt-1 fw-semibold"
                              style={{ fontSize: '11px' }}
                            >
                              Instructions
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* 6. Coupons Section */}
            <div className="pos-order-section">
              <div className="d-flex align-items-center justify-content-between mb-2">
                <span className="small text-muted fw-bold" style={{ fontSize: '11px', letterSpacing: '0.5px' }}>COUPON / PROMO CODE</span>
                <button
                  type="button"
                  onClick={() => setShowCouponModal(true)}
                  className="btn btn-link p-0 text-danger small text-decoration-none fw-semibold"
                  style={{ fontSize: '11.5px' }}
                >
                  View Offers
                </button>
              </div>

              {appliedCoupon ? (
                <div className="p-2.5 rounded-3 bg-success-subtle border border-success-subtle d-flex align-items-center justify-content-between">
                  <div className="d-flex align-items-center gap-2 text-success">
                    <FiTag size={14} />
                    <strong style={{ fontSize: '12px' }}>{appliedCoupon.code}</strong>
                    <span className="small ms-1">(-{formatCurrency(billSummary.couponDiscount)})</span>
                  </div>
                  <button
                    type="button"
                    onClick={handleRemoveCoupon}
                    className="btn btn-link p-0 text-danger border-0"
                    title="Remove coupon"
                  >
                    <FiX size={15} />
                  </button>
                </div>
              ) : (
                <div className="input-group">
                  <input
                    type="text"
                    className="form-control rounded-start-pill border-light-subtle ps-3"
                    placeholder="Enter coupon code..."
                    value={couponCodeInput}
                    onChange={(e) => setCouponCodeInput(e.target.value.toUpperCase())}
                    style={{ fontSize: '12px', height: '38px' }}
                  />
                  <button
                    type="button"
                    onClick={() => handleApplyCoupon(couponCodeInput)}
                    className="btn btn-outline-danger rounded-end-pill px-3.5 fw-bold"
                    style={{ fontSize: '12px', height: '38px' }}
                  >
                    Apply
                  </button>
                </div>
              )}

              {couponError && (
                <div className="text-danger small mt-1.5" style={{ fontSize: '11px' }}>
                  {couponError}
                </div>
              )}
            </div>

            {/* 7 & 8. Bill Summary & Checkout Actions */}
            <div className="pos-order-section">
              <h6 className="fw-bold text-dark mb-2.5" style={{ fontSize: '12.5px' }}>Order Bill Summary</h6>
              
              <div className="d-flex justify-content-between text-secondary mb-1.5 small" style={{ fontSize: '12px' }}>
                <span>Items Subtotal</span>
                <span className="fw-semibold text-dark">{formatCurrency(billSummary.itemsSubtotal)}</span>
              </div>

              {billSummary.addOnsTotal > 0 && (
                <div className="d-flex justify-content-between text-secondary mb-1.5 small" style={{ fontSize: '12px' }}>
                  <span>Add-ons / Toppings</span>
                  <span className="fw-semibold text-dark">+{formatCurrency(billSummary.addOnsTotal)}</span>
                </div>
              )}

              {billSummary.dishDiscountsTotal > 0 && (
                <div className="d-flex justify-content-between text-success mb-1.5 small" style={{ fontSize: '12px' }}>
                  <span>Menu Discounts</span>
                  <span className="fw-semibold">-{formatCurrency(billSummary.dishDiscountsTotal)}</span>
                </div>
              )}

              {billSummary.couponDiscount > 0 && (
                <div className="d-flex justify-content-between text-success mb-1.5 small" style={{ fontSize: '12px' }}>
                  <span>Coupon Savings</span>
                  <span className="fw-semibold">-{formatCurrency(billSummary.couponDiscount)}</span>
                </div>
              )}

              {orderType === 'TAKEAWAY' && billSummary.packingCharge > 0 && (
                <div className="d-flex justify-content-between text-secondary mb-1.5 small" style={{ fontSize: '12px' }}>
                  <span>Takeaway Packing Charge ({billSummary.totalQuantity} items × ₹10)</span>
                  <span className="fw-semibold text-dark">+{formatCurrency(billSummary.packingCharge)}</span>
                </div>
              )}

              <div className="d-flex justify-content-between text-secondary mb-1.5 small" style={{ fontSize: '12px' }}>
                <span>Taxable Amount</span>
                <span className="fw-semibold text-dark">{formatCurrency(billSummary.taxableAmount)}</span>
              </div>

              <div className="d-flex justify-content-between text-secondary mb-1.5 small" style={{ fontSize: '12px' }}>
                <span>GST (5%)</span>
                <span className="fw-semibold text-dark">{formatCurrency(billSummary.gstAmount)}</span>
              </div>

              {billSummary.roundOff !== 0 && (
                <div className="d-flex justify-content-between text-secondary small" style={{ fontSize: '12px' }}>
                  <span>Round Off</span>
                  <span className="fw-semibold text-dark">{billSummary.roundOff > 0 ? `+${formatCurrency(billSummary.roundOff)}` : formatCurrency(billSummary.roundOff)}</span>
                </div>
              )}

              {/* Grand Total - Non-sticky, normal document flow */}
              <div className="d-flex justify-content-between align-items-center pt-2.5 mt-2.5 border-top border-2 border-secondary-subtle">
                <span className="fw-bold text-dark fs-6">Grand Total</span>
                <span className="fw-bold text-danger fs-4">
                  {formatCurrency(billSummary.grandTotal)}
                </span>
              </div>

              {/* Error Message */}
              {orderError && (
                <div className="alert alert-danger p-2.5 rounded-3 small my-2 d-flex align-items-center gap-2" style={{ fontSize: '12px' }}>
                  <FiAlertCircle className="flex-shrink-0" />
                  <span>{orderError}</span>
                </div>
              )}

              {/* Order Action Buttons */}
              <div className="d-flex flex-column gap-2 pt-2">
                <button
                  type="button"
                  disabled={!canSubmitOrder}
                  onClick={() => handleSubmitOrder(false)}
                  className={`btn btn-danger text-white fw-bold rounded-pill py-2.5 shadow-sm d-flex align-items-center justify-content-center gap-2 ${
                    !canSubmitOrder ? 'opacity-50' : ''
                  }`}
                  style={{ backgroundColor: 'var(--primary-color, #dc3545)', borderColor: 'var(--primary-color, #dc3545)', fontSize: '13.5px', height: '44px' }}
                  title={!canSubmitOrder && orderType === 'DINE_IN' && !selectedTable ? "Please choose a table number to continue." : ""}
                >
                  {submittingOrder ? (
                    <span>Placing Order...</span>
                  ) : (
                    <>
                      <FiCheck size={18} />
                      <span>Send to Kitchen (Unpaid)</span>
                    </>
                  )}
                </button>

                <button
                  type="button"
                  disabled={!canSubmitOrder}
                  onClick={() => handleSubmitOrder(true)}
                  className={`btn btn-outline-success fw-bold rounded-pill py-2 d-flex align-items-center justify-content-center gap-2 ${
                    !canSubmitOrder ? 'opacity-50' : ''
                  }`}
                  style={{ fontSize: '13px', height: '40px' }}
                  title={!canSubmitOrder && orderType === 'DINE_IN' && !selectedTable ? "Please choose a table number to continue." : ""}
                >
                  <FiDollarSign size={17} />
                  <span>Pay Cash / Counter Pay (Paid)</span>
                </button>
              </div>
            </div>
          </aside>
        </div>

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
                  Save Customization
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
            if (tableFilter === 'ALL') return true;
            if (tableFilter === 'AVAILABLE') return t.status === 'Available' && !t.is_occupied && t.is_active !== false;
            if (tableFilter === 'OCCUPIED') return t.status === 'Occupied' || Boolean(t.is_occupied) || t.status === 'Reserved';
            return true;
          });

          return (
            <Modal
              isOpen={showTablePicker}
              title="Select Table for Dine-In"
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
                      <div className="row row-cols-2 row-cols-sm-3 g-2.5 overflow-auto" style={{ maxHeight: '350px' }}>
                        {filteredTableList.map((table) => {
                          const isSelected = selectedTable && String(selectedTable.id) === String(table.id);
                          const tableNum = tableService.getCanonicalTableNumber(table.number || table.table_number || table.id);
                          const isOccupied = table.status === 'Occupied' || Boolean(table.is_occupied) || table.status === 'Reserved' || table.is_active === false;

                          return (
                            <div key={table.id} className="col">
                              <div
                                onClick={() => {
                                  if (isOccupied) {
                                    window.alert(table.status === 'Reserved' ? 'Table is reserved.' : 'Table is occupied.');
                                    return;
                                  }
                                  handleSelectTable(table);
                                }}
                                className={`p-3 rounded-3 border text-center transition-all ${
                                  isOccupied 
                                    ? 'border-secondary-subtle bg-light opacity-60'
                                    : isSelected 
                                    ? 'border-danger bg-danger-subtle shadow-xs cursor-pointer' 
                                    : table.status === 'Available'
                                    ? 'border-success-subtle bg-white hover-shadow cursor-pointer'
                                    : 'border-warning-subtle bg-light-subtle cursor-pointer'
                                }`}
                                style={{ cursor: isOccupied ? 'not-allowed' : 'pointer' }}
                                title={isOccupied ? `Table ${tableNum} is ${table.status}` : `Select Table ${tableNum}`}
                              >
                                <div className="fw-bold fs-6 text-dark mb-0.5">
                                  Table {tableNum}
                                </div>
                                <div className="small text-muted mb-1.5" style={{ fontSize: '11px' }}>
                                  {table.capacity || 4} Diners
                                </div>
                                <Badge status={table.status} className="px-2 py-0.5" style={{ fontSize: '10px' }} />
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
                  {coupons.map((c) => {
                    const isEligible = billSummary.merchandise >= Number(c.minOrderValue || c.minimum_order_amount || 0);

                    return (
                      <div 
                        key={c.code}
                        className={`p-3 rounded-3 border d-flex align-items-center justify-content-between gap-3 ${
                          isEligible ? 'bg-white border-light-subtle' : 'bg-light border-light-subtle opacity-75'
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
                            {c.description || `Applicable on orders above ${formatCurrency(c.minOrderValue || c.minimum_order_amount || 0)}`}
                          </p>
                        </div>

                        <button
                          type="button"
                          disabled={!isEligible}
                          onClick={() => handleApplyCoupon(c.code)}
                          className="btn btn-sm btn-outline-danger rounded-pill px-3 py-1 fw-bold"
                          style={{ fontSize: '11.5px' }}
                        >
                          Apply
                        </button>
                      </div>
                    );
                  })}
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
                  : `Table ${tableService.getCanonicalTableNumber(placedOrder.table_label || placedOrder.table)} ticket dispatched to kitchen`}
              </p>

              <div className="p-3 rounded-3 bg-light text-start mb-4">
                <div className="d-flex justify-content-between mb-1 small">
                  <span className="text-muted">Payment Status:</span>
                  <strong className={placedOrder.is_paid || String(placedOrder.payment_status).toUpperCase() === 'PAID' ? 'text-success' : 'text-danger'}>
                    {placedOrder.is_paid || String(placedOrder.payment_status).toUpperCase() === 'PAID' ? 'PAID (Cash)' : 'UNPAID'}
                  </strong>
                </div>
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
                  onClick={() => {
                    const ord = placedOrder;
                    setPlacedOrder(null);
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

        {/* E-Bill Receipt Modal */}
        <EBillModal
          isOpen={!!viewingEBill}
          order={viewingEBill}
          onClose={() => setViewingEBill(null)}
        />

      </div>
    </AdminLayout>
  );
};

export default Pos;
