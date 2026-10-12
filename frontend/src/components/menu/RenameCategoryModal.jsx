import React, { useState, useEffect } from 'react';
import Modal from '../common/Modal';
import Input from '../common/Input';
import Toggle from '../common/Toggle';
import Button from '../common/Button';

export const RenameCategoryModal = ({
  isOpen,
  currentCategoryName,
  currentCategoryDescription = '',
  currentCategoryActive = true,
  onClose,
  onSave
}) => {
  const [newCategoryName, setNewCategoryName] = useState('');
  const [newCategoryDescription, setNewCategoryDescription] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    if (isOpen) {
      setNewCategoryName(currentCategoryName && currentCategoryName !== 'All Categories' ? currentCategoryName : '');
      setNewCategoryDescription(currentCategoryDescription || '');
      setIsActive(currentCategoryActive !== false);
      setErrorMsg('');
    }
  }, [isOpen, currentCategoryName, currentCategoryDescription, currentCategoryActive]);

  const handleSubmit = async (e) => {
    if (e) e.preventDefault();
    if (loading) return;
    if (!newCategoryName.trim()) {
      setErrorMsg('Please enter a category name.');
      return;
    }
    setLoading(true);
    setErrorMsg('');
    try {
      await onSave(newCategoryName.trim(), newCategoryDescription.trim(), isActive ? 'Active' : 'Inactive');
      onClose();
    } catch (err) {
      setErrorMsg(err.message || 'The category could not be saved.');
    } finally {
      setLoading(false);
    }
  };

  const footerActions = (
    <>
      <Button variant="light" onClick={onClose} disabled={loading}>
        Cancel
      </Button>
      <Button variant="primary" onClick={handleSubmit} loading={loading}>
        Save Changes
      </Button>
    </>
  );

  return (
    <Modal
      isOpen={isOpen}
      title={`Edit Category ${currentCategoryName ? `"${currentCategoryName}"` : ''}`}
      onClose={onClose}
      footerActions={footerActions}
    >
      <form onSubmit={handleSubmit}>
        {errorMsg && <div className="alert alert-danger py-2 small mb-3">{errorMsg}</div>}

        <Input
          label="Category Name"
          placeholder="e.g. Indian Meals, North Indian, Starters"
          value={newCategoryName}
          onChange={(e) => setNewCategoryName(e.target.value)}
          required
        />

        <Input
          label="Category Description (Optional)"
          placeholder="e.g. Authentic aromatic Indian meals, thalis and curries"
          value={newCategoryDescription}
          onChange={(e) => setNewCategoryDescription(e.target.value)}
        />

        <Toggle
          label="Category Active"
          checked={isActive}
          onChange={() => setIsActive(!isActive)}
        />
      </form>
    </Modal>
  );
};

export default RenameCategoryModal;
