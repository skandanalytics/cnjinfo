# Foodie Customer Module — Comprehensive Bug Root Cause Analysis
**Reference Documents:** `Only consider this bugs only 28-10-2026 2.pdf` & `30-10-2026 CUSTOMER MODULE BUGS 3.pdf`  
**Total Issues:** 29 Issues (16 from 28-10-2026 + 13 from 30-10-2026)

---

## Issue Mapping & Root Cause Breakdown

### Issue B28-01: Sub-branch dishes not appearing
- **Problem**: When selecting a sub-branch, only main branch dishes or incorrect dishes are shown; dishes belonging to the sub-branch are missing.
- **Affected Files**: `backend/apps/menu/public.py`, `frontend/src/services/productService.js`
- **Root Cause**: `_foods(branch)` in `backend/apps/menu/public.py` strictly queried `Food.objects.filter(branch=branch)`. When a sub-branch is selected, dishes defined at the main headquarters branch were missing, or dishes assigned to the sub-branch were filtered out because category lookups were restricted only to the sub-branch's own categories. The business rule requires: display main branch dishes + selected sub-branch dishes, without duplicates, excluding unrelated sub-branches.
- **Fix**: Update `_foods(branch)` and category queries to fetch dishes from both the requested branch AND the primary/main branch (`is_primary=True`), deduplicated by ID/name.

### Issue B28-02: Table number mismatch on Proceed to Payment (T01 becomes T10)
- **Problem**: Customer selects Table T01, but on proceed to payment / checkout it displays T10.
- **Affected Files**: `frontend/src/utils/tableUtils.js`, `frontend/src/pages/customer/Checkout.jsx`
- **Root Cause**: In `tableUtils.js`, `formatCompactTableLabel(table)` parsed numeric characters from input strings or database IDs using regex `str.match(/\d+/)`. When `table` was passed as an object containing database primary key `id: 10` alongside `table_number: "T01"`, or when `order.table` was a numeric ID, it converted the PK into `T10` instead of reading the actual `table_number`.
- **Fix**: Update `formatCompactTableLabel` and table display helpers to prioritize `table.table_number` or resolve table ID from table list to get the actual `table_number`.

### Issue B28-03: Inactive coupons displayed in Customer Page
- **Problem**: Customer view displays coupons that are marked as inactive in the admin panel.
- **Affected Files**: `backend/apps/menu/public.py`, `backend/apps/coupons/services.py`, `frontend/src/pages/customer/Cart.jsx`
- **Root Cause**: Public coupon listing endpoint did not strictly filter `is_active=True` and check expiry dates/usage limits before returning to the frontend.
- **Fix**: Ensure `Coupon.objects.filter(is_active=True, valid_until__gte=timezone.now())` is enforced in the public API and frontend filters out any non-active coupons.

### Issue B28-04: Browse Categories icon discrepancy
- **Problem**: Category icons in the horizontal category browser are misaligned, have inconsistent sizing or styling compared to reference.
- **Affected Files**: `frontend/src/pages/customer/Home.jsx`, `frontend/src/components/common/FoodCard.jsx`
- **Root Cause**: Icon containers in `Home.jsx` lacked standard width/height wrappers, leading to distortion and uneven margins with category labels.
- **Fix**: Standardize category icon containers with fixed dimensions, rounded badges, and consistent typography and active states.

### Issue B28-05: Food filter icons (All, Veg, Non-Veg mutual exclusivity)
- **Problem**: Only Veg and Non-veg icons were available, "All" was missing or not functioning as a mutually exclusive toggle. Both could be active simultaneously.
- **Affected Files**: `frontend/src/pages/customer/Home.jsx`
- **Root Cause**: State management used array toggles where clicking Veg then Non-veg added both to an array without clearing the other or resetting "All".
- **Fix**: Implement mutually exclusive single-selection: 'all' (default), 'veg', 'non-veg'. Clicking one deselects the others immediately.

