import api from './api';
import {
  getFrontendCategoryName,
  getBackendCategoryName,
  normalizeCategoryName
} from '../utils/categoryUtils';
import { classifyStock } from '../utils/stockStatus';

const _isValidId = (id) => {
  if (id === undefined || id === null) return false;
  const s = String(id).trim();
  return s !== '' && s !== 'undefined' && s !== 'null' && s !== 'NaN';
};

const mapStatusToFrontend = (status, stock) => {
  if (stock !== undefined && stock !== null && stock !== '') return classifyStock(stock);
  if (!status) return 'In Stock';
  const s = String(status).toUpperCase();
  if (s === 'IN_STOCK') return 'In Stock';
  if (s === 'OUT_OF_STOCK') return 'Out of Stock';
  if (s === 'LOW_STOCK') return 'Low Stock';
  return status;
};

const mapProductToFrontend = (food, categories, inventory, images) => {
  const foodId = food.id || food.food_id;
  const normName = String(food.name || '').trim().toLowerCase();

  // Check local saved category override first
  let savedCategories = {};
  try {
    savedCategories = JSON.parse(localStorage.getItem('foodie_dish_categories') || '{}');
  } catch (e) { }

  const savedCat = savedCategories[foodId];

  // Find category name from backend DB
  const backendCategoryId = (food.category && typeof food.category === 'object')
    ? (food.category.id || food.category.category_id)
    : food.category;

  const catObj = categories.find(c =>
    Number(c.id || c.category_id) === Number(backendCategoryId) ||
    normalizeCategoryName(c.name) === normalizeCategoryName(String(backendCategoryId || '')) ||
    normalizeCategoryName(c.name) === normalizeCategoryName(food.category_name || '')
  );

  let categoryName = 'Main Course';
  let resolvedCatId = Number(backendCategoryId);

  if (savedCat) {
    categoryName = getFrontendCategoryName(savedCat);
    const matchCat = categories.find(c => normalizeCategoryName(c.name) === normalizeCategoryName(savedCat));
    if (matchCat) resolvedCatId = Number(matchCat.id || matchCat.category_id);
  } else if (catObj) {
    categoryName = getFrontendCategoryName(catObj.name);
    resolvedCatId = Number(catObj.id || catObj.category_id);
  } else if (food.category_name) {
    categoryName = getFrontendCategoryName(food.category_name);
  } else if (typeof food.category === 'string' && isNaN(Number(food.category))) {
    categoryName = getFrontendCategoryName(food.category);
  }

  // Check local saved stock override first
  let savedStocks = {};
  try {
    savedStocks = JSON.parse(localStorage.getItem('foodie_dish_stocks') || '{}');
  } catch (e) { }

  const savedStockVal = savedStocks[foodId] !== undefined
    ? savedStocks[foodId]
    : (savedStocks[String(foodId)] !== undefined
      ? savedStocks[String(foodId)]
      : (savedStocks[Number(foodId)] !== undefined
        ? savedStocks[Number(foodId)]
        : (food.name && savedStocks[food.name] !== undefined
          ? savedStocks[food.name]
          : (normName && savedStocks[normName] !== undefined
            ? savedStocks[normName]
            : undefined))));

  // Find inventory details from backend DB
  const invObj = Array.isArray(inventory) ? inventory.find(i => {
    const rawFood = i.food !== undefined && i.food !== null ? i.food : i.food_item;
    const invFoodId = (rawFood && typeof rawFood === 'object') ? (rawFood.id || rawFood.food_id || rawFood.pk) : rawFood;
    return invFoodId !== undefined && invFoodId !== null && Number(invFoodId) === Number(foodId);
  }) : null;

  let stock = 20;
  if (food.stock_status || typeof food.is_orderable === 'boolean') {
    stock = food.is_orderable === false || food.stock_status === 'OUT_OF_STOCK'
      ? 0
      : (food.stock !== undefined && food.stock !== null && !isNaN(Number(food.stock))
        ? Number(food.stock)
        : (food.stock_status === 'LOW_STOCK' ? 5 : 20));
  } else if (invObj && invObj.quantity !== undefined && invObj.quantity !== null && !isNaN(Number(invObj.quantity))) {
    stock = parseFloat(invObj.quantity);
  } else if (savedStockVal !== undefined && savedStockVal !== null && !isNaN(Number(savedStockVal))) {
    stock = parseFloat(savedStockVal);
  } else if (food.stock !== undefined && food.stock !== null && !isNaN(Number(food.stock))) {
    stock = parseFloat(food.stock);
  } else if (food.is_available === false) {
    stock = 0;
  } else {
    stock = 20;
  }

  const status = classifyStock(stock);

  // Check nested images array directly attached to food object (if any)
  let foodObjImg = null;
  if (Array.isArray(food.images) && food.images.length > 0) {
    const p = food.images.find(i => typeof i === 'object' && i.is_primary) || food.images[0];
    foodObjImg = typeof p === 'string' ? p : (p?.image_url || p?.image || p?.image_path);
  } else if (Array.isArray(food.food_images) && food.food_images.length > 0) {
    const p = food.food_images.find(i => typeof i === 'object' && i.is_primary) || food.food_images[0];
    foodObjImg = typeof p === 'string' ? p : (p?.image_url || p?.image || p?.image_path);
  }

  // Find primary image URL from backend DB (cachedFoodImages endpoint)
  const foodImgs = Array.isArray(images)
    ? images.filter(img => Number(img.food_item || img.food) === Number(foodId))
    : [];

  // Sort foodImgs by highest ID so latest created/updated image record from DB is prioritized
  foodImgs.sort((a, b) => Number(b.id || b.image_id || 0) - Number(a.id || a.image_id || 0));

  const primaryImg = foodImgs.find(img => img.is_primary) || foodImgs[0];
  const dbImgUrl = primaryImg ? (primaryImg.image_url || primaryImg.image || primaryImg.image_path) : null;

  // primary_image is the backend's display image (admin URL first, then the primary upload).
  let rawImage = food.primary_image || food.image_url || food.image || dbImgUrl || foodObjImg || food.img || food.photo || '';
  if (typeof rawImage === 'string' && (rawImage === 'undefined' || rawImage === 'null' || rawImage === '[object Object]')) {
    rawImage = '';
  }

  const image = rawImage;

  // Check local saved food type override first
  let savedTypes = {};
  try {
    savedTypes = JSON.parse(localStorage.getItem('foodie_dish_types') || '{}');
  } catch (e) { }

  const savedType = savedTypes[foodId] || savedTypes[String(foodId)] || savedTypes[Number(foodId)];

  let resolvedType = 'veg';
  const diet = String(food.diet_type || food.type || food.foodType || '').toLowerCase();
  if (diet === 'vegan' || diet === 'veg') {
    resolvedType = diet === 'vegan' ? 'vegan' : 'veg';
  } else if (diet === 'non_veg' || diet === 'non-veg' || diet === 'nonveg') {
    resolvedType = 'non-veg';
  } else if (food.is_veg === false || food.is_veg === 'false' || food.is_veg === 0 || food.is_veg === '0') {
    resolvedType = 'non-veg';
  } else if (savedType) {
    resolvedType = savedType;
  } else if (food.type || food.foodType) {
    resolvedType = food.type || food.foodType;
  } else {
    const nonVegKeywords = ['chicken', 'fish', 'mutton', 'lamb', 'prawn', 'shrimp', 'seafood', 'egg', 'eggs', 'omelette', 'bacon', 'pepperoni', 'meat', 'wings', 'nugget', 'nuggets', 'bbq chicken', 'tandoori chicken', 'buff', 'beef', 'pork'];
    const descLower = String(food.description || '').toLowerCase();
    const isNonVegByName = nonVegKeywords.some(kw => normName.includes(kw) || descLower.includes(kw));
    resolvedType = isNonVegByName ? 'non-veg' : 'veg';
  }

  const baseOriginalPrice = parseFloat(food.price || 0);

  // Extract discount metadata from description (stored as |META:{...}|)
  let discPrice = 0;
  let discPct = 0;
  let isOfferExplicitlyDisabled = false;
  let cleanDesc = String(food.description || '');
  const metaRegex = /\|META:(.*?)\|/;
  const match = cleanDesc.match(metaRegex);
  
  if (match) {
    try {
      const meta = JSON.parse(match[1]);
      if (meta.dPrice !== undefined) discPrice = parseFloat(meta.dPrice);
      if (meta.dPct !== undefined) discPct = parseFloat(meta.dPct);
      if (meta.dDisabled) isOfferExplicitlyDisabled = true;
      cleanDesc = cleanDesc.replace(metaRegex, '').trim();
    } catch (e) { }
  }

  // Fallback to backend fields if present
  if (!discPrice && !discPct && !isOfferExplicitlyDisabled) {
    discPrice = parseFloat(food.discountPrice || food.discount_price || 0);
    discPct = parseFloat(food.discountPercent || food.discount_percent || food.offer_percentage || food.discount || 0);
    isOfferExplicitlyDisabled = food.has_discount === false || food.hasDiscount === false;
  }

  let finalSellingPrice = baseOriginalPrice;
  let hasDiscount = false;

  if (!isOfferExplicitlyDisabled && discPrice > 0 && discPrice < baseOriginalPrice) {
    hasDiscount = true;
    finalSellingPrice = discPrice;
    if (!discPct) {
      discPct = Math.round(((baseOriginalPrice - discPrice) / baseOriginalPrice) * 100);
    }
  } else if (!isOfferExplicitlyDisabled && discPct > 0 && discPct < 100) {
    hasDiscount = true;
    finalSellingPrice = Math.round(baseOriginalPrice * (1 - discPct / 100));
    discPrice = finalSellingPrice;
  }

  let newlyAddedDishes = [];
  try {
    newlyAddedDishes = JSON.parse(localStorage.getItem('foodie_newly_added_dishes') || '[]');
  } catch (e) { }

  const newDishEntry = newlyAddedDishes.find(d => (typeof d === 'object' ? d.id : d) === foodId || (typeof d === 'object' ? String(d.id) : String(d)) === String(foodId));
  const isCreatedNew = Boolean(newDishEntry || Number(foodId) > 28 || food.is_new || food.isNew);
  const addedAt = newDishEntry?.addedAt || (food.created_at ? new Date(food.created_at).getTime() : 0);

  let topSellingCounts = {};
  let topSellingIds = [];
  try {
    topSellingCounts = JSON.parse(localStorage.getItem('foodie_top_selling_dish_counts') || '{}');
    topSellingIds = JSON.parse(localStorage.getItem('foodie_top_selling_ids') || '[]');
  } catch (e) { }

  if (!Array.isArray(topSellingIds) || topSellingIds.length === 0) {
    if (Object.keys(topSellingCounts).length > 0) {
      topSellingIds = Object.keys(topSellingCounts)
        .filter(id => (topSellingCounts[id] || 0) > 0)
        .sort((a, b) => topSellingCounts[b] - topSellingCounts[a])
        .slice(0, 5)
        .map(id => parseInt(id));
    } else {
      topSellingIds = [1, 4, 7, 10, 13];
    }
  }

  const orderCount = Number(topSellingCounts[foodId] || topSellingCounts[String(foodId)] || 0);
  const isTopSellingDish = topSellingIds.includes(Number(foodId));

  return {
    id: foodId,
    name: food.name,
    description: cleanDesc,
    price: baseOriginalPrice,
    originalPrice: hasDiscount ? baseOriginalPrice : null,
    sellingPrice: finalSellingPrice,
    discountPrice: hasDiscount ? finalSellingPrice : null,
    discountPercent: hasDiscount ? discPct : 0,
    hasDiscount,
    category: categoryName,
    stock,
    status,
    image,
    type: resolvedType,
    foodType: resolvedType,
    rating: food.rating || 4.5,
    calories: food.calories !== undefined ? food.calories : null,
    popular: isTopSellingDish,
    isPopular: isTopSellingDish,
    isTopSelling: isTopSellingDish,
    orderCount,
    isNew: isCreatedNew,
    addedAt: addedAt || (isCreatedNew ? Date.now() : 0),
    minStock: food.minStock !== undefined ? food.minStock : 5,
    categoryId: resolvedCatId,
    customizations: (Array.isArray(food.customizations) ? food.customizations : []).map((option) => ({
      id: option.id,
      name: option.name,
      price: Number(option.extra_price ?? option.price ?? 0),
      extra_price: Number(option.extra_price ?? option.price ?? 0),
    })).filter((option) => option.id && option.name),
  };
};

