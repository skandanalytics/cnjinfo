import re

with open('frontend/src/pages/customer/Checkout.jsx', 'r', encoding='utf-8') as f:
    code = f.read()

# Add FiCheckCircle import if not present
if 'FiCheckCircle' not in code:
    code = code.replace("import { FiCoffee, FiShoppingBag } from 'react-icons/fi';", "import { FiCoffee, FiShoppingBag, FiCheckCircle } from 'react-icons/fi';")

# Find state declarations in Checkout
state_target = """  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');"""

state_replacement = """  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');

  const [customerName, setCustomerName] = useState(() => {
    try {
      const u = JSON.parse(localStorage.getItem('foodie_auth_customer') || '{}')?.user;
      return sessionStorage.getItem('customer_name') || localStorage.getItem('customer_name') || u?.name || 'Ravi Kumar';
    } catch {
      return 'Ravi Kumar';
    }
  });

  const [customerPhone, setCustomerPhone] = useState(() => {
    try {
      const u = JSON.parse(localStorage.getItem('foodie_auth_customer') || '{}')?.user;
      return sessionStorage.getItem('customer_mobile') || localStorage.getItem('customer_mobile') || u?.phone || '+91 98765 43210';
    } catch {
      return '+91 98765 43210';
    }
  });

  const [customerEmail, setCustomerEmail] = useState(() => {
    try {
      const u = JSON.parse(localStorage.getItem('foodie_auth_customer') || '{}')?.user;
      return sessionStorage.getItem('customer_email') || localStorage.getItem('customer_email') || u?.email || 'ravi@gmail.com';
    } catch {
      return 'ravi@gmail.com';
    }
  });

  const [specialInstructions, setSpecialInstructions] = useState(() => {
    return sessionStorage.getItem('foodie_order_instructions') || 'Extra chutney, less spicy.';
  });"""

if state_target in code:
    code = code.replace(state_target, state_replacement)
else:
    code = code.replace(state_target.replace('\n', '\r\n'), state_replacement.replace('\n', '\r\n'))

# Replace the Service Option card block with Customer Details + Dining Option matching Reference 6
old_form_start = """            <div className="card rounded-3 border-0 shadow-sm p-3 p-sm-4 bg-white text-start mb-4">
              <h5 className="fw-bold text-dark mb-3">Service Option</h5>"""

