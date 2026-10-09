import React, { useState, useEffect, useMemo } from 'react';
import AdminLayout from '../../components/layout/AdminLayout';
import PageHeader from '../../components/layout/PageHeader';
import Loader from '../../components/common/Loader';
import EmptyState from '../../components/common/EmptyState';
import api from '../../services/api';
import extractApiErrorMessage from '../../utils/errorUtils';
import { useAuth } from '../../hooks/useAuth';
import {
  CASHIER_BILL_OPTIONS,
  DEPARTMENT_OPTIONS,
  designationsFor,
  displayJobTitle,
  rolesForDepartment,
} from '../../utils/staffCatalog';
import {
  FiUsers,
  FiPlus,
  FiSearch,
  FiMail,
  FiPhone,
  FiEdit2,
  FiTrash2,
  FiEye,
  FiShield,
  FiCoffee,
  FiLayers,
  FiCreditCard
} from 'react-icons/fi';

export const Users = () => {
  const { user: currentUser } = useAuth();
  const [employees, setEmployees] = useState([]);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState('');
  const [createdName, setCreatedName] = useState('');
  const [pendingDelete, setPendingDelete] = useState(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedTab, setSelectedTab] = useState('all'); // 'all' | 'kitchen' | 'floor' | 'billing' | 'management'

  // Modals state
  const [viewingUser, setViewingUser] = useState(null);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Form State for Add / Edit
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    password: '',
    role: 'STAFF',
    designation: 'Steward',
    department: 'Dining Floor',
    billAccess: 'counter_payment,print_bill',
  });

  const resetForm = () => {
    setFormData({
      name: '',
      email: '',
      phone: '',
      password: '',
      role: 'STAFF',
      designation: 'Steward',
      department: 'Dining Floor',
      billAccess: 'counter_payment,print_bill',
    });
  };

  const handleOpenAddModal = () => {
    setEditingUser(null);
    resetForm();
    setIsAddModalOpen(true);
  };

  const fetchEmployees = async (isInitial = true) => {
    if (isInitial) setLoading(true);
    try {
      const { listEmployees } = await import('../../services/adminApi');
      setEmployees(await listEmployees());
    } catch (err) {
      console.error("Failed to fetch employees:", err);
      setEmployees([]);
    } finally {
      if (isInitial) setLoading(false);
    }
  };

  useEffect(() => {
    fetchEmployees(true);

    const handleSync = () => {
      fetchEmployees(false);
    };

    window.addEventListener('focus', handleSync);
    window.addEventListener('foodie_users_updated', handleSync);
    window.addEventListener('storage', handleSync);

    return () => {
      window.removeEventListener('focus', handleSync);
      window.removeEventListener('foodie_users_updated', handleSync);
      window.removeEventListener('storage', handleSync);
    };
  }, []);

  // Stats calculation
  const stats = useMemo(() => {
    const total = employees.length;
    const kitchenStaff = employees.filter(u => u.department === 'Kitchen' || (u.designation && u.designation.toLowerCase().includes('chef'))).length;
    const floorStaff = employees.filter(u => u.department === 'Dining Floor' || (u.designation && /steward|waiter/i.test(u.designation))).length;
    const billingStaff = employees.filter(u => u.department === 'Billing & POS' || (u.designation && u.designation.toLowerCase().includes('cashier'))).length;
    const managementStaff = employees.filter(u => u.department === 'Management' || u.role === 'admin' || (u.designation && u.designation.toLowerCase().includes('manager'))).length;

    return {
      total,
      kitchenStaff,
      floorStaff,
      billingStaff,
      managementStaff
    };
  }, [employees]);

  // Filtering
  const filteredEmployees = useMemo(() => {
    return employees.filter(u => {
      // Tab filter
      if (selectedTab === 'kitchen' && u.department !== 'Kitchen' && !u.designation?.toLowerCase().includes('chef')) return false;
      if (selectedTab === 'floor' && u.department !== 'Dining Floor' && !/steward|waiter/i.test(u.designation || '')) return false;
      if (selectedTab === 'billing' && u.department !== 'Billing & POS' && !u.designation?.toLowerCase().includes('cashier')) return false;
      if (selectedTab === 'management' && u.department !== 'Management' && u.role !== 'admin' && !u.designation?.toLowerCase().includes('manager')) return false;

      // Search query
      if (search.trim()) {
        const q = search.toLowerCase().trim();
        const matchName = u.name?.toLowerCase().includes(q);
        const matchEmail = u.email?.toLowerCase().includes(q);
        const matchPhone = u.phone?.toLowerCase().includes(q);
        const matchId = (u.employeeId || u.id)?.toLowerCase().includes(q);
        const matchRole = u.role?.toLowerCase().includes(q);
        const matchDesig = u.designation?.toLowerCase().includes(q);
        const matchDept = u.department?.toLowerCase().includes(q);
        if (!matchName && !matchEmail && !matchPhone && !matchId && !matchRole && !matchDesig && !matchDept) {
          return false;
        }
      }

      return true;
    });
  }, [employees, selectedTab, search]);

  // Handle Save (Add or Edit) Employee
  const handleSaveEmployee = async (e) => {
    e.preventDefault();
    if (isSubmitting) return;

    if (
      !formData.name?.trim() ||
      !formData.email?.trim() ||
      !formData.role?.trim() ||
      !formData.designation?.trim() ||
      !formData.department?.trim() ||
      (!editingUser && !formData.password?.trim())
    ) {
      alert('Please fill in all mandatory fields (including Password for new employee).');
      return;
    }

    const cleanPhone = String(formData.phone || '').replace(/\D/g, '').slice(0, 10);
    if (!cleanPhone || cleanPhone.length !== 10) {
      alert('Please enter a valid 10-digit phone number (cannot exceed or be less than 10 digits).');
      return;
    }
    if (formData.role === 'CASHIER' && !(formData.billAccess || '').split(',').filter(Boolean).length) {
      alert('Select at least one bill option for a cashier.');
      return;
    }

    setIsSubmitting(true);
    try {
      const { saveEmployee } = await import('../../services/adminApi');
      await saveEmployee({ ...formData, phone: cleanPhone }, editingUser);
      setEditingUser(null);
      setIsAddModalOpen(false);
      resetForm();
      await fetchEmployees(false);
      if (!editingUser) setCreatedName(formData.name.trim());
    } catch (err) {
      console.error("Failed to save employee:", err);
      alert(err.message || 'Failed to save employee.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle Edit Click
  const handleEditEmployee = (user) => {
    setEditingUser(user);
    setFormData({
      name: user.name || '',
      email: user.email || '',
      phone: user.phone || user.phone_number || '',
      password: '',
      role: user.backendRole || 'STAFF',
      designation: displayJobTitle(user.designation) || 'Steward',
      department: user.department || 'Dining Floor',
      billAccess: user.billAccess || '',
    });
  };

  const applyDepartment = (department) => {
    const roles = rolesForDepartment(department);
    const role = roles[0]?.value || '';
    const titles = designationsFor(department, role);
    setFormData((prev) => ({
      ...prev,
      department,
      role,
      designation: titles[0] || '',
      billAccess: role === 'CASHIER' ? (prev.billAccess || 'counter_payment,print_bill') : '',
    }));
  };

  const applyRole = (role) => {
    const titles = designationsFor(formData.department, role);
    setFormData((prev) => ({
      ...prev,
      role,
      designation: titles.includes(prev.designation) ? prev.designation : (titles[0] || ''),
      billAccess: role === 'CASHIER' ? (prev.billAccess || 'counter_payment,print_bill') : '',
    }));
  };

  const toggleBillDuty = (dutyId) => {
    const current = new Set((formData.billAccess || '').split(',').filter(Boolean));
    if (current.has(dutyId)) current.delete(dutyId);
    else current.add(dutyId);
    setFormData((prev) => ({ ...prev, billAccess: Array.from(current).join(',') }));
  };

  // Handle Delete
  const handleDeleteEmployee = async (userId) => {
    const targetUserId = typeof userId === 'object' ? userId?.id : userId;

    try {
      if (targetUserId) {
        const { deactivateEmployee } = await import('../../services/adminApi');
        await deactivateEmployee(targetUserId);
      }
    } catch (err) {
      console.error("Delete employee failed:", err);
      const msg = extractApiErrorMessage(err, 'Failed to delete employee from backend.');
      alert(msg);
    } finally {
      try {
        const local = JSON.parse(localStorage.getItem('foodie_custom_employees') || '[]');
        const filteredLocal = local.filter(u => u.id !== targetUserId && u.employeeId !== targetUserId);
        localStorage.setItem('foodie_custom_employees', JSON.stringify(filteredLocal));

        const overrides = JSON.parse(localStorage.getItem('foodie_employee_overrides') || '{}');
        delete overrides[String(targetUserId)];
        localStorage.setItem('foodie_employee_overrides', JSON.stringify(overrides));

        window.dispatchEvent(new CustomEvent('foodie_users_updated'));
        localStorage.setItem('foodie_users_sync_trigger', Date.now().toString());
      } catch (err) { }

      await fetchEmployees(false);
    }
  };



  return (
    <AdminLayout>
      <PageHeader
        title="Employee Directory & Staff"
        showBackButton
        actions={
          employees.length > 0 ? (
            <button
              className="btn btn-danger btn-sm rounded-pill px-3 py-2 fw-bold d-flex align-items-center gap-1.5 shadow-sm"
              onClick={handleOpenAddModal}
            >
              <FiPlus size={16} />
              <span>Add New Employee</span>
            </button>
          ) : null
        }
      />

      {loading ? (
        <Loader />
      ) : employees.length === 0 ? (
        /* Empty State when there are NO employees at all: Only shows the Add New Employee button */
        <div className="card border-0 shadow-sm rounded-4 p-5 bg-white text-center d-flex flex-column align-items-center justify-content-center my-4" style={{ minHeight: '420px' }}>
          <div className="bg-danger-subtle text-danger p-4 rounded-circle mb-3 d-inline-flex align-items-center justify-content-center" style={{ width: '84px', height: '84px' }}>
            <FiUsers size={38} />
          </div>
          <h4 className="fw-bold text-dark mb-2">No Employees Registered Yet</h4>
          <p className="text-secondary small mb-4" style={{ maxWidth: '440px' }}>
            Your staff directory is currently empty. Click the button below to add your first employee and manage departments and roles.
          </p>
          <button
            className="btn btn-danger rounded-pill px-4 py-2.5 fw-bold d-flex align-items-center gap-2 shadow-sm"
            onClick={handleOpenAddModal}
          >
            <FiPlus size={18} />
            <span>Add New Employee</span>
          </button>
        </div>
      ) : (
        /* When employees are present: Render Stat Cards, Tabs, Search Bar, and Table */
        <>
          {/* Overview Stat Cards */}
          <div className="row g-3 mb-4">
            <div className="col-12 col-sm-6 col-lg-3">
              <div className="card rounded-4 border-0 shadow-sm p-3 bg-white h-100">
                <div className="d-flex align-items-center justify-content-between">
                  <div>
                    <span className="small text-secondary fw-bold text-uppercase">Total Employees</span>
                    <h3 className="fw-bold text-dark mb-0 mt-1">{stats.total}</h3>
                  </div>
                  <div className="bg-primary-subtle text-primary p-3 rounded-circle">
                    <FiUsers size={22} />
                  </div>
                </div>
              </div>
            </div>

            <div className="col-12 col-sm-6 col-lg-3">
              <div className="card rounded-4 border-0 shadow-sm p-3 bg-white h-100">
                <div className="d-flex align-items-center justify-content-between">
                  <div>
                    <span className="small text-secondary fw-bold text-uppercase">Kitchen & Chefs</span>
                    <h3 className="fw-bold text-danger mb-0 mt-1">{stats.kitchenStaff}</h3>
                  </div>
                  <div className="bg-danger-subtle text-danger p-3 rounded-circle">
                    <FiCoffee size={22} />
                  </div>
                </div>
              </div>
            </div>

            <div className="col-12 col-sm-6 col-lg-3">
              <div className="card rounded-4 border-0 shadow-sm p-3 bg-white h-100">
                <div className="d-flex align-items-center justify-content-between">
                  <div>
                    <span className="small text-secondary fw-bold text-uppercase">Stewards & Floor</span>
                    <h3 className="fw-bold text-warning mb-0 mt-1">{stats.floorStaff}</h3>
                  </div>
                  <div className="bg-warning-subtle text-warning p-3 rounded-circle">
                    <FiLayers size={22} />
                  </div>
                </div>
              </div>
            </div>

            <div className="col-12 col-sm-6 col-lg-3">
              <div className="card rounded-4 border-0 shadow-sm p-3 bg-white h-100">
                <div className="d-flex align-items-center justify-content-between">
                  <div>
                    <span className="small text-secondary fw-bold text-uppercase">Cashiers & POS</span>
                    <h3 className="fw-bold text-info mb-0 mt-1">{stats.billingStaff}</h3>
                  </div>
                  <div className="bg-info-subtle text-info p-3 rounded-circle">
                    <FiCreditCard size={22} />
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="card border-0 shadow-sm rounded-4 p-3 bg-white mb-3">
            <label className="form-label small fw-bold text-secondary mb-1" htmlFor="employee-details">Employee details</label>
            <select
              id="employee-details"
              className="form-select rounded-3"
              value={selectedEmployeeId}
              onChange={(e) => {
                const id = e.target.value;
                setSelectedEmployeeId(id);
                const match = employees.find((row) => String(row.id) === id);
                setViewingUser(match || null);
              }}
            >
              <option value="">Select an employee</option>
              {employees.map((row) => (
                <option key={row.id} value={row.id}>
                  {row.name} · {row.employeeId} · {displayJobTitle(row.designation) || row.backendRole}
                </option>
              ))}
            </select>
          </div>

          {/* Filter Tabs & Search Bar */}
          <div className="card border-0 shadow-sm rounded-4 p-4 bg-white mb-4">
            <div className="d-flex flex-column flex-lg-row align-items-lg-center justify-content-between gap-3 mb-4 pb-3 border-bottom">
              {/* Tabs */}
              <div className="d-flex flex-wrap gap-2">
                {[
                  { key: 'all', label: `All Staff (${stats.total})` },
                  { key: 'kitchen', label: `Kitchen & Chefs (${stats.kitchenStaff})` },
                  { key: 'floor', label: `Floor Stewards (${stats.floorStaff})` },
                  { key: 'billing', label: `Cashiers & POS (${stats.billingStaff})` },
                  { key: 'management', label: `Management & Admin (${stats.managementStaff})` }
                ].map(tab => (
                  <button
                    key={tab.key}
                    onClick={() => setSelectedTab(tab.key)}
                    className={`btn btn-sm rounded-pill px-3 py-1.5 fw-bold transition-all ${selectedTab === tab.key
                      ? 'bg-danger text-white border-0 shadow-xs'
                      : 'bg-light text-secondary border border-light-subtle'
                      }`}
                    style={{ fontSize: '12px' }}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              {/* Search Bar */}
              <div className="position-relative" style={{ width: '260px' }}>
                <FiSearch className="position-absolute text-muted" style={{ left: '12px', top: '50%', transform: 'translateY(-50%)' }} />
                <input
                  type="text"
                  placeholder="Search staff, ID, role..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="form-control form-control-sm rounded-pill border-secondary-subtle ps-5 py-1.5"
                  style={{ fontSize: '12px' }}
                />
              </div>
            </div>

            {/* Staff / Employee Table */}
            {filteredEmployees.length === 0 ? (
              <EmptyState
                title="No Staff Members Found"
                description="Try adjusting your search query or selected department filter."
                icon="bi-people"
              />
            ) : (
              <div className="table-responsive">
                <table className="table table-hover align-middle mb-0">
                  <thead>
                    <tr className="text-secondary small border-bottom" style={{ fontSize: '11px', letterSpacing: '0.5px' }}>
                      <th className="py-3">STAFF MEMBER</th>
                      <th className="py-3">ROLE & DESIGNATION</th>
                      <th className="py-3">DEPARTMENT</th>
                      <th className="py-3">CONTACT INFO</th>
                      <th className="py-3 text-end">ACTIONS</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredEmployees.map((u) => {
                      const empId = u.employeeId || `EMP-${u.id}`;
                      const initials = u.name ? u.name.split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase() : 'E';

                      return (
                        <tr key={u.id} className="small">
                          <td className="py-3">
                            <div className="d-flex align-items-center gap-3">
                              <div
                                className="rounded-circle d-flex align-items-center justify-content-center fw-bold text-white shadow-xs"
                                style={{
                                  width: '38px',
                                  height: '38px',
                                  backgroundColor: u.role === 'admin' ? '#dc2626' : '#d97706',
                                  fontSize: '13px'
                                }}
                              >
                                {initials}
                              </div>
                              <div>
                                <div className="fw-bold text-dark fs-6 d-flex align-items-center gap-2">
                                  {u.name}
                                  <span className="badge bg-light text-muted border font-monospace px-1.5 py-0.5" style={{ fontSize: '10px' }}>
                                    {empId}
                                  </span>
                                </div>
                                <span className="text-muted small" style={{ fontSize: '11px' }}>
                                  Joined: {u.joinedDate || '2024'}
                                </span>
                              </div>
                            </div>
                          </td>

                          <td className="py-3">
                            <div className="d-flex align-items-center gap-2">
                              <span className="text-dark fw-bold fs-6">
                                {displayJobTitle(u.designation) || 'Staff Member'}
                              </span>
                              {u.role === 'admin' && (
                                <span className="badge bg-danger text-white rounded-pill px-2 py-0.5 fw-bold" style={{ fontSize: '10px' }}>
                                  <FiShield className="me-1" size={10} />Admin
                                </span>
                              )}
                            </div>
                          </td>

                          <td className="py-3">
                            <span className="badge bg-light text-dark border px-2.5 py-1.5 rounded-pill fw-semibold" style={{ fontSize: '11.5px' }}>
                              {u.department || 'General'}
                            </span>
                          </td>

                          <td className="py-3">
                            <div className="d-flex flex-column gap-1">
                              <div className="text-dark d-flex align-items-center gap-1.5" style={{ fontSize: '12px' }}>
                                <FiMail size={12} className="text-secondary" />
                                <span>{u.email}</span>
                              </div>
                              <div className="text-muted small d-flex align-items-center gap-1.5" style={{ fontSize: '11px' }}>
                                <FiPhone size={11} className="text-secondary" />
                                <span>{u.phone}</span>
                              </div>
                            </div>
                          </td>

                          <td className="py-3 text-end">
                            <div className="d-flex align-items-center justify-content-end gap-3">
                              <button
                                onClick={() => setViewingUser(u)}
                                className="btn btn-sm btn-light rounded-circle text-primary p-0 d-inline-flex align-items-center justify-content-center shadow-xs"
                                style={{ width: '34px', height: '34px', border: '1px solid #e2e8f0' }}
                                title="View Full Details"
                              >
                                <FiEye size={15} />
                              </button>

                              <button
                                onClick={() => handleEditEmployee(u)}
                                className="btn btn-sm btn-light rounded-circle text-dark p-0 d-inline-flex align-items-center justify-content-center shadow-xs"
                                style={{ width: '34px', height: '34px', border: '1px solid #e2e8f0' }}
                                title="Edit Staff Info"
                              >
                                <FiEdit2 size={14} />
                              </button>

                              {(u.role !== 'admin' || String(u.employeeId) !== String(currentUser?.employeeCode)) && (
                                <button
                                  onClick={() => setPendingDelete(u)}
                                  className="btn btn-sm btn-light rounded-circle text-danger p-0 d-inline-flex align-items-center justify-content-center shadow-xs"
                                  style={{ width: '34px', height: '34px', border: '1px solid #fee2e2', backgroundColor: '#fef2f2' }}
                                  title="Delete / Remove"
                                >
                                  <FiTrash2 size={14} />
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      {/* Modal 1: View Employee Dossier / Profile */}
      {viewingUser && (
        <div className="modal show d-block" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
          <div className="modal-dialog modal-dialog-centered">
            <div className="modal-content border-0 rounded-4 shadow-lg overflow-hidden">
              <div className="modal-header bg-danger text-white p-4 border-0">
                <div className="d-flex align-items-center gap-3">
                  <div className="bg-white text-danger fw-extrabold rounded-circle d-flex align-items-center justify-content-center shadow-sm" style={{ width: '48px', height: '48px', fontSize: '18px' }}>
                    {viewingUser.name ? viewingUser.name.split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase() : 'E'}
                  </div>
                  <div>
                    <h5 className="modal-title fw-bold mb-0">{viewingUser.name}</h5>
                    <span className="small opacity-75 font-monospace">{viewingUser.employeeId || `ID #${viewingUser.id}`}</span>
                  </div>
                </div>
                <button type="button" className="btn-close btn-close-white" onClick={() => setViewingUser(null)}></button>
              </div>

              <div className="modal-body p-4 bg-light">
                <div className="card rounded-3 border-0 shadow-xs p-3 bg-white mb-3">
                  <h6 className="fw-bold text-dark border-bottom pb-2 mb-3">Role & Department Info</h6>
                  <div className="row g-3 small">
                    <div className="col-6">
                      <span className="text-secondary d-block">Designation</span>
                      <strong className="text-dark fs-6">{displayJobTitle(viewingUser.designation) || 'Staff'}</strong>
                    </div>
                    <div className="col-6">
                      <span className="text-secondary d-block">Department</span>
                      <strong className="text-dark fs-6">{viewingUser.department || 'Operations'}</strong>
                    </div>
                    <div className="col-12">
                      <span className="text-secondary d-block">Access Level</span>
                      <div className="mt-1">
                        <span className={`badge rounded-pill px-2.5 py-1 fw-bold ${viewingUser.role === 'admin' ? 'bg-danger text-white' : 'bg-secondary text-white'}`}>
                          {viewingUser.role === 'admin' ? 'Administrator' : 'Employee / Staff'}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="card rounded-3 border-0 shadow-xs p-3 bg-white mb-3">
                  <h6 className="fw-bold text-dark border-bottom pb-2 mb-3">Contact Information</h6>
                  <div className="row g-3 small">
                    <div className="col-12">
                      <span className="text-secondary d-block">Email Address</span>
                      <strong className="text-dark">{viewingUser.email}</strong>
                    </div>
                    <div className="col-6">
                      <span className="text-secondary d-block">Phone Number</span>
                      <strong className="text-dark">{viewingUser.phone}</strong>
                    </div>
                    <div className="col-6">
                      <span className="text-secondary d-block">Joined Date</span>
                      <strong className="text-dark">{viewingUser.joinedDate || '—'}</strong>
                    </div>
                    <div className="col-6">
                      <span className="text-secondary d-block">Account status</span>
                      <strong className="text-dark">{viewingUser.status || 'ACTIVE'}</strong>
                    </div>
                  </div>
                </div>
              </div>

              <div className="modal-footer border-0 p-3 bg-white justify-content-end">
                <button type="button" className="btn btn-secondary btn-sm rounded-pill px-4" onClick={() => setViewingUser(null)}>
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal 2: Add or Edit Employee */}
      {(isAddModalOpen || editingUser) && (
        <div className="modal show d-block" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
          <div className="modal-dialog modal-dialog-centered modal-lg">
            <div className="modal-content border-0 rounded-4 shadow-lg overflow-hidden">
              <div className="modal-header bg-dark text-white p-4 border-0">
                <h5 className="modal-title fw-bold">
                  {editingUser ? `Edit Staff Member: ${editingUser.name}` : 'Add New Staff / Employee'}
                </h5>
                <button
                  type="button"
                  className="btn-close btn-close-white"
                  onClick={() => {
                    setIsAddModalOpen(false);
                    setEditingUser(null);
                  }}
                ></button>
              </div>

              <form onSubmit={handleSaveEmployee}>
                <div className="modal-body p-4">
                  <div className="row g-3">
                    <div className="col-12 col-md-6">
                      <label className="form-label small fw-bold text-secondary">Full Name *</label>
                      <input
                        type="text"
                        required
                        className="form-control rounded-3"
                        placeholder="e.g. Rahul Sharma"
                        value={formData.name}
                        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      />
                    </div>

                    <div className="col-12 col-md-6">
                      <label className="form-label small fw-bold text-secondary">Email Address *</label>
                      <input
                        type="email"
                        required
                        className="form-control rounded-3"
                        placeholder="e.g. rahul.staff@foodie.com"
                        value={formData.email}
                        onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                      />
                    </div>

                    {!editingUser && (
                      <div className="col-12 col-md-6">
                        <label className="form-label small fw-bold text-secondary">Password *</label>
                        <input
                          type="password"
                          required
                          minLength={4}
                          className="form-control rounded-3"
                          placeholder="Default is 123456"
                          value={formData.password || ''}
                          onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                        />
                      </div>
                    )}

                    <div className="col-12 col-md-6">
                      <label className="form-label small fw-bold text-secondary">Phone Number *</label>
                      <input
                        type="tel"
                        inputMode="numeric"
                        maxLength={10}
                        pattern="[0-9]{10}"
                        required
                        className="form-control rounded-3"
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
                          setFormData({ ...formData, phone: val });
                        }}
                      />
                    </div>

                    <div className="col-12 col-md-4">
                      <label className="form-label small fw-bold text-secondary">Department *</label>
                      <select
                        className="form-select rounded-3"
                        required
                        value={formData.department}
                        onChange={(e) => applyDepartment(e.target.value)}
                      >
                        {DEPARTMENT_OPTIONS.map((department) => (
                          <option key={department} value={department}>{department}</option>
                        ))}
                      </select>
                    </div>

                    <div className="col-12 col-md-4">
                      <label className="form-label small fw-bold text-secondary">Role Access *</label>
                      <select
                        className="form-select rounded-3"
                        required
                        value={formData.role}
                        onChange={(e) => applyRole(e.target.value)}
                      >
                        {rolesForDepartment(formData.department).map((role) => (
                          <option key={role.value} value={role.value}>{role.label}</option>
                        ))}
                      </select>
                    </div>

                    <div className="col-12 col-md-4">
                      <label className="form-label small fw-bold text-secondary">Designation *</label>
                      <select
                        className="form-select rounded-3"
                        required
                        value={formData.designation}
                        onChange={(e) => setFormData({ ...formData, designation: e.target.value })}
                      >
                        {(() => {
                          const titles = designationsFor(formData.department, formData.role);
                          const current = formData.designation;
                          const options = current && !titles.includes(current) ? [current, ...titles] : titles;
                          return options.map((title) => (
                            <option key={title} value={title}>{displayJobTitle(title)}</option>
                          ));
                        })()}
                      </select>
                    </div>

                    {formData.role === 'CASHIER' && (
                      <div className="col-12">
                        <span className="form-label small fw-bold text-secondary d-block">Bill options *</span>
                        <div className="d-flex flex-wrap gap-3">
                          {CASHIER_BILL_OPTIONS.map((option) => (
                            <label key={option.id} className="form-check d-flex align-items-center gap-2 mb-0">
                              <input
                                className="form-check-input"
                                type="checkbox"
                                checked={(formData.billAccess || '').split(',').includes(option.id)}
                                onChange={() => toggleBillDuty(option.id)}
                              />
                              <span className="small fw-semibold">{option.label}</span>
                            </label>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                <div className="modal-footer border-0 p-3 bg-light">
                  <button
                    type="button"
                    disabled={isSubmitting}
                    className="btn btn-secondary btn-sm rounded-pill px-4"
                    onClick={() => {
                      setIsAddModalOpen(false);
                      setEditingUser(null);
                      resetForm();
                    }}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="btn btn-danger btn-sm rounded-pill px-4 fw-bold d-flex align-items-center gap-1.5"
                  >
                    {isSubmitting ? (
                      <>
                        <span className="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span>
                        <span>Saving...</span>
                      </>
                    ) : (
                      editingUser ? 'Save Changes' : 'Add Employee'
                    )}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {createdName && (
        <div className="modal show d-block" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
          <div className="modal-dialog modal-dialog-centered">
            <div className="modal-content border-0 rounded-4 shadow">
              <div className="modal-body p-4 text-center">
                <h5 className="fw-bold text-dark">Employee created successfully.</h5>
                <p className="text-secondary mb-0">{createdName} has been added to the staff directory.</p>
              </div>
              <div className="modal-footer border-0 justify-content-center pb-4">
                <button type="button" className="btn btn-danger rounded-pill px-4 fw-bold" onClick={() => setCreatedName('')}>
                  OK
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {pendingDelete && (
        <div className="modal show d-block" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
          <div className="modal-dialog modal-dialog-centered">
            <div className="modal-content border-0 rounded-4 shadow">
              <div className="modal-body p-4">
                <h5 className="fw-bold text-dark">Remove {pendingDelete.name}?</h5>
                <p className="text-secondary mb-0">
                  This deactivates the account. Order history stays. You cannot remove your own account or the last administrator.
                </p>
              </div>
              <div className="modal-footer border-0">
                <button type="button" className="btn btn-light rounded-pill px-4" onClick={() => setPendingDelete(null)}>Cancel</button>
                <button
                  type="button"
                  className="btn btn-danger rounded-pill px-4 fw-bold"
                  onClick={() => {
                    const target = pendingDelete;
                    setPendingDelete(null);
                    handleDeleteEmployee(target.id);
                  }}
                >
                  Delete
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </AdminLayout>
  );
};
export default Users;
