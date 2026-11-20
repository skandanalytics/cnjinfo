import React, { useEffect } from 'react';
import { AuthProvider } from './context/AuthContext';
import { BranchProvider } from './context/BranchContext';
import { CartProvider } from './context/CartContext';
import { OrderProvider } from './context/OrderContext';
import { AppProvider } from './context/AppContext';
import AppRoutes from './routes/AppRoutes';
import { orderService } from './services/orderService';

import ErrorBoundary from './components/common/ErrorBoundary';

function App() {
  useEffect(() => {
    const isReset = localStorage.getItem('foodie_fresh_start_v2');
    if (!isReset) {
      orderService.resetAllOrders();
      localStorage.setItem('foodie_fresh_start_v2', 'true');
    }
  }, []);

  return (
    <ErrorBoundary>
      <AuthProvider>
        <BranchProvider>
          <CartProvider>
            <OrderProvider>
              <AppProvider>
                <AppRoutes />
              </AppProvider>
            </OrderProvider>
          </CartProvider>
        </BranchProvider>
      </AuthProvider>
    </ErrorBoundary>
  );
}

export default App;
