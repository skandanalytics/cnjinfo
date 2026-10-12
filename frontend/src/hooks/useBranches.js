import { useEffect, useState } from 'react';

export function useBranches() {
  const [branches, setBranches] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const { listBranches } = await import('../services/adminApi');
        const rows = await listBranches();
        if (!cancelled) setBranches(Array.isArray(rows) ? rows : []);
      } catch {
        if (!cancelled) setBranches([]);
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

  return { branches, loading, hasBranches: branches.length > 0 };
}
