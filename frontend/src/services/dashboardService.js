import api from './api';
import { orderService } from './orderService';

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

export const dashboardService = {
  getRevenueDetails: async (period = 'Weekly', ordersArray = null) => {
    let allOrders = [];
    if (Array.isArray(ordersArray)) {
      allOrders = ordersArray;
    } else {
      try {
        allOrders = await orderService.getAllOrders(true);
      } catch (e) {
        allOrders = [];
      }
    }

    let revenuePeriod = "Weekly Revenue Distribution";
    let revenueAmount = 0;
    let comparison = "vs last week";
    let previousPeriodAmount = 0;
    let percentageChange = "+0.0%";
    let revenueData = [];

    // Helper for grouping and filtering successful/non-cancelled orders
    const getOrderNetRevenue = (o) => {
      const gross = getOrderAmount(o);
      const refunded = parseSafeAmount(o.refunded_amount || o.refundedAmount || 0);
      return Math.max(0, gross - refunded);
    };

    const successfulOrders = allOrders.filter(o => {
      const payStatus = (o.payment_status || o.paymentStatus || '').toUpperCase();
      const orderStatus = (o.status || o.order_status || '').toUpperCase();
      return payStatus !== 'FAILED' && orderStatus !== 'CANCELLED' && orderStatus !== 'REJECTED';
    });

    const norm = String(period || '').trim().toLowerCase();

    // Determine target mode: hourly, daily, weekly, or monthly
    let mode = 'weekly';
    if (norm.includes('hour') || norm === 'today') {
      mode = 'hourly';
    } else if (norm.includes('dai') || norm.includes('day')) {
      mode = 'daily';
    } else if (norm.includes('month (week)')) {
      mode = 'weekly';
    } else if (norm.includes('month')) {
      mode = 'monthly';
    } else if (norm.includes('week')) {
      mode = 'weekly';
    }

    if (mode === 'hourly') {
      revenuePeriod = "Hourly Revenue Distribution";
      const slots = [
        { label: '8 AM', fullName: '8 AM' },
        { label: '10 AM', fullName: '10 AM' },
        { label: '12 PM', fullName: '12 PM' },
        { label: '2 PM', fullName: '2 PM' },
        { label: '4 PM', fullName: '4 PM' },
        { label: '6 PM', fullName: '6 PM' },
        { label: '8 PM', fullName: '8 PM' },
        { label: '10 PM', fullName: '10 PM' }
      ];

      revenueData = slots.map(s => ({
        label: s.label,
        fullName: s.fullName,
        value: 0,
        sales: 0,
        count: 0
      }));

      successfulOrders.forEach(o => {
        const orderDate = getOrderDate(o);
        const hr = orderDate.getHours();
        let slotIdx = Math.floor((hr - 8) / 2);
        if (slotIdx < 0) slotIdx = 0;
        if (slotIdx >= slots.length) slotIdx = slots.length - 1;
        const val = getOrderNetRevenue(o);
        revenueData[slotIdx].value += val;
        revenueData[slotIdx].sales += val;
        revenueData[slotIdx].count += 1;
      });

      revenueAmount = revenueData.reduce((sum, d) => sum + d.sales, 0);
      comparison = "vs previous hours";
    } else if (mode === 'daily') {
      revenuePeriod = "Daily Revenue Distribution";
      const days = [
        { label: 'Mon', fullName: 'Monday', dayIndex: 1 },
        { label: 'Tue', fullName: 'Tuesday', dayIndex: 2 },
        { label: 'Wed', fullName: 'Wednesday', dayIndex: 3 },
        { label: 'Thu', fullName: 'Thursday', dayIndex: 4 },
        { label: 'Fri', fullName: 'Friday', dayIndex: 5 },
        { label: 'Sat', fullName: 'Saturday', dayIndex: 6 },
        { label: 'Sun', fullName: 'Sunday', dayIndex: 0 }
      ];

      revenueData = days.map(d => ({
        label: d.label,
        fullName: d.fullName,
        dayIndex: d.dayIndex,
        value: 0,
        sales: 0,
        count: 0
      }));

      successfulOrders.forEach(o => {
        const orderDate = getOrderDate(o);
        const day = orderDate.getDay();
        const target = revenueData.find(d => d.dayIndex === day);
        const val = getOrderNetRevenue(o);
        if (target) {
          target.value += val;
          target.sales += val;
          target.count += 1;
        }
      });

      revenueAmount = revenueData.reduce((sum, d) => sum + d.sales, 0);
      comparison = "vs previous days";
    } else if (mode === 'monthly') {
      revenuePeriod = "Monthly Revenue Distribution";
      const months = [
        { label: 'Jan', fullName: 'January', monthIndex: 0 },
        { label: 'Feb', fullName: 'February', monthIndex: 1 },
        { label: 'Mar', fullName: 'March', monthIndex: 2 },
        { label: 'Apr', fullName: 'April', monthIndex: 3 },
        { label: 'May', fullName: 'May', monthIndex: 4 },
        { label: 'Jun', fullName: 'June', monthIndex: 5 },
        { label: 'Jul', fullName: 'July', monthIndex: 6 },
        { label: 'Aug', fullName: 'August', monthIndex: 7 },
        { label: 'Sep', fullName: 'September', monthIndex: 8 },
        { label: 'Oct', fullName: 'October', monthIndex: 9 },
        { label: 'Nov', fullName: 'November', monthIndex: 10 },
        { label: 'Dec', fullName: 'December', monthIndex: 11 }
      ];

      revenueData = months.map(m => ({
        label: m.label,
        fullName: m.fullName,
        monthIndex: m.monthIndex,
        value: 0,
        sales: 0,
        count: 0
      }));

      successfulOrders.forEach(o => {
        const orderDate = getOrderDate(o);
        const m = orderDate.getMonth();
        const val = getOrderNetRevenue(o);
        if (revenueData[m]) {
          revenueData[m].value += val;
          revenueData[m].sales += val;
          revenueData[m].count += 1;
        }
      });

      revenueAmount = revenueData.reduce((sum, d) => sum + d.sales, 0);
      comparison = "vs last month";
    } else {
      // Default: Weekly
      revenuePeriod = "Weekly Revenue Distribution";
      const weeks = [
        { label: 'Week 1', fullName: 'Week 1' },
        { label: 'Week 2', fullName: 'Week 2' },
        { label: 'Week 3', fullName: 'Week 3' },
        { label: 'Week 4', fullName: 'Week 4' }
      ];

      revenueData = weeks.map(w => ({
        label: w.label,
        fullName: w.fullName,
        value: 0,
        sales: 0,
        count: 0
      }));

      successfulOrders.forEach(o => {
        const orderDate = getOrderDate(o);
        const dayOfMonth = orderDate.getDate();
        const weekIdx = Math.min(3, Math.floor((dayOfMonth - 1) / 7));
        const val = getOrderNetRevenue(o);
        revenueData[weekIdx].value += val;
        revenueData[weekIdx].sales += val;
        revenueData[weekIdx].count += 1;
      });

      revenueAmount = revenueData.reduce((sum, d) => sum + d.sales, 0);
      comparison = "vs last week";
    }

    // Exact Rounding
    revenueAmount = Math.round(revenueAmount);
    previousPeriodAmount = Math.round(previousPeriodAmount);
    revenueData = revenueData.map(d => ({
      ...d,
      value: Math.round(d.value || d.sales || 0),
      sales: Math.round(d.sales || d.value || 0)
    }));

    // Real percentage change calculation
    if (previousPeriodAmount > 0) {
      const pct = ((revenueAmount - previousPeriodAmount) / previousPeriodAmount) * 100;
      percentageChange = (pct >= 0 ? "+" : "") + pct.toFixed(1) + "%";
    } else if (revenueAmount > 0) {
      percentageChange = "+100%";
    } else {
      percentageChange = "+0.0%";
    }

    return {
      revenuePeriod,
      revenueAmount,
      comparison,
      previousPeriod: previousPeriodAmount,
      percentageChange,
      revenueData
    };
  }
};

export default dashboardService;
