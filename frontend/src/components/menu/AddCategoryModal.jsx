import React, { useState } from 'react';
import Modal from '../common/Modal';
import Input from '../common/Input';
import Toggle from '../common/Toggle';
import Button from '../common/Button';
import { extractApiErrorMessage } from '../../utils/errorUtils';

export const AddCategoryModal = ({
  isOpen,
  onClose,
  onAdd,
  categories = [],
}) => {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [parentId, setParentId] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!name.trim()) {
      setErrorMsg('Please enter a category name.');
      return;
    }

    setErrorMsg('');
    setLoading(true);
    try {
      await onAdd({
        name: name.trim(),
        description: description.trim(),
        status: isActive ? 'Active' : 'Inactive',
        parent: parentId ? Number(parentId) : null,
      });
      setName('');
      setDescription('');
      setParentId('');
      setIsActive(true);
      onClose();
    } catch (err) {
      console.error('Error creating category:', err);
      const apiErr = extractApiErrorMessage(err, 'Failed to create category. Please check the entered data.');
                     
      if (apiErr && (apiErr.toLowerCase().includes('unique') || apiErr.toLowerCase().includes('already exists'))) {
        setErrorMsg('A category with this name already exists.');
      } else {
        setErrorMsg(apiErr);
      }
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
        Add Category
      </Button>
    </>
  );

  return (
    <Modal isOpen={isOpen} title="Create New Category" onClose={onClose} footerActions={footerActions}>
      <form onSubmit={handleSubmit}>
        {errorMsg && (
          <div className="alert alert-danger py-2 small mb-3">
            {errorMsg}
          </div>
        )}

        <Input 
          label="Category Name" 
          placeholder="e.g. Pasta, Chaat, Healthy Bowls, Pizza..." 
          value={name} 
          onChange={(e) => {
            setName(e.target.value);
            if (errorMsg) setErrorMsg('');
          }} 
          required 
        />
        
        <div className="mb-3">
          <label className="form-label small fw-bold text-secondary" htmlFor="parent-category">Parent category</label>
          <select
            id="parent-category"
            className="form-select rounded-3"
            value={parentId}
            onChange={(e) => setParentId(e.target.value)}
          >
            <option value="">None</option>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>{category.name}</option>
            ))}
          </select>
        </div>

        <Input 
          label="Description (Optional)" 
          placeholder="Brief description of this category" 
          value={description} 
          onChange={(e) => setDescription(e.target.value)} 
        />

        <Toggle 
          label="Set Category Active" 
          checked={isActive} 
          onChange={() => setIsActive(!isActive)} 
        />
      </form>
    </Modal>
  );
};

export default AddCategoryModal;
