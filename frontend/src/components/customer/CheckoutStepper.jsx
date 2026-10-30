import React from 'react';
import { FiCheck } from 'react-icons/fi';

export const CheckoutStepper = ({ currentStep = 1 }) => {
  const steps = [
    { number: 1, title: 'Cart' },
    { number: 2, title: 'Customer Details' },
    { number: 3, title: 'Payment' },
    { number: 4, title: 'Confirmation' }
  ];

  return (
    <div className="w-100 py-3 px-2 mb-4">
      <div className="d-flex align-items-center justify-content-between position-relative mx-auto" style={{ maxWidth: '640px' }}>
        {/* Background Connecting Line */}
        <div 
          className="position-absolute w-100" 
          style={{ 
            height: '2px', 
            backgroundColor: 'var(--border-color, #E2E8F0)', 
            top: '18px', 
            left: 0, 
            zIndex: 1 
          }} 
        />

        {/* Active Progress Line */}
        <div 
          className="position-absolute" 
          style={{ 
            height: '2px', 
            backgroundColor: 'var(--primary-color, #C8102E)', 
            top: '18px', 
            left: 0, 
            width: `${((Math.min(currentStep, steps.length) - 1) / (steps.length - 1)) * 100}%`,
            transition: 'width 0.4s ease',
            zIndex: 1 
          }} 
        />

        {/* Step Nodes */}
        {steps.map((s) => {
          const isDone = s.number < currentStep;
          const isCurrent = s.number === currentStep;

          return (
            <div 
              key={s.number} 
              className="d-flex flex-column align-items-center position-relative" 
              style={{ zIndex: 2 }}
            >
              <div 
                className={`rounded-circle d-flex align-items-center justify-content-center fw-bold transition-all shadow-xs ${
                  isDone || isCurrent ? 'text-white' : 'text-secondary'
                }`}
                style={{
                  width: '36px',
                  height: '36px',
                  fontSize: '13px',
                  backgroundColor: isDone || isCurrent ? 'var(--primary-color, #C8102E)' : '#FFFFFF',
                  border: isDone || isCurrent ? '2px solid var(--primary-color, #C8102E)' : '2px solid var(--border-color, #CBD5E1)',
                  boxShadow: isCurrent ? '0 0 0 4px rgba(200, 16, 46, 0.15)' : 'none'
                }}
              >
                {isDone ? <FiCheck size={16} strokeWidth={3} /> : s.number}
              </div>

              <span 
                className={`small mt-1.5 text-center transition-all ${
                  isCurrent ? 'fw-bold text-dark' : isDone ? 'fw-semibold text-secondary' : 'text-muted'
                }`}
                style={{ 
                  fontSize: '11.5px', 
                  whiteSpace: 'nowrap',
                  transform: isCurrent ? 'scale(1.02)' : 'none'
                }}
              >
                {s.title}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default CheckoutStepper;
