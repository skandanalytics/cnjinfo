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

export const AddDishModal = ({
  isOpen,
  onClose,
  onAdd,
  defaultCategory = ''
}) => {
  const [name, setName] = useState('');
  const [price, setPrice] = useState('');
  const [discountPrice, setDiscountPrice] = useState('');
  const [discountPercent, setDiscountPercent] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState(defaultCategory || '');
  const [foodType, setFoodType] = useState('veg');
  const [stock, setStock] = useState('20');
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

  const handleAddTopping = () => {
    if (!toppingName.trim()) return;
    setToppings(prev => [...prev, { name: toppingName.trim(), extra_price: toppingPrice ? parseFloat(toppingPrice) : 0 }]);
    setToppingName('');
    setToppingPrice('');
  };

  const handleRemoveTopping = (index) => {
    setToppings(prev => prev.filter((_, i) => i !== index));
  };

  const [categories, setCategories] = useState([]);

  useEffect(() => {
    const loadCategories = async () => {
      try {
        const catList = await menuService.getMenus();
        const mapped = (catList || [])
          .filter(c => c.status !== 'Inactive' && c.is_active !== false)
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
        if (!seen.has('Combo Offer')) {
          unique.push({ value: 'Combo Offer', label: 'Combo Offer' });
          seen.add('Combo Offer');
        }
        if (defaultCategory && !seen.has(defaultCategory)) {
          unique.push({ value: defaultCategory, label: defaultCategory });
          seen.add(defaultCategory);
        }
        setCategories([{ value: '', label: 'Select a category' }, ...unique]);
      } catch (e) {
        console.error("Failed to load categories:", e);
      }
    };
    if (isOpen) {
      loadCategories();
      if (defaultCategory) {
        setCategory(defaultCategory);
      }
    }
  }, [isOpen, defaultCategory]);

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

  const handlePriceChange = (val) => {
    setPrice(val);
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

    if (!name.trim()) {
      setErrorMsg('Dish name is required.');
      return;
    }
    if (!category) {
      setErrorMsg('Please select a category.');
      return;
    }
    const origPrice = parseFloat(price);
    if (isNaN(origPrice) || origPrice < 0) {
      setErrorMsg('Price must be a positive number.');
      return;
    }
    
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

    const imageUrl = imageMode === 'url' ? image.trim() : '';
    if (imageUrl && !isHttpUrl(imageUrl)) {
      setErrorMsg('Image URL must be a full http:// or https:// address.');
      return;
    }

    setLoading(true);
    try {
      await onAdd({
        name: name.trim(),
        price: origPrice,
        discountPrice: discPrice,
        discountPercent: discPct,
        description: description.trim(),
        category,
        type: foodType,
        foodType: foodType,
        stock: stockNum,
        imageUrl,
        imageFile: imageMode === 'file' ? imageFile : null,
        toppings: toppings.map(t => ({ name: t.name, extra_price: t.extra_price, price: t.extra_price })),
        customizations: toppings.map(t => ({ name: t.name, extra_price: t.extra_price, price: t.extra_price })),
      });
      setLoading(false);

      setName('');
      setPrice('');
      setDiscountPrice('');
      setDiscountPercent('');
      setDescription('');
      setCategory(defaultCategory || '');
      setFoodType('veg');
      setStock('20');
      setImage('');
      setImageFile(null);
      setImageMode('file');
      setToppings([]);
      setToppingName('');
      setToppingPrice('');
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
      setErrorMsg('');
      onClose();
    } catch (err) {
      console.error('Error creating dish:', err);
      setLoading(false);
      if (err.dishSaved) {
        window.alert(err.message);
        onClose();
        return;
      }
      setErrorMsg(extractApiErrorMessage(err, 'Unable to create dish. Please check the entered data.'));
    }
  };

  const footerActions = (
    <>
      <Button variant="light" onClick={onClose} disabled={loading}>
        Cancel
      </Button>
      <Button variant="primary" onClick={handleSubmit} loading={loading}>
        Add Dish
      </Button>
    </>
  );

  return (
    <Modal isOpen={isOpen} title="Add New Dish" onClose={onClose} footerActions={footerActions}>
      <form onSubmit={handleSubmit}>
        {errorMsg && (
          <div className="alert alert-danger py-2 small fw-semibold mb-3">{errorMsg}</div>
        )}

        <Input 
          label="Dish Name" 
          placeholder="e.g. Garlic Bread sticks" 
          value={name} 
          onChange={(e) => setName(e.target.value)} 
          required 
        />
        
        <div className="row">
          <div className="col-4">
            <Input 
              label="Original Price (₹)" 
              type="number"
              placeholder="e.g. 199" 
              value={price} 
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

        <Input 
          label="Stock Quantity (Optional)" 
          type="number"
          placeholder="e.g. 50" 
          value={stock} 
          onChange={(e) => setStock(e.target.value)} 
        />

        <Select 
          label="Category"
          options={categories}
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          required
        />

        <Select 
          label="Food Type (Veg / Non-Veg / Vegan)"
          options={foodTypes}
          value={foodType}
          onChange={(e) => setFoodType(e.target.value)}
          required
        />

        <div className="mb-3 text-start">
          <label className="form-label text-secondary small fw-semibold mb-1">
            Food Image <span className="text-danger">*</span>
          </label>
          <div className="d-flex p-1 bg-light rounded-3 border mb-2" role="group">
            <button
              type="button"
              className={`btn btn-sm flex-fill rounded-2 fw-semibold transition-all ${imageMode === 'file' ? 'bg-danger text-white shadow-xs' : 'text-secondary border-0 bg-transparent'}`}
              style={{ fontSize: '12px' }}
              onClick={() => handleImageModeSwitch('file')}
            >
              📁 Choose File
            </button>
            <button
              type="button"
              className={`btn btn-sm flex-fill rounded-2 fw-semibold transition-all ${imageMode === 'url' ? 'bg-danger text-white shadow-xs' : 'text-secondary border-0 bg-transparent'}`}
              style={{ fontSize: '12px' }}
              onClick={() => handleImageModeSwitch('url')}
            >
              🔗 Image URL
            </button>
          </div>

          {imageMode === 'file' ? (
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="form-control form-control-sm border-light-subtle"
              onChange={handleImageFileChange}
            />
          ) : (
            <input
              type="text"
              className="form-control form-control-sm border-light-subtle"
              placeholder="Paste image URL (e.g. https://...)"
              value={image}
              onChange={(e) => {
                setImage(e.target.value);
                setImageFile(null);
              }}
            />
          )}

          {image && (
            <div className="d-flex align-items-center gap-2 mt-2 p-2 bg-light rounded-3 border">
              <img 
                src={image} 
                alt="Preview" 
                className="rounded-2 border bg-white" 
                style={{ width: '48px', height: '48px', objectFit: 'cover' }}
                onError={(e) => { e.currentTarget.style.display = 'none'; }}
              />
              <div className="flex-grow-1 overflow-hidden">
                <div className="small fw-semibold text-truncate text-dark" style={{ fontSize: '12px' }}>
                  {imageMode === 'file' ? 'Uploaded Image Selected' : image}
                </div>
                <button
                  type="button"
                  onClick={handleRemoveImage}
                  className="btn btn-sm btn-link text-danger p-0 text-decoration-none small fw-semibold"
                  style={{ fontSize: '11px' }}
                >
                  Remove Image
                </button>
              </div>
            </div>
          )}
        </div>

        <Input 
          label="Description" 
          placeholder="Detail recipe ingredients" 
          value={description} 
          onChange={(e) => setDescription(e.target.value)} 
        />

        {/* Toppings / Customizations Add-on Section */}
        <div className="mb-3 text-start">
          <label className="form-label text-secondary small fw-semibold mb-1">
            Toppings / Add-ons (Optional)
          </label>
          <div className="d-flex gap-2 mb-2">
            <input
              type="text"
              placeholder="e.g. Extra Cheese"
              value={toppingName}
              onChange={(e) => setToppingName(e.target.value)}
              className="form-control form-control-sm"
              style={{ flex: 2 }}
            />
            <input
              type="number"
              placeholder="Price (₹)"
              value={toppingPrice}
              onChange={(e) => setToppingPrice(e.target.value)}
              className="form-control form-control-sm"
              style={{ flex: 1 }}
              min="0"
            />
            <button
              type="button"
              onClick={handleAddTopping}
              disabled={!toppingName.trim()}
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
      </form>
    </Modal>
  );
};
export default AddDishModal;
