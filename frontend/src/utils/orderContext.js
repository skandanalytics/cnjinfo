// The customer's Dine-In / Takeaway choice for this browser tab. The server cart (PUT /cart/context/) is the
// source of truth at checkout; this only remembers the choice between pages. Dine-In additionally needs the
// QR token of a scanned table, which the backend verifies against the branch.
const TYPE_KEY = 'foodie_order_type';
const QR_KEY = 'foodie_table_qr';
const TABLE_KEY = 'foodie_selected_table';

export const DINE_IN = 'DINE_IN';
export const TAKEAWAY = 'TAKEAWAY';

export function normalizeOrderType(value) {
  const v = String(value || '').trim().toUpperCase().replace(/[\s-]+/g, '_');
  if (v === TAKEAWAY) return TAKEAWAY;
  if (v === DINE_IN || v === 'TABLE') return DINE_IN;
  return null;
}

export function getOrderType() {
  const direct = normalizeOrderType(sessionStorage.getItem(TYPE_KEY));
  if (direct) return direct;
  try {
    const tableRaw = sessionStorage.getItem('foodie_table') || localStorage.getItem('foodie_table');
    if (tableRaw) {
      const parsed = JSON.parse(tableRaw);
      const tNum = String(parsed?.tableNumber || parsed?.number || '').toLowerCase();
      if (tNum === 'takeaway' || parsed?.isTakeaway) return TAKEAWAY;
      return DINE_IN;
    }
  } catch (e) {}
  return null;
}

export function setOrderType(value) {
  const type = normalizeOrderType(value);
  if (type) sessionStorage.setItem(TYPE_KEY, type);
  else sessionStorage.removeItem(TYPE_KEY);
  localStorage.removeItem(TYPE_KEY); // an old cross-session copy must not resurrect Dine-In without a QR
  return type;
}

export function getScannedTableQr() {
  return sessionStorage.getItem(QR_KEY) || null;
}

export function rememberScannedTableQr(qr) {
  if (qr) sessionStorage.setItem(QR_KEY, qr);
  else sessionStorage.removeItem(QR_KEY);
}

export function hasScannedTable() {
  return Boolean(getScannedTableQr());
}

export function getSelectedTableId() {
  const id = Number(sessionStorage.getItem(TABLE_KEY));
  if (Number.isInteger(id) && id > 0) return id;
  try {
    const tableRaw = sessionStorage.getItem('foodie_table') || localStorage.getItem('foodie_table');
    if (tableRaw) {
      const parsed = JSON.parse(tableRaw);
      const tid = Number(parsed?.tableId || parsed?.id);
      if (Number.isInteger(tid) && tid > 0) return tid;
    }
  } catch (e) {}
  return null;
}

export function setSelectedTableId(id) {
  if (id) sessionStorage.setItem(TABLE_KEY, String(id));
  else sessionStorage.removeItem(TABLE_KEY);
}

export function hasDineInTable() {
  return hasScannedTable() || Boolean(getSelectedTableId());
}

export const NO_TABLES_MESSAGE = 'No tables are currently available for dine-in. Please choose Takeaway or try again later.';
export const DINE_IN_NEEDS_QR = 'Choose an available table for Dine-In, or scan the QR code on your table.';
