export const formatCurrency = (value) => {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return '₹0.00';
  const rounded = Math.round(amount * 100) / 100;
  const isNegative = rounded < 0;
  const absValue = Math.abs(rounded);
  const formatted = absValue.toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return isNegative ? `-₹${formatted}` : `₹${formatted}`;
};

export default formatCurrency;
