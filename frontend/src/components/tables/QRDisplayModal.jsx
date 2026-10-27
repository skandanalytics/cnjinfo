import React, { useState, useEffect } from 'react';
import QRCode from 'qrcode';
import Modal from '../common/Modal';
import Button from '../common/Button';
import Loader from '../common/Loader';
import { FiPrinter, FiToggleLeft, FiToggleRight, FiAlertTriangle, FiGlobe } from 'react-icons/fi';
import { buildTableQrUrl, getQrBaseHost } from '../../utils/qrUrl';

export const QRDisplayModal = ({
  isOpen,
  onClose,
  table,
  onRefresh
}) => {
  const [qrRecord, setQrRecord] = useState(null);
  const [qrCode, setQrCode] = useState('');
  const [qrDataUrl, setQrDataUrl] = useState('');
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  
  const [customHost, setCustomHost] = useState(getQrBaseHost);
  const [isEditingHost, setIsEditingHost] = useState(false);
  const [tempHost, setTempHost] = useState(getQrBaseHost);

  // Sync state if modal reopens
  useEffect(() => {
    if (isOpen) {
      const host = getQrBaseHost();
      setCustomHost(host);
      setTempHost(host);
      setIsEditingHost(false);
    }
  }, [isOpen]);

  const { targetUrl, validation } = buildTableQrUrl({
    tableId: table?.id || table?.number,
    qrToken: qrCode,
    customHost
  });
  const qrImageUrl = qrDataUrl || (targetUrl ? `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(targetUrl)}` : '');

  const isHostLocal = validation.isLocalhost;

  useEffect(() => {
    if (!targetUrl) return;
    QRCode.toDataURL(targetUrl, {
      width: 400,
      margin: 2,
      color: {
        dark: '#000000',
        light: '#ffffff'
      }
    })
      .then(url => setQrDataUrl(url))
      .catch(err => {
        console.warn("Local QRCode generation error, fallback to API:", err);
      });
  }, [targetUrl]);

  const handleSaveHost = (e) => {
    if (e) e.preventDefault();
    const clean = (tempHost || '').trim().replace(/\/+$/, '');
    if (clean) {
      setCustomHost(clean);
      localStorage.setItem('foodie_network_host', clean);
    }
    setIsEditingHost(false);
  };

  const handleResetHost = () => {
    localStorage.removeItem('foodie_network_host');
    const auto = typeof window !== 'undefined' && window.location ? window.location.origin.replace(/\/+$/, '') : 'http://localhost:5173';
    setCustomHost(auto);
    setTempHost(auto);
    setIsEditingHost(false);
  };

  useEffect(() => {
    if (!table || !isOpen) return undefined;
    let active = true;
    setLoading(true);
    setErrorMsg('');
    setQrCode('');
    setQrRecord(null);
    import('../../services/staffClient').then(({ staffJson }) => staffJson(`/tables/${table.id}/`))
      .then((saved) => {
        if (!active) return;
        setQrCode(saved.qr_code || '');
        setQrRecord({
          id: saved.id,
          is_active: saved.qr_is_active !== false,
        });
      })
      .catch((err) => {
        if (!active) return;
        setQrRecord(null);
        setQrCode('');
        setErrorMsg(err.message || 'The saved QR status could not be loaded.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, [table, isOpen]);

  const handleToggleStatus = async () => {
    if (!table?.id || updating) return;
    setUpdating(true);
    setErrorMsg('');
    try {
      const { staffJson } = await import('../../services/staffClient');
      const saved = await staffJson(`/tables/${table.id}/`, {
        method: 'PATCH',
        body: JSON.stringify({ qr_is_active: !isActive }),
      });
      setQrRecord((prev) => ({ ...(prev || {}), id: table.id, is_active: saved.qr_is_active !== false }));
      if (onRefresh) onRefresh();
    } catch (err) {
      setErrorMsg(err.message || 'Unable to update the QR status.');
    }
    setUpdating(false);
  };

  const handlePrint = () => {
    const printWindow = window.open('', '_blank', 'width=600,height=700');
    if (!printWindow) return;
    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Table ${table?.number || table?.id} - QR Code</title>
          <style>
            body {
              font-family: Arial, sans-serif;
              text-align: center;
              padding: 40px;
              margin: 0;
            }
            .card {
              border: 3px solid #dc3545;
              border-radius: 20px;
              padding: 40px;
              max-width: 400px;
              margin: 0 auto;
              background-color: #ffffff;
            }
            h1 { color: #dc3545; font-size: 36px; margin-bottom: 5px; }
            h2 { font-size: 28px; margin-top: 5px; margin-bottom: 20px; color: #1e293b; }
            p { font-size: 16px; color: #64748b; margin-bottom: 25px; }
            img { width: 260px; height: 260px; margin-bottom: 20px; }
            .url { font-size: 11px; color: #94a3b8; word-break: break-all; margin-top: 10px; font-family: monospace; }
            .footer { font-size: 13px; color: #94a3b8; margin-top: 15px; }
          </style>
        </head>
        <body>
          <div class="card">
            <h1>Foodie</h1>
            <h2>TABLE ${table?.number || table?.id}</h2>
            <p>Scan to view menu & place your order</p>
            <img src="${qrImageUrl}" alt="Table QR Code" />
            <div class="url">${targetUrl}</div>
            <div class="footer">Powered by Foodie Digital Ordering</div>
          </div>
          <script>
            window.onload = function() {
              window.print();
              window.close();
            };
          </script>
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  if (!isOpen || !table) return null;

  const isActive = qrRecord ? qrRecord.is_active !== false : null;

  const footerActions = (
    <div className="d-flex align-items-center justify-content-between w-100 gap-2 flex-wrap">
      {qrRecord && (
        <Button
          variant="light"
          onClick={handleToggleStatus}
          disabled={updating || isActive === null}
          className="d-flex align-items-center gap-1.5 small fw-bold"
        >
          {isActive ? <FiToggleRight className="text-success fs-5" /> : <FiToggleLeft className="text-secondary fs-5" />}
          {isActive ? 'Disable QR' : 'Enable QR'}
        </Button>
      )}
      {isActive && qrCode && (
        <div className="d-flex align-items-center gap-2 ms-auto">
          <Button variant="primary" onClick={handlePrint} className="d-flex align-items-center gap-1.5 py-1.5 px-3">
            <FiPrinter /> Print Card
          </Button>
        </div>
      )}
    </div>
  );

  return (
    <Modal isOpen={isOpen} title={`Table ${table.number || table.id} QR Code`} onClose={onClose} footerActions={footerActions}>
      {loading ? (
        <div className="py-5 text-center">
          <Loader />
        </div>
      ) : (
        <div className="text-center py-2">
          {errorMsg && (
            <div className="alert alert-danger py-2 small fw-semibold mb-3">{errorMsg}</div>
          )}

          {isHostLocal && (
            <div className="alert alert-warning text-start small py-2 px-3 mb-3 d-flex align-items-start gap-2 border-warning-subtle">
              <FiAlertTriangle className="text-warning flex-shrink-0 mt-0.5 fs-5" />
              <div>
                <strong>Localhost Warning:</strong> You are accessing Foodie via <code>localhost</code>. Mobile phones scanning this QR code cannot reach localhost!
                <div className="mt-1">
                  To allow phone scanning, access Foodie via your computer's Wi-Fi IP (e.g. <code>http://192.168.x.x:5173</code>) or set your network host below.
                </div>
              </div>
            </div>
          )}

          <div className="d-flex align-items-center justify-content-center gap-2 mb-3">
            <span className="fw-bold text-dark fs-5">Table {table.number || table.id}</span>
            <span className={`badge rounded-pill ${isActive ? 'bg-success-subtle text-success border border-success-subtle' : 'bg-danger-subtle text-danger border border-danger-subtle'} px-3 py-1 fw-bold`} style={{ fontSize: '11px' }}>
              {qrRecord ? (isActive ? 'Active & Scannable' : 'Disabled') : 'Status unavailable'}
            </span>
          </div>

          {isActive ? (
            <>
              <div className="p-3 rounded-4 bg-light border border-light-subtle d-inline-block mb-2 shadow-sm position-relative">
                <img
                  src={qrImageUrl}
                  alt={`QR Code Table ${table.number || table.id}`}
                  className="img-fluid rounded-3"
                  style={{ width: '220px', height: '220px', objectFit: 'contain' }}
                />
              </div>

              {/* Network Host & URL Inspector */}
              <div className="p-2.5 rounded-3 bg-light border border-light-subtle text-start small mt-2">
                <div className="d-flex justify-content-between align-items-center mb-1">
                  <span className="text-muted fw-semibold d-flex align-items-center gap-1">
                    <FiGlobe className="text-primary" /> Target Network Host:
                  </span>
                  <button
                    type="button"
                    className="btn btn-link btn-sm p-0 text-decoration-none fw-semibold"
                    style={{ fontSize: '12px' }}
                    onClick={() => {
                      setIsEditingHost(!isEditingHost);
                      setTempHost(customHost);
                    }}
                  >
                    {isEditingHost ? 'Cancel' : 'Change Host'}
                  </button>
                </div>

                {isEditingHost ? (
                  <form onSubmit={handleSaveHost} className="d-flex gap-1.5 mt-2">
                    <input
                      type="text"
                      className="form-control form-control-sm"
                      value={tempHost}
                      onChange={(e) => setTempHost(e.target.value)}
                      placeholder="e.g. http://192.168.68.104:5173"
                    />
                    <button type="submit" className="btn btn-primary btn-sm px-2.5">
                      Save
                    </button>
                    <button
                      type="button"
                      className="btn btn-outline-secondary btn-sm px-2"
                      onClick={handleResetHost}
                      title="Reset to current browser origin"
                    >
                      Reset
                    </button>
                  </form>
                ) : (
                  <div className="text-truncate text-secondary font-monospace" style={{ fontSize: '11px' }} title={targetUrl}>
                    {targetUrl || 'Generating URL...'}
                  </div>
                )}
              </div>
            </>
          ) : (
            <p className="text-secondary small mb-0">This table QR code is disabled. Customers cannot start a new order by scanning it.</p>
          )}
        </div>
      )}
    </Modal>
  );
};

export default QRDisplayModal;
