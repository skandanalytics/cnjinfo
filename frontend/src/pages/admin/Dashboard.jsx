import React, { useEffect, useState, useCallback, useMemo } from 'react';
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
import { restaurantService } from '../../services/restaurantService';
import { useBranch } from '../../context/BranchContext';
import { FiTrendingUp, FiShoppingBag, FiLayers, FiAlertCircle, FiCalendar } from 'react-icons/fi';
import formatCurrency from '../../utils/formatCurrency';

export const Dashboard = () => {
  const navigate = useNavigate();
  const { selectedBranch, setSelectedBranch, isSuperAdmin } = useBranch();
  const [summary, setSummary] = useState(null);
  const [revenue, setRevenue] = useState([]);
  const [activities, setActivities] = useState([]);
  const [topDishes, setTopDishes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedPeriod, setSelectedPeriod] = useState('Weekly');

  const todayStrIso = useMemo(() => new Date().toISOString().split('T')[0], []);
  const [openingDateIso, setOpeningDateIso] = useState(null);

  const [branches, setBranches] = useState([]);
  const [selectedBranchId, setSelectedBranchId] = useState(selectedBranch || 'ALL');

  useEffect(() => {
    let isMounted = true;
    restaurantService.getRestaurants().then((branchList) => {
      if (!isMounted || !Array.isArray(branchList)) return;
      setBranches(branchList);
      if (branchList.length === 0) return;
      const sortedByCreated = [...branchList].sort((a, b) => {
        const da = new Date(a.created_at || a.createdAt || Date.now());
        const db = new Date(b.created_at || b.createdAt || Date.now());
        return da - db;
      });
      const earliest = sortedByCreated[0]?.created_at || sortedByCreated[0]?.createdAt;
      if (earliest) {
        setOpeningDateIso(new Date(earliest).toISOString().split('T')[0]);
      }
    }).catch(() => {});
    return () => { isMounted = false; };
  }, []);

  const minDateIso = useMemo(() => {
    if (openingDateIso) return openingDateIso;
    const d = new Date();
    d.setFullYear(d.getFullYear() - 1);
    return d.toISOString().split('T')[0];
  }, [openingDateIso]);

  const [fromDate, setFromDate] = useState(todayStrIso);
  const [toDate, setToDate] = useState(todayStrIso);

  const [revenueDetails, setRevenueDetails] = useState({
    revenuePeriod: "Weekly Revenue Distribution",
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
  const lastBranchRef = React.useRef(typeof window !== 'undefined' ? (localStorage.getItem('foodie_selected_branch') || '') : '');
  const activeDatesRef = React.useRef({ fromDate: todayStrIso, toDate: todayStrIso });

  useEffect(() => {
    selectedPeriodRef.current = selectedPeriod;
  }, [selectedPeriod]);

  useEffect(() => {
    activeDatesRef.current = { fromDate, toDate };
  }, [fromDate, toDate]);

  const activeBranchRef = React.useRef(selectedBranchId);
  useEffect(() => {
    activeBranchRef.current = selectedBranchId;
  }, [selectedBranchId]);

  const fetchAnalytics = useCallback(async (isInitial = true, filterOpts = null) => {
    if (isFetchingRef.current) return;
    isFetchingRef.current = true;
    if (isInitial) setLoading(true);
    try {
      const activeRange = filterOpts || activeDatesRef.current;
      const targetBranch = filterOpts?.branchId !== undefined
        ? filterOpts.branchId
        : (activeBranchRef.current === 'ALL' ? null : activeBranchRef.current);

      const bundle = await analyticsService.getDashboardBundle({
        fromDate: activeRange?.fromDate,
        toDate: activeRange?.toDate,
        branchId: targetBranch,
      });
      cachedOrdersRef.current = bundle.allOrders || null;
      let details = {
        revenuePeriod: "Weekly Revenue Distribution",
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
    setSelectedBranchId(selectedBranch || 'ALL');
  }, [selectedBranch]);

  useEffect(() => {
    fetchAnalytics(true);

    const scheduleSync = () => {
      if (syncDebounceTimerRef.current) clearTimeout(syncDebounceTimerRef.current);
      syncDebounceTimerRef.current = setTimeout(() => {
        fetchAnalytics(false);
      }, 300);
    };

    const handleBranchSync = (e) => {
      const nextBranch = String(e?.detail?.branchId ?? localStorage.getItem('foodie_admin_selected_branch') ?? 'ALL');
      if (lastBranchRef.current === nextBranch) return;
      lastBranchRef.current = nextBranch;
      setSelectedBranchId(nextBranch);
      fetchAnalytics(true, {
        fromDate: activeDatesRef.current.fromDate,
        toDate: activeDatesRef.current.toDate,
        branchId: nextBranch === 'ALL' ? null : nextBranch,
      });
    };
    window.addEventListener('foodie_branch_selected', handleBranchSync);
    window.addEventListener('foodie_orders_updated', scheduleSync);
    window.addEventListener('foodie_tables_updated', scheduleSync);
    window.addEventListener('foodie_inventory_updated', scheduleSync);
    window.addEventListener('foodie_products_updated', scheduleSync);
    window.addEventListener('storage', scheduleSync);

    return () => {
      if (syncDebounceTimerRef.current) clearTimeout(syncDebounceTimerRef.current);
      window.removeEventListener('foodie_branch_selected', handleBranchSync);
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

  const handleFromDateChange = (val) => {
    setFromDate(val);
    let nextTo = toDate;
    if (val && toDate && val > toDate) {
      nextTo = val;
      setToDate(val);
    }
    fetchAnalytics(false, { fromDate: val, toDate: nextTo });
  };

  const handleToDateChange = (val) => {
    setToDate(val);
    let nextFrom = fromDate;
    if (val && fromDate && fromDate > val) {
      nextFrom = val;
      setFromDate(val);
    }
    fetchAnalytics(false, { fromDate: nextFrom, toDate: val });
  };

  const handleResetDates = () => {
    setFromDate(todayStrIso);
    setToDate(todayStrIso);
    fetchAnalytics(false, { fromDate: todayStrIso, toDate: todayStrIso });
  };

  if (loading) {
    return (
      <AdminLayout>
        <Loader />
      </AdminLayout>
    );
  }

  const isTodayFiltered = fromDate === todayStrIso && toDate === todayStrIso;

  return (
    <AdminLayout>
      <PageHeader
        title="Dashboard"
        subtitle={isTodayFiltered ? "Welcome back! Here's what's happening today." : `Showing metrics from ${fromDate} to ${toDate}.`}
        actions={
          <div className="d-flex align-items-center gap-2 flex-wrap">
            <div 
              className="d-flex align-items-center px-3 py-1.5 rounded-pill border shadow-xs bg-white text-dark small fw-semibold"
              style={{ height: '38px', backgroundColor: 'var(--surface-color)', borderColor: 'var(--border-color)', color: 'var(--text-primary)' }}
            >
              <span className="text-secondary small fw-medium me-2">From:</span>
              <input
                type="date"
                value={fromDate}
                max={toDate || todayStrIso}
                min={minDateIso}
                onChange={(e) => handleFromDateChange(e.target.value)}
                className="border-0 bg-transparent text-dark fw-bold shadow-none p-0"
                style={{ fontSize: '13px', cursor: 'pointer', outline: 'none' }}
                title="Select From Date"
              />
            </div>

            <div 
              className="d-flex align-items-center px-3 py-1.5 rounded-pill border shadow-xs bg-white text-dark small fw-semibold"
              style={{ height: '38px', backgroundColor: 'var(--surface-color)', borderColor: 'var(--border-color)', color: 'var(--text-primary)' }}
            >
              <span className="text-secondary small fw-medium me-2">To:</span>
              <input
                type="date"
                value={toDate}
                min={fromDate || minDateIso}
                max={todayStrIso}
                onChange={(e) => handleToDateChange(e.target.value)}
                className="border-0 bg-transparent text-dark fw-bold shadow-none p-0"
                style={{ fontSize: '13px', cursor: 'pointer', outline: 'none' }}
                title="Select To Date"
              />
            </div>

            {!isTodayFiltered && (
              <button
                type="button"
                onClick={handleResetDates}
                className="btn btn-sm btn-outline-secondary rounded-pill px-3 fw-semibold shadow-xs"
                style={{ height: '38px', fontSize: '12.5px' }}
                title="Reset date filter back to Today"
              >
                Reset
              </button>
            )}
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
            onClick={() => navigate('/admin/orders')}
          />
        </div>
        <div className="col-12 col-sm-6 col-lg-3">
          <StatCard
            title="Pending Orders"
            value={summary?.pendingOrders ?? 0}
            icon={FiAlertCircle}
            color="danger"
            onClick={() => navigate('/admin/orders?status=Pending')}
          />
        </div>
        <div className="col-12 col-sm-6 col-lg-3">
          <StatCard
            title="Orders In Progress"
            value={summary?.activeOrders ?? 0}
            icon={FiShoppingBag}
            color="warning"
            onClick={() => navigate('/admin/orders?status=Preparing')}
          />
        </div>
        <div className="col-12 col-sm-6 col-lg-3">
          <StatCard
            title="Available Tables"
            value={summary?.availableTables ?? 0}
            icon={FiLayers}
            color="info"
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
