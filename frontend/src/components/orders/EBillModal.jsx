import React, { useState } from 'react';
import Modal from '../common/Modal';
import Button from '../common/Button';
import { FiDownload, FiPrinter } from 'react-icons/fi';
import { isStaffScreen } from '../../services/staffClient';

const PAYMENT_STATUS_LABEL = {
  PAID: 'Paid',
  UNPAID: 'Unpaid',
  PENDING: 'Payment pending',
  FAILED: 'Payment failed',
  REFUNDED: 'Refunded',
};

const money = (value) => {
  const amount = Number(value || 0);
  const formatted = `₹${Math.abs(Number.isFinite(amount) ? amount : 0).toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
  return amount < 0 ? `-${formatted}` : formatted;
};

const discount = (value) => money(-Math.abs(Number(value || 0)));

const Row = ({ label, value, emphasis = false }) => (
  <div className={`d-flex justify-content-between gap-3 ${emphasis ? 'fw-bold text-danger' : ''}`} style={{ fontSize: emphasis ? '16px' : '12.5px' }}>
    <span className={emphasis ? '' : 'text-secondary'}>{label}</span>
    <span className="text-end">{value}</span>
  </div>
);

export const EBillModal = ({ isOpen, order, onClose }) => {
  const [downloadingPdf, setDownloadingPdf] = useState(false);

  if (!order) return null;

  const statusText = String(order.backendStatus || order.status || '');
  const isCompleted = ['COMPLETED', 'DELIVERED', 'DONE', 'SETTLED'].includes(statusText.toUpperCase());
  const paymentCode = String(order.payment_status || order.paymentStatus || 'UNPAID').toUpperCase();
  const paymentLabel = PAYMENT_STATUS_LABEL[paymentCode] || paymentCode;
  const methodName = order.paymentMethodName || (
    order.payment_method && !['UNPAID', 'PAID', 'PENDING', 'FAILED', 'REFUNDED', 'SUCCESS'].includes(String(order.payment_method).toUpperCase())
      ? order.payment_method
      : ''
  );

  const handleDownloadPDF = async () => {
    if (!isCompleted) return;
    setDownloadingPdf(true);
    try {
      const { downloadInvoice, isStaffScreen } = await import('../../services/adminApi');
      if (isStaffScreen()) {
        await downloadInvoice(order);
      } else {
        const { downloadCustomerInvoice } = await import('../../services/customerCheckout');
        await downloadCustomerInvoice(order);
      }
    } catch (e) {
      window.alert(e.message || 'The invoice could not be downloaded.');
    }
    setDownloadingPdf(false);
  };

  const isTakeaway = order.order_type === 'TAKEAWAY'
    || order.orderType === 'Takeaway'
    || String(order.table || '').toLowerCase() === 'takeaway';
  const subtotal = Number(order.subtotal ?? order.items_subtotal ?? 0);
  const dishDiscount = Number(order.dish_discount_total || 0);
  const couponDiscount = Number(order.coupon_discount_total || 0);
  const addonTotal = Number(order.customization_total ?? 0);
  const packingCharge = Number(order.takeaway_charge ?? order.packingCharge ?? 0);
  const tax = Number(order.gst_amount ?? order.tax ?? 0);
  const serviceCharge = Number(order.service_charge_amount ?? order.serviceCharge ?? 0);
  const roundOff = Number(order.round_off ?? order.roundOff ?? 0);
  const grandTotal = Number(order.total ?? order.total_amount ?? 0);
  const restaurantName = order.branchName || order.branch_name || 'Foodie';
  const addressParts = [order.branchAddress, order.branchCity].filter(Boolean);
  const orderNo = order.orderNumber || order.order_number || '';
  const invoiceNo = (isCompleted && orderNo) ? `INV-${orderNo}` : (order.invoice_number || '');
  const when = [order.date, order.time].filter(Boolean).join(' · ')
    || (order.created_at ? new Date(order.created_at).toLocaleString('en-IN') : '');
  const customerName = order.customerName || order.customer_name || '';
  const customerPhone = order.customerPhone || order.customer_phone || '';

  const printInvoice = () => {
    const source = document.getElementById('foodie-invoice-sheet');
    if (!source) return;
    const existing = document.getElementById('foodie-print-root');
    if (existing) existing.remove();
    const root = document.createElement('div');
    root.id = 'foodie-print-root';
    root.appendChild(source.cloneNode(true));
    document.body.appendChild(root);
    document.body.classList.add('foodie-printing');
    let cleaned = false;
    const cleanup = () => {
      if (cleaned) return;
      cleaned = true;
      document.body.classList.remove('foodie-printing');
      root.remove();
      window.removeEventListener('afterprint', cleanup);
    };
    window.addEventListener('afterprint', cleanup);
    window.print();
  };

  return (
    <Modal
      isOpen={isOpen}
      title="Tax Invoice"
      onClose={onClose}
      size="lg"
      footerActions={
        <div className="d-flex align-items-center justify-content-between w-100 gap-2 flex-wrap">
          <Button variant="light" onClick={onClose} className="rounded-pill px-4">Close</Button>
          <div className="d-flex gap-2">
            {isStaffScreen() && (
              <Button variant="light" onClick={printInvoice} className="rounded-pill px-3 d-flex align-items-center gap-2 foodie-no-print">
                <FiPrinter /> Print Bill
              </Button>
            )}
            {isCompleted && (
              <Button
                variant="primary"
                onClick={handleDownloadPDF}
                loading={downloadingPdf}
                className="rounded-pill px-3 d-flex align-items-center gap-2"
              >
                <FiDownload /> Download Bill
              </Button>
            )}
          </div>
        </div>
      }
    >
      <div id="foodie-invoice-sheet" className="foodie-invoice">
        <div className="foodie-invoice-head">
          <div className="foodie-invoice-brand">FOODIE</div>
          <div className="foodie-invoice-kicker">TAX INVOICE</div>
        </div>

        <div className="foodie-invoice-meta">
          <div>
            <div className="fw-bold">{restaurantName}</div>
            {addressParts.length > 0 && <div>{addressParts.join(', ')}</div>}
            {order.branchPhone ? <div>{order.branchPhone}</div> : null}
            {order.branchEmail ? <div>{order.branchEmail}</div> : null}
          </div>
          <div className="text-end">
            {invoiceNo ? <div className="fw-bold">{invoiceNo}</div> : null}
            {orderNo ? <div>{invoiceNo ? `Order ${orderNo}` : orderNo}</div> : null}
            {when ? <div>{when}</div> : null}
            <div>{isTakeaway ? 'Takeaway' : `Table ${order.table || order.tableNumber || '—'}`}</div>
            {customerName ? <div>{customerName}</div> : null}
            {customerPhone ? <div>{customerPhone}</div> : null}
          </div>
        </div>

        <table className="foodie-invoice-items">
          <thead>
            <tr>
              <th>Item</th>
              <th className="text-center">Qty</th>
              <th className="text-end">Unit price</th>
              <th className="text-end">Amount</th>
            </tr>
          </thead>
          <tbody>
            {(order.items || []).map((item, index) => (
              <tr key={item.id || index}>
                <td>
                  <div className="fw-semibold">{item.name || 'Dish'}</div>
                  {Array.isArray(item.customizations) && item.customizations.length > 0 && (
                    <div className="foodie-invoice-extra">
                      {item.customizations.map((extra) => (
                        extra?.extra_price ? `${extra.name} (+${money(extra.extra_price)})` : extra?.name
                      )).filter(Boolean).join(', ')}
                    </div>
                  )}
                </td>
                <td className="text-center">{item.quantity || 1}</td>
                <td className="text-end">{money(item.price || 0)}</td>
                <td className="text-end">{money(item.lineTotal != null ? item.lineTotal : (item.price || 0) * (item.quantity || 1))}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="foodie-invoice-totals">
          <Row label="Subtotal" value={money(subtotal)} />
          <Row label="Add-on charges" value={money(addonTotal)} />
          <Row label="Menu discounts" value={discount(dishDiscount)} />
          <Row label="Coupon discounts" value={discount(couponDiscount)} />
          {(isTakeaway || packingCharge !== 0) && <Row label="Takeaway charges" value={money(packingCharge)} />}
          <Row label="Taxable amount" value={money(order.taxable_amount ?? 0)} />
          <Row label={order.gst_rate != null && order.gst_rate !== '' ? `GST (${order.gst_rate}%)` : 'GST'} value={money(tax)} />
          <Row
            label={`Service charge (${order.service_charge_rate != null && order.service_charge_rate !== '' ? order.service_charge_rate : 0}%)`}
            value={money(serviceCharge)}
          />
          <Row label="Round-off" value={money(roundOff)} />
          <Row label="Grand total" value={money(grandTotal)} emphasis />
        </div>

        <div className="foodie-invoice-pay">
          <div><span>Payment status</span><strong>{paymentLabel}</strong></div>
          {methodName ? <div><span>Payment method</span><strong>{methodName}</strong></div> : null}
        </div>
        <p className="foodie-invoice-foot">Thank you for dining with Foodie.</p>
        <p className="foodie-invoice-foot">Computer-generated invoice from the saved order.</p>
      </div>
    </Modal>
  );
};

export default EBillModal;
