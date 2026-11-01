order_type_modal_code = """import React, { useState } from 'react';
import Modal from '../common/Modal';
import { FiShoppingBag, FiCheckCircle } from 'react-icons/fi';
import { GiDiningChair } from 'react-icons/gi';

export const OrderTypeModal = ({ isOpen, onSelectType, dineInAvailable = true }) => {
  const [selected, setSelected] = useState('DINE_IN');

  if (!isOpen) return null;

  const handleConfirm = () => {
    onSelectType(selected);
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={() => {}}
      size="md"
    >
      <div className="p-3 text-center">
        {/* Circular Red Foodie Logo */}
        <div className="d-flex align-items-center justify-content-center gap-2 mb-2">
          <div 
            className="text-white d-flex align-items-center justify-content-center fw-bold shadow-xs"
            style={{ 
              width: '40px', 
              height: '40px', 
              borderRadius: '50%', 
              backgroundColor: '#F20D2D', 
              fontSize: '20px' 
            }}
          >
            F
          </div>
          <span className="fw-bold text-dark fs-4" style={{ letterSpacing: '-0.3px' }}>
            Foodie
          </span>
        </div>

        <h4 className="fw-bold text-dark mb-1" style={{ fontSize: '20px' }}>
          Choose Dining Option
        </h4>
        <p className="text-secondary small mb-4" style={{ fontSize: '13px', color: '#64748B' }}>
          How would you like to enjoy your food today?
        </p>

        {/* 1. Table Dine-in Card */}
        <div
          onClick={() => setSelected('DINE_IN')}
          className="p-3 rounded-4 mb-3 d-flex align-items-center justify-content-between text-start cursor-pointer transition-all shadow-xs"
          style={{
            cursor: 'pointer',
            border: `2px solid ${selected === 'DINE_IN' ? '#F20D2D' : '#E2E8F0'}`,
            backgroundColor: selected === 'DINE_IN' ? '#FFF5F5' : '#FFFFFF'
          }}
        >
          <div className="d-flex align-items-center gap-3">
            <div 
              className="rounded-3 d-flex align-items-center justify-content-center flex-shrink-0"
              style={{
                width: '48px',
                height: '48px',
                backgroundColor: selected === 'DINE_IN' ? '#FFE4E6' : '#F1F5F9',
                color: '#F20D2D'
              }}
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 18v3" /><path d="M20 18v3" /><path d="M2 14h20" /><path d="M4 14V8a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v6" />
                <path d="M6 14v4" /><path d="M18 14v4" />
              </svg>
            </div>
            <div>
              <div className="fw-bold text-dark fs-6">Table Dine-in</div>
              <div className="text-secondary small mt-0.5" style={{ fontSize: '12px', color: '#64748B' }}>
                Dine at our restaurant and enjoy the experience
              </div>
            </div>
          </div>

          {selected === 'DINE_IN' && (
            <div className="text-danger ps-2">
              <FiCheckCircle size={22} style={{ fill: '#F20D2D', color: '#FFFFFF' }} />
            </div>
          )}
        </div>

        {/* 2. Takeaway Card */}
        <div
          onClick={() => setSelected('TAKEAWAY')}
          className="p-3 rounded-4 mb-4 d-flex align-items-center justify-content-between text-start cursor-pointer transition-all shadow-xs"
          style={{
            cursor: 'pointer',
            border: `2px solid ${selected === 'TAKEAWAY' ? '#F20D2D' : '#E2E8F0'}`,
            backgroundColor: selected === 'TAKEAWAY' ? '#FFF5F5' : '#FFFFFF'
          }}
        >
          <div className="d-flex align-items-center gap-3">
            <div 
              className="rounded-3 d-flex align-items-center justify-content-center flex-shrink-0"
              style={{
                width: '48px',
                height: '48px',
                backgroundColor: selected === 'TAKEAWAY' ? '#FFE4E6' : '#F1F5F9',
                color: '#F20D2D'
              }}
            >
              <FiShoppingBag size={24} />
            </div>
            <div>
              <div className="fw-bold text-dark fs-6">Takeaway</div>
              <div className="text-secondary small mt-0.5" style={{ fontSize: '12px', color: '#64748B' }}>
                Pick up your order and enjoy it anywhere
              </div>
            </div>
          </div>

          {selected === 'TAKEAWAY' && (
            <div className="text-danger ps-2">
              <FiCheckCircle size={22} style={{ fill: '#F20D2D', color: '#FFFFFF' }} />
            </div>
          )}
        </div>

        {/* Continue Button */}
        <button
          type="button"
          onClick={handleConfirm}
          className="btn btn-danger w-100 rounded-pill py-2.5 fw-bold shadow-sm"
          style={{
            height: '46px',
            backgroundColor: '#F20D2D',
            borderColor: '#F20D2D',
            fontSize: '14.5px',
            boxShadow: '0 4px 12px rgba(242, 13, 45, 0.25)'
          }}
        >
          Continue
        </button>
      </div>
    </Modal>
  );
};

export default OrderTypeModal;
"""

with open('frontend/src/components/customer/OrderTypeModal.jsx', 'w', encoding='utf-8') as f:
    f.write(order_type_modal_code)

print("OrderTypeModal.jsx rewritten successfully!")