### Issue B28-06: Cart item details missing for subsequent items
- **Problem**: Only first item showed complete details; other items lacked image, customizations, toppings, or add-ons.
- **Affected Files**: `frontend/src/pages/customer/Cart.jsx`, `frontend/src/components/cart/CartItem.jsx`
- **Root Cause**: Cart rendering mapped items but failed to forward normalized variant, add-on, and topping details when cart items were reloaded or formatted differently.
- **Fix**: Ensure cart items normalize all properties (name, image, price, quantity, addons, toppings, instructions, line total) identically across all array indices.

### Issue B28-07: Food count discrepancy between Customer and Admin (3 items vs 4 items)
- **Problem**: Admin displays 4 active dishes for a branch, but customer menu only displays 3 dishes.
- **Affected Files**: `backend/apps/menu/public.py`
- **Root Cause**: Food filtering in `public.py` applied overly strict availability / category matching or excluded main-branch items when viewed under sub-branch context.
- **Fix**: Ensure all active and available dishes across the main branch and sub-branch are returned in the public menu.

### Issue B28-08: Cart deletion redirect failure
- **Problem**: When deleting the final remaining item from the cart, the customer is not redirected to the home page and remains stuck on an empty/stale cart.
- **Affected Files**: `frontend/src/pages/customer/Cart.jsx`
- **Root Cause**: Deletion handler cleared state locally but lacked an explicit trigger to call backend cart clear and route to `/customer/home` upon cart length reaching 0.
- **Fix**: In `handleRemoveItem` / `handleClearCart`, if resulting items count is 0, clear backend cart and call `navigate('/customer/home')`.

### Issue B28-09: Sticky Header not shrinking on scroll
- **Problem**: When scrolling down the customer page, the header does not compact, keeping the large search bar and large navigation icons.
- **Affected Files**: `frontend/src/components/layout/Header.jsx`
- **Root Cause**: Header lacked scroll position listener (`window.scrollY > 50`) to toggle compact mode styles on search input and icon containers.
- **Fix**: Add a scroll event listener in `Header.jsx` to apply compact styles (`isScrolled`) reducing search bar padding, icon sizes, and header height gracefully.

### Issue B28-10: Bill summary calculation error
- **Problem**: Customer bill summary has arithmetic discrepancies between item sum, taxes, charges, and final total.
- **Affected Files**: `backend/apps/orders/pricing.py`, `frontend/src/pages/customer/Cart.jsx`, `frontend/src/pages/customer/Checkout.jsx`
- **Root Cause**: Frontend performed independent ad-hoc math with different rounding rules than backend `pricing.py`.
- **Fix**: Unify pricing using backend `pricing.py` as single source of truth; synchronize all calculations and roundings.

### Issue B28-11: Takeaway order charges both Packing Charge and Service Charge
- **Problem**: When takeaway is selected, both packaging charge and service charge are applied.
- **Affected Files**: `backend/apps/orders/pricing.py`, `backend/apps/orders/services.py`
- **Root Cause**: `pricing.py` evaluated `service_tax_enabled` without checking `order_type != "TAKEAWAY"`.
- **Fix**: Enforce `service_tax = Decimal("0.00")` whenever `order_type == "TAKEAWAY"`. Takeaway orders must only incur takeaway packing charges, never service charges.

### Issue B28-12: Payment status label & position ("payment status :- Unpaid /pending")
- **Problem**: Payment status is displayed too far from the summary, wrong color, and incorrect wording.
- **Affected Files**: `frontend/src/components/orders/EBillModal.jsx`, `frontend/src/pages/customer/OrderConfirmation.jsx`
- **Root Cause**: Payment status badge was positioned at the bottom with loose spacing, rendered in generic text, and did not include "Unpaid / pending" in red.
- **Fix**: Move payment status directly adjacent to the bill summary, format as `Payment Status: Unpaid / pending` in bold red `#DC2626` when unpaid, and green `#16A34A` when paid.

