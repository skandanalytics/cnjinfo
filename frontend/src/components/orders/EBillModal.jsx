import React, { useState, useEffect } from 'react';
import Modal from '../common/Modal';
import Button from '../common/Button';
import { FiDownload, FiPrinter } from 'react-icons/fi';
import { isStaffScreen } from '../../services/staffClient';
import { formatOrderDisplayNumber } from '../../utils/orderNumber';

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

export const EBillModal = ({ isOpen, order, onClose, onProceedToBill }) => {
  const [downloadingPdf, setDownloadingPdf] = useState(false);
  const [completingOrder, setCompletingOrder] = useState(false);
  const [finalizedSuccess, setFinalizedSuccess] = useState(false);
  const [previewData, setPreviewData] = useState(null);

  useEffect(() => {
    let isMounted = true;
    if (!isOpen || !order) {
      setPreviewData(null);
      return;
    }
    const orderId = order.backendOrderId || order.id || order.order_id;
    if (!orderId) return;

    (async () => {
      try {
        const { isStaffScreen } = await import('../../services/staffClient');
        if (isStaffScreen()) {
          const { fetchBillPreview } = await import('../../services/adminApi');
          const preview = await fetchBillPreview(orderId);
          if (isMounted && preview) setPreviewData(preview);
        } else {
          const { fetchCustomerBillPreview } = await import('../../services/customerCheckout');
          const rootId = order.parent_order_id || (typeof order.parent_order === 'object' ? order.parent_order?.id : order.parent_order) || orderId;
          const preview = await fetchCustomerBillPreview(rootId);
          if (isMounted && preview) setPreviewData(preview);
        }
      } catch (err) {
        // Silently fall back to provided order data
        console.warn('EBillModal could not fetch authoritative bill preview:', err);
      }
    })();

    return () => { isMounted = false; };
  }, [order?.id, order?.backendOrderId, isOpen]);

  useEffect(() => {
    setFinalizedSuccess(false);
  }, [order?.id, isOpen]);

  if (!order) return null;

  const statusText = String(order.backendStatus || order.status || '');
  const isCompleted = ['COMPLETED', 'DELIVERED', 'DONE', 'SETTLED'].includes(statusText.toUpperCase());
  const isFinalized = isCompleted || finalizedSuccess;
  const isConfirmedPaid = Boolean(
    order.is_paid ||
    order.isPaid ||
    String(order.payment_status || order.paymentStatus || '').toUpperCase() === 'PAID' ||
    String(order.status || '').toUpperCase() === 'SETTLED'
  );
  const paymentCode = isConfirmedPaid ? 'PAID' : String(order.payment_status || order.paymentStatus || 'UNPAID').toUpperCase();
  const paymentLabel = PAYMENT_STATUS_LABEL[paymentCode] || (paymentCode === 'PAID' ? 'Paid' : 'Unpaid');
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

  const activeSource = previewData ? {
    ...order,
    ...previewData,
    items: previewData.items || order.items,
    combined_items: previewData.items || order.combined_items,
    subtotal: previewData.items_subtotal || order.subtotal || order.items_subtotal,
    dish_discount_total: previewData.dish_discount_total || order.dish_discount_total,
    coupon_discount_total: previewData.coupon_discount_total || order.coupon_discount_total,
    customization_total: previewData.customization_total || order.customization_total,
    takeaway_charge: previewData.takeaway_charge || order.takeaway_charge,
    gst_amount: previewData.gst_amount || order.gst_amount,
    service_charge_amount: previewData.service_charge_amount || order.service_charge_amount,
    round_off: previewData.round_off || order.round_off,
    total: previewData.total_amount || order.total || order.total_amount,
    total_amount: previewData.total_amount || order.total_amount || order.total,
    has_continuations: previewData.has_continuations ?? order.has_continuations,
    display_order_number: previewData.display_order_number || order.display_order_number || order.orderNumber,
  } : order;

  const isTakeaway = activeSource.order_type === 'TAKEAWAY'
    || activeSource.orderType === 'Takeaway'
    || String(activeSource.table || '').toLowerCase() === 'takeaway';
  const subtotal = Number(activeSource.subtotal ?? activeSource.items_subtotal ?? 0);
  const dishDiscount = Number(activeSource.dish_discount_total || 0);
  const couponDiscount = Number(activeSource.coupon_discount_total || 0);
  const addonTotal = Number(activeSource.customization_total ?? 0);
  const packingCharge = Number(activeSource.takeaway_charge ?? activeSource.packingCharge ?? 0);
  const tax = Number(activeSource.gst_amount ?? activeSource.tax ?? 0);
  const serviceCharge = Number(activeSource.service_charge_amount ?? activeSource.serviceCharge ?? 0);
  const roundOff = Number(activeSource.round_off ?? activeSource.roundOff ?? 0);
  const grandTotal = Number(activeSource.total ?? activeSource.total_amount ?? 0);
  const restaurantName = activeSource.branchName || activeSource.branch_name || (typeof activeSource.branch === 'object' ? activeSource.branch?.name : '') || 'Foodie';
  const addressParts = [
    activeSource.branchAddress || (typeof activeSource.branch === 'object' ? activeSource.branch?.address : ''),
    activeSource.branchCity || (typeof activeSource.branch === 'object' ? activeSource.branch?.city : '')
  ].filter(Boolean);
  const orderNo = formatOrderDisplayNumber(activeSource, activeSource.id || '');
  const invoiceNo = (isFinalized && orderNo) ? `INV-${orderNo}` : (activeSource.invoice_number || '');
  const when = [activeSource.date, activeSource.time].filter(Boolean).join(' · ')
    || (activeSource.placed_at || (activeSource.created_at ? new Date(activeSource.created_at).toLocaleString('en-IN') : ''));
  const customerName = activeSource.customerName || activeSource.customer_name || '';
  const customerPhone = activeSource.customerPhone || activeSource.customer_phone || '';

  const handleProceedToBill = async () => {
    if (completingOrder || isFinalized) return;
    try {
      setCompletingOrder(true);
      if (onProceedToBill) {
        await onProceedToBill(order);
        setFinalizedSuccess(true);
        return;
      }

      const targetId = order.backendOrderId || order.id || order.order_id;
      if (!targetId) return;

      const { isStaffScreen } = await import('../../services/staffClient');
      if (isStaffScreen()) {
        const { proceedToBill } = await import('../../services/adminApi');
        await proceedToBill(targetId);
        setFinalizedSuccess(true);
        window.alert(`Order #${orderNo || targetId} marked as Completed.`);
        return;
      } else {
        const { proceedOrderToBill } = await import('../../services/customerCheckout');
        await proceedOrderToBill(targetId);
        setFinalizedSuccess(true);
        if (typeof window !== 'undefined') {
          window.location.href = `/customer/order-confirmation?order=${targetId}&proceedToBill=1`;
        }
        return;
      }
    } catch (err) {
      console.error('Could not complete order on Proceed to Bill:', err);
      const msg = err?.response?.data?.detail || err?.message || 'Could not complete order.';
      window.alert(msg);
      return;
    } finally {
      setCompletingOrder(false);
    }
  };

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
      title="Tax Invoice (E-Bill)"
      onClose={onClose}
      size="lg"
      footerActions={
        <div className="d-flex align-items-center justify-content-between w-100 gap-2 flex-wrap">
          <Button variant="outline" onClick={onClose} className="rounded-pill px-4">Close</Button>
          <div className="d-flex align-items-center gap-2 flex-wrap">
            <Button variant="outline" onClick={printInvoice} className="rounded-pill px-3 d-flex align-items-center gap-2 foodie-no-print">
              <FiPrinter /> Print Bill
            </Button>
            {isFinalized && (
              <button
                type="button"
                onClick={handleDownloadPDF}
                disabled={downloadingPdf}
                className="btn btn-danger rounded-pill px-4 py-2 fw-bold d-flex align-items-center gap-2 text-white shadow-xs"
                style={{ backgroundColor: '#F20D2D', borderColor: '#F20D2D', fontSize: '13px' }}
              >
                <FiDownload /> {downloadingPdf ? 'Downloading...' : 'Download Bill'}
              </button>
            )}
          </div>
        </div>
      }
    >
      <div id="foodie-invoice-sheet" className="foodie-invoice p-2">
        <div className="d-flex align-items-center justify-content-between border-bottom pb-3 mb-3">
          <div className="d-flex align-items-center gap-2">
            <span
              className="d-inline-flex align-items-center justify-content-center text-white fw-bold rounded-circle"
              style={{ width: '36px', height: '36px', backgroundColor: '#F20D2D', fontSize: '18px' }}
            >
              F
            </span>
            <span className="fw-bold fs-4 text-dark">Foodie</span>
          </div>
          <span className="badge rounded-pill px-3 py-1 bg-light text-secondary border fw-bold" style={{ fontSize: '11px', letterSpacing: '0.5px' }}>
            TAX INVOICE
          </span>
        </div>

        <div className="d-flex justify-content-between flex-wrap gap-3 mb-3 small">
          <div>
            <div className="fw-bold text-dark fs-6">{restaurantName}</div>
            {addressParts.length > 0 && <div className="text-secondary">{addressParts.join(', ')}</div>}
            <div className="text-secondary">GSTIN: {order.branchGst || '29ABCDE1234F1Z5'}</div>
            {order.branchPhone && <div className="text-secondary">{order.branchPhone}</div>}
          </div>
          <div className="text-end">
            <div className="fw-bold text-dark">{invoiceNo ? `Invoice No: ${invoiceNo}` : `Order: #${orderNo}`}</div>
            {orderNo && invoiceNo ? <div className="text-secondary">Order No: #{orderNo}</div> : null}
            {when ? <div className="text-secondary">Date: {when}</div> : null}
          </div>
        </div>

        {(customerName || customerPhone || order.table) && (
          <div className="p-2.5 rounded-3 bg-light-subtle border mb-3 small d-flex flex-wrap align-items-center justify-content-between gap-2">
            <div>
              {customerName && <span className="fw-semibold text-dark me-3">Customer: {customerName}</span>}
              {customerPhone && <span className="text-secondary">Mobile: +91 {customerPhone}</span>}
            </div>
            <div>
              <span className="fw-bold text-dark">{isTakeaway ? 'Takeaway' : `Dining Table: ${order.table || order.tableNumber || order.table_label || '—'}`}</span>
            </div>
          </div>
        )}

        {Boolean(activeSource.has_continuations || (activeSource.combined_items && activeSource.combined_items.length > (activeSource.items?.length || 0)) || activeSource.combined_items?.some(it => it.order_display_number && String(it.order_display_number) !== String(orderNo))) && (
          <div className="alert alert-info py-2 px-3 mb-3 d-flex align-items-center gap-2 small rounded-3" style={{ fontSize: '12px' }}>
            <i className="bi bi-info-circle-fill text-primary" />
            <span><strong>Combined Dine-In Bill</strong> — includes initial order and all additional dish orders for this table.</span>
          </div>
        )}

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
            {((activeSource.combined_items && activeSource.combined_items.length > 0) ? activeSource.combined_items : (activeSource.items || [])).map((item, index) => (
              <tr key={item.id || index}>
                <td>
                  <div className="fw-semibold">
                    {item.order_display_number && (
                      <span className="badge bg-light text-dark border me-1.5 px-1.5 py-0.5" style={{ fontSize: '10px' }}>
                        #{item.order_display_number}
                      </span>
                    )}
                    {item.name || 'Dish'}
                  </div>
                  {Array.isArray(item.customizations) && item.customizations.length > 0 && (
                    <div className="foodie-invoice-extra">
                      {item.customizations.map((extra) => (
                        extra?.extra_price ? `${extra.name} (+${money(extra.extra_price)})` : extra?.name
                      )).filter(Boolean).join(', ')}
                    </div>
                  )}
                </td>
                <td className="text-center">{item.quantity || 1}</td>
                <td className="text-end">{money(item.price != null ? item.price : item.unit_price || 0)}</td>
                <td className="text-end">{money(((item.price != null ? item.price : item.unit_price) || 0) * (item.quantity || 1))}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="foodie-invoice-totals">
          <Row label="Subtotal" value={money(subtotal)} />
          {addonTotal > 0 && <Row label="Add-on charges" value={money(addonTotal)} />}
          {dishDiscount > 0 && <Row label="Menu discounts" value={discount(dishDiscount)} />}
          {(isTakeaway || packingCharge !== 0) && <Row label="Takeaway charges" value={money(packingCharge)} />}
          {serviceCharge > 0 && (
            <Row
              label={`Service charge (${order.service_charge_rate != null && order.service_charge_rate !== '' ? order.service_charge_rate : 0}%)`}
              value={money(serviceCharge)}
            />
          )}
          <Row label="Taxable amount" value={money(order.taxable_amount ?? 0)} />
          {couponDiscount > 0 && <Row label="Coupon discounts" value={discount(couponDiscount)} />}
          <Row label={order.gst_rate != null && order.gst_rate !== '' ? `GST (${order.gst_rate}%)` : 'GST'} value={money(tax)} />
          {roundOff !== 0 && <Row label="Round-off" value={money(roundOff)} />}
          {Number(order.paid_amount || 0) > 0 && (
            <Row label="Paid amount" value={money(order.paid_amount)} />
          )}
          {order.balance_due != null && Number(order.balance_due) > 0 && (
            <Row label="Balance due" value={money(order.balance_due)} emphasis />
          )}
          <Row label="Grand total" value={money(grandTotal)} emphasis />
        </div>

        <div className="foodie-invoice-pay mt-2 pt-2 border-top d-flex justify-content-between align-items-center">
          <div className="d-flex align-items-center gap-2">
            <span className="text-secondary small fw-medium">Payment status:</span>
            <span
              className="fw-bold"
              style={{
                color: isConfirmedPaid ? '#16A34A' : '#DC2626',
                fontSize: '13px'
              }}
            >
              {isConfirmedPaid ? 'Paid' : 'Unpaid / pending'}
            </span>
          </div>
          {methodName ? (
            <div className="text-end">
              <span className="text-secondary small me-1">Payment method:</span>
              <strong className="text-dark small">{methodName}</strong>
            </div>
          ) : null}
        </div>
        <p className="foodie-invoice-foot mt-3">{isTakeaway ? 'Thank you for choosing Foodie. Visit again.' : 'Thank you for dining with Foodie. Visit again.'}</p>
        <p className="foodie-invoice-foot">Computer-generated invoice from the saved order.</p>
      </div>
    </Modal>
  );
};

export default EBillModal;
