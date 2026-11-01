import React, { useState, useEffect } from 'react';
import Modal from '../common/Modal';
import { FiShoppingBag, FiCheckCircle } from 'react-icons/fi';
import { resolvePublicBranchId, availableTables } from '../../services/customerCheckout';

export const OrderTypeModal = ({ isOpen, onSelectType, dineInAvailable = true }) => {
  const [selected, setSelected] = useState('DINE_IN');
  const [openTables, setOpenTables] = useState([]);
  const [selectedTable, setSelectedTable] = useState(null);
  const [tablesLoading, setTablesLoading] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    let mounted = true;
    const fetchAvailable = async () => {
      setTablesLoading(true);
      try {
        const branchId = await resolvePublicBranchId();
        if (branchId) {
          const list = await availableTables(branchId);
          if (mounted) {
            const avail = (list || []).filter(t => 
              t.available === true || 
              t.status === 'AVAILABLE' || 
              t.status === 'Available' || 
              t.is_available === true
            );
            setOpenTables(avail);
            if (avail.length > 0) {
              // Pre-select saved table if still valid, otherwise default to first available
              const savedTableId = sessionStorage.getItem('foodie_selected_table') || localStorage.getItem('foodie_selected_table');
              const foundSaved = avail.find(t => String(t.id) === String(savedTableId));
              setSelectedTable(foundSaved || avail[0]);
            }
          }
        }
      } catch (err) {
        console.warn('Could not load available tables in OrderTypeModal:', err);
      } finally {
        if (mounted) setTablesLoading(false);
      }
    };

    fetchAvailable();
    return () => { mounted = false; };
  }, [isOpen]);

  if (!isOpen) return null;

  const handleConfirm = () => {
    if (selected === 'DINE_IN') {
      onSelectType('DINE_IN', selectedTable);
    } else {
      onSelectType('TAKEAWAY', null);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={() => {}}
      size="md"
    >
      <div className="p-3 text-center">
        {/* Circular Red Foodie Logo */}
        <div className="d-flex align-items-center justify-content-center gap-2 mb-2">
          <div 
            className="text-white d-flex align-items-center justify-content-center fw-bold shadow-xs"
            style={{ 
              width: '40px', 
              height: '40px', 
              borderRadius: '50%', 
              backgroundColor: '#F20D2D', 
              fontSize: '20px' 
            }}
          >
            F
          </div>
          <span className="fw-bold text-dark fs-4" style={{ letterSpacing: '-0.3px' }}>
            Foodie
          </span>
        </div>

        <h4 className="fw-bold text-dark mb-1" style={{ fontSize: '20px' }}>
          Choose Dining Option
        </h4>
        <p className="text-secondary small mb-3" style={{ fontSize: '13px', color: '#64748B' }}>
          How would you like to enjoy your food today?
        </p>

        {/* 1. Table Dine-in Card */}
        <div
          onClick={() => setSelected('DINE_IN')}
          className="p-3 rounded-4 mb-2 d-flex align-items-center justify-content-between text-start cursor-pointer transition-all shadow-xs"
          style={{
            cursor: 'pointer',
            border: `2px solid ${selected === 'DINE_IN' ? '#F20D2D' : '#E2E8F0'}`,
            backgroundColor: selected === 'DINE_IN' ? '#FFF5F5' : '#FFFFFF'
          }}
        >
          <div className="d-flex align-items-center gap-3">
            <div 
              className="rounded-3 d-flex align-items-center justify-content-center flex-shrink-0"
              style={{
                width: '48px',
                height: '48px',
                backgroundColor: selected === 'DINE_IN' ? '#FFE4E6' : '#F1F5F9',
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

          {selected === 'DINE_IN' && (
            <div className="text-danger ps-2">
              <FiCheckCircle size={22} style={{ fill: '#F20D2D', color: '#FFFFFF' }} />
            </div>
          )}
        </div>

        {/* Available Table Selector (Shown when Table Dine-in is selected) */}
        {selected === 'DINE_IN' && (
          <div className="text-start mb-3 p-3 rounded-4 bg-light border border-light-subtle shadow-2xs">
            <div className="d-flex align-items-center justify-content-between mb-2">
              <span className="fw-bold text-dark small" style={{ fontSize: '13px' }}>
                Select Your Dining Table
              </span>
              <span className="badge rounded-pill bg-success-subtle text-success fw-semibold" style={{ fontSize: '11px' }}>
                {tablesLoading ? 'Checking tables...' : `${openTables.length} Available`}
              </span>
            </div>

            {tablesLoading ? (
              <div className="py-2 text-center text-muted small">Loading available tables...</div>
            ) : openTables.length === 0 ? (
              <div className="p-2.5 text-center text-danger small rounded-3 bg-white border border-danger-subtle">
                No dining tables are currently available. Please select Takeaway or ask our staff.
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
                  aria-label="Choose dining table"
                >
                  {openTables.map(t => {
                    const num = t.table_number || t.number || `T${t.id}`;
                    const cleanNum = String(num).startsWith('T') ? String(num) : `T${num}`;
                    const loc = t.location || t.area || 'Indoor';
                    const cap = t.capacity || 4;
                    return (
                      <option key={t.id} value={t.id}>
                        {cleanNum} — {loc} ({cap} Seats)
                      </option>
                    );
                  })}
                </select>

                {/* Quick Selection Pills */}
                <div className="d-flex align-items-center gap-1.5 flex-wrap mt-2.5">
                  {openTables.slice(0, 8).map(t => {
                    const num = t.table_number || t.number || `T${t.id}`;
                    const cleanNum = String(num).startsWith('T') ? String(num) : `T${num}`;
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

        {/* 2. Takeaway Card */}
        <div
          onClick={() => setSelected('TAKEAWAY')}
          className="p-3 rounded-4 mb-4 d-flex align-items-center justify-content-between text-start cursor-pointer transition-all shadow-xs"
          style={{
            cursor: 'pointer',
            border: `2px solid ${selected === 'TAKEAWAY' ? '#F20D2D' : '#E2E8F0'}`,
            backgroundColor: selected === 'TAKEAWAY' ? '#FFF5F5' : '#FFFFFF'
          }}
        >
          <div className="d-flex align-items-center gap-3">
            <div 
              className="rounded-3 d-flex align-items-center justify-content-center flex-shrink-0"
              style={{
                width: '48px',
                height: '48px',
                backgroundColor: selected === 'TAKEAWAY' ? '#FFE4E6' : '#F1F5F9',
                color: '#F20D2D'
              }}
            >
              <FiShoppingBag size={24} />
            </div>
            <div>
              <div className="fw-bold text-dark fs-6">Takeaway</div>
              <div className="text-secondary small mt-0.5" style={{ fontSize: '12px', color: '#64748B' }}>
                Pick up your order and enjoy it anywhere
              </div>
            </div>
          </div>

          {selected === 'TAKEAWAY' && (
            <div className="text-danger ps-2">
              <FiCheckCircle size={22} style={{ fill: '#F20D2D', color: '#FFFFFF' }} />
            </div>
          )}
        </div>

        {/* Continue Button */}
        <button
          type="button"
          onClick={handleConfirm}
          disabled={selected === 'DINE_IN' && openTables.length === 0 && !tablesLoading}
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
    </Modal>
  );
};

export default OrderTypeModal;
