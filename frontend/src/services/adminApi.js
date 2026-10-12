import {
  clearStaffSession,
  isStaffScreen,
  messageFrom,
  setStaffSession,
  staffFetch,
  staffJson,
} from './staffClient';
import { classifyStock } from '../utils/stockStatus';

export { isStaffScreen };

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
  const raw = sessionStorage.getItem('foodie_auth_admin');
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
  const res = await fetch('/api/auth/staff/login/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ employee_code: String(code || '').trim(), password }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.detail || 'Invalid employee code or password.');
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
  sessionStorage.setItem('foodie_auth_admin', JSON.stringify({ user, isAuthenticated: true }));
  localStorage.removeItem('foodie_auth_admin');
  localStorage.removeItem('foodie_token_admin');
  return { token: data.access, refresh: data.refresh, user };
}

export async function staffLogout() {
  const refresh = sessionStorage.getItem('foodie_staff_refresh');
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
  return {
    id: b.id,
    name: b.name,
    code: b.code,
    city: '',
    address: b.address || '',
    phone: b.contact_number || '',
    email: b.email || '',
    city: b.city || '',
    managerName: b.manager_name || '',
    openingHours: b.opening_hours || '',
    tablesCount: b.configured_table_count ?? b.tables_count ?? 0,
    liveTables: b.tables_count || 0,
    status: b.is_active ? 'Active' : 'Inactive',
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
    configured_table_count: Math.max(0, parseInt(form.tablesCount, 10) || 0),
  };
  const data = existingId
    ? await staffJson(`/branches/${existingId}/`, { method: 'PATCH', body: JSON.stringify(body) })
    : await staffJson('/branches/', { method: 'POST', body: JSON.stringify(body) });
  branchMemo = null;
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
  };
}

export async function listTableViews() {
  return listOf(await staffJson('/table-views/'));
}

export async function listTables() {
  return listOf(await staffJson('/tables/')).map(mapTable);
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
  return mapCategory(created);
}

export async function updateCategory(id, data) {
  const body = {};
  if (data.name) body.name = data.name.trim();
  if (data.description !== undefined) body.description = data.description;
  if (data.status) body.is_active = data.status !== 'Inactive';
  const updated = await staffJson(`/categories/${id}/`, { method: 'PATCH', body: JSON.stringify(body) });
  return mapCategory(updated);
}

export async function deleteCategory(id) {
  await staffJson(`/categories/${id}/`, { method: 'DELETE' });
  return true;
}

function mapFood(f, stockByFood) {
  const stockRow = stockByFood.get(f.id);
  const discount = f.current_discount;
  const original = Number(f.original_price ?? f.price);
  const paid = Number(f.discounted_price ?? f.price);
  return {
    id: f.id,
    name: f.name,
    description: f.description || '',
    price: paid,
    originalPrice: original,
    discountPrice: discount ? paid : 0,
    discountPercent: discount && discount.type === 'PERCENT' ? Number(discount.value) : 0,
    hasDiscount: Boolean(discount),
    category: f.category_name || '',
    categoryId: f.category,
    foodType: dietToUi(f.diet_type),
    type: dietToUi(f.diet_type),
    stock: stockRow ? Number(stockRow.quantity) : null,
    lowStockThreshold: stockRow ? Number(stockRow.low_stock_threshold) : null,
    inventoryId: stockRow ? stockRow.id : null,
    status: f.is_orderable === false ? 'Out of Stock' : 'Active',
    image: f.primary_image || '',
    imageUrl: f.image_url || '',
    currentDiscount: discount || null,
    calories: f.calories,
    protein: f.protein_grams,
    is_orderable: f.is_orderable,
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
    await staffJson(`/inventory/${rows[0].id}/adjust/`, {
      method: 'POST',
      body: JSON.stringify({ new_quantity: qty, note: 'Updated from the admin menu' }),
    });
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

export async function createFood(data) {
  const branch = await currentBranchId();
  const category = await categoryIdByName(data.category, branch);
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
  };
  if (data.protein !== undefined && data.protein !== null && data.protein !== '') {
    body.protein_grams = data.protein;
  }
  const created = await staffJson('/foods/', {
    method: 'POST',
    body: JSON.stringify(body),
  });
  // The dish row exists from here on; a failed follow-up step must not look like a failed create.
  try {
    if (data.imageFile) await uploadPrimaryImage(created.id, data.imageFile);
    await syncDiscount(created.id, data);
    await syncStock(created.id, data.stock, null);
  } catch (err) {
    const wrapped = new Error(`"${created.name}" was saved, but ${explain(err)}. Edit the dish to finish setting it up.`);
    wrapped.dishSaved = true;
    throw wrapped;
  }
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
  if (data.protein !== undefined) body.protein_grams = data.protein;
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
  const foods = await listFoods();
  return foods.find((f) => String(f.id) === String(id));
}

export async function restockFood(foodId, quantity) {
  const qty = Number(quantity);
  if (!Number.isInteger(qty) || qty <= 0) throw new Error('Enter a positive whole number.');
  const row = listOf(await staffJson(`/inventory/?food=${foodId}`))[0];
  if (row) {
    return staffJson(`/inventory/${row.id}/restock/`, {
      method: 'POST',
      body: JSON.stringify({ quantity: qty, note: 'Restock from the menu screen' }),
    });
  }
  if (!staffIsAdmin()) {
    throw new Error('Only an administrator can create a stock record. Restock adds to an existing one.');
  }
  return staffJson('/inventory/', { method: 'POST', body: JSON.stringify({ food: foodId, quantity: qty }) });
}

export async function deleteFood(id) {
  await staffJson(`/foods/${id}/`, { method: 'DELETE' });
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
    const user = JSON.parse(sessionStorage.getItem('foodie_auth_admin') || '{}').user;
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
    return { id: foodId, stock: next };
  }
  await syncStock(foodId, nextQuantity, row?.id);
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
  };
}