### Issue B28-13: Takeaway invoice thank-you message
- **Problem**: Takeaway bill displayed "Thank you for dining with us" instead of takeaway-specific greeting.
- **Affected Files**: `frontend/src/components/orders/EBillModal.jsx`, `frontend/src/utils/generateEBillPDF.js`
- **Root Cause**: Static dining text was used for all order types.
- **Fix**: Conditionally render: "Thank you for choosing Foodie. Visit again." for Takeaway orders, and "Thank you for dining with Foodie. Visit again." for Dine-in orders.

### Issue B28-14: Takeaway bill calculation mismatch (Line items vs Subtotal)
- **Problem**: 199 + 1575 + 490 + 135 = 2399, but subtotal showed 2899 because original pre-discount prices were summed in subtotal while discounted prices were displayed on line items.
- **Affected Files**: `backend/apps/orders/pricing.py`, `frontend/src/pages/customer/Cart.jsx`, `frontend/src/components/orders/EBillModal.jsx`
- **Root Cause**: Subtotal displayed undiscounted gross total while item rows displayed net discounted prices, causing apparent mathematical error to the customer.
- **Fix**: Align subtotal to match the sum of displayed line item amounts, with item discounts clearly broken out or reflected consistently.

### Issue B28-15: Download bill date and time discrepancy
- **Problem**: Download bill showed 13-10-2026 6:36pm instead of actual order creation time 27-10-2026 3:45pm.
- **Affected Files**: `frontend/src/utils/generateEBillPDF.js`, `frontend/src/components/orders/EBillModal.jsx`
- **Root Cause**: Date was either formatted with hardcoded mock dates or timezone converted incorrectly from UTC to local IST without formatting the backend `order.created_at`.
- **Fix**: Use backend `order.created_at` exclusively, formatting in Asia/Kolkata (IST) timezone with full date and 12-hour time format.

### Issue B28-16: Download bill payment status excessive spacing
- **Problem**: Excessive empty space between the bill table and payment status in the downloaded PDF/view.
- **Affected Files**: `frontend/src/utils/generateEBillPDF.js`, `frontend/src/components/orders/EBillModal.jsx`
- **Root Cause**: Hardcoded Y-coordinate offsets in jsPDF generated large whitespace gaps.
- **Fix**: Compact layout offsets dynamically based on table height.

---

### Issue B30-01: Hero banner size reduction & Dosa add button color
- **Problem**: "Delicious Food For Every Mood" hero section too tall; Dosa image add button color incorrect.
- **Affected Files**: `frontend/src/pages/customer/Home.jsx`, `frontend/src/components/common/FoodCard.jsx`
- **Root Cause**: Hero section padding was excessive (`py-12` / `py-16`); quick-add button did not consistently use Foodie primary red `#C8102E`.
- **Fix**: Reduce hero vertical padding to compact height; style quick-add buttons with Foodie red `#C8102E`.

### Issue B30-02: Mutually exclusive Veg/Non-Veg filter buttons
- **Problem**: User should not be able to select both Veg and Non-veg simultaneously.
- **Affected Files**: `frontend/src/pages/customer/Home.jsx`
- **Root Cause**: Filter buttons allowed toggling both active states.
- **Fix**: Ensure selecting Veg deselects Non-Veg, selecting Non-Veg deselects Veg, and selecting All resets both.

### Issue B30-03: Gap between Category badge and Non-Veg badge in Food Details
- **Problem**: Category badge and Non-Veg indicator touch or have insufficient margin in Food Details page.
- **Affected Files**: `frontend/src/pages/customer/FoodDetails.jsx`
- **Root Cause**: Missing horizontal gap in flex container badges.
- **Fix**: Add `gap-3` / `me-3` between category pill and veg/non-veg indicator.

