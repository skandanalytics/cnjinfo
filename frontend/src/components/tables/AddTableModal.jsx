import React, { useState, useEffect } from 'react';
import Modal from '../common/Modal';
import { FiMapPin, FiUsers } from 'react-icons/fi';
import { TABLE_LOCATIONS, TABLE_LOCATION_VALUES } from '../../constants/tableLocations';
import { getNextAvailableTableNumber } from '../../utils/tableUtils';

export const AddTableModal = ({
  isOpen,
  onClose,
  onAdd,
  existingTables = [],
}) => {
  const [numberDigits, setNumberDigits] = useState('');
  const [capacity, setCapacity] = useState('4');
  const [area, setArea] = useState('Indoor Main');
  const [status, setStatus] = useState('Available');
  const [errorMsg, setErrorMsg] = useState('');
  const [loading, setLoading] = useState(false);

  const areas = TABLE_LOCATIONS;

  const formatTableNumber = (rawDigits) => {
    const clean = String(rawDigits || '').replace(/\D/g, '').slice(0, 3);
    if (!clean) return '';
    const n = parseInt(clean, 10);
    if (n === 0) return '';
    if (clean.length === 1) {
      return `T0${clean}`;
    }
    return `T${clean}`;
  };

  useEffect(() => {
    if (isOpen) {
      const suggested = getNextAvailableTableNumber(existingTables);
      const digits = suggested.replace(/\D/g, '');
      setNumberDigits(digits);
      setCapacity('4');
      setArea('Indoor Main');
      setStatus('Available');
      setErrorMsg('');
    }
  }, [isOpen, existingTables]);

  const handleSubmit = async (e) => {
    if (e) e.preventDefault();
    if (loading) return;
    setErrorMsg('');

    const cleanDigits = String(numberDigits || '').replace(/\D/g, '').slice(0, 3);
    if (!cleanDigits) {
      setErrorMsg('Please enter a valid table number (e.g. 01, 08, 10, 100).');
      return;
    }

    const targetDigitsNum = parseInt(cleanDigits, 10);
    if (targetDigitsNum === 0) {
      setErrorMsg('Table number cannot be T00. Please enter a valid number (e.g. 01, 08, 10).');
      return;
    }

    const formattedNum = formatTableNumber(cleanDigits);

    // Check for duplicate table number against real table list in this branch
    const isDuplicate = (existingTables || []).some(t => {
      const raw = String(t.number || t.table_number || t.name || '').trim().toUpperCase();
      const cleanRaw = raw.replace(/^TABLE[\s-_]*/i, '').trim();
      const rawDigits = cleanRaw.replace(/\D/g, '');
      const parsedNum = rawDigits ? parseInt(rawDigits, 10) : null;
      
      const canonFormatted = cleanRaw.startsWith('T')
        ? cleanRaw
        : (parsedNum !== null ? (parsedNum < 10 ? `T0${parsedNum}` : `T${parsedNum}`) : cleanRaw);

      return (
        canonFormatted.toUpperCase() === formattedNum.toUpperCase() ||
        (parsedNum !== null && parsedNum === targetDigitsNum)
      );
    });

    if (isDuplicate) {
      setErrorMsg(`Table "${formattedNum}" already exists in this branch. Duplicate table numbers are not allowed.`);
      return;
    }

    if (!TABLE_LOCATION_VALUES.includes(area)) {
      setErrorMsg('Choose Indoor Main, Garden View, or Rooftop Terrace.');
      return;
    }

    const capNum = parseInt(capacity, 10);
    if (isNaN(capNum) || capNum <= 0) {
      setErrorMsg('Seating capacity must be at least 1 seat.');
      return;
    }
    if (capNum > 15) {
      setErrorMsg('Seating capacity cannot exceed 15 seats.');
      return;
    }

    setLoading(true);
    try {
      await onAdd({
        number: formattedNum,
        name: `Table ${formattedNum}`,
        capacity: capNum,
        area,
        location: area,
        status
      });
      setNumberDigits('');
      setCapacity('4');
      setStatus('Available');
      setErrorMsg('');
      onClose();
    } catch (err) {
      console.error("Error creating table:", err);
      const data = err.response?.data;
      let errMsg = '';

      if (data) {
        if (data.errors && typeof data.errors === 'object') {
          if (Array.isArray(data.errors.non_field_errors) && data.errors.non_field_errors.length > 0) {
            errMsg = data.errors.non_field_errors[0];
          } else {
            const firstKey = Object.keys(data.errors)[0];
            if (firstKey) {
              const val = data.errors[firstKey];
              errMsg = Array.isArray(val) ? `${firstKey}: ${val[0]}` : `${firstKey}: ${val}`;
            }
          }
        } else if (typeof data === 'string') {
          errMsg = data;
        } else if (Array.isArray(data)) {
          errMsg = data[0];
        } else if (typeof data === 'object') {
          const firstKey = Object.keys(data)[0];
          if (firstKey) {
            const val = data[firstKey];
            errMsg = Array.isArray(val) ? `${firstKey}: ${val[0]}` : `${firstKey}: ${val}`;
          }
        }
      }

      setErrorMsg(errMsg || err.message || 'Failed to add table. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const footerActions = (
    <div className="d-flex align-items-center justify-content-end gap-3 w-100">
      <button
        type="button"
        onClick={onClose}
        disabled={loading}
        className="btn rounded-pill px-4 fw-bold"
        style={{
          height: '42px',
          backgroundColor: '#FFFFFF',
          color: 'var(--primary-color, #F20D2D)',
          border: '1.5px solid var(--primary-color, #F20D2D)',
          fontSize: '13px'
        }}
      >
        Cancel
      </button>
      <button
        type="button"
        onClick={handleSubmit}
        disabled={loading}
        className="btn btn-danger rounded-pill px-4 fw-bold shadow-sm border-0"
        style={{
          height: '42px',
          backgroundColor: 'var(--primary-color, #F20D2D)',
          fontSize: '13px'
        }}
      >
        {loading ? 'Adding...' : 'Add Table'}
      </button>
    </div>
  );

  const displayInputValue = () => {
    if (!numberDigits) return '';
    return formatTableNumber(numberDigits) || `T${numberDigits}`;
  };

  return (
    <Modal isOpen={isOpen} title="Add New Dining Table" onClose={onClose} footerActions={footerActions}>
      <form onSubmit={handleSubmit}>
        {errorMsg && (
          <div className="alert alert-danger py-2 small fw-semibold mb-3">{errorMsg}</div>
        )}

        <div className="row g-3 mb-3">
          <div className="col-6">
            <label className="form-label small fw-semibold text-secondary mb-1">
              Table Number <span className="text-danger">*</span>
            </label>
            <input 
              type="text"
              className="form-control rounded-3 py-2 fw-semibold text-dark"
              style={{ fontSize: '13.5px', borderColor: '#CBD5E1' }}
              placeholder="T08" 
              value={displayInputValue()}
              onChange={(e) => {
                const val = e.target.value.replace(/\D/g, '').slice(0, 3);
                setNumberDigits(val);
                setErrorMsg('');
              }} 
              required 
            />
          </div>

          <div className="col-6">
            <label className="form-label small fw-semibold text-secondary mb-1">
              Seating Capacity <span className="text-danger">*</span>
            </label>
            <div className="position-relative">
              <FiUsers className="position-absolute text-muted" style={{ left: '12px', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', zIndex: 2 }} size={16} />
              <input 
                type="number"
                min={1}
                max={15}
                className="form-control rounded-3 py-2 fw-semibold text-dark"
                style={{ fontSize: '13.5px', borderColor: '#CBD5E1', paddingLeft: '38px' }}
                placeholder="4"
                value={capacity} 
                onChange={(e) => {
                  const raw = e.target.value.replace(/\D/g, '');
                  setCapacity(raw ? String(Math.min(15, parseInt(raw, 10))) : '');
                }}
                required 
              />
            </div>
          </div>
        </div>

        <div className="mb-3">
          <label className="form-label small fw-semibold text-secondary mb-1">
            Area / Location <span className="text-danger">*</span>
          </label>
          <div className="position-relative">
            <FiMapPin className="position-absolute text-muted" style={{ left: '12px', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', zIndex: 2 }} size={16} />
            <select 
              className="form-select rounded-3 py-2 fw-semibold text-dark"
              style={{ fontSize: '13.5px', borderColor: '#CBD5E1', paddingLeft: '38px' }}
              value={area}
              onChange={(e) => setArea(e.target.value)}
              required
            >
              {areas.map(a => (
                <option key={a.value || a} value={a.value || a}>{a.label || a}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="mb-3">
          <label className="form-label small fw-semibold text-secondary mb-1">
            Table Status <span className="text-danger">*</span>
          </label>
          <select 
            className="form-select rounded-3 py-2 fw-semibold text-dark"
            style={{ fontSize: '13.5px', borderColor: '#CBD5E1' }}
            value={status}
            onChange={(e) => setStatus(e.target.value)}
          >
            <option value="Available">● Available</option>
            <option value="Occupied">● Occupied</option>
          </select>
        </div>
      </form>
    </Modal>
  );
};
export default AddTableModal;
