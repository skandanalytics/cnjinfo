import React, { useState, useEffect, useMemo } from 'react';
import AdminLayout from '../../components/layout/AdminLayout';
import PageHeader from '../../components/layout/PageHeader';
import Loader from '../../components/common/Loader';
import EmptyState from '../../components/common/EmptyState';
import BranchRequiredState from '../../components/common/BranchRequiredState';
import SearchBar from '../../components/common/SearchBar';
import { useBranches } from '../../hooks/useBranches';
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
  FiMail,
  FiPhone,
  FiEdit2,
  FiTrash2,
  FiEye,
  FiEyeOff,
  FiShield,
  FiCoffee,
  FiLayers,
  FiCreditCard,
  FiCheckCircle
} from 'react-icons/fi';

export const Users = () => {
  const { user: currentUser } = useAuth();
  const { branches: loadedBranches, hasBranches } = useBranches();
  const [employees, setEmployees] = useState([]);
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
  const [formError, setFormError] = useState('');
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState('');
  const [branches, setBranches] = useState([]);
  const [selectedBranch, setSelectedBranch] = useState('ALL');
  const actorBranchId = currentUser?.branchId || null;

  const emptyForm = () => ({
    name: '',
    email: '',
    phone: '',
    password: '',
    role: 'STAFF',
    designation: 'Steward',
    department: 'Dining Floor',
    billAccess: 'counter_payment,print_bill',
    branch: actorBranchId ? String(actorBranchId) : String(branches.find((b) => b.isMainBranch)?.id || branches[0]?.id || ''),
    status: 'ACTIVE',
  });

  const [formData, setFormData] = useState(emptyForm);
  const [showPassword, setShowPassword] = useState(false);

  const resetForm = () => {
    setFormData(emptyForm());
    setFormError('');
    setShowPassword(false);
  };

  const handleOpenAddModal = () => {
    if (!hasBranches) return;
    setEditingUser(null);
    resetForm();
    setIsAddModalOpen(true);
  };

  const handleViewEmployee = async (row) => {
    setViewingUser(row);
    try {
      const { listEmployees } = await import('../../services/adminApi');
      const rows = await listEmployees();
      setEmployees(rows);
      const fresh = rows.find((item) => String(item.id) === String(row.id));
      if (fresh) setViewingUser(fresh);
    } catch {
      /* keep the row already shown */
    }
  };

  useEffect(() => {
    setBranches(loadedBranches || []);
  }, [loadedBranches]);

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

  // Branch-scoped employee list
  const branchEmployees = useMemo(() => {
    if (!selectedBranch || selectedBranch === 'ALL') return employees;
    return employees.filter(u => String(u.branch) === String(selectedBranch));
  }, [employees, selectedBranch]);

  // Stats calculation reflecting selected branch
  const stats = useMemo(() => {
    const total = branchEmployees.length;
    const kitchenStaff = branchEmployees.filter(u => u.department === 'Kitchen' || (u.designation && u.designation.toLowerCase().includes('chef'))).length;
    const floorStaff = branchEmployees.filter(u => u.department === 'Dining Floor' || (u.designation && /steward|waiter/i.test(u.designation))).length;
    const billingStaff = branchEmployees.filter(u => u.department === 'Billing & POS' || (u.designation && u.designation.toLowerCase().includes('cashier'))).length;
    const logisticsStaff = branchEmployees.filter(u => u.department === 'Logistics' || (u.designation && /delivery/i.test(u.designation))).length;
    const managementStaff = branchEmployees.filter(u => u.department === 'Management' || u.role === 'admin' || (u.designation && u.designation.toLowerCase().includes('manager'))).length;

    return {
      total,
      kitchenStaff,
      floorStaff,
      billingStaff,
      logisticsStaff,
      managementStaff
    };
  }, [branchEmployees]);

  // Filtering reflecting selected branch, tab, and search query
  const filteredEmployees = useMemo(() => {
    return branchEmployees.filter(u => {
      // Tab filter
      if (selectedTab === 'kitchen' && u.department !== 'Kitchen' && !u.designation?.toLowerCase().includes('chef')) return false;
      if (selectedTab === 'floor' && u.department !== 'Dining Floor' && !/steward|waiter/i.test(u.designation || '')) return false;
      if (selectedTab === 'billing' && u.department !== 'Billing & POS' && !u.designation?.toLowerCase().includes('cashier')) return false;
      if (selectedTab === 'logistics' && u.department !== 'Logistics' && !/delivery/i.test(u.designation || '')) return false;
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
  }, [branchEmployees, selectedTab, search]);

  // Handle Save (Add or Edit) Employee
  const handleSaveEmployee = async (e) => {
    e.preventDefault();
    if (isSubmitting) return;

    setFormError('');
    const isSuperAdminEdit = editingUser && (editingUser.role === 'SUPER_ADMIN' || formData.role === 'SUPER_ADMIN');
    if (
      !formData.name?.trim() ||
      !formData.role?.trim() ||
      (!isSuperAdminEdit && (!formData.designation?.trim() || !formData.department?.trim())) ||
      (!editingUser && !formData.password?.trim())
    ) {
      setFormError('Fill in all required fields (a password is required for a new employee).');
      return;
    }

    const cleanPhone = String(formData.phone || '').replace(/\D/g, '').slice(-10);
    if (!cleanPhone || cleanPhone.length !== 10) {
      setFormError('Enter a valid 10-digit phone number.');
      return;
    }
    if (formData.role === 'CASHIER' && !(formData.billAccess || '').split(',').filter(Boolean).length) {
      setFormError('Select at least one bill option for a cashier.');
      return;
    }
    if (!formData.branch && !['ADMIN', 'SUPER_ADMIN'].includes(formData.role)) {
      setFormError('Choose the branch this employee works at.');
      return;
    }

    setIsSubmitting(true);
    try {
      const { saveEmployee } = await import('../../services/adminApi');
      await saveEmployee({ ...formData, phone: cleanPhone }, editingUser);
      const wasEditing = Boolean(editingUser);
      const editedId = editingUser?.id;
      setEditingUser(null);
      setIsAddModalOpen(false);
      resetForm();
      await fetchEmployees(false);
      if (wasEditing && viewingUser && String(viewingUser.id) === String(editedId)) {
        const { listEmployees } = await import('../../services/adminApi');
        const rows = await listEmployees();
        setEmployees(rows);
        setViewingUser(rows.find((item) => String(item.id) === String(editedId)) || viewingUser);
      }
      if (!wasEditing) setCreatedName(formData.name.trim());
    } catch (err) {
      setFormError(err.message || 'The employee could not be saved.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const departmentForRole = (department, role) => {
    if (rolesForDepartment(department).some((r) => r.value === role)) return department;
    return DEPARTMENT_OPTIONS.find((d) => rolesForDepartment(d).some((r) => r.value === role)) || department || 'Management';
  };

  // Handle Edit Click
  const handleEditEmployee = (user) => {
    const role = user.backendRole || 'STAFF';
    setEditingUser(user);
    setFormError('');
    setFormData({
      name: user.name || '',
      email: user.email || '',
      phone: String(user.phone || user.phone_number || '').replace(/\D/g, '').slice(-10),
      password: '',
      role,
      designation: displayJobTitle(user.designation) || '',
      department: departmentForRole(user.department, role),
      billAccess: user.billAccess || '',
      branch: user.branch ? String(user.branch) : (['ADMIN', 'SUPER_ADMIN'].includes(role) ? 'ALL' : ''),
      status: user.status || 'ACTIVE',
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
  const handleDeleteEmployee = async () => {
    if (!pendingDelete || deleteBusy) return;
    setDeleteBusy(true);
    setDeleteError('');
    try {
      const { deleteEmployee } = await import('../../services/adminApi');
      await deleteEmployee(pendingDelete.id);
      setPendingDelete(null);
      await fetchEmployees(false);
    } catch (err) {
      setDeleteError(extractApiErrorMessage(err, err.message || 'The employee could not be deleted.'));
    } finally {
      setDeleteBusy(false);
    }
  };



  return (
    <AdminLayout>
      <PageHeader
        title="Employee Directory & Staff"
        showBackButton
        backUrl="/admin/dashboard"
        actions={
          employees.length > 0 && hasBranches ? (
            <div className="d-flex align-items-center gap-3 flex-wrap">
              <SearchBar
                placeholder="Search staff, ID, role..."
                value={search}
                onChange={setSearch}
                records={branchEmployees.map((person) => ({
                  id: person.id,
                  label: person.name,
                  title: person.name,
                  subtitle: [person.employeeId, person.designation || person.role].filter(Boolean).join(' · '),
                  searchText: [person.name, person.employeeId, person.role, person.designation, person.department, person.phone].filter(Boolean).join(' '),
                }))}
                onSelectSuggestion={(item) => {
                  const row = branchEmployees.find((person) => String(person.id) === String(item?.id));
                  if (row) handleViewEmployee(row);
                }}
                style={{ width: '280px', height: '38px' }}
              />

              {branches && branches.length > 0 && (
                <select
                  id="employee-branch-filter"
                  aria-label="Filter staff by branch"
                  className="form-select form-select-sm rounded-pill fw-semibold border-light-subtle shadow-xs bg-light text-dark"
                  style={{ width: 'auto', minWidth: '180px', height: '38px', paddingLeft: '16px', paddingRight: '28px', fontSize: '13px', cursor: 'pointer' }}
                  value={selectedBranch}
                  onChange={(e) => setSelectedBranch(e.target.value)}
                >
                  <option value="ALL">All Branches</option>
                  {branches.map((b) => (
                    <option key={b.id} value={String(b.id)}>
                      {b.name} {b.city ? `(${b.city})` : ''}
                    </option>
                  ))}
                </select>
              )}

              <button
                className="btn btn-danger btn-sm rounded-pill px-3.5 py-2 fw-bold d-flex align-items-center justify-content-center gap-2 shadow-sm text-nowrap"
                style={{ height: '38px', fontSize: '13px', backgroundColor: 'var(--primary-color, #C8102E)', borderColor: 'var(--primary-color, #C8102E)', color: '#FFFFFF' }}
                onClick={handleOpenAddModal}
              >
                <FiPlus size={16} />
                <span>Add Employee</span>
              </button>
            </div>
          ) : null
        }
      />

      {loading ? (
        <Loader />
      ) : !hasBranches ? (
        <BranchRequiredState />
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
        /* When employees are present: directory, filters, and records */
        <>
          {/* Filter Tabs & Search Bar */}
          <div 
            className="card border shadow-sm rounded-4 p-4 mb-4"
            style={{ backgroundColor: 'var(--surface-color)', borderColor: 'var(--border-color)' }}
          >
            <div className="d-flex flex-column flex-lg-row align-items-lg-center justify-content-between gap-3 mb-4 pb-3 border-bottom" style={{ borderColor: 'var(--border-subtle)' }}>
              {/* Tabs */}
              <div className="d-flex flex-wrap gap-2">
                {[
                  { key: 'all', label: `All Staff (${stats.total})`, count: stats.total },
                  { key: 'kitchen', label: `Kitchen & Chefs (${stats.kitchenStaff})`, count: stats.kitchenStaff },
                  { key: 'floor', label: `Floor Stewards (${stats.floorStaff})`, count: stats.floorStaff },
                  { key: 'billing', label: `Cashiers & POS (${stats.billingStaff})`, count: stats.billingStaff },
                  { key: 'logistics', label: `Logistics & Delivery (${stats.logisticsStaff})`, count: stats.logisticsStaff },
                  { key: 'management', label: `Management & Admin (${stats.managementStaff})`, count: stats.managementStaff }
                ].filter(tab => tab.key === 'all' || tab.count > 0).map(tab => (
                  <button
                    key={tab.key}
                    onClick={() => setSelectedTab(tab.key)}
                    className={`btn btn-sm rounded-pill px-3 py-1.5 fw-bold transition-all ${selectedTab === tab.key
                      ? 'text-white border-0 shadow-xs'
                      : 'bg-light text-secondary border border-light-subtle'
                      }`}
                    style={{ fontSize: '12px', backgroundColor: selectedTab === tab.key ? 'var(--primary-color, #F20D2D)' : undefined }}
                  >
                    {tab.label}
                  </button>
                ))}
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
                      const isInactive = u.status === 'INACTIVE' || u.status === 'SUSPENDED';

                      return (
                        <tr key={u.id} className={`small ${isInactive ? 'bg-light-subtle opacity-75' : ''}`}>
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
                            <div className="text-muted mt-1" style={{ fontSize: '11px' }}>
                              {u.branch_name || 'All branches'}
                              {u.status && u.status !== 'ACTIVE' ? ` · ${u.status.toLowerCase()}` : ''}
                            </div>
                          </td>

                          <td className="py-3">
                            <div className="d-flex flex-column gap-1.5">
                              <div className="text-dark d-flex align-items-center gap-2" style={{ fontSize: '12px' }}>
                                <FiMail size={13} className="text-secondary flex-shrink-0" />
                                <span className="text-truncate">{u.email}</span>
                              </div>
                              <div className="text-muted small d-flex align-items-center gap-2" style={{ fontSize: '11.5px' }}>
                                <FiPhone size={13} className="text-secondary flex-shrink-0" />
                                <span>{u.phone}</span>
                              </div>
                            </div>
                          </td>

                          <td className="py-3 text-end">
                            <div className="d-flex align-items-center justify-content-end gap-3">
                              <button
                                onClick={() => handleViewEmployee(u)}
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
                                  onClick={() => { setDeleteError(''); setPendingDelete(u); }}
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
                    <div className="col-6">
                      <span className="text-secondary d-block">Branch</span>
                      <strong className="text-dark">{viewingUser.branch_name || 'All branches'}</strong>
                    </div>
                    <div className="col-6">
                      <span className="text-secondary d-block">Employee code</span>
                      <strong className="text-dark">{viewingUser.employeeId || viewingUser.employee_code || '—'}</strong>
                    </div>
                  </div>
                </div>
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
                      <label className="form-label small fw-bold text-secondary">Email Address</label>
                      <input
                        type="email"
                        className="form-control rounded-3"
                        placeholder="e.g. rahul.staff@foodie.com"
                        value={formData.email}
                        onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                      />
                    </div>

                    {!editingUser && (
                      <div className="col-12 col-md-6">
                        <label className="form-label small fw-bold text-secondary">Password *</label>
                        <div className="position-relative d-flex align-items-center">
                          <input
                            type={showPassword ? 'text' : 'password'}
                            required
                            minLength={4}
                            className="form-control rounded-3 pe-5"
                            placeholder="Enter password"
                            value={formData.password || ''}
                            onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                          />
                          <button
                            type="button"
                            className="password-toggle-btn position-absolute end-0 top-50 text-secondary p-0 me-3 d-flex align-items-center justify-content-center"
                            style={{ border: 'none', background: 'transparent', cursor: 'pointer', zIndex: 5, width: '24px', height: '24px', transform: 'translateY(-50%)', margin: 0, padding: 0 }}
                            onClick={() => setShowPassword((prev) => !prev)}
                            aria-label={showPassword ? 'Hide password' : 'Show password'}
                            title={showPassword ? 'Hide password' : 'Show password'}
                          >
                            {showPassword ? <FiEyeOff size={18} /> : <FiEye size={18} />}
                          </button>
                        </div>
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

                    {!(editingUser && (editingUser.role === 'SUPER_ADMIN' || formData.role === 'SUPER_ADMIN')) && (
                      <>
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
                            {(() => {
                              const roles = rolesForDepartment(formData.department);
                              const options = roles.some((r) => r.value === formData.role)
                                ? roles
                                : [{ value: formData.role, label: formData.role === 'SUPER_ADMIN' ? 'Super Admin' : formData.role }, ...roles];
                              return options.map((role) => (
                                <option key={role.value} value={role.value}>{role.label}</option>
                              ));
                            })()}
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
                      </>
                    )}

                    <div className="col-12 col-md-6">
                      <label className="form-label small fw-bold text-secondary">Branch *</label>
                      <select
                        className="form-select rounded-3"
                        value={formData.branch}
                        disabled={Boolean(actorBranchId)}
                        onChange={(e) => setFormData({ ...formData, branch: e.target.value })}
                      >
                        <option value="">Choose a branch</option>
                        {['ADMIN', 'SUPER_ADMIN'].includes(formData.role) && !actorBranchId && (
                          <option value="ALL">All branches (owner-level administrator)</option>
                        )}
                        {branches.filter((b) => b.status === 'Active' || String(b.id) === String(formData.branch)).map((b) => (
                          <option key={b.id} value={b.id}>{b.name}{b.isMainBranch ? ' (primary)' : ''}</option>
                        ))}
                      </select>
                    </div>

                    <div className="col-12 col-md-6">
                      <label className="form-label small fw-bold text-secondary">Employment Status *</label>
                      <select
                        className="form-select rounded-3"
                        value={formData.status}
                        onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                      >
                        <option value="ACTIVE">Active</option>
                        <option value="INACTIVE">Inactive</option>
                        <option value="SUSPENDED">Suspended</option>
                      </select>
                    </div>

                    {editingUser && (
                      <div className="col-12 col-md-6">
                        <label className="form-label small fw-bold text-secondary">New Password</label>
                        <input
                          type="password"
                          className="form-control rounded-3"
                          placeholder="Leave blank to keep the current password"
                          value={formData.password || ''}
                          onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                        />
                      </div>
                    )}

                    {formError && (
                      <div className="col-12">
                        <div className="alert alert-danger py-2 small mb-0">{formError}</div>
                      </div>
                    )}

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

                <div className="modal-footer border-0 p-3" style={{ backgroundColor: 'var(--background-color)' }}>
                  <button
                    type="button"
                    disabled={isSubmitting}
                    className="btn rounded-pill px-4 fw-bold"
                    style={{
                      height: '38px',
                      backgroundColor: '#FFFFFF',
                      color: 'var(--primary-color, #F20D2D)',
                      border: '1.5px solid var(--primary-color, #F20D2D)',
                      fontSize: '13px'
                    }}
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
                    className="btn btn-danger rounded-pill px-4 fw-bold shadow-sm border-0 d-flex align-items-center gap-1.5"
                    style={{
                      height: '38px',
                      backgroundColor: 'var(--primary-color, #F20D2D)',
                      fontSize: '13px'
                    }}
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
        <div className="modal show d-block animate-fade-in" style={{ backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 1055 }}>
          <div className="modal-dialog modal-dialog-centered">
            <div className="modal-content border-0 rounded-4 shadow-lg p-3 text-center">
              <div className="modal-body p-4 text-center">
                <div 
                  className="rounded-circle d-inline-flex align-items-center justify-content-center mb-3 shadow-xs"
                  style={{ width: '64px', height: '64px', backgroundColor: '#e8f5e9', color: '#16a34a' }}
                >
                  <FiCheckCircle size={36} />
                </div>
                <h4 className="fw-bold text-dark mb-1">Employee Created Successfully!</h4>
                <p className="text-secondary small mb-4">{createdName} has been registered and added to your staff directory.</p>
                
                <div className="d-flex justify-content-center">
                  <button 
                    type="button" 
                    className="btn btn-danger rounded-pill px-5 py-2 fw-bold shadow-sm"
                    style={{ backgroundColor: 'var(--primary-color, #F20D2D)', borderColor: 'var(--primary-color, #F20D2D)' }}
                    onClick={() => setCreatedName('')}
                  >
                    Done
                  </button>
                </div>
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
                <h5 className="fw-bold text-dark">Delete {pendingDelete.name}?</h5>
                <p className="text-secondary mb-0">
                  The employee and their login are removed. Orders they took keep their name. You cannot delete your
                  own account, the last administrator, or someone with an equal or higher role.
                </p>
                {deleteError && <div className="alert alert-danger py-2 small mt-3 mb-0">{deleteError}</div>}
              </div>
              <div className="modal-footer border-0">
                <button type="button" className="btn btn-outline-danger rounded-pill px-4" disabled={deleteBusy} onClick={() => setPendingDelete(null)}>Cancel</button>
                <button
                  type="button"
                  className="btn btn-danger rounded-pill px-4 fw-bold"
                  disabled={deleteBusy}
                  onClick={handleDeleteEmployee}
                >
                  {deleteBusy ? 'Deleting...' : 'Delete'}
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
