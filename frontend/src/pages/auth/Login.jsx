import React, { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import Button from '../../components/common/Button';
import Input from '../../components/common/Input';
import { FiLock, FiMail, FiCheckCircle, FiShield, FiKey } from 'react-icons/fi';
import api from '../../config/api';

export const Login = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { login } = useAuth();

  const [email, setEmail] = useState(location.state?.employee_code || '');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [successNotice, setSuccessNotice] = useState(location.state?.successMessage || '');

  useEffect(() => {
    let active = true;
    api.get('/db/status/')
      .then((res) => {
        if (active && res.data?.setup_required) navigate('/db', { replace: true });
      })
      .catch(() => {});
    return () => { active = false; };
  }, [navigate]);

  // Forgot Password Modal State
  const [isForgotModalOpen, setIsForgotModalOpen] = useState(false);
  const [forgotStep, setForgotStep] = useState(1); // 1: Enter ID, 2: Enter OTP & New Password, 3: Success
  const [forgotIdentifier, setForgotIdentifier] = useState('');
  const [resetOtp, setResetOtp] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [generatedOtp, setGeneratedOtp] = useState('1234');
  const [forgotError, setForgotError] = useState('');
  const [forgotLoading, setForgotLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!email.trim() || !password.trim()) {
      setError('Please enter your Admin ID / employee code and password.');
      return;
    }

    setLoading(true);
    try {
      const userObj = await login(email, password);
      let fromUrl = location.state?.from;
      if (!fromUrl) {
        try {
          fromUrl = sessionStorage.getItem('foodie_auth_redirect');
          if (fromUrl) sessionStorage.removeItem('foodie_auth_redirect');
        } catch (e) {}
      }
      if (fromUrl && typeof fromUrl === 'string') {
        const isEmployeeDest = fromUrl.startsWith('/employee');
        const isAdminDest = fromUrl.startsWith('/admin') || fromUrl.startsWith('/db');
        if (userObj.role === 'admin') {
          navigate(fromUrl, { replace: true });
          return;
        } else if (userObj.role === 'employee' && (isEmployeeDest || isAdminDest)) {
          if (fromUrl.startsWith('/admin/employees') || fromUrl.startsWith('/admin/settings')) {
            navigate('/employee/dashboard', { replace: true });
          } else {
            navigate(fromUrl, { replace: true });
          }
          return;
        }
      }
      if (userObj.role === 'employee') {
        navigate('/employee/dashboard', { replace: true });
      } else if (userObj.role === 'admin') {
        navigate('/admin/dashboard', { replace: true });
      } else {
        navigate('/customer/home', { replace: true });
      }
    } catch (err) {
      setError(err.message || 'Invalid employee code or password.');
    } finally {
      setLoading(false);
    }
  };

  // Step 1: Send OTP / Reset Code
  const handleSendResetCode = (e) => {
    e.preventDefault();
    setForgotError('Password reset is not available here. Ask an administrator to set a new password.');
  };

  // Step 2: Verify OTP & Reset Password
  const handleResetPassword = (e) => {
    e.preventDefault();
    setForgotError('');

    if (!resetOtp.trim()) {
      setForgotError('Please enter the 4-digit verification code.');
      return;
    }

    if (resetOtp.trim() !== generatedOtp && resetOtp.trim() !== '1234') {
      setForgotError(`Invalid verification code. Use ${generatedOtp} or 1234.`);
      return;
    }

    if (!newPassword || newPassword.length < 4) {
      setForgotError('Password must be at least 4 characters long.');
      return;
    }

    if (newPassword !== confirmPassword) {
      setForgotError('Passwords do not match. Please re-type.');
      return;
    }

    setForgotLoading(true);
    setTimeout(() => {
      try {
        const cleanId = forgotIdentifier.trim().toLowerCase();
        const cleanDigits = forgotIdentifier.replace(/\D/g, '').slice(-10);

        // Save password override in localStorage
        const existingOverrides = JSON.parse(localStorage.getItem('foodie_password_overrides') || '{}');
        existingOverrides[cleanId] = newPassword;
        if (cleanDigits) existingOverrides[cleanDigits] = newPassword;
        localStorage.setItem('foodie_password_overrides', JSON.stringify(existingOverrides));

        // Update in custom employees if present
        const customEmployees = JSON.parse(localStorage.getItem('foodie_custom_employees') || '[]');
        const updatedCustom = customEmployees.map(emp => {
          const empEmail = String(emp.email || '').trim().toLowerCase();
          const empPhone = String(emp.phone || '').replace(/\D/g, '').slice(-10);
          if (empEmail === cleanId || (cleanDigits && empPhone === cleanDigits)) {
            return { ...emp, password: newPassword };
          }
          return emp;
        });
        localStorage.setItem('foodie_custom_employees', JSON.stringify(updatedCustom));
      } catch (err) {}

      // Pre-populate login fields
      setEmail(forgotIdentifier);
      setPassword(newPassword);

      setForgotLoading(false);
      setForgotStep(3);
    }, 600);
  };

  const handleCloseForgotModal = () => {
    setIsForgotModalOpen(false);
    setForgotStep(1);
    setForgotIdentifier('');
    setResetOtp('');
    setNewPassword('');
    setConfirmPassword('');
    setForgotError('');
  };

  return (
    <div className="min-vh-100 px-3 py-5 d-flex flex-column justify-content-center" style={{ background: 'linear-gradient(135deg, #fff5f5 0%, #ffffff 60%)' }}>
      <div style={{ width: '100%', maxWidth: '480px', margin: '0 auto' }}>
      <div className="text-center mb-4">
        <h2 className="fw-bold text-danger mb-1">Foodie</h2>
        <p className="text-muted small">Admin & Employee Portal</p>
      </div>

      <div className="card border-0 shadow-sm p-4 rounded-4 bg-light-subtle">
        {successNotice && <div className="alert alert-success small mb-3 text-start">{successNotice}</div>}
        <form onSubmit={handleSubmit}>
          <div className="text-start mb-3">
            <Input
              label="Admin ID or Employee Code"
              type="text"
              placeholder="e.g. ADMIN, email, or mobile number"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                setError('');
              }}
              required
            />
          </div>

          <div className="text-start mb-2">
            <Input
              label="Password"
              type="password"
              placeholder="••••••"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                setError('');
              }}
              required
            />
          </div>

          <div className="d-flex justify-content-end mb-3">
            <button
              type="button"
              onClick={() => {
                setForgotIdentifier(email || '');
                setForgotStep(1);
                setForgotError('');
                setIsForgotModalOpen(true);
              }}
              className="btn btn-link text-danger text-decoration-none p-0 fw-semibold"
              style={{ fontSize: '12px' }}
            >
              Forgot Password?
            </button>
          </div>

          {error && <div className="text-danger small mb-3 fw-semibold text-start">{error}</div>}

          <div className="d-grid gap-2 mt-2">
            <Button type="submit" variant="primary" className="py-2.5 fw-bold" loading={loading}>
              Login to Dashboard
            </Button>
          </div>
        </form>

        <div className="mt-3 p-2.5 rounded-3 bg-light border text-secondary small text-start d-flex justify-content-between align-items-center" style={{ fontSize: '12px' }}>
          <div>Admin ID: <strong className="text-dark">ADMIN</strong></div>
          <div>Password: <strong className="text-dark">Admin@123</strong></div>
        </div>

        <p className="text-muted small mt-3 mb-0">Sign in with your Admin ID, employee code, email, or registered mobile number.</p>
      </div>

      {/* Forgot Password Modal */}
      {isForgotModalOpen && (
        <div className="modal show d-block" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
          <div className="modal-dialog modal-dialog-centered">
            <div className="modal-content border-0 rounded-4 shadow-lg overflow-hidden">
              <div className="modal-header bg-danger text-white p-4 border-0">
                <div className="d-flex align-items-center gap-2.5">
                  <div className="bg-white text-danger p-2 rounded-circle d-flex align-items-center justify-content-center" style={{ width: '38px', height: '38px' }}>
                    <FiLock size={18} />
                  </div>
                  <div>
                    <h5 className="modal-title fw-bold mb-0">Reset Password</h5>
                    <span className="small opacity-75">Admin & Staff Portal</span>
                  </div>
                </div>
                <button type="button" className="btn-close btn-close-white" onClick={handleCloseForgotModal}></button>
              </div>

              <div className="modal-body p-4 bg-light text-start">
                {/* Step 1: Request Code */}
                {forgotStep === 1 && (
                  <form onSubmit={handleSendResetCode}>
                    <p className="text-secondary small mb-3">
                      Enter your registered email address or mobile number to receive a verification code and reset your password.
                    </p>

                    <div className="mb-3">
                      <label className="form-label small fw-bold text-dark">Email or Mobile Number</label>
                      <input
                        type="text"
                        required
                        className="form-control rounded-3"
                        placeholder="e.g. employee@foodie.com or 9876543210"
                        value={forgotIdentifier}
                        onChange={(e) => {
                          setForgotIdentifier(e.target.value);
                          setForgotError('');
                        }}
                      />
                    </div>

                    {forgotError && <div className="text-danger small mb-3 fw-semibold">{forgotError}</div>}

                    <div className="d-grid gap-2 mt-4">
                      <Button type="submit" variant="primary" className="py-2.5 fw-bold" loading={forgotLoading}>
                        Send Verification Code
                      </Button>
                    </div>
                  </form>
                )}

                {/* Step 2: Enter Code & New Password */}
                {forgotStep === 2 && (
                  <form onSubmit={handleResetPassword}>
                    <div className="alert alert-info py-2 px-3 small rounded-3 mb-3 d-flex align-items-center justify-content-between">
                      <span>Verification code sent to <strong>{forgotIdentifier}</strong></span>
                      <span className="badge bg-primary rounded-pill">Code: {generatedOtp}</span>
                    </div>

                    <div className="mb-3">
                      <label className="form-label small fw-bold text-dark">4-Digit Verification Code</label>
                      <input
                        type="text"
                        maxLength={4}
                        required
                        className="form-control rounded-3 text-center fw-bold fs-5 letter-spacing-2"
                        placeholder="••••"
                        value={resetOtp}
                        onChange={(e) => {
                          setResetOtp(e.target.value);
                          setForgotError('');
                        }}
                      />
                    </div>

                    <div className="mb-3">
                      <label className="form-label small fw-bold text-dark">New Password</label>
                      <input
                        type="password"
                        required
                        className="form-control rounded-3"
                        placeholder="Enter new password"
                        value={newPassword}
                        onChange={(e) => {
                          setNewPassword(e.target.value);
                          setForgotError('');
                        }}
                      />
                    </div>

                    <div className="mb-3">
                      <label className="form-label small fw-bold text-dark">Confirm New Password</label>
                      <input
                        type="password"
                        required
                        className="form-control rounded-3"
                        placeholder="Re-type new password"
                        value={confirmPassword}
                        onChange={(e) => {
                          setConfirmPassword(e.target.value);
                          setForgotError('');
                        }}
                      />
                    </div>

                    {forgotError && <div className="text-danger small mb-3 fw-semibold">{forgotError}</div>}

                    <div className="d-grid gap-2 mt-4">
                      <Button type="submit" variant="primary" className="py-2.5 fw-bold" loading={forgotLoading}>
                        Reset Password
                      </Button>
                    </div>
                  </form>
                )}

                {/* Step 3: Success */}
                {forgotStep === 3 && (
                  <div className="text-center py-3">
                    <div className="bg-success-subtle text-success p-3 rounded-circle d-inline-flex align-items-center justify-content-center mb-3" style={{ width: '64px', height: '64px' }}>
                      <FiCheckCircle size={32} />
                    </div>
                    <h5 className="fw-bold text-dark mb-2">Password Reset Successfully!</h5>
                    <p className="text-secondary small mb-4">
                      Your password for <strong>{forgotIdentifier}</strong> has been updated. You can now login with your new password.
                    </p>
                    <button
                      type="button"
                      className="btn btn-danger rounded-pill px-4 py-2 fw-bold w-100"
                      onClick={handleCloseForgotModal}
                    >
                      Back to Login
                    </button>
                  </div>
                )}
              </div>

              {forgotStep !== 3 && (
                <div className="modal-footer border-0 p-3 bg-white justify-content-end">
                  <button type="button" className="btn btn-secondary btn-sm rounded-pill px-4" onClick={handleCloseForgotModal}>
                    Cancel
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
      </div>
    </div>
  );
};
export default Login;
