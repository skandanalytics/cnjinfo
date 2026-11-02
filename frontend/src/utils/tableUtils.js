/**
 * Shared formatter for compact table numbers (e.g., "T01", "T02", "T10").
 * Strips redundant words such as "Table", "Dine-In", parentheses, colons.
 * Does NOT fabricate a table number if none is selected.
 * Preserves "Takeaway" if order is takeaway.
 */
export const formatCompactTableLabel = (raw) => {
  if (raw === null || raw === undefined) return '';
  if (typeof raw === 'object') {
    raw = raw.table_number || raw.number || raw.tableNumber || raw.name || (raw.tableId && !Number.isInteger(Number(raw.tableId)) ? raw.tableId : '') || '';
  }
  let str = String(raw).trim();
  if (
    !str ||
    str.toLowerCase() === 'null' ||
    str.toLowerCase() === 'undefined' ||
    str.toLowerCase() === 'none' ||
    str.toLowerCase() === 'nan'
  ) {
    return '';
  }
  if (str.toLowerCase() === 'takeaway') {
    return 'Takeaway';
  }

  // Strip redundant words and symbols
  str = str.replace(/table/gi, '').replace(/dine-in/gi, '').replace(/[():]/g, '').trim();

  // If contains digits, format as T01, T02, T10, etc.
  const match = str.match(/\d+/);
  if (match) {
    const num = parseInt(match[0], 10);
    return num < 10 ? `T0${num}` : `T${num}`;
  }

  // If clean alpha-numeric without digits
  return str ? (str.toUpperCase().startsWith('T') ? str.toUpperCase() : `T${str.toUpperCase()}`) : '';
};

export const formatTableNumber = formatCompactTableLabel;

/**
 * Calculates the next available table number for a branch.
 * Finds the smallest positive integer n >= 1 that is not currently used by any active table in existingTables.
 * E.g., if T01..T07 and T09 exist, returns 'T08'.
 * If T08 is deleted (no longer in existingTables), suggests 'T08'.
 * Formats 1-9 as 'T01'-'T09', and >= 10 as 'T10', 'T11', 'T100', etc. Never returns 'T00'.
 */
export const getNextAvailableTableNumber = (existingTables = []) => {
  const usedNumbers = new Set();
  (existingTables || []).forEach((t) => {
    if (!t) return;
    const raw = String(t.number || t.table_number || t.name || '').trim();
    const clean = raw.replace(/^TABLE[\s-_]*/i, '').trim();
    const match = clean.match(/^T0*(\d+)$/i) || clean.match(/^(\d+)$/);
    if (match) {
      const n = parseInt(match[1], 10);
      if (n > 0) usedNumbers.add(n);
    }
  });

  let next = 1;
  while (usedNumbers.has(next)) {
    next += 1;
  }
  return next < 10 ? `T0${next}` : `T${next}`;
};

export default formatCompactTableLabel;
