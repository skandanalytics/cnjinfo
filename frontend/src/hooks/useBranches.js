import { useEffect, useState, useCallback } from 'react';

let memoryCachedBranches = null;
try {
  const stored = localStorage.getItem('foodie_cached_branches');
  if (stored) {
    const parsed = JSON.parse(stored);
    if (Array.isArray(parsed) && parsed.length > 0) {
      memoryCachedBranches = parsed;
    }
  }
} catch (e) {}

/**
 * Normalizes branch object to ensure both camelCase and snake_case properties
 * (is_primary, isMainBranch, is_active, status) are consistently populated.
 */
function normalizeBranch(b) {
  if (!b) return null;
  const isPrimary = Boolean(b.is_primary || b.isMainBranch);
  const isActive = (b.is_active !== false && b.status !== 'Inactive');
  const status = isActive ? 'Active' : 'Inactive';
  return {
    ...b,
    id: b.id,
    name: b.name || `Branch #${b.id}`,
    code: b.code || `BR${String(b.id).padStart(3, '0')}`,
    status,
    is_active: isActive,
    is_primary: isPrimary,
    isMainBranch: isPrimary,
  };
}

/**
 * Unified resilient branch loader.
 * Tries staff admin API, restaurantService, direct authenticated API,
 * and public branch list so branches are always resolved regardless of auth timing.
 */
export async function fetchUnifiedBranches() {
  // 1. Try listBranches() from adminApi
  try {
    const { listBranches } = await import('../services/adminApi');
    const rows = await listBranches();
    if (Array.isArray(rows)) {
      return rows.map(normalizeBranch).filter(Boolean);
    }
  } catch (e) {}

  // 2. Try restaurantService.getRestaurants() (which has built-in fallbacks)
  try {
    const { restaurantService } = await import('../services/restaurantService');
    const res = await restaurantService.getRestaurants();
    const rows = Array.isArray(res) ? res : (res?.data || res?.results || []);
    if (Array.isArray(rows)) {
      return rows.map(normalizeBranch).filter(Boolean);
    }
  } catch (e) {}

  // 3. Direct api.get('/branches/') via Axios
  try {
    const { default: api } = await import('../services/api');
    const res = await api.get('/branches/');
    const rows = Array.isArray(res.data) ? res.data : (res.data?.results || []);
    if (Array.isArray(rows)) {
      return rows.map(normalizeBranch).filter(Boolean);
    }
  } catch (e) {}

  // 4. Fallback to /public/branches/
  try {
    const { default: api } = await import('../services/api');
    const res = await api.get('/public/branches/');
    const rows = Array.isArray(res.data) ? res.data : (res.data?.results || []);
    if (Array.isArray(rows)) {
      return rows.map(normalizeBranch).filter(Boolean);
    }
  } catch (e) {}

  return [];
}

export function purgeBranchCaches() {
  memoryCachedBranches = [];
  try {
    localStorage.removeItem('foodie_cached_branches');
    localStorage.removeItem('foodie_public_branch');
    sessionStorage.removeItem('foodie_public_branch');
    localStorage.setItem('foodie_admin_selected_branch', 'ALL');
    sessionStorage.setItem('foodie_admin_selected_branch', 'ALL');
    window.dispatchEvent(new CustomEvent('foodie_branches_updated'));
    window.dispatchEvent(new CustomEvent('foodie_branch_selected', { detail: { branchId: 'ALL' } }));
  } catch (e) {}
}

export function useBranches(user = null) {
  const [branches, setBranches] = useState(() => memoryCachedBranches || []);
  const [loading, setLoading] = useState(() => !memoryCachedBranches || memoryCachedBranches.length === 0);

  const syncCacheAndStorage = useCallback((rows) => {
    if (!Array.isArray(rows)) return;
    setBranches(rows);
    memoryCachedBranches = rows;
    if (rows.length > 0) {
      try {
        localStorage.setItem('foodie_cached_branches', JSON.stringify(rows));
        // Invalidate stale selected admin branch if it points to non-existent ID
        const curAdmin = localStorage.getItem('foodie_admin_selected_branch');
        if (curAdmin && curAdmin !== 'ALL' && !rows.some(r => String(r.id) === String(curAdmin))) {
          localStorage.setItem('foodie_admin_selected_branch', 'ALL');
          sessionStorage.setItem('foodie_admin_selected_branch', 'ALL');
        }
        // Invalidate stale public branch if it points to non-existent ID
        const curPub = localStorage.getItem('foodie_public_branch');
        if (curPub && !rows.some(r => String(r.id) === String(curPub))) {
          localStorage.removeItem('foodie_public_branch');
          sessionStorage.removeItem('foodie_public_branch');
        }
      } catch (e) {}
    } else {
      // Empty list from backend: purge stale branch caches
      try {
        localStorage.removeItem('foodie_cached_branches');
        localStorage.removeItem('foodie_public_branch');
        sessionStorage.removeItem('foodie_public_branch');
        const curAdmin = localStorage.getItem('foodie_admin_selected_branch');
        if (curAdmin && curAdmin !== 'ALL') {
          localStorage.setItem('foodie_admin_selected_branch', 'ALL');
          sessionStorage.setItem('foodie_admin_selected_branch', 'ALL');
        }
      } catch (e) {}
    }
  }, []);

  const load = useCallback(async () => {
    try {
      const rows = await fetchUnifiedBranches();
      if (Array.isArray(rows)) {
        syncCacheAndStorage(rows);
      }
    } catch {
      // Keep previous cached branches on error
    } finally {
      setLoading(false);
    }
  }, [syncCacheAndStorage]);

  useEffect(() => {
    let cancelled = false;

    const performLoad = async () => {
      try {
        const rows = await fetchUnifiedBranches();
        if (!cancelled && Array.isArray(rows)) {
          syncCacheAndStorage(rows);
        }
      } catch {
        // preserve cached branches on network error
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    performLoad();

    const handleStorage = (e) => {
      if (e.key === 'foodie_cached_branches' || e.key === 'foodie_staff_access') {
        performLoad();
      }
    };

    window.addEventListener('foodie_branches_updated', performLoad);
    window.addEventListener('foodie_auth_changed', performLoad);
    window.addEventListener('foodie_login', performLoad);
    window.addEventListener('storage', handleStorage);
    window.addEventListener('focus', performLoad);

    return () => {
      cancelled = true;
      window.removeEventListener('foodie_branches_updated', performLoad);
      window.removeEventListener('foodie_auth_changed', performLoad);
      window.removeEventListener('foodie_login', performLoad);
      window.removeEventListener('storage', handleStorage);
      window.removeEventListener('focus', performLoad);
    };
  }, [user?.id, user?.role, user?.backendRole, syncCacheAndStorage]);

  const hasBranches = loading ? true : branches.length > 0;
  return { branches, loading, hasBranches, refreshBranches: load };
}
