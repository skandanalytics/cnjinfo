import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import CustomerLayout from '../../components/layout/CustomerLayout';
import useProducts from '../../hooks/useProducts';
import useCategories from '../../hooks/useCategories';
import FoodCard from '../../components/customer/FoodCard';
import Loader from '../../components/common/Loader';
import Pagination from '../../components/common/Pagination';
import { useAuth } from '../../hooks/useAuth';
import EmptyState from '../../components/common/EmptyState';
import {
  FiGrid, FiPieChart, FiHeart, FiLayers, FiZap, FiActivity, FiCoffee, FiDisc, FiStar, FiPercent,
  FiChevronLeft, FiChevronRight
} from 'react-icons/fi';
import { filterAndSortProducts, normalizeFoodType } from '../../utils/filters';
import { isDishInCategory, normalizeCategoryName } from '../../utils/categoryUtils';
import { orderService, isOrderOwnedByCustomer, getCustomerPhone } from '../../services/orderService';
import { useCart } from '../../hooks/useCart';
import { chooseCustomerBranch, listOpenBranches } from '../../services/productService';
import { useSearchParams } from 'react-router-dom';
import { tableService } from '../../services/tableService';
import { couponService } from '../../services/couponService';
import OrderTypeModal from '../../components/customer/OrderTypeModal';
import { getOrderType, hasDineInTable, hasScannedTable, setOrderType, setSelectedTableId, rememberDineInTableId } from '../../utils/orderContext';
import SearchBar from '../../components/common/SearchBar';
import formatCurrency from '../../utils/formatCurrency';
import { formatCompactTableLabel } from '../../utils/tableUtils';
import EBillModal from '../../components/orders/EBillModal';

const ITEMS_PER_PAGE = 12;

