import { useEffect, useState } from 'react';

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

export function useBranches() {
  const [branches, setBranches] = useState(() => memoryCachedBranches || []);
  const [loading, setLoading] = useState(() => !memoryCachedBranches || memoryCachedBranches.length === 0);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const { listBranches } = await import('../services/adminApi');
        const rows = await listBranches();
        if (!cancelled) {
          const list = Array.isArray(rows) ? rows : [];
          setBranches(list);
          memoryCachedBranches = list;
          try {
            localStorage.setItem('foodie_cached_branches', JSON.stringify(list));
          } catch (e) {}
        }
      } catch {
        if (!cancelled && !memoryCachedBranches) setBranches([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load();
    window.addEventListener('foodie_branches_updated', load);
    return () => {
      cancelled = true;
      window.removeEventListener('foodie_branches_updated', load);
    };
  }, []);

  const hasBranches = loading ? true : branches.length > 0;
  return { branches, loading, hasBranches };
}
