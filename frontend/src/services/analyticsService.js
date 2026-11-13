import api from './api';
import { orderService } from './orderService';
import { tableService } from './tableService';

const _extractArr = (res) => {
  if (!res) return [];
  const payload = res?.data?.data;
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(res?.data)) return res.data;
  if (res?.data?.results && Array.isArray(res.data.results)) return res.data.results;
  return [];
};

const _isValidNumericId = (id) => {
  if (id === undefined || id === null) return false;
  const s = String(id).trim();
  if (s === '' || s === 'undefined' || s === 'null' || s === 'NaN') return false;
  const n = Number(s);
  return !Number.isNaN(n) && Number.isFinite(n);
};

const parseSafeAmount = (val) => {
  if (typeof val === 'number') return isNaN(val) ? 0 : val;
  if (!val) return 0;
  const cleaned = String(val).replace(/[^0-9.-]+/g, '');
  const num = parseFloat(cleaned);
  return isNaN(num) ? 0 : num;
};

const getOrderAmount = (o) => {
  if (!o) return 0;
  const directTotal = parseSafeAmount(o.total ?? o.total_amount ?? o.totalAmount ?? o.amount);
  if (directTotal > 0) return directTotal;

  if (Array.isArray(o.items) && o.items.length > 0) {
    const itemsSum = o.items.reduce((sum, i) => {
      const p = parseSafeAmount(i.price || i.unit_price || 0);
      const q = parseInt(i.quantity, 10) || 1;
      return sum + (p * q);
    }, 0);
    if (itemsSum > 0) {
      const discount = parseSafeAmount(o.discount);
      const taxable = Math.max(0, itemsSum - discount);
      const tax = parseSafeAmount(o.tax) || Math.round(taxable * 0.05);
      const delivery = parseSafeAmount(o.deliveryFee || o.delivery_fee);
      return Math.max(0, taxable + tax + delivery);
    }
  }

  const sub = parseSafeAmount(o.subtotal);
  if (sub > 0) {
    const discount = parseSafeAmount(o.discount);
    const taxable = Math.max(0, sub - discount);
    const tax = parseSafeAmount(o.tax) || Math.round(taxable * 0.05);
    return Math.max(0, taxable + tax);
  }

  return 0;
};

const getOrderDate = (o) => {
  if (!o) return new Date();
  if (o.created_at || o.createdAt) {
    const d = new Date(o.created_at || o.createdAt);
    if (!isNaN(d.getTime())) return d;
  }
  if (o.rawCreatedAt) {
    const d = new Date(Number(o.rawCreatedAt));
    if (!isNaN(d.getTime())) return d;
  }
  if (o.placedAt) {
    const d = new Date(Number(o.placedAt));
    if (!isNaN(d.getTime())) return d;
  }
  if (o.date) {
    const timeStr = o.time || '12:00';
    const d = new Date(`${o.date} ${timeStr}`);
    if (!isNaN(d.getTime())) return d;
  }
  return new Date();
};