let cachedCategories = null;
let cachedCategoriesTime = 0;
let cachedInventory = null;
let cachedInventoryTime = 0;
let cachedFoodImages = null;
let cachedFoodImagesTime = 0;
let cachedMappedProducts = null;
let cachedMappedProductsTime = 0;
let cachedMappedProductsBranchId = null;
let cachedCustomerCategories = null;
let cachedCustomerCategoriesBranchId = null;
const STATIC_CACHE_TTL = 1500; // 1.5 seconds for instant cross-device updates
const PRODUCTS_CACHE_TTL = 1500; // 1.5 seconds for instant cross-device updates
const INVENTORY_CACHE_TTL = 1500; // 1.5 seconds for instant inventory sync

export const getCustomerCategories = async (forceRefresh = false) => {
  const branchId = await resolveCustomerBranchId();
  if (!forceRefresh && cachedCustomerCategories && cachedCustomerCategories.length > 0 && String(cachedCustomerCategoriesBranchId) === String(branchId)) {
    return cachedCustomerCategories;
  }
  if (branchId) {
    try {
      const menuRes = await api.get(`/public/branches/${branchId}/menu/`);
      const categories = (menuRes.data?.categories || []).map(c => ({
        id: c.id,
        name: c.name,
        description: c.description || '',
        dish_count: c.dish_count || 0
      }));
      cachedCustomerCategories = categories;
      cachedCustomerCategoriesBranchId = String(branchId);
      return categories;
    } catch (e) {
      console.warn("Could not fetch customer categories:", e);
    }
  }
  return cachedCustomerCategories || [];
};

