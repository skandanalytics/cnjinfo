import api from './api';
import { productService, clearStaticProductCache } from './productService';

export const inventoryService = {
  getInventory: async (forceRefresh = false) => {
    const { isStaffScreen, listInventory } = await import('./adminApi');
    if (isStaffScreen()) return listInventory();
    return productService.getProducts(forceRefresh);
  },

  updateStock: async (id, newStock) => {
    const { isStaffScreen, setStock, explain } = await import('./adminApi');
    if (isStaffScreen()) {
      try { return await setStock(id, newStock); } catch (err) { throw new Error(explain(err)); }
    }
    const numStock = parseInt(newStock, 10);
    if (isNaN(numStock)) return null;

    // 1. Save locally for immediate UI response
    try {
      const savedStocks = JSON.parse(localStorage.getItem('foodie_dish_stocks') || '{}');
      savedStocks[id] = numStock;
      savedStocks[String(id)] = numStock;
      if (!isNaN(Number(id))) savedStocks[Number(id)] = numStock;
      localStorage.setItem('foodie_dish_stocks', JSON.stringify(savedStocks));
    } catch (e) {}

    // 2. Authoritative backend update to /restaurant/inventory/
    try {
      const invRes = await api.get('/restaurant/inventory/');
      const invList = invRes.data?.data || (Array.isArray(invRes.data) ? invRes.data : (invRes.data?.results || []));
      const invObj = Array.isArray(invList) ? invList.find(i => {
        const invFoodId = i.food?.id || i.food_item?.id || i.food_id || i.food || i.food_item;
        return invFoodId !== undefined && invFoodId !== null && Number(invFoodId) === Number(id);
      }) : null;

      const invStatus = numStock > 5 ? 'IN_STOCK' : numStock > 0 ? 'LOW_STOCK' : 'OUT_OF_STOCK';

      if (invObj) {
        const invId = invObj.id || invObj.inventory_id;
        if (invId) {
          await api.patch(`/restaurant/inventory/${invId}/`, {
            quantity: numStock,
            status: invStatus
          });
        }
      } else if (!isNaN(Number(id))) {
        await api.post('/restaurant/inventory/', {
          food: Number(id),
          food_item: Number(id),
          quantity: numStock,
          status: invStatus,
          restaurant: 1
        });
      }

      if (id && !isNaN(Number(id))) {
        await api.patch(`/restaurant/food/${id}/`, {
          is_available: numStock > 0
        }).catch(() => {});
      }
    } catch (err) {
      console.warn("[INVENTORY SERVICE] Backend inventory endpoint update notice:", err);
    }

    clearStaticProductCache();

    try {
      window.dispatchEvent(new CustomEvent('foodie_inventory_updated', { detail: { id, stock: numStock } }));
      window.dispatchEvent(new CustomEvent('foodie_products_updated', { detail: { id, stock: numStock } }));
      localStorage.setItem('foodie_inventory_sync_trigger', Date.now().toString());
    } catch (e) {}

    clearStaticProductCache();
    return { id, stock: numStock };
  },

  deleteInventoryItem: async (id) => {
    const { isStaffScreen } = await import('./adminApi');
    if (isStaffScreen()) {
      throw new Error('Inventory records stay in the stock ledger. Deactivate the dish instead of deleting the stock row.');
    }
    try {
      // 1. Authoritative backend deletion from /restaurant/inventory/
      const invRes = await api.get('/restaurant/inventory/').catch(() => ({ data: [] }));
      const invList = invRes.data?.data || (Array.isArray(invRes.data) ? invRes.data : (invRes.data?.results || []));
      const invObj = Array.isArray(invList) ? invList.find(i => {
        const invFoodId = i.food?.id || i.food_item?.id || i.food_id || i.food || i.food_item;
        return Number(i.id) === Number(id) || (invFoodId !== undefined && Number(invFoodId) === Number(id));
      }) : null;

      if (invObj && invObj.id) {
        await api.delete(`/restaurant/inventory/${invObj.id}/`).catch((e) => {
          console.warn("[INVENTORY SERVICE] Delete backend inventory record notice:", e);
        });
      }

      // 2. Also delete associated food product
      await productService.deleteProduct(id).catch(() => {});
    } catch (err) {
      console.error("[INVENTORY SERVICE] Error deleting inventory item:", err);
    }

    clearStaticProductCache();

    try {
      window.dispatchEvent(new CustomEvent('foodie_inventory_updated', { detail: { id } }));
      window.dispatchEvent(new CustomEvent('foodie_products_updated', { detail: { id } }));
      localStorage.setItem('foodie_inventory_sync_trigger', Date.now().toString());
    } catch (e) {}

    return true;
  },

  deductInventoryForOrderItems: async (items) => {
    if (!Array.isArray(items)) return;
    try {
      const allProds = await productService.getProducts();
      for (const item of items) {
        const prodId = item.id || item.food_item;
        const prod = allProds.find(p => Number(p.id) === Number(prodId));
        if (prod) {
          const currentStock = typeof prod.stock === 'number' ? prod.stock : 20;
          const newStock = Math.max(0, currentStock - (item.quantity || 1));
          await inventoryService.updateStock(prod.id, newStock);
        }
      }
      try {
        window.dispatchEvent(new CustomEvent('foodie_inventory_updated', { detail: { items } }));
        window.dispatchEvent(new CustomEvent('foodie_products_updated', { detail: { items } }));
        localStorage.setItem('foodie_inventory_sync_trigger', Date.now().toString());
      } catch (e) {}
    } catch (e) {
      console.error("Failed to deduct inventory stock:", e);
    }
  }
};

export default inventoryService;
