import React, { useState } from 'react';
import { FiEdit2, FiTrash2 } from 'react-icons/fi';
import formatCurrency from '../../utils/formatCurrency';
import { getImageUrl, FOOD_IMAGE_PLACEHOLDER } from '../../utils/imageUtils';
import { classifyStock } from '../../utils/stockStatus';

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
  const foodType = dish.foodType || dish.type || 'veg';

  const baseOriginalPrice = parseFloat(dish.originalPrice || dish.price || 0);
  const discPct = parseFloat(dish.discountPercent || dish.discount_percent || dish.offer_percentage || dish.discount || 0);
  const discPriceProp = parseFloat(dish.discountPrice || dish.discount_price || dish.sellingPrice || 0);

  let oldPrice = baseOriginalPrice;
  let finalPrice = baseOriginalPrice;
  let hasDiscount = Boolean(dish.hasDiscount);
  let calculatedPct = discPct;

  if (discPriceProp > 0 && discPriceProp < baseOriginalPrice) {
    hasDiscount = true;
    finalPrice = discPriceProp;
    if (!calculatedPct) {
      calculatedPct = Math.round(((baseOriginalPrice - discPriceProp) / baseOriginalPrice) * 100);
    }
  } else if (discPct > 0 && discPct < 100) {
    hasDiscount = true;
    finalPrice = Math.round(baseOriginalPrice * (1 - discPct / 100));
  }

  const discountLabel = calculatedPct > 0 ? `${calculatedPct}% OFF` : `OFFER AVAILABLE`;

  const isConfirmedOutOfStock =
    dish.is_sold_out === true ||
    dish.is_orderable === false ||
    dish.status === 'Out of Stock' ||
    dish.status === 'OUT_OF_STOCK' ||
    (dish.stock !== undefined && dish.stock !== null && dish.stock !== '' && Number.isFinite(Number(dish.stock)) && Number(dish.stock) <= 0);

  const isOutOfStock = isConfirmedOutOfStock;

  const stockLabel = isOutOfStock
    ? 'Out of Stock'
    : (dish.stock !== undefined && dish.stock !== null && dish.stock !== '' && Number(dish.stock) > 0 && Number(dish.stock) < 6
        ? 'Low Stock'
        : 'In Stock');

  const stockBadge = isOutOfStock
    ? 'bg-dark text-white'
    : stockLabel === 'Low Stock'
      ? 'bg-warning-subtle text-warning-emphasis'
      : 'bg-success-subtle text-success';

  return (
    <div className="card rounded-3 shadow-sm overflow-hidden bg-white foodie-card foodie-card-animate h-100 d-flex flex-column">
      <div className="flex-grow-1 d-flex flex-column">
        <div className="position-relative flex-shrink-0" style={{ height: '168px' }}>
          <img 
            src={getImageUrl(dish.image)} 
            alt={dish.name} 
            className="w-100 h-100" 
            style={{ 
              objectFit: 'cover',
              filter: isOutOfStock ? 'grayscale(100%) opacity(0.8)' : 'none'
            }}
            onError={(event) => {
              console.warn('Food image failed to load, applying fallback:', event.currentTarget.src);
              event.currentTarget.onerror = null;
              event.currentTarget.src = FOOD_IMAGE_PLACEHOLDER;
            }}
          />

          {/* OUT OF STOCK Badge Overlay */}
          {isOutOfStock && (
            <div className="position-absolute top-50 start-50 translate-middle text-center w-100 px-2" style={{ zIndex: 2 }}>
              <span className="badge bg-dark text-white fw-bold px-3 py-1.5 shadow-sm rounded-pill border border-secondary d-inline-block mb-1" style={{ fontSize: '11px', letterSpacing: '0.5px' }}>
                OUT OF STOCK
              </span>
              <div className="small text-white fw-semibold" style={{ fontSize: '10px', textShadow: '0 1px 3px rgba(0,0,0,0.9)' }}>
                Will be available soon
              </div>
            </div>
          )}

          {/* Offer Tag Badge overlay (top-left) */}
          {!isOutOfStock && hasDiscount && (
            <div className="position-absolute top-0 start-0 m-2" style={{ zIndex: 2 }}>
              <span className="badge bg-danger text-white fw-bold px-2 py-1 shadow-sm rounded-pill d-inline-flex align-items-center gap-1" style={{ fontSize: '10px' }}>
                🔥 {discountLabel}
              </span>
            </div>
          )}

          {/* Veg/Non-Veg Tag (top-right) */}
          <div 
            className="position-absolute top-0 end-0 m-2 bg-white rounded-3 shadow-sm food-type-badge-container d-flex align-items-center justify-content-center" 
            style={{ zIndex: 2 }}
            title={foodType}
          >
            <span className="food-type-icon-wrapper">
              <span className={foodType === 'veg' ? 'veg-badge' : foodType === 'vegan' ? 'vegan-badge' : 'non-veg-badge'}></span>
            </span>
          </div>
        </div>

        <div className="p-3">
          <div className="d-flex align-items-center justify-content-between mb-2">
            <span className="badge bg-light text-danger border border-danger-subtle fw-bold rounded-pill px-2.5 py-1" style={{ fontSize: '11px' }}>
              {dish.category}
            </span>
          </div>

          <h6
            className="fw-bold text-dark mb-1"
            style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', minHeight: '2.6em' }}
          >
            {dish.name}
          </h6>
          <p className="text-secondary small mb-0" style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', minHeight: '2.4em' }}>
            {dish.description}
          </p>
        </div>
      </div>

      <div className="px-3 pb-3 pt-2 mt-auto border-top border-light-subtle">
        <div className="d-flex align-items-center justify-content-between gap-2 flex-wrap">
          <div className="d-flex align-items-baseline gap-2 flex-wrap">
            {hasDiscount && (
              <span className="text-decoration-line-through text-secondary" style={{ fontSize: '12px' }}>
                {formatCurrency(oldPrice)}
              </span>
            )}
            <span className="fw-bold text-danger" style={{ fontSize: '18px' }}>{formatCurrency(finalPrice)}</span>
          </div>
          {hasDiscount && (
            <span className="badge bg-danger-subtle text-danger fw-bold rounded-pill px-2 py-1" style={{ fontSize: '10px' }}>
              {discountLabel}
            </span>
          )}
        </div>
        <div className="d-flex align-items-center justify-content-between gap-2 mt-2">
          <span className="small text-secondary">Stock: <strong className="text-dark">{dish.stock ?? 0}</strong></span>
          <span className={`badge rounded-pill ${stockBadge}`} style={{ fontSize: '10px' }}>
            {stockLabel}
          </span>
        </div>

        {isAdmin && onRestock && (
          <form
            className="mt-2"
            onSubmit={async (event) => {
              event.preventDefault();
              const qty = Number(restockQty);
              if (!Number.isInteger(qty) || qty <= 0) {
                setRestockError('Enter a positive whole number.');
                return;
              }
              setRestockError('');
              setRestocking(true);
              try {
                await onRestock(dish, qty);
                setRestockQty('');
              } catch (err) {
                setRestockError(err.message || 'Restock failed.');
              } finally {
                setRestocking(false);
              }
            }}
          >
            <div className="d-flex align-items-center gap-2">
              <input
                type="number"
                min="1"
                className="form-control form-control-sm rounded-pill"
                style={{ width: '88px', maxWidth: '40%' }}
                placeholder="Qty"
                value={restockQty}
                onChange={(e) => setRestockQty(e.target.value)}
                aria-label={`Restock quantity for ${dish.name}`}
              />
              <button type="submit" className="btn btn-sm btn-danger rounded-pill px-3 fw-bold flex-shrink-0" disabled={restocking}>
                {restocking ? 'Saving…' : 'Restock'}
              </button>
            </div>
            {restockError && <div className="text-danger small mt-1">{restockError}</div>}
          </form>
        )}
        {isAdmin && (
          <div className="d-flex justify-content-end gap-2 mt-2">
            <button
              onClick={onEdit}
              className="btn btn-sm btn-outline-secondary rounded-circle border d-flex align-items-center justify-content-center"
              style={{ width: '32px', height: '32px' }}
              title="Edit Dish"
            >
              <FiEdit2 size={14} />
            </button>
            <button
              onClick={onDelete}
              className="btn btn-sm btn-outline-danger rounded-circle border d-flex align-items-center justify-content-center"
              style={{ width: '32px', height: '32px' }}
              title="Delete Dish"
            >
              <FiTrash2 size={14} />
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
export default DishCard;
