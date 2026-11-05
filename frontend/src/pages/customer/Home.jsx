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
  FiGrid, FiHeart, FiLayers, FiZap, FiActivity, FiCoffee, FiStar, FiPercent,
  FiChevronLeft, FiChevronRight
} from 'react-icons/fi';
import { FaBurger, FaPizzaSlice, FaBowlRice, FaUtensils, FaMugHot, FaIceCream } from 'react-icons/fa6';
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
    if (tableParam) {
      const canon = tableService.getCanonicalTableNumber(tableParam);
      setTable({ tableNumber: canon, tableId: canon, diners: 2 });
    }
    // setTable is recreated on every provider render; depending on it would loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tableParam]);

  const [selectedCategories, setSelectedCategories] = useState(['All']);
  const [search, setSearch] = useState(() => searchParams.get('search') || '');

  useEffect(() => {
    const query = searchParams.get('search');
    if (query !== null) {
      setSearch(query);
    }
  }, [searchParams]);

  useEffect(() => {
    const handleCustomerSearch = (e) => {
      const q = e?.detail?.query !== undefined ? e.detail.query : '';
      setSearch(q);
      setCurrentPage(1);
    };
    window.addEventListener('foodie_customer_search', handleCustomerSearch);
    return () => {
      window.removeEventListener('foodie_customer_search', handleCustomerSearch);
    };
  }, []);
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

  const handleSelectOrderType = (type, chosenTable) => {
    setShowOrderTypeModal(false);
    setOrderType(type);
    if (type === 'DINE_IN') {
      if (chosenTable) {
        const tableNum = chosenTable.table_number || chosenTable.number || chosenTable.id;
        const cleanTableNum = String(tableNum).startsWith('T') ? String(tableNum) : `T${tableNum}`;
        const tableId = chosenTable.id;
        setTable({ 
          tableNumber: cleanTableNum, 
          tableId: tableId, 
          id: tableId,
          orderType: 'DINE_IN',
          location: chosenTable.location,
          capacity: chosenTable.capacity
        });
        sessionStorage.setItem('foodie_selected_table', String(tableId));
        localStorage.setItem('foodie_selected_table', String(tableId));
        sessionStorage.setItem('foodie_table_number', String(cleanTableNum));
        localStorage.setItem('foodie_table_number', String(cleanTableNum));
        sessionStorage.setItem('foodie_order_type', 'DINE_IN');
        localStorage.setItem('foodie_order_type', 'DINE_IN');
      }
    } else if (type === 'TAKEAWAY') {
      setTable({ tableNumber: 'Takeaway', tableId: 'Takeaway', orderType: 'TAKEAWAY' });
      sessionStorage.setItem('foodie_order_type', 'TAKEAWAY');
      localStorage.setItem('foodie_order_type', 'TAKEAWAY');
    }
  };

  const isAllSelected = selectedCategories.includes('All') || selectedCategories.length === 0;

  const handleToggleCategory = (cat) => {
    setCurrentPage(1);
    if (cat === 'All') {
      setSelectedCategories(['All']);
      return;
    }
    setSelectedCategories((prev) => {
      const active = prev.filter((c) => c !== 'All');
      if (active.includes(cat)) {
        const next = active.filter((c) => c !== cat);
        return next.length === 0 ? ['All'] : next;
      } else {
        return [...active, cat];
      }
    });
  };

  const [showCategoryDesc, setShowCategoryDesc] = useState(true);

  // Auto-hide category description after ~1 minute (60s) on mobile, reset when category changes
  useEffect(() => {
    setShowCategoryDesc(true);
    const timer = setTimeout(() => {
      // Only auto-hide on mobile screens (< 768px)
      if (typeof window !== 'undefined' && window.innerWidth < 768) {
        setShowCategoryDesc(false);
      }
    }, 60000);
    return () => clearTimeout(timer);
  }, [selectedCategories]);

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

        const savedOrderId = sessionStorage.getItem('foodie_parent_order_id') || localStorage.getItem('foodie_parent_order_id') ||
          (() => {
            try {
              const lp = JSON.parse(sessionStorage.getItem('foodie_last_placed_order') || localStorage.getItem('foodie_last_placed_order') || 'null');
              return lp?.id || lp?.order_id || null;
            } catch { return null; }
          })();

        if (savedOrderId && !activeList.some(o => String(o.id) === String(savedOrderId) || String(o.order_id) === String(savedOrderId))) {
          try {
            const { fetchCustomerOrder } = await import('../../services/customerCheckout');
            const fetched = await fetchCustomerOrder(savedOrderId);
            if (fetched && isOrderLive(fetched)) {
              activeList.unshift(mapOrder(fetched));
            }
          } catch (e) {
            // ignore if not found
          }
        }

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
    setCurrentPage(1);
    if (type === 'all') {
      setSelectedFoodTypes([]);
      return;
    }
    setSelectedFoodTypes((prev) => {
      if (prev.includes(type)) {
        return prev.filter((t) => t !== type);
      } else {
        return [...prev, type];
      }
    });
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

    const phone = ord.customer_phone || ord.customerPhone || ord.phone;
    if (phone) {
      sessionStorage.setItem('customer_mobile', String(phone));
      localStorage.setItem('customer_mobile', String(phone));
    }
    const name = ord.customer_name || ord.customerName;
    if (name && typeof name === 'string') {
      sessionStorage.setItem('customer_name', String(name));
      localStorage.setItem('customer_name', String(name));
    }

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
    if (norm === 'all') return <FiGrid size={13} />;
    if (norm === 'popular') return <FiStar size={13} />;
    if (norm.includes('discount') || norm.includes('offer')) return <FiPercent size={13} />;
    if (norm.includes('burger')) return <FaBurger size={13} />;
    if (norm.includes('pizza')) return <FaPizzaSlice size={13} />;
    if (norm.includes('biryani') || norm.includes('rice')) return <FaBowlRice size={13} />;
    if (norm.includes('indian') || norm.includes('meal') || norm.includes('thali') || norm.includes('combo') || norm.includes('breakfast')) return <FaUtensils size={13} />;
    if (norm.includes('starter') || norm.includes('snack') || norm.includes('appetizer') || norm.includes('fry') || norm.includes('fries') || norm.includes('roll')) return <FaUtensils size={13} />;
    if (norm.includes('dessert') || norm.includes('sweet') || norm.includes('cake') || norm.includes('ice cream') || norm.includes('pastry')) return <FaIceCream size={13} />;
    if (norm.includes('beverage') || norm.includes('drink') || norm.includes('coffee') || norm.includes('tea') || norm.includes('juice') || norm.includes('shake') || norm.includes('soda') || norm.includes('mocktail')) return <FaMugHot size={13} />;
    if (norm.includes('pasta') || norm.includes('noodle') || norm.includes('chinese') || norm.includes('asian') || norm.includes('momo')) return <FaBowlRice size={13} />;
    if (norm.includes('soup') || norm.includes('salad')) return <FiHeart size={13} />;
    return <FiGrid size={13} />;
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
          <EmptyState
            title="No Dishes Found"
            description="We couldn't find any dishes available on the menu."
            icon="bi-emoji-frown"
          />
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
                        className="btn btn-sm btn-danger rounded-pill px-3 py-1.5 fw-bold shadow-sm"
                        style={{ fontSize: '12px' }}
                      >
                        Track Order →
                      </button>

                      <button
                        type="button"
                        onClick={() => handleViewBill(ord)}
                        className={`btn btn-sm ${isCompleted ? 'btn-danger' : 'btn-outline-light'} rounded-pill px-3 py-1.5 fw-bold d-flex align-items-center gap-1.5 shadow-sm`}
                        style={{
                          fontSize: '12px',
                          ...(isCompleted ? { backgroundColor: 'var(--primary-color, #dc3545)', borderColor: 'var(--primary-color, #dc3545)' } : {})
                        }}
                      >
                        <i className="bi bi-receipt me-1"></i>
                        <span>View Bill</span>
                      </button>

                      {!isPaid && (
                        <>
                          <button
                            type="button"
                            onClick={() => handleContinueOrder(ord)}
                            className="btn btn-sm btn-outline-light rounded-pill px-3 py-1.5 fw-bold d-flex align-items-center gap-1.5"
                            style={{ fontSize: '12px' }}
                          >
                            <i className="bi bi-plus-circle me-1"></i>
                            <span>Order Again</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => navigate(`/customer/payment?order=${ord.id}`)}
                            className="btn btn-sm btn-success rounded-pill px-3.5 py-1.5 fw-bold shadow-sm d-flex align-items-center gap-1.5"
                            style={{ fontSize: '12px' }}
                          >
                            <i className="bi bi-credit-card me-1"></i>
                            <span>Proceed to Bill</span>
                          </button>
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
          className="sticky-filter-header mb-4 py-2.5 px-3 rounded-4 shadow-sm bg-white border border-light-subtle text-start"
          style={{
            position: 'sticky',
            top: '52px',
            zIndex: 990,
            backdropFilter: 'blur(10px)',
            backgroundColor: 'rgba(255, 255, 255, 0.98)'
          }}
        >

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

          {/* Active Category Description Notice (auto-hides after ~1 min on mobile) */}
          {activeCategoryDescription && showCategoryDesc && (
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

              {/* All Food Types Pill (Icon Only, Checkbox Toggle) */}
              <button
                type="button"
                id="customer-food-filter-all"
                onClick={() => handleFoodTypeToggle('all')}
                className={`btn btn-sm rounded-circle p-0 d-inline-flex align-items-center justify-content-center transition-all ${
                  selectedFoodTypes.length === 0
                    ? 'btn-danger text-white shadow-xs'
                    : 'btn-outline-secondary bg-white text-secondary'
                }`}
                style={{ width: '32px', height: '32px' }}
                title="All Food Types"
                aria-label="All Food Types"
              >
                <FiGrid size={15} />
              </button>

              {availableFoodTypes.has('veg') && (
                <button
                  type="button"
                  id="customer-food-filter-veg"
                  onClick={() => handleFoodTypeToggle('veg')}
                  className={`btn btn-sm rounded-circle p-0 d-inline-flex align-items-center justify-content-center transition-all ${
                    selectedFoodTypes.includes('veg')
                      ? 'btn-success text-white shadow-xs'
                      : 'btn-outline-success bg-white text-success'
                  }`}
                  style={{ width: '32px', height: '32px' }}
                  title="Vegetarian"
                  aria-label="Vegetarian"
                >
                  <span className="veg-badge" style={{ width: '15px', height: '15px' }}></span>
                </button>
              )}

              {availableFoodTypes.has('non-veg') && (
                <button
                  type="button"
                  id="customer-food-filter-non-veg"
                  onClick={() => handleFoodTypeToggle('non-veg')}
                  className={`btn btn-sm rounded-circle p-0 d-inline-flex align-items-center justify-content-center transition-all ${
                    selectedFoodTypes.includes('non-veg')
                      ? 'btn-danger text-white shadow-xs'
                      : 'btn-outline-danger bg-white text-danger'
                  }`}
                  style={{ width: '32px', height: '32px' }}
                  title="Non-Vegetarian"
                  aria-label="Non-Vegetarian"
                >
                  <span className="non-veg-badge" style={{ width: '15px', height: '15px' }}></span>
                </button>
              )}

              {availableFoodTypes.has('vegan') && (
                <button
                  type="button"
                  id="customer-food-filter-vegan"
                  onClick={() => handleFoodTypeToggle('vegan')}
                  className={`btn btn-sm rounded-circle p-0 d-inline-flex align-items-center justify-content-center transition-all ${
                    selectedFoodTypes.includes('vegan')
                      ? 'btn-success text-white shadow-xs'
                      : 'btn-outline-success bg-white text-success'
                  }`}
                  style={{ width: '32px', height: '32px' }}
                  title="Vegan"
                  aria-label="Vegan"
                >
                  <span className="vegan-badge" style={{ width: '15px', height: '15px' }}></span>
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
