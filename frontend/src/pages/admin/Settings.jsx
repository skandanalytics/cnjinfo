import React, { useEffect, useState } from 'react';
import { FiBell, FiCreditCard, FiCpu, FiLock, FiCheckCircle, FiSave, FiSliders } from 'react-icons/fi';
import AdminLayout from '../../components/layout/AdminLayout';
import PageHeader from '../../components/layout/PageHeader';
import Toggle from '../../components/common/Toggle';
import Button from '../../components/common/Button';

export const Settings = () => {
  const [allowNotifications, setAllowNotifications] = useState(true);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [autoAccept, setAutoAccept] = useState(false);
  const [qrEnabled, setQrEnabled] = useState(true);
  const [cardEnabled, setCardEnabled] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [passwords, setPasswords] = useState({ current_password: '', new_password: '', confirm_password: '' });
  const [passwordErrors, setPasswordErrors] = useState({});
  const [passwordNotice, setPasswordNotice] = useState('');

  useEffect(() => {
    import('../../services/staffClient').then(({ staffJson }) => staffJson('/settings/'))
      .then((data) => {
        setQrEnabled(data?.qr_enabled !== false);
        setCardEnabled(data?.card_enabled !== false);
      })
      .catch(() => setMessage('QR setting could not be loaded.'));
  }, []);

  const handleSave = async () => {
    setSaving(true);
    setMessage('');
    try {
      const { staffJson } = await import('../../services/staffClient');
      const saved = await staffJson('/settings/', {
        method: 'PATCH',
        body: JSON.stringify({ qr_enabled: qrEnabled, card_enabled: cardEnabled }),
      });
      setQrEnabled(saved?.qr_enabled !== false);
      setCardEnabled(saved?.card_enabled !== false);
      window.dispatchEvent(new CustomEvent('foodie_settings_updated'));
      setMessage(saved?.qr_enabled === false
        ? 'QR codes are turned off. Table QR actions are hidden.'
        : 'Settings saved successfully. QR codes and payment rules are updated.');
    } catch (err) {
      setMessage(err.message || 'Settings could not be saved.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <AdminLayout>
      <PageHeader 
        title="Store Settings" 
        subtitle="Manage global system preferences, order automation, and security."
        showBackButton 
      />

      <div className="container-fluid px-0" style={{ maxWidth: '1140px' }}>
        {message && (
          <div className="alert alert-info py-2.5 px-3 rounded-3 small d-flex align-items-center justify-content-between mb-4 shadow-xs">
            <span>{message}</span>
            <button type="button" className="btn-close btn-close-sm" onClick={() => setMessage('')} aria-label="Close" />
          </div>
        )}

        <div className="row g-4 mb-4">
          {/* Column 1: Store Operations & Notifications */}
          <div className="col-12 col-lg-6 d-flex flex-column gap-4">
            {/* Card 1: Notification Options */}
            <div className="card border shadow-sm rounded-4 p-4 bg-white h-100" style={{ borderColor: '#E2E8F0' }}>
              <div className="d-flex align-items-center gap-2 mb-3 pb-2 border-bottom">
                <div className="rounded-circle p-2 d-flex align-items-center justify-content-center" style={{ backgroundColor: '#FEE2E2', color: '#F20D2D' }}>
                  <FiBell size={18} />
                </div>
                <div>
                  <h6 className="fw-bold text-dark mb-0">Notification Options</h6>
                  <p className="text-muted small mb-0" style={{ fontSize: '11.5px' }}>Configure browser alerts and kitchen auditory signals.</p>
                </div>
              </div>

              <div className="d-flex flex-column gap-3">
                <div className="p-2.5 rounded-3 bg-light-subtle border border-light-subtle">
                  <Toggle
                    label="Enable Desktop Notifications"
                    checked={allowNotifications}
                    onChange={() => setAllowNotifications(!allowNotifications)}
                  />
                  <p className="text-muted small ms-4 mt-1 mb-0" style={{ fontSize: '11px' }}>
                    Displays instant browser push banners when new orders are placed.
                  </p>
                </div>

                <div className="p-2.5 rounded-3 bg-light-subtle border border-light-subtle">
                  <Toggle
                    label="Enable Kitchen Alert Audio Sound"
                    checked={soundEnabled}
                    onChange={() => setSoundEnabled(!soundEnabled)}
                  />
                  <p className="text-muted small ms-4 mt-1 mb-0" style={{ fontSize: '11px' }}>
                    Plays an alert sound in the Kitchen Display System whenever a new ticket arrives.
                  </p>
                </div>
              </div>
            </div>

            {/* Card 2: QR Codes */}
            <div className="card border shadow-sm rounded-4 p-4 bg-white" style={{ borderColor: '#E2E8F0' }}>
              <div className="d-flex align-items-center gap-2 mb-3 pb-2 border-bottom">
                <div className="rounded-circle p-2 d-flex align-items-center justify-content-center" style={{ backgroundColor: '#DCFCE7', color: '#16A34A' }}>
                  <i className="bi bi-qr-code" style={{ fontSize: '18px' }} />
                </div>
                <div>
                  <h6 className="fw-bold text-dark mb-0">Table QR Codes</h6>
                  <p className="text-muted small mb-0" style={{ fontSize: '11.5px' }}>Dine-in customer self-service ordering via QR codes.</p>
                </div>
              </div>

              <div className="p-2.5 rounded-3 bg-light-subtle border border-light-subtle">
                <Toggle
                  label="Enable Table QR Ordering"
                  checked={qrEnabled}
                  onChange={() => setQrEnabled(!qrEnabled)}
                />
                <p className="text-muted small ms-4 mt-1 mb-0" style={{ fontSize: '11.5px' }}>
                  When disabled, QR codes on table cards and PDF prints are hidden and customer QR ordering is paused. In-person staff ordering in POS remains fully active.
                </p>
              </div>
            </div>
          </div>

          {/* Column 2: Payment Options, Automation & Account */}
          <div className="col-12 col-lg-6 d-flex flex-column gap-4">
            {/* Card 3: Payment Options */}
            <div className="card border shadow-sm rounded-4 p-4 bg-white" style={{ borderColor: '#E2E8F0' }}>
              <div className="d-flex align-items-center gap-2 mb-3 pb-2 border-bottom">
                <div className="rounded-circle p-2 d-flex align-items-center justify-content-center" style={{ backgroundColor: '#E0F2FE', color: '#0284C7' }}>
                  <FiCreditCard size={18} />
                </div>
                <div>
                  <h6 className="fw-bold text-dark mb-0">Payment Options</h6>
                  <p className="text-muted small mb-0" style={{ fontSize: '11.5px' }}>Configure accepted tender and card terminal availability.</p>
                </div>
              </div>

              <div className="p-2.5 rounded-3 bg-light-subtle border border-light-subtle">
                <Toggle
                  label="Enable Card / Swipe Payments"
                  checked={cardEnabled}
                  onChange={() => setCardEnabled(!cardEnabled)}
                />
                <p className="text-muted small ms-4 mt-1 mb-0" style={{ fontSize: '11.5px' }}>
                  When disabled, Card / Swipe will be hidden as a payment option in the Checkout and POS payment dialogs.
                </p>
              </div>
            </div>

            {/* Card 4: Order Automation */}
            <div className="card border shadow-sm rounded-4 p-4 bg-white" style={{ borderColor: '#E2E8F0' }}>
              <div className="d-flex align-items-center gap-2 mb-3 pb-2 border-bottom">
                <div className="rounded-circle p-2 d-flex align-items-center justify-content-center" style={{ backgroundColor: '#FEF3C7', color: '#D97706' }}>
                  <FiCpu size={18} />
                </div>
                <div>
                  <h6 className="fw-bold text-dark mb-0">Order Automation</h6>
                  <p className="text-muted small mb-0" style={{ fontSize: '11.5px' }}>Streamline incoming order acceptance directly to kitchen queue.</p>
                </div>
              </div>

              <div className="p-2.5 rounded-3 bg-light-subtle border border-light-subtle">
                <Toggle
                  label="Auto-Accept Incoming QR Orders"
                  checked={autoAccept}
                  onChange={() => setAutoAccept(!autoAccept)}
                />
                <p className="text-muted small ms-4 mt-1 mb-0" style={{ fontSize: '11.5px' }}>
                  If enabled, orders from customer tables bypass the "Pending" review status and move directly to "Preparing" on kitchen display.
                </p>
              </div>
            </div>

            {/* Card 5: Account Security */}
            <div className="card border shadow-sm rounded-4 p-4 bg-white" style={{ borderColor: '#E2E8F0' }}>
              <div className="d-flex align-items-center justify-content-between mb-3 pb-2 border-bottom">
                <div className="d-flex align-items-center gap-2">
                  <div className="rounded-circle p-2 d-flex align-items-center justify-content-center" style={{ backgroundColor: '#F1F5F9', color: '#475569' }}>
                    <FiLock size={18} />
                  </div>
                  <div>
                    <h6 className="fw-bold text-dark mb-0">Account & Security</h6>
                    <p className="text-muted small mb-0" style={{ fontSize: '11.5px' }}>Update staff account login credentials.</p>
                  </div>
                </div>

                {!showPassword && (
                  <Button 
                    variant="outline" 
                    onClick={() => { setShowPassword(true); setPasswordNotice(''); setPasswordErrors({}); }} 
                    className="rounded-pill px-3.5 fw-semibold shadow-xs"
                    style={{ fontSize: '12.5px' }}
                  >
                    Change Password
                  </Button>
                )}
              </div>

              {showPassword && (
                <form
                  className="border rounded-3 p-3 bg-light-subtle shadow-xs"
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
                    <Button type="submit" variant="primary" className="rounded-pill px-4 fw-bold">Save Password</Button>
                    <Button type="button" variant="outline" onClick={() => setShowPassword(false)} className="rounded-pill px-4">Cancel</Button>
                  </div>
                </form>
              )}
            </div>
          </div>
        </div>

        {/* Global Save Button Row */}
        <div className="card border shadow-sm rounded-4 p-3 bg-white d-flex flex-row align-items-center justify-content-between flex-wrap gap-3" style={{ borderColor: '#E2E8F0' }}>
          <div>
            <div className="fw-semibold text-dark small">Unsaved changes?</div>
            <p className="text-muted small mb-0" style={{ fontSize: '11.5px' }}>Click Save to persist QR codes, payment toggles, and store configuration.</p>
          </div>
          <Button 
            onClick={handleSave} 
            variant="primary" 
            loading={saving} 
            className="rounded-pill px-4 py-2 fw-bold shadow-sm d-flex align-items-center gap-2"
            style={{ backgroundColor: '#F20D2D', borderColor: '#F20D2D' }}
          >
            <FiSave size={16} />
            <span>Save Settings Configuration</span>
          </Button>
        </div>
      </div>
    </AdminLayout>
  );
};
export default Settings;
