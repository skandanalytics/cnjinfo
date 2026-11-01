import {
  clearStaffSession,
  isStaffScreen,
  messageFrom,
  setStaffSession,
  staffFetch,
  staffJson,
} from './staffClient';
import { classifyStock } from '../utils/stockStatus';
import api from '../config/api';

export { isStaffScreen, staffJson, staffFetch };

const STATUS_LABEL = {
  PENDING: 'Pending',
  PREPARING: 'Preparing',
  READY: 'Ready',
  SERVED: 'Served',
  COMPLETED: 'Completed',
  CANCELLED: 'Cancelled',
};

const STATUS_API = {
  pending: 'PENDING',
  preparing: 'PREPARING',
  ready: 'READY',
  serving: 'SERVED',
  served: 'SERVED',
  completed: 'COMPLETED',
  cancelled: 'CANCELLED',
  canceled: 'CANCELLED',
};

function listOf(data) {
  if (Array.isArray(data)) return data;
  if (data && Array.isArray(data.results)) return data.results;
  return [];
}

function dietToUi(value) {
  if (value === 'NON_VEG') return 'non-veg';
  if (value === 'VEGAN') return 'vegan';
  return 'veg';
}

function dietToApi(value) {
  const v = String(value || 'veg').toLowerCase();
  if (v.includes('non')) return 'NON_VEG';
  if (v.includes('vegan')) return 'VEGAN';
  return 'VEG';
}

function roleToApi(role) {
  const v = String(role || 'STAFF').toUpperCase();
  if (v === 'ADMIN' || v === 'MANAGER' || v === 'CHEF' || v === 'CASHIER' || v === 'STAFF') return v;
  if (v === 'WAITER' || v === 'DELIVERY') return 'STAFF';
  return 'STAFF';
}

let branchMemo = null;

export async function currentBranchId() {
  const raw = sessionStorage.getItem('foodie_auth_admin') || localStorage.getItem('foodie_auth_admin');
  let sessionBranchId = null;
  if (raw) {
    try {
      sessionBranchId = JSON.parse(raw)?.user?.branchId || null;
    } catch {
      /* ignore */
    }
  }
  const branches = listOf(await staffJson('/branches/'));
  if (!branches.length) {
    throw new Error('Create a branch first to manage tables, meals, categories, employees, offers, and coupons.');
  }
  if (sessionBranchId && branches.some((b) => String(b.id) === String(sessionBranchId))) {
    return sessionBranchId;
  }
  if (branchMemo && branches.some((b) => String(b.id) === String(branchMemo))) {
    return branchMemo;
  }
  const primary = branches.find((b) => b.is_primary && b.is_active) || branches.find((b) => b.is_primary);
  if (!primary) throw new Error('Mark one branch as the primary branch in Manage Branches first.');
  branchMemo = primary.id;
  return primary.id;
}

export async function staffLogin(code, password) {
  let data;
  try {
    const res = await api.post('/auth/staff/login/', {
      employee_code: String(code || '').trim(),
      password,
    });
    data = res.data || {};
  } catch (err) {
    const errData = err.response?.data || {};
    throw new Error(errData.detail || err.message || 'Invalid employee code or password.');
  }
  setStaffSession(data.access, data.refresh);
  const emp = data.user?.employee;
  const user = {
    id: data.user.id,
    name: data.user.name,
    phone: data.user.phone,
    email: data.user.email || '',
    role: emp?.is_admin_level ? 'admin' : 'employee',
    employeeCode: emp?.employee_code || '',
    designation: emp?.job_title || emp?.role || '',
    department: emp?.department || '',
    branchId: emp?.branch?.id || null,
    branchName: emp?.branch?.name || '',
    backendRole: emp?.role || '',
  };
  const authPayload = JSON.stringify({ user, isAuthenticated: true });
  sessionStorage.setItem('foodie_auth_admin', authPayload);
  localStorage.setItem('foodie_auth_admin', authPayload);
  return { token: data.access, refresh: data.refresh, user };
}

export async function staffLogout() {
  const refresh = sessionStorage.getItem('foodie_staff_refresh') || localStorage.getItem('foodie_staff_refresh');
  if (refresh) {
    try {
      await staffJson('/auth/logout/', { method: 'POST', body: JSON.stringify({ refresh }) });
    } catch {
      /* token may already be gone */
    }
  }
  clearStaffSession();
  branchMemo = null;
}

function mapBranch(b) {
  let branchStatus = b.is_active ? 'Active' : 'Inactive';
  try {
    const savedStatusMap = JSON.parse(localStorage.getItem('foodie_branch_statuses') || '{}');
    if (savedStatusMap[String(b.id)]) {
      branchStatus = savedStatusMap[String(b.id)];
    }
  } catch (e) {}

  // Actual table count should reflect live dining tables count if > 0, otherwise configured
  const effectiveTablesCount = (b.tables_count !== undefined && b.tables_count !== null && b.tables_count > 0)
    ? b.tables_count
    : (b.configured_table_count ?? b.tables_count ?? 0);

  return {
    id: b.id,
    name: b.name,
    code: b.code,
    address: b.address || '',
    phone: b.contact_number || '',
    email: b.email || '',
    city: b.city || '',
    managerName: b.manager_name || '',
    openingHours: b.opening_hours || '',
    tablesCount: effectiveTablesCount,
    liveTables: b.tables_count ?? effectiveTablesCount,
    status: branchStatus,
    isMainBranch: Boolean(b.is_primary),
    image: b.cover_image_url || '',
    gst_rate: b.gst_rate,
    service_charge_rate: b.service_charge_rate,
    takeaway_charge: b.takeaway_charge,
  };
}

