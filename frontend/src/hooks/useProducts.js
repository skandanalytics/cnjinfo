import { useState, useEffect } from 'react';
import { productService, clearStaticProductCache } from '../services/productService';

export const useProducts = () => {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchProducts = async (showLoading = true) => {
    if (showLoading) setLoading(true);
    try {
      clearStaticProductCache();
      const data = await productService.getProducts(true);
      setProducts(data || []);
    } catch (e) {
      setError(e);
    }
    if (showLoading) setLoading(false);
  };

  const fetchProductsSilently = async () => {
    try {
      clearStaticProductCache();
      const data = await productService.getProducts(true);
      setProducts(data || []);
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    fetchProducts();

    const handleSync = () => {
      fetchProductsSilently();
    };

    window.addEventListener('foodie_products_updated', handleSync);
    window.addEventListener('foodie_inventory_updated', handleSync);
    window.addEventListener('foodie_categories_updated', handleSync);
    window.addEventListener('foodie_offers_updated', handleSync);
    window.addEventListener('foodie_top_selling_updated', handleSync);
    const handleStorage = (event) => {
      const key = event.key || '';
      if (
        key === 'foodie_data_sync'
        || key === 'foodie_inventory_sync_trigger'
        || key.startsWith('foodie_dish')
        || key.startsWith('foodie_categor')
        || key.startsWith('foodie_offer')
      ) {
        handleSync();
      }
    };
    window.addEventListener('storage', handleStorage);

    return () => {
      window.removeEventListener('foodie_products_updated', handleSync);
      window.removeEventListener('foodie_inventory_updated', handleSync);
      window.removeEventListener('foodie_categories_updated', handleSync);
      window.removeEventListener('foodie_offers_updated', handleSync);
      window.removeEventListener('foodie_top_selling_updated', handleSync);
      window.removeEventListener('storage', handleStorage);
    };
  }, []);

  return { products, loading, error, refetch: () => fetchProducts(true) };
};
export default useProducts;