export async function listCoupons() {
  return listOf(await staffJson('/coupons/')).map(mapCoupon);
}

export async function createCoupon(couponData) {
  const branch = await currentBranchId();
  const from = new Date();
  let to = couponData.validity ? new Date(couponData.validity) : new Date(from.getTime() + 30 * 24 * 60 * 60 * 1000);
  if (Number.isNaN(to.getTime()) || to <= from) {
    to = new Date(from.getTime() + 30 * 24 * 60 * 60 * 1000);
  }
  const created = await staffJson('/coupons/', {
    method: 'POST',
    body: JSON.stringify({
      branch,
      code: String(couponData.code || '').trim().toUpperCase(),
      description: couponData.description || '',
      discount_type: 'FLAT',
      discount_value: couponData.discount,
      min_order_value: couponData.minOrderValue || 0,
      valid_from: from.toISOString(),
      valid_to: to.toISOString(),
      is_active: true,
      auto_apply: Boolean(couponData.autoApply),
    }),
  });
  return mapCoupon(created);
}

export async function setCouponAutoApply(id, autoApply) {
  const updated = await staffJson(`/coupons/${id}/`, {
    method: 'PATCH',
    body: JSON.stringify({ auto_apply: Boolean(autoApply) }),
  });
  return mapCoupon(updated);
}

export async function toggleCoupon(id, currentStatus) {
  const updated = await staffJson(`/coupons/${id}/`, {
    method: 'PATCH',
    body: JSON.stringify({ is_active: currentStatus !== 'Active' }),
  });
  return listCoupons().then((rows) => rows.map((row) => (row.id === updated.id ? mapCoupon(updated) : row)));
}

export async function deleteCoupon(id) {
  await staffJson(`/coupons/${id}/`, { method: 'DELETE' });
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

export async function listEmployees() {
  return listOf(await staffJson('/employees/')).map(mapEmployee);
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

export function mapOrder(o) {
  const created = o.created_at ? new Date(o.created_at) : new Date();
  const tableLabel = o.order_type === 'TAKEAWAY' ? 'Takeaway' : (o.table?.label || '—');
  return {
    id: o.id,
    orderNumber: o.order_number,
    status: STATUS_LABEL[o.status] || o.status,
    backendStatus: o.status,
    date: created.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }),
    time: created.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true }),
    created_at: o.created_at,
    rawCreatedAt: created.getTime(),
    placedAt: created.getTime(),
    table: tableLabel,
    diners: '',
    source: o.order_type === 'TAKEAWAY' ? 'Takeaway' : 'Dine-In',
    orderType: o.order_type === 'TAKEAWAY' ? 'Takeaway' : 'Dine-In',
    paymentMethod: o.payment_status,
    paymentMethodName: o.payment_method || '',
    paymentStatus: o.payment_status,
    payment_status: o.payment_status,
    total: Number(o.total_amount),
    total_amount: o.total_amount,
    subtotal: Number(o.items_subtotal || 0),
    items_subtotal: o.items_subtotal,
    discount: Number(o.dish_discount_total || 0) + Number(o.coupon_discount_total || 0),
    dish_discount_total: Number(o.dish_discount_total || 0),
    coupon_discount_total: Number(o.coupon_discount_total || 0),
    customization_total: Number(o.customization_total || 0),
    round_off: Number(o.round_off || 0),
    takeaway_charge: Number(o.takeaway_charge || 0),
    taxable_amount: Number(o.taxable_amount || 0),
    packingCharge: Number(o.takeaway_charge || 0),
    gst_rate: o.gst_rate,
    gst_amount: Number(o.gst_amount || 0),
    tax: Number(o.gst_amount || 0),
    service_charge_rate: o.service_charge_rate,
    service_charge_amount: Number(o.service_charge_amount || 0),
    serviceCharge: Number(o.service_charge_amount || 0),
    branchId: o.branch_id,
    branch_id: o.branch_id,
    branchName: o.branch_name || '',
    branchAddress: o.branch_address || '',
    branchPhone: o.branch_phone || '',
    branchCity: o.branch_city || '',
    branchEmail: o.branch_email || '',
    customerName: o.customer_name || '',
    tableId: o.table?.id || null,
    order_type: o.order_type,
    placedById: o.placed_by || null,
    placedByName: o.placed_by_name || '',
    user: o.customer_phone || '',
    customerPhone: o.customer_phone || '',
    items: (o.items || []).map((item) => ({
      id: item.id,
      food_id: item.food_id,
      name: item.name,
      quantity: item.quantity,
      price: Number(item.unit_price),
      lineTotal: Number(item.line_total),
      customizations: item.customizations || [],
      special_instructions: item.special_instructions || '',
    })),
  };
}

export async function listOrdersForUi() {
  const path = typeof window !== 'undefined' ? window.location.pathname : '';
  const mine = path.startsWith('/employee');
  const rows = listOf(await staffJson(`/orders/${mine ? '?mine=1' : ''}`));
  return rows.map(mapOrder);
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
  const data = await staffJson(`/orders/${id}/transition/`, { method: 'POST', body: JSON.stringify(body) });
  return mapOrder(data);
}

export async function recordCounterPayment(orderId) {
  const data = await staffJson(`/orders/${orderId}/counter-payment/`, {
    method: 'POST',
    body: JSON.stringify({}),
  });
  return data;
}

export async function downloadInvoice(order) {
  const status = String(order?.status || '').toLowerCase();
  if (status !== 'completed') {
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
