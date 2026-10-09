/** Mirrors backend/apps/accounts/staff_catalog.py. Unknown stored departments stay editable. */

export const CASHIER_BILL_OPTIONS = [
  { id: 'counter_payment', label: 'Record counter payment' },
  { id: 'print_bill', label: 'Print and preview bills' },
];

export const STAFF_CATALOG = {
  'Dining Floor': {
    roles: [{ value: 'STAFF', label: 'Steward / Dining Floor' }],
    designations: {
      STAFF: ['Steward', 'Head Steward'],
    },
  },
  Kitchen: {
    roles: [{ value: 'CHEF', label: 'Chef / Kitchen' }],
    designations: {
      CHEF: ['Chef', 'Head Chef', 'Cook'],
    },
  },
  'Billing & POS': {
    roles: [{ value: 'CASHIER', label: 'Cashier / Billing' }],
    designations: {
      CASHIER: ['Cashier', 'Billing Executive'],
    },
  },
  Logistics: {
    roles: [{ value: 'STAFF', label: 'Delivery staff' }],
    designations: {
      STAFF: ['Delivery Staff'],
    },
  },
  Management: {
    roles: [
      { value: 'MANAGER', label: 'Branch Manager' },
      { value: 'ADMIN', label: 'Administrator' },
    ],
    designations: {
      MANAGER: ['Branch Manager'],
      ADMIN: ['Restaurant Administrator'],
    },
  },
};

export const DEPARTMENT_OPTIONS = Object.keys(STAFF_CATALOG);

export function rolesForDepartment(department) {
  return STAFF_CATALOG[department]?.roles || [];
}

export function designationsFor(department, role) {
  return STAFF_CATALOG[department]?.designations?.[role] || [];
}

export function displayJobTitle(title) {
  const value = String(title || '').trim();
  if (value.toLowerCase() === 'waiter') return 'Steward';
  return value;
}