export async function listBranches() {
  const rows = listOf(await staffJson('/branches/'));
  return rows.map(mapBranch);
}

export async function saveBranch(form, existingId) {
  const body = {
    name: form.name,
    address: form.address,
    city: form.city || '',
    contact_number: form.phone,
    email: (form.email || '').trim(),
    manager_name: form.managerName,
    opening_hours: form.openingHours || '',
    cover_image_url: (form.image || '').trim(),
    is_primary: Boolean(form.isMainBranch),
    is_active: form.status === 'Active',
  };
  if (form.tablesCount !== undefined && form.tablesCount !== null && form.tablesCount !== '') {
    body.configured_table_count = Math.max(0, parseInt(form.tablesCount, 10) || 0);
  }
  const data = existingId
    ? await staffJson(`/branches/${existingId}/`, { method: 'PATCH', body: JSON.stringify(body) })
    : await staffJson('/branches/', { method: 'POST', body: JSON.stringify(body) });
  branchMemo = null;
  if (data && data.id && form.status) {
    try {
      const savedStatusMap = JSON.parse(localStorage.getItem('foodie_branch_statuses') || '{}');
      savedStatusMap[String(data.id)] = form.status;
      localStorage.setItem('foodie_branch_statuses', JSON.stringify(savedStatusMap));
    } catch (e) {}
  }
  return mapBranch(data);
}

export async function removeBranch(id) {
  const data = await staffJson(`/branches/${id}/`, { method: 'DELETE' });
  branchMemo = null;
  return data;
}

function mapTable(t) {
  const status = String(t.status || 'AVAILABLE').toUpperCase();
  const label = status === 'OCCUPIED' ? 'Occupied' : status === 'RESERVED' ? 'Reserved' : 'Available';
  return {
    id: t.id,
    number: t.table_number,
    table_number: t.table_number,
    capacity: t.capacity,
    area: t.location || '',
    location: t.location || '',
    tableViewId: t.table_view || null,
    status: label,
    branch: t.branch,
    branch_name: t.branch_name,
    qr_code: t.qr_code,
    qr_url: t.qr_url,
    qr_is_active: t.qr_is_active !== false,
    is_active: t.is_active,
    active_order_id: t.active_order_id || null,
    active_order: t.active_order || null,
  };
}

export async function listTableViews() {
  return listOf(await staffJson('/table-views/'));
}

export async function listTables(branchId) {
  const query = branchId ? `?branch=${encodeURIComponent(branchId)}` : '';
  return listOf(await staffJson(`/tables/${query}`)).map(mapTable);
}

export async function createTable(data) {
  const branch = await currentBranchId();
  const created = await staffJson('/tables/', {
    method: 'POST',
    body: JSON.stringify({
      branch,
      table_number: data.number || data.table_number,
      capacity: Number(data.capacity || 4),
      location: data.area || data.location || '',
    }),
  });
  const wanted = String(data.status || 'Available').toLowerCase();
  if (wanted.startsWith('reserv')) {
    await staffJson(`/tables/${created.id}/set-status/`, {
      method: 'POST',
      body: JSON.stringify({ status: 'RESERVED' }),
    });
    created.status = 'RESERVED';
  }
  return mapTable(created);
}

export async function updateTable(id, data) {
  let saved = await staffJson(`/tables/${id}/`, {
    method: 'PATCH',
    body: JSON.stringify({
      table_number: data.number || data.table_number,
      capacity: Number(data.capacity || 4),
      location: data.area || data.location || '',
    }),
  });
  if (data.status && mapTable(saved).status !== data.status) {
    saved = await staffJson(`/tables/${id}/set-status/`, {
      method: 'POST',
      body: JSON.stringify({ status: tableStatusToApi(data.status) }),
    });
  }
  return mapTable(saved);
}

function tableStatusToApi(status) {
  const key = String(status || '').toLowerCase();
  return key.startsWith('avail') ? 'AVAILABLE' : key.startsWith('reserv') ? 'RESERVED' : 'OCCUPIED';
}

export async function updateTableStatus(id, status) {
  const data = await staffJson(`/tables/${id}/set-status/`, {
    method: 'POST',
    body: JSON.stringify({ status: tableStatusToApi(status) }),
  });
  return mapTable(data);
}

export async function deleteTable(id) {
  await staffJson(`/tables/${id}/`, { method: 'DELETE' });
  return true;
}

function mapCategory(c) {
  return {
    id: c.id,
    name: c.name,
    originalName: c.name,
    description: c.description || '',
    status: c.is_active === false ? 'Inactive' : 'Active',
    dishCount: c.dish_count || 0,
    parent: c.parent || null,
    branch: c.branch,
    is_active: c.is_active,
  };
}

export async function listCategories() {
  return listOf(await staffJson('/categories/')).map(mapCategory);
}

export async function createCategory(data) {
  const branch = await currentBranchId();
  const created = await staffJson('/categories/', {
    method: 'POST',
    body: JSON.stringify({
      branch,
      name: data.name,
      description: data.description || '',
      is_active: data.status !== 'Inactive',
    }),
  });
  publishCatalogChange({ resource: 'menu', action: 'created' });
  return mapCategory(created);
}

