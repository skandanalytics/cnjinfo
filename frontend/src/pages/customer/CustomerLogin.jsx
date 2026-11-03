import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { useCart } from '../../hooks/useCart';
import { formatCompactTableLabel } from '../../utils/tableUtils';
import { FiPhone, FiCheckCircle, FiChevronDown, FiArrowLeft, FiShoppingBag } from 'react-icons/fi';
import { COUNTRY_CODES, detectUserCountryCode, fetchGeolocationCountryCode } from '../../utils/countryCodes';
import { cartService } from '../../services/cartService';
import { applyOrderContext } from '../../services/customerCheckout';
import { getOrderType } from '../../utils/orderContext';

export const CustomerLogin = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { sendOTP, verifyOTP } = useAuth();
  const { cartItems, setTable } = useCart();

  // Step 1: Login, Step 2: OTP, Step 3: Dining Option
  const [countryCode, setCountryCode] = useState('+91');
  const [phone, setPhone] = useState('');
  const [otpArray, setOtpArray] = useState(['', '', '', '', '', '']);
  const [otpSent, setOtpSent] = useState(false);
  const [otpLoading, setOtpLoading] = useState(false);
  const [showDiningOption, setShowDiningOption] = useState(Boolean(location.state?.chooseDining));
  const [selectedDining, setSelectedDining] = useState('DINE_IN');
  const isQrSession = typeof window !== 'undefined' && Boolean(
    sessionStorage.getItem('foodie_table_qr') || localStorage.getItem('foodie_table_qr') ||
    (sessionStorage.getItem('foodie_branch_source') === 'qr')
  );
  const [openTables, setOpenTables] = useState([]);
  const [selectedTable, setSelectedTable] = useState(null);
  const [tablesLoading, setTablesLoading] = useState(false);

  useEffect(() => {
    if (!showDiningOption) return;
    let mounted = true;
    const loadTables = async () => {
      setTablesLoading(true);
      try {
        const { resolvePublicBranchId, availableTables } = await import('../../services/customerCheckout');
        const bId = await resolvePublicBranchId();
        if (bId) {
          const list = await availableTables(bId);
          if (mounted) {
            const avail = (list || []).filter(t => t.available === true || t.status === 'AVAILABLE' || t.status === 'Available');
            setOpenTables(avail);
            if (avail.length > 0) {
              const savedTableId = sessionStorage.getItem('foodie_selected_table') || localStorage.getItem('foodie_selected_table');
              const savedTableNum = sessionStorage.getItem('foodie_table_number') || localStorage.getItem('foodie_table_number');
              let found = null;
              if (savedTableId) {
                found = avail.find(t => String(t.id) === String(savedTableId));
              }
              if (!found && savedTableNum) {
                const cleanTarget = formatCompactTableLabel(savedTableNum);
                found = avail.find(t => formatCompactTableLabel(t.table_number || t.number || t.id) === cleanTarget);
              }
              if (found) {
                setSelectedTable(found);
                if (isQrSession) {
                  setOpenTables([found]);
                }
              } else if (avail.length > 0) {
                setSelectedTable(avail[0]);
              }
            }
          }
        }
      } catch (e) { } finally {
        if (mounted) setTablesLoading(false);
      }
    };
    loadTables();
    return () => { mounted = false; };
  }, [showDiningOption]);

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
        const devDigits = String(sent.dev_otp).split('').slice(0, 6);
        setOtpArray(devDigits);
        setInfoMessage(`Code sent! Dev OTP: ${sent.dev_otp}`);
      } else {
        setInfoMessage('Verification code sent to your mobile');
      }
      startCooldown(30);
    } catch (err) {
      if (err.retryAfter > 0) {
        startCooldown(err.retryAfter);
      }
      setError(err.message || 'Failed to send OTP. Please check your mobile number and try again.');
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
    const clean = value.replace(/\D/g, '').slice(-1);
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

      // Isolate customer session: clear any previous order continuation from old sessions
      sessionStorage.removeItem('foodie_parent_order_id');
      localStorage.removeItem('foodie_parent_order_id');
      setShowDiningOption(true);
    } catch (err) {
      if (err.retryAfter > 0) {
        startCooldown(err.retryAfter);
      }
      setError(err.message || 'Invalid verification code. Please try again.');
    } finally {
      isSubmittingRef.current = false;
      setOtpLoading(false);
    }
  };

  const handleConfirmDining = () => {
    sessionStorage.setItem('foodie_order_type', selectedDining);
    localStorage.setItem('foodie_order_type', selectedDining);
    if (selectedDining === 'DINE_IN' && selectedTable) {
      const cleanTableNum = formatCompactTableLabel(selectedTable.table_number || selectedTable.number || selectedTable.id);
      sessionStorage.setItem('foodie_selected_table', String(selectedTable.id));
      localStorage.setItem('foodie_selected_table', String(selectedTable.id));
      sessionStorage.setItem('foodie_table_number', String(cleanTableNum));
      localStorage.setItem('foodie_table_number', String(cleanTableNum));
      const tableObj = {
        tableId: selectedTable.id,
        id: selectedTable.id,
        tableNumber: cleanTableNum,
        orderType: 'DINE_IN',
        isTakeaway: false
      };
      sessionStorage.setItem('foodie_table', JSON.stringify(tableObj));
      localStorage.setItem('foodie_table', JSON.stringify(tableObj));
      if (setTable) {
        setTable(tableObj);
      }
    } else if (selectedDining === 'TAKEAWAY') {
      const takeawayObj = {
        tableId: null,
        id: null,
        tableNumber: 'Takeaway',
        orderType: 'TAKEAWAY',
        isTakeaway: true
      };
      sessionStorage.setItem('foodie_table', JSON.stringify(takeawayObj));
      localStorage.setItem('foodie_table', JSON.stringify(takeawayObj));
      if (setTable) {
        setTable(takeawayObj);
      }
    }
    const hasGuestCartItems = Array.isArray(cartItems) && cartItems.length > 0;
    if (destination) {
      navigate(destination, { replace: true });
    } else if (hasGuestCartItems) {
      navigate('/customer/checkout', { replace: true });
    } else {
      navigate('/customer/home', { replace: true });
    }
  };

  const formatTimer = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div 
      className="min-vh-100 d-flex flex-column align-items-center justify-content-center p-3"
      style={{ 
        backgroundColor: '#F8FAFC',
        position: 'relative'
      }}
    >
      {/* Centered White Card Container (Matches Reference 1, 2, 3) */}
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

        {showDiningOption ? (
          /* SCREEN 3: Choose Dining Option */
          <div>
            <h4 className="fw-bold text-dark mb-1" style={{ fontSize: '22px' }}>
              Choose Dining Option
            </h4>
            <p className="text-secondary small mb-4" style={{ fontSize: '13px', color: '#64748B' }}>
              How would you like to enjoy your food today?
            </p>

            {/* Selectable Card 1: Table Dine-in */}
            <div
              onClick={() => setSelectedDining('DINE_IN')}
              className="p-3 rounded-4 mb-3 d-flex align-items-center justify-content-between text-start cursor-pointer transition-all shadow-xs"
              style={{
                cursor: 'pointer',
                border: `2px solid ${selectedDining === 'DINE_IN' ? '#F20D2D' : '#E2E8F0'}`,
                backgroundColor: selectedDining === 'DINE_IN' ? '#FFF5F5' : '#FFFFFF'
              }}
            >
              <div className="d-flex align-items-center gap-3">
                <div 
                  className="rounded-3 d-flex align-items-center justify-content-center flex-shrink-0"
                  style={{
                    width: '46px',
                    height: '46px',
                    backgroundColor: selectedDining === 'DINE_IN' ? '#FFE4E6' : '#F1F5F9',
                    color: '#F20D2D'
                  }}
                >
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M4 18v3" /><path d="M20 18v3" /><path d="M2 14h20" /><path d="M4 14V8a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v6" />
                    <path d="M6 14v4" /><path d="M18 14v4" />
                  </svg>
                </div>
                <div>
                  <div className="fw-bold text-dark fs-6">Table Dine-in</div>
                  <div className="text-secondary small mt-0.5" style={{ fontSize: '12px', color: '#64748B' }}>
                    Dine at our restaurant and enjoy the experience
                  </div>
                </div>
              </div>

              {selectedDining === 'DINE_IN' && (
                <div className="text-danger ps-2">
                  <FiCheckCircle size={22} style={{ fill: '#F20D2D', color: '#FFFFFF' }} />
                </div>
              )}
            </div>

            {selectedDining === 'DINE_IN' && !isQrSession && (
              <div className="text-start mb-3 p-3 rounded-4 bg-light border border-light-subtle shadow-2xs">
                <div className="d-flex align-items-center justify-content-between mb-2">
                  <span className="fw-bold text-dark small" style={{ fontSize: '13px' }}>
                    {openTables.length === 1 ? 'Your Table' : 'Select Your Dining Table'}
                  </span>
                  <span className="badge rounded-pill bg-success-subtle text-success fw-semibold" style={{ fontSize: '11px' }}>
                    {tablesLoading ? 'Checking...' : `${openTables.length} Available`}
                  </span>
                </div>

                {tablesLoading ? (
                  <div className="py-2 text-center text-muted small">Loading available tables...</div>
                ) : openTables.length === 0 ? (
                  <div className="p-2 text-center text-danger small rounded bg-white border border-danger-subtle">
                    No tables available. Please select Takeaway.
                  </div>
                ) : (
                  <div>
                    <select
                      value={selectedTable?.id || ''}
                      onChange={(e) => {
                        const found = openTables.find(t => String(t.id) === String(e.target.value));
                        setSelectedTable(found || null);
                      }}
                      className="form-select form-select-sm rounded-pill py-2 px-3 fw-semibold border shadow-xs text-dark"
                      style={{ fontSize: '13px', borderColor: '#CBD5E1', backgroundColor: '#FFFFFF' }}
                    >
                      {openTables.map(t => {
                        const cleanNum = formatCompactTableLabel(t.table_number || t.number || t.id);
                        const loc = t.location || t.area || 'Indoor';
                        const cap = t.capacity || 4;
                        return (
                          <option key={t.id} value={t.id}>
                            {cleanNum} — {loc} ({cap} Seats)
                          </option>
                        );
                      })}
                    </select>

                    <div className="d-flex align-items-center gap-1.5 flex-wrap mt-2.5">
                      {openTables.slice(0, 8).map(t => {
                        const cleanNum = formatCompactTableLabel(t.table_number || t.number || t.id);
                        const isSelected = selectedTable && String(selectedTable.id) === String(t.id);
                        return (
                          <button
                            key={t.id}
                            type="button"
                            onClick={() => setSelectedTable(t)}
                            className={`btn btn-sm rounded-pill px-2.5 py-1 fw-bold transition-all ${
                              isSelected
                                ? 'btn-danger text-white shadow-xs'
                                : 'btn-outline-secondary bg-white text-secondary'
                            }`}
                            style={{ fontSize: '11.5px', minWidth: '48px' }}
                          >
                            {cleanNum}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Selectable Card 2: Takeaway */}
            <div
              onClick={() => setSelectedDining('TAKEAWAY')}
              className="p-3 rounded-4 mb-4 d-flex align-items-center justify-content-between text-start cursor-pointer transition-all shadow-xs"
              style={{
                cursor: 'pointer',
                border: `2px solid ${selectedDining === 'TAKEAWAY' ? '#F20D2D' : '#E2E8F0'}`,
                backgroundColor: selectedDining === 'TAKEAWAY' ? '#FFF5F5' : '#FFFFFF'
              }}
            >
              <div className="d-flex align-items-center gap-3">
                <div 
                  className="rounded-3 d-flex align-items-center justify-content-center flex-shrink-0"
                  style={{
                    width: '46px',
                    height: '46px',
                    backgroundColor: selectedDining === 'TAKEAWAY' ? '#FFE4E6' : '#F1F5F9',
                    color: '#F20D2D'
                  }}
                >
                  <FiShoppingBag size={22} />
                </div>
                <div>
                  <div className="fw-bold text-dark fs-6">Takeaway</div>
                  <div className="text-secondary small mt-0.5" style={{ fontSize: '12px', color: '#64748B' }}>
                    Pick up your order and enjoy it anywhere
                  </div>
                </div>
              </div>

              {selectedDining === 'TAKEAWAY' && (
                <div className="text-danger ps-2">
                  <FiCheckCircle size={22} style={{ fill: '#F20D2D', color: '#FFFFFF' }} />
                </div>
              )}
            </div>

            {/* Continue Button */}
            <button
              type="button"
              onClick={handleConfirmDining}
              className="btn btn-danger w-100 rounded-pill py-2.5 fw-bold shadow-sm"
              style={{
                height: '46px',
                backgroundColor: '#F20D2D',
                borderColor: '#F20D2D',
                fontSize: '14.5px',
                boxShadow: '0 4px 12px rgba(242, 13, 45, 0.25)'
              }}
            >
              Continue
            </button>
          </div>
        ) : !otpSent ? (
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
                    setPhone(e.target.value.replace(/\D/g, '').slice(0, 10));
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
                onClick={() => setShowDiningOption(true)}
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
                className="btn btn-link text-decoration-none text-secondary small p-0 fw-semibold"
                style={{ fontSize: '13px' }}
              >
                Change Mobile Number
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Subtle Food Illustration / Decoration at Bottom */}
      <div 
        className="position-fixed bottom-0 start-0 w-100 pointer-events-none d-none d-md-block"
        style={{ height: '70px', opacity: 0.15, pointerEvents: 'none' }}
      >
        <div className="d-flex justify-content-between px-5">
          <span style={{ fontSize: '36px' }}>🥗</span>
          <span style={{ fontSize: '36px' }}>🍔</span>
          <span style={{ fontSize: '36px' }}>🍕</span>
          <span style={{ fontSize: '36px' }}>🍜</span>
        </div>
      </div>
    </div>
  );
};

export default CustomerLogin;
