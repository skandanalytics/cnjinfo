import React, { useEffect, useState } from 'react';
import AdminLayout from '../../components/layout/AdminLayout';
import PageHeader from '../../components/layout/PageHeader';
import Toggle from '../../components/common/Toggle';
import Button from '../../components/common/Button';

export const Settings = () => {
  const [allowNotifications, setAllowNotifications] = useState(true);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [autoAccept, setAutoAccept] = useState(false);
  const [qrEnabled, setQrEnabled] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [passwords, setPasswords] = useState({ current_password: '', new_password: '', confirm_password: '' });
  const [passwordErrors, setPasswordErrors] = useState({});
  const [passwordNotice, setPasswordNotice] = useState('');

  useEffect(() => {
    import('../../services/staffClient').then(({ staffJson }) => staffJson('/settings/'))
      .then((data) => setQrEnabled(data?.qr_enabled !== false))
      .catch(() => setMessage('QR setting could not be loaded.'));
  }, []);

  const handleSave = async () => {
    setSaving(true);
    setMessage('');
    try {
      const { staffJson } = await import('../../services/staffClient');
      const saved = await staffJson('/settings/', {
        method: 'PATCH',
        body: JSON.stringify({ qr_enabled: qrEnabled }),
      });
      setQrEnabled(saved?.qr_enabled !== false);
      window.dispatchEvent(new CustomEvent('foodie_settings_updated'));
      setMessage(saved?.qr_enabled === false
        ? 'QR codes are turned off. Table QR actions are hidden.'
        : 'Settings saved. QR codes are available on Manage Tables.');
    } catch (err) {
      setMessage(err.message || 'Settings could not be saved.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <AdminLayout>
      <PageHeader title="Store Settings" showBackButton />

      <div 
        className="card border shadow-sm rounded-4 p-4" 
        style={{ maxWidth: '540px', backgroundColor: 'var(--surface-color)', borderColor: 'var(--border-color)' }}
      >
        <h5 className="fw-bold mb-4 border-bottom pb-2" style={{ color: 'var(--text-primary)', borderColor: 'var(--border-subtle)' }}>Configuration Panel</h5>
        <p className="small text-muted">GST is 5% on each branch and is stored with every order. Notification switches stay in this browser.</p>

        <div className="mb-4">
          <h6 className="fw-bold mb-3" style={{ color: 'var(--text-primary)' }}>Notification Options</h6>
          <Toggle
            label="Enable Desktop Notifications"
            checked={allowNotifications}
            onChange={() => setAllowNotifications(!allowNotifications)}
          />
          <Toggle
            label="Enable Kitchen Alert Audio Sound"
            checked={soundEnabled}
            onChange={() => setSoundEnabled(!soundEnabled)}
          />
        </div>

        <div className="mb-4">
          <h6 className="fw-bold text-dark mb-3">QR Codes</h6>
          <Toggle
            label="Enable table QR codes"
            checked={qrEnabled}
            onChange={() => setQrEnabled(!qrEnabled)}
          />
          <p className="text-muted small ms-4 mt-1" style={{ fontSize: '11px' }}>
            When this is off, QR buttons are hidden and QR links cannot be opened. Tables and dine-in ordering stay available.
          </p>
        </div>

        <div className="mb-4">
          <h6 className="fw-bold text-dark mb-3">Order Automation</h6>
          <Toggle
            label="Auto-Accept Incoming QR Orders"
            checked={autoAccept}
            onChange={() => setAutoAccept(!autoAccept)}
          />
          <p className="text-muted small ms-4 mt-1" style={{ fontSize: '11px' }}>
            If enabled, orders from customer tables bypass the "Pending" status and move directly to "Preparing".
          </p>
        </div>

        <div className="mb-4">
          <h6 className="fw-bold text-dark mb-3">Account</h6>
          <Button variant="outline" onClick={() => { setShowPassword(true); setPasswordNotice(''); setPasswordErrors({}); }} className="rounded-pill px-4">
            Change Password
          </Button>
        </div>

        {message && <div className="alert alert-info py-2 small">{message}</div>}

        {showPassword && (
          <form
            className="border rounded-4 p-4 mb-3 bg-light-subtle shadow-xs"
            onSubmit={async (event) => {
              event.preventDefault();
              setPasswordErrors({});
              setPasswordNotice('');
              if (passwords.new_password !== passwords.confirm_password) {
                setPasswordErrors({ confirm_password: 'New password and confirmation do not match.' });
                return;
              }
              try {
                const { staffJson } = await import('../../services/staffClient');
                await staffJson('/auth/change-password/', { method: 'POST', body: JSON.stringify(passwords) });
                setPasswords({ current_password: '', new_password: '', confirm_password: '' });
                setPasswordNotice('Password updated successfully.');
              } catch (err) {
                const data = err.data || {};
                setPasswordErrors({
                  current_password: Array.isArray(data.current_password) ? data.current_password[0] : '',
                  new_password: Array.isArray(data.new_password) ? data.new_password[0] : '',
                  confirm_password: Array.isArray(data.confirm_password) ? data.confirm_password[0] : '',
                  form: data.detail || err.message,
                });
              }
            }}
          >
            <label className="form-label small fw-semibold">Current Password</label>
            <input type="password" className="form-control rounded-3 mb-2" value={passwords.current_password} onChange={(e) => setPasswords({ ...passwords, current_password: e.target.value })} required />
            {passwordErrors.current_password && <div className="text-danger small mb-2">{passwordErrors.current_password}</div>}
            <label className="form-label small fw-semibold">New Password</label>
            <input type="password" className="form-control rounded-3 mb-2" value={passwords.new_password} onChange={(e) => setPasswords({ ...passwords, new_password: e.target.value })} required />
            {passwordErrors.new_password && <div className="text-danger small mb-2">{passwordErrors.new_password}</div>}
            <label className="form-label small fw-semibold">Confirm New Password</label>
            <input type="password" className="form-control rounded-3 mb-2" value={passwords.confirm_password} onChange={(e) => setPasswords({ ...passwords, confirm_password: e.target.value })} required />
            {passwordErrors.confirm_password && <div className="text-danger small mb-2">{passwordErrors.confirm_password}</div>}
            {passwordErrors.form && <div className="text-danger small mb-2">{passwordErrors.form}</div>}
            {passwordNotice && <div className="alert alert-success py-2 small">{passwordNotice}</div>}
            <div className="d-flex gap-2 mt-3">
              <Button type="submit" variant="primary" className="rounded-pill px-4 fw-bold">Save Changes</Button>
              <Button type="button" variant="outline" onClick={() => setShowPassword(false)} className="rounded-pill px-4">Cancel</Button>
            </div>
          </form>
        )}

        <div className="d-grid mt-4 pt-3 border-top">
          <Button onClick={handleSave} variant="primary" loading={saving} className="rounded-pill py-2.5 fw-bold shadow-sm">
            Save Settings Configuration
          </Button>
        </div>
      </div>
    </AdminLayout>
  );
};
export default Settings;
