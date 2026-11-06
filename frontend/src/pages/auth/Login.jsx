import React, { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import Button from '../../components/common/Button';
import Input from '../../components/common/Input';
import api from '../../config/api';

export const Login = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { login } = useAuth();

  const [email, setEmail] = useState(location.state?.employee_code || '');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [successNotice, setSuccessNotice] = useState(() => {
    if (location.state?.successMessage) return location.state.successMessage;
    const searchParams = new URLSearchParams(location.search);
    if (searchParams.get('expired') === '1') {
      return 'Your session has expired due to 60 minutes of inactivity. Please log in again.';
    }
    return '';
  });

  useEffect(() => {
    let active = true;
    api.get('/db/status/')
      .then((res) => {
        if (active && res.data?.setup_required) navigate('/db', { replace: true });
      })
      .catch(() => {});
    return () => { active = false; };
  }, [navigate]);

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
    setForgotError('');
    const id = forgotIdentifier.trim();
    if (!id) {
      setForgotError('Please enter your email or registered phone number.');
      return;
    }
    setForgotLoading(true);
    setTimeout(() => {
      // Generate a friendly 4-digit verification code
      const code = String(Math.floor(1000 + Math.random() * 9000));
      setGeneratedOtp(code);
      setForgotLoading(false);
      setForgotStep(2);
    }, 500);
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

          <div className="text-start mb-3">
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

          {error && <div className="text-danger small mb-3 fw-semibold text-start">{error}</div>}

          <div className="d-grid gap-2 mt-3">
            <Button type="submit" variant="primary" className="py-2.5 fw-bold" loading={loading}>
              Login to Dashboard
            </Button>
          </div>
        </form>

        <p className="text-muted small mt-3 mb-0">Sign in with your Admin ID, employee code, email, or registered mobile number.</p>
      </div>
      </div>
    </div>
  );
};
export default Login;
