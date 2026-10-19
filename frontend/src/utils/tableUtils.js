/**
 * Shared formatter for compact table numbers (e.g., "T01", "T02", "T10").
 * Strips redundant words such as "Table", "Dine-In", parentheses, colons.
 * Does NOT fabricate a table number if none is selected.
 * Preserves "Takeaway" if order is takeaway.
 */
export const formatCompactTableLabel = (raw) => {
  if (raw === null || raw === undefined) return '';
  if (typeof raw === 'object') {
    raw = raw.table_number || raw.number || raw.tableNumber || raw.tableId || raw.name || '';
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
export default formatCompactTableLabel;