export const getCachedCategories = async (forceRefresh = false) => {
  const now = Date.now();
  if (!forceRefresh && cachedCategories && (now - cachedCategoriesTime < STATIC_CACHE_TTL)) {
    return cachedCategories;
  }
  const { isStaffScreen } = await import('./adminApi');
  if (!isStaffScreen()) {
    return await getCustomerCategories(forceRefresh);
  }
  let remoteCats = [];
  try {
    const res = await api.get('/categories/');
    const payload = res.data?.data || (Array.isArray(res.data) ? res.data : (res.data?.results || []));
    remoteCats = Array.isArray(payload) ? payload : [];
  } catch (e) {
    console.warn("Error fetching categories from backend:", e);
    remoteCats = [];
  }
  let savedCustom = [];
  try {
    savedCustom = JSON.parse(localStorage.getItem('foodie_custom_categories') || '[]');
  } catch (e) { }

  let deletedList = [];
  try {
    deletedList = JSON.parse(localStorage.getItem('foodie_deleted_categories') || '[]');
  } catch (e) { }

  const isDeleted = (cat) => {
    if (!deletedList || deletedList.length === 0) return false;
    const idStr = String(cat.id || cat.category_id || '');
    const norm = normalizeCategoryName(cat.name || '');
    const origNorm = normalizeCategoryName(cat.originalName || '');
    const feNorm = normalizeCategoryName(getFrontendCategoryName(cat.name || ''));

    return deletedList.some(d => {
      const dStr = String(d);
      const dNorm = normalizeCategoryName(dStr);
      return dStr === idStr || dNorm === norm || dNorm === origNorm || dNorm === feNorm;
    });
  };

  const filteredRemote = remoteCats.filter(rc => !isDeleted(rc));
  const filteredCustom = savedCustom.filter(sc => !isDeleted(sc));

  const merged = [...filteredRemote];
  filteredCustom.forEach(sc => {
    const exists = merged.some(rc => 
      normalizeCategoryName(rc.name) === normalizeCategoryName(sc.name) ||
      Number(rc.id) === Number(sc.id)
    );
    if (!exists) {
      merged.push(sc);
    }
  });

  cachedCategories = merged;
  cachedCategoriesTime = now;
  return merged;
};

export const getCachedInventory = async (forceRefresh = false) => {
  const now = Date.now();
  if (!forceRefresh && cachedInventory && (now - cachedInventoryTime < INVENTORY_CACHE_TTL)) {
    return cachedInventory;
  }
  try {
    const res = await api.get('/inventory/');
    const payload = res.data?.data || (Array.isArray(res.data) ? res.data : (res.data?.results || []));
    const inv = Array.isArray(payload) ? payload : [];
    cachedInventory = inv;
    cachedInventoryTime = now;
    return inv;
  } catch (e) {
    console.error("Error fetching inventory from backend:", e);
    return [];
  }
};

export const getCachedFoodImages = async () => {
  return cachedFoodImages || [];
};

export const clearStaticProductCache = () => {
  cachedCategories = null;
  cachedCategoriesTime = 0;
  cachedInventory = null;
  cachedInventoryTime = 0;
  cachedFoodImages = null;
  cachedFoodImagesTime = 0;
  cachedMappedProducts = null;
  cachedMappedProductsTime = 0;
  cachedMappedProductsBranchId = null;
  cachedCustomerCategories = null;
  cachedCustomerCategoriesBranchId = null;
};

export async function listOpenBranches() {
  const listed = await api.get('/public/branches/');
  const rows = Array.isArray(listed.data) ? listed.data : [];
  return rows.filter(row => (row.dish_count || 0) > 0);
}

export function chooseCustomerBranch(id) {
  sessionStorage.setItem('foodie_public_branch', String(id));
  localStorage.setItem('foodie_public_branch', String(id));
  sessionStorage.setItem('foodie_branch_source', 'chosen');
  localStorage.setItem('foodie_branch_source', 'chosen');
  clearStaticProductCache();
}

async function resolveCustomerBranchId() {
  const qr = new URLSearchParams(window.location.search).get('qr');
  if (qr) {
    try {
      const resolved = await api.get(`/public/qr/${qr}/`);
      if (resolved.data?.branch?.id) {
        const bId = String(resolved.data.branch.id);
        const prevBranch = sessionStorage.getItem('foodie_public_branch');
        if (prevBranch && prevBranch !== bId) {
          clearStaticProductCache();
        }
        sessionStorage.setItem('foodie_public_branch', bId);
        localStorage.setItem('foodie_public_branch', bId);
        sessionStorage.setItem('foodie_branch_source', 'qr');
        localStorage.setItem('foodie_branch_source', 'qr');
        sessionStorage.setItem('foodie_table_qr', qr);
        return bId;
      }
    } catch (e) { /* unknown QR falls through */ }
  }
  const source = sessionStorage.getItem('foodie_branch_source') || localStorage.getItem('foodie_branch_source');
  const saved = sessionStorage.getItem('foodie_public_branch') || localStorage.getItem('foodie_public_branch');
  if (saved && (source === 'qr' || source === 'chosen')) return saved;
  try {
    const rows = await listOpenBranches();
    if (rows.length === 1) {
      chooseCustomerBranch(rows[0].id);
      return String(rows[0].id);
    }
  } catch (e) { /* no public branch */ }
  return null;
}