export async function updateCategory(id, data) {
  const body = {};
  if (data.name) body.name = data.name.trim();
  if (data.description !== undefined) body.description = data.description;
  if (data.status) body.is_active = data.status !== 'Inactive';
  const updated = await staffJson(`/categories/${id}/`, { method: 'PATCH', body: JSON.stringify(body) });
  publishCatalogChange({ resource: 'menu', action: 'updated' });
  return mapCategory(updated);
}

export async function deleteCategory(id) {
  await staffJson(`/categories/${id}/`, { method: 'DELETE' });
  publishCatalogChange({ resource: 'menu', action: 'deleted' });
  return true;
}

function mapFood(f, stockByFood) {
  const stockRow = stockByFood.get(f.id);
  const discount = f.current_discount;
  const original = Number(f.original_price ?? f.price);
  const paid = Number(f.discounted_price ?? f.price);

  let resolvedStock = null;
  if (stockRow && stockRow.quantity !== undefined && stockRow.quantity !== null) {
    resolvedStock = Number(stockRow.quantity);
  } else if (f.stock !== undefined && f.stock !== null && f.stock !== '') {
    resolvedStock = Number(f.stock);
  }

  let status = 'Active';
  if (f.is_sold_out || f.is_orderable === false || f.stock_status === 'OUT_OF_STOCK' || (resolvedStock !== null && resolvedStock <= 0)) {
    status = 'Out of Stock';
  } else if (f.stock_status === 'LOW_STOCK' || (resolvedStock !== null && resolvedStock > 0 && resolvedStock < 6)) {
    status = 'Low Stock';
  }

  return {
    id: f.id,
    name: f.name,
    description: f.description || '',
    price: original,
    sellingPrice: paid,
    originalPrice: original,
    discountPrice: discount ? paid : 0,
    discountPercent: discount && discount.type === 'PERCENT' ? Number(discount.value) : 0,
    hasDiscount: Boolean(discount),
    category: f.category_name || '',
    categoryId: f.category,
    foodType: dietToUi(f.diet_type),
    type: dietToUi(f.diet_type),
    stock: resolvedStock,
    lowStockThreshold: stockRow ? Number(stockRow.low_stock_threshold) : null,
    inventoryId: stockRow ? stockRow.id : null,
    status,
    image: f.primary_image || '',
    imageUrl: f.image_url || '',
    currentDiscount: discount || null,
    calories: f.calories,
    is_orderable: f.is_orderable,
    is_sold_out: f.is_sold_out,
    branch: f.branch,
    customizations: (Array.isArray(f.customizations) ? f.customizations : [])
      .filter((option) => option && option.is_active !== false && option.id && option.name)
      .map((option) => ({
        id: option.id,
        name: option.name,
        price: Number(option.extra_price ?? option.price ?? 0),
        extra_price: Number(option.extra_price ?? option.price ?? 0),
      })),
  };
}

async function stockMap() {
  const rows = listOf(await staffJson('/inventory/'));
  return new Map(rows.map((row) => [row.food, row]));
}

export async function listFoods() {
  const [foods, stocks] = await Promise.all([
    staffJson('/foods/?is_active=true'),
    stockMap(),
  ]);
  return listOf(foods).map((food) => mapFood(food, stocks));
}

async function categoryIdByName(name, branchId, { create = true } = {}) {
  const query = branchId ? `?branch=${encodeURIComponent(branchId)}` : '';
  const categories = listOf(await staffJson(`/categories/${query}`));
  const wanted = String(name || '').trim().toLowerCase();
  const found = categories.find((c) => String(c.name).trim().toLowerCase() === wanted);
  if (found) return found.id;
  if (!create) throw new Error(`Category "${name}" was not found in this dish's branch. Choose an existing category.`);
  const created = await createCategory({ name, description: '', status: 'Active' });
  return created.id;
}

function discountUnchanged(data, current) {
  const pct = Number(data.discountPercent || 0);
  const discPrice = Number(data.discountPrice || 0);
  if (!current) return !(pct > 0) && !(discPrice > 0);
  if (current.type === 'PERCENT') return pct === Number(current.value);
  return Math.abs(discPrice - (Number(data.price) - Number(current.value))) < 0.01;
}

async function syncDiscount(foodId, data, current) {
  if (data.discountPercent === undefined && data.discountPrice === undefined) return;
  if (current !== undefined && discountUnchanged(data, current)) return;
  const clear = data.hasDiscount === false || (Number(data.discountPercent) === 0 && Number(data.discountPrice) === 0 && data.discountPrice !== undefined && data.discountPercent !== undefined);
  const pct = Number(data.discountPercent || 0);
  const price = Number(data.price || 0);
  const discPrice = Number(data.discountPrice || 0);
  const existing = listOf(await staffJson(`/dish-discounts/?food=${foodId}`));
  if (clear || (!(pct > 0) && !(discPrice > 0 && discPrice < price))) {
    if (data.discountPercent === undefined && data.discountPrice === undefined) return;
    await Promise.all(existing.filter((d) => d.is_active).map((d) =>
      staffJson(`/dish-discounts/${d.id}/`, { method: 'PATCH', body: JSON.stringify({ is_active: false }) })));
    return;
  }
  const discount_type = pct > 0 ? 'PERCENT' : 'FLAT';
  const value = pct > 0 ? pct : Number((price - discPrice).toFixed(2));
  const from = new Date();
  const to = new Date(from.getTime() + 365 * 24 * 60 * 60 * 1000);
  await Promise.all(existing.filter((d) => d.is_active).map((d) =>
    staffJson(`/dish-discounts/${d.id}/`, { method: 'PATCH', body: JSON.stringify({ is_active: false }) })));
  await staffJson('/dish-discounts/', {
    method: 'POST',
    body: JSON.stringify({
      food: foodId,
      discount_type,
      value,
      valid_from: from.toISOString(),
      valid_to: to.toISOString(),
      is_active: true,
    }),
  });
}