### Issue B30-04: 1 Rupee discrepancy in calculation
- **Problem**: Total amount has a 1-rupee rounding discrepancy between items, GST, charges, and total.
- **Affected Files**: `backend/apps/orders/pricing.py`, `frontend/src/utils/pricing.js`
- **Root Cause**: Frontend and backend used divergent rounding strategies (e.g. `Math.round` per tax line vs Decimal quantize on total).
- **Fix**: Align frontend display to strictly present backend computed values (`round(..., 2)` with `ROUND_HALF_UP`).

### Issue B30-05: Gap between action buttons
- **Problem**: Insufficient spacing between action buttons on Order Confirmation and Cart pages.
- **Affected Files**: `frontend/src/pages/customer/OrderConfirmation.jsx`
- **Root Cause**: Flex containers used tight default margins (`gap-1` or `gap-2`).
- **Fix**: Increase gap to `gap-3` or `gap-4` with responsive wrapping.

### Issue B30-06: Print bill payment status position and subtotal consistency
- **Problem**: Print bill payment status is positioned too far down; subtotal does not match item sum.
- **Affected Files**: `frontend/src/components/orders/EBillModal.jsx`
- **Root Cause**: CSS print layout styles had excessive margins and lacked unified subtotal calculation.
- **Fix**: Compact print layout styles, place payment status directly beneath total, and align subtotal.

### Issue B30-07: Download bill styling consistency
- **Problem**: Download bill layout and spacing did not match print bill.
- **Affected Files**: `frontend/src/utils/generateEBillPDF.js`
- **Root Cause**: PDF generation logic diverged from modal HTML rendering.
- **Fix**: Synchronize PDF font sizes, row heights, and section paddings with modal view.

### Issue B30-08: Table number shows T6 instead of T2
- **Problem**: Customer ordered Table 2, but bill/receipt shows Table 6.
- **Affected Files**: `frontend/src/utils/tableUtils.js`, `frontend/src/components/orders/EBillModal.jsx`
- **Root Cause**: System printed table primary key `id: 6` as `T6` instead of reading `table_number: "T02"`.
- **Fix**: Always extract `table_number` from table relationship or lookup map.

### Issue B30-09: Reordering on same table is slow / hanging
- **Problem**: After placing an order, placing another order for the same table experiences long delays or fails.
- **Affected Files**: `backend/apps/orders/lifecycle.py`, `backend/apps/orders/views.py`
- **Root Cause**: Order creation checked for existing active orders on the same table with unindexed queries and blocking table lock validations.
- **Fix**: Streamline active order table query, use indexed lookup, and allow seamless append/new order creation for active tables without race conditions.

### Issue B30-10: Gap between plus icon and "Continue Order" button text
- **Problem**: Plus icon touches "Continue Order" text.
- **Affected Files**: `frontend/src/pages/customer/OrderTracking.jsx`, `frontend/src/pages/customer/OrderConfirmation.jsx`
- **Root Cause**: Missing margin or `gap` class in the button's flex layout.
- **Fix**: Add `gap-2` and `inline-flex items-center`.

### Issue B30-11: Space between icon and "View" button text
- **Problem**: Icon touches "View" label.
- **Affected Files**: `frontend/src/pages/customer/OrderTracking.jsx`, `frontend/src/pages/customer/Orders.jsx`
- **Root Cause**: Missing spacing between icon SVG and text node.
- **Fix**: Add `gap-2` to button container.

### Issue B30-12: Takeaway orders should not have service charge
- **Problem**: Re-confirmation of service charge removal on takeaway orders.
- **Affected Files**: `backend/apps/orders/pricing.py`
- **Root Cause**: `service_tax` applied to all order types.
- **Fix**: `if order_type == 'TAKEAWAY': service_tax = 0.00`.

### Issue B30-13: Space between icon and "View Bill" / "View Receipt" text
- **Problem**: Icon touches "View Bill" / "View Receipt" label.
- **Affected Files**: `frontend/src/pages/customer/OrderConfirmation.jsx`, `frontend/src/pages/customer/OrderTracking.jsx`
- **Root Cause**: Missing spacing inside the button flex container.
- **Fix**: Add `gap-2` and `inline-flex items-center justify-center`.
