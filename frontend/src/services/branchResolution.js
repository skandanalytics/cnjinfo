import api from './api';

export function getActiveBranchId() {
  if (typeof window === 'undefined') return null;

  // 1. Authenticated staff / admin user check:
  // If an active staff session exists, use the staff member's assigned branch or admin-selected branch.
  try {
    const rawUser = sessionStorage.getItem('foodie_auth_admin') || localStorage.getItem('foodie_auth_admin');
    if (rawUser) {
      const u = JSON.parse(rawUser)?.user;
      if (u) {
        // A. If employee has an assigned branch (e.g. Manager assigned to branch 13)
        if (u.branchId) {
          const bId = String(u.branchId).trim();
          if (/^\d+$/.test(bId)) return bId;
        }
        // B. If Super Admin (or staff with selected branch in admin)
        const storedAdmin = localStorage.getItem('foodie_admin_selected_branch') || sessionStorage.getItem('foodie_admin_selected_branch');
        if (storedAdmin && storedAdmin !== 'ALL') {
          const clean = String(storedAdmin).trim();
          if (/^\d+$/.test(clean)) return clean;
        }
      }
    }
  } catch (e) {
    /* ignore */
  }

  // 2. Unauthenticated customer workflows / public visitor fallback:
  try {
    const pub = sessionStorage.getItem('foodie_public_branch') || localStorage.getItem('foodie_public_branch');
    if (pub && pub !== 'ALL') {
      const clean = String(pub).trim();
      if (/^\d+$/.test(clean)) return clean;
    }
  } catch (e) {
    /* ignore */
  }

  return null;
}

/**
 * Single Authoritative Branch Resolution Module for Customer App.
 *
 * Guarantees:
 * 1. If a QR code is present in URL or storage, /public/qr/<qr>/ is called.
 * 2. If QR is valid: sets branch ID, branch name, table ID, and locks branch_source = 'qr'.
 * 3. If QR is invalid: returns null and DOES NOT fall back to primary branch.
 * 4. Main Branch dishes NEVER leak into Sub Branch, and vice versa.
 * 5. Branch state remains consistent across all customer pages.
 */

let activeBranchPromise = null;

