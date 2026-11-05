import React, { useState, useEffect } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { useCart } from '../../hooks/useCart';
import { 
  FiShoppingBag, FiChevronDown, FiClock, FiInfo, FiLogOut, 
  FiMapPin, FiSearch, FiUser, FiX 
} from 'react-icons/fi';
import { orderService, getCustomerPhone } from '../../services/orderService';
import { branchService } from '../../services/branchService';

export const Header = () => {
  const { user, isAuthenticated, logout } = useAuth();
  const { cartItems } = useCart();
  const navigate = useNavigate();
  const location = useLocation();
  const [showDropdown, setShowDropdown] = useState(false);
  const [showBranchDropdown, setShowBranchDropdown] = useState(false);
  const [branches, setBranches] = useState([]);

  const handleLogout = () => {
    logout({ scope: 'customer' });
    navigate('/customer/welcome', { replace: true });
  };

  const totalQuantity = (cartItems || []).reduce((sum, item) => sum + (item.quantity || 1), 0);

  const [customerPhone, setCustomerPhone] = useState(() => user?.phone || getCustomerPhone() || '');

  useEffect(() => {
    const syncPhone = () => {
      const p = user?.phone || getCustomerPhone() || '';
      setCustomerPhone(p);
    };
    syncPhone();
    window.addEventListener('foodie_orders_updated', syncPhone);
    window.addEventListener('storage', syncPhone);
    return () => {
      window.removeEventListener('foodie_orders_updated', syncPhone);
      window.removeEventListener('storage', syncPhone);
    };
  }, [user]);

  const formattedPhone = customerPhone ? (String(customerPhone).startsWith('+') ? customerPhone : `+91 ${String(customerPhone).replace(/\D/g, '').slice(-10)}`) : '';

  const [branchName, setBranchName] = useState(() => {
    return sessionStorage.getItem('foodie_branch_name') || localStorage.getItem('foodie_branch_name') || 'Tumakuru Main';
  });
  const isQrLocked = typeof window !== 'undefined' && (sessionStorage.getItem('foodie_branch_source') === 'qr' || localStorage.getItem('foodie_branch_source') === 'qr');

  useEffect(() => {
    const syncBranchName = () => {
      const name = sessionStorage.getItem('foodie_branch_name') || localStorage.getItem('foodie_branch_name');
      if (name) setBranchName(name);
    };
    syncBranchName();
    window.addEventListener('foodie_branch_changed', syncBranchName);
    window.addEventListener('storage', syncBranchName);
    return () => {
      window.removeEventListener('foodie_branch_changed', syncBranchName);
      window.removeEventListener('storage', syncBranchName);
    };
  }, []);

  useEffect(() => {
    branchService.getBranches().then(res => {
      if (Array.isArray(res) && res.length > 0) {
        setBranches(res);
      }
    }).catch(() => {});
  }, []);

  const [isScrolled, setIsScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 20);
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const [headerSearch, setHeaderSearch] = useState('');

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    if (location.pathname !== '/customer/home') {
      navigate(`/customer/home?search=${encodeURIComponent(headerSearch)}`);
    } else {
      window.dispatchEvent(new CustomEvent('foodie_customer_search', { detail: { query: headerSearch } }));
    }
  };

  return (
    <nav 
      className={`navbar navbar-expand-md navbar-light bg-white sticky-top border-bottom ${isScrolled ? 'py-1 shadow-sm' : 'py-2 shadow-xs'}`}
      style={{
        transition: 'all 0.25s ease-in-out',
        minHeight: '60px',
        zIndex: 1020,
        backgroundColor: '#FFFFFF',
        borderColor: '#E2E8F0'
      }}
    >
      <div className="container px-3 d-flex align-items-center justify-content-between">
        
        {/* Left Side: Circular Logo, Foodie Title & Branch Selector */}
        <div className="d-flex align-items-center gap-3">
          <Link to="/customer/home" className="navbar-brand d-flex align-items-center gap-2 me-0 text-decoration-none">
            <span 
              className="text-white d-flex align-items-center justify-content-center fw-bold shadow-xs"
              style={{ 
                width: '36px', 
                height: '36px', 
                borderRadius: '50%',
                fontSize: '18px', 
                backgroundColor: '#F20D2D',
                flexShrink: 0
              }}
            >
              F
            </span>
            <span 
              className="fw-bold text-dark" 
              style={{ 
                letterSpacing: '-0.3px',
                fontSize: '1.4rem'
              }}
            >
              Foodie
            </span>
          </Link>

          {/* Branch Plain Text with Location Icon */}
          <div className="customer-branch-location d-none d-sm-flex align-items-center gap-1.5 text-secondary" style={{ fontSize: '13px' }}>
            <FiMapPin size={15} className="text-danger flex-shrink-0" />
            <span className="fw-semibold text-dark">{branchName}</span>
          </div>
        </div>

        {/* Center: Search for dishes bar (Only shown on Customer Home) */}
        {location.pathname === '/customer/home' && (
        <div className="d-none d-lg-flex align-items-center justify-content-center flex-grow-1 px-4" style={{ maxWidth: '420px' }}>
          <form onSubmit={handleSearchSubmit} className="w-100 position-relative">
            <FiSearch 
              className="position-absolute text-muted" 
              style={{ left: '14px', top: '13px', fontSize: '15px' }} 
            />
            <input
              type="text"
              className="form-control rounded-pill shadow-xs"
              style={{
                height: '42px',
                borderRadius: '21px',
                paddingLeft: '38px',
                paddingRight: headerSearch ? '32px' : '14px',
                fontSize: '13px',
                borderColor: '#E2E8F0',
                backgroundColor: '#F8FAFC'
              }}
              placeholder="Search for dishes..."
              value={headerSearch}
              onChange={(e) => {
                const val = e.target.value;
                setHeaderSearch(val);
                if (location.pathname === '/customer/home') {
                  window.dispatchEvent(new CustomEvent('foodie_customer_search', { detail: { query: val } }));
                }
              }}
            />
            {headerSearch && (
              <button
                type="button"
                className="btn btn-link position-absolute p-0 text-muted border-0"
                style={{ right: '12px', top: '11px' }}
                onClick={() => {
                  setHeaderSearch('');
                  if (location.pathname === '/customer/home') {
                    window.dispatchEvent(new CustomEvent('foodie_customer_search', { detail: { query: '' } }));
                  }
                }}
              >
                <FiX size={16} />
              </button>
            )}
          </form>
        </div>
        )}

        {/* Right Side: Cart Icon with Badge & User Profile */}
        <div className="d-flex align-items-center gap-3">
          
          {/* Cart Icon Button with Red Count Badge */}
          <Link 
            to="/customer/cart" 
            className="position-relative d-flex align-items-center justify-content-center text-dark bg-white rounded-circle shadow-xs"
            style={{ 
              width: '40px', 
              height: '40px', 
              border: '1px solid #E2E8F0',
              textDecoration: 'none'
            }}
            aria-label="View shopping cart"
          >
            <FiShoppingBag size={18} style={{ color: '#0F172A' }} />
            {totalQuantity > 0 && (
              <span 
                className="position-absolute badge rounded-pill text-white fw-bold d-flex align-items-center justify-content-center shadow-xs"
                style={{ 
                  top: '-4px', 
                  right: '-4px', 
                  fontSize: '10px', 
                  minWidth: '18px', 
                  height: '18px', 
                  backgroundColor: '#F20D2D',
                  padding: '2px 4px',
                  border: '2px solid #FFFFFF'
                }}
              >
                {totalQuantity}
              </span>
            )}
          </Link>

          {/* User Profile Avatar / Dropdown */}
          <div className="position-relative">
            <div 
              className="d-flex align-items-center gap-1.5 cursor-pointer"
              style={{ cursor: 'pointer' }}
              onClick={() => setShowDropdown(!showDropdown)}
            >
              <div 
                className="rounded-circle overflow-hidden d-flex align-items-center justify-content-center fw-bold text-white shadow-xs"
                style={{ 
                  width: '38px', 
                  height: '38px', 
                  backgroundColor: '#F20D2D', 
                  fontSize: '15px'
                }}
              >
                {isAuthenticated ? (
                  user?.role === 'admin' || user?.role === 'employee' 
                    ? (user?.name?.charAt(0).toUpperCase() || 'A') 
                    : <FiUser size={18} />
                ) : (
                  <FiUser size={18} />
                )}
              </div>
            </div>

            {/* Dropdown Menu Overlay */}
            {showDropdown && (
              <>
                <div 
                  className="position-fixed top-0 start-0 w-100 h-100" 
                  style={{ zIndex: 999, cursor: 'default' }}
                  onClick={() => setShowDropdown(false)}
                />
                <div 
                  className="dropdown-menu show customer-profile-dropdown position-absolute end-0 mt-2 shadow-lg border-0 p-3 rounded-4" 
                  style={{ minWidth: '220px', zIndex: 1000, top: '100%', borderColor: '#E2E8F0' }}
                >
                  {/* User details header */}
                  <div className="border-bottom pb-2 mb-2">
                    {isAuthenticated ? (
                      user?.role === 'admin' || user?.role === 'employee' ? (
                        <>
                          <div className="fw-bold text-dark small">{user?.name || 'Staff'}</div>
                          <div className="text-muted" style={{ fontSize: '11px' }}>{user?.email || ''}</div>
                          <span className="badge bg-danger-subtle text-danger fw-bold rounded-pill px-2.5 py-0.5 mt-1" style={{ fontSize: '10px' }}>
                            {user?.role || 'Staff'}
                          </span>
                        </>
                      ) : (
                        <div>
                          <div className="fw-bold text-dark small">{formattedPhone || (user?.name && user.name !== 'Customer' ? user.name : 'Customer')}</div>
                          <div className="text-muted" style={{ fontSize: '11px' }}>Customer Account</div>
                        </div>
                      )
                    ) : (
                      <div>
                        <div className="fw-bold text-dark small">Guest User</div>
                        <div className="text-muted" style={{ fontSize: '11px' }}>Sign in to track orders</div>
                      </div>
                    )}
                  </div>

                  {/* Dropdown items */}
                  {isAuthenticated && (user?.role === 'admin' || user?.role === 'employee') && (
                    <>
                      <Link 
                        to={user?.role === 'admin' ? "/admin/tables" : "/admin/employee-dashboard"} 
                        className="dropdown-item py-2 px-2 small text-danger fw-bold rounded-3 d-flex align-items-center gap-2 text-decoration-none"
                        onClick={() => setShowDropdown(false)}
                      >
                        <i className="bi bi-grid"></i> {user?.role === 'admin' ? "Manage Tables" : "Employee Portal"}
                      </Link>
                      {user?.role === 'admin' && (
                        <Link 
                          to="/admin/dashboard" 
                          className="dropdown-item py-2 px-2 small text-secondary rounded-3 d-flex align-items-center gap-2 text-decoration-none"
                          onClick={() => setShowDropdown(false)}
                        >
                          <i className="bi bi-speedometer2"></i> Admin Dashboard
                        </Link>
                      )}
                    </>
                  )}

                  <Link 
                    to="/customer/orders" 
                    className="dropdown-item py-2 px-2 small text-secondary rounded-3 d-flex align-items-center gap-2 text-decoration-none"
                    onClick={() => setShowDropdown(false)}
                  >
                    <FiClock /> My Orders
                  </Link>

                  <hr className="dropdown-divider my-2" />

                  {isAuthenticated ? (
                    <button 
                      type="button"
                      onClick={() => {
                        setShowDropdown(false);
                        handleLogout();
                      }}
                      className="dropdown-item py-2 px-2 small text-danger rounded-3 d-flex align-items-center gap-2 border-0 bg-transparent text-start fw-bold"
                    >
                      <FiLogOut /> Log Out
                    </button>
                  ) : (
                    <Link 
                      to="/customer/welcome" 
                      className="btn btn-danger w-100 rounded-pill btn-sm fw-bold py-1.5"
                      style={{ backgroundColor: '#F20D2D', borderColor: '#F20D2D' }}
                      onClick={() => setShowDropdown(false)}
                    >
                      Sign In / Register
                    </Link>
                  )}
                </div>
              </>
            )}
          </div>

        </div>

      </div>

      {/* Mobile Search Bar Row (Visible only on Customer Home) */}
      {location.pathname === '/customer/home' && (
      <div className="d-lg-none w-100 px-3 pt-2 pb-1 border-top border-light-subtle">
        <form onSubmit={handleSearchSubmit} className="w-100 position-relative">
          <FiSearch 
            className="position-absolute text-muted" 
            style={{ left: '14px', top: '11px', fontSize: '14px' }} 
          />
          <input
            type="text"
            className="form-control rounded-pill shadow-xs"
            style={{
              height: '36px',
              borderRadius: '18px',
              paddingLeft: '36px',
              paddingRight: headerSearch ? '30px' : '14px',
              fontSize: '12.5px',
              borderColor: '#E2E8F0',
              backgroundColor: '#F8FAFC'
            }}
            placeholder="Search for dishes..."
            value={headerSearch}
            onChange={(e) => {
              const val = e.target.value;
              setHeaderSearch(val);
              if (location.pathname === '/customer/home') {
                window.dispatchEvent(new CustomEvent('foodie_customer_search', { detail: { query: val } }));
              }
            }}
          />
          {headerSearch && (
            <button
              type="button"
              className="btn btn-link position-absolute p-0 text-muted border-0"
              style={{ right: '10px', top: '7px' }}
              onClick={() => {
                setHeaderSearch('');
                if (location.pathname === '/customer/home') {
                  window.dispatchEvent(new CustomEvent('foodie_customer_search', { detail: { query: '' } }));
                }
              }}
            >
              <FiX size={15} />
            </button>
          )}
        </form>
      </div>
      )}
    </nav>
  );
};

export default Header;
