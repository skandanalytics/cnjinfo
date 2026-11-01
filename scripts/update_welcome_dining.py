with open('frontend/src/pages/customer/Welcome.jsx', 'r', encoding='utf-8') as f:
    code = f.read()

# Replace dining cards with the modern ones
old_dining_section = """            <div className="d-flex flex-column gap-3 mb-2">
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
            </div>"""

new_dining_section = """            <div className="d-flex flex-column gap-3 mb-2">
              {/* Table Dine-In Card */}
              <div
                data-testid="welcome-dine-in"
                onClick={() => {
                  if (!(checkingTables || qrDisabled || (Boolean(qrParam) && !hasScannedTable()))) {
                    handleSelectOrderType(DINE_IN);
                  }
                }}
                className="p-3 rounded-4 d-flex align-items-center justify-content-between text-start cursor-pointer transition-all shadow-xs"
                style={{
                  cursor: (checkingTables || qrDisabled || (Boolean(qrParam) && !hasScannedTable())) ? 'not-allowed' : 'pointer',
                  border: '2px solid #F20D2D',
                  backgroundColor: '#FFF5F5',
                  opacity: (checkingTables || qrDisabled || (Boolean(qrParam) && !hasScannedTable())) ? 0.6 : 1
                }}
              >
                <div className="d-flex align-items-center gap-3">
                  <div 
                    className="rounded-3 d-flex align-items-center justify-content-center flex-shrink-0"
                    style={{ width: '48px', height: '48px', backgroundColor: '#FFE4E6', color: '#F20D2D' }}
                  >
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M4 18v3" /><path d="M20 18v3" /><path d="M2 14h20" /><path d="M4 14V8a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v6" />
                      <path d="M6 14v4" /><path d="M18 14v4" />
                    </svg>
                  </div>
                  <div>
                    <div className="fw-bold text-dark fs-6">Table Dine-in</div>
                    <span className="text-secondary small d-block mt-0.5" style={{ fontSize: '12px', color: '#64748B' }}>
                      {checkingTables
                        ? 'Checking tables…'
                        : qrParam && !hasScannedTable()
                          ? (qrDisabled ? 'This table QR cannot be used' : 'Confirming this table…')
                          : tableNum && String(tableNum).toLowerCase() !== 'takeaway' && (qrParam || hasScannedTable())
                            ? `Dine in at table ${formatCompactTableLabel(tableNum)}`
                            : 'Dine at our restaurant and enjoy the experience'}
                    </span>
                  </div>
                </div>
                <div className="text-danger ps-2">
                  <FiCheckCircle size={22} style={{ fill: '#F20D2D', color: '#FFFFFF' }} />
                </div>
              </div>

              {/* Takeaway Card */}
              <div
                data-testid="welcome-takeaway"
                onClick={() => handleSelectOrderType(TAKEAWAY)}
                className="p-3 rounded-4 d-flex align-items-center justify-content-between text-start cursor-pointer transition-all shadow-xs"
                style={{
                  cursor: 'pointer',
                  border: '2px solid #E2E8F0',
                  backgroundColor: '#FFFFFF'
                }}
              >
                <div className="d-flex align-items-center gap-3">
                  <div 
                    className="rounded-3 d-flex align-items-center justify-content-center flex-shrink-0"
                    style={{ width: '48px', height: '48px', backgroundColor: '#F1F5F9', color: '#F20D2D' }}
                  >
                    <FiShoppingBag size={24} />
                  </div>
                  <div>
                    <div className="fw-bold text-dark fs-6">Takeaway</div>
                    <span className="text-secondary small d-block mt-0.5" style={{ fontSize: '12px', color: '#64748B' }}>
                      Pick up your order and enjoy it anywhere
                    </span>
                  </div>
                </div>
              </div>
            </div>"""

if old_dining_section in code:
    code = code.replace(old_dining_section, new_dining_section)
    print("Welcome.jsx updated!")
else:
    old_crlf = old_dining_section.replace('\n', '\r\n')
    new_crlf = new_dining_section.replace('\n', '\r\n')
    if old_crlf in code:
        code = code.replace(old_crlf, new_crlf)
        print("Welcome.jsx updated (CRLF)!")
    else:
        print("Warning: old_dining_section not found in Welcome.jsx")

with open('frontend/src/pages/customer/Welcome.jsx', 'w', encoding='utf-8') as f:
    f.write(code)
