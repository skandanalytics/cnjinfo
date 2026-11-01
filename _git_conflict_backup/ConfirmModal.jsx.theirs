import React from 'react';
import Modal from './Modal';
import Button from './Button';

export const ConfirmModal = ({
  isOpen,
  title = "Confirm Action",
  message,
  onConfirm,
  onClose,
  confirmText = "Yes, Confirm",
  cancelText = "Cancel",
  loading = false,
  size = "md"
}) => {
  const footerActions = (
    <div className="d-flex align-items-center justify-content-end gap-3 w-100 flex-wrap">
      <button
        type="button"
        onClick={onClose}
        disabled={loading}
        className="btn rounded-pill px-4 fw-bold text-nowrap d-inline-flex align-items-center justify-content-center"
        style={{
          height: '40px',
          minWidth: '100px',
          backgroundColor: '#FFFFFF',
          color: 'var(--primary-color, #C8102E)',
          border: '1.5px solid var(--primary-color, #C8102E)',
          fontSize: '13px',
          whiteSpace: 'nowrap'
        }}
      >
        {cancelText}
      </button>
      <button
        type="button"
        onClick={onConfirm}
        disabled={loading}
        className="btn btn-danger rounded-pill px-4 fw-bold shadow-sm text-nowrap d-inline-flex align-items-center justify-content-center"
        style={{
          height: '40px',
          minWidth: '130px',
          backgroundColor: 'var(--primary-color, #C8102E)',
          borderColor: 'var(--primary-color, #C8102E)',
          fontSize: '13px',
          whiteSpace: 'nowrap'
        }}
      >
        {loading ? 'Please wait...' : confirmText}
      </button>
    </div>
  );

  return (
    <Modal isOpen={isOpen} title={title} onClose={onClose} footerActions={footerActions} size={size}>
      <p className="text-secondary small mb-0" style={{ lineHeight: '1.6' }}>{message}</p>
    </Modal>
  );
};

export default ConfirmModal;
