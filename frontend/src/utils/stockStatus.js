// One stock display rule for Add Menu and Inventory Management.
// 0 is out of stock, 1–5 is low stock, 6 or more is in stock.
export const LOW_STOCK_BELOW = 6;

export function classifyStock(quantity) {
  const qty = Number(quantity);
  if (!Number.isFinite(qty) || qty <= 0) return 'Out of Stock';
  if (qty < LOW_STOCK_BELOW) return 'Low Stock';
  return 'In Stock';
}
