import React, { Suspense, lazy } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import ProtectedRoute from './ProtectedRoute';
import AdminRoute from './AdminRoute';
import AdminOnlyRoute from './AdminOnlyRoute';

// Core public auth / landing pages (loaded synchronously for instant First Contentful Paint)
import Splash from '../pages/auth/Splash';
import Welcome from '../pages/customer/Welcome';
import CustomerLogin from '../pages/customer/CustomerLogin';
import Login from '../pages/auth/Login';
import Signup from '../pages/auth/Signup';
import Home from '../pages/customer/Home';

// Lazy-loaded Customer Pages
const FoodDetails = lazy(() => import('../pages/customer/FoodDetails'));
const Cart = lazy(() => import('../pages/customer/Cart'));
const Checkout = lazy(() => import('../pages/customer/Checkout'));
const Payment = lazy(() => import('../pages/customer/Payment'));
const OrderConfirmation = lazy(() => import('../pages/customer/OrderConfirmation'));
const OrderHistory = lazy(() => import('../pages/customer/OrderHistory'));
const OrderTracking = lazy(() => import('../pages/customer/OrderTracking'));
const DisplayBoard = lazy(() => import('../pages/customer/DisplayBoard'));

// Lazy-loaded Admin & Employee Pages
const Dashboard = lazy(() => import('../pages/admin/Dashboard'));
const Orders = lazy(() => import('../pages/admin/Orders'));
const Tables = lazy(() => import('../pages/admin/Tables'));
const Menus = lazy(() => import('../pages/admin/Menus'));
const MenuEditor = lazy(() => import('../pages/admin/MenuEditor'));
const Kitchen = lazy(() => import('../pages/admin/Kitchen'));
const Users = lazy(() => import('../pages/admin/Users'));
const Inventory = lazy(() => import('../pages/admin/Inventory'));
const Branches = lazy(() => import('../pages/admin/Branches'));
const Offers = lazy(() => import('../pages/admin/Offers'));
const Analytics = lazy(() => import('../pages/admin/Analytics'));
const Settings = lazy(() => import('../pages/admin/Settings'));
const Pos = lazy(() => import('../pages/admin/Pos'));
const EmployeeDashboard = lazy(() => import('../pages/employee/EmployeeDashboard'));
const DatabaseConsole = lazy(() => import('../pages/db/Database'));

const RouteLoadingFallback = () => (
  <div className="min-h-[50vh] flex items-center justify-center p-6 text-gray-500 text-sm">
    <div className="flex flex-col items-center gap-2">
      <div className="w-6 h-6 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
      <span>Loading...</span>
    </div>
  </div>
);

export const AppRoutes = () => {
  return (
    <Suspense fallback={<RouteLoadingFallback />}>
      <Routes>
        {/* Onboarding & Auth */}
        <Route path="/" element={<Splash />} />
        <Route path="/customer/welcome" element={<Welcome />} />
        <Route path="/customer/login" element={<CustomerLogin />} />
        <Route path="/welcome" element={<Welcome />} />
        <Route path="/login" element={<Login />} />
        <Route path="/admin/login" element={<Login />} />
        <Route path="/signup" element={<Signup />} />

        {/* Customer Pages (Open to Guests) */}
        <Route path="/customer/home" element={<Home />} />
        <Route path="/customer/food/:id" element={<FoodDetails />} />
        <Route path="/customer/cart" element={<Cart />} />
        <Route path="/customer/checkout" element={<Checkout />} />
        <Route path="/customer/payment" element={<Payment />} />
        <Route path="/customer/order-confirmation" element={<OrderConfirmation />} />
        <Route path="/customer/orders" element={<OrderHistory />} />
        <Route path="/customer/order-tracking" element={<OrderTracking />} />
        <Route path="/customer/order-tracking/:orderId" element={<OrderTracking />} />
        <Route path="/customer/display-board" element={<DisplayBoard />} />
        <Route path="/display-board" element={<DisplayBoard />} />

        {/* Admin/Employee Protected Pages */}
        <Route path="/admin/dashboard" element={
          <AdminOnlyRoute>
            <Dashboard />
          </AdminOnlyRoute>
        } />
        <Route path="/admin/employee-dashboard" element={
          <AdminRoute>
            <EmployeeDashboard />
          </AdminRoute>
        } />
        <Route path="/employee/dashboard" element={
          <AdminRoute>
            <EmployeeDashboard />
          </AdminRoute>
        } />
        <Route path="/employee/tables" element={
          <AdminRoute>
            <Tables />
          </AdminRoute>
        } />
        <Route path="/admin/pos" element={
          <AdminRoute>
            <Pos />
          </AdminRoute>
        } />
        <Route path="/employee/pos" element={
          <AdminRoute>
            <Pos />
          </AdminRoute>
        } />
        <Route path="/admin/orders" element={
          <AdminRoute>
            <Orders />
          </AdminRoute>
        } />
        <Route path="/employee/orders" element={
          <AdminRoute>
            <Orders />
          </AdminRoute>
        } />
        <Route path="/employee/kitchen" element={
          <AdminRoute>
            <Kitchen />
          </AdminRoute>
        } />
        <Route path="/employee/inventory" element={
          <AdminRoute>
            <Inventory />
          </AdminRoute>
        } />
        <Route path="/admin/tables" element={
          <AdminRoute>
            <Tables />
          </AdminRoute>
        } />
        <Route path="/admin/menus" element={
          <AdminOnlyRoute>
            <MenuEditor />
          </AdminOnlyRoute>
        } />
        <Route path="/admin/menus/:menuId" element={
          <AdminOnlyRoute>
            <MenuEditor />
          </AdminOnlyRoute>
        } />
        <Route path="/admin/kitchen" element={
          <AdminRoute>
            <Kitchen />
          </AdminRoute>
        } />
        <Route path="/admin/users" element={
          <AdminOnlyRoute>
            <Users />
          </AdminOnlyRoute>
        } />
        <Route path="/admin/inventory" element={
          <AdminRoute>
            <Inventory />
          </AdminRoute>
        } />
        <Route path="/admin/branches" element={
          <AdminOnlyRoute>
            <Branches />
          </AdminOnlyRoute>
        } />
        <Route path="/admin/offers" element={
          <AdminOnlyRoute>
            <Offers />
          </AdminOnlyRoute>
        } />
        <Route path="/admin/reports" element={
          <AdminOnlyRoute>
            <Analytics />
          </AdminOnlyRoute>
        } />
        <Route path="/admin/analytics" element={<Navigate to="/admin/reports" replace />} />
        <Route path="/admin/settings" element={
          <AdminOnlyRoute>
            <Settings />
          </AdminOnlyRoute>
        } />

        <Route path="/db" element={<DatabaseConsole />} />

        {/* Catch-all */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  );
};
export default AppRoutes;
