import React, { useState } from 'react';
import QuantityControl from './QuantityControl';
import { getImageUrl, FOOD_IMAGE_PLACEHOLDER } from '../../utils/imageUtils';
import formatCurrency from '../../utils/formatCurrency';
import { getProductSellingPrice } from '../../utils/pricing';

export const CartItem = ({
  item,
  onIncrease,
  onDecrease,
  onChange,
  onRemove,
  onUpdateInstructions,
}) => {
  const [isEditingNotes, setIsEditingNotes] = useState(false);
  const [notesInput, setNotesInput] = useState(item.instructions || item.special_instructions || '');

  const foodType = item.foodType || item.type || (item.is_veg === false || item.is_veg === 'false' ? 'non-veg' : 'veg');
  const badgeClass = foodType === 'veg' ? 'veg-badge' : foodType === 'vegan' ? 'vegan-badge' : 'non-veg-badge';

  const originalPrice = Number(item.price || item.originalPrice || item.unit_price || 0);
  const sellingPrice = getProductSellingPrice(item) || originalPrice;
  const hasDiscount = originalPrice > sellingPrice;

  // Add-ons / extra ingredients
  const extraList = Array.isArray(item.extraIngredients)
    ? item.extraIngredients
    : Array.isArray(item.options)
      ? item.options
      : [];

  const extraCharges = extraList.reduce((sum, extra) => sum + Number(extra.extra_price || extra.price || 0), 0);
  const unitTotal = sellingPrice + extraCharges;
  const lineTotal = item.lineTotal != null ? Number(item.lineTotal) : unitTotal * (item.quantity || 1);

  const handleSaveNotes = () => {
    if (onUpdateInstructions) {
      const lineKey = item.lineId || item.cartItemId || item.id;
      onUpdateInstructions(lineKey, notesInput.trim(), extraList);
    }
    setIsEditingNotes(false);
  };

  const handleClearExtras = () => {
    if (onUpdateInstructions) {
      const lineKey = item.lineId || item.cartItemId || item.id;
      onUpdateInstructions(lineKey, '', []);
    }
  };

  return (
    <div className="card rounded-3 p-3 mb-3 border border-light shadow-sm text-start">
      <div className="row align-items-center">
        {/* Product image */}
        <div className="col-3 col-sm-2">
          <img 
            src={getImageUrl(item.image)} 
            alt={item.name} 
            className="img-fluid rounded" 
            style={{ width: '80px', height: '80px', objectFit: 'cover' }}
            onError={(event) => {
              console.error('Failed to load food image:', event.currentTarget.src);
              event.currentTarget.src = FOOD_IMAGE_PLACEHOLDER;
            }}
          />
        </div>

        {/* Item Details */}
        <div className="col-9 col-sm-6">
          <div className="d-flex align-items-center justify-content-between mb-1">
            <div className="d-flex align-items-center gap-2 min-width-0">
              <span className={badgeClass}></span>
              <h6 className="fw-bold mb-0 text-dark text-truncate">{item.name}</h6>
            </div>
            {/* Mobile Trash */}
            <button 
              onClick={onRemove}
              className="btn btn-link text-danger p-0 border-0 d-sm-none"
              aria-label="Remove item"
            >
              <i className="bi bi-trash3" style={{ fontSize: '16px' }}></i>
            </button>
          </div>

          {/* Pricing Row */}
          <div className="d-flex align-items-baseline gap-2 mb-1.5 flex-wrap">
            {hasDiscount && (
              <span className="text-muted text-decoration-line-through small" style={{ fontSize: '12px' }}>
                {formatCurrency(originalPrice)}
              </span>
            )}
            <span className="fw-bold text-danger" style={{ fontSize: '13.5px' }}>
              {formatCurrency(sellingPrice)}
            </span>
            {extraCharges > 0 && (
              <span className="text-secondary small" style={{ fontSize: '11px' }}>
                (+{formatCurrency(extraCharges)} extras)
              </span>
            )}
          </div>

          {/* Selected Add-ons / Toppings */}
          {extraList.length > 0 && (
            <div className="small text-secondary mb-1" style={{ fontSize: '11.5px' }}>
              <span className="fw-semibold text-dark">Add-ons: </span>
              {extraList.map((e, idx) => (
                <span key={e.id || idx}>
                  {e.name}
                  {Number(e.extra_price || e.price || 0) > 0 && ` (+${formatCurrency(e.extra_price || e.price)})`}
                  {idx < extraList.length - 1 ? ', ' : ''}
                </span>
              ))}
            </div>
          )}

          {/* Special Instructions */}
          {(item.instructions || item.special_instructions) && !isEditingNotes && (
            <div className="small text-muted fst-italic mb-1" style={{ fontSize: '11px' }}>
              Note: "{item.instructions || item.special_instructions}"
            </div>
          )}

          {/* Edit / Clear Controls */}
          {isEditingNotes ? (
            <div className="mt-2">
              <input
                type="text"
                value={notesInput}
                onChange={(e) => setNotesInput(e.target.value)}
                placeholder="Special cooking notes (e.g. less spicy)..."
                className="form-control form-control-sm mb-1.5"
                style={{ fontSize: '11.5px' }}
                autoFocus
              />
              <div className="d-flex gap-2">
                <button
                  type="button"
                  onClick={handleSaveNotes}
                  className="btn btn-xs btn-danger rounded-pill px-2.5 py-0.5 text-white fw-semibold"
                  style={{ fontSize: '11px' }}
                >
                  Save
                </button>
                <button
                  type="button"
                  onClick={() => setIsEditingNotes(false)}
                  className="btn btn-xs btn-outline-secondary rounded-pill px-2 py-0.5"
                  style={{ fontSize: '11px' }}
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <div className="d-flex align-items-center gap-2 mt-1">
              <button
                type="button"
                onClick={() => {
                  setNotesInput(item.instructions || item.special_instructions || '');
                  setIsEditingNotes(true);
                }}
                className="btn btn-link p-0 text-danger text-decoration-none small fw-semibold"
                style={{ fontSize: '11px' }}
              >
                {(item.instructions || item.special_instructions) ? 'Edit Note' : '+ Add Note'}
              </button>
              {extraList.length > 0 && (
                <>
                  <span className="text-muted small">|</span>
                  <button
                    type="button"
                    onClick={handleClearExtras}
                    className="btn btn-link p-0 text-secondary text-decoration-none small"
                    style={{ fontSize: '11px' }}
                  >
                    Clear Extras
                  </button>
                </>
              )}
            </div>
          )}
        </div>

        {/* Quantity and Price */}
        <div className="col-12 col-sm-4 d-flex align-items-center justify-content-between mt-3 mt-sm-0">
          <QuantityControl 
            quantity={item.quantity}
            onIncrease={onIncrease}
            onDecrease={onDecrease}
            onChange={onChange}
          />
          <div className="d-flex align-items-center gap-3">
            <span className="fw-bold text-dark fs-5">{formatCurrency(lineTotal)}</span>
            <button 
              onClick={onRemove}
              className="btn btn-link text-danger p-0 border-0 d-none d-sm-inline-block"
              aria-label="Remove item"
            >
              <i className="bi bi-trash3" style={{ fontSize: '18px' }}></i>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CartItem;
