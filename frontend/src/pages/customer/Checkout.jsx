import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FiCoffee, FiCheckCircle } from 'react-icons/fi';
import CustomerLayout from '../../components/layout/CustomerLayout';
import ServerBillSummary from '../../components/customer/ServerBillSummary';
import CheckoutStepper from '../../components/customer/CheckoutStepper';
import { useCart } from '../../hooks/useCart';
import Button from '../../components/common/Button';
import formatCurrency from '../../utils/formatCurrency';
import BackButton from '../../components/common/BackButton';
import {
  applyOrderContext, availableTables, fetchCurrentCart, resolvePublicBranchId, selectableTables,
} from '../../services/customerCheckout';
import {
  DINE_IN, NO_TABLES_MESSAGE, TAKEAWAY, getLastDineInTableId, getOrderType, getSelectedTableId,
  hasDineInTable, hasScannedTable, rememberDineInTableId, rememberScannedTableQr, setOrderType, setSelectedTableId,
} from '../../utils/orderContext';
import { formatCompactTableLabel } from '../../utils/tableUtils';

function enforceCartPricing(cart, nextType, targetTable = null) {
  if (!cart) return cart;
  const currentPricing = cart.pricing || {};
  const items = cart.items || [];
  const totalQty = items.reduce((sum, item) => sum + Number(item.quantity || 1), 0);
  const isTakeaway = nextType === TAKEAWAY;
  const takeawayCharge = isTakeaway ? totalQty * 10 : 0;

  const itemsSubtotal = Number(currentPricing.items_subtotal ?? items.reduce((s, i) => s + Number(i.line_total || 0), 0));
  const addOns = Number(currentPricing.customization_total || 0);
  const dishDiscount = Number(currentPricing.dish_discount_total || 0);
  const couponDiscount = Number(currentPricing.coupon_discount_total ?? (currentPricing.coupons || []).reduce((s, c) => s + Number(c.discount || 0), 0));
  const merchandise = Math.max(0, itemsSubtotal + addOns - dishDiscount);
  const foodAfterCoupon = Math.max(0, merchandise - couponDiscount);

  const taxable = foodAfterCoupon + takeawayCharge;
  const gstRate = Number(currentPricing.gst_rate ?? 5);
  const gstAmount = Math.round((taxable * (gstRate / 100)) * 100) / 100;
  const serviceCharge = Number(currentPricing.service_charge_amount || 0);
  const rawTotal = taxable + gstAmount + serviceCharge;
  const finalTotal = Math.round(rawTotal);
  const roundOff = Math.round((finalTotal - rawTotal) * 100) / 100;

  const effectiveTable = !isTakeaway
    ? (targetTable || cart.table || (getSelectedTableId() ? { id: getSelectedTableId(), table_number: String(getSelectedTableId()) } : null))
    : null;

  return {
    ...cart,
    order_type: nextType,
    table: effectiveTable,
    pricing: {
      ...currentPricing,
      items_subtotal: itemsSubtotal.toFixed(2),
      merchandise_total: merchandise.toFixed(2),
      coupon_discount_total: couponDiscount.toFixed(2),
      takeaway_charge: takeawayCharge.toFixed(2),
      taxable_amount: taxable.toFixed(2),
      gst_rate: gstRate,
      gst_amount: gstAmount.toFixed(2),
      service_charge_amount: serviceCharge.toFixed(2),
      amount_before_round: rawTotal.toFixed(2),
      round_off: roundOff.toFixed(2),
      total_amount: finalTotal.toFixed(2),
    },
  };
}

const OptionButton = ({ active, onClick, icon, title, hint, testId }) => (
  <button
    type="button"
    data-testid={testId}
    onClick={onClick}
    aria-pressed={active}
    className={`btn p-3 rounded-4 d-flex align-items-center gap-3 text-start border-2 flex-fill ${active ? 'btn-danger text-white' : 'btn-outline-danger bg-white'}`}
  >
    {icon}
    <span>
      <span className="fw-bold d-block">{title}</span>
      <span className={`small d-block ${active ? 'text-white-50' : 'text-secondary'}`} style={{ fontSize: '11.5px' }}>{hint}</span>
    </span>
  </button>
);