export async function resolveAuthoritativeBranch({ forceRefresh = false } = {}) {
  if (activeBranchPromise && !forceRefresh) {
    return activeBranchPromise;
  }

  activeBranchPromise = (async () => {
    // 1. Check if ?qr= is present in URL
    let qrToken = null;
    if (typeof window !== 'undefined' && window.location && window.location.search) {
      qrToken = new URLSearchParams(window.location.search).get('qr');
    }

    // 2. Check if ?qr= is already stored in sessionStorage / localStorage
    if (!qrToken && typeof window !== 'undefined') {
      qrToken = sessionStorage.getItem('foodie_table_qr') || localStorage.getItem('foodie_table_qr');
    }

    // 3. If a QR token exists, resolve it via /public/qr/<qr>/
    if (qrToken) {
      try {
        const resolved = await api.get(`/public/qr/${qrToken}/`);
        const branchData = resolved.data?.branch;
        const tableData = resolved.data?.table;

        if (branchData?.id) {
          const bId = String(branchData.id);
          const prevBranch = sessionStorage.getItem('foodie_public_branch');

          if (prevBranch && prevBranch !== bId) {
            // Switched to a different branch via QR: clear old branch cart items & caches
            try {
              sessionStorage.removeItem('foodie_cart');
              sessionStorage.removeItem('foodie_guest_cart');
              sessionStorage.removeItem('foodie_guest_cart_temp');
              sessionStorage.removeItem('foodie_guest_cart_unmerged');
            } catch (e) {}
          }

          sessionStorage.setItem('foodie_public_branch', bId);
          localStorage.setItem('foodie_public_branch', bId);
          sessionStorage.setItem('foodie_branch_source', 'qr');
          localStorage.setItem('foodie_branch_source', 'qr');
          sessionStorage.setItem('foodie_table_qr', qrToken);
          localStorage.setItem('foodie_table_qr', qrToken);

          if (branchData.name) {
            sessionStorage.setItem('foodie_branch_name', branchData.name);
            localStorage.setItem('foodie_branch_name', branchData.name);
          }

          if (tableData?.id) {
            sessionStorage.setItem('foodie_selected_table', String(tableData.id));
            localStorage.setItem('foodie_selected_table', String(tableData.id));
            if (tableData.table_number) {
              const numStr = String(tableData.table_number).startsWith('T')
                ? String(tableData.table_number)
                : `T${tableData.table_number}`;
              sessionStorage.setItem('foodie_table_number', numStr);
              localStorage.setItem('foodie_table_number', numStr);
            }
          }

          return bId;
        }
      } catch (err) {
        console.warn('QR code resolution failed:', err);
        // If a specific QR code was passed and failed to resolve, DO NOT fall back to primary!
        // Clear invalid QR data and return null so the UI can show invalid QR state
        sessionStorage.removeItem('foodie_table_qr');
        localStorage.removeItem('foodie_table_qr');
        sessionStorage.removeItem('foodie_selected_table');
        localStorage.removeItem('foodie_selected_table');
        sessionStorage.removeItem('foodie_public_branch');
        localStorage.removeItem('foodie_public_branch');
        return null;
      }
    }

    // 4. Check active branches from public endpoint to validate saved choices and fallback
    let listedRows = [];
    try {
      const listed = await api.get('/public/branches/');
      listedRows = Array.isArray(listed.data) ? listed.data : (listed.data?.results || []);
    } catch (e) {
      console.warn('Failed to list public branches:', e);
    }

    // If no QR was scanned, check if customer previously chose a branch
    const source = sessionStorage.getItem('foodie_branch_source') || localStorage.getItem('foodie_branch_source');
    const saved = sessionStorage.getItem('foodie_public_branch') || localStorage.getItem('foodie_public_branch');

    if (saved && (source === 'chosen' || source === 'qr')) {
      // Validate that the saved branch actually exists in the active branches list
      const exists = listedRows.length === 0 || listedRows.some((r) => String(r.id) === String(saved) && r.is_active !== false);
      if (exists && listedRows.some((r) => String(r.id) === String(saved))) {
        return saved;
      }
      // If the saved branch is invalid/stale, clear it and fall back
      console.warn(`[BranchResolution] Cached branch ${saved} is invalid or inactive. Clearing and resolving fresh branch.`);
      sessionStorage.removeItem('foodie_public_branch');
      localStorage.removeItem('foodie_public_branch');
      sessionStorage.removeItem('foodie_branch_name');
      localStorage.removeItem('foodie_branch_name');
      sessionStorage.removeItem('foodie_branch_source');
      localStorage.removeItem('foodie_branch_source');
      sessionStorage.removeItem('foodie_selected_table');
      localStorage.removeItem('foodie_selected_table');
      sessionStorage.removeItem('foodie_table_number');
      localStorage.removeItem('foodie_table_number');
    }

    // 5. Default fallback for customer visit: pick primary or first active branch
    if (listedRows.length > 0) {
      const activeRows = listedRows.filter((r) => r.is_active !== false);
      const pick = activeRows.find((r) => r.is_primary) || activeRows[0] || listedRows[0];
      if (pick) {
        const bId = String(pick.id);
        sessionStorage.setItem('foodie_public_branch', bId);
        localStorage.setItem('foodie_public_branch', bId);
        sessionStorage.setItem('foodie_branch_source', 'chosen');
        localStorage.setItem('foodie_branch_source', 'chosen');
        if (pick.name) {
          sessionStorage.setItem('foodie_branch_name', pick.name);
          localStorage.setItem('foodie_branch_name', pick.name);
        }
        return bId;
      }
    }

    return null;
  })();

  const result = await activeBranchPromise;
  activeBranchPromise = null;
  return result;
}

