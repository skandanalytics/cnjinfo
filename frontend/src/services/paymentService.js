import api from './api';

export const paymentService = {
  getPayments: async () => {
    const res = await api.get('/orders/payments/');
    return res.data?.data || (Array.isArray(res.data) ? res.data : (res.data?.results || []));
  },

  createPayment: async (data) => {
    const res = await api.post('/orders/payments/', data);
    return res.data?.data || res.data;
  }
};

export default paymentService;