export const analyticsService = {
  getDashboardBundle: async (options = {}) => {
    const { isStaffScreen } = await import('./adminApi');
    const staff = isStaffScreen();
    let staffFoods = [];
    if (staff) {
      try {
        const { listFoods } = await import('./adminApi');
        staffFoods = await listFoods().catch(() => []);
      } catch (e) {}
    }
    const [allOrdersRaw, allTablesRaw, foodRes, usersRes] = await Promise.all([
      orderService.getAllOrders(true, options).catch(() => []),
      tableService.getTables().catch(() => []),
      staff ? Promise.resolve({ data: staffFoods }) : api.get('/foods/').catch(() => ({ data: [] })),
      staff ? Promise.resolve({ data: [] }) : api.get('/users/users/').catch(() => ({ data: [] }))
    ]);

    const allOrders = Array.isArray(allOrdersRaw) ? allOrdersRaw : [];
    const allTables = Array.isArray(allTablesRaw) ? allTablesRaw : [];
    const allFood = _extractArr(foodRes);

    const now = new Date();
    const todayStr = now.toDateString();
    const curMonth = now.getMonth();
    const curYear = now.getFullYear();

    const getOrderNetRevenue = (o) => {
      const gross = getOrderAmount(o);
      const refunded = parseSafeAmount(o.refunded_amount || o.refundedAmount || 0);
      return Math.max(0, gross - refunded);
    };

    // Helper: Valid, non-failed, non-cancelled orders
    const validOrders = allOrders.filter(o => {
      const payStatus = (o.payment_status || o.paymentStatus || '').toUpperCase();
      const orderStatus = (o.status || o.order_status || '').toUpperCase();
      return payStatus !== 'FAILED' && orderStatus !== 'CANCELLED' && orderStatus !== 'REJECTED';
    });

    // Summary calculations
    const todayOrders = validOrders.filter(o => getOrderDate(o).toDateString() === todayStr);
    const todayRevenue = todayOrders.reduce((sum, o) => sum + getOrderNetRevenue(o), 0);

    const monthlyOrders = validOrders.filter(o => {
      const d = getOrderDate(o);
      return d.getMonth() === curMonth && d.getFullYear() === curYear;
    });
    const monthlyRevenue = monthlyOrders.reduce((sum, o) => sum + getOrderNetRevenue(o), 0);

    const curQuarter = Math.floor(now.getMonth() / 3);
    const quarterlyOrders = validOrders.filter(o => {
      const d = getOrderDate(o);
      return Math.floor(d.getMonth() / 3) === curQuarter && d.getFullYear() === curYear;
    });
    const quarterlyRevenue = quarterlyOrders.reduce((sum, o) => sum + getOrderNetRevenue(o), 0);

    const yearlyOrders = validOrders.filter(o => getOrderDate(o).getFullYear() === curYear);
    const yearlyRevenue = yearlyOrders.reduce((sum, o) => sum + getOrderNetRevenue(o), 0);

    // Pending orders: exactly matching Pending tab in /admin/orders and New Tickets in Kitchen
    const isPendingStatus = (st) => {
      const s = String(st || '').toLowerCase().trim();
      return s === 'pending' || s === 'confirmed' || s === 'placed' || s === 'new' || s === 'ordered' || s === 'created' || !s;
    };
    const pendingOrders = allOrders.filter(o => isPendingStatus(o.status)).length;

    // Active / In Progress orders: Preparing, Ready, Serving, etc.
    const isInProgressStatus = (st) => {
      const s = String(st || '').toLowerCase().trim();
      return s === 'preparing' || s === 'ready' || s === 'serving' || s === 'served' || s === 'cooking' || s === 'accepted' || s === 'in_kitchen' || s === 'out_for_delivery';
    };
    const activeOrders = allOrders.filter(o => isInProgressStatus(o.status)).length;

    // Available tables: synchronized directly with tableService.getTables() from Tables page
    const availableTables = (allTables || []).filter(t => {
      const s = String(t.status || '').trim().toLowerCase();
      return s === 'available' || t.isAvailable === true || t.is_available === true;
    }).length;

    const totalRevenue = validOrders.reduce((sum, o) => sum + getOrderNetRevenue(o), 0);

    const summary = {
      totalRevenue: Math.round(totalRevenue),
      todayRevenue: Math.round(todayRevenue),
      monthlyRevenue: Math.round(monthlyRevenue),
      quarterlyRevenue: Math.round(quarterlyRevenue),
      yearlyRevenue: Math.round(yearlyRevenue),
      pendingOrders,
      activeOrders,
      availableTables,
      totalTables: (allTables || []).length
    };

    // Helper to extract numeric millisecond timestamp from order
    const getOrderTimestamp = (o) => {
      if (o.statusUpdatedAt && Number(o.statusUpdatedAt) > 0) return Number(o.statusUpdatedAt);
      if (o.rawCreatedAt && Number(o.rawCreatedAt) > 0) return Number(o.rawCreatedAt);
      if (o.placedAt && Number(o.placedAt) > 0) return Number(o.placedAt);
      if (o.created_at || o.createdAt) {
        const p = new Date(o.created_at || o.createdAt).getTime();
        if (!isNaN(p) && p > 0) return p;
      }
      if (o.date && o.time) {
        const p = new Date(`${o.date} ${o.time}`).getTime();
        if (!isNaN(p) && p > 0) return p;
      }
      return 0;
    };

    // Format human-friendly time based on actual customer order timestamp
    const formatOrderActivityTime = (order, actTime) => {
      const nowMs = now.getTime();
      const diffMs = Math.max(0, nowMs - actTime);
      const minsDiff = Math.round(diffMs / 60000);

      if (minsDiff <= 1) {
        return 'Just now';
      }
      if (minsDiff < 60) {
        return `${minsDiff} mins ago`;
      }

      const orderDate = new Date(actTime);
      const isToday = orderDate.toDateString() === now.toDateString();

      const timeStr = order.time || orderDate.toLocaleTimeString('en-IN', {
        hour: 'numeric',
        minute: '2-digit',
        hour12: true
      });

      if (isToday) {
        const hoursDiff = Math.floor(minsDiff / 60);
        return hoursDiff <= 3 ? `${hoursDiff}h ago` : `Today, ${timeStr}`;
      }

      const yesterday = new Date(now);
      yesterday.setDate(now.getDate() - 1);
      if (orderDate.toDateString() === yesterday.toDateString()) {
        return `Yesterday, ${timeStr}`;
      }

      const dateStr = order.date || orderDate.toLocaleDateString('en-IN', {
        day: 'numeric',
        month: 'short'
      });
      return `${dateStr}, ${timeStr}`;
    };

    // Recent Activities calculations (sorted by latest activity / creation timestamp)
    const sortedOrders = [...(allOrders || [])]
      .sort((a, b) => getOrderTimestamp(b) - getOrderTimestamp(a))
      .slice(0, 6);

    const activities = sortedOrders.map(order => {
      const orderId = order.id || order.order_id;
      
      const rawTable = order.table || order.table_number || order.tableNumber;
      let tableName = 'Takeaway';
      if (rawTable) {
        let s = typeof rawTable === 'object' ? (rawTable.number || rawTable.table_number || rawTable.name || '') : String(rawTable);
        s = String(s).trim();
        if (s.toLowerCase().includes('takeaway')) {
          tableName = 'Takeaway';
        } else {
          const digits = s.replace(/\D/g, '');
          tableName = digits ? `T${digits.padStart(2, '0')}` : (s || 'Takeaway');
        }
      }
      
      const actTime = getOrderTimestamp(order) || Date.now();
      const timeAgo = formatOrderActivityTime(order, actTime);

      const status = order.status || 'Pending';
      let message = `Order #${orderId} (${tableName}) was placed`;
      if (status === 'Preparing') {
        message = `Order #${orderId} (${tableName}) is being prepared`;
      } else if (status === 'Ready') {
        message = `Order #${orderId} (${tableName}) is ready for pickup`;
      } else if (status === 'Completed') {
        message = `Order #${orderId} (${tableName}) was served & completed`;
      } else if (status === 'Cancelled') {
        message = `Order #${orderId} (${tableName}) was cancelled`;
      }

      return {
        id: `${orderId}-${status}-${actTime}`,
        orderId: orderId,
        type: 'Order',
        message: message,
        time: timeAgo,
        amount: Math.round(getOrderAmount(order)),
        status: status,
        table: tableName
      };
    });

    // Top Selling Dishes aggregated from actual orders
    const dishCounts = {};
    const dishNames = {};
    const dishImages = {};

    (allOrders || []).forEach(o => {
      if ((o.status || '').toUpperCase() === 'CANCELLED') return;
      (o.items || []).forEach(item => {
        const foodName = (item.name || item.food_name || '').trim();
        const foodId = item.id || item.food_item || item.foodId || item.food;
        const qty = parseInt(item.quantity || 1, 10);
        // Use normalized name for grouping if available, else stringified ID
        const key = foodName ? foodName.toLowerCase() : (foodId ? String(foodId) : null);

        if (key) {
          dishCounts[key] = (dishCounts[key] || 0) + qty;
          if (foodName && !dishNames[key]) dishNames[key] = foodName;
          if (item.image && !dishImages[key]) dishImages[key] = item.image;
        }
      });
    });

    const topDishKeys = Object.keys(dishCounts)
      .filter(k => dishCounts[k] > 0)
      .sort((a, b) => dishCounts[b] - dishCounts[a])
      .slice(0, 5);

    const topDishes = topDishKeys.map(key => {
      const foodId = parseInt(key, 10);
      const foodObj = (allFood || []).find(f => Number(f.id || f.food_id) === foodId) 
        || (allFood || []).find(f => String(f.name || '').trim().toLowerCase() === String(key).trim().toLowerCase());
      const name = foodObj ? foodObj.name : (dishNames[key] || `Item ${key}`);

      let foodImg = null;
      if (foodObj) {
        if (foodObj.image && typeof foodObj.image === 'string') {
          foodImg = foodObj.image;
        } else if (foodObj.primary_image && typeof foodObj.primary_image === 'string') {
          foodImg = foodObj.primary_image;
        } else if (Array.isArray(foodObj.images) && foodObj.images.length > 0) {
          const p = foodObj.images.find(i => typeof i === 'object' && i.is_primary) || foodObj.images[0];
          foodImg = typeof p === 'string' ? p : (p?.image_url || p?.image || p?.image_path || p?.url);
        } else {
          foodImg = foodObj.image_url || foodObj.img || null;
        }
      }

      if (!foodImg && dishImages[key]) {
        foodImg = dishImages[key];
      }

      return {
        id: isNaN(foodId) ? key : foodId,
        name: name,
        count: dishCounts[key],
        image: foodImg || ''
      };
    });

    // Business Performance metrics synchronized with the qualifying orders in range
    const customersCount = validOrders.length > 0
      ? new Set(validOrders.map(o => o.user || o.customerPhone || o.customer_phone || o.phone || o.placedById || o.id).filter(Boolean)).size || validOrders.length
      : 0;
    const ordersCount = validOrders.length;
    const avgOrderValue = ordersCount > 0 ? Math.round(totalRevenue / ordersCount) : 0;

    const businessStats = {
      customersCount,
      ordersCount,
      avgOrderValue
    };

    return { summary, activities, topDishes, businessStats, allOrders };
  },

  getDashboardSummary: async () => {
    const bundle = await analyticsService.getDashboardBundle();
    return bundle.summary;
  }
};

export default analyticsService;
