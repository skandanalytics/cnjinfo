import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import AdminLayout from '../../components/layout/AdminLayout';
import PageHeader from '../../components/layout/PageHeader';
import DishCard from '../../components/menu/DishCard';
import AddDishModal from '../../components/menu/AddDishModal';
import AddCategoryModal from '../../components/menu/AddCategoryModal';
import EditDishModal from '../../components/menu/EditDishModal';
import RenameCategoryModal from '../../components/menu/RenameCategoryModal';
import ConfirmModal from '../../components/common/ConfirmModal';
import Button from '../../components/common/Button';
import Loader from '../../components/common/Loader';
import EmptyState from '../../components/common/EmptyState';
import BranchRequiredState from '../../components/common/BranchRequiredState';
import { useBranches } from '../../hooks/useBranches';
import SearchBar from '../../components/common/SearchBar';
import Pagination from '../../components/common/Pagination';
import { productService, clearStaticProductCache } from '../../services/productService';
import { menuService } from '../../services/menuService';
import { useAuth } from '../../hooks/useAuth';
import { FiPlus, FiArrowLeft, FiGrid, FiLayers, FiEdit2, FiTrash2, FiCheckCircle, FiSearch, FiX } from 'react-icons/fi';
import { getFrontendCategoryName, normalizeCategoryName, isDishInCategory } from '../../utils/categoryUtils';

const ITEMS_PER_PAGE = 8;

