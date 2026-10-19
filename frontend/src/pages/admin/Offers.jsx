import React, { useState, useEffect } from 'react';
import AdminLayout from '../../components/layout/AdminLayout';
import PageHeader from '../../components/layout/PageHeader';
import Badge from '../../components/common/Badge';
import Button from '../../components/common/Button';
import Input from '../../components/common/Input';
import Modal from '../../components/common/Modal';
import Loader from '../../components/common/Loader';
import EmptyState from '../../components/common/EmptyState';
import BranchRequiredState from '../../components/common/BranchRequiredState';
import { useBranches } from '../../hooks/useBranches';
import SearchBar from '../../components/common/SearchBar';
import EditDishModal from '../../components/menu/EditDishModal';
import ConfirmModal from '../../components/common/ConfirmModal';
import { FiPlus, FiTrash2, FiEdit2, FiTag, FiGift } from 'react-icons/fi';
import couponService from '../../services/couponService';
import { productService } from '../../services/productService';
import formatCurrency from '../../utils/formatCurrency';
import { getImageUrl, FOOD_IMAGE_PLACEHOLDER } from '../../utils/imageUtils';

export const Offers = () => {
  const { hasBranches, loading: branchesLoading } = useBranches();
  const [activeTab, setActiveTab] = useState('dishes'); // 'dishes' | 'coupons'
  const [coupons, setCoupons] = useState([]);
  const [discountedDishes, setDiscountedDishes] = useState([]);
  const [allDishes, setAllDishes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  const [isAddOpen, setIsAddOpen] = useState(false);
  const [code, setCode] = useState('');
  const [discount, setDiscount] = useState('');
  const [minOrder, setMinOrder] = useState('');
  const [validity, setValidity] = useState('');
  const [autoApply, setAutoApply] = useState(false);
  const [couponError, setCouponError] = useState('');
  const now = new Date();
  const todayIso = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

  // Editing & Deleting dish offer
  const [editingDish, setEditingDish] = useState(null);
  const [deletingDishOffer, setDeletingDishOffer] = useState(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  // Deleting coupon confirmation modal
  const [deletingCoupon, setDeletingCoupon] = useState(null);
  const [deleteCouponLoading, setDeleteCouponLoading] = useState(false);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [couponData, dishData] = await Promise.all([
        couponService.getCoupons(),
        productService.getProducts(true)
      ]);
      const loadedCoupons = couponData || [];
      const loadedDishes = dishData || [];
      setCoupons(loadedCoupons);
      setAllDishes(loadedDishes);

      const onOffer = loadedDishes.filter(
        d => d.hasDiscount || d.discountPercent > 0 || (d.discountPrice > 0 && d.discountPrice < d.price)
      );
      setDiscountedDishes(onOffer);
    } catch (e) {
      console.error("Error loading offers data:", e);
    }
    setLoading(false);
  };

  const fetchDataSilently = async () => {
    try {
      const data = await couponService.getCoupons();
      const seenCoupons = new Set();
      const uniqueCoupons = (data || []).filter(c => {
        const key = String(c.id || c.code || '').toUpperCase().trim();
        if (!key || seenCoupons.has(key)) return false;
        seenCoupons.add(key);
        return true;
      });
      setCoupons(uniqueCoupons);

      const dishes = await productService.getProducts();
      const seenDishes = new Set();
      const onOffer = (dishes || []).filter(d => {
        if (!d || !d.id) return false;
        const key = String(d.id);
        if (seenDishes.has(key)) return false;
        const hasDisc = Boolean(d.hasDiscount || d.discountPercent > 0 || (d.discountPrice > 0 && d.discountPrice < d.price));
        if (hasDisc) {
          seenDishes.add(key);
          return true;
        }
        return false;
      });
      setDiscountedDishes(onOffer);
    } catch (e) {
      console.error("Error polling offers data:", e);
    }
  };

  useEffect(() => {
    fetchData();
    const handleSync = () => { fetchDataSilently(); };
    const handleStorage = (event) => {
      if (event.key === 'foodie_data_sync' || event.key === 'foodie_inventory_sync_trigger') handleSync();
    };
    window.addEventListener('foodie_offers_updated', handleSync);
    window.addEventListener('foodie_products_updated', handleSync);
    window.addEventListener('foodie_inventory_updated', handleSync);
    window.addEventListener('foodie_data_sync_refetch', handleSync);
    window.addEventListener('storage', handleStorage);
    window.addEventListener('focus', handleSync);
    const handleVis = () => {
      if (document.visibilityState === 'visible') handleSync();
    };
    document.addEventListener('visibilitychange', handleVis);
    return () => {
      window.removeEventListener('foodie_offers_updated', handleSync);
      window.removeEventListener('foodie_products_updated', handleSync);
      window.removeEventListener('foodie_inventory_updated', handleSync);
      window.removeEventListener('foodie_data_sync_refetch', handleSync);
      window.removeEventListener('storage', handleStorage);
      window.removeEventListener('focus', handleSync);
      document.removeEventListener('visibilitychange', handleVis);
    };
  }, []);

  const handleCreateCoupon = async (e) => {
    e.preventDefault();
    setCouponError('');
    if (!hasBranches || !code || !discount) return;
    if (!validity) {
      setCouponError('Valid until is required.');
      return;
    }
    if (validity < todayIso) {
      setCouponError('Valid until cannot be earlier than today.');
      return;
    }

    try {
      await couponService.createCoupon({
        code: code.toUpperCase(),
        discount: parseInt(discount),
        minOrderValue: parseInt(minOrder || '0'),
        type: 'Flat',
        validity,
        status: 'Active',
        autoApply,
      });

      const freshCoupons = await couponService.getCoupons();
      setCoupons(freshCoupons);
      setCode('');
      setDiscount('');
      setMinOrder('');
      setValidity('');
      setAutoApply(false);
      setIsAddOpen(false);
    } catch (err) {
      window.alert(err.message || 'The coupon could not be created.');
    }
  };

  const handleToggleAutoApply = async (coupon) => {
    const next = !coupon.autoApply;
    setCoupons((prev) => prev.map((row) => (
      row.id === coupon.id ? { ...row, autoApply: next } : row
    )));
    try {
      const updated = await couponService.setAutoApply(coupon.id, next);
      setCoupons((prev) => prev.map((row) => (row.id === coupon.id ? { ...row, ...updated } : row)));
    } catch (err) {
      setCoupons((prev) => prev.map((row) => (
        row.id === coupon.id ? { ...row, autoApply: !next } : row
      )));
      window.alert(err.message || 'Could not update auto apply.');
    }
  };

  const handleToggleStatus = async (id, couponCode, currentStatus) => {
    try {
      const updated = await couponService.toggleStatus(id, couponCode, currentStatus);
      setCoupons(updated);
    } catch (e) {
      console.error("Error toggling status:", e);
    }
  };

  const handleDeleteCouponClick = (id, couponCode) => {
    setDeletingCoupon({ id, code: couponCode });
  };

  const handleConfirmDeleteCoupon = async () => {
    if (!deletingCoupon) return;
    setDeleteCouponLoading(true);
    const { id, code } = deletingCoupon;
    setCoupons(prev => prev.filter(c => c.id !== id && String(c.code).toUpperCase() !== String(code).toUpperCase()));
    try {
      const updated = await couponService.deleteCoupon(id, code);
      setCoupons(updated);
    } catch (e) {
      console.error("Error deleting coupon:", e);
      window.alert(e.message || "Failed to delete coupon.");
      await fetchDataSilently();
    } finally {
      setDeleteCouponLoading(false);
      setDeletingCoupon(null);
    }
  };

  const handleEditDishSave = async (id, dishData) => {
    await productService.updateProduct(id, dishData);
    await fetchData();
  };

  const handleDeleteDishOffer = async () => {
    if (!deletingDishOffer) return;
    setDeleteLoading(true);
    const targetDish = deletingDishOffer;

    // Optimistic UI update: immediately remove from offer list
    setDiscountedDishes(prev => prev.filter(d => d.id !== targetDish.id));
    setDeletingDishOffer(null);

    try {
      const origPrice = parseFloat(targetDish.originalPrice || targetDish.price || 0);
      const updatedDishData = {
        ...targetDish,
        price: origPrice,
        originalPrice: origPrice,
        discountPrice: 0,
        discount_price: 0,
        discountPercent: 0,
        discount_percent: 0,
        offer_percentage: 0,
        hasDiscount: false,
        has_discount: false,
        disabled: true,
        deleted: true
      };

      await productService.updateProduct(targetDish.id, updatedDishData);
      await fetchData();
    } catch (e) {
      console.error("Failed to delete dish offer:", e);
      alert("Failed to delete dish offer. Please try again.");
      await fetchData();
    }
    setDeleteLoading(false);
  };

  const filteredDishes = discountedDishes.filter((dish) => {
    const term = search.trim().toLowerCase();
    if (!term) return true;
    return (
      (dish.name && dish.name.toLowerCase().includes(term)) ||
      (dish.category && dish.category.toLowerCase().includes(term)) ||
      (dish.foodType && dish.foodType.toLowerCase().includes(term))
    );
  });

  const filteredCoupons = coupons.filter((c) => {
    const term = search.trim().toLowerCase();
    if (!term) return true;
    return (
      (c.code && c.code.toLowerCase().includes(term)) ||
      (c.description && c.description.toLowerCase().includes(term)) ||
      String(c.discount).includes(term)
    );
  });

  if ((loading && coupons.length === 0 && discountedDishes.length === 0) || branchesLoading) {
    return (
      <AdminLayout>
        <div className="py-5 text-center">
          <Loader />
          <p className="text-muted small mt-2">Loading offers...</p>
        </div>
      </AdminLayout>
    );
  }

  if (!hasBranches) {
    return (
      <AdminLayout>
        <PageHeader title="Offers & Discounts" showBackButton />
        <BranchRequiredState />
      </AdminLayout>
    );
  }

  if (!loading && coupons.length === 0 && discountedDishes.length === 0) {
    return (
      <AdminLayout>
        <PageHeader
          title="Offers & Discounts"
          showBackButton
          actions={
            <Button
              onClick={() => { setCouponError(''); setIsAddOpen(true); }}
              variant="primary"
              className="d-flex align-items-center gap-2 py-2 px-3 shadow-sm rounded-pill"
            >
              <FiPlus /> Add Coupon
            </Button>
          }
        />
        <EmptyState
          title="No Offers, Discounts and Coupons"
          description="There are currently no active coupons, vouchers, or discounts configured."
          icon="bi-percent"
        />

        {/* Add Coupon Modal */}
        <Modal isOpen={isAddOpen} title="Create Offer Coupon" onClose={() => setIsAddOpen(false)}>
          <form onSubmit={handleCreateCoupon}>
            <Input
              label="Promo Coupon Code"
              placeholder="e.g. MONSOON20"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              required
            />
            <Input
              label="Discount Value (₹)"
              type="number"
              placeholder="e.g. 50"
              value={discount}
              onChange={(e) => setDiscount(e.target.value)}
            />
            <Input
              label="Minimum Order Value (₹)"
              type="number"
              placeholder="e.g. 299"
              value={minOrder}
              onChange={(e) => setMinOrder(e.target.value)}
              required
            />
            <Input
              label="Valid Until"
              type="date"
              min={todayIso}
              value={validity}
              onChange={(e) => { setValidity(e.target.value); setCouponError(''); }}
              required
              error={couponError}
            />
            {couponError && <div className="text-danger small fw-semibold mb-2">{couponError}</div>}
            <div className="d-grid mt-3">
              <Button type="submit" variant="primary">
                Create Coupon
              </Button>
            </div>
          </form>
        </Modal>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <PageHeader
        title="Offers & Discounts"
        showBackButton
        actions={
          <div className="d-flex align-items-center gap-2 flex-wrap">
            {((activeTab === 'dishes' && discountedDishes.length > 0) || (activeTab === 'coupons' && coupons.length > 0)) && (
            <SearchBar
              placeholder={activeTab === 'dishes' ? "Search dish offers..." : "Search coupons..."}
              value={search}
              onChange={setSearch}
              records={activeTab === 'dishes'
                ? discountedDishes.map((dish) => ({
                  id: dish.id,
                  label: dish.name,
                  title: dish.name,
                  subtitle: dish.category || 'Offer',
                  price: dish.sellingPrice ?? dish.discountPrice ?? dish.price,
                  image: dish.image,
                  searchText: [dish.name, dish.category].filter(Boolean).join(' '),
                }))
                : coupons.map((coupon) => ({
                  id: coupon.id || coupon.code,
                  label: coupon.code,
                  title: coupon.code,
                  subtitle: [coupon.type || coupon.discountType || 'Discount', coupon.status || (coupon.is_active === false ? 'Inactive' : 'Active')].filter(Boolean).join(' · '),
                  searchText: [coupon.code, coupon.description, coupon.type, coupon.status].filter(Boolean).join(' '),
                }))}
              onSelectSuggestion={(item) => {
                if (item?.label) setSearch(item.label);
              }}
              style={{ width: '220px' }}
            />
            )}
            {activeTab === 'coupons' && (
              <Button
                onClick={() => { setCouponError(''); setIsAddOpen(true); }}
                variant="primary"
                className="d-flex align-items-center gap-2 py-2 px-3 shadow-sm rounded-pill"
              >
                <FiPlus /> Add Coupon
              </Button>
            )}
          </div>
        }
      />

      {/* Tabs Switcher */}
      <div className="d-flex gap-2 mb-4 border-bottom pb-3">
        <button
          onClick={() => setActiveTab('dishes')}
          className={`btn btn-sm rounded-pill px-3.5 py-2 fw-bold d-flex align-items-center gap-2 transition-all ${activeTab === 'dishes'
              ? 'bg-danger text-white border-danger shadow-sm'
              : 'bg-white text-secondary border'
            }`}
          style={{ fontSize: '13px' }}
        >
          <FiTag size={15} />
          <span>Dish Discounts & Special Offers ({filteredDishes.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('coupons')}
          className={`btn btn-sm rounded-pill px-3.5 py-2 fw-bold d-flex align-items-center gap-2 transition-all ${activeTab === 'coupons'
              ? 'bg-danger text-white border-danger shadow-sm'
              : 'bg-white text-secondary border'
            }`}
          style={{ fontSize: '13px' }}
        >
          <FiGift size={15} />
          <span>Promo Vouchers & Coupons ({filteredCoupons.length})</span>
        </button>
      </div>

      {loading ? (
        <div className="py-5 text-center">
          <Loader />
          <p className="text-muted small mt-2">Loading offers...</p>
        </div>
      ) : activeTab === 'dishes' ? (
        <div className="card border-0 shadow-sm rounded-3 p-4 bg-white">
          <div className="d-flex align-items-center justify-content-between mb-3 flex-wrap gap-2">
            <div>
              <h5 className="fw-bold text-dark mb-0">Active Dish Discounts & Offers</h5>
              <p className="text-muted small mb-0">Special discount prices configured on menu items visible to both admin and customers.</p>
            </div>
            <span className="badge bg-danger-subtle text-danger fw-bold rounded-pill px-3 py-1.5" style={{ fontSize: '12px' }}>
              {filteredDishes.length} Items on Offer
            </span>
          </div>

          {filteredDishes.length === 0 ? (
            <EmptyState
              title={search ? "No Dish Offers Found" : "No Dish Discounts Active"}
              description={search ? `No active offers matched "${search}".` : "No menu items currently have discount prices configured. Edit any dish from Menu Editor to add discount prices or percentage."}
              icon="bi-tag"
            />
          ) : (
            <div className="table-responsive">
              <table className="table align-middle">
                <thead>
                  <tr className="text-secondary small">
                    <th>DISH</th>
                    <th>CATEGORY</th>
                    <th>ORIGINAL PRICE</th>
                    <th>DISCOUNT PRICE</th>
                    <th>OFFER DISCOUNT</th>
                    <th>STOCK</th>
                    <th className="text-end">ACTIONS</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredDishes.map((dish) => {
                    const origPrice = parseFloat(dish.originalPrice || dish.price || 0);
                    const discPrice = parseFloat(dish.discountPrice || dish.sellingPrice || 0);
                    const discPct = dish.discountPercent || (origPrice > 0 && discPrice > 0 ? Math.round(((origPrice - discPrice) / origPrice) * 100) : 0);

                    return (
                      <tr key={dish.id} className="small">
                        <td>
                          <div className="d-flex align-items-center gap-3">
                            <img
                              src={getImageUrl(dish.image)}
                              alt={dish.name}
                              className="rounded-3 shadow-sm"
                              style={{ width: '44px', height: '44px', objectFit: 'cover' }}
                              onError={(event) => {
                                event.currentTarget.src = FOOD_IMAGE_PLACEHOLDER;
                              }}
                            />
                            <div>
                              <div className="fw-bold text-dark">{dish.name}</div>
                              <span className="small text-muted" style={{ fontSize: '11px' }}>{(dish.foodType || dish.type || 'veg').toUpperCase()}</span>
                            </div>
                          </div>
                        </td>
                        <td>
                          <span className="badge bg-light text-secondary border fw-semibold rounded-pill px-2.5 py-1" style={{ fontSize: '11px' }}>
                            {dish.category}
                          </span>
                        </td>
                        <td>
                          <span className="text-decoration-line-through text-danger opacity-75 fw-semibold">
                            {formatCurrency(origPrice)}
                          </span>
                        </td>
                        <td>
                          <span className="fw-bold text-success fs-6">
                            {formatCurrency(discPrice)}
                          </span>
                        </td>
                        <td>
                          <span className="badge bg-danger text-white fw-bold rounded-pill px-2.5 py-1" style={{ fontSize: '11px' }}>
                            🔥 {discPct}% OFF
                          </span>
                        </td>
                        <td>
                          <span className="text-muted fw-semibold">{dish.stock} Units</span>
                        </td>
                        <td className="text-end">
                          <div className="d-flex align-items-center justify-content-end gap-2">
                            <button
                              onClick={() => setEditingDish(dish)}
                              className="btn btn-sm btn-outline-secondary rounded-pill px-3 py-1 fw-bold d-inline-flex align-items-center gap-1.5"
                              style={{ fontSize: '11px' }}
                              title="Edit Offer"
                            >
                              <FiEdit2 size={12} /> Edit
                            </button>
                            <button
                              onClick={() => setDeletingDishOffer(dish)}
                              className="btn btn-sm btn-outline-danger rounded-pill px-2.5 py-1 fw-bold d-inline-flex align-items-center gap-1.5"
                              style={{ fontSize: '11px' }}
                              title="Delete Dish Offer"
                            >
                              <FiTrash2 size={12} /> Delete
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : (
        <div className="card border-0 shadow-sm rounded-3 p-4 bg-white">
          <div className="d-flex align-items-center justify-content-between mb-3 flex-wrap gap-2">
            <div>
              <h5 className="fw-bold text-dark mb-0">Voucher Codes Directory</h5>
              <p className="text-muted small mb-0">Create and manage restaurant-wide promotional coupon codes.</p>
            </div>
            <span className="badge bg-danger-subtle text-danger fw-bold rounded-pill px-3 py-1.5" style={{ fontSize: '12px' }}>
              {filteredCoupons.length} Promo Codes
            </span>
          </div>

          {filteredCoupons.length === 0 ? (
            <EmptyState
              title={search ? "No Coupons Found" : "No Promo Coupons Configured"}
              description={search ? `No coupon code matched "${search}".` : "Add your first discount voucher code using the Add Coupon button."}
              icon="bi-gift"
            />
          ) : (
            <div className="table-responsive">
              <table className="table align-middle">
                <thead>
                  <tr className="text-secondary small">
                    <th>CODE</th>
                    <th>DISCOUNT TYPE</th>
                    <th>VALUE</th>
                    <th>MIN ORDER</th>
                    <th>VALID UNTIL</th>
                    <th>AUTO APPLY</th>
                    <th>STATUS</th>
                    <th className="text-end">ACTIONS</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredCoupons.map((c) => (
                    <tr key={c.id || c.code} className="small">
                      <td className="fw-bold text-dark font-monospace">{c.code}</td>
                      <td>{c.type === 'percentage' ? 'Percentage' : 'Flat Discount'}</td>
                      <td className="fw-bold text-danger">{c.type === 'percentage' ? `${c.discount}%` : `₹${c.discount}`}</td>
                      <td className="text-secondary fw-semibold">₹{c.minOrderValue || c.minimum_order_amount || 0}</td>
                      <td>{c.valid_until ? new Date(c.valid_until).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : (c.validity ? new Date(c.validity).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : 'No Expiry')}</td>
                      <td>
                        <div className="form-check form-switch m-0">
                          <input
                            className="form-check-input"
                            type="checkbox"
                            role="switch"
                            checked={Boolean(c.autoApply)}
                            aria-label={`Auto apply ${c.code}`}
                            onChange={() => handleToggleAutoApply(c)}
                            style={{ cursor: 'pointer' }}
                          />
                        </div>
                      </td>
                      <td>
                        <Badge status={c.status} style={{ fontSize: '10px' }} />
                      </td>
                      <td className="text-end">
                        <div className="d-flex align-items-center justify-content-end gap-2">
                          <button
                            onClick={() => handleToggleStatus(c.id, c.code, c.status)}
                            className={`btn btn-sm rounded-pill px-3 fw-bold ${c.status === 'Active' ? 'btn-outline-secondary' : 'btn-outline-success'}`}
                            style={{ fontSize: '11px' }}
                          >
                            {c.status === 'Active' ? 'Deactivate' : 'Activate'}
                          </button>
                          <button
                            onClick={() => handleDeleteCouponClick(c.id, c.code)}
                            className="btn btn-sm btn-outline-danger rounded-pill px-2.5 py-1 fw-bold d-flex align-items-center gap-1"
                            title="Delete Coupon"
                            style={{ fontSize: '11px' }}
                          >
                            <FiTrash2 size={13} /> Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Edit Dish Offer Modal */}
      {editingDish && (
        <EditDishModal
          isOpen={!!editingDish}
          dish={editingDish}
          onClose={() => setEditingDish(null)}
          onSave={handleEditDishSave}
          pricingOnly={true}
        />
      )}

      {/* Delete Dish Offer Confirmation Modal */}
      {deletingDishOffer && (
        <ConfirmModal
          isOpen={!!deletingDishOffer}
          title="Delete Dish Offer"
          message={`Are you sure you want to remove the discount offer from "${deletingDishOffer.name}"? The dish will return to its original price (${formatCurrency(deletingDishOffer.originalPrice || deletingDishOffer.price || 0)}).`}
          confirmText="Yes, Delete Offer"
          loading={deleteLoading}
          onConfirm={handleDeleteDishOffer}
          onClose={() => setDeletingDishOffer(null)}
        />
      )}

      {/* Add Coupon Modal */}
      <Modal isOpen={isAddOpen} title="Create Offer Coupon" onClose={() => setIsAddOpen(false)}>
        <form onSubmit={handleCreateCoupon}>
          <Input
            label="Promo Coupon Code"
            placeholder="e.g. MONSOON20"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            required
          />
          <Input
            label="Discount Value (₹)"
            type="number"
            placeholder="e.g. 50"
            value={discount}
            onChange={(e) => setDiscount(e.target.value)}
            required
          />
          <Input
            label="Minimum Order Value (₹)"
            type="number"
            placeholder="e.g. 299"
            value={minOrder}
            onChange={(e) => setMinOrder(e.target.value)}
            required
          />
          <Input
            label="Valid Until"
            type="date"
            min={todayIso}
            value={validity}
            onChange={(e) => { setValidity(e.target.value); setCouponError(''); }}
            required
            error={couponError}
          />
          {couponError && <div className="text-danger small fw-semibold mb-2">{couponError}</div>}
          <div className="form-check form-switch mb-3">
            <input
              id="coupon-auto-apply"
              className="form-check-input"
              type="checkbox"
              role="switch"
              checked={autoApply}
              onChange={(e) => setAutoApply(e.target.checked)}
            />
            <label className="form-check-label small fw-semibold" htmlFor="coupon-auto-apply">
              Apply automatically when the order qualifies
            </label>
          </div>
          <div className="d-grid mt-3">
            <Button type="submit" variant="primary">
              Create Coupon
            </Button>
          </div>
        </form>
      </Modal>

      {/* Delete Coupon Confirmation Modal */}
      <ConfirmModal
        isOpen={Boolean(deletingCoupon)}
        title="Delete Promo Coupon"
        message={`Are you sure you want to delete coupon "${deletingCoupon?.code}"? Customers will no longer be able to apply this discount.`}
        confirmText="Delete Coupon"
        onClose={() => setDeletingCoupon(null)}
        onConfirm={handleConfirmDeleteCoupon}
        loading={deleteCouponLoading}
      />
    </AdminLayout>
  );
};
export default Offers;
