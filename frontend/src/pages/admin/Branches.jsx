import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import AdminLayout from '../../components/layout/AdminLayout';
import PageHeader from '../../components/layout/PageHeader';
import Button from '../../components/common/Button';
import Input from '../../components/common/Input';
import Modal from '../../components/common/Modal';
import Loader from '../../components/common/Loader';
import EmptyState from '../../components/common/EmptyState';
import SearchBar from '../../components/common/SearchBar';
import { 
  FiPlus, 
  FiEdit2, 
  FiTrash2, 
  FiMapPin, 
  FiPhone, 
  FiMail, 
  FiUser, 
  FiClock, 
  FiLayers, 
  FiAlertCircle, 
  FiStar,
  FiHome
} from 'react-icons/fi';
import { branchService } from '../../services/branchService';
import { useAuth } from '../../hooks/useAuth';

export const Branches = () => {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const [searchParams, setSearchParams] = useSearchParams();

  const [branches, setBranches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('All'); // 'All' | 'Active' | 'Inactive' | 'Under Renovation'

  // Modal states
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingBranch, setEditingBranch] = useState(null);
  const [createdSuccessBranch, setCreatedSuccessBranch] = useState(null);
  const [deletingBranch, setDeletingBranch] = useState(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteError, setDeleteError] = useState('');
  const [saveLoading, setSaveLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  // Form State
  const [formData, setFormData] = useState({
    name: '',
    code: '',
    city: 'Bangalore',
    address: '',
    phone: '',
    email: '',
    managerName: '',
    openingHours: '',
    tablesCount: 0,
    status: 'Active',
    isMainBranch: false,
    image: ''
  });

  const fetchBranches = async (showLoading = true) => {
    if (showLoading) setLoading(true);
    try {
      const data = await branchService.getBranches();
      setBranches(data || []);
    } catch (e) {
      console.error("Error fetching branches:", e);
    }
    if (showLoading) setLoading(false);
  };

  useEffect(() => {
    fetchBranches();

    const handleUpdate = () => {
      fetchBranches(false);
    };

    window.addEventListener('foodie_branches_updated', handleUpdate);
    return () => {
      window.removeEventListener('foodie_branches_updated', handleUpdate);
    };
  }, []);

  const handleOpenAdd = () => {
    setEditingBranch(null);
    setFormData({
      name: '',
      code: '',
      city: 'Bangalore',
      address: '',
      phone: '',
      email: '',
      managerName: '',
      openingHours: '',
      tablesCount: 0,
      status: 'Active',
      isMainBranch: branches.length === 0,
      image: ''
    });
    setErrorMessage('');
    setIsModalOpen(true);
  };

  useEffect(() => {
    if (searchParams.get('add') === '1' && isAdmin && !loading) {
      handleOpenAdd();
      const next = new URLSearchParams(searchParams);
      next.delete('add');
      setSearchParams(next, { replace: true });
    }
  }, [searchParams, isAdmin, loading]);

  const handleOpenEdit = (branch) => {
    setEditingBranch(branch);
    setFormData({
      name: branch.name || '',
      code: branch.code || '',
      city: branch.city || '',
      address: branch.address || '',
      phone: branch.phone || '',
      email: branch.email || '',
      managerName: branch.managerName || '',
      openingHours: branch.openingHours || '',
      tablesCount: (branch.tablesCount > 0 ? branch.tablesCount : (branch.liveTables ?? 0)),
      status: branch.status || 'Active',
      isMainBranch: Boolean(branch.isMainBranch),
      image: branch.image || ''
    });
    setErrorMessage('');
    setIsModalOpen(true);
  };

  const handleFormChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }));
  };

  const handleSubmit = async (e) => {
    if (e) e.preventDefault();
    if (!formData.name?.trim()) {
      setErrorMessage('Branch name is required.');
      return;
    }
    if (/\d/.test(formData.name)) {
      setErrorMessage('Branch name cannot contain numbers.');
      return;
    }
    if (!formData.address?.trim()) {
      setErrorMessage('Branch address is required.');
      return;
    }
    if (!formData.phone?.trim()) {
      setErrorMessage('Contact phone number is required.');
      return;
    }
    if (!formData.managerName?.trim()) {
      setErrorMessage('Branch manager name is required.');
      return;
    }
    if (formData.managerName && /\d/.test(formData.managerName)) {
      setErrorMessage('Branch manager name cannot contain numbers.');
      return;
    }
    if (!formData.openingHours?.trim()) {
      setErrorMessage('Opening hours are mandatory.');
      return;
    }
    const cleanHours = formData.openingHours.replace(/\s/g, '').replace(/-/g, '').toLowerCase();
    if (['00:00', '00:0000:00', '0:00', '00:00-00:00', '0:00-0:00'].includes(cleanHours)) {
      setErrorMessage('Please enter valid opening hours (e.g. 10:00 AM - 11:30 PM).');
      return;
    }
    if (!formData.image?.trim()) {
      setErrorMessage('Branch image is mandatory. Please provide a valid image URL.');
      return;
    }

    setSaveLoading(true);
    setErrorMessage('');

    try {
      if (editingBranch) {
        await branchService.updateBranch(editingBranch.id, formData);
      } else {
        const created = await branchService.createBranch(formData);
        if (created) {
          setCreatedSuccessBranch(created);
        }
      }
      await fetchBranches(false);
      setIsModalOpen(false);
      setEditingBranch(null);
    } catch (err) {
      setErrorMessage(err.message || 'Failed to save branch.');
    } finally {
      setSaveLoading(false);
    }
  };

  const openDelete = (branch) => {
    setDeletingBranch(branch);
    setDeleteError('');
  };

  const closeDelete = () => {
    if (deleteLoading) return;
    setDeletingBranch(null);
    setDeleteError('');
  };

  const handleDeleteConfirm = async () => {
    if (!deletingBranch || deleteLoading) return;
    setDeleteLoading(true);
    setDeleteError('');
    try {
      await branchService.deleteBranch(deletingBranch.id);
      setDeletingBranch(null);
      await fetchBranches(false);
    } catch (err) {
      setDeleteError(err.message || 'The branch could not be deleted.');
    } finally {
      setDeleteLoading(false);
    }
  };

  // Filtered branches
  const filteredBranches = branches.filter(branch => {
    const term = search.trim().toLowerCase();
    const matchesSearch = !term ||
      branch.name.toLowerCase().includes(term) ||
      branch.code.toLowerCase().includes(term) ||
      branch.city.toLowerCase().includes(term) ||
      (branch.managerName && branch.managerName.toLowerCase().includes(term)) ||
      (branch.email && branch.email.toLowerCase().includes(term)) ||
      (branch.phone && branch.phone.toLowerCase().includes(term)) ||
      (branch.address && branch.address.toLowerCase().includes(term));

    const matchesStatus = statusFilter === 'All' || branch.status === statusFilter;

    return matchesSearch && matchesStatus;
  });

  const getStatusBadge = (status) => {
    if (status === 'Under Renovation') {
      return (
        <span className="badge bg-warning text-dark fw-bold rounded-pill px-2.5 py-1 shadow-sm d-flex align-items-center gap-1" style={{ fontSize: '11px' }}>
          <span className="rounded-circle bg-dark d-inline-block" style={{ width: '6px', height: '6px' }}></span> Under Renovation
        </span>
      );
    }
    const isAct = status === 'Active';
    if (isAct) {
      return (
        <span className="badge bg-success text-white fw-bold rounded-pill px-2.5 py-1 shadow-sm d-flex align-items-center gap-1" style={{ fontSize: '11px' }}>
          <span className="rounded-circle bg-white d-inline-block" style={{ width: '6px', height: '6px' }}></span> Open
        </span>
      );
    }
    return (
      <span className="badge bg-danger text-white fw-bold rounded-pill px-2.5 py-1 shadow-sm d-flex align-items-center gap-1" style={{ fontSize: '11px' }}>
        <span className="rounded-circle bg-white d-inline-block" style={{ width: '6px', height: '6px' }}></span> Closed
      </span>
    );
  };

  const modalFooter = (
    <div className="d-flex align-items-center gap-3 w-100 pt-2">
      <button
        type="button"
        onClick={() => setIsModalOpen(false)}
        disabled={saveLoading}
        className="btn rounded-pill fw-bold flex-grow-1"
        style={{ 
          height: '44px', 
          backgroundColor: '#FFFFFF', 
          color: 'var(--primary-color, #C8102E)', 
          border: '1.5px solid var(--primary-color, #C8102E)',
          fontSize: '14px'
        }}
      >
        Cancel
      </button>
      <button
        type="button"
        onClick={handleSubmit}
        disabled={saveLoading}
        className="btn btn-danger rounded-pill fw-bold flex-grow-1 shadow-sm"
        style={{ 
          height: '44px', 
          backgroundColor: 'var(--primary-color, #C8102E)', 
          borderColor: 'var(--primary-color, #C8102E)',
          fontSize: '14px'
        }}
      >
        {saveLoading ? 'Saving...' : editingBranch ? 'Update Branch' : 'Create Branch'}
      </button>
    </div>
  );

  const renderBranchModal = () => (
    isModalOpen && (
      <Modal
        isOpen={isModalOpen}
        title={editingBranch ? `Edit Branch: ${editingBranch.name}` : "Add New Branch"}
        onClose={() => setIsModalOpen(false)}
        footerActions={modalFooter}
        size="md"
      >
        <form onSubmit={handleSubmit}>
          {errorMessage && (
            <div className="alert alert-danger py-2 small mb-3 d-flex align-items-center gap-2">
              <FiAlertCircle /> {errorMessage}
            </div>
          )}

          <div className="row g-3">
            {/* Row 1: Branch Name * | Branch Code / Restaurant * */}
            <div className="col-12 col-md-6">
              <label className="form-label text-dark fw-bold small mb-1" style={{ fontSize: '13px' }}>
                Branch Name <span className="text-danger">*</span>
              </label>
              <input 
                type="text"
                name="name"
                className="form-control rounded-3"
                style={{ height: '42px', border: '1.5px solid #CBD5E1', fontSize: '14px' }}
                placeholder="Tumakuru Main"
                value={formData.name}
                onChange={handleFormChange}
                required
              />
            </div>

            {editingBranch ? (
              <div className="col-12 col-md-6">
                <label className="form-label text-dark fw-bold small mb-1" style={{ fontSize: '13px' }}>
                  Branch Code (System Generated)
                </label>
                <input 
                  type="text"
                  className="form-control bg-light rounded-3"
                  value={formData.code}
                  disabled
                  readOnly
                  style={{ height: '42px', border: '1.5px solid #CBD5E1', fontSize: '14px' }}
                />
              </div>
            ) : (
              <div className="col-12 col-md-6">
                <label className="form-label text-dark fw-bold small mb-1" style={{ fontSize: '13px' }}>
                  Restaurant <span className="text-danger">*</span>
                </label>
                <select 
                  className="form-select rounded-3"
                  style={{ height: '42px', border: '1.5px solid #CBD5E1', fontSize: '14px' }}
                  value="Foodie Restaurant"
                  disabled
                >
                  <option value="Foodie Restaurant">Foodie Restaurant</option>
                </select>
              </div>
            )}

            {/* Row 2: Location * | Status * */}
            <div className="col-12 col-md-6">
              <label className="form-label text-dark fw-bold small mb-1" style={{ fontSize: '13px' }}>
                Location <span className="text-danger">*</span>
              </label>
              <input 
                type="text"
                name="city"
                className="form-control rounded-3"
                style={{ height: '42px', border: '1.5px solid #CBD5E1', fontSize: '14px' }}
                placeholder="Tumakuru, Karnataka"
                value={formData.city}
                onChange={handleFormChange}
                required
              />
            </div>

            <div className="col-12 col-md-6">
              <label className="form-label text-dark fw-bold small mb-1" style={{ fontSize: '13px' }}>
                Status <span className="text-danger">*</span>
              </label>
              <select 
                className="form-select rounded-3"
                style={{ height: '42px', border: '1.5px solid #CBD5E1', fontSize: '14px' }}
                name="status"
                value={formData.status}
                onChange={handleFormChange}
                required
              >
                <option value="Active">Open (Active)</option>
                <option value="Inactive">Closed (Inactive)</option>
                <option value="Under Renovation">Under Renovation</option>
              </select>
            </div>



            <div className="col-12">
              <label className="form-label text-secondary fw-semibold small">
                Full Address / Landmark <span className="text-danger">*</span>
              </label>
              <textarea 
                className="form-control rounded-3"
                rows={2}
                name="address"
                placeholder="e.g. Ground Floor, Cyber Towers, Hitech City, Hyderabad - 500081"
                value={formData.address}
                onChange={handleFormChange}
                required
              />
            </div>

            <div className="col-12 col-md-6">
              <Input 
                label="Contact Phone Number"
                name="phone"
                type="tel"
                inputMode="numeric"
                maxLength={10}
                placeholder="e.g. 9876543210"
                value={formData.phone}
                onKeyDown={(e) => {
                  if (['Backspace', 'Delete', 'ArrowLeft', 'ArrowRight', 'Tab', 'Enter'].includes(e.key) || e.ctrlKey || e.metaKey) {
                    return;
                  }
                  if (!/^[0-9]$/.test(e.key)) {
                    e.preventDefault();
                    return;
                  }
                  const start = e.target.selectionStart ?? 0;
                  const end = e.target.selectionEnd ?? 0;
                  if (start === end && String(formData.phone || '').length >= 10) {
                    e.preventDefault();
                  }
                }}
                onChange={(e) => {
                  const val = e.target.value.replace(/\D/g, '').slice(0, 10);
                  setFormData(prev => ({ ...prev, phone: val }));
                }}
                required
              />
            </div>

            <div className="col-12 col-md-6">
              <Input 
                label="Branch Email"
                name="email"
                type="email"
                placeholder="e.g. branch@foodierestaurant.com"
                value={formData.email}
                onChange={handleFormChange}
              />
            </div>

            <div className="col-12 col-md-6">
              <Input 
                label="Branch Manager Name"
                name="managerName"
                placeholder="e.g. Rajesh Sharma"
                value={formData.managerName}
                onChange={handleFormChange}
                required
              />
            </div>

            <div className="col-12 col-md-6">
              <Input 
                label="Opening Hours *"
                name="openingHours"
                placeholder="e.g. 10:00 AM - 11:30 PM"
                value={formData.openingHours}
                onChange={handleFormChange}
                required
              />
            </div>

            <div className="col-12">
              <Input 
                label="Cover Image URL *"
                name="image"
                placeholder="https://images.unsplash.com/photo-..."
                value={formData.image}
                onChange={handleFormChange}
                required
              />
              {!formData.image && (
                <div className="form-text text-danger small">Branch image upload or URL is mandatory.</div>
              )}
            </div>

            <div className="col-12">
              <div className="form-check form-switch mt-1">
                <input 
                  className="form-check-input"
                  type="checkbox" 
                  id="isMainBranchCheck"
                  name="isMainBranch"
                  checked={formData.isMainBranch}
                  onChange={handleFormChange}
                  disabled={Boolean(editingBranch?.isMainBranch)}
                />
                <label className="form-check-label small fw-semibold text-dark" htmlFor="isMainBranchCheck">
                  Set as Primary / Main Headquarters Branch
                </label>
              </div>
              {editingBranch?.isMainBranch && (
                <div className="form-text small">
                  This is the primary branch. To change it, mark another branch as primary.
                </div>
              )}
            </div>
          </div>
        </form>
      </Modal>
    )
  );

  if (loading && branches.length === 0) {
    return (
      <AdminLayout>
        <div className="py-5 text-center">
          <Loader />
        </div>
      </AdminLayout>
    );
  }

  if (!loading && branches.length === 0) {
    return (
      <AdminLayout>
        <PageHeader 
          title="Manage Branches" 
          showBackButton
          backUrl="/admin/dashboard"
          actions={
            isAdmin && (
              <Button onClick={handleOpenAdd} variant="primary" className="d-flex align-items-center gap-2">
                <FiPlus /> Add Branch
              </Button>
            )
          }
        />
        <EmptyState 
          icon={<FiHome size={48} className="text-secondary" />}
          title="No Branches Available"
          description="Create your first restaurant branch to get started."
          actionText="Add Branch"
          onAction={handleOpenAdd}
        />
        {renderBranchModal()}
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <PageHeader 
        title="Manage Branches" 
        showBackButton
        backUrl="/admin/dashboard"
        actions={
          <div className="d-flex align-items-center gap-2.5 flex-wrap">
            {branches.length > 0 && (
              <>
                <SearchBar 
                  placeholder="Search branch name, code, city..." 
                  value={search} 
                  onChange={setSearch}
                  records={branches.map((branch) => ({
                    id: branch.id,
                    label: branch.name,
                    title: branch.name,
                    subtitle: [branch.code, branch.status].filter(Boolean).join(' · '),
                    searchText: [branch.name, branch.code, branch.city, branch.status, branch.address].filter(Boolean).join(' '),
                  }))}
                  style={{ width: '320px', height: '38px' }}
                />

                <select 
                  className="form-select form-select-sm rounded-pill px-3 py-1.5 fw-semibold border-light-subtle shadow-xs bg-light text-dark"
                  style={{ width: 'auto', minWidth: '170px', height: '38px', fontSize: '13px' }}
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                >
                  <option value="All">All Statuses</option>
                  <option value="Active">Open (Active)</option>
                  <option value="Inactive">Closed (Inactive)</option>
                  <option value="Under Renovation">Under Renovation</option>
                </select>
              </>
            )}

            {isAdmin && (
              <Button 
                onClick={handleOpenAdd} 
                variant="primary" 
                className="d-flex align-items-center gap-2 py-2 px-3.5 shadow-sm rounded-pill fw-bold"
              >
                <FiPlus /> Add Branch
              </Button>
            )}
          </div>
        }
      />

      {loading ? (
        <div className="py-5 text-center">
          <Loader />
        </div>
      ) : filteredBranches.length === 0 ? (
        <EmptyState 
          icon={<FiHome size={48} className="text-secondary" />}
          title="No Branches Found"
          description="No restaurant branches match your search criteria."
        />
      ) : (
        <div className="row g-4">
          {filteredBranches.map((branch) => {
            const isInactive = branch.status !== 'Active';
            return (
              <div key={branch.id} className="col-12 col-md-6 col-xl-4">
                <div className={`card h-100 border-0 shadow-sm rounded-4 overflow-hidden foodie-card transition-all position-relative ${isInactive ? 'bg-light-subtle opacity-75' : 'bg-white'}`}>
                  {/* Branch Image Cover */}
                  <div className="position-relative" style={{ height: '160px' }}>
                    {branch.image ? (
                      <img 
                        src={branch.image} 
                        alt={branch.name}
                        className="w-100 h-100"
                        style={{ objectFit: 'cover', filter: isInactive ? 'grayscale(40%)' : 'none' }}
                        onError={(e) => {
                          e.currentTarget.style.display = 'none';
                        }}
                      />
                    ) : (
                      <div className="w-100 h-100 bg-secondary d-flex align-items-center justify-content-center text-white-50">
                        <FiHome size={40} />
                      </div>
                    )}
                    <div 
                      className="position-absolute top-0 start-0 w-100 h-100" 
                      style={{ background: 'linear-gradient(180deg, rgba(0,0,0,0.3) 0%, rgba(0,0,0,0.7) 100%)' }} 
                    />

                    {/* Main Branch Pill */}
                    {branch.isMainBranch && (
                      <div className="position-absolute top-0 start-0 m-3">
                        <span className="badge bg-warning text-dark fw-bold rounded-pill px-2.5 py-1 shadow-sm d-flex align-items-center gap-1" style={{ fontSize: '11px' }}>
                          <FiStar className="fill-current" /> Main HQ Branch
                        </span>
                      </div>
                    )}

                    {/* Status Badge */}
                    <div className="position-absolute top-0 end-0 m-3">
                      {getStatusBadge(branch.status)}
                    </div>

                    {/* Branch Name & Code Overlay */}
                    <div className="position-absolute bottom-0 start-0 p-3 text-white w-100">
                      <span className="badge bg-danger bg-opacity-75 rounded-pill px-2 py-0.5 mb-1" style={{ fontSize: '10px' }}>
                        {branch.code}
                      </span>
                      <h5 className="fw-bold text-white mb-0" style={{ wordBreak: 'break-word', fontSize: '1.05rem', lineHeight: '1.3' }} title={branch.name}>
                        {branch.name}
                      </h5>
                    </div>
                  </div>

                  {/* Branch Details Body */}
                  <div className="card-body p-3.5 d-flex flex-column gap-2">
                    <div className="d-flex align-items-start text-secondary small">
                      <FiMapPin className="text-danger mt-1 flex-shrink-0 me-2" size={15} />
                      <span className="text-dark fw-medium line-clamp-2" style={{ fontSize: '12.5px' }}>
                        {branch.address}
                      </span>
                    </div>

                    <div className="row g-2 pt-2 border-top border-light mt-1">
                      <div className="col-6">
                        <div className="d-flex align-items-center text-secondary small">
                          <FiUser className="text-primary flex-shrink-0 me-2" size={14} />
                          <span className="text-truncate fw-semibold" title={branch.managerName} style={{ fontSize: '12px' }}>
                            {branch.managerName || 'Manager: N/A'}
                          </span>
                        </div>
                      </div>
                      <div className="col-6">
                        <div className="d-flex align-items-center text-secondary small">
                          <FiLayers className="text-info flex-shrink-0 me-2" size={14} />
                          <span className="fw-semibold text-dark" style={{ fontSize: '12px' }}>
                            {(branch.tablesCount > 0 ? branch.tablesCount : (branch.liveTables ?? 0))} Tables
                          </span>
                        </div>
                      </div>
                      <div className="col-6">
                        <div className="d-flex align-items-center text-secondary small">
                          <FiClock className="text-warning flex-shrink-0 me-2" size={14} />
                          <span className="text-truncate" title={branch.openingHours} style={{ fontSize: '11.5px' }}>
                            {branch.openingHours || 'N/A'}
                          </span>
                        </div>
                      </div>
                      <div className="col-6">
                        <div className="d-flex align-items-center text-secondary small">
                          <FiPhone className="text-success flex-shrink-0 me-2" size={14} />
                          <span className="text-truncate" title={branch.phone} style={{ fontSize: '11.5px' }}>
                            {branch.phone || 'N/A'}
                          </span>
                        </div>
                      </div>
                      <div className="col-12">
                        <div className="d-flex align-items-center text-secondary small">
                          <FiMail className="text-primary flex-shrink-0 me-2" size={14} />
                          <a 
                            href={branch.email ? `mailto:${branch.email}` : undefined}
                            className="text-truncate text-secondary text-decoration-none fw-medium" 
                            title={branch.email} 
                            style={{ fontSize: '11.5px' }}
                          >
                            {branch.email || 'Email: N/A'}
                          </a>
                        </div>
                      </div>
                    </div>

                    {/* Actions Footer */}
                    {isAdmin && (
                      <div className="d-flex align-items-center justify-content-between pt-3 border-top border-light mt-auto">
                        <button
                          type="button"
                          onClick={() => handleOpenEdit(branch)}
                          className="btn btn-sm btn-outline-danger d-inline-flex align-items-center rounded-pill px-3 py-1.5 fw-bold shadow-xs transition-all gap-1.5"
                          style={{ fontSize: '12px', height: '32px' }}
                        >
                          <FiEdit2 size={13} /> Edit Branch
                        </button>

                        <button
                          type="button"
                          onClick={() => openDelete(branch)}
                          className="btn btn-sm btn-link text-danger p-0 text-decoration-none d-flex align-items-center"
                          style={{ fontSize: '12px' }}
                          title={`Delete branch ${branch.name}`}
                        >
                          <FiTrash2 size={13} className="me-1" /> Delete
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {renderBranchModal()}

      {/* Success Modal Showing Generated Branch Code */}
      {createdSuccessBranch && (
        <Modal
          isOpen={!!createdSuccessBranch}
          title=""
          onClose={() => setCreatedSuccessBranch(null)}
          size="md"
          footerActions={
            <Button variant="primary" onClick={() => setCreatedSuccessBranch(null)} className="rounded-pill px-4 fw-bold">
              Done
            </Button>
          }
        >
          <div className="p-2">
            {/* Top Green Banner */}
            <div 
              className="d-flex align-items-center gap-3 p-3 rounded-4 mb-4" 
              style={{ backgroundColor: '#ECFDF5', border: '1px solid #A7F3D0' }}
            >
              <div 
                className="rounded-circle d-flex align-items-center justify-content-center text-white flex-shrink-0 shadow-xs"
                style={{ width: '44px', height: '44px', backgroundColor: '#10B981' }}
              >
                <FiCheckCircle size={26} />
              </div>
              <div>
                <h6 className="fw-bold mb-0" style={{ color: '#065F46', fontSize: '16px' }}>
                  Branch Created Successfully!
                </h6>
                <p className="mb-0 small" style={{ color: '#047857', fontSize: '13px' }}>
                  The new branch has been added to your system.
                </p>
              </div>
            </div>

            {/* 2-Column Metrics Grid */}
            <div className="row g-3 px-2 py-2">
              <div className="col-6">
                <span className="text-secondary small d-block mb-1" style={{ fontSize: '13px', color: '#64748B' }}>
                  Branch Code
                </span>
                <span className="fw-bold text-dark d-block" style={{ fontSize: '24px', letterSpacing: '-0.5px' }}>
                  {createdSuccessBranch.code || 'BR-003'}
                </span>
              </div>
              <div className="col-6">
                <span className="text-secondary small d-block mb-1" style={{ fontSize: '13px', color: '#64748B' }}>
                  Branch Name
                </span>
                <span className="fw-bold text-dark d-block" style={{ fontSize: '18px' }}>
                  {createdSuccessBranch.name || 'Tumakuru Main'}
                </span>
              </div>
            </div>
          </div>
        </Modal>
      )}

      {/* Delete Confirmation Modal */}
      {deletingBranch && (
        <Modal
          isOpen={Boolean(deletingBranch)}
          title={`Delete Branch: ${deletingBranch.name}`}
          onClose={closeDelete}
          size="md"
          footerActions={
            <div className="d-flex justify-content-end gap-2">
              <Button variant="light" onClick={closeDelete} disabled={deleteLoading}>
                Cancel
              </Button>
              <Button variant="danger" onClick={handleDeleteConfirm} loading={deleteLoading}>
                Delete Branch
              </Button>
            </div>
          }
        >
          {deleteError && (
            <div className="alert alert-danger py-2 small mb-3 d-flex align-items-center gap-2">
              <FiAlertCircle /> {deleteError}
            </div>
          )}

          <p className="text-secondary small mb-3">
            Are you sure you want to delete <strong>{deletingBranch.name}</strong> ({deletingBranch.code})?
          </p>

          {deletingBranch.isMainBranch && (
            <div className="alert alert-warning py-2 small mb-3">
              <strong>Notice:</strong> This is currently marked as the Main HQ branch. Deleting it will permanently remove it. Another branch will not be automatically promoted as the main branch.
            </div>
          )}

          <div className="alert alert-danger bg-danger-subtle border-0 text-danger py-2 small mb-0">
            <strong>Warning:</strong> All tables, meal associations, and branch configuration tied to this branch will be permanently removed.
          </div>
        </Modal>
      )}
    </AdminLayout>
  );
};

export default Branches;
