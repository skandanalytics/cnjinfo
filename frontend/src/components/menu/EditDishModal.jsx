import React, { useState, useEffect, useRef } from 'react';
import api from '../../services/api';
import { getFrontendCategoryName } from '../../utils/categoryUtils';
import { compressImageFile, isHttpUrl } from '../../utils/imageUtils';
import { extractApiErrorMessage } from '../../utils/errorUtils';
import { menuService } from '../../services/menuService';
import Modal from '../common/Modal';
import Input from '../common/Input';
import Select from '../common/Select';
import Button from '../common/Button';
import { FiPlus, FiTrash2 } from 'react-icons/fi';

export const EditDishModal = ({
  isOpen,
  dish,
  onClose,
  onSave,
  pricingOnly = false
}) => {
  const [name, setName] = useState('');
  const [price, setPrice] = useState('');
  const [discountPrice, setDiscountPrice] = useState('');
  const [discountPercent, setDiscountPercent] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('');
  const [foodType, setFoodType] = useState('veg');
  const [stock, setStock] = useState('');
  const [image, setImage] = useState('');
  const [imageFile, setImageFile] = useState(null);
  const [imageMode, setImageMode] = useState('file'); // 'file' | 'url'
  const fileInputRef = useRef(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [loading, setLoading] = useState(false);

  // Toppings / Add-ons state
  const [toppings, setToppings] = useState([]);
  const [toppingName, setToppingName] = useState('');
  const [toppingPrice, setToppingPrice] = useState('');

  // Validation: name must be non-empty after trimming, price must be valid non-negative number <= 999 (0 is accepted, max 3 digits)
  const isToppingNameValid = toppingName.trim().length > 0;
  const isToppingPriceValid = toppingPrice.trim() !== '' && !isNaN(Number(toppingPrice.trim())) && Number(toppingPrice.trim()) >= 0 && Number(toppingPrice.trim()) <= 999;
  const isToppingValid = isToppingNameValid && isToppingPriceValid;

  const handleAddTopping = () => {
    const trimmedName = toppingName.trim();
    const trimmedPrice = toppingPrice.trim();
    if (!trimmedName) {
      setErrorMsg('Topping name is required.');
      return;
    }
    if (/^\d+$/.test(trimmedName)) {
      setErrorMsg('Topping name cannot be numeric only.');
      return;
    }
    if (trimmedPrice === '' || isNaN(Number(trimmedPrice)) || Number(trimmedPrice) < 0) {
      setErrorMsg('Please enter a valid topping price.');
      return;
    }
    if (Number(trimmedPrice) > 999) {
      setErrorMsg('Topping price cannot exceed ₹999 (maximum 3 digits).');
      return;
    }
    const capName = trimmedName.charAt(0).toUpperCase() + trimmedName.slice(1);
    setToppings(prev => [...prev, { name: capName, extra_price: parseFloat(trimmedPrice) }]);
    setToppingName('');
    setToppingPrice('');
    setErrorMsg('');
  };

  const handleRemoveTopping = (index) => {
    setToppings(prev => prev.filter((_, i) => i !== index));
  };

  const [categories, setCategories] = useState([]);
  const [loadingCategories, setLoadingCategories] = useState(false);
  const [categoryError, setCategoryError] = useState('');

  useEffect(() => {
    let cancelled = false;
    const loadCategories = async () => {
      setLoadingCategories(true);
      setCategoryError('');
      try {
        const catList = await menuService.getMenus(dish?.branch);
        if (cancelled) return;
        const mapped = (catList || [])
          .filter(c => !dish?.branch || String(c.branch) === String(dish.branch))
          .filter(c => (c.status !== 'Inactive' && c.is_active !== false) || String(c.id) === String(dish?.categoryId))
          .map(c => {
            const label = getFrontendCategoryName(c.name);
            return { value: label, label };
          });
        const unique = [];
        const seen = new Set();
        for (const cat of mapped) {
          if (!seen.has(cat.value)) {
            seen.add(cat.value);
            unique.push(cat);
          }
        }
        if (unique.length === 0) {
          setCategories([{ value: '', label: 'No categories available', disabled: true }]);
        } else {
          setCategories([{ value: '', label: 'Select a category' }, ...unique]);
        }
      } catch (e) {
        if (cancelled) return;
        console.error("Failed to load categories:", e);
        setCategoryError(e.message || 'Failed to load categories.');
        setCategories([{ value: '', label: 'Failed to load categories', disabled: true }]);
      } finally {
        if (!cancelled) setLoadingCategories(false);
      }
    };
    if (isOpen) {
      loadCategories();
    }
    return () => { cancelled = true; };
  }, [isOpen, dish?.id, dish?.branch, dish?.categoryId, dish?.category]);

  const foodTypes = [
    { value: 'veg', label: 'Vegetarian (Veg)' },
    { value: 'non-veg', label: 'Non-Vegetarian (Non-Veg)' },
    { value: 'vegan', label: 'Vegan' }
  ];

  const handleImageModeSwitch = (mode) => {
    if (mode === imageMode) return;
    setImageMode(mode);
    setImage('');
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleImageFileChange = async (e) => {
    const file = e.target.files[0];
    if (file) {
      if (!file.type.startsWith('image/')) {
        setErrorMsg('Please select a valid image file (PNG, JPG, JPEG, WEBP).');
        return;
      }
      if (file.size > 5 * 1024 * 1024) {
        setErrorMsg('Image file size must be less than 5MB.');
        return;
      }
      try {
        const compressed = await compressImageFile(file);
        const actualFile = compressed.file || file;
        const dataUrl = typeof compressed === 'string' ? compressed : (compressed.dataUrl || compressed.previewUrl || '');
        setImageFile(actualFile);
        setImage(dataUrl);
        setErrorMsg('');
      } catch (err) {
        console.error("Error compressing image:", err);
        setErrorMsg('Failed to process image file. Please try again.');
      }
    }
  };

  const handleRemoveImage = () => {
    setImage('');
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  useEffect(() => {
    if (dish && isOpen) {
      setName(dish.name || '');
      const basePrice = dish.originalPrice ?? dish.price;
      setPrice(basePrice !== undefined && basePrice !== null ? String(basePrice) : '');
      const discPrice = (dish.hasDiscount || (dish.discountPercent && dish.discountPercent > 0))
        ? (dish.discountPrice ?? dish.sellingPrice)
        : '';
      setDiscountPrice(discPrice && Number(discPrice) > 0 && Number(discPrice) < Number(basePrice) ? String(discPrice) : '');
      setDiscountPercent(dish.discountPercent !== undefined && dish.discountPercent > 0 ? String(dish.discountPercent) : '');
      setDescription(dish.description || '');
      setCategory(dish.category ? getFrontendCategoryName(dish.category) : '');
      setFoodType((dish.foodType || dish.type || 'veg').toLowerCase());
      setStock(dish.stock !== undefined && dish.stock !== null ? String(dish.stock) : '');
      setImage(dish.imageUrl || dish.image || '');
      setImageFile(null);
      setImageMode(dish.imageUrl ? 'url' : 'file');
      const existingToppings = Array.isArray(dish.customizations) ? dish.customizations.map(c => ({
        id: c.id,
        name: c.name,
        extra_price: c.extra_price ?? c.price ?? 0,
      })) : [];
      setToppings(existingToppings);
      setToppingName('');
      setToppingPrice('');
      setErrorMsg('');
    }
  }, [dish, isOpen]);

  const handlePriceChange = (val) => {
    let cleanVal = String(val || '').replace(/[eE+\-]/g, '');
    if (cleanVal.length > 6) {
      cleanVal = cleanVal.slice(0, 6);
    }
    setPrice(cleanVal);
    val = cleanVal;
    const origPrice = parseFloat(val);
    const pct = parseFloat(discountPercent);
    if (!isNaN(origPrice) && origPrice > 0 && !isNaN(pct) && pct > 0) {
      const clampedPct = Math.min(100, Math.max(0, pct));
      const calculatedDiscPrice = Math.max(0, Math.round(origPrice * (1 - clampedPct / 100)));
      setDiscountPrice(String(calculatedDiscPrice));
    } else if (!val || isNaN(origPrice) || origPrice <= 0) {
      if (pct) setDiscountPrice('');
    }
  };

  const handleDiscountPercentChange = (val) => {
    let sanitizedVal = val;
    if (val !== '' && !isNaN(val)) {
      const num = parseFloat(val);
      if (num > 100) {
        sanitizedVal = '100';
      } else if (num < 0) {
        sanitizedVal = '0';
      }
    }
    setDiscountPercent(sanitizedVal);
    const pct = parseFloat(sanitizedVal);
    const origPrice = parseFloat(price);
    if (!isNaN(pct) && pct > 0 && !isNaN(origPrice) && origPrice > 0) {
      const clampedPct = Math.min(100, Math.max(0, pct));
      const calculatedDiscPrice = Math.max(0, Math.round(origPrice * (1 - clampedPct / 100)));
      setDiscountPrice(String(calculatedDiscPrice));
    } else if (sanitizedVal === '' || isNaN(pct) || pct <= 0) {
      setDiscountPrice('');
    }
  };

  const handleDiscountPriceChange = (val) => {
    setDiscountPrice(val);
    const discPrice = parseFloat(val);
    const origPrice = parseFloat(price);
    if (!isNaN(discPrice) && discPrice >= 0 && !isNaN(origPrice) && origPrice > 0) {
      if (discPrice >= origPrice) {
        setDiscountPercent('0');
      } else {
        const calculatedPct = Math.min(100, Math.max(0, Math.round(((origPrice - discPrice) / origPrice) * 100)));
        setDiscountPercent(String(calculatedPct));
      }
    } else if (val === '' || isNaN(discPrice) || discPrice <= 0) {
      setDiscountPercent('');
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrorMsg('');

    const trimmedName = name.trim();
    if (!trimmedName) {
      setErrorMsg('Dish name is required.');
      return;
    }
    if (/^\d+$/.test(trimmedName)) {
      setErrorMsg('Dish name cannot be numeric only.');
      return;
    }
    const capitalizedName = trimmedName.charAt(0).toUpperCase() + trimmedName.slice(1);

    if (!category) {
      setErrorMsg('Please select a category.');
      return;
    }
    const origPrice = parseFloat(price);
    if (isNaN(origPrice) || origPrice <= 0) {
      setErrorMsg('Original price must be greater than 0.');
      return;
    }
    if (origPrice > 999999) {
      setErrorMsg('Original price cannot exceed 6 digits (maximum ₹999,999).');
      return;
    }

    const trimmedDesc = description.trim();
    const capitalizedDesc = trimmedDesc ? trimmedDesc.charAt(0).toUpperCase() + trimmedDesc.slice(1) : '';
    
    let discPrice = parseFloat(discountPrice) || 0;
    let discPct = parseFloat(discountPercent) || 0;

    if (discPct > 100) {
      setErrorMsg('Discount percentage cannot exceed 100%.');
      return;
    }
    if (discPct < 0) {
      setErrorMsg('Discount percentage cannot be negative.');
      return;
    }

    if (discPct > 0 && discPrice === 0) {
      discPrice = Math.max(0, Math.round(origPrice * (1 - discPct / 100)));
    } else if (discPrice > 0 && origPrice > 0 && !discPct) {
      discPct = Math.min(100, Math.max(0, Math.round(((origPrice - discPrice) / origPrice) * 100)));
    }

    if (discPrice > 0 && discPrice > origPrice) {
      setErrorMsg('Discount price cannot be greater than original price.');
      return;
    }

    const stockNum = stock && stock.trim() !== '' ? Number(stock) : undefined;
    if (stockNum !== undefined && (!Number.isInteger(stockNum) || stockNum < 0)) {
      setErrorMsg('Stock quantity must be a whole number of 0 or more.');
      return;
    }

    const imageChanges = {};
    if (imageMode === 'file' && imageFile) {
      imageChanges.imageFile = imageFile;
    } else if (imageMode === 'url') {
      const nextUrl = image.trim();
      if (nextUrl && !isHttpUrl(nextUrl)) {
        setErrorMsg('Image URL must be a full http:// or https:// address.');
        return;
      }
      if (nextUrl !== (dish.imageUrl || '')) imageChanges.imageUrl = nextUrl;
    }

    setLoading(true);
    try {
      await onSave(dish.id, {
        name: capitalizedName,
        price: origPrice,
        discountPrice: discPrice,
        discountPercent: discPct,
        description: capitalizedDesc,
        category,
        type: foodType,
        foodType: foodType,
        stock: stockNum,
        toppings: toppings.map(t => ({ id: t.id, name: t.name, extra_price: t.extra_price, price: t.extra_price })),
        customizations: toppings.map(t => ({ id: t.id, name: t.name, extra_price: t.extra_price, price: t.extra_price })),
        ...imageChanges
      });
      setLoading(false);
      onClose();
    } catch (err) {
      console.error('Error updating dish:', err);
      const apiErr = extractApiErrorMessage(err, 'Unable to update dish. Please check the entered data.');
      setLoading(false);
      setErrorMsg(apiErr);
    }
  };

  const footerActions = (
    <div className="d-flex align-items-center justify-content-end gap-3 w-100">
      <button
        type="button"
        onClick={onClose}
        disabled={loading}
        className="btn rounded-pill px-4 fw-bold"
        style={{
          height: '42px',
          backgroundColor: '#FFFFFF',
          color: 'var(--primary-color, #F20D2D)',
          border: '1.5px solid var(--primary-color, #F20D2D)',
          fontSize: '13px'
        }}
      >
        Cancel
      </button>
      <button
        type="button"
        onClick={handleSubmit}
        disabled={loading}
        className="btn btn-danger rounded-pill px-4 fw-bold shadow-sm border-0"
        style={{
          height: '42px',
          backgroundColor: 'var(--primary-color, #F20D2D)',
          fontSize: '13px'
        }}
      >
        {loading ? 'Saving...' : 'Save Menu'}
      </button>
    </div>
  );

  return (
    <Modal isOpen={isOpen} title={pricingOnly ? "Edit Pricing" : "Edit Menu Item"} onClose={onClose} footerActions={footerActions} size={pricingOnly ? "md" : "lg"}>
      <form onSubmit={handleSubmit}>
        {errorMsg && (
          <div className="alert alert-danger py-2 small fw-semibold mb-3">{errorMsg}</div>
        )}

        {pricingOnly ? (
          <div className="row g-2">
            <div className="col-4">
              <Input 
                label="Price (₹) *" 
                type="number"
                placeholder="e.g. 199" 
                value={price} 
                onKeyDown={(e) => {
                  if (['e', 'E', '+', '-'].includes(e.key)) e.preventDefault();
                }}
                onChange={(e) => handlePriceChange(e.target.value)} 
                required 
              />
            </div>
            <div className="col-4">
              <Input 
                label="Discount (%)" 
                type="number"
                min="0"
                max="100"
                placeholder="e.g. 25" 
                value={discountPercent} 
                onChange={(e) => handleDiscountPercentChange(e.target.value)} 
              />
            </div>
            <div className="col-4">
              <Input 
                label="Discount Price (₹)" 
                type="number"
                placeholder="e.g. 149" 
                value={discountPrice} 
                onChange={(e) => handleDiscountPriceChange(e.target.value)} 
              />
            </div>
          </div>
        ) : (
          <div className="row g-4">
            {/* Left Column: Image Upload */}
            <div className="col-12 col-md-4">
              <label className="form-label text-secondary small fw-semibold mb-1">
                Food Image
              </label>

              <div className="d-flex p-1 bg-light rounded-3 border mb-2" role="group">
                <button
                  type="button"
                  className={`btn btn-sm flex-fill rounded-2 fw-semibold transition-all ${imageMode === 'file' ? 'text-white shadow-xs' : 'text-secondary border-0 bg-transparent'}`}
                  style={{ fontSize: '11.5px', backgroundColor: imageMode === 'file' ? 'var(--primary-color, #F20D2D)' : 'transparent' }}
                  onClick={() => handleImageModeSwitch('file')}
                >
                  📁 File
                </button>
                <button
                  type="button"
                  className={`btn btn-sm flex-fill rounded-2 fw-semibold transition-all ${imageMode === 'url' ? 'text-white shadow-xs' : 'text-secondary border-0 bg-transparent'}`}
                  style={{ fontSize: '11.5px', backgroundColor: imageMode === 'url' ? 'var(--primary-color, #F20D2D)' : 'transparent' }}
                  onClick={() => handleImageModeSwitch('url')}
                >
                  🔗 URL
                </button>
              </div>

              {/* Image Preview / Drop Zone */}
              <div 
                className="border rounded-3 p-2 text-center d-flex flex-column align-items-center justify-content-center position-relative mb-2"
                style={{ minHeight: '180px', backgroundColor: 'var(--background-color)', borderColor: 'var(--border-subtle)', borderStyle: 'dashed' }}
              >
                {image ? (
                  <div className="position-relative w-100">
                    <img 
                      src={image} 
                      alt="Preview" 
                      className="w-100 rounded-3 shadow-xs" 
                      style={{ height: '160px', objectFit: 'cover' }}
                      onError={(e) => { e.currentTarget.style.display = 'none'; }}
                    />
                    <button
                      type="button"
                      onClick={handleRemoveImage}
                      className="btn btn-sm btn-danger position-absolute top-0 end-0 m-1 rounded-circle p-1 shadow-sm"
                      style={{ width: '26px', height: '26px', lineHeight: 1 }}
                      title="Remove Image"
                    >
                      ×
                    </button>
                  </div>
                ) : (
                  <div className="py-4 text-secondary">
                    <span className="fs-1 d-block mb-1">📸</span>
                    <span className="small d-block fw-semibold">Upload Dish Photo</span>
                    <span className="text-muted" style={{ fontSize: '10.5px' }}>PNG, JPG or WebP</span>
                  </div>
                )}
              </div>

              {imageMode === 'file' ? (
                <input
                  key="edit-dish-image-file-input"
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  className="form-control form-control-sm"
                  onChange={handleImageFileChange}
                />
              ) : (
                <input
                  key="edit-dish-image-url-input"
                  type="text"
                  className="form-control form-control-sm"
                  placeholder="Paste image URL (https://...)"
                  value={image || ''}
                  onChange={(e) => {
                    setImage(e.target.value);
                    setImageFile(null);
                  }}
                />
              )}
            </div>

            {/* Right Column: Dish Information Fields */}
            <div className="col-12 col-md-8">
              <Input 
                label="Dish Name *" 
                placeholder="e.g. Garlic Bread sticks" 
                value={name || ''} 
                onChange={(e) => {
                  const v = e.target.value;
                  if (v.length === 1) setName(v.toUpperCase());
                  else if (v.length > 1 && name.length === 0) setName(v.charAt(0).toUpperCase() + v.slice(1));
                  else setName(v);
                }} 
                required 
              />

              <div className="row g-2">
                <div className="col-6">
                  <Select 
                    label="Category"
                    options={loadingCategories ? [{ value: '', label: 'Loading categories...', disabled: true }] : categories}
                    value={category || ''}
                    onChange={(e) => setCategory(e.target.value)}
                    disabled={loadingCategories}
                    error={categoryError || ''}
                    required
                  />
                  {categoryError && (
                    <div className="text-danger small mt-n2 mb-2">{categoryError}</div>
                  )}
                  {!loadingCategories && !categoryError && categories.length > 0 && categories[0].disabled && (
                    <div className="text-muted small mt-n2 mb-2">No categories available for this branch.</div>
                  )}
                </div>
                <div className="col-6">
                  <Select 
                    label="Food Type"
                    options={foodTypes}
                    value={foodType || 'veg'}
                    onChange={(e) => setFoodType(e.target.value)}
                    required
                  />
                </div>
              </div>

              <div className="row g-2">
                <div className="col-4">
                  <Input 
                    label="Price (₹) *" 
                    type="number"
                    placeholder="e.g. 199" 
                    value={price || ''} 
                    onKeyDown={(e) => {
                      if (['e', 'E', '+', '-'].includes(e.key)) e.preventDefault();
                    }}
                    onChange={(e) => handlePriceChange(e.target.value)} 
                    required 
                  />
                </div>
                <div className="col-4">
                  <Input 
                    label="Discount (%)" 
                    type="number"
                    min="0"
                    max="100"
                    placeholder="e.g. 25" 
                    value={discountPercent || ''} 
                    onChange={(e) => handleDiscountPercentChange(e.target.value)} 
                  />
                </div>
                <div className="col-4">
                  <Input 
                    label="Discount Price (₹)" 
                    type="number"
                    placeholder="e.g. 149" 
                    value={discountPrice || ''} 
                    onChange={(e) => handleDiscountPriceChange(e.target.value)} 
                  />
                </div>
              </div>

              <div className="row g-2">
                <div className="col-6">
                  <Input 
                    label="Stock Quantity" 
                    type="number"
                    min="0"
                    placeholder="e.g. 50" 
                    value={stock ?? '0'} 
                    onKeyDown={(e) => {
                      if (['-', '+', 'e', 'E'].includes(e.key)) e.preventDefault();
                    }}
                    onChange={(e) => {
                      const val = e.target.value;
                      if (val === '' || Number(val) >= 0) setStock(val);
                    }} 
                  />
                </div>
                <div className="col-6">
                  <Input 
                    label="Description" 
                    placeholder="Detail recipe ingredients" 
                    value={description || ''} 
                    onChange={(e) => {
                      const v = e.target.value;
                      if (v.length === 1) setDescription(v.toUpperCase());
                      else if (v.length > 1 && description.length === 0) setDescription(v.charAt(0).toUpperCase() + v.slice(1));
                      else setDescription(v);
                    }} 
                  />
                </div>
              </div>

              {/* Toppings / Customizations Add-on Section */}
              <div className="mt-3 text-start border-top pt-2">
                <label className="form-label text-secondary small fw-semibold mb-1">
                  Toppings / Add-ons (Optional)
                </label>
                <div className="d-flex gap-2 mb-2">
                  <input
                    type="text"
                    placeholder="e.g. Extra Cheese"
                    value={toppingName || ''}
                    onChange={(e) => setToppingName(e.target.value)}
                    className="form-control form-control-sm"
                    style={{ flex: 2 }}
                  />
                  <input
                    type="number"
                    placeholder="Price (₹)"
                    value={toppingPrice || ''}
                    onChange={(e) => {
                      const cleanVal = e.target.value.replace(/[^0-9]/g, '').slice(0, 3);
                      setToppingPrice(cleanVal);
                    }}
                    className="form-control form-control-sm"
                    style={{ flex: 1 }}
                    min="0"
                    max="999"
                    maxLength={3}
                  />
                  <button
                    type="button"
                    onClick={handleAddTopping}
                    disabled={!isToppingValid}
                    className="btn btn-sm btn-outline-danger d-flex align-items-center gap-1 rounded-pill px-3 fw-bold"
                  >
                    <FiPlus size={14} /> Add
                  </button>
                </div>
                {toppings.length > 0 && (
                  <div className="d-flex flex-wrap gap-2 pt-1">
                    {toppings.map((t, idx) => (
                      <span
                        key={idx}
                        className="badge bg-light text-dark border d-inline-flex align-items-center gap-1.5 px-2.5 py-1.5 rounded-pill shadow-xs"
                        style={{ fontSize: '12px' }}
                      >
                        <span className="fw-semibold">{t.name}</span>
                        <span className="text-secondary small">(+₹{t.extra_price})</span>
                        <button
                          type="button"
                          onClick={() => handleRemoveTopping(idx)}
                          className="btn btn-link text-danger p-0 ms-1 d-inline-flex align-items-center"
                          style={{ lineHeight: 1 }}
                          title="Remove topping"
                        >
                          <FiTrash2 size={12} />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </form>
    </Modal>
  );
};

export default EditDishModal;
