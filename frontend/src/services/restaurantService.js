import api from './api';

const _isValidId = (id) => {
  if (id === undefined || id === null) return false;
  const s = String(id).trim();
  return s !== '' && s !== 'undefined' && s !== 'null' && s !== 'NaN';
};

export const restaurantService = {
  getRestaurants: async () => {
    const { isStaffScreen, listBranches } = await import('./adminApi');
    if (isStaffScreen()) return listBranches();
    const res = await api.get('/branches/');
    return res.data;
  },

  getRestaurantById: async (id) => {
    if (!_isValidId(id)) return null;
    const res = await api.get(`/branches/${id}/`);
    return res.data;
  },

  createRestaurant: async (data) => {
    const res = await api.post('/branches/', data);
    return res.data;
  },

  updateRestaurant: async (id, data) => {
    if (!_isValidId(id)) return null;
    const res = await api.put(`/branches/${id}/`, data);
    return res.data;
  },

  deleteRestaurant: async (id) => {
    if (!_isValidId(id)) return true;
    const res = await api.delete(`/branches/${id}/`);
    return res.data;
  }
};

export default restaurantService;
