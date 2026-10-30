import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import AdminLayout from '../../components/layout/AdminLayout';
import PageHeader from '../../components/layout/PageHeader';
import StatCard from '../../components/dashboard/StatCard';
import RevenueChart from '../../components/dashboard/RevenueChart';
import BusinessData from '../../components/dashboard/BusinessData';
import RecentActivity from '../../components/dashboard/RecentActivity';
import TopDishes from '../../components/dashboard/TopDishes';
import Loader from '../../components/common/Loader';
import { analyticsService } from '../../services/analyticsService';
import { dashboardService } from '../../services/dashboardService';
import { FiTrendingUp, FiShoppingBag, FiLayers, FiAlertCircle } from 'react-icons/fi';
import formatCurrency from '../../utils/formatCurrency';

export const Dashboard = () => {
  const navigate = useNavigate();
  const [summary, setSummary] = useState(null);
  const [revenue, setRevenue] = useState([]);
  const [activities, setActivities] = useState([]);
  const [topDishes, setTopDishes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedPeriod, setSelectedPeriod] = useState('Weekly');
  const [revenueDetails, setRevenueDetails] = useState({
    revenuePeriod: "Weekly Revenue",
    revenueAmount: 0,
    comparison: "vs last week",
    percentageChange: "+0.0%",
    revenueData: []
  });

  const [businessStats, setBusinessStats] = useState(null);

  const cachedOrdersRef = React.useRef(null);
  const selectedPeriodRef = React.useRef(selectedPeriod);
  const syncDebounceTimerRef = React.useRef(null);
  const isFetchingRef = React.useRef(false);

  useEffect(() => {
    selectedPeriodRef.current = selectedPeriod;
  }, [selectedPeriod]);

  const fetchAnalytics = useCallback(async (isInitial = true) => {
    if (isFetchingRef.current && !isInitial) return;
    isFetchingRef.current = true;
    if (isInitial) setLoading(true);
    try {
      const bundle = await analyticsService.getDashboardBundle();
      cachedOrdersRef.current = bundle.allOrders || null;
      let details = {
        revenuePeriod: "Weekly Revenue",
        revenueAmount: 0,
        comparison: "vs last week",
        percentageChange: "+0.0%",
        revenueData: []
      };
      try {
        details = await dashboardService.getRevenueDetails(selectedPeriodRef.current, bundle.allOrders);
      } catch (revErr) {
        console.warn("Revenue details calculation error:", revErr);
      }
      setSummary(bundle.summary || {
        totalRevenue: 0,
        todayRevenue: 0,
        monthlyRevenue: 0,
        quarterlyRevenue: 0,
        yearlyRevenue: 0,
        pendingOrders: 0,
        activeOrders: 0,
        availableTables: 0
      });
      setActivities(bundle.activities || []);
      setTopDishes(bundle.topDishes || []);
      setBusinessStats(bundle.businessStats || { customersCount: 0, ordersCount: 0, avgOrderValue: 0 });
      setRevenueDetails(details);
      setRevenue(details.revenueData || []);
    } catch (e) {
      console.error("Error loading dashboard analytics:", e);
      setSummary(prev => prev || {
        totalRevenue: 0,
        todayRevenue: 0,
        monthlyRevenue: 0,
        quarterlyRevenue: 0,
        yearlyRevenue: 0,
        pendingOrders: 0,
        activeOrders: 0,
        availableTables: 0
      });
    } finally {
      if (isInitial) setLoading(false);
      isFetchingRef.current = false;
    }
  }, []);

  useEffect(() => {
    fetchAnalytics(true);

    const scheduleSync = () => {
      if (syncDebounceTimerRef.current) clearTimeout(syncDebounceTimerRef.current);
      syncDebounceTimerRef.current = setTimeout(() => {
        fetchAnalytics(false);
      }, 300);
    };

    window.addEventListener('foodie_orders_updated', scheduleSync);
    window.addEventListener('foodie_tables_updated', scheduleSync);
    window.addEventListener('foodie_inventory_updated', scheduleSync);
    window.addEventListener('foodie_products_updated', scheduleSync);
    window.addEventListener('storage', scheduleSync);

    return () => {
      if (syncDebounceTimerRef.current) clearTimeout(syncDebounceTimerRef.current);
      window.removeEventListener('foodie_orders_updated', scheduleSync);
      window.removeEventListener('foodie_tables_updated', scheduleSync);
      window.removeEventListener('foodie_inventory_updated', scheduleSync);
      window.removeEventListener('foodie_products_updated', scheduleSync);
      window.removeEventListener('storage', scheduleSync);
    };
  }, [fetchAnalytics]);

  const isInitialMount = React.useRef(true);
  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false;
      return;
    }
    const updatePeriodRevenue = async () => {
      try {
        const details = await dashboardService.getRevenueDetails(selectedPeriod, cachedOrdersRef.current);
        setRevenueDetails(details);
        setRevenue(details.revenueData);
      } catch (err) {
        console.error("Error updating period revenue:", err);
      }
    };
    updatePeriodRevenue();
  }, [selectedPeriod]);

  if (loading) {
    return (
      <AdminLayout>
        <Loader />
      </AdminLayout>
    );
  }

  const todayFormatted = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

  return (
    <AdminLayout>
      <PageHeader
        title="Dashboard"
        subtitle="Welcome back! Here's what's happening today."
        actions={
          <div className="d-flex align-items-center gap-2">
            <div 
              className="d-flex align-items-center px-3 py-1.5 rounded-pill border shadow-xs bg-white text-dark small fw-semibold"
              style={{ height: '38px', backgroundColor: 'var(--surface-color)', borderColor: 'var(--border-color)', color: 'var(--text-primary)' }}
            >
              <span>{todayFormatted}</span>
            </div>
          </div>
        }
      />

      {/* Summary StatCards Grid */}
      <div className="row g-3 mb-4">
        <div className="col-12 col-sm-6 col-lg-3">
          <StatCard
            title="Total Revenue"
            value={formatCurrency(summary?.totalRevenue ?? revenueDetails?.revenueAmount ?? 0)}
            icon={FiTrendingUp}
            color="success"
            pillText={`${revenueDetails?.percentageChange || '+0.0%'} from last week`}
            onClick={() => navigate('/admin/orders')}
          />
        </div>
        <div className="col-12 col-sm-6 col-lg-3">
          <StatCard
            title="Pending Orders"
            value={summary?.pendingOrders ?? 0}
            icon={FiAlertCircle}
            color="danger"
            pillText={`+${summary?.pendingOrders ?? 0} new`}
            onClick={() => navigate('/admin/orders?status=Pending')}
          />
        </div>
        <div className="col-12 col-sm-6 col-lg-3">
          <StatCard
            title="Orders In Progress"
            value={summary?.activeOrders ?? 0}
            icon={FiShoppingBag}
            color="warning"
            pillText={`${summary?.activeOrders ?? 0} in kitchen`}
            onClick={() => navigate('/admin/orders?status=Preparing')}
          />
        </div>
        <div className="col-12 col-sm-6 col-lg-3">
          <StatCard
            title="Available Tables"
            value={summary?.availableTables ?? 0}
            icon={FiLayers}
            color="info"
            pillText={`of 20 tables`}
            onClick={() => navigate('/admin/tables')}
          />
        </div>
      </div>

      {/* Row 2: Recent Operations & Top Selling Items */}
      <div className="row g-4 mb-4">
        <div className="col-12 col-lg-8">
          <RecentActivity activities={activities} />
        </div>
        <div className="col-12 col-lg-4">
          <TopDishes dishes={topDishes} />
        </div>
      </div>

      {/* Row 3: Revenue Graph & Business Details (Graph positioned below Recent Activities) */}
      <div className="row g-4 mb-4">
        <div className="col-12 col-lg-8">
          <RevenueChart
            data={revenue}
            period={selectedPeriod}
            onPeriodChange={setSelectedPeriod}
            totalRevenue={revenueDetails?.revenueAmount}
            percentageChange={revenueDetails?.percentageChange}
            comparison={revenueDetails?.comparison}
          />
        </div>
        <div className="col-12 col-lg-4">
          <BusinessData data={businessStats} />
        </div>
      </div>

    </AdminLayout>
  );
};
export default Dashboard;