async function syncStock(foodId, quantity, inventoryId) {
  if (quantity === undefined || quantity === null || quantity === '') return;
  const qty = Number(quantity);
  if (Number.isNaN(qty) || qty < 0) return;
  if (inventoryId) {
    await staffJson(`/inventory/${inventoryId}/adjust/`, {
      method: 'POST',
      body: JSON.stringify({ new_quantity: qty, note: 'Updated from the admin menu' }),
    });
    return;
  }
  const rows = listOf(await staffJson(`/inventory/?food=${foodId}`));
  if (rows[0]) {
    if (Number(rows[0].quantity) !== qty) {
      await staffJson(`/inventory/${rows[0].id}/adjust/`, {
        method: 'POST',
        body: JSON.stringify({ new_quantity: qty, note: 'Updated from the admin menu' }),
      });
    }
    return;
  }
  await staffJson('/inventory/', {
    method: 'POST',
    body: JSON.stringify({ food: foodId, quantity: qty }),
  });
}

async function uploadPrimaryImage(foodId, file) {
  const form = new FormData();
  form.append('food', String(foodId));
  form.append('image', file);
  form.append('is_primary', 'true');
  await staffJson('/food-images/', { method: 'POST', body: form });
}

async function syncCustomizations(foodId, toppings) {
  if (!Array.isArray(toppings)) return;
  const existing = listOf(await staffJson(`/customization-options/?food=${foodId}`));
  const keptIds = new Set();
  for (const t of toppings) {
    if (!t.name || !t.name.trim()) continue;
    const price = Number(t.price ?? t.extra_price ?? 0);
    const existingOpt = t.id ? existing.find(e => e.id === t.id) : existing.find(e => e.name.toLowerCase() === t.name.trim().toLowerCase());
    if (existingOpt) {
      keptIds.add(existingOpt.id);
      await staffJson(`/customization-options/${existingOpt.id}/`, {
        method: 'PATCH',
        body: JSON.stringify({ name: t.name.trim(), extra_price: String(price), is_active: t.is_active !== false }),
      });
    } else {
      const created = await staffJson('/customization-options/', {
        method: 'POST',
        body: JSON.stringify({ food: foodId, name: t.name.trim(), extra_price: String(price), is_active: true }),
      });
      keptIds.add(created.id);
    }
  }
  for (const e of existing) {
    if (!keptIds.has(e.id)) {
      await staffJson(`/customization-options/${e.id}/`, { method: 'DELETE' }).catch(() => {});
    }
  }
}

export async function createFood(data) {
  const branch = await currentBranchId();
  const category = await categoryIdByName(data.category, branch);
  const initialStock = data.stock !== undefined && data.stock !== null && data.stock !== '' ? Number(data.stock) : 20;
  const body = {
    branch,
    category,
    name: data.name,
    description: data.description || '',
    diet_type: dietToApi(data.foodType || data.type),
    price: data.price,
    calories: data.calories,
    image_url: data.imageFile ? '' : (data.imageUrl || ''),
    is_active: true,
    initial_stock: initialStock,
    stock: initialStock,
  };
  const created = await staffJson('/foods/', {
    method: 'POST',
    body: JSON.stringify(body),
  });
  // The dish row exists from here on; a failed follow-up step must not look like a failed create.
  try {
    if (data.imageFile) await uploadPrimaryImage(created.id, data.imageFile);
    await syncDiscount(created.id, data);
    await syncStock(created.id, data.stock, null);
    if (Array.isArray(data.toppings) || Array.isArray(data.customizations)) {
      await syncCustomizations(created.id, data.toppings || data.customizations);
    }
  } catch (err) {
    publishCatalogChange({ resource: 'menu', action: 'created' });
    const wrapped = new Error(`"${created.name}" was saved, but ${explain(err)}. Edit the dish to finish setting it up.`);
    wrapped.dishSaved = true;
    throw wrapped;
  }
  publishCatalogChange({ resource: 'menu', action: 'created' });
  const foods = await listFoods();
  return foods.find((f) => f.id === created.id) || created;
}

export async function updateFood(id, data) {
  let current = await staffJson(`/foods/${id}/`);
  const body = {};
  if (data.name) body.name = data.name;
  if (data.description !== undefined) body.description = data.description;
  if (data.price !== undefined && data.price !== '') body.price = data.price;
  if (data.foodType || data.type) body.diet_type = dietToApi(data.foodType || data.type);
  if (data.calories !== undefined) body.calories = data.calories;
  if (data.category) {
    const categoryId = await categoryIdByName(data.category, current.branch, { create: false });
    if (categoryId !== current.category) body.category = categoryId;
  }
  if (data.imageUrl !== undefined && !data.imageFile) body.image_url = data.imageUrl || '';
  if (Object.keys(body).length) {
    current = await staffJson(`/foods/${id}/`, { method: 'PATCH', body: JSON.stringify(body) });
  }
  if (data.imageFile) await uploadPrimaryImage(id, data.imageFile);
  await syncDiscount(id, data, current.current_discount);
  if (data.stock !== undefined && data.stock !== null && data.stock !== '') {
    const row = (await stockMap()).get(Number(id));
    if (!row || Number(row.quantity) !== Number(data.stock)) await syncStock(id, data.stock, row?.id);
  }
  if (Array.isArray(data.toppings) || Array.isArray(data.customizations)) {
    await syncCustomizations(id, data.toppings || data.customizations);
  }
  publishCatalogChange({ resource: 'menu', action: 'updated' });
  const foods = await listFoods();
  return foods.find((f) => String(f.id) === String(id));
}

