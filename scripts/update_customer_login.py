customer_login_code = """import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { useCart } from '../../hooks/useCart';
import { FiPhone, FiCheckCircle, FiChevronDown, FiArrowLeft } from 'react-icons/fi';
import { COUNTRY_CODES, detectUserCountryCode, fetchGeolocationCountryCode } from '../../utils/countryCodes';
import { cartService } from '../../services/cartService';
import { applyOrderContext } from '../../services/customerCheckout';
import { getOrderType } from '../../utils/orderContext';

export const CustomerLogin = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { sendOTP, verifyOTP } = useAuth();
  const { cartItems, clearCart } = useCart();

  // Phone & OTP state
  const [countryCode, setCountryCode] = useState('+91');
  const [phone, setPhone] = useState('');
  const [otpArray, setOtpArray] = useState(['', '', '', '', '', '']);
  const [otpSent, setOtpSent] = useState(false);
  const [otpLoading, setOtpLoading] = useState(false);

  const [error, setError] = useState('');
  const [infoMessage, setInfoMessage] = useState('');

  const [cooldown, setCooldown] = useState(0);
  const cooldownTimerRef = useRef(null);
  const isSubmittingRef = useRef(false);
  const otpInputRefs = useRef([]);

  const startCooldown = (seconds) => {
    const sec = Math.max(1, Math.ceil(Number(seconds) || 0));
    setCooldown(sec);
    if (cooldownTimerRef.current) clearInterval(cooldownTimerRef.current);
    cooldownTimerRef.current = setInterval(() => {
      setCooldown((prev) => {
        if (prev <= 1) {
          clearInterval(cooldownTimerRef.current);
          cooldownTimerRef.current = null;
          setError('');
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  useEffect(() => {
    return () => {
      if (cooldownTimerRef.current) clearInterval(cooldownTimerRef.current);
    };
  }, []);

  const fromState = location.state?.from;
  const destination = typeof fromState === 'string'
    ? fromState
    : (fromState?.pathname ? `${fromState.pathname}${fromState.search || ''}${fromState.hash || ''}` : null);
  const returningToCheckout = Boolean(destination && destination.includes('checkout'));

  const persistGuestCart = () => {
    try {
      if (Array.isArray(cartItems) && cartItems.length > 0) {
        const payload = JSON.stringify(cartItems);
        sessionStorage.setItem('foodie_cart', payload);
        sessionStorage.setItem('foodie_guest_cart', payload);
        sessionStorage.setItem('foodie_guest_cart_temp', payload);
        sessionStorage.setItem('foodie_guest_cart_unmerged', payload);
      }
    } catch (e) { }
  };

  useEffect(() => {
    persistGuestCart();
  }, []);

  useEffect(() => {
    const detected = detectUserCountryCode();
    setCountryCode(detected);
    fetchGeolocationCountryCode().then((code) => {
      if (code) setCountryCode(code);
    });
  }, []);

  const selectedCountryObj = COUNTRY_CODES.find((c) => c.code === countryCode) || COUNTRY_CODES[0];

  const handleSendOTP = async (e) => {
    if (e) e.preventDefault();
    if (otpLoading || cooldown > 0 || isSubmittingRef.current) return;
    setError('');
    setInfoMessage('');

    const reqLen = selectedCountryObj.phoneLen || 10;
    if (phone.length < reqLen) {
      setError(`Please enter a valid ${reqLen}-digit mobile number`);
      return;
    }

    isSubmittingRef.current = true;
    setOtpLoading(true);
    try {
      const fullPhone = `${countryCode}${phone}`;
      const sent = await sendOTP(fullPhone);
      setOtpSent(true);
      setOtpArray(['', '', '', '', '', '']);
      if (sent?.dev_otp) {
        setInfoMessage(`Development mode: your verification code is ${sent.dev_otp}`);
      }
      startCooldown(30);
      setTimeout(() => {
        if (otpInputRefs.current[0]) otpInputRefs.current[0].focus();
      }, 100);
    } catch (err) {
      if (err.retryAfter > 0) {
        startCooldown(err.retryAfter);
      }
      setError(err.message || 'Could not send verification code. Please try again.');
    } finally {
      isSubmittingRef.current = false;
      setOtpLoading(false);
    }
  };

  const handleResendOTP = async () => {
    if (otpLoading || cooldown > 0) return;
    await handleSendOTP();
  };

  const handleOtpChange = (index, value) => {
    const clean = value.replace(/\\D/g, '').slice(-1);
    const newArr = [...otpArray];
    newArr[index] = clean;
    setOtpArray(newArr);
    setError('');

    if (clean && index < 5 && otpInputRefs.current[index + 1]) {
      otpInputRefs.current[index + 1].focus();
    }
  };

  const handleOtpKeyDown = (index, e) => {
    if (e.key === 'Backspace' && !otpArray[index] && index > 0 && otpInputRefs.current[index - 1]) {
      otpInputRefs.current[index - 1].focus();
    }
  };

  const handleVerifyOTP = async (e) => {
    if (e) e.preventDefault();
    const fullOtp = otpArray.join('');
    if (fullOtp.length !== 6 || isSubmittingRef.current) return;
    setError('');
    isSubmittingRef.current = true;
    setOtpLoading(true);

    try {
      const fullPhone = `${countryCode}${phone}`;
      const res = await verifyOTP(fullPhone, fullOtp);

      const hasGuestCartItems = Array.isArray(cartItems) && cartItems.length > 0;
      if (hasGuestCartItems) {
        try {
          const authKey = res.user?.id ? `foodie_cart_${res.user.id}` : null;
          if (authKey) {
            sessionStorage.setItem(authKey, JSON.stringify(cartItems));
            localStorage.setItem(authKey, JSON.stringify(cartItems));
          }
          await cartService.syncLocalCart(cartItems);
        } catch (e) { }
      }

      if (destination) {
        navigate(destination, { replace: true });
      } else if (hasGuestCartItems) {
        navigate('/customer/checkout', { replace: true });
      } else {
        navigate('/customer/home', { replace: true });
      }
    } catch (err) {
      if (err.retryAfter > 0) {
        startCooldown(err.retryAfter);
      }
      setError(err.message || 'Invalid OTP. Please try again.');
    } finally {
      isSubmittingRef.current = false;
      setOtpLoading(false);
    }
  };

  const formatTimer = (sec) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  return (
    <div 
      className="min-vh-100 d-flex flex-column align-items-center justify-content-center p-3"
      style={{ backgroundColor: '#F8FAFC' }}
    >
      {/* Centered White Card Container (Matches Reference 1 & 2) */}
      <div 
        className="card border-0 shadow-sm p-4 p-sm-5 text-center position-relative w-100"
        style={{
          maxWidth: '440px',
          borderRadius: '24px',
          backgroundColor: '#FFFFFF',
          border: '1px solid #E2E8F0'
        }}
      >
        {/* Circular Red Foodie Logo */}
        <div className="d-flex align-items-center justify-content-center gap-2 mb-3">
          <div 
            className="text-white d-flex align-items-center justify-content-center fw-bold shadow-xs"
            style={{ 
              width: '42px', 
              height: '42px', 
              borderRadius: '50%', 
              backgroundColor: '#F20D2D', 
              fontSize: '22px' 
            }}
          >
            F
          </div>
          <span className="fw-bold text-dark fs-4" style={{ letterSpacing: '-0.3px' }}>
            Foodie
          </span>
        </div>

        {!otpSent ? (
          /* SCREEN 1: Welcome to Foodie */
          <div>
            <h4 className="fw-bold text-dark mb-1" style={{ fontSize: '22px' }}>
              Welcome to Foodie
            </h4>
            <p className="text-secondary small mb-4" style={{ fontSize: '13.5px', color: '#64748B' }}>
              Order your favorite food
            </p>

            <form onSubmit={handleSendOTP}>
              {/* Phone Input Box with Icon & Country Code */}
              <div 
                className="d-flex align-items-center bg-white border rounded-3 p-1.5 mb-3 shadow-xs"
                style={{ borderColor: '#CBD5E1', height: '48px' }}
              >
                <div className="d-flex align-items-center gap-1 ps-2 text-muted pe-2 border-end">
                  <FiPhone size={15} style={{ color: '#64748B' }} />
                  <span className="fw-bold text-dark small" style={{ fontSize: '13px' }}>{countryCode}</span>
                </div>
                <input
                  type="tel"
                  inputMode="numeric"
                  maxLength={10}
                  className="form-control border-0 shadow-none ps-3 text-dark fw-semibold"
                  style={{ fontSize: '14px', backgroundColor: 'transparent' }}
                  placeholder="Mobile number"
                  value={phone}
                  onChange={(e) => {
                    setPhone(e.target.value.replace(/\\D/g, '').slice(0, 10));
                    setError('');
                  }}
                  required
                  autoFocus
                />
              </div>

              {error && <div className="text-danger small mb-3 fw-semibold text-start">{error}</div>}

              {/* Red Continue Pill Button */}
              <button
                type="submit"
                disabled={otpLoading || cooldown > 0 || phone.length < (selectedCountryObj.phoneLen || 10)}
                className="btn btn-danger w-100 rounded-pill py-2.5 fw-bold shadow-sm"
                style={{
                  height: '46px',
                  backgroundColor: '#F20D2D',
                  borderColor: '#F20D2D',
                  fontSize: '14.5px',
                  boxShadow: '0 4px 12px rgba(242, 13, 45, 0.25)'
                }}
              >
                {otpLoading ? 'Sending...' : (cooldown > 0 ? `Wait (${cooldown}s)` : 'Continue')}
              </button>
            </form>

            {/* Skip for Now Link */}
            <div className="mt-4">
              <button
                type="button"
                onClick={() => navigate('/customer/home')}
                className="btn btn-link text-decoration-none fw-bold small p-0"
                style={{ color: '#F20D2D', fontSize: '13.5px' }}
              >
                Skip for Now
              </button>
            </div>

            {/* Employee / Admin Login Link at bottom */}
            <div className="mt-5 pt-3 border-top border-light-subtle">
              <Link
                to="/login"
                className="text-secondary small text-decoration-none fw-semibold"
                style={{ fontSize: '13px' }}
              >
                Employee / Admin Login
              </Link>
            </div>
          </div>
        ) : (
          /* SCREEN 2: Enter OTP */
          <div>
            <h4 className="fw-bold text-dark mb-1" style={{ fontSize: '22px' }}>
              Enter OTP
            </h4>
            <p className="text-secondary small mb-4" style={{ fontSize: '13px', color: '#64748B' }}>
              We've sent a 6-digit code to <strong className="text-dark">{countryCode} {phone}</strong>
            </p>

            {infoMessage && (
              <div className="alert alert-info py-2 px-3 small rounded-3 mb-3 text-start" style={{ fontSize: '12px' }}>
                {infoMessage}
              </div>
            )}

            <form onSubmit={handleVerifyOTP}>
              {/* 6 Individual Square OTP Inputs */}
              <div className="d-flex align-items-center justify-content-between gap-2 mb-4">
                {otpArray.map((digit, idx) => (
                  <input
                    key={idx}
                    ref={el => otpInputRefs.current[idx] = el}
                    type="text"
                    inputMode="numeric"
                    maxLength={1}
                    className="form-control text-center p-0 fw-bold shadow-xs"
                    style={{
                      width: '46px',
                      height: '52px',
                      borderRadius: '12px',
                      fontSize: '22px',
                      borderColor: digit ? '#F20D2D' : '#CBD5E1',
                      borderWidth: digit ? '2px' : '1.5px',
                      backgroundColor: digit ? '#FFF5F5' : '#FFFFFF',
                      color: '#0F172A'
                    }}
                    value={digit}
                    onChange={(e) => handleOtpChange(idx, e.target.value)}
                    onKeyDown={(e) => handleOtpKeyDown(idx, e)}
                  />
                ))}
              </div>

              {error && <div className="text-danger small mb-3 fw-semibold text-start">{error}</div>}

              {/* Verify & Continue Red Pill Button */}
              <button
                type="submit"
                disabled={otpLoading || otpArray.join('').length !== 6}
                className="btn btn-danger w-100 rounded-pill py-2.5 fw-bold shadow-sm"
                style={{
                  height: '46px',
                  backgroundColor: '#F20D2D',
                  borderColor: '#F20D2D',
                  fontSize: '14.5px',
                  boxShadow: '0 4px 12px rgba(242, 13, 45, 0.25)'
                }}
              >
                {otpLoading ? 'Verifying...' : 'Verify & Continue'}
              </button>
            </form>

            {/* Resend OTP Timer & Change Mobile Number */}
            <div className="mt-4 d-flex flex-column gap-2">
              <div className="text-secondary small" style={{ fontSize: '13px' }}>
                {cooldown > 0 ? (
                  <span>Resend OTP in <strong className="text-danger">{formatTimer(cooldown)}</strong></span>
                ) : (
                  <button
                    type="button"
                    onClick={handleResendOTP}
                    className="btn btn-link text-decoration-none fw-bold p-0 text-danger"
                    style={{ fontSize: '13px' }}
                  >
                    Resend OTP
                  </button>
                )}
              </div>

              <button
                type="button"
                onClick={() => { setOtpSent(false); setError(''); }}
                className="btn btn-link text-decoration-none text-secondary small p-0 mt-1"
                style={{ fontSize: '13px' }}
              >
                Change Mobile Number
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default CustomerLogin;
"""

with open('frontend/src/pages/customer/CustomerLogin.jsx', 'w', encoding='utf-8') as f:
    f.write(customer_login_code)

print("CustomerLogin.jsx rewritten successfully!")
