import React, { useState } from 'react';
import Modal from '../common/Modal';
import Button from '../common/Button';
import formatCurrency from '../../utils/formatCurrency';
import amountToWords from '../../utils/numberToWords';
import { FiDownload } from 'react-icons/fi';

export const EBillModal = ({ isOpen, order, onClose }) => {
  const [downloadingPdf, setDownloadingPdf] = useState(false);

  if (!order) return null;

  const handleDownloadPDF = async () => {
    const status = String(order.status || '').toLowerCase();
    if (status !== 'completed') {
      window.alert('The invoice is not ready until the order is completed.');
      return;
    }
    setDownloadingPdf(true);
    try {
      const { downloadInvoice } = await import('../../services/adminApi');
      await downloadInvoice(order);
    } catch (e) {
      window.alert(e.message || 'The invoice could not be downloaded.');
    }
    setDownloadingPdf(false);
  };

  const isTakeaway = order.orderType === 'Takeaway' || order.table === 'Takeaway' || String(order.table).toLowerCase() === 'takeaway';
  const totalItemCount = (order.items || []).reduce((s, i) => s + (parseInt(i.quantity) || 1), 0) || 1;

  const subtotal = Number(order.subtotal ?? order.items_subtotal ?? 0);
  const discount = Number(order.discount || 0);
  const packingCharge = Number(order.takeaway_charge ?? order.packingCharge ?? 0);
  const deliveryFee = Number(order.deliveryFee || order.delivery_fee || 0);
  const tax = Number(order.gst_amount ?? order.tax ?? 0);
  const serviceCharge = Number(order.service_charge_amount ?? order.serviceCharge ?? 0);
  const gstLabel = order.gst_rate != null && order.gst_rate !== '' ? `GST (${order.gst_rate}%)` : 'GST';
  const serviceLabel = order.service_charge_rate != null && order.service_charge_rate !== ''
    ? `SERVICE CHARGE (${order.service_charge_rate}%)`
    : 'SERVICE CHARGE';
  const grandTotal = Number(order.total ?? order.total_amount ?? 0);

  const restaurantInfo = {
    name: order.branchName || 'Foodie',
    address: order.branchAddress || '',
    hours: '',
  };

  const deliveryAddress = order.deliveryAddress || order.address || (isTakeaway ? "Counter Pickup (Takeaway)" : `Table ${order.table || order.tableNumber || 'T01'} (Dine-In)`);
  const paymentMethod = order.paymentMethod || order.payment_method || 'Pay on Counter (COD)';

  const paymentStatusText = String(order.payment_status || order.paymentStatus || 'UNPAID');
  const paymentBadgeClass = paymentStatusText === 'PAID' || paymentStatusText === 'Success'
    ? 'bg-success-subtle text-success border-success-subtle'
    : paymentStatusText.includes('FAIL')
    ? 'bg-danger-subtle text-danger border-danger-subtle'
    : 'bg-warning-subtle text-warning border-warning-subtle';

  return (
    <Modal
      isOpen={isOpen}
      title={`RECEIPT — Order #${order.id || order.order_id || ''}`}
      onClose={onClose}
      size="md"
      footerActions={
        <div className="d-flex align-items-center justify-content-between w-100 gap-2 flex-wrap">
          <Button variant="light" onClick={onClose} className="rounded-pill px-4">
            Close
          </Button>
          {(() => {
            const st = String(order.status || '').toUpperCase();
            const isCompleted = ['COMPLETED', 'DELIVERED', 'DONE', 'SETTLED'].includes(st);
            
            const canDownload = isCompleted;

            if (canDownload) {
              return (
                <Button
                  variant="primary"
                  onClick={handleDownloadPDF}
                  loading={downloadingPdf}
                  className="rounded-pill px-4 d-flex align-items-center gap-2"
                  title="Download E-Bill PDF"
                >
                  <FiDownload /> Download PDF
                </Button>
              );
            }
            
            return null;
          })()}
        </div>
      }
    >
      <div className="p-1 text-start" style={{ fontFamily: 'system-ui, -apple-system, sans-serif' }}>
        {/* RECEIPT HEADER */}
        <div className="text-center mb-3 pb-2 border-bottom">
          <h4 className="fw-extrabold text-danger mb-0 letter-spacing-1">RECEIPT</h4>
          <div className="fw-bold text-dark fs-6 mt-1">Order #{order.id || order.order_id}</div>
          <span className={`badge border fw-semibold rounded-pill px-3 py-1 mt-1 ${paymentBadgeClass}`} style={{ fontSize: '11px' }}>
            Payment: {paymentStatusText}
          </span>
          <div className="text-muted small mt-1" style={{ fontSize: '11px' }}>
            {order.date || new Date().toLocaleDateString('en-IN')} {order.time ? `| ${order.time}` : ''}
          </div>
        </div>

        {/* DELIVERY / DINING ADDRESS */}
        <div className="bg-light p-2.5 rounded-3 mb-2 small border border-light-subtle">
          <div className="fw-bold text-uppercase text-secondary mb-1" style={{ fontSize: '10px', letterSpacing: '0.5px' }}>
            DELIVERY / DINING LOCATION
          </div>
          <div className="fw-bold text-dark" style={{ fontSize: '12.5px' }}>{deliveryAddress}</div>
        </div>

        {/* CUSTOMER INFO */}
        {(order.customerPhone || order.phone || (order.user && order.user.phone)) && (
          <div className="bg-light p-2.5 rounded-3 mb-2 small border border-light-subtle">
            <div className="fw-bold text-uppercase text-secondary mb-1" style={{ fontSize: '10px', letterSpacing: '0.5px' }}>
              CUSTOMER MOBILE
            </div>
            <div className="fw-bold text-dark font-monospace" style={{ fontSize: '12.5px' }}>
              {(() => {
                const phone = order.customerPhone || order.phone || order.user?.phone || '';
                const p = String(phone).replace(/\D/g, '');
                if (p.length >= 10) {
                  return p.slice(0, 2) + 'XXXXXX' + p.slice(-2);
                }
                return p ? p.slice(0, 1) + 'XXXXX' + p.slice(-1) : 'N/A';
              })()}
            </div>
          </div>
        )}

        {/* PREPARED BY */}
        <div className="bg-light p-2.5 rounded-3 mb-3 small border border-light-subtle">
          <div className="fw-bold text-uppercase text-secondary mb-1" style={{ fontSize: '10px', letterSpacing: '0.5px' }}>
            PREPARED BY
          </div>
          <div className="fw-bold text-dark">{restaurantInfo.name}</div>
          {restaurantInfo.address ? (
            <div className="text-secondary small" style={{ fontSize: '11px' }}>{restaurantInfo.address}</div>
          ) : null}
        </div>

        <hr className="my-3 border-dashed" />

        {/* ITEM COUNT & ITEMS TABLE */}
        <div className="d-flex align-items-center justify-content-between mb-2">
          <span className="fw-bold text-dark small text-uppercase" style={{ fontSize: '11px', letterSpacing: '0.5px' }}>
            ITEMS ({totalItemCount} {totalItemCount === 1 ? 'ITEM' : 'ITEMS'})
          </span>
        </div>

        <div className="border rounded-3 p-2.5 mb-3 bg-white shadow-xs">
          {(order.items || []).length > 0 ? (
            (order.items || []).map((item, idx) => (
              <div key={idx} className="py-2 border-bottom border-light last-border-0">
                <div className="d-flex align-items-start justify-content-between small">
                  <div className="me-2" style={{ maxWidth: '75%' }}>
                    <span className="fw-bold text-dark">{item.name || 'Dish Item'}</span>
                    <span className="text-muted ms-2 fw-semibold">x{item.quantity || 1}</span>
                    {item.instructions && (
                      <div className="text-secondary small fst-italic mt-0.5" style={{ fontSize: '10.5px' }}>
                        {item.instructions}
                      </div>
                    )}
                  </div>
                  <span className="fw-bold text-dark ms-auto">{formatCurrency(item.lineTotal != null ? item.lineTotal : (item.price || 0) * (item.quantity || 1))}</span>
                </div>

                {/* Combo / Bundle Included Items */}
                {Array.isArray(item.includedItems || item.comboItems) && (item.includedItems || item.comboItems).length > 0 && (
                  <div className="ms-3 mt-1.5 p-1.5 bg-light rounded-2 border-start border-3 border-danger small">
                    <span className="fw-bold text-secondary d-block" style={{ fontSize: '10px' }}>Included in bundle:</span>
                    {(item.includedItems || item.comboItems).map((inc, iIdx) => (
                      <div key={iIdx} className="text-muted" style={{ fontSize: '10.5px' }}>
                        • {typeof inc === 'string' ? inc : inc.name}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))
          ) : (
            <div className="text-muted fst-italic small py-1">Standard Order Items</div>
          )}
        </div>

        {/* BILL BREAKDOWN */}
        <div className="border rounded-3 p-3 bg-light-subtle small shadow-xs">
          <div className="d-flex justify-content-between mb-1.5">
            <span className="text-secondary">SUBTOTAL</span>
            <span className="fw-bold text-dark">{formatCurrency(subtotal)}</span>
          </div>

          {discount > 0 && (
            <div className="d-flex justify-content-between mb-1.5 text-success">
              <span>DISCOUNT / COUPON</span>
              <span className="fw-bold">-{formatCurrency(discount)}</span>
            </div>
          )}

          {isTakeaway && packingCharge > 0 && (
            <div className="d-flex justify-content-between mb-1.5 text-dark">
              <span className="text-secondary">TAKEAWAY / PACKING CHARGE</span>
              <span className="fw-bold text-dark">+{formatCurrency(packingCharge)}</span>
            </div>
          )}

          <div className="d-flex justify-content-between mb-1.5">
            <span className="text-secondary">{gstLabel}</span>
            <span className="fw-bold text-dark">{formatCurrency(tax)}</span>
          </div>

          {deliveryFee > 0 && (
            <div className="d-flex justify-content-between mb-1.5">
              <span className="text-secondary">DELIVERY FEE</span>
              <span className="fw-bold text-dark">+{formatCurrency(deliveryFee)}</span>
            </div>
          )}

          <div className="d-flex justify-content-between mb-1.5">
            <span className="text-secondary">{serviceLabel}</span>
            <span className="fw-bold text-dark">+{formatCurrency(serviceCharge)}</span>
          </div>

          <hr className="my-2 border-secondary opacity-25" />

          {/* TOTAL (GST INCLUDED) */}
          <div className="d-flex justify-content-between align-items-center fw-bold text-danger fs-5 pt-1">
            <span>TOTAL (GST INCLUDED)</span>
            <span className="fs-4">{formatCurrency(grandTotal)}</span>
          </div>

          {/* AMOUNT IN WORDS */}
          <div className="mt-2.5 pt-2 border-top border-light-subtle bg-white p-2 rounded-2 border">
            <div className="fw-bold text-uppercase text-secondary mb-0.5" style={{ fontSize: '9.5px', letterSpacing: '0.5px' }}>
              AMOUNT IN WORDS
            </div>
            <div className="fw-bold text-dark" style={{ fontSize: '11.5px', lineHeight: '1.3' }}>
              {amountToWords(grandTotal)}
            </div>
          </div>
        </div>

        {/* PAYMENT METHOD */}
        <div className="mt-3 p-2.5 rounded-3 bg-light border border-light-subtle d-flex align-items-center justify-content-between small">
          <span className="text-secondary fw-semibold">PAYMENT METHOD:</span>
          <strong className="text-dark text-uppercase">{paymentMethod}</strong>
        </div>
      </div>
    </Modal>
  );
};

export default EBillModal;
