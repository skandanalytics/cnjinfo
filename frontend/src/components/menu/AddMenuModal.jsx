import React, { useState } from 'react';
import Modal from '../common/Modal';
import Input from '../common/Input';
import Toggle from '../common/Toggle';
import Button from '../common/Button';

export const AddMenuModal = ({
  isOpen,
  onClose,
  onAdd
}) => {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    
    setLoading(true);
    await onAdd({
      name,
      description,
      status: isActive ? 'Active' : 'Inactive'
    });
    setLoading(false);
    
    setName('');
    setDescription('');
    setIsActive(true);
    onClose();
  };

  const footerActions = (
    <div className="d-flex align-items-center justify-content-end gap-2 w-100">
      <Button variant="outline" onClick={onClose} disabled={loading} className="rounded-pill px-4">
        Cancel
      </Button>
      <Button variant="primary" onClick={handleSubmit} loading={loading} className="rounded-pill px-4">
        Add Category
      </Button>
    </div>
  );

  return (
    <Modal isOpen={isOpen} title="Create New Category" onClose={onClose} footerActions={footerActions}>
      <form onSubmit={handleSubmit}>
        <Input 
          label="Category Name" 
          placeholder="e.g. Summer Seasonal Menu" 
          value={name} 
          onChange={(e) => setName(e.target.value)} 
          required 
        />
        
        <Input 
          label="Description" 
          placeholder="Brief description of the category items" 
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
export default AddMenuModal;