function publishCatalogChange(detail = {}) {
  const payload = { source: 'mutation', ...detail };
  window.dispatchEvent(new CustomEvent('foodie_inventory_updated', { detail: payload }));
  window.dispatchEvent(new CustomEvent('foodie_products_updated', { detail: payload }));
  window.dispatchEvent(new CustomEvent('foodie_offers_updated', { detail: payload }));
  try {
    localStorage.setItem('foodie_data_sync', JSON.stringify({ t: Date.now(), ...payload }));
  } catch { /* other tabs read the storage event; this tab already received the custom events */ }
}

export async function restockFood(foodId, quantity) {
  const qty = Number(quantity);
  if (!Number.isInteger(qty) || qty <= 0) throw new Error('Enter a positive whole number.');
  const row = listOf(await staffJson(`/inventory/?food=${foodId}`))[0];
  if (row) {
    const saved = await staffJson(`/inventory/${row.id}/restock/`, {
      method: 'POST',
      body: JSON.stringify({ quantity: qty, note: 'Restock from the menu screen' }),
    });
    publishCatalogChange();
    return saved;
  }
  if (!staffIsAdmin()) {
    throw new Error('Only an administrator can create a stock record. Restock adds to an existing one.');
  }
  const created = await staffJson('/inventory/', { method: 'POST', body: JSON.stringify({ food: foodId, quantity: qty }) });
  publishCatalogChange();
  return created;
}

export async function deleteFood(id) {
  await staffJson(`/foods/${id}/`, { method: 'DELETE' });
  publishCatalogChange();
  return true;
}

export async function listInventory() {
  const foods = await listFoods();
  return foods
    .filter((f) => f.inventoryId)
    .map((f) => ({
      ...f,
      stock: Number(f.stock),
      lowStockThreshold: f.lowStockThreshold,
      status: classifyStock(f.stock),
    }));
}

function staffIsAdmin() {
  try {
    const raw = sessionStorage.getItem('foodie_auth_admin') || localStorage.getItem('foodie_auth_admin');
    const user = JSON.parse(raw || '{}').user;
    return user?.role === 'admin';
  } catch {
    return false;
  }
}

export async function setStock(foodId, nextQuantity) {
  const stocks = await stockMap();
  const row = stocks.get(Number(foodId)) || stocks.get(foodId);
  const next = Number(nextQuantity);
  if (!staffIsAdmin()) {
    if (!row) {
      throw new Error('Only an administrator can create a stock record. Restock adds to an existing one.');
    }
    const delta = next - Number(row.quantity);
    if (delta === 0) return { id: foodId, stock: Number(row.quantity) };
    if (delta < 0) {
      throw new Error('Only an administrator can reduce stock. Restock adds a quantity.');
    }
    await staffJson(`/inventory/${row.id}/restock/`, {
      method: 'POST',
      body: JSON.stringify({ quantity: delta, note: 'Restock from the employee screen' }),
    });
    publishCatalogChange();
    return { id: foodId, stock: next };
  }
  await syncStock(foodId, nextQuantity, row?.id);
  publishCatalogChange();
  return { id: foodId, stock: next };
}

function mapCoupon(c) {
  return {
    id: c.id,
    code: c.code,
    discount: Number(c.discount_value),
    type: c.discount_type === 'PERCENT' ? 'percentage' : 'Flat',
    minOrderValue: Number(c.min_order_value || 0),
    status: c.is_active ? 'Active' : 'Inactive',
    validity: c.valid_to,
    description: c.description || '',
    autoApply: Boolean(c.auto_apply),
    isFirstTimeAuto: Boolean(c.is_first_time_auto),
    is_first_time_auto: Boolean(c.is_first_time_auto),
  };
}

export async function listCoupons() {
  return listOf(await staffJson('/coupons/')).map(mapCoupon);
}

export async function createCoupon(couponData) {
  const branch = await currentBranchId();
  const from = new Date();
  let to;
  const disc = parseFloat(couponData.discount ?? couponData.discount_value ?? 0);
  const minOrd = parseFloat(couponData.minOrderValue ?? couponData.min_order_value ?? 0);
  if (minOrd <= disc) {
    throw new Error('Minimum order value must be greater than the discount value.');
  }
  const isPercent = couponData.type === 'percentage' || couponData.discount_type === 'PERCENT' || couponData.discount_type === 'PERCENTAGE';
  if (isPercent && (disc <= 0 || disc > 100)) {
    throw new Error('Percent discount must be between 1 and 100.');
  }
  if (!couponData.validity) {
    throw new Error('Valid until is required.');
  }
  const match = String(couponData.validity).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) throw new Error('Choose a valid until date.');
  to = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 23, 59, 59);
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  if (to < startOfToday) throw new Error('Valid until cannot be earlier than today.');
  if (to <= from) throw new Error('Valid until must be after the start date.');
  const created = await staffJson('/coupons/', {
    method: 'POST',
    body: JSON.stringify({
      branch,
      code: String(couponData.code || '').trim().toUpperCase(),
      description: couponData.description || '',
      discount_type: isPercent ? 'PERCENT' : 'FLAT',
      discount_value: disc,
      min_order_value: minOrd,
      valid_from: from.toISOString(),
      valid_to: to.toISOString(),
      is_active: true,
      auto_apply: Boolean(couponData.autoApply),
      is_first_time_auto: Boolean(couponData.isFirstTimeAuto ?? couponData.is_first_time_auto),
    }),
  });
  publishCatalogChange();
  return mapCoupon(created);
}

