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
    order.serialNumber ||
    order.serial_order_number ||
    order.serial_number ||
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

/**
 * Combines identical order line items across parent orders and suborders for billing / invoices.
 * Combines ONLY when dish, pricing, and all customizations / extra ingredients are identical.
 * Keeps differing customizations/variants as separate line items.
 * Removes order IDs from individual line items so Order ID appears only once at the top.
 */
export function combineBillItems(items = []) {
  if (!Array.isArray(items) || items.length === 0) return [];

  const grouped = new Map();

  items.forEach((item) => {
    if (!item) return;
    const name = String(item.name || item.food_name || 'Dish').trim();
    const unitPrice = Number(item.price != null ? item.price : item.unit_price || 0);

    // Canonical representation of customizations/extras
    const rawOptions = item.customizations || item.options || item.extraIngredients || [];
    const normalizedOptions = (Array.isArray(rawOptions) ? rawOptions : [])
      .map((opt) => {
        if (!opt) return null;
        if (typeof opt === 'string') return opt.trim().toLowerCase();
        const optName = String(opt.name || opt.title || '').trim().toLowerCase();
        const optPrice = Number(opt.extra_price ?? opt.price ?? 0);
        return `${optName}:${optPrice}`;
      })
      .filter(Boolean)
      .sort()
      .join('|');

    const instructions = String(item.special_instructions || item.specialInstructions || item.instructions || '').trim().toLowerCase();
    const groupKey = `${name}___${unitPrice}___${normalizedOptions}___${instructions}`;

    const qty = parseInt(item.quantity, 10) || 1;
    const itemTotal = Number(item.line_total || item.lineTotal || (unitPrice * qty));

    if (grouped.has(groupKey)) {
      const existing = grouped.get(groupKey);
      existing.quantity += qty;
      existing.line_total = Number(existing.line_total || 0) + itemTotal;
      existing.totalPrice = existing.line_total;
      existing.lineTotal = existing.line_total;
    } else {
      grouped.set(groupKey, {
        ...item,
        name,
        quantity: qty,
        unit_price: unitPrice,
        price: unitPrice,
        line_total: itemTotal,
        totalPrice: itemTotal,
        lineTotal: itemTotal,
        // Order ID is displayed once at the top of the invoice; never beside individual items
        order_display_number: null,
      });
    }
  });

  return Array.from(grouped.values());
}

export default formatOrderDisplayNumber;
