import React, { createContext, useContext, useState, useEffect, useMemo, useCallback } from 'react';
import { useAuth } from '../hooks/useAuth';
import { useBranches } from '../hooks/useBranches';

export const BranchContext = createContext(null);

export function BranchProvider({ children }) {
  const { user } = useAuth();
  const { branches, loading: branchesLoading, refreshBranches } = useBranches(user);

  const [selectedBranch, setSelectedBranchState] = useState(() => {
    try {
      return localStorage.getItem('foodie_admin_selected_branch') || 'ALL';
    } catch {
      return 'ALL';
    }
  });

  const isSuperAdmin = useMemo(() => {
    if (!user) return false;
    return Boolean(
      user?.backendRole === 'SUPER_ADMIN' ||
      user?.role === 'SUPER_ADMIN' ||
      user?.is_superuser === true ||
      (user?.employeeCode?.toUpperCase() === 'ADMIN' && (!user?.branchId || user?.branchId === 'null' || user?.branchId === 'undefined'))
    );
  }, [user]);

  const primaryBranch = useMemo(() => {
    if (!branches || branches.length === 0) return null;
    return (
      branches.find((b) => (b.is_primary || b.isMainBranch) && (b.status === 'Active' || b.is_active !== false)) ||
      branches.find((b) => b.is_primary || b.isMainBranch) ||
      branches.find((b) => b.status === 'Active' || b.is_active !== false) ||
      branches[0]
    );
  }, [branches]);

  const setBranch = useCallback((nextBranchId) => {
    if (!isSuperAdmin && user?.branchId) {
      // Non-superadmin is locked to their assigned branch
      return;
    }
    const val = String(nextBranchId || 'ALL');
    setSelectedBranchState(val);
    try {
      localStorage.setItem('foodie_admin_selected_branch', val);
      sessionStorage.setItem('foodie_admin_selected_branch', val);
      if (val !== 'ALL') {
        localStorage.setItem('foodie_public_branch', val);
        sessionStorage.setItem('foodie_public_branch', val);
      }
    } catch (e) {}

    window.dispatchEvent(new CustomEvent('foodie_branch_selected', { detail: { branchId: val } }));
    window.dispatchEvent(new CustomEvent('foodie_tables_updated'));
    window.dispatchEvent(new CustomEvent('foodie_products_updated'));
    window.dispatchEvent(new CustomEvent('foodie_inventory_updated'));
    window.dispatchEvent(new CustomEvent('foodie_offers_updated'));
    window.dispatchEvent(new CustomEvent('foodie_orders_updated'));
  }, []);

  useEffect(() => {
    if (!isSuperAdmin && user?.branchId) {
      const userBranch = String(user.branchId);
      if (selectedBranch !== userBranch) {
        setSelectedBranchState(userBranch);
        try {
          localStorage.setItem('foodie_admin_selected_branch', userBranch);
          sessionStorage.setItem('foodie_admin_selected_branch', userBranch);
        } catch (e) {}
      }
    }
  }, [isSuperAdmin, user?.branchId, selectedBranch]);

  useEffect(() => {
    const handleSync = (e) => {
      if (!isSuperAdmin && user?.branchId) return;
      const nextId = e?.detail?.branchId;
      if (nextId !== undefined && nextId !== null && String(nextId) !== String(selectedBranch)) {
        setSelectedBranchState(String(nextId));
      }
    };
    const handleStorage = (e) => {
      if (!isSuperAdmin && user?.branchId) return;
      if (e.key === 'foodie_admin_selected_branch') {
        const val = e.newValue || 'ALL';
        setSelectedBranchState(val);
      }
    };
    window.addEventListener('foodie_branch_selected', handleSync);
    window.addEventListener('storage', handleStorage);
    return () => {
      window.removeEventListener('foodie_branch_selected', handleSync);
      window.removeEventListener('storage', handleStorage);
    };
  }, [selectedBranch, isSuperAdmin, user?.branchId]);

  // Validate selected branch against loaded branches to prevent stale branch references
  useEffect(() => {
    if (isSuperAdmin && !branchesLoading) {
      if (branches.length === 0) {
        if (selectedBranch !== 'ALL') {
          setSelectedBranchState('ALL');
          try {
            localStorage.setItem('foodie_admin_selected_branch', 'ALL');
            sessionStorage.setItem('foodie_admin_selected_branch', 'ALL');
          } catch (e) {}
        }
      } else if (selectedBranch !== 'ALL') {
        const branchExists = branches.some(b => String(b.id) === String(selectedBranch));
        if (!branchExists) {
          setSelectedBranchState('ALL');
          try {
            localStorage.setItem('foodie_admin_selected_branch', 'ALL');
            sessionStorage.setItem('foodie_admin_selected_branch', 'ALL');
          } catch (e) {}
        }
      }
    }
  }, [isSuperAdmin, branchesLoading, branches, selectedBranch]);

  // Determine working branch ID for given mode (aggregation vs operational)
  const getWorkingBranchId = useCallback((isAggregation = false) => {
    if (!isSuperAdmin && user?.branchId) {
      return String(user.branchId);
    }
    if (selectedBranch === 'ALL') {
      return 'ALL';
    }
    if (selectedBranch) {
      return String(selectedBranch);
    }
    return 'ALL';
  }, [isSuperAdmin, user?.branchId, selectedBranch]);

  // Determine human-readable working branch name
  const getWorkingBranchName = useCallback((isAggregation = false) => {
    if (!isSuperAdmin && user?.branchId) {
      const assignedObj = branches.find(b => String(b.id) === String(user?.branchId));
      return user?.branchName || assignedObj?.name || 'Assigned Branch';
    }
    if (selectedBranch === 'ALL') {
      return 'All Branches';
    }
    if (selectedBranch) {
      const match = branches.find(b => String(b.id) === String(selectedBranch));
      return match ? match.name : `Branch #${selectedBranch}`;
    }
    return primaryBranch?.name || 'All Branches';
  }, [isSuperAdmin, user?.branchName, user?.branchId, selectedBranch, branches, primaryBranch]);

  const workingBranchId = useMemo(() => {
    return getWorkingBranchId(true);
  }, [getWorkingBranchId]);

  const workingBranchName = useMemo(() => {
    return getWorkingBranchName(true);
  }, [getWorkingBranchName]);

  const value = useMemo(() => ({
    selectedBranch,
    setSelectedBranch: setBranch,
    branches,
    branchesLoading,
    primaryBranch,
    isSuperAdmin,
    workingBranchId,
    workingBranchName,
    getWorkingBranchId,
    getWorkingBranchName,
  }), [
    selectedBranch,
    setBranch,
    branches,
    branchesLoading,
    primaryBranch,
    isSuperAdmin,
    workingBranchId,
    workingBranchName,
    getWorkingBranchId,
    getWorkingBranchName,
  ]);

  return (
    <BranchContext.Provider value={value}>
      {children}
    </BranchContext.Provider>
  );
}

export function useBranch() {
  const context = useContext(BranchContext);
  if (!context) {
    throw new Error('useBranch must be used within a BranchProvider');
  }
  return context;
}