new_form_content = """            {/* Customer Details & Dining Service Card (Matches Reference 6) */}
            <div className="card border-0 shadow-sm p-4 bg-white text-start mb-4" style={{ borderRadius: '18px', border: '1px solid #E2E8F0' }}>
              <h5 className="fw-bold text-dark mb-3" style={{ fontSize: '18px' }}>Customer Details</h5>
              
              <div className="row g-3 mb-4">
                <div className="col-12 col-md-6">
                  <label className="form-label small fw-bold text-dark mb-1">Full Name *</label>
                  <input
                    type="text"
                    className="form-control rounded-3 shadow-xs"
                    style={{ height: '42px', fontSize: '13.5px', borderColor: '#CBD5E1' }}
                    value={customerName}
                    onChange={(e) => {
                      setCustomerName(e.target.value);
                      sessionStorage.setItem('customer_name', e.target.value);
                      localStorage.setItem('customer_name', e.target.value);
                    }}
                    placeholder="Ravi Kumar"
                    required
                  />
                </div>

                <div className="col-12 col-md-6">
                  <label className="form-label small fw-bold text-dark mb-1">Mobile Number *</label>
                  <input
                    type="tel"
                    className="form-control rounded-3 shadow-xs"
                    style={{ height: '42px', fontSize: '13.5px', borderColor: '#CBD5E1' }}
                    value={customerPhone}
                    onChange={(e) => {
                      setCustomerPhone(e.target.value);
                      sessionStorage.setItem('customer_mobile', e.target.value);
                      localStorage.setItem('customer_mobile', e.target.value);
                    }}
                    placeholder="+91 98765 43210"
                    required
                  />
                </div>

                <div className="col-12">
                  <label className="form-label small fw-bold text-dark mb-1">Email (Optional)</label>
                  <input
                    type="email"
                    className="form-control rounded-3 shadow-xs"
                    style={{ height: '42px', fontSize: '13.5px', borderColor: '#CBD5E1' }}
                    value={customerEmail}
                    onChange={(e) => {
                      setCustomerEmail(e.target.value);
                      sessionStorage.setItem('customer_email', e.target.value);
                      localStorage.setItem('customer_email', e.target.value);
                    }}
                    placeholder="ravi@gmail.com"
                  />
                </div>
              </div>

              <h6 className="fw-bold text-dark mb-2.5" style={{ fontSize: '15px' }}>Dining Option</h6>
              <div className="row g-3 mb-3">
                <div className="col-6">
                  <div
                    onClick={() => chooseType(DINE_IN)}
                    className="p-3 rounded-4 d-flex align-items-center justify-content-between text-start cursor-pointer transition-all shadow-xs"
                    style={{
                      cursor: 'pointer',
                      border: `2px solid ${orderType === DINE_IN ? '#F20D2D' : '#E2E8F0'}`,
                      backgroundColor: orderType === DINE_IN ? '#FFF5F5' : '#FFFFFF',
                      minHeight: '68px'
                    }}
                  >
                    <div className="d-flex align-items-center gap-2.5">
                      <div 
                        className="rounded-3 d-flex align-items-center justify-content-center flex-shrink-0"
                        style={{ width: '38px', height: '38px', backgroundColor: orderType === DINE_IN ? '#FFE4E6' : '#F1F5F9', color: '#F20D2D' }}
                      >
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M4 18v3" /><path d="M20 18v3" /><path d="M2 14h20" /><path d="M4 14V8a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v6" />
                        </svg>
                      </div>
                      <span className="fw-bold text-dark fs-6">Table Dine-in</span>
                    </div>
                    {orderType === DINE_IN && (
                      <FiCheckCircle size={20} style={{ fill: '#F20D2D', color: '#FFFFFF' }} />
                    )}
                  </div>
                </div>

                <div className="col-6">
                  <div
                    onClick={() => chooseType(TAKEAWAY)}
                    className="p-3 rounded-4 d-flex align-items-center justify-content-between text-start cursor-pointer transition-all shadow-xs"
                    style={{
                      cursor: 'pointer',
                      border: `2px solid ${orderType === TAKEAWAY ? '#F20D2D' : '#E2E8F0'}`,
                      backgroundColor: orderType === TAKEAWAY ? '#FFF5F5' : '#FFFFFF',
                      minHeight: '68px'
                    }}
                  >
                    <div className="d-flex align-items-center gap-2.5">
                      <div 
                        className="rounded-3 d-flex align-items-center justify-content-center flex-shrink-0"
                        style={{ width: '38px', height: '38px', backgroundColor: orderType === TAKEAWAY ? '#FFE4E6' : '#F1F5F9', color: '#F20D2D' }}
                      >
                        <FiShoppingBag size={20} />
                      </div>
                      <span className="fw-bold text-dark fs-6">Takeaway</span>
                    </div>
                    {orderType === TAKEAWAY && (
                      <FiCheckCircle size={20} style={{ fill: '#F20D2D', color: '#FFFFFF' }} />
                    )}
                  </div>
                </div>
              </div>

              {orderType === DINE_IN && (
                <div className="mb-3">
                  <label className="form-label small fw-bold text-dark mb-1">Select Table *</label>
                  <div className="d-flex align-items-center gap-2">
                    <select
                      className="form-select rounded-3 shadow-xs fw-semibold flex-grow-1"
                      style={{ height: '42px', fontSize: '13.5px', borderColor: '#CBD5E1' }}
                      value={cartView?.table?.id || getSelectedTableId() || ''}
                      onChange={(e) => {
                        const val = e.target.value;
                        const found = tableChoices.find(t => String(t.id) === String(val));
                        if (found) chooseType(DINE_IN, found);
                      }}
                    >
                      <option value="">Choose Table...</option>
                      {tableChoices.map((tbl) => (
                        <option key={tbl.id} value={tbl.id}>
                          {formatCompactTableLabel(tbl.table_number)} ({tbl.capacity || 4} Seats)
                        </option>
                      ))}
                    </select>
                    <span className="badge bg-success-subtle text-success border border-success-subtle rounded-pill px-3 py-2 fw-bold" style={{ fontSize: '11px' }}>
                      Available
                    </span>
                  </div>
                </div>
              )}

              {/* Special Instructions (Optional) */}
              <div className="mb-1">
                <label className="form-label small fw-bold text-dark mb-1">Special Instructions (Optional)</label>
                <input
                  type="text"
                  className="form-control rounded-3 shadow-xs"
                  style={{ height: '42px', fontSize: '13.5px', borderColor: '#CBD5E1' }}
                  value={specialInstructions}
                  onChange={(e) => {
                    setSpecialInstructions(e.target.value);
                    sessionStorage.setItem('foodie_order_instructions', e.target.value);
                  }}
                  placeholder="Extra chutney, less spicy."
                />
              </div>

              {notice && (
                <div className="alert alert-warning small py-2 mt-3 mb-0" role="status" data-testid="no-tables-banner">
                  {notice}
                </div>
              )}
              {error && <div className="alert alert-danger small py-2 mt-3 mb-0" role="alert" data-testid="checkout-error">{error}</div>}
            </div>"""

# Replace the old service option block
pattern = r'<div className="card rounded-3 border-0 shadow-sm p-3 p-sm-4 bg-white text-start mb-4">[\s\S]*?\{error && <div className="alert alert-danger small py-2 mt-3 mb-0" role="alert" data-testid="checkout-error">\{error\}</div>\}\s*</div>'

if re.search(pattern, code):
    code = re.sub(pattern, new_form_content, code, count=1)
    print("Replaced with new_form_content via regex!")
else:
    print("Warning: regex pattern not matched in Checkout.jsx")

with open('frontend/src/pages/customer/Checkout.jsx', 'w', encoding='utf-8') as f:
    f.write(code)
