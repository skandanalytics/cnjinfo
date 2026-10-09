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
    const res = await api.get('/restaurant/restaurants/');
    return res.data;
  },

  getRestaurantById: async (id) => {
    if (!_isValidId(id)) return null;
    const res = await api.get(`/restaurant/restaurants/${id}/`);
    return res.data;
  },

  createRestaurant: async (data) => {
    const res = await api.post('/restaurant/restaurants/', data);
    return res.data;
  },

  updateRestaurant: async (id, data) => {
    if (!_isValidId(id)) return null;
    const res = await api.put(`/restaurant/restaurants/${id}/`, data);
    return res.data;
  },

  deleteRestaurant: async (id) => {
    if (!_isValidId(id)) return true;
    const res = await api.delete(`/restaurant/restaurants/${id}/`);
    return res.data;
  }
};

export default restaurantService;
