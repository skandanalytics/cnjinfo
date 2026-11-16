import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useCart } from '../../hooks/useCart';
import { FiShoppingBag, FiArrowRight } from 'react-icons/fi';
import formatCurrency from '../../utils/formatCurrency';

export const DesktopFloatingCartBar = () => {
  const { cartItems, getSubtotal } = useCart();
  const navigate = useNavigate();
  const location = useLocation();

  // Hidden on cart, checkout, payment, confirmation, tracking
  const hiddenRoutes = [
    '/customer/cart',
    '/customer/checkout',
    '/customer/payment',
    '/customer/order-confirmation',
    '/customer/order-tracking'
  ];

  const isHiddenRoute = hiddenRoutes.some(route => location.pathname.startsWith(route));
  const totalQuantity = (cartItems || []).reduce((sum, item) => sum + (item.quantity || 1), 0);
  const subtotal = getSubtotal ? getSubtotal() : 0;

  if (isHiddenRoute || totalQuantity === 0) {
    return null;
  }

  return (
    <div 
      className="d-none d-md-flex position-fixed start-50 translate-middle-x"
      style={{
        bottom: '28px',
        zIndex: 1055,
        animation: 'slideUpDesktop 0.3s cubic-bezier(0.16, 1, 0.3, 1)'
      }}
    >
      <button
        type="button"
        onClick={() => navigate('/customer/cart')}
        className="btn btn-danger rounded-pill px-4 py-2.5 fw-bold shadow-lg d-flex align-items-center gap-3 text-white border-0"
        style={{
          backgroundColor: '#F20D2D',
          fontSize: '15px',
          letterSpacing: '0.2px',
          boxShadow: '0 10px 25px -5px rgba(242, 13, 45, 0.4), 0 8px 10px -6px rgba(242, 13, 45, 0.3)',
          transition: 'transform 0.2s ease, box-shadow 0.2s ease',
          cursor: 'pointer'
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.transform = 'translateY(-2px) scale(1.02)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.transform = 'translateY(0) scale(1)';
        }}
      >
        <span className="d-flex align-items-center justify-content-center bg-white rounded-circle text-danger flex-shrink-0" style={{ width: '28px', height: '28px' }}>
          <FiShoppingBag size={15} style={{ color: '#F20D2D' }} />
        </span>
        <span>
          View Cart ({totalQuantity} {totalQuantity === 1 ? 'Item' : 'Items'}) • {formatCurrency(subtotal)}
        </span>
        <FiArrowRight size={18} className="ms-1" />
      </button>
    </div>
  );
};

export default DesktopFloatingCartBar;
