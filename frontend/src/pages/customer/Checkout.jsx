import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FiCoffee, FiShoppingBag } from 'react-icons/fi';
import CustomerLayout from '../../components/layout/CustomerLayout';
import ServerBillSummary from '../../components/customer/ServerBillSummary';
import { useCart } from '../../hooks/useCart';
import Button from '../../components/common/Button';
import formatCurrency from '../../utils/formatCurrency';
import BackButton from '../../components/common/BackButton';
import { applyOrderContext, availableTables, resolvePublicBranchId, selectableTables } from '../../services/customerCheckout';
import {
  DINE_IN, NO_TABLES_MESSAGE, TAKEAWAY, getOrderType, getSelectedTableId, hasDineInTable, hasScannedTable,
  setOrderType, setSelectedTableId,
} from '../../utils/orderContext';
import { formatCompactTableLabel } from '../../utils/tableUtils';

const OptionButton = ({ active, disabled, onClick, icon, title, hint, testId }) => (
  <button
    type="button"
    data-testid={testId}
    onClick={onClick}
    disabled={disabled}
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
  const [tableChoices, setTableChoices] = useState(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const firstLoad = useRef(true);

  const chooseType = async (type, tableId = getSelectedTableId()) => {
    setError('');
    setNotice('');
    if (type === DINE_IN && !hasScannedTable() && !tableId) {
      setBusy(true);
      try {
        const branchId = await resolvePublicBranchId();
        const tables = branchId ? await availableTables(branchId) : [];
        const open = selectableTables(tables);
        if (!tables.length) {
          setNotice(NO_TABLES_MESSAGE);
          return;
        }
        if (!open.length) {
          setNotice('Tables are listed, but none are free for a new dine-in order.');
          return;
        }
        if (open.length > 1) {
          setTableChoices(open);
          return;
        }
        setSelectedTableId(open[0].id);
        tableId = open[0].id;
      } catch (err) {
        setError(err.message || 'Could not check table availability.');
        return;
      } finally {
        setBusy(false);
      }
    }
    if (type === TAKEAWAY) setSelectedTableId(null);
    setBusy(true);
    try {
      const view = await applyOrderContext(type);
      setOrderType(type);
      setType(type);
      setCartView(view);
      if (type === TAKEAWAY) {
        setTable({ tableNumber: 'Takeaway', tableId: 'Takeaway', orderType: TAKEAWAY });
      } else if (view.table) {
        setTable({ tableNumber: view.table.table_number, tableId: view.table.id, location: view.table.location, orderType: DINE_IN });
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    if (firstLoad.current && orderType) {
      firstLoad.current = false;
      chooseType(orderType);
    }
  });

  const items = cartView?.items || [];
  const canProceed = Boolean(orderType && cartView?.can_checkout) && !busy;

  return (
    <CustomerLayout>
      <main className="pt-2">
        <div className="d-flex align-items-center gap-3 mb-4">
          <BackButton />
          <h4 className="fw-bold text-dark mb-0">Checkout Details</h4>
        </div>

        <div className="row g-4">
          <div className="col-12 col-lg-8">
            <div className="card rounded-3 border-0 shadow-sm p-3 p-sm-4 bg-white text-start mb-4">
              <h5 className="fw-bold text-dark mb-3">Service Option</h5>
              <div className="d-flex flex-column flex-sm-row gap-3">
                <OptionButton
                  testId="order-type-dine-in"
                  active={orderType === DINE_IN}
                  disabled={busy}
                  onClick={() => chooseType(DINE_IN, getSelectedTableId())}
                  icon={<FiCoffee size={22} />}
                  title="Table Dine-In"
                  hint={hasScannedTable() ? 'Served at the table you scanned' : 'Choose an available table'}
                />
                <OptionButton
                  testId="order-type-takeaway"
                  active={orderType === TAKEAWAY}
                  disabled={busy}
                  onClick={() => chooseType(TAKEAWAY)}
                  icon={<FiShoppingBag size={22} />}
                  title="Takeaway"
                  hint="Pick up at the restaurant counter"
                />
              </div>
              {notice && (
                <div className="alert alert-warning small py-2 mt-3 mb-0" role="status" data-testid="no-tables-banner">
                  {notice}
                  <button type="button" className="btn btn-link btn-sm p-0 ms-2" onClick={() => chooseType(DINE_IN, null)}>Check again</button>
                </div>
              )}
              {tableChoices && sessionStorage.getItem('foodie_staff_ordering') !== '1' && !hasScannedTable() && (
                <div className="d-flex flex-wrap gap-2 mt-3">
                  {tableChoices.map((table) => (
                    <button
                      key={table.id}
                      type="button"
                      className="btn btn-sm btn-outline-danger"
                      onClick={() => {
                        setSelectedTableId(table.id);
                        setTableChoices(null);
                        chooseType(DINE_IN, table.id);
                      }}
                    >
                      {formatCompactTableLabel(table.table_number)}
                    </button>
                  ))}
                </div>
              )}
              {orderType === DINE_IN && cartView?.table && (
                <div className="p-3 bg-light rounded-3 border border-light-subtle mt-3">
                  <span className="small text-secondary fw-semibold">Table:</span>
                  <h6 className="fw-bold text-dark mb-0">{formatCompactTableLabel(cartView.table.table_number)}{cartView.table.location ? ` · ${cartView.table.location}` : ''}</h6>
                </div>
              )}
              {!orderType && !error && (
                <p className="text-secondary small mt-3 mb-0">Choose how you would like to receive your order.</p>
              )}
              {error && <div className="alert alert-danger small py-2 mt-3 mb-0" role="alert" data-testid="checkout-error">{error}</div>}
            </div>

            {cartView && (
              <div className="card rounded-3 border-0 shadow-sm p-3 p-sm-4 bg-white text-start">
                <h5 className="fw-bold text-dark mb-3 border-bottom pb-2">Item Summary</h5>
                {items.length === 0 ? (
                  <div className="text-center py-3">
                    <p className="text-secondary small mb-3">Your cart is empty.</p>
                    <Button onClick={() => navigate('/customer/home')} variant="primary" className="py-2">Browse Menu</Button>
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
                    className="py-2 fw-bold"
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
                  className="py-2.5 fw-bold shadow-sm"
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
