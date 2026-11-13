import api from './api';
import { explain, listBranches, removeBranch, saveBranch, isStaffScreen } from './adminApi';

export const branchService = {
  getBranches: async () => {
    if (typeof window !== 'undefined' && !isStaffScreen()) {
      try {
        const res = await api.get('/public/branches/');
        return Array.isArray(res.data) ? res.data : (res.data?.results || []);
      } catch (e) {
        return [];
      }
    }
    return listBranches();
  },

  getBranchById: async (id) => {
    const branches = await branchService.getBranches();
    return branches.find((b) => Number(b.id) === Number(id)) || null;
  },

  createBranch: async (branchData) => {
    try {
      const created = await saveBranch(branchData);
      window.dispatchEvent(new CustomEvent('foodie_branches_updated'));
      return created;
    } catch (err) {
      throw new Error(explain(err));
    }
  },

  updateBranch: async (id, branchData) => {
    try {
      const updated = await saveBranch(branchData, id);
      window.dispatchEvent(new CustomEvent('foodie_branches_updated'));
      return updated;
    } catch (err) {
      throw new Error(explain(err));
    }
  },

  deleteBranch: async (id) => {
    try {
      await removeBranch(id);
      window.dispatchEvent(new CustomEvent('foodie_branches_updated'));
      return true;
    } catch (err) {
      throw new Error(explain(err));
    }
  },
};

export default branchService;
