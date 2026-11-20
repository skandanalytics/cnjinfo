import React, { useState, useEffect } from 'react';
import Modal from '../common/Modal';
import { FiShoppingBag, FiCheckCircle } from 'react-icons/fi';
import { resolvePublicBranchId, availableTables } from '../../services/customerCheckout';

export const OrderTypeModal = ({ isOpen, onSelectType, dineInAvailable = true }) => {
  const [selected, setSelected] = useState('DINE_IN');
  const [allTables, setAllTables] = useState([]);
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
            const rows = list || [];
            setAllTables(rows);
            const avail = rows.filter(t => 
              t.available === true || 
              t.status === 'AVAILABLE' || 
              t.status === 'Available' || 
              t.is_available === true
            );
            setOpenTables(avail);
            if (avail.length > 0) {
              const savedTableId = sessionStorage.getItem('foodie_selected_table') || localStorage.getItem('foodie_selected_table');
              const foundSaved = avail.find(t => String(t.id) === String(savedTableId));
              setSelectedTable(foundSaved || avail[0]);
            } else {
              setSelectedTable(null);
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
          Choose Option
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
          <div>
            <div className="fw-bold text-dark fs-6">Table Dine-in</div>
            <div className="text-secondary small mt-0.5" style={{ fontSize: '12px', color: '#64748B' }}>
              Dine at our restaurant and enjoy the experience
            </div>
          </div>
        </div>

        {/* Available Table Selector (Shown when Table Dine-in is selected) */}
        {selected === 'DINE_IN' && (
          <div className="text-start mb-3 p-3 rounded-4 bg-light border border-light-subtle shadow-2xs">
            <div className="d-flex align-items-center justify-content-between mb-2">
              <span className="fw-bold text-dark small" style={{ fontSize: '13px' }}>
                Your Table
              </span>
              <span className="badge rounded-pill bg-success-subtle text-success fw-semibold" style={{ fontSize: '11px' }}>
                {tablesLoading ? 'Checking tables...' : `${openTables.length} Available`}
              </span>
            </div>

            {tablesLoading ? (
              <div className="py-2 text-center text-muted small">Loading tables...</div>
            ) : allTables.length === 0 ? (
              <div className="p-2.5 text-center text-danger small rounded-3 bg-white border border-danger-subtle">
                No dining tables found for this branch.
              </div>
            ) : (
              <div>
                {/* Responsive grid of compact numeric table cards */}
                <div className="row row-cols-4 g-2 pt-1">
                  {allTables.map(t => {
                    const rawNum = String(t.table_number || t.number || t.id || '');
                    const cleanNum = rawNum.replace(/\D/g, '') || rawNum;
                    const isAvail = t.available === true || t.status === 'AVAILABLE' || t.status === 'Available' || t.is_available === true;
                    const isSelected = selectedTable && String(selectedTable.id) === String(t.id);

                    return (
                      <div key={t.id} className="col">
                        <button
                          type="button"
                          disabled={!isAvail}
                          onClick={() => isAvail && setSelectedTable(t)}
                          className={`btn w-100 p-0 rounded-3 text-center transition-all d-flex align-items-center justify-content-center ${
                            isSelected
                              ? 'btn-danger text-white shadow-sm'
                              : isAvail
                              ? 'btn-outline-secondary bg-white text-dark'
                              : 'btn-light text-muted opacity-40'
                          }`}
                          style={{
                            height: '52px',
                            border: isSelected ? '2px solid #F20D2D' : isAvail ? '1.5px solid #CBD5E1' : '1px dashed #CBD5E1',
                            backgroundColor: isSelected ? '#F20D2D' : isAvail ? '#FFFFFF' : '#F1F5F9',
                            cursor: isAvail ? 'pointer' : 'not-allowed',
                            fontSize: '17px',
                            fontWeight: isSelected ? '700' : '600',
                          }}
                          title={isAvail ? `Table ${cleanNum} (${t.capacity || 4} Seats)` : `Table ${cleanNum} (Occupied)`}
                        >
                          <span>{cleanNum}</span>
                        </button>
                      </div>
                    );
                  })}
                </div>
                {selectedTable && (
                  <div className="mt-2.5 small text-secondary d-flex align-items-center justify-content-between">
                    <div>
                      <span className="text-dark fw-bold">Selected: </span>
                      <span className="fw-semibold text-danger">
                        Table {String(selectedTable.table_number || selectedTable.id).replace(/\D/g, '') || selectedTable.table_number}
                      </span>
                      <span className="text-muted ms-1">({selectedTable.location || 'Indoor'}, {selectedTable.capacity || 4} Seats)</span>
                    </div>
                  </div>
                )}
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