export const productService = {
  getProducts: async (forceRefresh = false, branchIdOverride = null) => {
    const { isStaffScreen, listFoods } = await import('./adminApi');
    if (isStaffScreen()) return listFoods(branchIdOverride);
    const branchId = await resolveCustomerBranchId();
    const now = Date.now();
    if (!forceRefresh && cachedMappedProducts && String(cachedMappedProductsBranchId) === String(branchId) && (now - cachedMappedProductsTime < PRODUCTS_CACHE_TTL)) {
      return cachedMappedProducts;
    }

    if (branchId) {
      const menuRes = await api.get(`/public/branches/${branchId}/menu/`);
      const categories = (menuRes.data?.categories || []).map(c => ({
        id: c.id,
        name: c.name,
        description: c.description || '',
        dish_count: c.dish_count || 0
      }));
      cachedCustomerCategories = categories;
      cachedCustomerCategoriesBranchId = String(branchId);
      const mapped = (menuRes.data?.foods || []).map(food => mapProductToFrontend({
        ...food,
        price: food.original_price,
        discount_price: food.has_discount ? food.discounted_price : 0,
        discount_percent: food.discount_percent,
        is_veg: food.diet_type !== 'NON_VEG',
        type: food.diet_type === 'VEGAN' ? 'vegan' : (food.diet_type === 'NON_VEG' ? 'non-veg' : 'veg'),
        is_available: food.is_orderable,
        stock: food.quantity !== undefined && food.quantity !== null
          ? Number(food.quantity)
          : (food.is_orderable === false || food.stock_status === 'OUT_OF_STOCK' ? 0 : undefined),
        image: food.primary_image || '',
        images: (food.images || []).map(i => ({ image_url: i.url, is_primary: i.is_primary })),
      }, categories, [], []));
      cachedMappedProducts = mapped;
      cachedMappedProductsTime = Date.now();
      cachedMappedProductsBranchId = String(branchId);
      sessionStorage.setItem('foodie_public_branch', String(branchId));
      localStorage.setItem('foodie_public_branch', String(branchId));
      return mapped;
    }

    return [];

    const foodRes = await api.get('/foods/');
    const rawFoodList = foodRes.data?.data || (Array.isArray(foodRes.data) ? foodRes.data : (foodRes.data?.results || []));

    const [categories, inventory, images] = await Promise.all([
      getCachedCategories(forceRefresh),
      getCachedInventory(forceRefresh),
      getCachedFoodImages(forceRefresh)
    ]);

    const mapped = (Array.isArray(rawFoodList) ? rawFoodList : []).map(food =>
      mapProductToFrontend(food, categories, inventory, images)
    );

    // Prioritize newly added dishes by admin to appear at the very top
    let newlyAddedDishes = [];
    try {
      newlyAddedDishes = JSON.parse(localStorage.getItem('foodie_newly_added_dishes') || '[]');
    } catch (e) { }

    const newDishOrderMap = new Map();
    newlyAddedDishes.forEach((item, index) => {
      const id = typeof item === 'object' ? item.id : item;
      newDishOrderMap.set(String(id), index);
    });

    const sorted = mapped.sort((a, b) => {
      const aNewIdx = newDishOrderMap.has(String(a.id)) ? newDishOrderMap.get(String(a.id)) : -1;
      const bNewIdx = newDishOrderMap.has(String(b.id)) ? newDishOrderMap.get(String(b.id)) : -1;

      if (aNewIdx !== -1 && bNewIdx !== -1) {
        return aNewIdx - bNewIdx; // lowest index = most recently created
      }
      if (aNewIdx !== -1) return -1;
      if (bNewIdx !== -1) return 1;

      const aIsCustom = Number(a.id) > 28;
      const bIsCustom = Number(b.id) > 28;
      if (aIsCustom && bIsCustom) {
        return Number(b.id) - Number(a.id);
      }
      if (aIsCustom) return -1;
      if (bIsCustom) return 1;

      return 0;
    });

    cachedMappedProducts = sorted;
    cachedMappedProductsTime = now;
    return sorted;
  },

  getProductById: async (id) => {
    const { isStaffScreen, listFoods } = await import('./adminApi');
    if (isStaffScreen()) {
      const foods = await listFoods();
      return foods.find((food) => String(food.id) === String(id)) || null;
    }
    const listed = await productService.getProducts(true).catch(() => []);
    const cached = (listed || []).find((food) => String(food.id) === String(id));
    if (cached) return cached;
    const res = await api.get(`/public/foods/${id}/`);
    const food = res.data;
    if (!food?.id) return null;
    return mapProductToFrontend({
      ...food,
      price: food.original_price,
      discount_price: food.has_discount ? food.discounted_price : 0,
      discount_percent: food.discount_percent,
      type: food.diet_type === 'VEGAN' ? 'vegan' : (food.diet_type === 'NON_VEG' ? 'non-veg' : 'veg'),
      diet_type: food.diet_type,
      is_orderable: food.is_orderable,
      stock_status: food.stock_status,
      image: food.primary_image || '',
      images: (food.images || []).map((image) => ({ image_url: image.url, is_primary: image.is_primary })),
      category: food.category_name,
      categoryId: food.category,
    }, [{ id: food.category, name: food.category_name }], [], []);
  },

  createProduct: async (data) => {
    const { isStaffScreen, createFood, explain } = await import('./adminApi');
    if (isStaffScreen()) {
      try { return await createFood(data); } catch (err) { throw err.dishSaved ? err : new Error(explain(err)); }
    }
    // Resolve category name to ID
    const catList = await getCachedCategories();
    const targetCatName = data.category ? String(data.category).trim() : '';
    const normTarget = normalizeCategoryName(targetCatName);

    let catObj = catList.find(c =>
      normalizeCategoryName(c.name) === normTarget ||
      normalizeCategoryName(getFrontendCategoryName(c.name)) === normTarget ||
      Number(c.id || c.category_id) === Number(data.category) ||
      Number(c.id || c.category_id) === Number(data.categoryId)
    );

    let categoryId = catObj ? (catObj.id || catObj.category_id) : null;

    // If category not found in backend DB, try auto-creating it on backend
    if (!categoryId && targetCatName && isNaN(Number(targetCatName))) {
      try {
        const newCatRes = await api.post('/categories/', {
          name: getFrontendCategoryName(targetCatName),
          description: `Category for ${targetCatName}`,
          is_active: true,
          restaurant: 1
        });
        const createdCat = newCatRes.data?.data || newCatRes.data;
        if (createdCat && (createdCat.id || createdCat.category_id)) {
          categoryId = createdCat.id || createdCat.category_id;
        }
      } catch (catErr) {
        console.warn("Could not auto-create category in backend:", catErr);
      }
    }

    if (!categoryId) {
      categoryId = catList.length > 0 ? (catList[0].id || catList[0].category_id) : (parseInt(data.category) || 1);
    }

    const isVegan = data.type === 'vegan' || data.foodType === 'vegan';
    let finalDesc = data.description || '';
    if (isVegan && !finalDesc.toLowerCase().includes('vegan')) {
      finalDesc = finalDesc ? `${finalDesc} [Vegan]` : '[Vegan]';
    }

    const discPriceNum = data.discountPrice !== undefined ? parseFloat(data.discountPrice) : (data.discount_price !== undefined ? parseFloat(data.discount_price) : 0);
    const discPctNum = data.discountPercent !== undefined ? parseFloat(data.discountPercent) : (data.discount_percent !== undefined ? parseFloat(data.discount_percent) : (data.offer_percentage !== undefined ? parseFloat(data.offer_percentage) : 0));
    const origPriceNum = data.price !== undefined ? parseFloat(data.price) : undefined;

    // Build META string for discounts
    const metaObj = {};
    if (discPriceNum > 0) metaObj.dPrice = discPriceNum;
    if (discPctNum > 0) metaObj.dPct = discPctNum;

    if (Object.keys(metaObj).length > 0) {
      finalDesc = `${finalDesc} |META:${JSON.stringify(metaObj)}|`;
    }

    // Resolve active restaurant ID dynamically
    let restaurantId = 1;
    try {
      const restRes = await api.get('/branches/');
      const restList = restRes.data?.data || (Array.isArray(restRes.data) ? restRes.data : (restRes.data?.results || []));
      if (Array.isArray(restList) && restList.length > 0) {
        restaurantId = restList[0].id || restList[0].restaurant_id || 1;
      }
    } catch (e) { }

    const payload = {
      name: data.name,
      description: finalDesc,
      price: String(data.price),
      discount_price: discPriceNum > 0 ? String(discPriceNum) : undefined,
      offer_percentage: discPctNum > 0 ? String(discPctNum) : undefined,
      has_discount: discPriceNum > 0 || discPctNum > 0,
      is_available: data.stock > 0,
      category: categoryId,
      restaurant: restaurantId,
      is_veg: data.type === 'veg' || data.type === 'vegan' || data.foodType === 'veg' || data.foodType === 'vegan',
      ...(data.image && typeof data.image === 'string' && data.image.trim() !== '' ? {
        images: [{ image: data.image.trim(), is_primary: true }]
      } : {})
    };

    const foodRes = await api.post('/foods/', payload);
    const newFood = foodRes.data?.data || foodRes.data;
    const newFoodId = newFood.id || newFood.food_id;

    // Save dish category mapping locally to preserve exact frontend category name e.g. "Combo Offer"
    if (targetCatName && newFoodId) {
      try {
        const savedCategories = JSON.parse(localStorage.getItem('foodie_dish_categories') || '{}');
        savedCategories[newFoodId] = getFrontendCategoryName(targetCatName);
        savedCategories[String(newFoodId)] = getFrontendCategoryName(targetCatName);
        localStorage.setItem('foodie_dish_categories', JSON.stringify(savedCategories));
      } catch (e) { }

      try {
        const customCats = JSON.parse(localStorage.getItem('foodie_custom_categories') || '[]');
        const normCat = normalizeCategoryName(getFrontendCategoryName(targetCatName));
        if (!customCats.some(c => normalizeCategoryName(c.name) === normCat)) {
          customCats.push({
            id: categoryId || `CAT_${Date.now()}`,
            name: getFrontendCategoryName(targetCatName),
            originalName: targetCatName,
            status: 'Active'
          });
          localStorage.setItem('foodie_custom_categories', JSON.stringify(customCats));
        }
      } catch (e) { }
    }

    // Save image URL/preview in local storage FIRST
    if (data.image) {
      try {
        const savedImages = JSON.parse(localStorage.getItem('foodie_dish_images') || '{}');
        savedImages[newFoodId] = data.image;
        savedImages[String(newFoodId)] = data.image;
        if (!isNaN(Number(newFoodId))) savedImages[Number(newFoodId)] = data.image;
        localStorage.setItem('foodie_dish_images', JSON.stringify(savedImages));
      } catch (e) { }
    }

    // Save discount overrides in local storage
    try {
      const savedDiscounts = JSON.parse(localStorage.getItem('foodie_dish_discounts') || '{}');
      if (discPriceNum > 0 || discPctNum > 0) {
        let computedPct = Math.min(100, Math.max(0, discPctNum));
        if (!computedPct && discPriceNum > 0 && origPriceNum > 0 && origPriceNum > discPriceNum) {
          computedPct = Math.min(100, Math.max(0, Math.round(((origPriceNum - discPriceNum) / origPriceNum) * 100)));
        }

        const discInfo = {
          discountPrice: discPriceNum > 0 ? discPriceNum : (discPctNum > 0 && origPriceNum > 0 ? Math.max(0, Math.round(origPriceNum * (1 - Math.min(100, discPctNum) / 100))) : undefined),
          discountPercent: computedPct,
          originalPrice: origPriceNum
        };
        savedDiscounts[newFoodId] = discInfo;
        savedDiscounts[String(newFoodId)] = discInfo;
        if (!isNaN(Number(newFoodId))) savedDiscounts[Number(newFoodId)] = discInfo;
        localStorage.setItem('foodie_dish_discounts', JSON.stringify(savedDiscounts));
      }
    } catch (e) {
      console.error("Error persisting created dish discount:", e);
    }

    // Save category override in local storage
    if (data.category) {
      try {
        const savedCategories = JSON.parse(localStorage.getItem('foodie_dish_categories') || '{}');
        const catName = getFrontendCategoryName(data.category);
        savedCategories[newFoodId] = catName;
        savedCategories[String(newFoodId)] = catName;
        if (!isNaN(Number(newFoodId))) savedCategories[Number(newFoodId)] = catName;
        localStorage.setItem('foodie_dish_categories', JSON.stringify(savedCategories));
      } catch (e) {
        console.error("Error persisting dish category:", e);
      }
    }

    // Save food type override (veg / non-veg / vegan) in local storage
    if (data.type || data.foodType) {
      try {
        const savedTypes = JSON.parse(localStorage.getItem('foodie_dish_types') || '{}');
        const assignedType = (data.type || data.foodType || 'veg').toLowerCase();
        savedTypes[newFoodId] = assignedType;
        savedTypes[String(newFoodId)] = assignedType;
        if (!isNaN(Number(newFoodId))) savedTypes[Number(newFoodId)] = assignedType;
        localStorage.setItem('foodie_dish_types', JSON.stringify(savedTypes));
      } catch (e) {
        console.error("Error persisting created dish type:", e);
      }
    }

    // Save stock override in local storage
    if (data.stock !== undefined) {
      try {
        const savedStocks = JSON.parse(localStorage.getItem('foodie_dish_stocks') || '{}');
        const stockNum = Number(data.stock);
        savedStocks[newFoodId] = stockNum;
        savedStocks[String(newFoodId)] = stockNum;
        if (!isNaN(Number(newFoodId))) savedStocks[Number(newFoodId)] = stockNum;
        localStorage.setItem('foodie_dish_stocks', JSON.stringify(savedStocks));
      } catch (e) {
        console.error("Error persisting created dish stock:", e);
      }
    }

    // Track newly added dish by admin so it is placed on top for customers
    try {
      const newDishes = JSON.parse(localStorage.getItem('foodie_newly_added_dishes') || '[]');
      const timestamp = Date.now();
      const existingIdx = newDishes.findIndex(d => (typeof d === 'object' ? d.id : d) === newFoodId || (typeof d === 'object' ? String(d.id) : String(d)) === String(newFoodId));
      if (existingIdx >= 0) {
        newDishes.splice(existingIdx, 1);
      }
      newDishes.unshift({ id: newFoodId, addedAt: timestamp });
      localStorage.setItem('foodie_newly_added_dishes', JSON.stringify(newDishes));
    } catch (e) {
      console.error("Error persisting newly added dish tracking:", e);
    }

    try {
      window.dispatchEvent(new CustomEvent('foodie_products_updated', { detail: { id: newFoodId, data } }));
      window.dispatchEvent(new CustomEvent('foodie_inventory_updated', { detail: { id: newFoodId, data } }));
      localStorage.setItem('foodie_inventory_sync_trigger', Date.now().toString());
    } catch (e) { }

    // Refresh context
    return productService.getProductById(newFoodId);
  },

  updateProduct: async (id, data) => {
    const { isStaffScreen, updateFood, explain } = await import('./adminApi');
    if (isStaffScreen()) {
      try { return await updateFood(id, data); } catch (err) { throw new Error(explain(err)); }
    }
    // Resolve category name to ID
    const catList = await getCachedCategories();
    const catObj = catList.find(c =>
      normalizeCategoryName(c.name) === normalizeCategoryName(data.category || '') ||
      Number(c.id || c.category_id) === Number(data.category) ||
      Number(c.id || c.category_id) === Number(data.categoryId)
    );
    const categoryId = catObj ? (catObj.id || catObj.category_id) : (data.category ? (parseInt(data.category) || 1) : undefined);

    const isVegan = data.type === 'vegan' || data.foodType === 'vegan';
    const isVeg = data.type === 'veg' || data.foodType === 'veg';
    const isNonVeg = data.type === 'non-veg' || data.foodType === 'non-veg';

    let finalDesc = data.description !== undefined ? data.description : '';
    // Strip existing META to rebuild it
    finalDesc = finalDesc.replace(/\|META:.*?\|/g, '').trim();
    
    if (isVegan && !finalDesc.toLowerCase().includes('vegan')) {
      finalDesc = finalDesc ? `${finalDesc} [Vegan]` : '[Vegan]';
    } else if ((isVeg || isNonVeg) && finalDesc.includes('[Vegan]')) {
      finalDesc = finalDesc.replace(/\[Vegan\]/g, '').trim();
    }

    // Build META string for discounts
    const metaObj = {};
    if (data.discountPrice !== undefined) metaObj.dPrice = data.discountPrice;
    if (data.discountPercent !== undefined) metaObj.dPct = data.discountPercent;
    if (data.disabled === true || data.deleted === true || data.hasDiscount === false) metaObj.dDisabled = true;
    
    if (Object.keys(metaObj).length > 0) {
      finalDesc = `${finalDesc} |META:${JSON.stringify(metaObj)}|`;
    }

    const hasFoodDetailsToPatch = data.name !== undefined ||
      data.description !== undefined ||
      data.price !== undefined ||
      data.discountPrice !== undefined ||
      data.discount_price !== undefined ||
      data.discountPercent !== undefined ||
      data.discount_percent !== undefined ||
      data.offer_percentage !== undefined ||
      data.hasDiscount !== undefined ||
      data.has_discount !== undefined ||
      data.category !== undefined ||
      data.categoryId !== undefined ||
      data.type !== undefined ||
      data.foodType !== undefined ||
      data.image !== undefined;

    const payload = hasFoodDetailsToPatch ? {
      name: data.name,
      description: finalDesc,
      price: data.price !== undefined ? String(data.price) : undefined,
      discount_price: data.discountPrice !== undefined ? String(data.discountPrice) : (data.discount_price !== undefined ? String(data.discount_price) : undefined),
      offer_percentage: data.discountPercent !== undefined ? String(data.discountPercent) : (data.discount_percent !== undefined ? String(data.discount_percent) : (data.offer_percentage !== undefined ? String(data.offer_percentage) : undefined)),
      has_discount: data.hasDiscount !== undefined ? data.hasDiscount : (data.has_discount !== undefined ? data.has_discount : undefined),
      is_available: data.stock !== undefined ? data.stock > 0 : undefined,
      category: data.category !== undefined || data.categoryId !== undefined ? categoryId : undefined,
      restaurant: 1,
      is_veg: isVeg || isVegan ? true : isNonVeg ? false : undefined,
      ...(data.image && typeof data.image === 'string' && data.image.trim() !== '' ? {
        images: [{ image: data.image.trim(), is_primary: true }]
      } : {})
    } : {};

    // Save stock override in local storage immediately
    if (data.stock !== undefined) {
      try {
        const savedStocks = JSON.parse(localStorage.getItem('foodie_dish_stocks') || '{}');
        const numStock = Number(data.stock);
        savedStocks[id] = numStock;
        savedStocks[String(id)] = numStock;
        if (!isNaN(Number(id))) savedStocks[Number(id)] = numStock;
        if (data.name) {
          savedStocks[data.name] = numStock;
          savedStocks[data.name.trim().toLowerCase()] = numStock;
        }
        localStorage.setItem('foodie_dish_stocks', JSON.stringify(savedStocks));
      } catch (e) {
        console.error("Error persisting updated dish stock:", e);
      }
    }

    // Discount overrides removed from local storage (now saved in META desc)

    // Filter out undefined payload fields
    Object.keys(payload).forEach(key => payload[key] === undefined && delete payload[key]);

    let updatedFood = null;
    if (hasFoodDetailsToPatch && Object.keys(payload).length > 0 && _isValidId(id)) {
      try {
        const foodRes = await api.patch(`/foods/${id}/`, payload);
        updatedFood = foodRes.data?.data || foodRes.data;
      } catch (err) {
        console.warn("Backend patch /foods/ warning:", err);
      }
    }
    const updatedFoodId = (updatedFood && (updatedFood.id || updatedFood.food_id)) || id;

    // Update inventory quantity if stock is passed
    if (data.stock !== undefined && _isValidId(updatedFoodId)) {
      try {
        const invRes = await api.get('/inventory/').catch(() => ({ data: [] }));
        const invList = invRes.data?.data || (Array.isArray(invRes.data) ? invRes.data : (invRes.data?.results || []));
        const invObj = Array.isArray(invList) ? invList.find(i => {
          const invFoodId = i.food?.id || i.food_item?.id || i.food_id || i.food || i.food_item;
          return invFoodId !== undefined && invFoodId !== null && Number(invFoodId) === Number(updatedFoodId);
        }) : null;
        if (invObj) {
          const invId = invObj.id || invObj.inventory_id;
          if (_isValidId(invId)) {
            await api.patch(`/inventory/${invId}/`, {
              quantity: parseInt(data.stock),
              status: data.stock > 5 ? 'IN_STOCK' : data.stock > 0 ? 'LOW_STOCK' : 'OUT_OF_STOCK'
            }).catch(() => {});
          }
        } else {
          await api.post('/inventory/', {
            food: updatedFoodId,
            food_item: updatedFoodId,
            quantity: parseInt(data.stock),
            status: data.stock > 5 ? 'IN_STOCK' : data.stock > 0 ? 'LOW_STOCK' : 'OUT_OF_STOCK',
            restaurant: 1
          }).catch(() => {});
        }
      } catch (e) {
        console.warn("Error updating inventory:", e);
      }
    }

    // Update image if passed
    if (data.image) {
      try {
        const savedImages = JSON.parse(localStorage.getItem('foodie_dish_images') || '{}');
        savedImages[updatedFoodId] = data.image;
        savedImages[String(updatedFoodId)] = data.image;
        if (!isNaN(Number(updatedFoodId))) savedImages[Number(updatedFoodId)] = data.image;
        localStorage.setItem('foodie_dish_images', JSON.stringify(savedImages));
      } catch (e) { }
    }

    // Save category override in local storage
    if (data.category) {
      try {
        const savedCategories = JSON.parse(localStorage.getItem('foodie_dish_categories') || '{}');
        const catName = getFrontendCategoryName(data.category);
        savedCategories[updatedFoodId] = catName;
        savedCategories[String(updatedFoodId)] = catName;
        if (!isNaN(Number(updatedFoodId))) savedCategories[Number(updatedFoodId)] = catName;
        localStorage.setItem('foodie_dish_categories', JSON.stringify(savedCategories));
      } catch (e) {
        console.error("Error persisting dish category:", e);
      }
    }

    // Save food type override in local storage
    if (data.type || data.foodType) {
      try {
        const savedTypes = JSON.parse(localStorage.getItem('foodie_dish_types') || '{}');
        const assignedType = (data.type || data.foodType || 'veg').toLowerCase();
        savedTypes[updatedFoodId] = assignedType;
        savedTypes[String(updatedFoodId)] = assignedType;
        if (!isNaN(Number(updatedFoodId))) savedTypes[Number(updatedFoodId)] = assignedType;
        localStorage.setItem('foodie_dish_types', JSON.stringify(savedTypes));
      } catch (e) {
        console.error("Error persisting dish type:", e);
      }
    }

    // Save discount overrides in local storage
    if (data.discountPrice !== undefined || data.discountPercent !== undefined || data.hasDiscount !== undefined || data.disabled !== undefined || data.deleted !== undefined) {
      try {
        const savedDiscounts = JSON.parse(localStorage.getItem('foodie_dish_discounts') || '{}');
        const discPriceNum = data.discountPrice !== undefined ? parseFloat(data.discountPrice) : 0;
        const discPctNum = data.discountPercent !== undefined ? parseFloat(data.discountPercent) : 0;
        const origPriceNum = data.price !== undefined ? parseFloat(data.price) : undefined;
        const isOfferExplicitlyDisabled = data.hasDiscount === false || data.disabled === true || data.deleted === true || (discPriceNum === 0 && discPctNum === 0);

        if (isOfferExplicitlyDisabled) {
          delete savedDiscounts[id];
          delete savedDiscounts[String(id)];
          delete savedDiscounts[updatedFoodId];
          delete savedDiscounts[String(updatedFoodId)];
        } else {
          let computedPct = Math.min(100, Math.max(0, discPctNum));
          if (!computedPct && discPriceNum > 0 && origPriceNum > 0 && origPriceNum > discPriceNum) {
            computedPct = Math.min(100, Math.max(0, Math.round(((origPriceNum - discPriceNum) / origPriceNum) * 100)));
          }

          const entry = {
            discountPrice: discPriceNum > 0 ? discPriceNum : (discPctNum > 0 && origPriceNum > 0 ? Math.max(0, Math.round(origPriceNum * (1 - Math.min(100, discPctNum) / 100))) : undefined),
            discountPercent: computedPct,
            originalPrice: origPriceNum,
            hasDiscount: true
          };
          savedDiscounts[id] = entry;
          savedDiscounts[String(id)] = entry;
          savedDiscounts[updatedFoodId] = entry;
          savedDiscounts[String(updatedFoodId)] = entry;
        }
        localStorage.setItem('foodie_dish_discounts', JSON.stringify(savedDiscounts));
      } catch (e) {
        console.error("Error persisting updated dish discount:", e);
      }
    }

    // Save stock override in local storage
    if (data.stock !== undefined) {
      try {
        const savedStocks = JSON.parse(localStorage.getItem('foodie_dish_stocks') || '{}');
        const numStock = Number(data.stock);
        savedStocks[updatedFoodId] = numStock;
        savedStocks[String(updatedFoodId)] = numStock;
        if (!isNaN(Number(updatedFoodId))) savedStocks[Number(updatedFoodId)] = numStock;
        if (id) {
          savedStocks[id] = numStock;
          savedStocks[String(id)] = numStock;
          if (!isNaN(Number(id))) savedStocks[Number(id)] = numStock;
        }
        localStorage.setItem('foodie_dish_stocks', JSON.stringify(savedStocks));
      } catch (e) {
        console.error("Error persisting updated dish stock:", e);
      }
    }

    // Save discount overrides in local storage
    try {
      const savedDiscounts = JSON.parse(localStorage.getItem('foodie_dish_discounts') || '{}');
      const discPriceNum = data.discountPrice !== undefined ? parseFloat(data.discountPrice) : 0;
      const discPctNum = data.discountPercent !== undefined ? parseFloat(data.discountPercent) : 0;
      const origPriceNum = data.originalPrice !== undefined ? parseFloat(data.originalPrice) : (data.price !== undefined ? parseFloat(data.price) : undefined);
      const isRemovingDiscount = data.hasDiscount === false || data.has_discount === false || (data.discountPercent === 0 && data.discountPrice === 0);

      if (isRemovingDiscount) {
        savedDiscounts[updatedFoodId] = {
          hasDiscount: false,
          disabled: true,
          deleted: true,
          discountPrice: 0,
          discountPercent: 0,
          originalPrice: origPriceNum
        };
      } else if (discPriceNum > 0 || discPctNum > 0) {
        let computedPct = Math.min(100, Math.max(0, discPctNum));
        if (!computedPct && discPriceNum > 0 && origPriceNum > 0 && origPriceNum > discPriceNum) {
          computedPct = Math.min(100, Math.max(0, Math.round(((origPriceNum - discPriceNum) / origPriceNum) * 100)));
        }

        savedDiscounts[updatedFoodId] = {
          hasDiscount: true,
          disabled: false,
          deleted: false,
          discountPrice: discPriceNum > 0 ? discPriceNum : (discPctNum > 0 && origPriceNum > 0 ? Math.max(0, Math.round(origPriceNum * (1 - Math.min(100, discPctNum) / 100))) : undefined),
          discountPercent: computedPct,
          originalPrice: origPriceNum
        };
      } else {
        savedDiscounts[updatedFoodId] = {
          hasDiscount: false,
          disabled: true,
          deleted: true,
          discountPrice: 0,
          discountPercent: 0,
          originalPrice: origPriceNum
        };
      }
      localStorage.setItem('foodie_dish_discounts', JSON.stringify(savedDiscounts));
    } catch (e) {
      console.error("Error persisting dish discount:", e);
    }

    try {
      clearStaticProductCache();
      window.dispatchEvent(new CustomEvent('foodie_products_updated', { detail: { id: updatedFoodId, data } }));
      window.dispatchEvent(new CustomEvent('foodie_inventory_updated', { detail: { id: updatedFoodId, data } }));
      localStorage.setItem('foodie_inventory_sync_trigger', Date.now().toString());
    } catch (e) { }

    return productService.getProductById(updatedFoodId);
  },

  deleteProduct: async (id) => {
    const { isStaffScreen, deleteFood, explain } = await import('./adminApi');
    if (isStaffScreen()) {
      try { return await deleteFood(id); } catch (err) { throw new Error(explain(err)); }
    }
    if (!_isValidId(id)) return true;

    // Delete corresponding inventory first
    try {
      const invRes = await api.get('/inventory/');
      const invList = invRes.data?.data || (Array.isArray(invRes.data) ? invRes.data : (invRes.data?.results || []));
      const invObj = Array.isArray(invList) ? invList.find(i => (Number(i.food_item || i.food) === Number(id))) : null;
      if (invObj) {
        const invId = invObj.id || invObj.inventory_id;
        if (_isValidId(invId)) {
          await api.delete(`/inventory/${invId}/`);
        }
      }
    } catch (e) {
      console.warn("Error deleting inventory item:", e);
    }

    // Delete images
    try {
      const imgRes = await api.get('/food-images/').catch(() => ({ data: [] }));
      const imgList = imgRes.data?.data || (Array.isArray(imgRes.data) ? imgRes.data : (imgRes.data?.results || []));
      const images = Array.isArray(imgList) ? imgList.filter(img => (Number(img.food_item || img.food) === Number(id))) : [];
      for (const img of images) {
        const imgId = img.id || img.image_id;
        if (_isValidId(imgId)) {
          await api.delete(`/food-images/${imgId}/`).catch(() => {});
        }
      }
    } catch (e) {
      console.warn("Error deleting food images:", e);
    }

    // Clear saved category, discounts, and images
    try {
      const savedCategories = JSON.parse(localStorage.getItem('foodie_dish_categories') || '{}');
      delete savedCategories[id];
      delete savedCategories[String(id)];
      localStorage.setItem('foodie_dish_categories', JSON.stringify(savedCategories));
    } catch (e) { }

    try {
      const savedDiscounts = JSON.parse(localStorage.getItem('foodie_dish_discounts') || '{}');
      delete savedDiscounts[id];
      delete savedDiscounts[String(id)];
      localStorage.setItem('foodie_dish_discounts', JSON.stringify(savedDiscounts));
    } catch (e) { }

    try {
      const savedImages = JSON.parse(localStorage.getItem('foodie_dish_images') || '{}');
      delete savedImages[id];
      delete savedImages[String(id)];
      localStorage.setItem('foodie_dish_images', JSON.stringify(savedImages));
    } catch (e) { }

    try {
      const savedStocks = JSON.parse(localStorage.getItem('foodie_dish_stocks') || '{}');
      delete savedStocks[id];
      delete savedStocks[String(id)];
      delete savedStocks[Number(id)];
      localStorage.setItem('foodie_dish_stocks', JSON.stringify(savedStocks));
    } catch (e) { }

    await api.delete(`/foods/${id}/`);

    try {
      clearStaticProductCache();
      window.dispatchEvent(new CustomEvent('foodie_products_updated', { detail: { id } }));
      window.dispatchEvent(new CustomEvent('foodie_inventory_updated', { detail: { id } }));
      localStorage.setItem('foodie_inventory_sync_trigger', Date.now().toString());
    } catch (e) { }

    return true;
  },

  editProduct: async (id, data) => productService.updateProduct(id, data),
  getCachedCategories: (forceRefresh = false) => getCachedCategories(forceRefresh),
  getCustomerCategories: (forceRefresh = false) => getCustomerCategories(forceRefresh),
  getCachedInventory: (forceRefresh = false) => getCachedInventory(forceRefresh),
  getCachedFoodImages: (forceRefresh = false) => getCachedFoodImages(forceRefresh),
  clearStaticProductCache: () => clearStaticProductCache()
};

export default productService;
