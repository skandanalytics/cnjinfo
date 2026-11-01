import React from 'react';
import Modal from './Modal';
import { FiCheck, FiAlertTriangle, FiAlertCircle } from 'react-icons/fi';

export const ConfirmModal = ({
  isOpen,
  title = "Confirm Action",
  message,
  onConfirm,
  onClose,
  confirmText = "Yes, Confirm",
  cancelText = "Cancel",
  loading = false,
  type = "danger", // 'danger' | 'warning' | 'success' | 'info'
  singleAction = false,
}) => {
  const isSuccess = type === 'success';
  const isWarning = type === 'warning';

  const getIcon = () => {
    if (isSuccess) {
      return (
        <div 
          className="rounded-circle d-inline-flex align-items-center justify-content-center mb-3 shadow-xs"
          style={{ width: '60px', height: '60px', backgroundColor: '#DCFCE7', color: '#16A34A', border: '2px solid #22C55E' }}
        >
          <FiCheck size={28} strokeWidth={3} />
        </div>
      );
    }
    if (isWarning) {
      return (
        <div 
          className="rounded-circle d-inline-flex align-items-center justify-content-center mb-3 shadow-xs"
          style={{ width: '60px', height: '60px', backgroundColor: '#FEF3C7', color: '#D97706', border: '2px solid #F59E0B' }}
        >
          <FiAlertTriangle size={28} />
        </div>
      );
    }
    return (
      <div 
        className="rounded-circle d-inline-flex align-items-center justify-content-center mb-3 shadow-xs"
        style={{ width: '60px', height: '60px', backgroundColor: '#FEE2E2', color: '#EF4444', border: '2px solid #EF4444' }}
      >
        <FiAlertCircle size={28} />
      </div>
    );
  };

  const footerActions = (
    <div className="d-flex align-items-center justify-content-center gap-2.5 w-100">
      {!singleAction && (
        <button
          type="button"
          onClick={onClose}
          disabled={loading}
          className="btn rounded-pill px-4 fw-bold flex-grow-1"
          style={{
            height: '42px',
            backgroundColor: '#FFFFFF',
            color: '#64748B',
            border: '1.5px solid #CBD5E1',
            fontSize: '13px'
          }}
        >
          {cancelText}
        </button>
      )}
      <button
        type="button"
        onClick={onConfirm || onClose}
        disabled={loading}
        className="btn btn-danger rounded-pill px-4 fw-bold shadow-xs border-0 flex-grow-1"
        style={{
          height: '42px',
          backgroundColor: '#F20D2D',
          fontSize: '13px'
        }}
      >
        {loading ? 'Please wait...' : confirmText}
      </button>
    </div>
  );

  return (
    <Modal isOpen={isOpen} title="" onClose={onClose} footerActions={footerActions} size="sm">
      <div className="text-center py-2 px-1">
        {getIcon()}
        <h5 className="fw-bold mb-2 text-dark">{title}</h5>
        <p className="text-secondary small mb-0 px-2">{message}</p>
      </div>
    </Modal>
  );
};
export default ConfirmModal;