export async function updateCoupon(id, couponData) {
  const disc = parseFloat(couponData.discount ?? couponData.discount_value ?? 0);
  const minOrd = parseFloat(couponData.minOrderValue ?? couponData.min_order_value ?? 0);
  if (minOrd <= disc) {
    throw new Error('Minimum order value must be greater than the discount value.');
  }
  const isPercent = couponData.type === 'percentage' || couponData.discount_type === 'PERCENT' || couponData.discount_type === 'PERCENTAGE';
  if (isPercent && (disc <= 0 || disc > 100)) {
    throw new Error('Percent discount must be between 1 and 100.');
  }

  const payload = {
    code: String(couponData.code || '').trim().toUpperCase(),
    description: couponData.description || '',
    discount_type: isPercent ? 'PERCENT' : 'FLAT',
    discount_value: disc,
    min_order_value: minOrd,
    auto_apply: Boolean(couponData.autoApply),
    is_first_time_auto: Boolean(couponData.isFirstTimeAuto ?? couponData.is_first_time_auto),
  };

  if (couponData.validity) {
    const match = String(couponData.validity).match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (match) {
      const to = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 23, 59, 59);
      payload.valid_to = to.toISOString();
    }
  }

  const updated = await staffJson(`/coupons/${id}/`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
  publishCatalogChange({ resource: 'coupon', action: 'updated' });
  return mapCoupon(updated);
}

export async function setCouponAutoApply(id, autoApply) {
  const updated = await staffJson(`/coupons/${id}/`, {
    method: 'PATCH',
    body: JSON.stringify({ auto_apply: Boolean(autoApply) }),
  });
  publishCatalogChange();
  return mapCoupon(updated);
}

export async function toggleCoupon(id, currentStatus) {
  const updated = await staffJson(`/coupons/${id}/`, {
    method: 'PATCH',
    body: JSON.stringify({ is_active: currentStatus !== 'Active' }),
  });
  publishCatalogChange({ resource: 'coupon', action: 'updated' });
  return listCoupons().then((rows) => rows.map((row) => (row.id === updated.id ? mapCoupon(updated) : row)));
}

export async function deleteCoupon(id) {
  await staffJson(`/coupons/${id}/`, { method: 'DELETE' });
  publishCatalogChange({ resource: 'coupon', action: 'deleted' });
  return listCoupons();
}

