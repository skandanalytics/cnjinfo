import React, { useContext } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { AppContext } from '../../context/AppContext';
import { useAuth } from '../../hooks/useAuth';
import { 
  FiGrid, FiShoppingBag, FiLayers, FiSliders, FiUsers, FiCpu, FiTag, FiBookOpen, FiMapPin, FiMonitor, FiX, FiLogOut
} from 'react-icons/fi';

export const Sidebar = () => {
  const { sidebarCollapsed, mobileDrawerOpen, closeMobileDrawer } = useContext(AppContext);
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const isEmployee = user?.role === 'employee';

  const [isMobile, setIsMobile] = React.useState(() => typeof window !== 'undefined' ? window.innerWidth < 992 : false);
  React.useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 992);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const width = isMobile ? '280px' : (sidebarCollapsed ? '72px' : '240px');

  const handleLinkClick = () => {
    if (typeof window !== 'undefined' && window.innerWidth < 992) {
      closeMobileDrawer();
    }
  };

  const handleLogout = () => {
    closeMobileDrawer();
    logout({ scope: 'staff' });
    navigate('/login', { replace: true });
  };

  return (
    <>
      {/* Mobile Backdrop Overlay */}
      {mobileDrawerOpen && (
        <div 
          className="d-lg-none position-fixed top-0 start-0 w-100 h-100"
          style={{
            backgroundColor: 'rgba(15, 23, 42, 0.65)',
            backdropFilter: 'blur(3px)',
            WebkitBackdropFilter: 'blur(3px)',
            zIndex: 1040,
            transition: 'opacity 0.25s ease'
          }}
          onClick={closeMobileDrawer}
          aria-label="Close menu overlay"
        />
      )}

      <aside 
        className={`sidebar-container ${sidebarCollapsed ? 'collapsed' : ''} ${mobileDrawerOpen ? 'mobile-open' : ''}`}
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
          zIndex: 1050,
          transform: isMobile ? (mobileDrawerOpen ? 'translateX(0)' : 'translateX(-100%)') : 'none',
          visibility: isMobile && !mobileDrawerOpen ? 'hidden' : 'visible',
          pointerEvents: isMobile && !mobileDrawerOpen ? 'none' : 'auto',
          backgroundColor: 'var(--sidebar-bg, #101B29)',
          color: 'var(--sidebar-text, #94A3B8)',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: mobileDrawerOpen ? '0 0 35px rgba(0, 0, 0, 0.45)' : 'none',
          transition: 'all 0.25s cubic-bezier(0.16, 1, 0.3, 1)',
          overflowY: 'auto',
          overflowX: 'hidden',
          borderRight: '1px solid var(--sidebar-border, #182638)'
        }}
      >
        {/* Brand Header */}
        <div 
          className="px-3 py-3 border-bottom d-flex align-items-center justify-content-between"
          style={{ borderColor: '#182638' }}
        >
          <NavLink 
            to={isEmployee ? "/employee/dashboard" : "/admin/dashboard"}
            className="d-flex align-items-center gap-2.5 text-decoration-none"
            style={{ cursor: 'pointer' }}
            onClick={handleLinkClick}
          >
            <span 
              className="rounded-circle d-flex align-items-center justify-content-center fw-extrabold text-white flex-shrink-0 shadow-sm"
              style={{ width: '36px', height: '36px', backgroundColor: 'var(--primary-color, #F20D2D)', fontSize: '18px' }}
            >
              F
            </span>
            {(!sidebarCollapsed || mobileDrawerOpen) && (
              <span className="fw-bold text-white fs-5 tracking-tight" style={{ letterSpacing: '-0.3px' }}>
                {isEmployee ? 'Foodie Staff' : 'Foodie Admin'}
              </span>
            )}
          </NavLink>

          {/* Close button on mobile */}
          <button
            type="button"
            onClick={closeMobileDrawer}
            className="btn btn-link text-white-50 p-1 ms-auto d-lg-none border-0 text-decoration-none"
            aria-label="Close navigation"
            style={{ lineHeight: 1 }}
          >
            <FiX size={22} />
          </button>
        </div>

        {/* Nav List */}
        <ul className="list-unstyled flex-grow-1 py-3 px-2 mb-0 d-flex flex-column gap-1 overflow-auto">
          <li>
            <NavLink to={isEmployee ? "/employee/dashboard" : "/admin/dashboard"} end className="sidebar-link" onClick={handleLinkClick}>
              <FiGrid size={18} className="flex-shrink-0" />
              {(!sidebarCollapsed || mobileDrawerOpen) && <span>Dashboard</span>}
            </NavLink>
          </li>
          <li>
            <NavLink to={isEmployee ? "/employee/pos" : "/admin/pos"} className="sidebar-link" onClick={handleLinkClick}>
              <FiMonitor size={18} className="flex-shrink-0" />
              {(!sidebarCollapsed || mobileDrawerOpen) && <span>POS / Take Order</span>}
            </NavLink>
          </li>
          <li>
            <NavLink to={isEmployee ? "/employee/orders" : "/admin/orders"} className="sidebar-link" onClick={handleLinkClick}>
              <FiShoppingBag size={18} className="flex-shrink-0" />
              {(!sidebarCollapsed || mobileDrawerOpen) && <span>Orders</span>}
            </NavLink>
          </li>
          <li>
            <NavLink to={isEmployee ? "/employee/tables" : "/admin/tables"} className="sidebar-link" onClick={handleLinkClick}>
              <FiLayers size={18} className="flex-shrink-0" />
              {(!sidebarCollapsed || mobileDrawerOpen) && <span>Tables</span>}
            </NavLink>
          </li>
          <li>
            <NavLink to={isEmployee ? "/employee/kitchen" : "/admin/kitchen"} className="sidebar-link" onClick={handleLinkClick}>
              <FiCpu size={18} className="flex-shrink-0" />
              {(!sidebarCollapsed || mobileDrawerOpen) && <span>Kitchen Queue</span>}
            </NavLink>
          </li>
          {!isEmployee && (
            <li>
              <NavLink to="/admin/menus" className="sidebar-link" onClick={handleLinkClick}>
                <FiBookOpen size={18} className="flex-shrink-0" />
                {(!sidebarCollapsed || mobileDrawerOpen) && <span>Menu Management</span>}
              </NavLink>
            </li>
          )}
          <li>
            <NavLink to={isEmployee ? "/employee/inventory" : "/admin/inventory"} className="sidebar-link" onClick={handleLinkClick}>
              <FiSliders size={18} className="flex-shrink-0" />
              {(!sidebarCollapsed || mobileDrawerOpen) && <span>Inventory</span>}
            </NavLink>
          </li>
          {!isEmployee && (
            <>
              <li>
                <NavLink to="/admin/branches" className="sidebar-link" onClick={handleLinkClick}>
                  <FiMapPin size={18} className="flex-shrink-0" />
                  {(!sidebarCollapsed || mobileDrawerOpen) && <span>Branches</span>}
                </NavLink>
              </li>
              <li>
                <NavLink to="/admin/users" className="sidebar-link" onClick={handleLinkClick}>
                  <FiUsers size={18} className="flex-shrink-0" />
                  {(!sidebarCollapsed || mobileDrawerOpen) && <span>Employees</span>}
                </NavLink>
              </li>
              <li>
                <NavLink to="/admin/offers" className="sidebar-link" onClick={handleLinkClick}>
                  <FiTag size={18} className="flex-shrink-0" />
                  {(!sidebarCollapsed || mobileDrawerOpen) && <span>Coupons</span>}
                </NavLink>
              </li>
              <li>
                <NavLink to="/admin/settings" className="sidebar-link" onClick={handleLinkClick}>
                  <FiSliders size={18} className="flex-shrink-0" />
                  {(!sidebarCollapsed || mobileDrawerOpen) && <span>Settings</span>}
                </NavLink>
              </li>
            </>
          )}
        </ul>

        {/* User Footer Context */}
        {(!sidebarCollapsed || mobileDrawerOpen) && (
          <div className="p-3 border-top mt-auto" style={{ borderColor: '#182638' }}>
            <div className="d-flex align-items-center justify-content-between gap-2">
              <div className="d-flex align-items-center gap-2 overflow-hidden">
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
                    {user?.backendRole === 'SUPER_ADMIN' ? 'Super Admin' : (user?.backendRole === 'MANAGER' ? 'Manager' : (isEmployee ? 'Staff' : 'Admin'))}
                    {user?.branchName ? ` · ${user.branchName}` : ''}
                  </span>
                </div>
              </div>

              {/* Mobile quick logout */}
              <button
                type="button"
                onClick={handleLogout}
                className="btn btn-outline-danger btn-sm p-1.5 rounded-circle d-lg-none d-flex align-items-center justify-content-center flex-shrink-0"
                style={{ width: '32px', height: '32px' }}
                title="Log Out"
                aria-label="Log Out"
              >
                <FiLogOut size={14} />
              </button>
            </div>
          </div>
        )}
      </aside>
    </>
  );
};

export default Sidebar;
