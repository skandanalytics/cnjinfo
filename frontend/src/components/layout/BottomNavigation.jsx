import React from 'react';
import { NavLink } from 'react-router-dom';
import { useCart } from '../../hooks/useCart';
import { FiHome, FiShoppingCart, FiClock } from 'react-icons/fi';

export const BottomNavigation = () => {
  const { cartItems } = useCart();

  const totalQuantity = cartItems.reduce((sum, item) => sum + item.quantity, 0);

  return (
    <nav className="customer-bottom-nav">
      <NavLink to="/customer/home" className="customer-bottom-nav-item">
        <FiHome />
        <span>Menu</span>
      </NavLink>

      <NavLink to="/customer/cart" className="customer-bottom-nav-item position-relative">
        <FiShoppingCart />
        <span>Cart</span>
        {totalQuantity > 0 && (
          <span className="position-absolute top-0 start-100 translate-middle badge rounded-pill bg-danger" style={{ fontSize: '10px' }}>
            {totalQuantity}
          </span>
        )}
      </NavLink>

      <NavLink to="/customer/orders" className="customer-bottom-nav-item">
        <FiClock />
        <span>History</span>
      </NavLink>
    </nav>
  );
};
export default BottomNavigation;
