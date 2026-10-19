import React, { useEffect, useState, useRef } from 'react';
import formatCurrency from '../../utils/formatCurrency';
import QuantityControl from './QuantityControl';
import { FiTrash2 } from 'react-icons/fi';
import { getProductSellingPrice } from '../../utils/pricing';
import { getImageUrl, FOOD_IMAGE_PLACEHOLDER } from '../../utils/imageUtils';
import { normalizeFoodType } from '../../utils/filters';

export const CartItem = ({
  item,
  onIncrease,
  onDecrease,
  onChange,
  onRemove,
  onUpdateInstructions
}) => {
  const [showEdit, setShowEdit] = useState(false);
  const [instructionText, setInstructionText] = useState(item.instructions || '');
  const [selectedExtras, setSelectedExtras] = useState(item.extraIngredients || []);
  const [isRemoving, setIsRemoving] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [fetchedAddons, setFetchedAddons] = useState(null);
  const [addonError, setAddonError] = useState('');
  const [addonLoading, setAddonLoading] = useState(!Array.isArray(item.customizations));
  
  const debounceTimerRef = useRef(null);

  useEffect(() => {
    if (!showEdit) {
      setInstructionText(item.instructions || '');
      setSelectedExtras(item.extraIngredients || []);
    }
  }, [item.instructions, item.extraIngredients, item.lineId, showEdit]);

  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (Array.isArray(item.customizations)) {
      setFetchedAddons(null);
      setAddonError('');
      setAddonLoading(false);
      return undefined;
    }
    let cancelled = false;
    setAddonLoading(true);
    setAddonError('');
    import('../../services/productService')
      .then(({ productService }) => productService.getProductById(item.id))
      .then((product) => {
        if (cancelled) return;
        setFetchedAddons(Array.isArray(product?.customizations) ? product.customizations : []);
        setAddonLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        setFetchedAddons(null);
        setAddonError('Add-ons could not be loaded. Please try again.');
        setAddonLoading(false);
      });
    return () => { cancelled = true; };
  }, [item.id, item.customizations, item.lineId]);

  const triggerDebouncedSave = (newText, extras) => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }
    setIsSaving(true);
    setSaveError('');
    debounceTimerRef.current = setTimeout(async () => {
      try {
        await onUpdateInstructions(item.lineId || item.cartItemId || item.id, newText, extras);
      } catch (err) {
        setSaveError(err.message || 'Could not auto-save instructions.');
      } finally {
        setIsSaving(false);
      }
    }, 500);
  };

  const handleCustomInstructionsChange = (e) => {
    const text = e.target.value;
    setInstructionText(text);
    triggerDebouncedSave(text, selectedExtras);
  };

  const handleCustomInstructionsBlur = async () => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }
    setIsSaving(true);
    setSaveError('');
    try {
      await onUpdateInstructions(item.lineId || item.cartItemId || item.id, instructionText, selectedExtras);
    } catch (err) {
      setSaveError(err.message || 'Could not auto-save instructions.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleToggleAddon = async (addon) => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }
    const isChecked = selectedExtras.some((ing) => String(ing.id) === String(addon.id));
    const nextExtras = isChecked
      ? selectedExtras.filter((ing) => String(ing.id) !== String(addon.id))
      : [...selectedExtras.filter((ing) => String(ing.id) !== String(addon.id)), addon];
    setSelectedExtras(nextExtras);
    setIsSaving(true);
    setSaveError('');
    try {
      await onUpdateInstructions(item.lineId || item.cartItemId || item.id, instructionText, nextExtras);
    } catch (err) {
      setSaveError(err.message || 'The topping change could not be saved.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleSelectPrepPill = async (inst) => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }
    let nextText = '';
    const trimmed = (instructionText || '').trim();
    if (!trimmed) {
      nextText = inst;
    } else {
      const regex = new RegExp(`(^|,\\s*)${inst}(,\\s*|$)`, 'i');
      if (regex.test(trimmed)) {
        nextText = trimmed.replace(regex, '$2').replace(/^,\s*/, '').replace(/,\s*$/, '');
      } else {
        nextText = `${trimmed}, ${inst}`;
      }
    }
    setInstructionText(nextText);
    setIsSaving(true);
    setSaveError('');
    try {
      await onUpdateInstructions(item.lineId || item.cartItemId || item.id, nextText, selectedExtras);
    } catch (err) {
      setSaveError(err.message || 'Could not save note.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleCloseEdit = async () => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
      try {
        await onUpdateInstructions(item.lineId || item.cartItemId || item.id, instructionText, selectedExtras);
      } catch (err) {
        // Log or handle error
      }
    }
    setShowEdit(false);
  };

  const handleRemove = async () => {
    if (isRemoving) return;
    setIsRemoving(true);
    try {
      await onRemove();
    } finally {
      setIsRemoving(false);
    }
  };

  const foodType = normalizeFoodType(item.foodType || item.type || (item.is_veg === false || item.is_veg === 'false' ? 'non-veg' : 'veg'));
  const sourceAddons = Array.isArray(item.customizations) ? item.customizations : (fetchedAddons || []);
  const addonCatalog = sourceAddons
    .map((option) => ({
      id: option.id,
      name: option.name,
      price: Number(option.extra_price ?? option.price ?? 0),
    }))
    .filter((option) => option.id && option.name);
  const savedExtraPerUnit = (item.extraIngredients || []).reduce((sum, extra) => sum + Number(extra.price || extra.extra_price || 0), 0);
  const baseUnit = getProductSellingPrice(item);
  const displayUnit = item.finalUnitPrice != null ? Number(item.finalUnitPrice) : baseUnit + savedExtraPerUnit;

  return (
    <div className="card rounded-3 border-0 shadow-sm p-3 mb-3 bg-white d-flex flex-row align-items-center gap-3">
      <img 
        src={getImageUrl(item.image)} 
        alt={item.name} 
        className="rounded-3" 
        style={{ width: '70px', height: '70px', objectFit: 'cover', flexShrink: 0 }}
        onError={(event) => {
          console.error('Failed to load food image:', event.currentTarget.src);
          event.currentTarget.src = FOOD_IMAGE_PLACEHOLDER;
        }}
      />
      
      <div className="flex-grow-1 min-width-0 d-flex flex-column gap-2">
        {/* Name and Trash Icon Row */}
        <div className="d-flex align-items-start justify-content-between gap-2">
          <h6 className="fw-bold text-dark text-truncate mb-0 d-flex align-items-center gap-2" style={{ fontSize: '14px' }}>
            <span className={foodType === 'veg' ? 'veg-badge' : foodType === 'vegan' ? 'vegan-badge' : 'non-veg-badge'}></span>
            {item.name}
          </h6>
          <button 
            onClick={handleRemove}
            disabled={isRemoving}
            className="btn btn-sm btn-outline-light border-0 text-danger p-1 d-flex align-items-center justify-content-center"
            style={{ width: '28px', height: '28px', flexShrink: 0, opacity: isRemoving ? 0.5 : 1 }}
          >
            <FiTrash2 size={16} />
          </button>
        </div>
        
        {/* Price and Quantity Control Row */}
        <div className="d-flex align-items-center justify-content-between gap-2 flex-wrap">
          <div className="d-flex align-items-center gap-1.5 flex-wrap">
            {item.hasDiscount || item.discountPercent > 0 || (item.discountPrice > 0 && item.discountPrice < item.price) ? (
              <>
                <span className="text-decoration-line-through text-muted small" style={{ fontSize: '11px' }}>
                  {formatCurrency(item.price)}
                </span>
                <span className="fw-bold text-danger" style={{ fontSize: '14px' }}>
                  {formatCurrency(displayUnit)}
                </span>
              </>
            ) : (
              <span className="fw-bold text-danger" style={{ fontSize: '14px' }}>
                {formatCurrency(displayUnit)}
              </span>
            )}
          </div>
          <QuantityControl 
            quantity={item.quantity}
            max={item.stock}
            onIncrease={onIncrease}
            onDecrease={onDecrease}
            onChange={onChange}
          />
        </div>

        {/* Special Instructions Section */}
        <div className="mt-2 pt-2 border-top border-light-subtle">
          {(item.instructions || (item.extraIngredients && item.extraIngredients.length > 0)) ? (
            <div className="d-flex flex-column text-start gap-1">
              {item.instructions && (
                <span className="text-secondary" style={{ fontSize: '11px' }}>
                  <strong className="text-dark">Instructions:</strong> {item.instructions}
                </span>
              )}
              {item.extraIngredients && item.extraIngredients.length > 0 && (
                <span className="text-secondary" style={{ fontSize: '11px' }}>
                  <strong className="text-dark">Add-ons:</strong> {item.extraIngredients.map(ing => `${ing.name} (+${formatCurrency(ing.price)})`).join(', ')}
                </span>
              )}
              <div className="d-flex gap-2 mt-0.5">
                <button 
                  type="button" 
                  onClick={() => {
                    setInstructionText(item.instructions || '');
                    setSelectedExtras(item.extraIngredients || []);
                    setShowEdit(true);
                  }} 
                  className="btn btn-sm btn-link text-danger p-0 fw-semibold text-decoration-none" 
                  style={{ fontSize: '11px' }}
                >
                  Edit
                </button>
                <span className="text-muted" style={{ fontSize: '11px' }}>|</span>
                <button 
                  type="button" 
                  onClick={() => {
                    onUpdateInstructions(item.lineId || item.cartItemId || item.id, "", []);
                    setInstructionText("");
                    setSelectedExtras([]);
                  }} 
                  className="btn btn-sm btn-link text-secondary p-0 fw-semibold text-decoration-none" 
                  style={{ fontSize: '11px' }}
                >
                  Clear
                </button>
              </div>
            </div>
          ) : (
            !showEdit && (
              <button 
                type="button" 
                onClick={() => {
                  setInstructionText("");
                  setSelectedExtras([]);
                  setShowEdit(true);
                }} 
                className="btn btn-sm btn-link text-danger p-0 fw-semibold text-decoration-none d-flex align-items-center gap-1"
                style={{ fontSize: '11px' }}
              >
                + Add Instructions & Toppings
              </button>
            )
          )}

          {showEdit && (
            <div className="mt-3 p-3 rounded-3 bg-light border text-start">
              {saveError && (
                <div className="alert alert-danger py-1 px-2 small mb-2" style={{ fontSize: '11px' }}>
                  {saveError}
                </div>
              )}

              {/* Default instruction pills */}
              <div className="d-flex align-items-center justify-content-between mb-1.5">
                <label className="small fw-bold text-dark d-block mb-0" style={{ fontSize: '11px' }}>Select Preparation Note</label>
                {isSaving && (
                  <span className="text-secondary small d-flex align-items-center" style={{ fontSize: '10px' }}>
                    <span className="spinner-border spinner-border-sm me-1" style={{ width: '10px', height: '10px' }}></span>
                    Auto-saving…
                  </span>
                )}
              </div>
              <div className="d-flex flex-wrap gap-1.5 mb-3">
                {[
                  'Less Spicy', 'Extra Spicy', 'No Onion', 'No Garlic',
                  'Less Salt', 'No Cheese', 'Well Cooked', 'Serve Hot'
                ].map(inst => (
                  <button
                    key={inst}
                    type="button"
                    onClick={() => handleSelectPrepPill(inst)}
                    className={`btn btn-sm rounded-pill py-0.5 px-2.5 transition-all text-nowrap hover-bg-light-red ${
                      new RegExp(`(^|,\\s*)${inst}(,\\s*|$)`, 'i').test(instructionText)
                        ? 'btn-danger text-white border-danger'
                        : 'btn-outline-secondary'
                    }`}
                    style={{ fontSize: '9px', fontWeight: '500' }}
                  >
                    {inst}
                  </button>
                ))}
              </div>

              {/* Custom instructions input */}
              <input
                type="text"
                className="form-control form-control-sm mb-3"
                placeholder="Or enter custom instructions..."
                value={instructionText}
                onChange={handleCustomInstructionsChange}
                onBlur={handleCustomInstructionsBlur}
                style={{ fontSize: '12px' }}
              />

              {/* Extra toppings list */}
              <div className="d-flex align-items-center justify-content-between mb-1.5">
                <label className="small fw-bold text-dark d-block mb-0" style={{ fontSize: '11px' }}>Add Extra Ingredients & Toppings</label>
                {isSaving && (
                  <span className="text-secondary small d-flex align-items-center" style={{ fontSize: '10px' }}>
                    <span className="spinner-border spinner-border-sm me-1" style={{ width: '10px', height: '10px' }}></span>
                    Auto-saving…
                  </span>
                )}
              </div>
              <div className="d-flex flex-column gap-2 mb-3 p-2.5 rounded-3 border" style={{ backgroundColor: '#f8fafc' }}>
                {addonLoading && (
                  <span className="text-secondary small">Loading add-ons…</span>
                )}
                {!addonLoading && addonError && (
                  <span className="text-danger small">{addonError}</span>
                )}
                {!addonLoading && !addonError && addonCatalog.length === 0 && (
                  <span className="text-secondary small">No add-ons are available for this dish.</span>
                )}
                {addonCatalog.map(addon => {
                  const isChecked = selectedExtras.some((ing) => String(ing.id) === String(addon.id));
                  return (
                    <label
                      key={addon.id}
                      className="d-flex align-items-center justify-content-between cursor-pointer mb-0 p-2 rounded-2 transition-all"
                      style={{
                        backgroundColor: isChecked ? '#fff1f2' : '#ffffff',
                        border: isChecked ? '1px solid #fca5a5' : '1px solid #e2e8f0',
                        cursor: 'pointer'
                      }}
                    >
                      <div className="d-flex align-items-center gap-2">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => handleToggleAddon(addon)}
                          className="form-check-input mt-0"
                          style={{ width: '15px', height: '15px', cursor: 'pointer', accentColor: 'var(--primary-color)' }}
                        />
                        <span className="small fw-semibold" style={{ fontSize: '11.5px', color: isChecked ? '#991b1b' : '#334155' }}>
                          {addon.name} (+{formatCurrency(addon.price)})
                        </span>
                      </div>
                    </label>
                  );
                })}
              </div>

              {/* Pricing breakdown */}
              {(() => {
                const basePrice = getProductSellingPrice(item);
                const extraCharges = selectedExtras.reduce((sum, ing) => sum + ing.price, 0);
                const totalUnit = basePrice + extraCharges;
                return (
                  <div className="bg-white p-2.5 rounded-3 border mb-3">
                    <div className="d-flex justify-content-between text-secondary" style={{ fontSize: '10px' }}>
                      <span>Base Price:</span>
                      <span>{formatCurrency(basePrice)}</span>
                    </div>
                    {extraCharges > 0 && (
                      <div className="d-flex justify-content-between text-secondary mt-0.5" style={{ fontSize: '10px' }}>
                        <span>Add-on Charges:</span>
                        <span className="text-danger">+{formatCurrency(extraCharges)}</span>
                      </div>
                    )}
                    <div className="d-flex justify-content-between fw-bold text-dark border-top pt-1 mt-1" style={{ fontSize: '11.5px' }}>
                      <span>Unit Total:</span>
                      <span className="text-danger">{formatCurrency(totalUnit)}</span>
                    </div>
                    <div className="d-flex justify-content-between text-secondary mt-0.5" style={{ fontSize: '10px' }}>
                      <span>Item Subtotal ({item.quantity}x):</span>
                      <span>{formatCurrency(totalUnit * item.quantity)}</span>
                    </div>
                  </div>
                );
              })()}

              <div className="d-flex justify-content-between align-items-center pt-1">
                <div className="small" style={{ fontSize: '11px' }}>
                  {isSaving ? (
                    <span className="text-secondary d-inline-flex align-items-center">
                      <span className="spinner-border spinner-border-sm me-1.5" style={{ width: '10px', height: '10px' }}></span>
                      Saving…
                    </span>
                  ) : saveError ? (
                    <span className="text-danger fw-semibold">{saveError}</span>
                  ) : (
                    <span className="text-success fw-medium">✓ Saved</span>
                  )}
                </div>
                <button 
                  type="button" 
                  onClick={handleCloseEdit} 
                  className="btn btn-sm btn-light border py-1 px-3 fw-bold rounded-pill shadow-xs" 
                  style={{ fontSize: '11px' }}
                >
                  Done
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
export default CartItem;
