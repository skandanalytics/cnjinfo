import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams, useLocation } from 'react-router-dom';
import { useCart } from '../../hooks/useCart';
import { useAuth } from '../../hooks/useAuth';
import Button from '../../components/common/Button';
import Input from '../../components/common/Input';
import { FiCornerDownRight, FiPhone, FiLock, FiCheckCircle, FiCoffee, FiShoppingBag } from 'react-icons/fi';
import { tableService } from '../../services/tableService';
import api from '../../services/api';
import { COUNTRY_CODES, detectUserCountryCode, fetchGeolocationCountryCode } from '../../utils/countryCodes';
import { availableTables, resolvePublicBranchId, selectableTables } from '../../services/customerCheckout';
import {
  DINE_IN, NO_TABLES_MESSAGE, TAKEAWAY, hasScannedTable, rememberScannedTableQr, setOrderType, setSelectedTableId,
} from '../../utils/orderContext';
import { formatCompactTableLabel } from '../../utils/tableUtils';

export const Welcome = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const qrParam = searchParams.get('qr');
  const tableParam = searchParams.get('table');

  const { setTable, tableContext } = useCart();
  const { sendOTP, verifyOTP } = useAuth();

  const [tableNum, setTableNum] = useState(() => {
    return tableParam ? formatCompactTableLabel(tableParam) : '';
  });
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [showOrderTypeSelection, setShowOrderTypeSelection] = useState(Boolean(location.state?.chooseDining));
  const [error, setError] = useState('');
  const [infoMessage, setInfoMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [qrDisabled, setQrDisabled] = useState(false);
  const [qrMessage, setQrMessage] = useState('');
  const [, setDineInAvailable] = useState(hasScannedTable);
  const [checkingTables, setCheckingTables] = useState(false);
  const [tableChoices, setTableChoices] = useState(null);
  const [availabilityMessage, setAvailabilityMessage] = useState('');
  const [availabilityError, setAvailabilityError] = useState('');

  const [cooldown, setCooldown] = useState(0);
  const cooldownTimerRef = React.useRef(null);
  const isSubmittingRef = React.useRef(false);

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

  const continueAsGuest = async () => {
    setError('');
    setLoading(true);
    try {
      if (!sessionStorage.getItem('foodie_guest_token')) {
        const issued = await api.post('/cart/guest-token/');
        sessionStorage.setItem('foodie_guest_token', issued.data.guest_token);
      }
      setOtpSent(false);
      setOtp('');
      setShowOrderTypeSelection(true);
    } catch (err) {
      setError(err.response?.data?.detail || 'Could not start a guest session. You can still sign in with OTP.');
    } finally {
      setLoading(false);
    }
  };

  const requestNewOtp = async () => {
    if (loading || cooldown > 0 || isSubmittingRef.current) return;
    setError('');
    setOtp('');
    isSubmittingRef.current = true;
    setLoading(true);
    try {
      const sent = await sendOTP(phone);
      setOtpSent(true);
      setShowOrderTypeSelection(false);
      if (sent?.dev_otp) {
        setOtp(String(sent.dev_otp));
        setInfoMessage(`OTP sent. Development code: ${sent.dev_otp}`);
      } else {
        setInfoMessage('A new OTP was sent to your mobile.');
      }
    } catch (err) {
      if (err.retryAfter > 0) {
        startCooldown(err.retryAfter);
      }
      setError(err.message || 'Could not send a new OTP.');
    } finally {
      isSubmittingRef.current = false;
      setLoading(false);
    }
  };

  const goHome = () => navigate(location.state?.from || '/customer/home', { replace: true });

  const claimTable = (table) => {
    setSelectedTableId(table.id);
    setOrderType(DINE_IN);
    setTable({ tableNumber: table.table_number, tableId: table.id, location: table.location || '', orderType: DINE_IN });
    goHome();
  };

  const startDineIn = async () => {
    setError('');
    setAvailabilityMessage('');
    setAvailabilityError('');
    if (qrParam) {
      if (!hasScannedTable() || qrDisabled) return;
      setOrderType(DINE_IN);
      goHome();
      return;
    }
    if (hasScannedTable()) {
      setOrderType(DINE_IN);
      goHome();
      return;
    }
    setCheckingTables(true);
    try {
      const branchId = await resolvePublicBranchId();
      if (!branchId) {
        setAvailabilityError('No restaurant is open for dine-in right now.');
        return;
      }
      const tables = await availableTables(branchId);
      const open = selectableTables(tables);
      if (!tables.length) {
        setAvailabilityMessage(NO_TABLES_MESSAGE);
        return;
      }
      if (!open.length) {
        setAvailabilityMessage('Tables are listed, but none are free for a new dine-in order.');
        return;
      }
      if (open.length === 1) {
        claimTable(open[0]);
        return;
      }
      setTableChoices(open);
    } catch (err) {
      setAvailabilityError(err.message || 'Could not check table availability.');
    } finally {
      setCheckingTables(false);
    }
  };

  const handleSelectOrderType = async (type) => {
    if (type === DINE_IN) {
      startDineIn();
      return;
    }
    setAvailabilityError('');
    try {
      const branchId = await resolvePublicBranchId();
      if (branchId) {
        const menu = await api.get(`/public/branches/${branchId}/menu/`);
        const foods = Array.isArray(menu.data?.foods) ? menu.data.foods : [];
        if (!foods.some((food) => food.is_orderable)) {
          setAvailabilityError('Takeaway ordering is unavailable because no dishes are currently available.');
          return;
        }
      }
    } catch (err) {
      setAvailabilityError(err.response?.data?.detail || 'Takeaway ordering could not be started.');
      return;
    }
    setSelectedTableId(null);
    setOrderType(TAKEAWAY);
    setTable({ tableNumber: 'Takeaway', tableId: 'Takeaway', orderType: TAKEAWAY });
    goHome();
  };

  // A QR is trusted only after the backend resolves it to an active table of an active branch.
  useEffect(() => {
    if (qrParam) {
      api.get(`/public/qr/${qrParam}/`).then((res) => {
        const table = res.data?.table;
        const branch = res.data?.branch;
        if (!table) {
          rememberScannedTableQr(null);
          setTableNum('');
          setDineInAvailable(false);
          setQrDisabled(true);
          setQrMessage('This table QR is currently unavailable or disabled.');
          return;
        }
        rememberScannedTableQr(qrParam);
        if (branch?.id) {
          sessionStorage.setItem('foodie_public_branch', String(branch.id));
          sessionStorage.setItem('foodie_branch_source', 'qr');
        }
        const ctx = {
          tableNumber: table.table_number, tableId: table.id,
          diners: table.capacity || 2, orderType: DINE_IN, location: table.location || '',
        };
        setSelectedTableId(table.id);
        setTable(ctx);
        setTableNum(table.table_number);
        setOrderType(DINE_IN);
        setDineInAvailable(true);
        setQrDisabled(false);
        setQrMessage('');
      }).catch((err) => {
        rememberScannedTableQr(null);
        setTableNum('');
        setDineInAvailable(false);
        if (err.isNetworkError || !err.response) {
          // Network error: Backend is unreachable - do not misclassify as QR disabled
          setQrDisabled(false);
          const msg = err.message || 'Unable to connect to the backend server. Please check your network connection.';
          setQrMessage(msg);
          setError(msg);
        } else {
          setQrDisabled(true);
          const data = err.response?.data;
          let msg = data?.detail || 'This table QR is currently unavailable or disabled.';
          if (data?.code === 'qr_disabled') {
            msg = 'QR code ordering is currently turned off by the restaurant.';
          } else if (data?.code === 'table_inactive') {
            msg = 'This table is currently inactive or not in service.';
          } else if (data?.code === 'branch_inactive') {
            msg = 'This restaurant branch is currently inactive.';
          }
          setQrMessage(msg);
          setError(msg);
        }
      });
    }
    // setTable is recreated on every provider render, so it must not be a dependency here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qrParam]);

  // A plain ?table= link is display-only: it never enables Dine-In without a verified QR.
  useEffect(() => {
    const targetQuery = tableParam || qrParam;
    if (targetQuery && !qrParam) {
      const canonNum = tableService.getCanonicalTableNumber(targetQuery);
      setTable({ tableNumber: canonNum, tableId: canonNum, diners: 2 });
      setTableNum(canonNum);
    }

    const loadTable = async () => {
      const targetQuery = tableParam || qrParam;
      if (targetQuery) {
        const queryStr = String(targetQuery).toUpperCase().trim();
        try {
          const [allTables, allQRs] = await Promise.all([
            tableService.getTables(),
            tableService.getQRCodes().catch(() => [])
          ]);

          // Match by ID, table_number, or QR code string
          let matchedTable = allTables.find(t => 
            String(t.id) === queryStr || 
            t.number.toUpperCase() === queryStr ||
            t.number.toUpperCase().replace(/[^0-9]/g, '') === queryStr.replace(/[^0-9]/g, '')
          );

          if (!matchedTable && allQRs.length > 0) {
            const matchedQR = allQRs.find(q => q.code.toUpperCase() === queryStr || String(q.id) === queryStr);
            if (matchedQR) {
              matchedTable = allTables.find(t => Number(t.id) === Number(matchedQR.table));
            }
          }

          if (matchedTable) {
            // Check if QR code is disabled
            const relatedQR = allQRs.find(q => Number(q.table) === Number(matchedTable.id));
            if (relatedQR && relatedQR.is_active === false) {
              setQrDisabled(true);
              setError('This table QR is currently unavailable or disabled.');
            } else {
              setQrDisabled(false);
            }

            const canonNum = tableService.getCanonicalTableNumber(matchedTable.number);
            setTable({ tableNumber: canonNum, tableId: matchedTable.id, diners: matchedTable.capacity || 2 });
            setTableNum(canonNum);
          } else {
            const canonNum = tableService.getCanonicalTableNumber(queryStr);
            setTable({ tableNumber: canonNum, tableId: canonNum, diners: 2 });
            setTableNum(canonNum);
          }
        } catch (err) {
          console.error('Error validating QR table:', err);
          const canonNum = tableService.getCanonicalTableNumber(queryStr);
          setTable({ tableNumber: canonNum, tableId: canonNum, diners: 2 });
          setTableNum(canonNum);
        }
      } else if (tableContext) {
        setTableNum(tableService.getCanonicalTableNumber(tableContext.tableNumber));
      }
    };
    if (!qrParam) loadTable();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tableParam, qrParam]);

  const [countryCode, setCountryCode] = useState('+91');

  // Geolocation / Timezone Detection
  useEffect(() => {
    const detected = detectUserCountryCode();
    setCountryCode(detected);

    fetchGeolocationCountryCode().then((code) => {
      if (code) setCountryCode(code);
    });
  }, []);

  const selectedCountryObj = COUNTRY_CODES.find((c) => c.code === countryCode) || COUNTRY_CODES[0];

  const handleSendOTP = async (e) => {
    e.preventDefault();
    if (loading || cooldown > 0 || isSubmittingRef.current) return;
    setError('');
    setInfoMessage('');

    const reqLen = selectedCountryObj.phoneLen || 10;
    if (phone.length < reqLen) {
      setError(`Please enter a valid ${reqLen}-digit mobile number.`);
      return;
    }

    if (selectedCountryObj.pattern && !selectedCountryObj.pattern.test(phone)) {
      setError(`Please enter a valid mobile number.`);
      return;
    }

    isSubmittingRef.current = true;
    setLoading(true);
    try {
      const sent = await sendOTP(phone);
      setOtp('');
      setOtpSent(true);
      setShowOrderTypeSelection(false);
      if (sent?.dev_otp) {
        setOtp(String(sent.dev_otp));
        setInfoMessage(`OTP sent. Development code: ${sent.dev_otp}`);
      } else {
        setInfoMessage('OTP sent to your mobile.');
      }
    } catch (err) {
      if (err.retryAfter > 0) {
        startCooldown(err.retryAfter);
      }
      setError(err.message || 'Failed to send OTP. Please try again.');
    } finally {
      isSubmittingRef.current = false;
      setLoading(false);
    }
  };

  const handleVerifyOTP = async (e) => {
    e.preventDefault();
    if (loading || isSubmittingRef.current) return;
    setError('');
    setInfoMessage('');

    const cleanOtp = otp.replace(/\D/g, '').trim();

    if (!cleanOtp) {
      setError('Please enter the 6-digit OTP sent to your mobile.');
      return;
    }

    if (cleanOtp.length !== 6) {
      setError('OTP must be exactly 6 digits. No less, no more.');
      return;
    }

    isSubmittingRef.current = true;
    setLoading(true);
    try {
      await verifyOTP(phone, cleanOtp);
      setShowOrderTypeSelection(true);
    } catch (err) {
      if (err.retryAfter > 0) {
        startCooldown(err.retryAfter);
      }
      setError(err.message || 'Invalid OTP. Please try again.');
    } finally {
      isSubmittingRef.current = false;
      setLoading(false);
    }
  };

  return (
    <div className="mobile-wrapper w-100 min-vh-100 bg-white px-4 d-flex flex-column justify-content-between py-5 mx-auto">
      <div className="text-center mt-4">
        <h2 className="fw-bold text-danger">Foodie</h2>
        <p className="text-muted small">Welcome to digital ordering</p>
      </div>

      <div className="my-auto py-4">

        {availabilityMessage && (
          <div className="alert alert-warning text-start small" role="status" data-testid="no-tables-banner">
            {availabilityMessage}
            <button type="button" className="btn btn-link btn-sm p-0 ms-2" onClick={startDineIn} disabled={checkingTables}>
              Check again
            </button>
          </div>
        )}
        {availabilityError && (
          <div className="alert alert-danger text-start small" role="alert">{availabilityError}</div>
        )}
        {qrParam && qrMessage && (
          <div className="alert alert-danger text-start small" role="alert">{qrMessage}</div>
        )}

        {showOrderTypeSelection ? (
          <div className="text-center py-2 animate-fade-in">
            <div className="mb-4">
              {tableNum && String(tableNum).toLowerCase() !== 'takeaway' && (
                <div className="badge bg-danger-subtle text-danger px-3 py-1.5 rounded-pill fw-bold mb-2 font-monospace" style={{ fontSize: '12px' }}>
                  {formatCompactTableLabel(tableNum)}
                </div>
              )}
              <h4 className="fw-bold text-dark mb-1">Choose Dining Option</h4>
              <p className="text-secondary small mb-0">How would you like to enjoy your food today?</p>
            </div>

            {tableChoices && !qrParam && !hasScannedTable() && (
              <div className="mb-3 text-start">
                <p className="small fw-semibold mb-2 text-secondary">Choose your table:</p>
                <div className="d-flex flex-wrap gap-2">
                  {tableChoices.map((table) => {
                    const label = formatCompactTableLabel(table.table_number);
                    const isSelected = tableNum && formatCompactTableLabel(tableNum) === label;
                    return (
                      <button
                        key={table.id}
                        type="button"
                        className={`btn btn-sm rounded-3 px-3 py-1.5 fw-bold font-monospace transition-all border ${
                          isSelected
                            ? 'btn-danger text-white border-danger shadow-xs'
                            : 'btn-outline-danger bg-white'
                        }`}
                        style={{ fontSize: '13px', minWidth: '56px' }}
                        title={table.location ? `${label} (${table.location})` : label}
                        onClick={() => claimTable(table)}
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="d-flex flex-column gap-3 mb-2">
              {/* Dine-In Card */}
              <button
                type="button"
                data-testid="welcome-dine-in"
                onClick={() => handleSelectOrderType(DINE_IN)}
                disabled={checkingTables || qrDisabled || (Boolean(qrParam) && !hasScannedTable())}
                className="btn btn-outline-danger p-3 rounded-4 d-flex align-items-center gap-3 text-start border-2 shadow-sm bg-white dining-option-card"
                style={{ borderColor: 'var(--primary-color, #dc3545)' }}
              >
                <div 
                  className="rounded-circle d-flex align-items-center justify-content-center flex-shrink-0 dining-option-icon"
                  style={{ width: '48px', height: '48px', background: 'rgba(220, 53, 69, 0.1)', color: '#dc3545' }}
                >
                  <FiCoffee size={24} />
                </div>
                <div className="flex-grow-1 min-width-0">
                  <div className="fw-bold text-dark fs-6">Table Dine-In</div>
                  <span className="text-secondary small d-block mt-0.5" style={{ fontSize: '11.5px', lineHeight: '1.3' }}>
                    {checkingTables
                      ? 'Checking tables…'
                      : qrParam && !hasScannedTable()
                        ? (qrDisabled ? 'This table QR cannot be used' : 'Confirming this table…')
                        : tableNum && String(tableNum).toLowerCase() !== 'takeaway' && (qrParam || hasScannedTable())
                          ? `Dine in at table ${formatCompactTableLabel(tableNum)}`
                          : 'Served at an available table, or scan the QR code on your table'}
                  </span>
                </div>
              </button>

              {/* Takeaway Card */}
              <button
                type="button"
                data-testid="welcome-takeaway"
                onClick={() => handleSelectOrderType(TAKEAWAY)}
                className="btn btn-outline-danger p-3 rounded-4 d-flex align-items-center gap-3 text-start border-2 shadow-sm bg-white dining-option-card"
                style={{ borderColor: 'var(--primary-color, #dc3545)' }}
              >
                <div 
                  className="rounded-circle d-flex align-items-center justify-content-center flex-shrink-0 dining-option-icon"
                  style={{ width: '48px', height: '48px', background: 'rgba(220, 53, 69, 0.1)', color: '#dc3545' }}
                >
                  <FiShoppingBag size={24} />
                </div>
                <div className="flex-grow-1 min-width-0">
                  <div className="fw-bold text-dark fs-6">Takeaway</div>
                  <span className="text-secondary small d-block mt-0.5" style={{ fontSize: '11.5px', lineHeight: '1.3' }}>
                    Pick up freshly packed order at the restaurant counter
                  </span>
                </div>
              </button>
            </div>
            {error && <div className="text-danger small mt-2 fw-semibold">{error}</div>}
          </div>
        ) : !otpSent ? (
          <form onSubmit={handleSendOTP}>
            <div className="text-start mb-3">
              <label className="form-label text-secondary small fw-semibold mb-1">Mobile Number</label>
              <div className="input-group">
                <select 
                  className="form-select border-light-subtle bg-white text-dark fw-bold text-center" 
                  style={{ 
                    flex: '0 0 54px',
                    width: '54px', 
                    maxWidth: '56px', 
                    minWidth: '50px', 
                    fontSize: '12px',
                    padding: '0.65rem 0.8rem 0.65rem 0.35rem',
                    borderRadius: '10px 0 0 10px',
                    cursor: 'pointer',
                    backgroundImage: `url("data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'%3e%3cpath fill='none' stroke='%23343a40' stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='m2 5 6 6 6-6'/%3e%3c/svg%3e")`,
                    backgroundRepeat: 'no-repeat',
                    backgroundPosition: 'right 0.2rem center',
                    backgroundSize: '8px 6px'
                  }}
                  value={countryCode}
                  onChange={(e) => {
                    setCountryCode(e.target.value);
                    setError('');
                  }}
                >
                  <option value="+91">+91</option>
                  <option value="+1">+1</option>
                  <option value="+44">+44</option>
                  <option value="+971">+971</option>
                  <option value="+61">+61</option>
                  <option value="+65">+65</option>
                </select>
                <input
                  type="tel"
                  inputMode="numeric"
                  maxLength={10}
                  className="form-control border-light-subtle py-2.5 ps-3 pe-2 text-dark fw-semibold"
                  style={{
                    flex: '1 1 auto',
                    fontSize: '13.5px',
                    borderRadius: '0 10px 10px 0',
                    borderLeft: '1px solid #dee2e6'
                  }}
                  placeholder="Enter 10-digit mobile number"
                  value={phone}
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
                    if (start === end && String(phone || '').length >= 10) {
                      e.preventDefault();
                    }
                  }}
                  onChange={(e) => {
                    setPhone(e.target.value.replace(/\D/g, '').slice(0, 10));
                    setError('');
                  }}
                  required
                />
              </div>
            </div>
            {error && <div className="text-danger small mb-3 fw-semibold text-start">{error}</div>}
            
            <div className="d-grid gap-2 mt-3">
              <Button
                type="submit"
                variant="primary"
                className="py-2.5"
                loading={loading}
                disabled={loading || cooldown > 0 || phone.length < (selectedCountryObj.phoneLen || 10)}
              >
                {cooldown > 0 ? `Send OTP (${cooldown}s)` : 'Send OTP'}
              </Button>
              <Button 
                type="button" 
                variant="outline" 
                className="py-2.5 fw-bold" 
                onClick={continueAsGuest}
                disabled={loading}
              >
                Skip for Now
              </Button>
            </div>
          </form>
        ) : (
          <form onSubmit={handleVerifyOTP}>
            <div className="alert alert-success bg-success-subtle text-success-emphasis border border-success-subtle rounded-3 text-center mb-4 py-2 small fw-semibold">
              <FiCheckCircle className="me-1" /> OTP Sent to {countryCode} {phone}
            </div>
            
            <Input
              label="Enter 6-Digit OTP"
              type="password"
              placeholder="Enter 6-digit verification code"
              value={otp}
              onChange={(e) => {
                setOtp(e.target.value.replace(/\D/g, '').slice(0, 6));
                setError('');
              }}
              maxLength={6}
              minLength={6}
              pattern="[0-9]{6}"
              inputMode="numeric"
              autoComplete="one-time-code"
              required
            />
            
            {error && <div className="text-danger small mb-3 fw-semibold text-start">{error}</div>}
            {infoMessage && <div className="text-success small mb-3 fw-semibold text-start">{infoMessage}</div>}

            <div className="d-grid gap-2">
              <Button 
                type="submit" 
                variant="primary" 
                className="py-2.5" 
                loading={loading}
                disabled={cooldown > 0 || /request a new otp/i.test(error) || otp.replace(/\D/g, '').length !== 6 || loading}
              >
                Verify & Continue
              </Button>
              <Button
                type="button"
                variant="outline"
                className="py-2.5 fw-bold"
                onClick={requestNewOtp}
                disabled={loading || cooldown > 0}
              >
                {cooldown > 0 ? `Request a new OTP (${cooldown}s)` : 'Request a new OTP'}
              </Button>
              <Button type="button" variant="light" className="py-2.5 fw-bold" onClick={() => { setOtpSent(false); setOtp(''); setError(''); }}>
                Use a different number
              </Button>
            </div>
          </form>
        )}
      </div>

      <div>
        <div className="text-center mt-3">
          <button 
            onClick={() => navigate('/login')} 
            className="btn btn-link text-secondary btn-sm text-decoration-none fw-bold d-inline-flex align-items-center gap-1"
          >
            <FiCornerDownRight />
            Employee / Admin Login
          </button>
        </div>
      </div>
    </div>
  );
};

export default Welcome;