export const Home = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const tableParam = searchParams.get('table');
  const qrParam = searchParams.get('qr');
  const { products, loading, refetch } = useProducts();
  const [openBranches, setOpenBranches] = useState([]);
  useEffect(() => {
    if (!loading && (!products || products.length === 0)) {
      listOpenBranches().then(rows => setOpenBranches(rows || [])).catch(() => {});
    }
  }, [loading, products]);
  const { categories: rawCategories, categoryNames: allCategories } = useCategories(products);

  const categories = allCategories.filter(cat => {
    if (cat === 'All') return true;
    if (cat === 'Discount' || cat === 'Offers') return false;
    const catObj = rawCategories.find((row) => normalizeCategoryName(row.name) === normalizeCategoryName(cat)) || { name: cat };
    return products?.some((product) => isDishInCategory(product, catObj) || (cat === 'Popular' && product.is_popular));
  });

  const { user, isAuthenticated } = useAuth();
  const { tableContext, setTable, abandonStaffTableOrder } = useCart();
  const [leavingTableOrder, setLeavingTableOrder] = useState(false);

  useEffect(() => {
    const hasActiveSession = isAuthenticated || sessionStorage.getItem('foodie_staff_ordering') === '1' || sessionStorage.getItem('foodie_order_type') || sessionStorage.getItem('foodie_table') || tableParam || qrParam;
    if (!hasActiveSession) {
      const searchStr = window.location.search || '';
      navigate(`/customer/welcome${searchStr}`, { replace: true });
    }
  }, [isAuthenticated, navigate, tableParam, qrParam]);

  useEffect(() => {
    if (tableParam) {
      const canon = tableService.getCanonicalTableNumber(tableParam);
      setTable({ tableNumber: canon, tableId: canon, diners: 2 });
    }
    // setTable is recreated on every provider render; depending on it would loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tableParam]);

  const [selectedCategories, setSelectedCategories] = useState(['All']);
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState('DEFAULT');
  const [selectedFoodTypes, setSelectedFoodTypes] = useState([]);
  const foodTypeOf = (dish) => normalizeFoodType(
    dish.foodType ?? dish.type ?? dish.food_type ?? (dish.is_veg === false || dish.is_veg === 'false' ? 'non-veg' : 'veg')
  );
  const availableFoodTypes = new Set((products || []).map(foodTypeOf));
  useEffect(() => {
    setSelectedFoodTypes((prev) => prev.filter((t) => availableFoodTypes.has(t)));
  }, [products]);
  const [currentPage, setCurrentPage] = useState(1);
  const [activeOrders, setActiveOrders] = useState([]);
  const [customerOrders, setCustomerOrders] = useState([]);
  const [activeBanner, setActiveBanner] = useState(null);

  useEffect(() => {
    const fetchBanners = async () => {
      try {
        const coupons = await couponService.getCoupons();
        const activeCoupon = coupons.find(c => c.status === 'Active');
        if (activeCoupon) {
          setActiveBanner(activeCoupon);
        }
      } catch (e) {
        console.error("Failed to fetch coupons for banner:", e);
      }
    };
    fetchBanners();
    window.addEventListener('foodie_offers_updated', fetchBanners);
    return () => window.removeEventListener('foodie_offers_updated', fetchBanners);
  }, []);

  const isEmployee = user?.role === 'employee' || user?.role === 'admin';

  const [showOrderTypeModal, setShowOrderTypeModal] = useState(() => {
    const savedType = getOrderType();
    if (savedType === 'DINE_IN' && !hasDineInTable()) return true;
    return !savedType && !qrParam;
  });

  const handleSelectOrderType = (type) => {
    if (type === 'DINE_IN' && !hasDineInTable()) {
      navigate('/customer/welcome', { state: { chooseDining: true } });
      return;
    }
    setShowOrderTypeModal(false);
    setOrderType(type);
    if (type === 'TAKEAWAY') {
      setTable({ tableNumber: 'Takeaway', tableId: 'Takeaway', orderType: 'TAKEAWAY' });
    }
  };

  const isAllSelected = selectedCategories.includes('All') || selectedCategories.length === 0;

  const handleToggleCategory = (cat) => {
    setCurrentPage(1);

    if (cat === 'All') {
      setSelectedCategories(['All']);
      return;
    }

    setSelectedCategories(prev => {
      const isSelected = prev.includes(cat);
      if (isSelected) {
        const next = prev.filter(c => c !== cat);
        return next.length === 0 ? ['All'] : next;
      } else {
        const next = prev.filter(c => c !== 'All').concat(cat);
        return next;
      }
    });
  };

  const primarySelectedCategory = selectedCategories.length === 1 ? selectedCategories[0] : (isAllSelected ? 'All' : null);

  const activeCategoryObj = primarySelectedCategory ? rawCategories.find(c =>
    c.name === primarySelectedCategory ||
    normalizeCategoryName(c.name) === normalizeCategoryName(primarySelectedCategory) ||
    normalizeCategoryName(c.originalName) === normalizeCategoryName(primarySelectedCategory)
  ) : null;

  const activeCategoryDescription = primarySelectedCategory ? (
    activeCategoryObj?.description || (
      primarySelectedCategory === 'All' ? 'Explore our complete menu of freshly prepared foods and chef specials.' :
        primarySelectedCategory === 'Popular' ? 'Our most ordered and highest rated dishes loved by foodies.' :
          primarySelectedCategory === 'Discount' ? 'Special discount offers and meal deals available today.' : ''
    )
  ) : (
    selectedCategories.length > 1 ? `Showing dishes from: ${selectedCategories.join(', ')}` : ''
  );

  const sliderRef = useRef(null);
  const [scrollLeftPos, setScrollLeftPos] = useState(0);
  const [canScrollRight, setCanScrollRight] = useState(true);

  const firstSelectedCat = selectedCategories[0] || 'All';
  const currentCategoryIdx = categories.findIndex(
    c => c === firstSelectedCat || normalizeCategoryName(c) === normalizeCategoryName(firstSelectedCat)
  );
  const isFirstCategory = currentCategoryIdx <= 0;
  const isLastCategory = currentCategoryIdx >= categories.length - 1;

  const checkScroll = () => {
    if (sliderRef.current) {
      const { scrollLeft, scrollWidth, clientWidth } = sliderRef.current;
      setScrollLeftPos(scrollLeft);
      setCanScrollRight(scrollLeft + clientWidth < scrollWidth - 5);
    }
  };

  useEffect(() => {
    checkScroll();
  }, [categories, selectedCategories]);

  const showLeftArrow = !isFirstCategory || scrollLeftPos > 15;
  const showRightArrow = !isLastCategory || canScrollRight;

  const handlePrevCategory = () => {
    if (!categories || categories.length <= 1) return;
    const currentIdx = categories.findIndex(
      c => c === firstSelectedCat || normalizeCategoryName(c) === normalizeCategoryName(firstSelectedCat)
    );
    const validIdx = currentIdx >= 0 ? currentIdx : 0;
    if (validIdx <= 0) return;

    const prevIdx = validIdx - 1;
    const prevCat = categories[prevIdx];
    handleToggleCategory(prevCat);

    const pill = document.getElementById(`customer-cat-pill-${prevIdx}`);
    if (pill) {
      pill.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
    } else if (sliderRef.current) {
      sliderRef.current.scrollBy({ left: -140, behavior: 'smooth' });
    }
  };

  const handleNextCategory = () => {
    if (!categories || categories.length <= 1) return;
    const currentIdx = categories.findIndex(
      c => c === firstSelectedCat || normalizeCategoryName(c) === normalizeCategoryName(firstSelectedCat)
    );
    const validIdx = currentIdx >= 0 ? currentIdx : 0;
    if (validIdx >= categories.length - 1) return;

    const nextIdx = validIdx + 1;
    const nextCat = categories[nextIdx];
    handleToggleCategory(nextCat);

    const pill = document.getElementById(`customer-cat-pill-${nextIdx}`);
    if (pill) {
      pill.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
    } else if (sliderRef.current) {
      sliderRef.current.scrollBy({ left: 140, behavior: 'smooth' });
    }
  };

  // Keyboard navigation for < / , / ArrowLeft and > / . / ArrowRight
  useEffect(() => {
    const handleKeyDown = (e) => {
      const activeEl = document.activeElement;
      const isInputFocused = activeEl && (
        activeEl.tagName === 'INPUT' ||
        activeEl.tagName === 'TEXTAREA' ||
        activeEl.tagName === 'SELECT' ||
        activeEl.isContentEditable
      );
      if (isInputFocused) return;

      if (e.key === '>' || e.key === '.' || e.key === 'ArrowRight') {
        e.preventDefault();
        handleNextCategory();
      } else if (e.key === '<' || e.key === ',' || e.key === 'ArrowLeft') {
        e.preventDefault();
        handlePrevCategory();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [categories, selectedCategories]);

  useEffect(() => {
    setCurrentPage(1);
  }, [selectedCategories, sortBy, selectedFoodTypes, search]);

  const fetchActiveOrdersRef = useRef(null);
  const [proceedingBillId, setProceedingBillId] = useState(null);

  const formatOrderItemsSummary = (items) => {
    if (!Array.isArray(items) || items.length === 0) return '';
    const itemMap = new Map();
    for (const item of items) {
      const key = item.food_id || item.foodId || item.id || item.name;
      const name = item.name || item.food_name || item.dish_name || 'Item';
      const qty = Number(item.quantity || 1);
      if (itemMap.has(key)) {
        itemMap.get(key).quantity += qty;
      } else {
        itemMap.set(key, { name, quantity: qty });
      }
    }
    const aggregated = Array.from(itemMap.values());
    const summary = aggregated.slice(0, 3).map(i => `${i.name} × ${i.quantity}`).join(', ');
    return aggregated.length > 3 ? `${summary}…` : summary;
  };

  const consolidateActiveOrders = (rawList) => {
    if (!Array.isArray(rawList) || rawList.length === 0) return [];

    const groups = new Map();

    for (const ord of rawList) {
      const rootId = String(ord.parent_order_id || (typeof ord.parent_order === 'object' ? ord.parent_order?.id : ord.parent_order) || ord.id);
      if (!groups.has(rootId)) {
        groups.set(rootId, []);
      }
      groups.get(rootId).push(ord);
    }

    const result = [];
    for (const [rootId, group] of groups.entries()) {
      group.sort((a, b) => {
        const idxA = Number(a.continuation_index || 0);
        const idxB = Number(b.continuation_index || 0);
        if (idxA !== idxB) return idxA - idxB;
        return Number(a.id || 0) - Number(b.id || 0);
      });

      const rootOrd = group.find(o => !o.parent_order_id && !o.parent_order) || group[0];
      const latestOrd = group[group.length - 1];

      const combinedItems = [];
      let grandTotal = 0;
      let anyCompleted = false;
      let allPaid = true;

      for (const o of group) {
        const items = Array.isArray(o.items) ? o.items : [];
        combinedItems.push(...items);
        const totalNum = Number(o.total || o.total_amount || 0);
        grandTotal += totalNum;
        const st = String(o.backendStatus || o.status || '').toUpperCase();
        if (['COMPLETED', 'DELIVERED', 'DONE', 'SETTLED'].includes(st)) {
          anyCompleted = true;
        }
        const paySt = String(o.payment_status || o.paymentStatus || '').toUpperCase();
        if (paySt !== 'PAID') {
          allPaid = false;
        }
      }

      const effectiveItems = (rootOrd.combined_items && rootOrd.combined_items.length > 0)
        ? rootOrd.combined_items
        : combinedItems;

      const effectiveTotal = (rootOrd.combined_total && Number(rootOrd.combined_total) > 0)
        ? Number(rootOrd.combined_total)
        : (grandTotal > 0 ? grandTotal : rootOrd.total);

      const effectiveStatus = anyCompleted ? 'Completed' : (latestOrd.status || rootOrd.status);
      const effectiveBackendStatus = anyCompleted ? 'COMPLETED' : (latestOrd.backendStatus || rootOrd.backendStatus || latestOrd.status);
      const effectiveDisplayNo = latestOrd.display_order_number || latestOrd.display_number || rootOrd.display_order_number || String(rootId);

      result.push({
        ...rootOrd,
        id: Number(rootId) || rootId,
        backendNumericId: Number(rootId) || rootId,
        parent_order_id: null,
        display_order_number: effectiveDisplayNo,
        display_number: effectiveDisplayNo,
        displayOrderNumber: effectiveDisplayNo,
        status: effectiveStatus,
        backendStatus: effectiveBackendStatus,
        items: effectiveItems,
        total: effectiveTotal,
        total_amount: String(effectiveTotal),
        payment_status: allPaid ? 'PAID' : 'UNPAID',
        paymentStatus: allPaid ? 'PAID' : 'UNPAID',
        is_paid: allPaid,
        has_continuations: group.length > 1,
        continuations_count: group.length - 1,
        all_session_order_ids: group.map(o => o.id),
        created_at: rootOrd.created_at || latestOrd.created_at,
        placedAt: rootOrd.placedAt || latestOrd.placedAt,
        rawCreatedAt: rootOrd.rawCreatedAt || latestOrd.rawCreatedAt,
      });
    }

    result.sort((a, b) => {
      const timeA = Number(a.placedAt || a.rawCreatedAt) || (a.created_at ? new Date(a.created_at).getTime() : 0) || 0;
      const timeB = Number(b.placedAt || b.rawCreatedAt) || (b.created_at ? new Date(b.created_at).getTime() : 0) || 0;
      if (timeA && timeB && timeA !== timeB) return timeB - timeA;
      const idA = parseInt(String(a.backendNumericId || a.id).replace(/\D/g, ''), 10) || 0;
      const idB = parseInt(String(b.backendNumericId || b.id).replace(/\D/g, ''), 10) || 0;
      return idB - idA;
    });

    return result;
  };

  useEffect(() => {
    let isMounted = true;

    const fetchActiveOrders = async () => {
      if (isEmployee) {
        if (isMounted) setActiveOrders([]);
        return;
      }
      try {
        const isOrderLive = (ord) => {
          if (!ord || (!ord.id && !ord.order_id)) return false;
          const st = String(ord.status || ord.backendStatus || '').toLowerCase().trim();
          const paySt = String(ord.payment_status || ord.paymentStatus || '').toLowerCase().trim();
          if (['cancelled', 'canceled', 'cancel', 'rejected', 'void', 'voided'].includes(st)) return false;
          if (paySt === 'paid') return false;
          if (['completed', 'done', 'settled', 'delivered'].includes(st) && paySt === 'paid') return false;
          return true;
        };

        const token = sessionStorage.getItem('foodie_token_customer') || localStorage.getItem('foodie_token_customer');
        if (token) {
          const api = (await import('../../services/api')).default;
          const { mapOrder } = await import('../../services/adminApi');
          const res = await api.get('/orders/', { bypassCache: true });
          const rows = Array.isArray(res.data) ? res.data : (res.data?.results || []);
          const activeList = rows
            .map(mapOrder)
            .filter(isOrderLive);
          const consolidated = consolidateActiveOrders(activeList);
          if (isMounted) setActiveOrders(consolidated);
          return;
        }

        const currentCustomer = JSON.parse(localStorage.getItem('foodie_auth_customer') || sessionStorage.getItem('foodie_auth_customer') || '{}').user || user;
        const activePhone = getCustomerPhone() || currentCustomer?.phone || user?.phone;

        const orders = await orderService.getOrders(activePhone || 'GUEST', false).catch(() => []);

        const activeList = (orders || []).filter(ord => {
          return isOrderLive(ord) && isOrderOwnedByCustomer(ord, currentCustomer);
        });

        const consolidated = consolidateActiveOrders(activeList);
        if (isMounted) {
          setActiveOrders(consolidated);
        }
      } catch (err) {
        if (isMounted) setActiveOrders([]);
      }
    };

    fetchActiveOrdersRef.current = fetchActiveOrders;
    fetchActiveOrders();
    const handleSync = () => fetchActiveOrders();
    window.addEventListener('foodie_orders_updated', handleSync);
    window.addEventListener('storage', handleSync);

    return () => {
      isMounted = false;
      window.removeEventListener('foodie_orders_updated', handleSync);
      window.removeEventListener('storage', handleSync);
    };
  }, [user, isEmployee]);

  const handleFoodTypeToggle = (type) => {
    setSelectedFoodTypes((prev) =>
      prev.includes(type) ? prev.filter((t) => t !== type) : [...prev, type]
    );
    setCurrentPage(1);
  };

  const [viewingBillOrder, setViewingBillOrder] = useState(null);

  const handleViewBill = async (ord) => {
    try {
      const { fetchCustomerBillPreview } = await import('../../services/customerCheckout');
      const rootId = ord.parent_order_id || (typeof ord.parent_order === 'object' ? ord.parent_order?.id : ord.parent_order) || ord.id;
      const preview = await fetchCustomerBillPreview(rootId);
      setViewingBillOrder({
        ...ord,
        ...preview,
        id: rootId,
        items: preview.items || ord.items,
        combined_items: preview.items,
        total: preview.total_amount || ord.total,
        total_amount: preview.total_amount || ord.total_amount,
        display_order_number: preview.display_order_number || ord.display_order_number,
      });
    } catch (e) {
      console.warn('Could not fetch bill preview, falling back to ord', e);
      setViewingBillOrder(ord);
    }
  };

  const handleProceedToBill = async (ord) => {
    if (!ord) return;
    const rootId = ord.parent_order_id || (typeof ord.parent_order === 'object' ? ord.parent_order?.id : ord.parent_order) || ord.id;
    const isCompleted = String(ord.status || ord.backendStatus || '').toUpperCase() === 'COMPLETED';
    if (isCompleted) {
      await handleViewBill(ord);
      return;
    }
    setProceedingBillId(ord.id);
    try {
      const { proceedOrderToBill } = await import('../../services/customerCheckout');
      await proceedOrderToBill(rootId);
      if (fetchActiveOrdersRef.current) {
        await fetchActiveOrdersRef.current();
      }
      await handleViewBill({
        ...ord,
        id: rootId,
        status: 'Completed',
        backendStatus: 'COMPLETED'
      });
    } catch (err) {
      console.warn('Could not proceed to bill directly, navigating to confirmation', err);
      navigate(`/customer/order-confirmation?order=${rootId}&proceedToBill=1`);
    } finally {
      setProceedingBillId(null);
    }
  };

  const handleContinueOrder = async (ord) => {
    if (!ord) return;
    const rootId = ord.parent_order_id || ord.parent_order || ord.id;
    sessionStorage.setItem('foodie_parent_order_id', String(rootId));
    localStorage.setItem('foodie_parent_order_id', String(rootId));

    let tableId = ord.table_id || ord.tableId || (typeof ord.table === 'object' ? ord.table?.id : null);
    const tableNumber = ord.table_number || ord.tableNumber || (typeof ord.table === 'object' ? ord.table?.table_number || ord.table?.label : ord.table);

    // If tableId is still missing, resolve it by matching tableNumber against branch tables
    if (!tableId && tableNumber) {
      try {
        const { resolvePublicBranchId, availableTables } = await import('../../services/customerCheckout');
        const branchId = await resolvePublicBranchId();
        if (branchId) {
          const tables = await availableTables(branchId);
          const cleanTarget = String(tableNumber).toUpperCase().trim();
          const matched = tables.find(t =>
            String(t.table_number).toUpperCase().trim() === cleanTarget ||
            String(t.table_number).toUpperCase().trim() === cleanTarget.replace(/^TABLE\s*/i, '') ||
            `T${String(t.table_number).replace(/\D/g, '').padStart(2, '0')}` === cleanTarget
          );
          if (matched) tableId = matched.id;
        }
      } catch (e) {
        console.warn('Could not resolve table id by number:', e);
      }
    }

    if (tableId) {
      sessionStorage.setItem('foodie_selected_table', String(tableId));
      localStorage.setItem('foodie_selected_table', String(tableId));
      setSelectedTableId(tableId, tableNumber);
      rememberDineInTableId(tableId);
      setTable({
        id: tableId,
        tableId: tableId,
        tableNumber: tableNumber,
        table_number: tableNumber,
        location: ord.location || '',
        orderType: 'DINE_IN',
      });
    }
    setOrderType('DINE_IN');
    sessionStorage.setItem('foodie_order_type', 'DINE_IN');
    localStorage.setItem('foodie_order_type', 'DINE_IN');

    try {
      const { applyOrderContext } = await import('../../services/customerCheckout');
      await applyOrderContext('DINE_IN', tableId);
    } catch (e) {
      console.warn('Could not apply context on continue order:', e);
    }

    document.getElementById('customer-menu')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const getCategoryIcon = (category) => {
    const norm = (category || '').toLowerCase();
    if (norm === 'all') return <FiGrid size={14} />;
    if (norm === 'popular') return <FiStar size={14} />;
    if (norm.includes('discount') || norm.includes('offer')) return <FiPercent size={14} />;
    if (norm.includes('burger')) return <FiDisc size={14} />;
    if (norm.includes('pizza')) return <FiPieChart size={14} />;
    if (norm.includes('biryani') || norm.includes('rice')) return <FiHeart size={14} />;
    if (norm.includes('indian') || norm.includes('meal') || norm.includes('thali') || norm.includes('combo')) return <FiLayers size={14} />;
    if (norm.includes('starter') || norm.includes('snack') || norm.includes('appetizer') || norm.includes('fry') || norm.includes('fries') || norm.includes('roll')) return <FiZap size={14} />;
    if (norm.includes('dessert') || norm.includes('sweet') || norm.includes('cake') || norm.includes('ice cream') || norm.includes('pastry')) return <FiActivity size={14} />;
    if (norm.includes('beverage') || norm.includes('drink') || norm.includes('coffee') || norm.includes('tea') || norm.includes('juice') || norm.includes('shake') || norm.includes('soda') || norm.includes('mocktail')) return <FiCoffee size={14} />;
    if (norm.includes('pasta') || norm.includes('noodle') || norm.includes('chinese') || norm.includes('asian') || norm.includes('momo')) return <FiDisc size={14} />;
    if (norm.includes('soup') || norm.includes('salad')) return <FiHeart size={14} />;
    return <FiGrid size={14} />;
  };

  // First filter by category and search (without foodType filter)
  const baseFilteredDishes = filterAndSortProducts(products, {
    selectedCategories,
    category: primarySelectedCategory || 'All',
    search: search,
    sortBy
  });

  const filteredDishes = filterAndSortProducts(baseFilteredDishes, {
    selectedCategories: ['All'], // Already filtered by categories
    category: 'All', // Already filtered by category
    search: '', // Already filtered by search
    sortBy,
    selectedFoodTypes: selectedFoodTypes
  });

  const totalPages = Math.ceil(filteredDishes.length / ITEMS_PER_PAGE);
  const paginatedDishes = filteredDishes.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE
  );

  if (loading && (!products || products.length === 0)) {
    return (
      <CustomerLayout>
        <Loader />
      </CustomerLayout>
    );
  }

  if (!loading && (!products || products.length === 0)) {
    return (
      <CustomerLayout>
        <main className="px-3 pt-5 text-center">
          {openBranches.length > 1 ? (
            <div>
              <h5 className="fw-bold mb-3">Choose a restaurant</h5>
              <div className="d-flex flex-column gap-2">
                {openBranches.map(branch => (
                  <button key={branch.id} type="button" className="btn btn-outline-danger rounded-pill"
                    onClick={() => { chooseCustomerBranch(branch.id); refetch(); }}>
                    {branch.name}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <EmptyState
              title="No Dishes Found"
              description="We couldn't find any dishes available on the menu."
              icon="bi-emoji-frown"
            />
          )}
        </main>
      </CustomerLayout>
    );
  }

  return (
    <CustomerLayout>
      <main className="px-1 pt-2">
        {/* Admin/Employee Table Ordering Bar */}
        {isEmployee && (
          <div className="card rounded-4 border-0 shadow-sm p-3 mb-4 text-white text-start" style={{ background: 'linear-gradient(135deg, #1e293b 0%, #0f172a 100%)' }}>
            <div className="d-flex align-items-center justify-content-between flex-wrap gap-2">
              <div className="d-flex align-items-center gap-2 flex-wrap">
                <span className="badge bg-danger text-white fw-bold rounded-pill px-3 py-1.5" style={{ fontSize: '11px' }}>
                  Taking Order
                </span>
                {formatCompactTableLabel(tableContext?.tableNumber) && (
                  <span className="fw-bold fs-6 text-white font-monospace">
                    {formatCompactTableLabel(tableContext?.tableNumber)}
                  </span>
                )}
                {tableContext?.diners && (
                  <span className="badge bg-secondary rounded-pill small" style={{ fontSize: '10px' }}>
                    {tableContext.diners} Diners
                  </span>
                )}
                <span className="text-white-50 small ms-1" style={{ fontSize: '12px' }}>
                  Select items below to build customer order
                </span>
              </div>
              <div className="d-flex align-items-center gap-2 flex-wrap ms-auto">
                <button
                  type="button"
                  disabled={leavingTableOrder}
                  onClick={async () => {
                    if (leavingTableOrder) return;
                    setLeavingTableOrder(true);
                    try {
                      await abandonStaffTableOrder();
                      navigate(user?.role === 'admin' ? '/admin/tables' : '/employee/tables');
                    } catch (err) {
                      window.alert(err.message || 'The unfinished order could not be cleared. Stay on this page and try again.');
                      setLeavingTableOrder(false);
                    }
                  }}
                  className="btn btn-sm btn-outline-light rounded-pill px-3 py-1.5 fw-bold"
                  style={{ fontSize: '12px' }}
                >
                  {leavingTableOrder ? 'Clearing…' : '← Back to Tables'}
                </button>
                <button
                  type="button"
                  onClick={() => navigate('/customer/cart')}
                  className="btn btn-sm btn-danger rounded-pill px-3.5 py-1.5 fw-bold shadow-sm"
                  style={{ fontSize: '12px' }}
                >
                  Review Order / Cart →
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Hero Banner: Delicious Food For Every Mood (Matches Reference 13) */}
        <div
          className="rounded-4 p-4 p-md-5 mb-4 text-start position-relative overflow-hidden shadow-sm d-flex flex-column flex-md-row align-items-md-center justify-content-between"
          style={{
            background: 'linear-gradient(135deg, #FFF9F5 0%, #FFF3EC 50%, #FFEBE0 100%)',
            border: '1px solid #FFE4D6'
          }}
        >
          <div style={{ maxWidth: '480px', zIndex: 2 }}>
            <h1 className="fw-bold mb-1" style={{ color: '#C8102E', fontSize: 'clamp(28px, 4vw, 38px)', letterSpacing: '-0.8px', lineHeight: 1.15 }}>
              Delicious Food
            </h1>
            <h1 className="fw-bold mb-2" style={{ color: '#C8102E', fontSize: 'clamp(28px, 4vw, 38px)', letterSpacing: '-0.8px', lineHeight: 1.15 }}>
              For Every Mood
            </h1>
            <p className="text-secondary small mb-3" style={{ fontSize: '13px' }}>
              Fresh ingredients, tasty dishes, great moments.
            </p>
            {/* Search for dishes pill inside hero */}
            <div className="position-relative" style={{ maxWidth: '380px' }}>
              <input 
                type="text"
                placeholder="Search for dishes..."
                value={search}
                onChange={(e) => { setSearch(e.target.value); setCurrentPage(1); }}
                className="form-control rounded-pill ps-4 py-2 border shadow-xs"
                style={{ fontSize: '13px', backgroundColor: '#FFFFFF', borderColor: '#CBD5E1' }}
              />
            </div>
          </div>

          <div className="d-none d-md-flex align-items-center gap-3 mt-3 mt-md-0 position-relative" style={{ zIndex: 1 }}>
            <img 
              src="https://images.unsplash.com/photo-1589302168068-964664d93dc0?w=320&auto=format&fit=crop&q=80" 
              alt="Delicious Biryani"
              className="rounded-circle shadow-md"
              style={{ width: '130px', height: '130px', objectFit: 'cover', border: '4px solid #fff' }}
            />
            <img 
              src="https://images.unsplash.com/photo-1601050690597-df0568f70950?w=320&auto=format&fit=crop&q=80" 
              alt="Crispy Pani Puri"
              className="rounded-circle shadow-md"
              style={{ width: '150px', height: '150px', objectFit: 'cover', border: '4px solid #fff' }}
            />
          </div>
        </div>

        {/* Active Live Orders List Section (shows right AFTER Flat ₹50 OFF banner) */}
        {!isEmployee && activeOrders && activeOrders.length > 0 && (
          <div className="d-flex flex-column gap-3 mb-4">
            {activeOrders.map((ord) => {
              const st = String(ord.status || '').toLowerCase().trim();
              const isCompleted = ['completed', 'delivered', 'done', 'settled'].includes(st) ||
                ['COMPLETED', 'DELIVERED', 'DONE', 'SETTLED'].includes(String(ord.backendStatus || '').toUpperCase());

              let stText = 'Order Placed';
              let stBg = 'bg-danger text-white';

              if (['preparing', 'cooking', 'accepted', 'in_kitchen'].includes(st)) {
                stText = 'Preparing';
                stBg = 'bg-warning text-dark';
              } else if (['ready', 'prepared', 'out_for_delivery', 'ready_for_pickup'].includes(st)) {
                stText = 'Ready for Pickup';
                stBg = 'bg-info text-dark';
              } else if (['serving', 'served'].includes(st)) {
                stText = 'Serving to Table';
                stBg = 'bg-primary text-white';
              } else if (isCompleted) {
                stText = 'Bill Ready · Settlement Pending';
                stBg = 'bg-info text-dark';
              }

              const isPaid = String(ord.payment_status || ord.paymentStatus || '').toUpperCase() === 'PAID';
              const totalItemCount = (ord.items || []).reduce((sum, item) => sum + (Number(item.quantity) || 1), 0);
              const itemsSummary = formatOrderItemsSummary(ord.items);
              const isProcessingThisBill = proceedingBillId === ord.id;

              return (
                <div
                  key={ord.id}
                  className="card rounded-4 border-0 shadow-sm p-3.5 text-white text-start"
                  style={{ background: 'linear-gradient(135deg, #1e293b 0%, #0f172a 100%)' }}
                >
                  <div className="d-flex align-items-center justify-content-between flex-wrap gap-2">
                    <div>
                      <div className="d-flex align-items-center gap-2 mb-1 flex-wrap">
                        <span className="badge bg-danger text-white fw-bold rounded-pill px-2.5 py-1" style={{ fontSize: '10px' }}>
                          Live Order #{ord.display_order_number || ord.display_number || ord.id}
                        </span>
                        <span className={`badge rounded-pill px-2.5 py-1 fw-bold ${stBg}`} style={{ fontSize: '10px' }}>
                          {stText}
                        </span>
                        {isPaid ? (
                          <span className="badge rounded-pill px-2 py-0.5 fw-bold bg-success text-white" style={{ fontSize: '10px' }}>PAID</span>
                        ) : (
                          <span className="badge rounded-pill px-2 py-0.5 fw-bold bg-warning text-dark" style={{ fontSize: '10px' }}>UNPAID</span>
                        )}
                        <span className="small text-white opacity-90 fw-semibold" style={{ fontSize: '12px' }}>
                          {formatCompactTableLabel(ord.table) || 'Takeaway'}
                        </span>
                        {totalItemCount > 0 && (
                          <span className="small text-white opacity-80" style={{ fontSize: '11px' }}>
                            • {totalItemCount} {totalItemCount === 1 ? 'item' : 'items'}
                          </span>
                        )}
                      </div>
                      <div className="small text-white-50">
                        {itemsSummary}
                      </div>
                      <div className="small text-white-50">
                        Total: <strong className="text-white">{formatCurrency(ord.total || ord.total_amount)}</strong>
                      </div>
                    </div>

                    <div className="d-flex align-items-center gap-2 flex-wrap ms-auto">
                      <button
                        type="button"
                        onClick={() => navigate(`/customer/order-tracking/${ord.id}`, { state: { order: ord } })}
                        className="btn btn-sm btn-danger rounded-pill px-3.5 py-1.5 fw-bold shadow-sm"
                        style={{ fontSize: '12px' }}
                      >
                        Track Order →
                      </button>

                      {isCompleted ? (
                        <button
                          type="button"
                          onClick={() => handleViewBill(ord)}
                          className="btn btn-sm btn-danger rounded-pill px-3.5 py-1.5 fw-bold shadow-sm d-flex align-items-center gap-1.5"
                          style={{ backgroundColor: 'var(--primary-color, #dc3545)', borderColor: 'var(--primary-color, #dc3545)', fontSize: '12px' }}
                        >
                          <i className="bi bi-receipt"></i>
                          <span>View Bill</span>
                        </button>
                      ) : (
                        <>
                          <button
                            type="button"
                            onClick={() => handleProceedToBill(ord)}
                            disabled={isProcessingThisBill}
                            className="btn btn-sm btn-danger rounded-pill px-3.5 py-1.5 fw-bold shadow-sm"
                            style={{ backgroundColor: 'var(--primary-color, #dc3545)', borderColor: 'var(--primary-color, #dc3545)', fontSize: '12px' }}
                          >
                            {isProcessingThisBill ? 'Processing...' : 'Proceed to Bill'}
                          </button>
                          <button
                            type="button"
                            onClick={() => handleViewBill(ord)}
                            className="btn btn-sm btn-outline-light rounded-pill px-3 py-1.5 fw-bold"
                            style={{ fontSize: '12px' }}
                          >
                            View Bill
                          </button>
                          {ord.orderType !== 'Takeaway' && String(ord.table).toLowerCase() !== 'takeaway' && String(ord.status || '').toUpperCase() !== 'CANCELLED' && !isPaid && (
                            <button
                              type="button"
                              onClick={() => handleContinueOrder(ord)}
                              className="btn btn-sm btn-outline-light rounded-pill px-3 py-1.5 fw-bold d-flex align-items-center gap-1.5"
                              style={{ fontSize: '12px' }}
                            >
                              <i className="bi bi-plus-circle"></i>
                              <span>Continue Order</span>
                            </button>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Sticky Frozen Filter Header Container */}
        <div
          id="customer-menu"
          className="sticky-filter-header mb-4 py-3 px-3 rounded-4 shadow-sm bg-white border border-light-subtle text-start"
          style={{
            position: 'sticky',
            top: '58px',
            zIndex: 1000,
            backdropFilter: 'blur(10px)',
            backgroundColor: 'rgba(255, 255, 255, 0.98)'
          }}
        >
          {/* Section: Search Dishes */}
          <div className="mb-3 w-100">
            <SearchBar
              placeholder={(!products || products.length === 0) ? "No dishes available to search" : "Search dishes (e.g. idli, pizza, burger)..."}
              value={search}
              onChange={(val) => { setSearch(val); setCurrentPage(1); }}
              disabled={!products || products.length === 0}
              records={(products || []).map((dish) => ({
                id: dish.id,
                label: dish.name,
                name: dish.name,
                title: dish.name,
                category: dish.category_name || (typeof dish.category === 'object' ? dish.category?.name : dish.category) || '',
                subtitle: dish.category_name || (typeof dish.category === 'object' ? dish.category?.name : dish.category) || '',
                image: dish.image,
                price: dish.sellingPrice ?? dish.price,
                raw: dish,
              }))}
              onSelectSuggestion={(item) => {
                if (item?.id) navigate(`/customer/food/${item.id}${window.location.search || ''}`);
              }}
              className="w-100"
            />
          </div>

          {/* Section: Browse Categories & Sorting */}
          <div className="d-flex align-items-center justify-content-between flex-wrap gap-2 mb-2">
            <h6 className="fw-bold text-dark mb-0 ms-1" style={{ fontSize: '14px' }}>Browse Categories</h6>

            {filteredDishes && filteredDishes.length > 0 && (
              <select
                value={sortBy}
                onChange={(e) => { setSortBy(e.target.value); setCurrentPage(1); }}
                className="form-select form-select-sm rounded-pill border-light shadow-sm text-secondary fw-semibold px-3 py-1.5 ms-auto"
                style={{ maxWidth: '185px', fontSize: '11px', cursor: 'pointer', backgroundColor: '#f8fafc' }}
                aria-label="Filter and sort options"
              >
                <option value="DEFAULT">Sort: All</option>
                <option value="HIGHEST_DISCOUNT">Highest Discount</option>
                <option value="PRICE_LOW_HIGH">Price: Low to High</option>
                <option value="PRICE_HIGH_LOW">Price: High to Low</option>
              </select>
            )}
          </div>

          <div className="position-relative mb-2 w-100">
            <div
              ref={sliderRef}
              id="customer-category-slider"
              onScroll={checkScroll}
              className="category-slider d-flex flex-nowrap gap-2 overflow-auto pb-1 px-1"
              style={{ scrollBehavior: 'smooth' }}
            >
              {categories.map((cat, idx) => {
                const isChecked = cat === 'All'
                  ? isAllSelected
                  : selectedCategories.includes(cat);
                const catObj = rawCategories.find(c => c.name === cat || normalizeCategoryName(c.name) === normalizeCategoryName(cat));
                const desc = catObj?.description || '';
                return (
                  <button
                    id={`customer-cat-pill-${idx}`}
                    key={cat}
                    type="button"
                    onClick={() => handleToggleCategory(cat)}
                    title={desc ? `${cat}: ${desc}` : cat}
                    className={`btn btn-sm d-flex align-items-center gap-2 rounded-pill px-3 py-2 fw-semibold transition-all ${isChecked ? 'btn-danger text-white shadow-sm' : 'btn-light text-secondary border'
                      }`}
                    style={{ fontSize: '12px', whiteSpace: 'nowrap', flexShrink: 0, cursor: 'pointer' }}
                  >
                    <span className="d-inline-flex align-items-center">{getCategoryIcon(cat)}</span>
                    <span>{cat}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Active Category Description Notice */}
          {activeCategoryDescription && (
            <div className="d-flex align-items-center gap-2 px-3 py-2 mb-2 rounded-3 bg-light border border-light-subtle text-start">
              <span className="badge bg-danger text-white fw-bold rounded-pill px-2.5 py-1 flex-shrink-0" style={{ fontSize: '10px' }}>
                {primarySelectedCategory || `${selectedCategories.length} Categories`}
              </span>
              <span className="text-secondary small fw-medium" style={{ fontSize: '11.5px', lineHeight: '1.4' }}>
                {activeCategoryDescription}
              </span>
            </div>
          )}

          {(products || []).length > 0 && (availableFoodTypes.has('veg') || availableFoodTypes.has('non-veg') || availableFoodTypes.has('vegan')) && (
            <div className="d-flex align-items-center gap-2 flex-wrap px-1 pt-2 border-top border-light-subtle w-100">
              <span className="small fw-semibold text-secondary me-1" style={{ fontSize: '12px' }}>Food Type:</span>

              {availableFoodTypes.has('veg') && (
                <label
                  htmlFor="customer-food-filter-veg"
                  className={`food-type-control food-type-control-veg ${
                    selectedFoodTypes.includes('veg') ? 'is-selected-veg' : ''
                  }`}
                >
                  <input
                    type="checkbox"
                    id="customer-food-filter-veg"
                    checked={selectedFoodTypes.includes('veg')}
                    onChange={() => handleFoodTypeToggle('veg')}
                    className="food-type-checkbox checkbox-veg"
                    aria-label="Filter Vegetarian"
                  />
                  <span className="veg-badge ms-0.5"></span>
                  <span className="ms-0.5">Veg</span>
                </label>
              )}

              {availableFoodTypes.has('non-veg') && (
                <label
                  htmlFor="customer-food-filter-non-veg"
                  className={`food-type-control food-type-control-non-veg ${
                    selectedFoodTypes.includes('non-veg') ? 'is-selected-non-veg' : ''
                  }`}
                >
                  <input
                    type="checkbox"
                    id="customer-food-filter-non-veg"
                    checked={selectedFoodTypes.includes('non-veg')}
                    onChange={() => handleFoodTypeToggle('non-veg')}
                    className="food-type-checkbox checkbox-non-veg"
                    aria-label="Filter Non-Vegetarian"
                  />
                  <span className="non-veg-badge ms-0.5"></span>
                  <span className="ms-0.5">Non-Veg</span>
                </label>
              )}

              {availableFoodTypes.has('vegan') && (
                <label
                  htmlFor="customer-food-filter-vegan"
                  className={`food-type-control food-type-control-vegan ${
                    selectedFoodTypes.includes('vegan') ? 'is-selected-vegan' : ''
                  }`}
                >
                  <input
                    type="checkbox"
                    id="customer-food-filter-vegan"
                    checked={selectedFoodTypes.includes('vegan')}
                    onChange={() => handleFoodTypeToggle('vegan')}
                    className="food-type-checkbox checkbox-vegan"
                    aria-label="Filter Vegan"
                  />
                  <span className="vegan-badge ms-0.5"></span>
                  <span className="ms-0.5">Vegan</span>
                </label>
              )}

              {selectedFoodTypes.length > 0 && (
                <button
                  type="button"
                  onClick={() => setSelectedFoodTypes([])}
                  className="btn btn-link btn-sm text-secondary text-decoration-none p-0 ms-1"
                  style={{ fontSize: '11px' }}
                >
                  Clear filter
                </button>
              )}
            </div>
          )}
        </div>

        {/* Section: Popular Dishes Grid */}
        <div className="mb-4">
          <div className="d-flex align-items-center justify-content-between flex-wrap gap-2 mb-3 px-1">
            <div className="d-flex align-items-center gap-2">
              <h5 className="fw-bold text-dark mb-0">Menu Dishes</h5>
              <span className="text-secondary small fw-semibold">({filteredDishes.length} found)</span>
            </div>
          </div>

          {loading ? (
            <Loader />
          ) : filteredDishes.length === 0 ? (
            <EmptyState
              title="No Dishes Found"
              description="We couldn't find anything matching your filters. Try selecting another category or sort option!"
              icon="bi-emoji-frown"
              buttonText={(sortBy !== 'DEFAULT' || selectedFoodTypes.length > 0) ? "Back to Previous Sort" : undefined}
              onButtonClick={(sortBy !== 'DEFAULT' || selectedFoodTypes.length > 0) ? () => { setSortBy('DEFAULT'); setSelectedFoodTypes([]); } : undefined}
            />
          ) : (
            <>
              <div className="row g-3">
                {paginatedDishes.map((dish) => (
                  <div key={dish.id} className="col-12 col-sm-6 col-md-4 col-lg-3">
                    <FoodCard dish={dish} />
                  </div>
                ))}
              </div>

              {/* Pagination Component */}
              <Pagination
                currentPage={currentPage}
                totalPages={totalPages}
                onPageChange={(page) => {
                  setCurrentPage(page);
                  window.scrollTo({ top: 300, behavior: 'smooth' });
                }}
              />
            </>
          )}
        </div>
      </main>
      <OrderTypeModal isOpen={showOrderTypeModal} onSelectType={handleSelectOrderType} dineInAvailable />
      {viewingBillOrder && (
        <EBillModal
          isOpen={!!viewingBillOrder}
          order={viewingBillOrder}
          onClose={() => setViewingBillOrder(null)}
          onProceedToBill={handleProceedToBill}
        />
      )}
    </CustomerLayout>
  );
};

export default Home;
