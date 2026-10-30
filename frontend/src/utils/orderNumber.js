/**
 * Authoritative format helper for displaying order numbers.
 * Resolves logical display numbers (e.g. 77, 77.1, 77.2, 77.4) consistently
 * across customer, admin, employee, kitchen, POS, and bill components.
 */
export function formatOrderDisplayNumber(order, fallbackId = '') {
  if (!order) return String(fallbackId || '');
  if (typeof order === 'string' || typeof order === 'number') {
    return String(order);
  }
  const displayNo =
    order.display_order_number ||
    order.display_number ||
    (order.parent_order_id && Number(order.continuation_index) > 0 ? `${order.parent_order_id}.${order.continuation_index}` : null) ||
    order.orderNumber ||
    order.order_number ||
    order.id ||
    order.orderId ||
    order.order_id ||
    fallbackId ||
    '';
  return String(displayNo);
}

export default formatOrderDisplayNumber;
