import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { staffJson, clearStaffSession } from '../../services/staffClient';
import { staffLogin } from '../../services/adminApi';
import { getApiUrl } from '../../config/apiConfig';

const PHRASE = 'DELETE ALL APPLICATION DATA';

async function publicJson(path, options = {}) {
  const res = await fetch(getApiUrl(`/db${path}`), {
    method: options.method || 'GET',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const error = new Error(data.detail || 'The request could not be completed.');
    error.status = res.status;
    throw error;
  }
  return data;
}

function readSession() {
  try {
    const token = sessionStorage.getItem('foodie_staff_access');
    const raw = sessionStorage.getItem('foodie_auth_admin');
    if (!token || !raw) return null;
    return JSON.parse(raw).user || null;
  } catch {
    return null;
  }
}

function cellText(value) {
  if (value == null || value === '') return '—';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  return String(value);
}

const Card = ({ title, children, danger = false }) => (
  <section className="card border-0 shadow-sm rounded-4 mb-4">
    <div className="card-body p-4">
      <h2 className={`h5 fw-bold mb-3 ${danger ? 'text-danger' : ''}`}>{title}</h2>
      {children}
    </div>
  </section>
);

export default function DatabaseConsole() {
  const navigate = useNavigate();
  const [status, setStatus] = useState(null);
  const [statusError, setStatusError] = useState('');
  const [session, setSession] = useState(readSession);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [overview, setOverview] = useState(null);
  const [viewer, setViewer] = useState(null);
  const [records, setRecords] = useState(null);
  const [search, setSearch] = useState('');
  const [ordering, setOrdering] = useState('-id');
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState([]);
  const [busy, setBusy] = useState(false);
  const [admins, setAdmins] = useState([]);
  const [resetToken, setResetToken] = useState('');
  const [resetting, setResetting] = useState(false);
  const [showCreateAdmin, setShowCreateAdmin] = useState(false);

  const loadStatus = useCallback(async () => {
    try {
      setStatus(await publicJson('/status/'));
      setStatusError('');
    } catch (err) {
      setStatusError(err.message || 'The setup status could not be loaded.');
    }
  }, []);

  const loadOverview = useCallback(async () => {
    const data = await staffJson('/db/overview/');
    setOverview(data);
    return data;
  }, []);

  useEffect(() => { loadStatus(); }, [loadStatus]);

  useEffect(() => {
    if (!status || !session || status.setup_required) return undefined;
    let active = true;
    loadOverview()
      .then(async (data) => {
        if (!active) return;
        if (data.access?.can_manage_administrators) {
          setAdmins(await staffJson('/db/administrators/'));
        }
      })
      .catch((err) => {
        if (!active) return;
        setError(err.message || 'Database access was refused.');
        if (err.status === 401 || err.status === 403) {
          clearStaffSession();
          setSession(null);
        }
      });
    return () => { active = false; };
  }, [session, status, loadOverview]);

  const openTable = async (key, nextPage = 1, nextSearch = search, nextOrder = ordering) => {
    setBusy(true);
    setError('');
    try {
      const query = new URLSearchParams({
        page: String(nextPage),
        page_size: '25',
        search: nextSearch,
        ordering: nextOrder,
      });
      const [appLabel, modelName] = key.split('.');
      const data = await staffJson(`/db/tables/${appLabel}/${modelName}/records/?${query}`);
      setViewer(key);
      setRecords(data);
      setPage(data.page);
      setSelected([]);
    } catch (err) {
      setError(err.message || 'The table could not be loaded.');
    } finally {
      setBusy(false);
    }
  };

  const refreshAll = async () => {
    const data = await loadOverview();
    if (viewer) await openTable(viewer, page, search, ordering);
    if (data.access?.can_manage_administrators) setAdmins(await staffJson('/db/administrators/'));
  };

  const onSetup = async (event) => {
    event.preventDefault();
    const form = new FormData(event.target);
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const body = Object.fromEntries(form.entries());
      await publicJson('/setup/', { method: 'POST', body });
      try {
        await staffLogin(body.employee_code, body.password);
        navigate('/admin/dashboard', { replace: true });
        return;
      } catch (err) {
        setNotice('The first administrator was created. Sign in with that username.');
        setError(err.message || 'Sign-in failed.');
      }
      await loadStatus();
    } catch (err) {
      setError(err.message || 'The administrator could not be created.');
    } finally {
      setBusy(false);
    }
  };

  const onLogin = async (event) => {
    event.preventDefault();
    const form = new FormData(event.target);
    setBusy(true);
    setError('');
    try {
      const logged = await staffLogin(form.get('employee_code'), form.get('password'));
      if (!['SUPER_ADMIN', 'ADMIN'].includes(logged.user.backendRole)) {
        clearStaffSession();
        setError('This page is limited to administrators.');
        return;
      }
      setSession(logged.user);
    } catch (err) {
      setError(err.message || 'Sign-in failed.');
    } finally {
      setBusy(false);
    }
  };

  const onCreateAdmin = async (event) => {
    event.preventDefault();
    if (busy) return;
    const form = new FormData(event.target);
    const code = String(form.get('employee_code') || '').trim();
    const name = String(form.get('name') || '').trim();
    const phone = String(form.get('phone') || '').trim();
    const password = String(form.get('password') || '');
    const confirmPassword = String(form.get('confirm_password') || '');

    if (!code) {
      setError('Admin ID is required.');
      return;
    }
    if (!name) {
      setError('Full name is required.');
      return;
    }
    if (!phone) {
      setError('Phone number is required.');
      return;
    }
    if (password !== confirmPassword) {
      setError('Password and confirmation do not match.');
      return;
    }
    if (password.length < 8) {
      setError('Passwords must be at least 8 characters long.');
      return;
    }
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const body = Object.fromEntries(form.entries());
      const created = session
        ? await staffJson('/db/create-admin/', { method: 'POST', body: JSON.stringify(body) })
        : await publicJson('/create-admin/', { method: 'POST', body });
      setShowCreateAdmin(false);
      const roleLabel = created.role === 'SUPER_ADMIN' ? 'Owner' : 'Manager';
      const successMsg = `Administrator ${created.employee_code} (${created.name}) created successfully as ${roleLabel}. You can now sign in with this Admin ID.`;
      setNotice(successMsg);
      await loadStatus();
      setTimeout(() => {
        navigate('/login', { replace: true, state: { successMessage: successMsg, employee_code: created.employee_code } });
      }, 1500);
    } catch (err) {
      setError(err.message || 'The administrator could not be created.');
    } finally {
      setBusy(false);
    }
  };

  const deleteSelected = async () => {
    if (!viewer || selected.length === 0) return;
    const confirmed = window.confirm(`Delete ${selected.length} selected record${selected.length === 1 ? '' : 's'} from ${records?.db_table}? This cannot be undone.`);
    if (!confirmed) return;
    setBusy(true);
    setError('');
    try {
      const [appLabel, modelName] = viewer.split('.');
      const result = await staffJson(`/db/tables/${appLabel}/${modelName}/delete/`, {
        method: 'POST',
        body: JSON.stringify({ ids: selected }),
      });
      const blocked = (result.blocked || []).map((row) => `#${row.id}: ${row.detail}`).join(' ');
      setNotice(`Deleted ${result.deleted.length} record${result.deleted.length === 1 ? '' : 's'}. ${blocked}`.trim());
      await refreshAll();
    } catch (err) {
      setError(err.message || 'The records could not be deleted.');
    } finally {
      setBusy(false);
    }
  };

  const authorizeReset = async (event) => {
    event.preventDefault();
    const form = new FormData(event.target);
    if (form.get('confirmation') !== PHRASE) {
      setError(`Type ${PHRASE} exactly.`);
      return;
    }
    setBusy(true);
    setError('');
    try {
      const data = await staffJson('/db/reset/authorize/', {
        method: 'POST',
        body: JSON.stringify({ password: form.get('password') }),
      });
      setResetToken(data.reset_token);
      setNotice('Reset authorization is ready. Confirm the deletion to continue. The authorization expires in a few minutes.');
    } catch (err) {
      setError(err.message || 'Reset authorization failed.');
    } finally {
      setBusy(false);
    }
  };

  const runReset = async (event) => {
    event.preventDefault();
    const form = new FormData(event.target);
    if (form.get('confirmation') !== PHRASE) {
      setNotice('');
      setError(`Type ${PHRASE} exactly.`);
      return;
    }
    if (!window.confirm('This permanently deletes all application data, including administrator accounts. Continue?')) return;
    setResetting(true);
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const result = await staffJson('/db/reset/', {
        method: 'POST',
        body: JSON.stringify({
          confirmation: form.get('confirmation'),
          password: form.get('password'),
          reset_token: resetToken,
        }),
      });
      if (!result?.reset) {
        throw new Error('The reset did not complete.');
      }
      clearStaffSession();
      setSession(null);
      setOverview(null);
      setViewer(null);
      setRecords(null);
      setResetToken('');
      setStatus({
        setup_required: Boolean(result.setup_required),
        setup_enabled: Boolean(result.setup_enabled),
      });
      setNotice(result.setup_required
        ? 'Application data was deleted. Create the first administrator to continue.'
        : 'Application data was deleted.');
      await loadStatus();
    } catch (err) {
      setNotice('');
      setResetToken('');
      setError(err.message || 'The reset could not be completed.');
    } finally {
      setResetting(false);
      setBusy(false);
    }
  };

  const saveAdmin = async (event) => {
    event.preventDefault();
    if (busy) return;
    const form = new FormData(event.target);
    const code = String(form.get('employee_code') || '').trim();
    const name = String(form.get('name') || '').trim();
    const phone = String(form.get('phone') || '').trim();
    const password = String(form.get('password') || '');
    const confirmPassword = String(form.get('confirm_password') || '');

    if (!code) {
      setError('Admin ID is required.');
      return;
    }
    if (!name) {
      setError('Full name is required.');
      return;
    }
    if (!phone) {
      setError('Phone number is required.');
      return;
    }
    if (password !== confirmPassword) {
      setError('Password and confirmation do not match.');
      return;
    }
    if (password.length < 8) {
      setError('Passwords must be at least 8 characters long.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const body = Object.fromEntries(form.entries());
      const created = await staffJson('/db/administrators/', { method: 'POST', body: JSON.stringify(body) });
      event.target.reset();
      setAdmins(await staffJson('/db/administrators/'));
      setNotice(`Administrator ${created.employee_code} (${created.name}) created successfully as ${created.role === 'SUPER_ADMIN' ? 'Owner' : 'Manager'}.`);
    } catch (err) {
      setError(err.message || 'The administrator could not be created.');
    } finally {
      setBusy(false);
    }
  };

  const changeAdmin = async (row, patch) => {
    setBusy(true);
    setError('');
    try {
      await staffJson(`/db/administrators/${row.id}/`, { method: 'PATCH', body: JSON.stringify(patch) });
      setAdmins(await staffJson('/db/administrators/'));
      setNotice('Administrator updated.');
    } catch (err) {
      setError(err.message || 'The administrator could not be updated.');
    } finally {
      setBusy(false);
    }
  };

  const changePassword = async (event, id) => {
    event.preventDefault();
    const form = new FormData(event.target);
    setBusy(true);
    setError('');
    try {
      await staffJson(`/db/administrators/${id}/password/`, {
        method: 'POST',
        body: JSON.stringify(Object.fromEntries(form.entries())),
      });
      event.target.reset();
      setNotice('Password updated.');
    } catch (err) {
      setError(err.message || 'The password could not be changed.');
    } finally {
      setBusy(false);
    }
  };

  const signOut = () => {
    clearStaffSession();
    setSession(null);
    setOverview(null);
    setViewer(null);
    setRecords(null);
  };

  return (
    <main className="container py-4" style={{ maxWidth: 1100 }}>
      <div className="d-flex justify-content-between align-items-start gap-3 mb-4">
        <div>
          <div className="fw-bold text-danger" style={{ letterSpacing: '0.18em' }}>FOODIE</div>
          <h1 className="h3 fw-bold mb-1">{status?.setup_required ? 'Create First Admin' : 'Database management'}</h1>
          <p className="text-secondary mb-0">Initialize the first administrator and manage application records through the API.</p>
        </div>
        {session && <button type="button" className="btn btn-outline-danger" onClick={signOut}>Sign out</button>}
      </div>
      {notice && (
        <div className="alert alert-success d-flex justify-content-between align-items-center">
          <span>{notice}</span>
          <button
            type="button"
            className="btn btn-sm btn-outline-success ms-3"
            onClick={() => navigate('/login')}
          >
            Go to Admin Login
          </button>
        </div>
      )}
      {error && <div className="alert alert-danger">{error}</div>}
      {statusError && <div className="alert alert-danger">{statusError}</div>}
      {!status && !statusError && <p className="text-secondary">Checking setup status…</p>}

      {status?.setup_required && (
        <Card title="Create First Admin">
          <form onSubmit={onSetup} className="row g-3">
            {status.setup_key_required && (
              <div className="col-md-6"><label className="form-label">Server setup key</label><input className="form-control" name="setup_key" type="password" required autoComplete="off" /></div>
            )}
            <div className="col-md-6"><label className="form-label">Username</label><input className="form-control" name="employee_code" required autoComplete="off" /></div>
            <div className="col-md-6"><label className="form-label">Full name</label><input className="form-control" name="name" required /></div>
            <div className="col-md-6"><label className="form-label">Phone</label><input className="form-control" name="phone" required /></div>
            <div className="col-md-6"><label className="form-label">Email</label><input className="form-control" name="email" type="email" /></div>
            <div className="col-md-6"><label className="form-label">Password</label><input className="form-control" name="password" type="password" required autoComplete="new-password" /></div>
            <div className="col-md-6"><label className="form-label">Confirm password</label><input className="form-control" name="confirm_password" type="password" required autoComplete="new-password" /></div>
            <div className="col-12"><button className="btn btn-danger" disabled={busy}>{busy ? 'Creating administrator…' : 'Create Admin'}</button></div>
          </form>
        </Card>
      )}

      {status && !status.setup_required && !session && (
        showCreateAdmin ? (
          <Card title="Create New Administrator">
            <p className="text-secondary small">
              Create an administrator account (Owner or Manager). Existing administrator accounts remain completely intact.
            </p>
            <form onSubmit={onCreateAdmin} className="row g-3">
              <div className="col-md-6">
                <label className="form-label">New Admin ID</label>
                <input className="form-control" name="employee_code" placeholder="e.g. MGR02 or OWNER02" required autoComplete="off" />
              </div>
              <div className="col-md-6">
                <label className="form-label">Designation / Role</label>
                <select className="form-select" name="role" defaultValue="ADMIN">
                  <option value="ADMIN">Manager</option>
                  <option value="SUPER_ADMIN">Owner</option>
                </select>
              </div>
              <div className="col-md-6">
                <label className="form-label">Full Name</label>
                <input className="form-control" name="name" placeholder="Full name" required />
              </div>
              <div className="col-md-6">
                <label className="form-label">Phone</label>
                <input className="form-control" name="phone" placeholder="Mobile number" required />
              </div>
              <div className="col-12">
                <label className="form-label">Email (optional)</label>
                <input className="form-control" name="email" type="email" placeholder="Email address (optional)" />
              </div>
              <div className="col-md-6">
                <label className="form-label">Password</label>
                <input className="form-control" name="password" type="password" required autoComplete="new-password" />
              </div>
              <div className="col-md-6">
                <label className="form-label">Confirm Password</label>
                <input className="form-control" name="confirm_password" type="password" required autoComplete="new-password" />
              </div>
              <div className="col-12 d-grid d-sm-flex gap-2">
                <button className="btn btn-danger" disabled={busy} type="submit">
                  {busy ? 'Creating administrator…' : 'Create New Admin'}
                </button>
                <button
                  type="button"
                  className="btn btn-outline-secondary"
                  disabled={busy}
                  onClick={() => { setShowCreateAdmin(false); setError(''); }}
                >
                  Back to Sign In
                </button>
              </div>
            </form>
          </Card>
        ) : (
          <Card title="Administrator sign in">
            <form onSubmit={onLogin} className="row g-3">
              <div className="col-md-6"><label className="form-label">Admin ID</label><input className="form-control" name="employee_code" required autoComplete="username" /></div>
              <div className="col-md-6"><label className="form-label">Password</label><input className="form-control" name="password" type="password" required autoComplete="current-password" /></div>
              <div className="col-12 d-grid d-sm-flex gap-2">
                <button className="btn btn-danger" disabled={busy} type="submit">{busy ? 'Signing in…' : 'Login'}</button>
              </div>
            </form>
            <div className="d-grid d-sm-flex gap-2 mt-3">
              <button
                type="button"
                className="btn btn-outline-danger"
                disabled={busy}
                onClick={() => {
                  setNotice('');
                  setError('');
                  setShowCreateAdmin(true);
                }}
              >
                Create New Admin / Recover Access
              </button>
            </div>
            <p className="small text-secondary mt-3 mb-0">
              Multiple administrators are supported. Sign in with an Owner or Manager account, or click{' '}
              <button
                type="button"
                className="btn btn-link btn-sm p-0 align-baseline"
                onClick={() => { setError(''); setNotice(''); setShowCreateAdmin(true); }}
              >
                Create New Admin / Recover Access
              </button>{' '}
              to set up an administrator without signing in.
            </p>
          </Card>
        )
      )}

      {overview && (
        <>
          <Card title="Database overview">
            <div className="row g-3">
              {[
                ['Database', overview.database_name],
                ['Connection', overview.connection_status],
                ['Tables', overview.table_count],
                ['Records', overview.record_count],
                ['Access', `${overview.access.employee_code} · ${overview.access.role}`],
              ].map(([label, value]) => (
                <div className="col-6 col-md-4 col-lg" key={label}>
                  <div className="border rounded-3 p-3 h-100 bg-light">
                    <div className="small text-secondary">{label}</div>
                    <div className="fw-bold text-break">{value}</div>
                  </div>
                </div>
              ))}
            </div>
          </Card>

          {!viewer && (
            <Card title="Database tables">
              <div className="table-responsive">
                <table className="table align-middle">
                  <thead><tr><th>Table</th><th>Records</th><th></th></tr></thead>
                  <tbody>
                    {overview.tables.map((table) => (
                      <tr key={table.key}>
                        <td><div className="fw-semibold">{table.db_table}</div><div className="small text-secondary">{table.key}</div></td>
                        <td>{table.count}</td>
                        <td className="text-end">
                          <button type="button" className="btn btn-sm btn-outline-danger me-2" onClick={() => { setSearch(''); setOrdering('-id'); openTable(table.key, 1, '', '-id'); }}>View records</button>
                          <button type="button" className="btn btn-sm btn-outline-secondary" onClick={() => { setSearch(''); setOrdering('-id'); openTable(table.key, 1, '', '-id'); }}>Delete records</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}

          {viewer && records && (
            <Card title={`Records · ${records.db_table}`}>
              <div className="d-flex flex-wrap gap-2 mb-3">
                <button type="button" className="btn btn-sm btn-light" onClick={() => { setViewer(null); setRecords(null); setSelected([]); }}>Back to tables</button>
                <form className="d-flex gap-2 flex-grow-1" onSubmit={(event) => { event.preventDefault(); openTable(viewer, 1, search, ordering); }}>
                  <input className="form-control" placeholder="Search" value={search} onChange={(event) => setSearch(event.target.value)} />
                  <button className="btn btn-outline-danger" disabled={busy}>Search</button>
                </form>
                <button type="button" className="btn btn-outline-secondary" disabled={busy} onClick={() => openTable(viewer, page, search, ordering)}>Refresh</button>
                <button type="button" className="btn btn-danger" disabled={busy || selected.length === 0} onClick={deleteSelected}>Delete selected ({selected.length})</button>
              </div>
              <p className="small text-secondary">{records.count} records</p>
              {records.results.length === 0 ? <p>No records match this view.</p> : (
                <div className="table-responsive">
                  <table className="table table-sm align-middle">
                    <thead>
                      <tr>
                        <th></th>
                        {records.columns.map((column) => (
                          <th key={column.key}>
                            {column.sortable === false ? column.label : (
                              <button type="button" className="btn btn-link btn-sm p-0 text-dark fw-bold" onClick={() => {
                                const next = ordering === column.key ? `-${column.key}` : column.key;
                                setOrdering(next);
                                openTable(viewer, 1, search, next);
                              }}>{column.label}</button>
                            )}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {records.results.map((row) => (
                        <tr key={row.id}>
                          <td><input type="checkbox" checked={selected.includes(row.id)} onChange={() => setSelected((current) => current.includes(row.id) ? current.filter((id) => id !== row.id) : [...current, row.id])} /></td>
                          {records.columns.map((column) => <td key={column.key} className="text-break" style={{ minWidth: 90 }}>{cellText(row[column.key])}</td>)}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <div className="d-flex gap-2">
                <button type="button" className="btn btn-sm btn-light" disabled={page <= 1 || busy} onClick={() => openTable(viewer, page - 1, search, ordering)}>Previous</button>
                <span className="small align-self-center">Page {records.page} of {records.pages}</span>
                <button type="button" className="btn btn-sm btn-light" disabled={page >= records.pages || busy} onClick={() => openTable(viewer, page + 1, search, ordering)}>Next</button>
              </div>
            </Card>
          )}

          {overview.access.can_manage_administrators && (
            <Card title="Administrator account management">
              <p className="small text-secondary">Add another Owner or Manager. Each account has its own Admin ID and password. Existing accounts are not replaced, and the server setup key is not required.</p>
              <form onSubmit={saveAdmin} className="row g-2 mb-4">
                <div className="col-md-4"><input className="form-control" name="employee_code" placeholder="Admin ID" required /></div>
                <div className="col-md-4"><input className="form-control" name="name" placeholder="Full name" required /></div>
                <div className="col-md-4"><input className="form-control" name="phone" placeholder="Phone" required /></div>
                <div className="col-md-4"><input className="form-control" name="email" type="email" placeholder="Email (optional)" /></div>
                <div className="col-md-4">
                  <select className="form-select" name="role" defaultValue="ADMIN">
                    <option value="ADMIN">Manager</option>
                    {overview.access.can_create_owner && <option value="SUPER_ADMIN">Owner</option>}
                  </select>
                </div>
                <div className="col-md-4"><input className="form-control" name="password" type="password" placeholder="Password" required /></div>
                <div className="col-md-4"><input className="form-control" name="confirm_password" type="password" placeholder="Confirm password" required /></div>
                <div className="col-12"><button className="btn btn-danger" disabled={busy}>Create administrator</button></div>
              </form>
              {admins.map((row) => (
                <div key={row.id} className="border rounded-3 p-3 mb-3">
                  <div className="fw-bold mb-2">{row.employee_code} · {row.role === 'SUPER_ADMIN' ? 'Owner' : 'Manager'}</div>
                <form key={`${row.id}-${row.role}-${row.status}-${row.name}-${row.phone}-${row.email}`} className="row g-2 mb-2" onSubmit={(event) => {
                    event.preventDefault();
                    const form = new FormData(event.target);
                    changeAdmin(row, Object.fromEntries(form.entries()));
                  }}>
                    <div className="col-md-3"><input className="form-control form-control-sm" name="name" defaultValue={row.name} required /></div>
                    <div className="col-md-3"><input className="form-control form-control-sm" name="phone" defaultValue={row.phone} required /></div>
                    <div className="col-md-3"><input className="form-control form-control-sm" name="email" type="email" defaultValue={row.email} /></div>
                    <div className="col-md-3">
                      <select className="form-select form-select-sm" name="role" defaultValue={row.role}>
                        <option value="ADMIN">Manager</option>
                        {overview.access.can_create_owner && <option value="SUPER_ADMIN">Owner</option>}
                      </select>
                    </div>
                    <div className="col-12 d-flex gap-2">
                      <button className="btn btn-sm btn-outline-danger" disabled={busy}>Save details</button>
                      <button type="button" className="btn btn-sm btn-outline-secondary" disabled={busy} onClick={() => changeAdmin(row, { name: row.name, phone: row.phone, email: row.email, role: row.role, status: row.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE' })}>
                        {row.status === 'ACTIVE' ? 'Deactivate' : 'Activate'}
                      </button>
                      <span className="small text-secondary align-self-center">{row.status}</span>
                    </div>
                  </form>
                  <form className="row g-2" onSubmit={(event) => changePassword(event, row.id)}>
                    <div className="col-md-4"><input className="form-control form-control-sm" name="current_password" type="password" placeholder="Your password" required /></div>
                    <div className="col-md-3"><input className="form-control form-control-sm" name="new_password" type="password" placeholder="New password" required /></div>
                    <div className="col-md-3"><input className="form-control form-control-sm" name="confirm_password" type="password" placeholder="Confirm" required /></div>
                    <div className="col-md-2"><button className="btn btn-sm btn-outline-danger w-100" disabled={busy}>Change</button></div>
                  </form>
                </div>
              ))}
            </Card>
          )}

          <Card title="Delete all application data" danger>
            <p>This permanently deletes users, administrator accounts, employees, branches, menus, dishes, inventory, coupons, orders, payments, and other application records. The database schema and migration history stay in place. This does not drop the database.</p>
            <form onSubmit={resetToken ? runReset : authorizeReset} className="row g-3">
              <div className="col-12"><label className="form-label">Type {PHRASE}</label><input className="form-control" name="confirmation" required autoComplete="off" disabled={busy} /></div>
              <div className="col-md-6"><label className="form-label">Your password</label><input className="form-control" name="password" type="password" required autoComplete="current-password" disabled={busy} /></div>
              <div className="col-12 d-flex gap-2 align-items-center">
                <button className="btn btn-outline-danger" disabled={busy} type="submit">
                  {resetting ? 'Deleting application data…' : resetToken ? 'Confirm deletion' : 'Authorize reset'}
                </button>
                {resetting && <span className="small text-secondary">Please wait. This finishes only after the server confirms it.</span>}
              </div>
            </form>
          </Card>
        </>
      )}
    </main>
  );
}