export const Checkout = () => {
  const navigate = useNavigate();
  const { setTable } = useCart();
  const [orderType, setType] = useState(() => (hasDineInTable() || getOrderType() === TAKEAWAY ? getOrderType() : null));
  const [cartView, setCartView] = useState(null);
  const [tableChoices, setTableChoices] = useState([]);
  const [allBranchTables, setAllBranchTables] = useState([]);
  const [busy, setBusy] = useState(false);
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
  });

  const getSavedTableNumber = () => {
    try {
      const raw = sessionStorage.getItem('foodie_table') || localStorage.getItem('foodie_table');
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed.tableNumber && String(parsed.tableNumber).toLowerCase() !== 'takeaway') {
          return parsed.tableNumber;
        }
        if (parsed.table_number && String(parsed.table_number).toLowerCase() !== 'takeaway') {
          return parsed.table_number;
        }
      }
    } catch (e) {}
    return null;
  };

  const fetchAvailableTablesList = async (preferredId = null) => {
    try {
      const branchId = await resolvePublicBranchId();
      if (!branchId) return { open: [], all: [] };
      const tables = await availableTables(branchId);
      setAllBranchTables(tables || []);
      const activeTableId = preferredId || getSelectedTableId() || getLastDineInTableId() || sessionStorage.getItem('foodie_selected_table');
      const open = selectableTables(tables, activeTableId);
      setTableChoices(open);
      return { open, all: tables };
    } catch (err) {
      console.warn('Could not check table availability:', err);
      return { open: [], all: [] };
    }
  };

  const chooseType = async (type, tableOrId = null) => {
    setError('');
    setNotice('');

    if (type === TAKEAWAY) {
      setOrderType(TAKEAWAY);
      setType(TAKEAWAY);
      setTable({ tableNumber: 'Takeaway', tableId: 'Takeaway', orderType: TAKEAWAY });
      setCartView(prev => enforceCartPricing(prev, TAKEAWAY, null));

      setBusy(true);
      try {
        const view = await applyOrderContext(TAKEAWAY);
        setCartView(enforceCartPricing(view, TAKEAWAY, null));
        setTable({ tableNumber: 'Takeaway', tableId: 'Takeaway', orderType: TAKEAWAY });
      } catch (err) {
        setError(err.message || 'Could not update to takeaway.');
      } finally {
        setBusy(false);
      }
      return;
    }

    // type === DINE_IN
    setOrderType(DINE_IN);
    setType(DINE_IN);

    const preferredId = getSelectedTableId() || getLastDineInTableId() || sessionStorage.getItem('foodie_selected_table');

    if (hasScannedTable()) {
      setBusy(true);
      try {
        const view = await applyOrderContext(DINE_IN);
        const activeTable = view.table || (preferredId ? { id: preferredId, table_number: getSavedTableNumber() || formatCompactTableLabel(String(preferredId)) } : null);
        setCartView(enforceCartPricing(view, DINE_IN, activeTable));
        if (view.table) {
          setSelectedTableId(view.table.id, view.table.table_number);
          rememberDineInTableId(view.table.id);
          setTable({
            tableNumber: view.table.table_number,
            tableId: view.table.id,
            location: view.table.location,
            orderType: DINE_IN,
          });
        }
      } catch (err) {
        setError(err.message || 'Could not set dine-in table.');
      } finally {
        setBusy(false);
      }
      return;
    }

    setBusy(true);
    try {
      const { open: openTables, all: allTables } = await fetchAvailableTablesList(preferredId);

      let resolvedTable = null;
      if (tableOrId && typeof tableOrId === 'object' && tableOrId.id) {
        resolvedTable = (allTables.length ? allTables : openTables).find(t => Number(t.id) === Number(tableOrId.id)) || tableOrId;
      } else if (tableOrId && Number.isInteger(Number(tableOrId))) {
        resolvedTable = (allTables.length ? allTables : openTables).find(t => Number(t.id) === Number(tableOrId));
      }

      if (!resolvedTable && preferredId) {
        resolvedTable = (allTables.length ? allTables : openTables).find(t => Number(t.id) === Number(preferredId));
        if (!resolvedTable && cartView?.table && Number(cartView.table.id) === Number(preferredId)) {
          resolvedTable = cartView.table;
        }
        if (!resolvedTable) {
          resolvedTable = {
            id: Number(preferredId),
            table_number: getSavedTableNumber() || formatCompactTableLabel(String(preferredId)),
            location: ''
          };
        }
      }

      if (!resolvedTable && openTables.length > 0) {
        resolvedTable = openTables[0];
      }

      if (!resolvedTable) {
        setNotice(NO_TABLES_MESSAGE);
        setCartView(prev => enforceCartPricing(prev, DINE_IN, null));
        setBusy(false);
        return;
      }

      setSelectedTableId(resolvedTable.id, resolvedTable.table_number);
      rememberDineInTableId(resolvedTable.id);
      if (resolvedTable.qr_code) {
        rememberScannedTableQr(resolvedTable.qr_code);
      }

      const tableInfo = {
        id: resolvedTable.id,
        tableId: resolvedTable.id,
        table_number: resolvedTable.table_number,
        tableNumber: resolvedTable.table_number,
        location: resolvedTable.location || '',
        orderType: DINE_IN,
      };
      setTable(tableInfo);
      setCartView(prev => enforceCartPricing(prev, DINE_IN, tableInfo));

      const view = await applyOrderContext(DINE_IN, resolvedTable.id);
      const confirmedTable = view.table || tableInfo;
      setCartView(enforceCartPricing(view, DINE_IN, confirmedTable));
      if (view.table) {
        setSelectedTableId(view.table.id, view.table.table_number);
        rememberDineInTableId(view.table.id);
        setTable({
          tableNumber: view.table.table_number,
          tableId: view.table.id,
          location: view.table.location,
          orderType: DINE_IN,
        });
      }
    } catch (err) {
      setError(err.message || 'Could not select dine-in table.');
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    let active = true;
    const init = async () => {
      try {
        setBusy(true);
        const currentType = getOrderType();
        const preferredId = getSelectedTableId() || getLastDineInTableId() || sessionStorage.getItem('foodie_selected_table');
        const parentOrderId = sessionStorage.getItem('foodie_parent_order_id') || localStorage.getItem('foodie_parent_order_id');

        let openTables = [];
        let allTables = [];
        if (!hasScannedTable() && sessionStorage.getItem('foodie_staff_ordering') !== '1') {
          try {
            const branchId = await resolvePublicBranchId();
            if (branchId) {
              allTables = await availableTables(branchId);
              if (active) setAllBranchTables(allTables);
              openTables = selectableTables(allTables, preferredId);
              if (active) setTableChoices(openTables);
            }
          } catch {}
        }

        if (currentType === DINE_IN || (!currentType && (parentOrderId || preferredId))) {
          let effectiveTableId = preferredId;
          if (!hasScannedTable() && !effectiveTableId && openTables.length > 0) {
            effectiveTableId = openTables[0].id;
          }

          if (hasScannedTable() || effectiveTableId) {
            const view = await applyOrderContext(DINE_IN, effectiveTableId);
            if (!active) return;
            const matchedTable = (allTables.length ? allTables : openTables).find(t => Number(t.id) === Number(effectiveTableId));
            const targetTable = view.table || matchedTable || (effectiveTableId ? { id: effectiveTableId, table_number: getSavedTableNumber() || formatCompactTableLabel(String(effectiveTableId)) } : null);
            setCartView(enforceCartPricing(view, DINE_IN, targetTable));
            setType(DINE_IN);
            setOrderType(DINE_IN);
            if (view.table || targetTable) {
              const tb = view.table || targetTable;
              setSelectedTableId(tb.id, tb.table_number);
              rememberDineInTableId(tb.id);
              setTable({ tableNumber: tb.table_number, tableId: tb.id, location: tb.location, orderType: DINE_IN });
            }
          } else {
            const view = await fetchCurrentCart();
            if (!active) return;
            setCartView(enforceCartPricing(view, DINE_IN, null));
            setType(DINE_IN);
            setOrderType(DINE_IN);
          }
        } else if (currentType === TAKEAWAY) {
          const view = await applyOrderContext(TAKEAWAY);
          if (!active) return;
          setCartView(enforceCartPricing(view, TAKEAWAY, null));
          setType(TAKEAWAY);
          setOrderType(TAKEAWAY);
          setTable({ tableNumber: 'Takeaway', tableId: 'Takeaway', orderType: TAKEAWAY });
        } else {
          const view = await fetchCurrentCart();
          if (!active) return;
          const initialType = view?.order_type || null;
          setCartView(initialType ? enforceCartPricing(view, initialType) : view);
          if (initialType) {
            setType(initialType);
            setOrderType(initialType);
            if (initialType === DINE_IN && view?.table) {
              setSelectedTableId(view.table.id, view.table.table_number);
              rememberDineInTableId(view.table.id);
              setTable({ tableNumber: view.table.table_number, tableId: view.table.id, location: view.table.location, orderType: DINE_IN });
            }
          }
        }
      } catch (err) {
        if (!active) return;
        try {
          const view = await fetchCurrentCart();
          if (active && view) {
            const currentType = getOrderType();
            setCartView(currentType ? enforceCartPricing(view, currentType) : view);
          }
        } catch {}
      } finally {
        if (active) setBusy(false);
      }
    };
    init();
    return () => { active = false; };
  }, []);

  const items = cartView?.items || [];
  const canProceed = Boolean(
    orderType &&
    cartView?.can_checkout &&
    (orderType === TAKEAWAY || cartView?.table || hasScannedTable() || getSelectedTableId())
  ) && !busy;

  return (
    <CustomerLayout>
      <main className="pt-2">
        <CheckoutStepper currentStep={2} />

        <div className="d-flex align-items-center gap-3 mb-4">
          <BackButton />
          <h4 className="fw-bold text-dark mb-0">Checkout Details</h4>
        </div>

        <div className="row g-4">
          <div className="col-12 col-lg-8">
                        {/* Customer Details & Dining Service Card (Matches Reference 6) */}
            <div className="card border-0 shadow-sm p-4 bg-white text-start mb-4" style={{ borderRadius: '18px', border: '1px solid #E2E8F0' }}>
              <h5 className="fw-bold text-dark mb-3" style={{ fontSize: '18px' }}>Choose Option</h5>
              <div className="row g-3 mb-3">
                <div className="col-6">
                  <div
                    onClick={() => chooseType(DINE_IN)}
                    className="p-3 rounded-4 d-flex align-items-center justify-content-center text-center cursor-pointer transition-all shadow-xs h-100"
                    style={{
                      cursor: 'pointer',
                      border: `2px solid ${orderType === DINE_IN ? '#F20D2D' : '#E2E8F0'}`,
                      backgroundColor: orderType === DINE_IN ? '#FFF5F5' : '#FFFFFF',
                      minHeight: '64px'
                    }}
                  >
                    <span className="fw-bold text-dark fs-6">Table Dine-in</span>
                  </div>
                </div>

                <div className="col-6">
                  <div
                    onClick={() => chooseType(TAKEAWAY)}
                    className="p-3 rounded-4 d-flex align-items-center justify-content-center text-center cursor-pointer transition-all shadow-xs h-100"
                    style={{
                      cursor: 'pointer',
                      border: `2px solid ${orderType === TAKEAWAY ? '#F20D2D' : '#E2E8F0'}`,
                      backgroundColor: orderType === TAKEAWAY ? '#FFF5F5' : '#FFFFFF',
                      minHeight: '64px'
                    }}
                  >
                    <span className="fw-bold text-dark fs-6">Takeaway</span>
                  </div>
                </div>
              </div>

              {orderType === DINE_IN && (cartView?.table || getSavedTableNumber() || getSelectedTableId()) && (
                <div className="mb-2 p-2.5 rounded-3 bg-light border border-light-subtle d-flex align-items-center justify-content-between">
                  <span className="small text-secondary fw-semibold">Table:</span>
                  <span className="fw-bold text-dark font-monospace">
                    {formatCompactTableLabel(cartView?.table?.table_number || getSavedTableNumber() || String(getSelectedTableId()))}
                  </span>
                </div>
              )}


              {notice && (
                <div className="alert alert-warning small py-2 mt-3 mb-0" role="status" data-testid="no-tables-banner">
                  {notice}
                </div>
              )}
              {error && <div className="alert alert-danger small py-2 mt-3 mb-0" role="alert" data-testid="checkout-error">{error}</div>}
            </div>

            {cartView && (
              <div className="card rounded-3 border-0 shadow-sm p-3 p-sm-4 bg-white text-start">
                <h5 className="fw-bold text-dark mb-3 border-bottom pb-2">Item Summary</h5>
                {items.length === 0 ? (
                  <div className="text-center py-3">
                    <p className="text-secondary small mb-3">Your cart is empty.</p>
                    <Button onClick={() => navigate('/customer/home')} variant="primary" className="py-2.5 px-4 rounded-pill">Browse Menu</Button>
                  </div>
                ) : (
                  <div className="d-flex flex-column gap-3">
                    {items.map((item) => (
                      <div key={item.item_id} className="d-flex align-items-start justify-content-between pb-3 border-bottom border-light-subtle">
                        <div>
                          <h6 className="fw-bold text-dark mb-0.5">{item.name} <span className="text-secondary small">x{item.quantity}</span></h6>
                          {item.special_instructions && (
                            <div className="small text-danger fw-semibold" style={{ fontSize: '11px' }}>
                              Instructions: "{item.special_instructions}"
                            </div>
                          )}
                          {item.issue && <div className="small text-warning fw-semibold">{item.issue}</div>}
                        </div>
                        <span className="fw-bold text-dark">{item.line_total ? formatCurrency(Number(item.line_total)) : '—'}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="col-12 col-lg-4">
            <ServerBillSummary cart={cartView}>
              <div className="d-grid gap-2">
                {(cartView?.issues || []).length > 0 && (
                  <Button
                    type="button"
                    variant="outline"
                    className="py-2.5 fw-bold rounded-pill"
                    onClick={() => navigate('/customer/cart')}
                  >
                    Update cart
                  </Button>
                )}
                <Button
                  type="button"
                  data-testid="proceed-to-payment"
                  onClick={() => navigate('/customer/payment', { state: { orderType } })}
                  variant="primary"
                  className="py-2.5 fw-bold shadow-sm rounded-pill"
                  disabled={!canProceed}
                  loading={busy}
                >
                  Proceed to Payment
                </Button>
              </div>
            </ServerBillSummary>
          </div>
        </div>
      </main>
    </CustomerLayout>
  );
};

export default Checkout;