function mapEmployee(e) {
  const role = e.role;
  const admin = role === 'SUPER_ADMIN' || role === 'ADMIN' || role === 'MANAGER';
  return {
    id: String(e.id),
    userId: e.user_id,
    employeeId: e.employee_code,
    name: e.name,
    email: e.email || '',
    phone: e.phone || '',
    role: admin ? 'admin' : 'employee',
    backendRole: role,
    designation: (e.job_title || role).replace(/^waiter$/i, 'Steward'),
    billAccess: e.bill_access || '',
    department: e.department || '',
    branch: e.branch,
    branch_name: e.branch_name,
    status: e.status,
    joinedDate: e.created_at ? new Date(e.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '',
    isBackendUser: true,
  };
}

export async function listEmployees(branchId) {
  const query = branchId && branchId !== 'ALL' ? `?branch=${branchId}` : '';
  return listOf(await staffJson(`/employees/${query}`)).map(mapEmployee);
}

export async function saveEmployee(form, existing) {
  const role = form.role === 'SUPER_ADMIN' ? 'SUPER_ADMIN' : roleToApi(form.role);
  const body = {
    name: form.name.trim(),
    phone: String(form.phone || '').replace(/\D/g, '').slice(-10),
    email: form.email?.trim() || null,
    role,
    department: form.department || '',
    job_title: form.designation || '',
    bill_access: role === 'CASHIER' ? (form.billAccess || '') : '',
  };
  if (form.status) body.status = form.status;
  if (form.password && form.password.trim()) body.password = form.password.trim();
  if (form.branch === 'ALL') body.branch = null;
  else if (form.branch) body.branch = Number(form.branch);
  else if (!existing) body.branch = await currentBranchId();
  const data = existing
    ? await staffJson(`/employees/${existing.id}/`, { method: 'PATCH', body: JSON.stringify(body) })
    : await staffJson('/employees/', { method: 'POST', body: JSON.stringify(body) });
  return mapEmployee(data);
}

export async function deleteEmployee(id) {
  await staffJson(`/employees/${id}/`, { method: 'DELETE' });
}

const LOCAL_ORDER_OVERRIDES_KEY = 'foodie_order_service_charge_overrides';

export function getLocalOrderOverrides() {
  try {
    const raw = localStorage.getItem(LOCAL_ORDER_OVERRIDES_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

export function saveLocalOrderOverrides(overrides) {
  try {
    localStorage.setItem(LOCAL_ORDER_OVERRIDES_KEY, JSON.stringify(overrides));
  } catch {}
}

export function mapOrder(o) {
  const created = o.created_at ? new Date(o.created_at) : new Date();
  const tableLabel = o.order_type === 'TAKEAWAY' ? 'Takeaway' : (o.table?.label || '—');
  const override = getLocalOrderOverrides()[o.id];
  const finalServiceAmount = override?.service_charge_amount !== undefined
    ? Number(override.service_charge_amount)
    : Number(o.service_charge_amount || 0);
  const finalServiceRate = override?.service_charge_rate !== undefined
    ? override.service_charge_rate
    : o.service_charge_rate;
  const finalTotal = override?.total !== undefined
    ? Number(override.total)
    : Number(o.total_amount);
  const finalRoundOff = override?.round_off !== undefined
    ? Number(override.round_off)
    : Number(o.round_off || 0);

  const displayNo = o.display_order_number || o.display_number || (o.parent_order_id && Number(o.continuation_index) > 0 ? `${o.parent_order_id}.${o.continuation_index}` : String(o.id));

  return {
    id: o.id,
    orderNumber: displayNo,
    backendOrderNumber: o.order_number,
    display_order_number: displayNo,
    display_number: displayNo,
    displayOrderNumber: displayNo,
    parent_order_id: o.parent_order_id || (typeof o.parent_order === 'object' ? o.parent_order?.id : o.parent_order) || null,
    continuation_index: Number(o.continuation_index || 0),
    has_continuations: Boolean(o.has_continuations),
    status: STATUS_LABEL[o.status] || o.status,
    backendStatus: o.status,
    date: created.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }),
    time: created.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true }),
    created_at: o.created_at,
    rawCreatedAt: created.getTime(),
    placedAt: created.getTime(),
    table: tableLabel,
    diners: o.number_of_diners ?? o.diners ?? o.table?.capacity ?? null,
    number_of_diners: o.number_of_diners ?? o.diners ?? o.table?.capacity ?? null,
    table_capacity: o.table?.capacity || null,
    source: o.order_type === 'TAKEAWAY' ? 'Takeaway' : 'Dine-In',
    orderType: o.order_type === 'TAKEAWAY' ? 'Takeaway' : 'Dine-In',
    paymentMethod: o.payment_status,
    paymentMethodName: o.payment_method || '',
    paymentStatus: o.payment_status,
    payment_status: o.payment_status,
    total: finalTotal,
    total_amount: String(finalTotal),
    subtotal: Number(o.items_subtotal || 0),
    items_subtotal: o.items_subtotal,
    discount: Number(o.dish_discount_total || 0) + Number(o.coupon_discount_total || 0),
    dish_discount_total: Number(o.dish_discount_total || 0),
    coupon_discount_total: Number(o.coupon_discount_total || 0),
    customization_total: Number(o.customization_total || 0),
    round_off: finalRoundOff,
    takeaway_charge: Number(o.takeaway_charge || 0),
    taxable_amount: Number(o.taxable_amount || 0),
    packingCharge: Number(o.takeaway_charge || 0),
    gst_rate: o.gst_rate,
    gst_amount: Number(o.gst_amount || 0),
    tax: Number(o.gst_amount || 0),
    service_charge_rate: finalServiceRate,
    service_charge_amount: finalServiceAmount,
    serviceCharge: finalServiceAmount,
    branchId: o.branch_id,
    branch_id: o.branch_id,
    branchName: o.branch_name || '',
    branchAddress: o.branch_address || '',
    branchPhone: o.branch_phone || '',
    branchCity: o.branch_city || '',
    branchEmail: o.branch_email || '',
    customerName: o.customer_name || '',
    tableId: o.table?.id || o.table_id || null,
    table_id: o.table?.id || o.table_id || null,
    tableNumber: o.table_number || o.table?.label || tableLabel,
    table_number: o.table_number || o.table?.label || tableLabel,
    order_type: o.order_type,
    placedById: o.placed_by || null,
    placedByName: o.placed_by_name || '',
    user: o.customer_phone || '',
    customerPhone: o.customer_phone || '',
    items: (o.items || []).map((item) => {
      const customs = Array.isArray(item.customizations) ? item.customizations : (Array.isArray(item.extraIngredients) ? item.extraIngredients : (Array.isArray(item.toppings) ? item.toppings : (Array.isArray(item.options) ? item.options : [])));
      const instructions = item.special_instructions || item.instructions || item.specialInstructions || '';
      return {
        id: item.id,
        food_id: item.food_id,
        name: item.name || item.food_name || item.dish_name || 'Dish Item',
        quantity: item.quantity,
        price: Number(item.unit_price),
        lineTotal: Number(item.line_total),
        customizations: customs,
        extraIngredients: customs,
        toppings: customs,
        instructions: instructions,
        special_instructions: instructions,
        specialInstructions: instructions,
      };
    }),
  };
}

