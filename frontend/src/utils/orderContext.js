// The customer's Dine-In / Takeaway choice for this browser tab. The server cart (PUT /cart/context/) is the
// source of truth at checkout; this only remembers the choice between pages. Dine-In additionally needs the
// QR token of a scanned table, which the backend verifies against the branch.
const TYPE_KEY = 'foodie_order_type';
const QR_KEY = 'foodie_table_qr';
const TABLE_KEY = 'foodie_selected_table';
const LAST_DINE_IN_TABLE_KEY = 'foodie_last_dine_in_table';

export const DINE_IN = 'DINE_IN';
export const TAKEAWAY = 'TAKEAWAY';

export function normalizeOrderType(value) {
  const v = String(value || '').trim().toUpperCase().replace(/[\s-]+/g, '_');
  if (v === TAKEAWAY) return TAKEAWAY;
  if (v === DINE_IN || v === 'TABLE') return DINE_IN;
  return null;
}

export function getOrderType() {
  const direct = normalizeOrderType(sessionStorage.getItem(TYPE_KEY) || localStorage.getItem(TYPE_KEY));
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
  if (type) {
    sessionStorage.setItem(TYPE_KEY, type);
    localStorage.setItem(TYPE_KEY, type);
  } else {
    sessionStorage.removeItem(TYPE_KEY);
    localStorage.removeItem(TYPE_KEY);
  }
  return type;
}

export function getScannedTableQr() {
  return sessionStorage.getItem(QR_KEY) || localStorage.getItem(QR_KEY) || null;
}

export function rememberScannedTableQr(qr) {
  if (qr) {
    sessionStorage.setItem(QR_KEY, qr);
    localStorage.setItem(QR_KEY, qr);
  } else {
    sessionStorage.removeItem(QR_KEY);
    localStorage.removeItem(QR_KEY);
  }
}

export function hasScannedTable() {
  return Boolean(getScannedTableQr());
}

export function getLastDineInTableId() {
  const id = Number(sessionStorage.getItem(LAST_DINE_IN_TABLE_KEY) || localStorage.getItem(LAST_DINE_IN_TABLE_KEY));
  return Number.isInteger(id) && id > 0 ? id : null;
}

export function rememberDineInTableId(id) {
  if (id && Number.isInteger(Number(id)) && Number(id) > 0) {
    sessionStorage.setItem(LAST_DINE_IN_TABLE_KEY, String(id));
    localStorage.setItem(LAST_DINE_IN_TABLE_KEY, String(id));
  } else if (!id) {
    sessionStorage.removeItem(LAST_DINE_IN_TABLE_KEY);
    localStorage.removeItem(LAST_DINE_IN_TABLE_KEY);
  }
}

export function getSelectedTableId() {
  const id = Number(sessionStorage.getItem(TABLE_KEY));
  if (Number.isInteger(id) && id > 0) return id;
  const lastId = getLastDineInTableId();
  if (lastId) return lastId;
  try {
    const tableRaw = sessionStorage.getItem('foodie_table') || localStorage.getItem('foodie_table');
    if (tableRaw) {
      const parsed = JSON.parse(tableRaw);
      const tNum = String(parsed?.tableNumber || parsed?.number || '').toLowerCase();
      if (tNum !== 'takeaway' && !parsed?.isTakeaway) {
        const tid = Number(parsed?.tableId || parsed?.id);
        if (Number.isInteger(tid) && tid > 0) return tid;
      }
    }
  } catch (e) {}
  return null;
}

export function setSelectedTableId(id, tableNumber = null) {
  if (id && Number.isInteger(Number(id)) && Number(id) > 0) {
    sessionStorage.setItem(TABLE_KEY, String(id));
    localStorage.setItem(TABLE_KEY, String(id));
    sessionStorage.setItem(LAST_DINE_IN_TABLE_KEY, String(id));
    localStorage.setItem(LAST_DINE_IN_TABLE_KEY, String(id));
    try {
      const currentTableRaw = sessionStorage.getItem('foodie_table') || localStorage.getItem('foodie_table');
      const current = currentTableRaw ? JSON.parse(currentTableRaw) : {};
      const numStr = tableNumber || current.tableNumber || (Number(id) < 10 ? `T0${id}` : `T${id}`);
      const updated = {
        ...current,
        tableId: id,
        id,
        tableNumber: numStr,
        orderType: DINE_IN,
        isTakeaway: false,
      };
      sessionStorage.setItem('foodie_table', JSON.stringify(updated));
      localStorage.setItem('foodie_table', JSON.stringify(updated));
    } catch (e) {}
  } else {
    sessionStorage.removeItem(TABLE_KEY);
    localStorage.removeItem(TABLE_KEY);
  }
}

export function hasDineInTable() {
  return hasScannedTable() || Boolean(getSelectedTableId());
}

export const NO_TABLES_MESSAGE = 'No tables are currently available for dine-in. Please choose Takeaway or try again later.';
export const DINE_IN_NEEDS_QR = 'Choose an available table for Dine-In, or scan the QR code on your table.';
