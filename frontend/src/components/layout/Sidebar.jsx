import React, { useContext } from 'react';
import { NavLink } from 'react-router-dom';
import { AppContext } from '../../context/AppContext';
import { useAuth } from '../../hooks/useAuth';
import { 
  FiGrid, FiShoppingBag, FiLayers, FiSliders, FiUsers, FiCpu, FiTag, FiBookOpen, FiMapPin, FiMonitor
} from 'react-icons/fi';

export const Sidebar = () => {
  const { sidebarCollapsed } = useContext(AppContext);
  const { user } = useAuth();
  const isEmployee = user?.role === 'employee';

  const width = sidebarCollapsed ? '72px' : '240px';

  return (
    <aside 
      className={`sidebar-container ${sidebarCollapsed ? 'collapsed' : ''}`}
      style={{ 
        position: 'fixed',
        top: 0,
        left: 0,
        bottom: 0,
        height: '100vh',
        width: width, 
        minWidth: width, 
        maxWidth: width, 
        flex: `0 0 ${width}`,
        zIndex: 1000,
        backgroundColor: 'var(--sidebar-bg, #101B29)',
        color: 'var(--sidebar-text, #94A3B8)',
        display: 'flex',
        flexDirection: 'column',
        boxShadow: '0 0 25px rgba(0, 0, 0, 0.3)',
        transition: 'all 0.25s cubic-bezier(0.16, 1, 0.3, 1)',
        overflowY: 'auto',
        overflowX: 'hidden',
        borderRight: '1px solid var(--sidebar-border, #182638)'
      }}
    >
      {/* Brand Header */}
      <NavLink 
        to={isEmployee ? "/employee/dashboard" : "/admin/dashboard"}
        className="px-3 py-3 border-bottom d-flex align-items-center gap-2.5 text-decoration-none"
        style={{ borderColor: '#182638', cursor: 'pointer' }}
      >
        <span 
          className="rounded-circle d-flex align-items-center justify-content-center fw-extrabold text-white flex-shrink-0 shadow-sm"
          style={{ width: '36px', height: '36px', backgroundColor: 'var(--primary-color, #F20D2D)', fontSize: '18px' }}
        >
          F
        </span>
        {!sidebarCollapsed && (
          <div className="d-flex flex-column">
            <span className="fw-bold text-white tracking-tight" style={{ fontSize: '15px', lineHeight: '1.2', letterSpacing: '-0.2px' }}>
              {isEmployee ? 'Foodie Staff' : 'Foodie Admin'}
            </span>
            <span className="small" style={{ fontSize: '11px', color: '#94A3B8' }}>
              Restaurant Management
            </span>
          </div>
        )}
      </NavLink>

      {/* Nav List */}
      <ul className="list-unstyled flex-grow-1 py-3 px-2 mb-0 d-flex flex-column gap-1 overflow-auto">
        <li>
          <NavLink to={isEmployee ? "/employee/dashboard" : "/admin/dashboard"} end className="sidebar-link">
            <FiGrid size={18} className="flex-shrink-0" />
            {!sidebarCollapsed && <span>Dashboard</span>}
          </NavLink>
        </li>
        <li>
          <NavLink to={isEmployee ? "/employee/pos" : "/admin/pos"} className="sidebar-link">
            <FiMonitor size={18} className="flex-shrink-0" />
            {!sidebarCollapsed && <span>POS / Take Order</span>}
          </NavLink>
        </li>
        <li>
          <NavLink to={isEmployee ? "/employee/orders" : "/admin/orders"} className="sidebar-link">
            <FiShoppingBag size={18} className="flex-shrink-0" />
            {!sidebarCollapsed && <span>Orders</span>}
          </NavLink>
        </li>
        <li>
          <NavLink to={isEmployee ? "/employee/tables" : "/admin/tables"} className="sidebar-link">
            <FiLayers size={18} className="flex-shrink-0" />
            {!sidebarCollapsed && <span>Tables</span>}
          </NavLink>
        </li>
        <li>
          <NavLink to={isEmployee ? "/employee/kitchen" : "/admin/kitchen"} className="sidebar-link">
            <FiCpu size={18} className="flex-shrink-0" />
            {!sidebarCollapsed && <span>Kitchen Queue</span>}
          </NavLink>
        </li>
        {!isEmployee && (
          <li>
            <NavLink to="/admin/menus" className="sidebar-link">
              <FiBookOpen size={18} className="flex-shrink-0" />
              {!sidebarCollapsed && <span>Menu Management</span>}
            </NavLink>
          </li>
        )}
        <li>
          <NavLink to={isEmployee ? "/employee/inventory" : "/admin/inventory"} className="sidebar-link">
            <FiSliders size={18} className="flex-shrink-0" />
            {!sidebarCollapsed && <span>Inventory</span>}
          </NavLink>
        </li>
        {!isEmployee && (
          <>
            <li>
              <NavLink to="/admin/branches" className="sidebar-link">
                <FiMapPin size={18} className="flex-shrink-0" />
                {!sidebarCollapsed && <span>Branches</span>}
              </NavLink>
            </li>
            <li>
              <NavLink to="/admin/users" className="sidebar-link">
                <FiUsers size={18} className="flex-shrink-0" />
                {!sidebarCollapsed && <span>Employees</span>}
              </NavLink>
            </li>
            <li>
              <NavLink to="/admin/offers" className="sidebar-link">
                <FiTag size={18} className="flex-shrink-0" />
                {!sidebarCollapsed && <span>Coupons</span>}
              </NavLink>
            </li>
            <li>
              <NavLink to="/admin/settings" className="sidebar-link">
                <FiSliders size={18} className="flex-shrink-0" />
                {!sidebarCollapsed && <span>Settings</span>}
              </NavLink>
            </li>
          </>
        )}
      </ul>

      {/* User Footer Context */}
      {!sidebarCollapsed && (
        <div className="p-3 border-top mt-auto" style={{ borderColor: '#182638' }}>
          <div className="d-flex align-items-center gap-2">
            <div 
              className="rounded-circle d-flex align-items-center justify-content-center text-white fw-bold flex-shrink-0"
              style={{ width: '32px', height: '32px', backgroundColor: 'var(--primary-color, #F20D2D)', fontSize: '13px' }}
            >
              {user?.name?.charAt(0).toUpperCase() || 'A'}
            </div>
            <div className="overflow-hidden">
              <span className="d-block text-white fw-semibold small text-truncate" style={{ fontSize: '12px' }}>
                {user?.name || (isEmployee ? 'Staff' : 'foodieadmin')}
              </span>
              <span className="d-block small text-truncate" style={{ fontSize: '11px', color: '#94A3B8' }}>
                {isEmployee ? 'Employee' : 'Admin'}
              </span>
            </div>
          </div>
        </div>
      )}
    </aside>
  );
};

export default Sidebar;