export async function listOrdersForUi(options = {}) {
  let isMine = Boolean(options?.mine);
  let loggedInUser = null;
  try {
    const raw = sessionStorage.getItem('foodie_auth_admin') || localStorage.getItem('foodie_auth_admin');
    if (raw) loggedInUser = JSON.parse(raw);
  } catch {}
  const isEmployee = loggedInUser?.role === 'employee' || ['STAFF', 'CHEF', 'CASHIER'].includes(loggedInUser?.backendRole || loggedInUser?.role);
  if (isEmployee) {
    isMine = true;
  }
  const query = isMine ? '?mine=1' : '';
  const rows = listOf(await staffJson(`/orders/${query}`));
  let mapped = rows.map(mapOrder);
  if (isEmployee && loggedInUser?.id) {
    mapped = mapped.filter((o) => {
      const placedId = String(o.placedById || o.placed_by_id || o.employeeId || '');
      return placedId === String(loggedInUser.id);
    });
  }
  return mapped;
}

export async function transitionOrder(id, status, reason) {
  const apiStatus = STATUS_API[String(status || '').toLowerCase()];
  if (!apiStatus) throw new Error('Unknown status');
  const body = { status: apiStatus };
  if (apiStatus === 'CANCELLED') {
    const text = String(reason || '').trim();
    if (!text) throw new Error('A reason is required to cancel an order.');
    body.reason = text;
  }
  try {
    const data = await staffJson(`/orders/${id}/transition/`, { method: 'POST', body: JSON.stringify(body) });
    return mapOrder(data);
  } catch (err) {
    if (err.status === 409) {
      try {
        const latest = await staffJson(`/orders/${id}/`);
        err.order = mapOrder(latest);
      } catch { /* the original 409 message is still shown */ }
    }
    throw err;
  }
}

export async function proceedToBill(orderId) {
  const data = await staffJson(`/orders/${orderId}/proceed-to-bill/`, {
    method: 'POST',
    body: JSON.stringify({}),
  });
  window.dispatchEvent(new CustomEvent('foodie_orders_updated', { detail: { orderId, status: 'Completed' } }));
  window.dispatchEvent(new CustomEvent('foodie_tables_updated', { detail: { orderId } }));
  try {
    localStorage.setItem('foodie_orders_sync_trigger', String(Date.now()));
  } catch {}
  return data;
}

export async function recordCounterPayment(orderId) {
  const data = await staffJson(`/orders/${orderId}/counter-payment/`, {
    method: 'POST',
    body: JSON.stringify({}),
  });
  return data;
}

export async function updateOrderServiceCharge(orderId, enabled) {
  try {
    const data = await staffJson(`/orders/${orderId}/`, {
      method: 'PATCH',
      body: JSON.stringify({ service_charge_enabled: Boolean(enabled) }),
    });
    // Successfully saved to backend: clear local override
    const overrides = getLocalOrderOverrides();
    if (overrides[orderId]) {
      delete overrides[orderId];
      saveLocalOrderOverrides(overrides);
    }
    return mapOrder(data);
  } catch (err) {
    if (err?.status === 405 || String(err?.message || '').includes('405') || String(err?.message || '').includes('not allowed')) {
      // Remote server without PATCH: maintain per-order setting
      const raw = await staffJson(`/orders/${orderId}/`).catch(() => null);
      const baseOrder = raw ? mapOrder(raw) : { id: orderId };
      const foodAfterCoupon = Math.max(0, Number(baseOrder.taxable_amount || 0) - Number(baseOrder.takeaway_charge || 0));
      let rate = 0;
      let service = 0;
      if (enabled) {
        rate = Number(baseOrder.service_charge_rate || 0);
        if (rate <= 0) {
          rate = 2.0;
        }
        service = Math.round((foodAfterCoupon * rate / 100) * 100) / 100;
      } else {
        rate = 0;
        service = 0;
      }
      const rawTotal = Number(baseOrder.taxable_amount || 0) + Number(baseOrder.gst_amount || 0) + service;
      const payable = Math.round(rawTotal);
      const roundOff = Math.round((payable - rawTotal) * 100) / 100;

      const overrides = getLocalOrderOverrides();
      overrides[orderId] = {
        service_charge_rate: rate,
        service_charge_amount: service,
        round_off: roundOff,
        total: payable,
        total_amount: payable,
      };
      saveLocalOrderOverrides(overrides);

      return {
        ...baseOrder,
        service_charge_rate: rate,
        service_charge_amount: service,
        serviceCharge: service,
        round_off: roundOff,
        roundOff: roundOff,
        total: payable,
        total_amount: payable,
      };
    }
    throw err;
  }
}

export async function downloadInvoice(order) {
  const status = String(order?.status || '').toLowerCase();
  const isTakeaway = order?.order_type === 'TAKEAWAY' || order?.orderType === 'Takeaway';
  if (status !== 'completed' && !(isTakeaway && status === 'served')) {
    window.alert('The invoice is not ready until the order is completed.');
    return;
  }
  const res = await staffFetch(`/orders/${order.id}/invoice/`);
  if (res.status === 409) {
    window.alert('The invoice is not ready until the order is completed.');
    return;
  }
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    window.alert(messageFrom(data) || 'The invoice could not be downloaded.');
    return;
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${order.orderNumber || order.id}.pdf`;
  link.click();
  URL.revokeObjectURL(url);
}

export function explain(err) {
  return messageFrom(err?.data) || err?.message || 'Request failed';
}

export async function createAssistedOrder(payload) {
  return await staffJson('/orders/assisted/', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function getPricingQuote(payload) {
  return await staffJson('/pricing/quote/', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function fetchBillPreview(orderId) {
  return await staffJson(`/billing/preview/${orderId}/`);
}