export const MenuEditor = () => {
  const { menuId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const { hasBranches, loading: branchesLoading } = useBranches();

  const [allMenus, setAllMenus] = useState([]);
  const [menu, setMenu] = useState(null);
  const [selectedCategories, setSelectedCategories] = useState(() => (menuId && menuId !== 'all' ? [menuId] : []));
  const [dishes, setDishes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedFoodTypes, setSelectedFoodTypes] = useState([]); // array of 'veg' | 'non-veg' | 'vegan'
  const [statusFilter, setStatusFilter] = useState('all'); // 'all' | 'in_stock' | 'low_stock' | 'out_of_stock'
  const [offersOnly, setOffersOnly] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);

  // Modals
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [comboMode, setComboMode] = useState(false);
  const [isAddCategoryOpen, setIsAddCategoryOpen] = useState(false);
  const [editingDish, setEditingDish] = useState(null);
  const [deletingDishId, setDeletingDishId] = useState(null);
  const [isRenameOpen, setIsRenameOpen] = useState(false);
  const [targetCategoryToRename, setTargetCategoryToRename] = useState(null);
  const [deletingCategory, setDeletingCategory] = useState(null);
  const [categoryDeleteBusy, setCategoryDeleteBusy] = useState(false);
  const [categoryDeleteError, setCategoryDeleteError] = useState('');
  const [dishDeleteBusy, setDishDeleteBusy] = useState(false);
  const [dishDeleteError, setDishDeleteError] = useState('');

  // Reset to page 1 on filter changes
  useEffect(() => {
    setCurrentPage(1);
  }, [search, selectedFoodTypes, statusFilter, offersOnly, selectedCategories]);

  const fetchDetails = async (showLoading = true) => {
    if (showLoading) setLoading(true);
    try {
      const [menuData, dishData] = await Promise.all([
        menuService.getMenus(true),
        productService.getProducts(true)
      ]);
      setAllMenus(menuData || []);
      setDishes(dishData || []);

      if (menuId && menuId !== 'all') {
        const matchedMenu = (menuData || []).find((m) =>
          String(m.id) === String(menuId) ||
          normalizeCategoryName(m.name) === normalizeCategoryName(menuId)
        );
        if (matchedMenu) {
          setMenu(matchedMenu);
          setSelectedCategories([matchedMenu.name]);
        } else {
          setSelectedCategories([menuId]);
        }
      } else {
        setMenu(null);
      }
    } catch (e) {
      console.error("Error loading menu details:", e);
    }
    if (showLoading) setLoading(false);
  };

  const fetchDetailsSilently = async () => {
    try {
      const [menuData, dishData] = await Promise.all([
        menuService.getMenus(true),
        productService.getProducts(true)
      ]);
      setAllMenus(menuData || []);
      setDishes(dishData || []);
    } catch (e) {
      console.error("Error polling menu details:", e);
    }
  };

  useEffect(() => {
    fetchDetails();

    const handleSync = () => {
      fetchDetailsSilently();
    };

    const handleStorage = (e) => {
      if (
        e.key === 'foodie_inventory_sync_trigger' || 
        e.key === 'foodie_dish_stocks' ||
        e.key === 'foodie_products_updated' ||
        e.key === 'foodie_categories_updated' ||
        e.key === 'foodie_data_sync'
      ) {
        fetchDetailsSilently();
      }
    };

    const handleBranchSync = () => {
      fetchDetails(true);
    };
    window.addEventListener('foodie_branch_selected', handleBranchSync);
    window.addEventListener('foodie_products_updated', handleSync);
    window.addEventListener('foodie_inventory_updated', handleSync);
    window.addEventListener('foodie_categories_updated', handleSync);
    window.addEventListener('storage', handleStorage);

    return () => {
      window.removeEventListener('foodie_branch_selected', handleBranchSync);
      window.removeEventListener('foodie_products_updated', handleSync);
      window.removeEventListener('foodie_inventory_updated', handleSync);
      window.removeEventListener('foodie_categories_updated', handleSync);
      window.removeEventListener('storage', handleStorage);
    };
  }, [menuId]);

  const handleAddCategory = async (categoryData) => {
    if (!isAdmin) return;
    const created = await menuService.createMenu(categoryData);
    if (created && created.name) {
      setAllMenus(prev => {
        const norm = normalizeCategoryName(getFrontendCategoryName(created.name));
        const filtered = prev.filter(m => normalizeCategoryName(getFrontendCategoryName(m.name)) !== norm);
        return [...filtered, created];
      });
      setSelectedCategories([created.name]);
    }
    await fetchDetails();
  };

  const handleAddDish = async (dishData) => {
    if (!isAdmin) return;
    const finalData = { ...dishData };
    if (comboMode || finalData.category === 'Combo Offer' || finalData.category === 'Combo Offers') {
      finalData.category = 'Combo Offer';
      try {
        const hasComboCat = (allMenus || []).some(m => {
          const norm = normalizeCategoryName(getFrontendCategoryName(m.name));
          return norm === 'combooffer' || norm === 'combooffers' || norm === 'combo';
        });
        if (!hasComboCat) {
          await menuService.createMenu({
            name: 'Combo Offer',
            description: 'Special Combo Offers & Deals',
            status: 'Active'
          });
        }
      } catch (e) {
        console.warn("Could not auto-create Combo Offer category:", e);
      }
    }
    try {
      await productService.createProduct(finalData);
    } finally {
      clearStaticProductCache();
      await fetchDetails();
    }
  };

  const handleEditDish = async (id, dishData) => {
    if (!isAdmin) return;
    await productService.updateProduct(id, dishData);
    clearStaticProductCache();
    await fetchDetails();
  };

  const handleDeleteConfirm = async () => {
    if (!isAdmin || !deletingDishId || dishDeleteBusy) return;
    setDishDeleteBusy(true);
    setDishDeleteError('');
    try {
      await productService.deleteProduct(deletingDishId);
      setDeletingDishId(null);
      clearStaticProductCache();
      await fetchDetails(false);
    } catch (err) {
      setDishDeleteError(err.message || 'The dish could not be deleted.');
    } finally {
      setDishDeleteBusy(false);
    }
  };

  const handleRenameCategory = async (newName, newDescription, status) => {
    if (!isAdmin) return;
    const catToRename = targetCategoryToRename || currentCategoryObj;
    if (!catToRename?.id || Number.isNaN(Number(catToRename.id))) {
      throw new Error('This category is not saved yet. Refresh the page and try again.');
    }
    const updated = await menuService.updateMenu(catToRename.id, {
      name: newName.trim(),
      description: newDescription ?? '',
      status,
    });
    if (updated) setMenu(updated);
    clearStaticProductCache();
    window.dispatchEvent(new CustomEvent('foodie_categories_updated'));
    await fetchDetails();
    setSelectedCategories([updated?.name || newName.trim()]);
    navigate(`/admin/menus/${catToRename.id}`);
  };

  const handleDeleteCategoryConfirm = async () => {
    if (!isAdmin || !deletingCategory || categoryDeleteBusy) return;
    if (!deletingCategory.id || Number.isNaN(Number(deletingCategory.id))) {
      setCategoryDeleteError('This category is not saved yet. Refresh the page and try again.');
      return;
    }
    setCategoryDeleteBusy(true);
    setCategoryDeleteError('');
    try {
      await menuService.deleteMenu(deletingCategory.id);
      setDeletingCategory(null);
      clearStaticProductCache();
      window.dispatchEvent(new CustomEvent('foodie_categories_updated'));
      setSelectedCategories([]);
      await fetchDetails();
      navigate('/admin/menus');
    } catch (e) {
      setCategoryDeleteError(e.message || 'The category could not be deleted.');
    } finally {
      setCategoryDeleteBusy(false);
    }
  };

  // Derive unique categories from both menus and dishes
  const categoriesList = React.useMemo(() => {
    const map = new Map();
    (allMenus || []).forEach(m => {
      const feName = getFrontendCategoryName(m.name);
      const norm = normalizeCategoryName(feName);
      if (!map.has(norm)) {
        map.set(norm, { id: m.id, name: feName, originalName: m.name, description: m.description || '', status: m.status });
      }
    });
    (dishes || []).forEach(d => {
      const cat = d.category || 'Other';
      const feName = getFrontendCategoryName(cat);
      const norm = normalizeCategoryName(feName);
      if (!map.has(norm)) {
        map.set(norm, { id: norm, name: feName, originalName: cat });
      }
    });
    return Array.from(map.values());
  }, [allMenus, dishes]);

  const isAllSelected = selectedCategories.length === 0;

  // Selected category objects
  const selectedCategoryObjs = React.useMemo(() => {
    if (isAllSelected) return [];
    return categoriesList.filter(c =>
      selectedCategories.some(sc =>
        String(c.id) === String(sc) ||
        normalizeCategoryName(c.name) === normalizeCategoryName(sc) ||
        normalizeCategoryName(c.originalName) === normalizeCategoryName(sc)
      )
    );
  }, [categoriesList, selectedCategories, isAllSelected]);

  // When exactly one category is selected, keep reference for single-category actions (rename, delete banner)
  const currentCategoryObj = selectedCategoryObjs.length === 1 ? selectedCategoryObjs[0] : null;
  const currentCategoryName = isAllSelected
    ? 'All Categories'
    : selectedCategoryObjs.length === 1
    ? selectedCategoryObjs[0].name
    : `${selectedCategoryObjs.length} Categories Selected`;

  // 1. Filter dishes that belong to ANY of the selected categories (or all if isAllSelected)
  const menuDishes = dishes.filter((dish) => {
    if (isAllSelected) return true;
    return selectedCategoryObjs.some(cat => isDishInCategory(dish, cat));
  });

  // Food type presence in current menu dishes
  const hasVegDishes = menuDishes.some(d => {
    const t = (d.foodType || d.type || 'veg').toLowerCase();
    return t === 'veg' || t === 'vegetarian';
  });

  const hasNonVegDishes = menuDishes.some(d => {
    const t = (d.foodType || d.type || '').toLowerCase();
    return t === 'non-veg' || t === 'nonveg' || t === 'non-vegetarian';
  });

  const hasVeganDishes = menuDishes.some(d => {
    const t = (d.foodType || d.type || '').toLowerCase();
    return t === 'vegan';
  });

  const hasOffersDishes = menuDishes.some(d => {
    return Boolean(d.hasDiscount || d.discountPercent > 0 || (d.discountPrice > 0 && d.discountPrice < d.price));
  });

  const handleFoodTypeToggle = (type) => {
    setSelectedFoodTypes((prev) =>
      prev.includes(type) ? prev.filter((t) => t !== type) : [...prev, type]
    );
  };

  // 2. Filter within menu dishes by Food Type / Offer, Status, and Search Term
  const filteredDishes = menuDishes.filter((dish) => {
    const rawType = (dish.foodType || dish.type || 'veg').toLowerCase();
    const dishFoodType = (rawType === 'nonveg' || rawType === 'nonvegetarian') ? 'non-veg' : rawType;
    let matchesFoodType = true;
    if (selectedFoodTypes.length > 0) {
      matchesFoodType = selectedFoodTypes.includes(dishFoodType);
    }
    if (offersOnly) {
      matchesFoodType = matchesFoodType && Boolean(dish.hasDiscount || dish.discountPercent > 0 || (dish.discountPrice > 0 && dish.discountPrice < dish.price));
    }

    let matchesStatus = true;
    if (statusFilter === 'in_stock') {
      matchesStatus = Number(dish.stock) >= 6 && !dish.is_sold_out && dish.status !== 'Out of Stock';
    } else if (statusFilter === 'low_stock') {
      matchesStatus = Number(dish.stock) > 0 && Number(dish.stock) < 6 && !dish.is_sold_out;
    } else if (statusFilter === 'out_of_stock') {
      matchesStatus = Number(dish.stock) <= 0 || dish.status === 'Out of Stock' || Boolean(dish.is_sold_out);
    }

    const term = search.trim().toLowerCase();
    const matchesSearch = !term ||
      (dish.name && dish.name.toLowerCase().includes(term)) ||
      (dish.description && dish.description.toLowerCase().includes(term));

    return matchesFoodType && matchesStatus && matchesSearch;
  });

  const totalPages = Math.ceil(filteredDishes.length / ITEMS_PER_PAGE);
  const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
  const paginatedDishes = filteredDishes.slice(startIndex, startIndex + ITEMS_PER_PAGE);

  const handlePageChange = (page) => {
    setCurrentPage(page);
    window.scrollTo({ top: 150, behavior: 'smooth' });
  };

  const handleCategorySelect = (cat) => {
    if (cat === 'all') {
      setSelectedCategories([]);
      return;
    }

    const catKey = cat.name || cat;
    const catNorm = normalizeCategoryName(catKey);

    setSelectedCategories((prev) => {
      const isAlreadySelected = prev.some(
        c => normalizeCategoryName(c) === catNorm || String(c) === String(cat.id)
      );

      // A dish can belong to ONE category only; clicking selected category resets to all
      if (isAlreadySelected) {
        return [];
      } else {
        return [catKey];
      }
    });
  };

  if ((loading && dishes.length === 0) || branchesLoading) {
    return (
      <AdminLayout>
        <Loader />
      </AdminLayout>
    );
  }

  if (!hasBranches) {
    return (
      <AdminLayout>
        <PageHeader title="Add Menu" showBackButton backUrl="/admin/dashboard" />
        <BranchRequiredState />
      </AdminLayout>
    );
  }

  const hasCategories = categoriesList.length > 0;

  return (
    <AdminLayout>
      <PageHeader
        title="Menu Management"
        subtitle="Manage your dishes, categories and offers."
        showBackButton
        backUrl="/admin/dashboard"
        actions={
          isAdmin && (
            <div className="d-flex align-items-center gap-2">
              <Button
                onClick={() => { if (hasBranches) setIsAddCategoryOpen(true); }}
                variant="primary"
                className="d-flex align-items-center gap-2 py-2 px-3 shadow-sm rounded-pill fw-bold"
                style={{ backgroundColor: 'var(--primary-color, #C8102E)', borderColor: 'var(--primary-color, #C8102E)', color: '#FFFFFF' }}
              >
                <FiPlus /> Add Category
              </Button>

              <Button
                onClick={() => {
                  if (hasCategories) {
                    setIsAddOpen(true);
                    setComboMode(false);
                  }
                }}
                disabled={!hasCategories}
                variant="primary"
                className={`d-flex align-items-center gap-2 py-2 px-3 shadow-sm rounded-pill fw-bold ${!hasCategories ? 'opacity-50' : ''}`}
                style={{
                  backgroundColor: !hasCategories ? '#94A3B8' : 'var(--primary-color, #C8102E)',
                  borderColor: !hasCategories ? '#94A3B8' : 'var(--primary-color, #C8102E)',
                  color: '#FFFFFF',
                  cursor: !hasCategories ? 'not-allowed' : 'pointer'
                }}
                title={!hasCategories ? 'Please add a category first' : 'Add Dish'}
              >
                <FiPlus /> Add Dish
              </Button>
            </div>
          )
        }
      />

      {/* Unified Filter Bar Matching Reference Panel 5 */}
      <div className="card rounded-4 border-0 shadow-sm p-3 mb-4 bg-white">
        <div className="d-flex align-items-center justify-content-between flex-wrap gap-3">
          {/* Search Box */}
          <div className="flex-grow-1" style={{ minWidth: '240px', maxWidth: '420px' }}>
            <div className="position-relative">
              <FiSearch className="position-absolute top-50 start-0 translate-middle-y ms-3 text-secondary" />
              <input
                type="text"
                disabled={!hasCategories}
                className="form-control rounded-pill ps-5 bg-light border-light-subtle shadow-xs"
                style={{ height: '42px', fontSize: '13px', cursor: !hasCategories ? 'not-allowed' : 'text' }}
                placeholder={!hasCategories ? "Add a category first to manage dishes" : "Search dishes (e.g. idli, pizza, burger...)"}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              {search && (
                <button
                  type="button"
                  className="btn btn-sm position-absolute top-50 end-0 translate-middle-y me-2 text-secondary p-0"
                  onClick={() => setSearch('')}
                >
                  <FiX />
                </button>
              )}
            </div>
          </div>

          <div className="d-flex align-items-center gap-2 flex-wrap">
            {/* Food Type Buttons (Icon Only, Checkbox Toggle) */}
            <div className={`d-inline-flex align-items-center gap-1.5 p-1 bg-light rounded-pill border border-light-subtle ${!hasCategories ? 'opacity-50' : ''}`} style={{ pointerEvents: !hasCategories ? 'none' : 'auto' }}>
              <button
                type="button"
                disabled={!hasCategories}
                onClick={() => setSelectedFoodTypes([])}
                className={`btn btn-sm rounded-circle p-0 d-inline-flex align-items-center justify-content-center transition-all ${
                  selectedFoodTypes.length === 0 ? 'btn-danger text-white shadow-xs' : 'btn-light text-secondary'
                }`}
                style={{ width: '32px', height: '32px' }}
                title="All Food Types"
                aria-label="All Food Types"
              >
                <FiGrid size={15} />
              </button>

              <button
                type="button"
                disabled={!hasCategories}
                onClick={() => handleFoodTypeToggle('veg')}
                className={`btn btn-sm rounded-circle p-0 d-inline-flex align-items-center justify-content-center transition-all ${
                  selectedFoodTypes.includes('veg') ? 'btn-success text-white shadow-xs' : 'btn-light'
                }`}
                style={{ width: '32px', height: '32px' }}
                title="Vegetarian"
                aria-label="Vegetarian"
              >
                <span className="veg-badge" style={{ width: '15px', height: '15px' }}></span>
              </button>

              <button
                type="button"
                disabled={!hasCategories}
                onClick={() => handleFoodTypeToggle('non-veg')}
                className={`btn btn-sm rounded-circle p-0 d-inline-flex align-items-center justify-content-center transition-all ${
                  selectedFoodTypes.includes('non-veg') ? 'btn-danger text-white shadow-xs' : 'btn-light'
                }`}
                style={{ width: '32px', height: '32px' }}
                title="Non-Vegetarian"
                aria-label="Non-Vegetarian"
              >
                <span className="non-veg-badge" style={{ width: '15px', height: '15px' }}></span>
              </button>

              <button
                type="button"
                disabled={!hasCategories}
                onClick={() => handleFoodTypeToggle('vegan')}
                className={`btn btn-sm rounded-circle p-0 d-inline-flex align-items-center justify-content-center transition-all ${
                  selectedFoodTypes.includes('vegan') ? 'btn-success text-white shadow-xs' : 'btn-light'
                }`}
                style={{ width: '32px', height: '32px' }}
                title="Vegan"
                aria-label="Vegan"
              >
                <span className="vegan-badge" style={{ width: '15px', height: '15px' }}></span>
              </button>
            </div>

            {/* Status Dropdown */}
            <select
              disabled={!hasCategories}
              aria-label="Filter dishes by stock status"
              className={`form-select rounded-pill bg-light border-light-subtle fw-semibold shadow-xs ${!hasCategories ? 'opacity-50' : ''}`}
              style={{ width: 'auto', minWidth: '130px', height: '42px', fontSize: '13px', cursor: !hasCategories ? 'not-allowed' : 'pointer' }}
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              <option value="all">All Status</option>
              <option value="in_stock">In Stock</option>
              <option value="low_stock">Low Stock</option>
              <option value="out_of_stock">Out of Stock</option>
            </select>

{/* + Add Menu button removed as per requirements */}
          </div>
        </div>
      </div>

      {/* Categories Selector Bar: Only Text, Highlighted When Active */}
      {hasCategories && (
        <div 
          className="card rounded-4 border shadow-sm p-3 mb-4"
          style={{ backgroundColor: 'var(--surface-color)', borderColor: 'var(--border-color)' }}
        >
          <div className="d-flex align-items-center gap-2 flex-wrap">
            <span className="small fw-bold me-1" style={{ fontSize: '13px', color: 'var(--text-primary)' }}>
              Categories:
            </span>

            <div className="d-flex align-items-center gap-2 overflow-auto py-1 flex-wrap" style={{ scrollbarWidth: 'thin' }}>
              {/* "All" Category Pill */}
              <button
                type="button"
                onClick={() => handleCategorySelect('all')}
                className={`btn btn-sm d-flex align-items-center gap-2 rounded-pill px-3.5 py-1.5 fw-bold transition-all border ${isAllSelected
                  ? 'bg-danger text-white border-danger shadow-sm'
                  : 'bg-light text-dark border-light-subtle shadow-xs'
                  }`}
                style={{ fontSize: '13px', cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0 }}
              >
                <span>All Categories</span>
                <span
                  className={`badge rounded-pill ms-1 ${isAllSelected ? 'bg-white text-danger fw-bold' : 'bg-white text-secondary border'
                    }`}
                  style={{ fontSize: '10px', padding: '2px 6px' }}
                >
                  {categoriesList.length}
                </span>
              </button>

              {/* Dynamic Category Text Pills */}
              {categoriesList.map((cat) => {
                const catNorm = normalizeCategoryName(cat.name);
                const isSelected = selectedCategories.some(
                  c => normalizeCategoryName(c) === catNorm || String(c) === String(cat.id)
                );

                const countInCat = dishes.filter(d => isDishInCategory(d, cat)).length;

                return (
                  <span key={cat.id || cat.name} className="d-inline-flex align-items-center gap-1">
                    <button
                      type="button"
                      onClick={() => handleCategorySelect(cat)}
                      className={`btn btn-sm d-inline-flex align-items-center gap-2 rounded-pill px-3 py-1.5 fw-bold transition-all border ${isSelected
                        ? 'bg-danger text-white border-danger shadow-sm'
                        : 'bg-light text-dark border-light-subtle shadow-xs'
                        }`}
                      style={{ fontSize: '13px', cursor: 'pointer', maxWidth: '220px' }}
                    >
                      <span className="text-truncate">{cat.name}</span>
                      <span
                        className={`badge rounded-pill border flex-shrink-0 ${
                          isSelected ? 'bg-white text-danger fw-bold' : 'bg-white text-secondary'
                        }`}
                        style={{ fontSize: '10px' }}
                      >
                        {countInCat}
                      </span>
                    </button>
                  </span>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Menu Info Banner: Only shown when category is selected and categories exist */}
      {hasCategories && !isAllSelected && currentCategoryObj && (
        <div className="card rounded-3 border-0 shadow-sm p-3 mb-4 bg-white">
          <div className="d-flex align-items-center justify-content-between flex-wrap gap-2">
            <div>
              <div className="d-flex align-items-center gap-3 flex-wrap text-secondary" style={{ fontSize: '13px' }}>
                <span>Category: <strong className="text-dark">{currentCategoryName}</strong></span>
                <span>Dish count: <strong className="text-dark">{menuDishes.length}</strong></span>
                <span>Status: <strong className="text-dark">{menu?.status || currentCategoryObj?.status || 'Active'}</strong></span>
              </div>
              {(menu?.description || currentCategoryObj?.description) && (
                <div className="text-muted small mt-1 text-start" style={{ fontSize: '12px' }}>
                  {menu?.description || currentCategoryObj?.description}
                </div>
              )}
            </div>

            {isAdmin && (
              <div className="d-flex align-items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setTargetCategoryToRename(currentCategoryObj || { name: currentCategoryName, originalName: currentCategoryName });
                    setIsRenameOpen(true);
                  }}
                  className="btn btn-sm btn-outline-danger d-flex align-items-center gap-1.5 py-1.5 px-3 rounded-pill fw-bold shadow-xs transition-all"
                  style={{ fontSize: '12px' }}
                  title={`Rename / Edit category "${currentCategoryName}"`}
                >
                  <FiEdit2 size={13} className="me-1" />
                  <span>Rename Category</span>
                </button>

                <button
                  type="button"
                  disabled={menuDishes.length > 0}
                  onClick={() => {
                    if (menuDishes.length > 0) return;
                    setCategoryDeleteError('');
                    setDeletingCategory(currentCategoryObj || { name: currentCategoryName, originalName: currentCategoryName });
                  }}
                  className={`btn btn-sm d-flex align-items-center gap-1.5 py-1.5 px-3 rounded-pill fw-bold shadow-xs transition-all ${
                    menuDishes.length > 0
                      ? 'btn-light text-muted border border-secondary-subtle opacity-50'
                      : 'btn-outline-danger bg-white text-danger border-danger'
                  }`}
                  style={{ fontSize: '12px', cursor: menuDishes.length > 0 ? 'not-allowed' : 'pointer' }}
                  title={menuDishes.length > 0 ? `Cannot delete category "${currentCategoryName}" because it contains ${menuDishes.length} dish(es). Remove or reassign them first.` : `Delete category "${currentCategoryName}"`}
                >
                  <FiTrash2 size={13} className="me-1" />
                  <span>Delete Category</span>
                </button>
              </div>
            )}
          </div>
        </div>
      )}



      {/* Grid */}
      {filteredDishes.length === 0 ? (
        <EmptyState
          title={!hasCategories ? "No Categories Found" : isAllSelected ? "No Dishes in Menu" : `No Dishes in ${currentCategoryName}`}
          description={
            !hasCategories
              ? "You need to create at least one category before adding dishes to the menu."
              : search
              ? `No dishes matched "${search}" in this menu.`
              : isAllSelected
              ? "There are currently no dishes configured in the menu."
              : `There are currently no dishes configured in the ${currentCategoryName} category.`
          }
          icon={!hasCategories ? "bi-tags" : "bi-journal-x"}
        />
      ) : (
        <>
          <div className="row g-4">
            {paginatedDishes.map((dish) => (
              <div key={dish.id} className="col-12 col-sm-6 col-md-4 col-lg-3">
                <DishCard
                  dish={dish}
                  onEdit={() => setEditingDish(dish)}
                  onDelete={() => { setDishDeleteError(''); setDeletingDishId(dish.id); }}
                  isAdmin={isAdmin}
                  onRestock={async (item, qty) => {
                    const { restockFood, explain } = await import('../../services/adminApi');
                    try {
                      await restockFood(item.id, qty);
                    } catch (err) {
                      throw new Error(explain(err));
                    }
                    clearStaticProductCache();
                    await fetchDetailsSilently();
                  }}
                />
              </div>
            ))}
          </div>

          <Pagination
            currentPage={currentPage}
            totalPages={totalPages}
            onPageChange={handlePageChange}
          />
        </>
      )}

      {/* Add Category Modal */}
      {isAdmin && isAddCategoryOpen && (
        <AddCategoryModal
          isOpen={isAddCategoryOpen}
          onClose={() => setIsAddCategoryOpen(false)}
          onAdd={handleAddCategory}
        />
      )}

      {/* Add Dish Modal with defaultCategory preselected */}
      {isAdmin && isAddOpen && (
        <AddDishModal
          isOpen={isAddOpen}
          defaultCategory={comboMode ? 'Combo Offer' : (selectedCategoryObjs.length === 1 ? selectedCategoryObjs[0].name : '')}
          onClose={() => setIsAddOpen(false)}
          onAdd={handleAddDish}
        />
      )}

      {/* Edit Dish Modal */}
      {isAdmin && editingDish && (
        <EditDishModal
          isOpen={!!editingDish}
          dish={editingDish}
          onClose={() => setEditingDish(null)}
          onSave={handleEditDish}
        />
      )}

      {/* Rename / Edit Category Modal */}
      {isAdmin && isRenameOpen && (
        <RenameCategoryModal
          isOpen={isRenameOpen}
          currentCategoryName={targetCategoryToRename?.name || currentCategoryName}
          currentCategoryDescription={targetCategoryToRename?.description || currentCategoryObj?.description || ''}
          currentCategoryActive={(targetCategoryToRename || currentCategoryObj)?.status !== 'Inactive'}
          onClose={() => {
            setIsRenameOpen(false);
            setTargetCategoryToRename(null);
          }}
          onSave={handleRenameCategory}
        />
      )}

      {/* Delete Category Confirmation Modal */}
      {isAdmin && deletingCategory && (
        <ConfirmModal
          isOpen={!!deletingCategory}
          title="Delete Category"
          message={categoryDeleteError || `Delete category "${deletingCategory.name}"? A category that still has dishes cannot be deleted; delete or move its dishes first.`}
          confirmText="Delete Category"
          loading={categoryDeleteBusy}
          onConfirm={handleDeleteCategoryConfirm}
          onClose={() => { if (!categoryDeleteBusy) { setDeletingCategory(null); setCategoryDeleteError(''); } }}
        />
      )}

      {/* Delete Dish Confirmation */}
      {isAdmin && deletingDishId && (
        <ConfirmModal
          isOpen={!!deletingDishId}
          title="Delete Dish"
          message={dishDeleteError || `Delete "${(dishes.find((d) => d.id === deletingDishId) || {}).name || 'this dish'}"? It is removed from the menu with its stock record. Past orders and bills keep the dish name and price.`}
          confirmText="Delete Dish"
          loading={dishDeleteBusy}
          onConfirm={handleDeleteConfirm}
          onClose={() => { if (!dishDeleteBusy) { setDeletingDishId(null); setDishDeleteError(''); } }}
        />
      )}
    </AdminLayout>
  );
};
export default MenuEditor;
