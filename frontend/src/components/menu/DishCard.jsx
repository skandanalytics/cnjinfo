import React, { useState } from 'react';
import { FiEdit2, FiTrash2 } from 'react-icons/fi';
import formatCurrency from '../../utils/formatCurrency';
import { getImageUrl, FOOD_IMAGE_PLACEHOLDER } from '../../utils/imageUtils';

export const DishCard = ({
  dish,
  onEdit,
  onDelete,
  onRestock,
  isAdmin = false
}) => {
  const [restockQty, setRestockQty] = useState('');
  const [restockError, setRestockError] = useState('');
  const [restocking, setRestocking] = useState(false);
  const [showRestockForm, setShowRestockForm] = useState(false);
  const foodType = String(dish.foodType || dish.type || 'veg').toLowerCase();

  const baseOriginalPrice = parseFloat(dish.originalPrice || dish.price || 0);
  const discPct = parseFloat(dish.discountPercent || dish.discount_percent || dish.offer_percentage || dish.discount || 0);
  const discPriceProp = parseFloat(dish.discountPrice || dish.discount_price || dish.sellingPrice || 0);

  let oldPrice = baseOriginalPrice;
  let finalPrice = baseOriginalPrice;
  let hasDiscount = Boolean(dish.hasDiscount);

  if (discPriceProp > 0 && discPriceProp < baseOriginalPrice) {
    hasDiscount = true;
    finalPrice = discPriceProp;
  } else if (discPct > 0 && discPct < 100) {
    hasDiscount = true;
    finalPrice = Math.round(baseOriginalPrice * (1 - discPct / 100));
  }

  const isConfirmedOutOfStock =
    dish.is_sold_out === true ||
    dish.is_orderable === false ||
    dish.status === 'Out of Stock' ||
    dish.status === 'OUT_OF_STOCK' ||
    (dish.stock !== undefined && dish.stock !== null && dish.stock !== '' && Number.isFinite(Number(dish.stock)) && Number(dish.stock) <= 0);

  const isOutOfStock = isConfirmedOutOfStock;
  const currentStock = dish.stock !== undefined && dish.stock !== null && dish.stock !== '' ? Number(dish.stock) : 10;
  const isLowStock = !isOutOfStock && currentStock > 0 && currentStock <= 5;

  const stockLabel = isOutOfStock
    ? 'Out of Stock'
    : isLowStock
      ? 'Low Stock'
      : 'In Stock';

  const stockBadgeStyle = isOutOfStock
    ? { backgroundColor: '#1E293B', color: '#FFFFFF', border: '1px solid #334155' }
    : isLowStock
      ? { backgroundColor: '#FEF3C7', color: '#D97706', border: '1px solid #FDE68A' }
      : { backgroundColor: '#DCFCE7', color: '#16A34A', border: '1px solid #BBF7D0' };

  // Orders count pill calculation
  const orderCount = dish.order_count || dish.orders_count || dish.ordersCount || (dish.id ? ((Number(dish.id) * 17) % 120 + 5) : 24);
  const isHotItem = orderCount >= 50;

  return (
    <div 
      className="card rounded-4 border shadow-xs overflow-hidden h-100 d-flex flex-column transition-all"
      style={{ 
        backgroundColor: '#FFFFFF', 
        borderColor: '#E2E8F0',
        borderRadius: '16px'
      }}
    >
      {/* Dish Image Box with Badges (Visible and functional in Menu Management) */}
      <div className="position-relative w-100" style={{ height: '145px', backgroundColor: '#F8FAFC' }}>
        <img
          src={getImageUrl(dish.image) || FOOD_IMAGE_PLACEHOLDER}
          alt={dish.name}
          className="w-100 h-100 object-fit-cover"
          onError={(e) => {
            e.currentTarget.src = FOOD_IMAGE_PLACEHOLDER;
          }}
        />

        {/* Veg/Non-Veg Indicator (Top Left) */}
        <div 
          className="position-absolute shadow-2xs d-flex align-items-center justify-content-center bg-white p-1 rounded-2"
          style={{ top: '10px', left: '10px', width: '22px', height: '22px', border: '1px solid rgba(226, 232, 240, 0.8)' }}
          title={foodType}
        >
          {foodType.includes('non') ? (
            <div className="d-flex align-items-center justify-content-center" style={{ width: '14px', height: '14px', border: '1.5px solid #EF4444', borderRadius: '3px' }}>
              <div style={{ width: 0, height: 0, borderLeft: '3.5px solid transparent', borderRight: '3.5px solid transparent', borderBottom: '6px solid #EF4444' }} />
            </div>
          ) : (
            <div className="d-flex align-items-center justify-content-center" style={{ width: '14px', height: '14px', border: '1.5px solid #16A34A', borderRadius: '3px' }}>
              <div style={{ width: '6px', height: '6px', backgroundColor: '#16A34A', borderRadius: '50%' }} />
            </div>
          )}
        </div>

        {/* Stock Badge (Top Right) */}
        <span
          className="position-absolute badge rounded-pill fw-semibold px-2.5 py-1 shadow-2xs"
          style={{ ...stockBadgeStyle, top: '10px', right: '10px', fontSize: '11px' }}
        >
          {stockLabel}
        </span>
      </div>

      {/* Card Content (Matches Reference Image 2) */}
      <div className="p-3 text-start d-flex flex-column flex-grow-1">
        {/* Dish Name */}
        <h5 
          className="fw-bold mb-0.5 text-dark" 
          style={{ fontSize: '16.5px', letterSpacing: '-0.3px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
          title={dish.name}
        >
          {dish.name}
        </h5>

        {/* Category Subtitle */}
        <div className="text-secondary small fw-medium mb-3" style={{ fontSize: '13px', color: '#64748B' }}>
          {dish.category_name || dish.category || 'General'}
        </div>

        {/* Pricing & Stock Row */}
        <div className="d-flex align-items-center justify-content-between mt-auto mb-2">
          <div className="d-flex align-items-baseline gap-2">
            <span className="fw-bold" style={{ fontSize: '18px', color: '#F20D2D' }}>
              {formatCurrency(finalPrice)}
            </span>
            {hasDiscount && (
              <span className="text-decoration-line-through text-muted small" style={{ fontSize: '13px', color: '#94A3B8' }}>
                {formatCurrency(oldPrice)}
              </span>
            )}
          </div>

          {stockLabel !== 'In Stock' && (
            <span 
              className="badge rounded-pill fw-bold px-2.5 py-1 shadow-2xs" 
              style={{ fontSize: '11px', ...stockBadgeStyle }}
            >
              {stockLabel}
            </span>
          )}
        </div>

        {/* Card Footer: Restock Toggle & Circular Edit / Delete Buttons */}
        <div className="d-flex align-items-center justify-content-between pt-2.5 mt-1 border-top" style={{ borderColor: '#F1F5F9' }}>
          {isAdmin && onRestock && (
            <button
              type="button"
              onClick={() => setShowRestockForm(!showRestockForm)}
              className="btn btn-link p-0 text-decoration-none small text-muted fw-semibold d-inline-flex align-items-center gap-1"
              style={{ fontSize: '11.5px' }}
            >
              <span>Stock: <strong>{currentStock}</strong></span>
            </button>
          )}

          {isAdmin && (
            <div className="d-flex align-items-center gap-2.5 ms-auto pe-1 pb-1">
              <button
                type="button"
                onClick={onEdit}
                className="btn bg-white rounded-circle shadow-2xs d-flex align-items-center justify-content-center p-0 text-secondary transition-all"
                style={{ width: '36px', height: '36px', border: '1px solid #CBD5E1', margin: '2px' }}
                title="Edit Dish"
              >
                <FiEdit2 size={15} style={{ color: '#475569' }} />
              </button>

              <button
                type="button"
                onClick={onDelete}
                className="btn bg-white rounded-circle shadow-2xs d-flex align-items-center justify-content-center p-0 text-danger transition-all"
                style={{ width: '36px', height: '36px', border: '1px solid #FCA5A5', margin: '2px' }}
                title="Delete Dish"
              >
                <FiTrash2 size={15} style={{ color: '#EF4444' }} />
              </button>
            </div>
          )}
        </div>

        {/* Quick Restock Input Row */}
        {showRestockForm && isAdmin && onRestock && (
          <form
            className="mt-2 pt-2 border-top"
            onSubmit={async (event) => {
              event.preventDefault();
              const qty = Number(restockQty);
              if (!Number.isInteger(qty) || qty <= 0) {
                setRestockError('Enter a positive number.');
                return;
              }
              setRestockError('');
              setRestocking(true);
              try {
                await onRestock(dish, qty);
                setRestockQty('');
                setShowRestockForm(false);
              } catch (err) {
                setRestockError(err.message || 'Restock failed.');
              } finally {
                setRestocking(false);
              }
            }}
          >
            <div className="d-flex align-items-center gap-1.5">
              <input
                type="number"
                min="1"
                className="form-control form-control-sm rounded-pill px-3"
                style={{ fontSize: '12px' }}
                placeholder="Qty"
                value={restockQty}
                onChange={(e) => setRestockQty(e.target.value)}
              />
              <button type="submit" className="btn btn-sm btn-danger rounded-pill px-3 fw-bold" style={{ fontSize: '11px', backgroundColor: '#F20D2D' }} disabled={restocking}>
                {restocking ? '...' : 'Add'}
              </button>
            </div>
            {restockError && <div className="text-danger small mt-1" style={{ fontSize: '11px' }}>{restockError}</div>}
          </form>
        )}
      </div>
    </div>
  );
};

export default DishCard;
