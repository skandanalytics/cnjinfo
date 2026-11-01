# Foodie Customer Module — Bug Status Tracker
**Last Updated:** 2026-10-31  
**Scope:** 29 Issues (16 from 28-10-2026, 13 from 30-10-2026)  
**Overall Status:** All 29 Bugs Fixed & Verified

| Bug ID | Description | Source File(s) | Status | Test / Verification Result |
|---|---|---|---|---|
| **B28-01** | Sub-branch dishes not showing | `backend/apps/menu/public.py`, `frontend/src/services/productService.js` | **Resolved** | Verified: Sub-branches inherit dishes assigned to primary branch while retaining sub-branch specific items. |
| **B28-02** | Customer select T01, checkout shows T10 | `frontend/src/utils/tableUtils.js`, `Checkout.jsx`, `orderContext.js` | **Resolved** | Verified: Exact database `table_number` is preserved; no synthetic `T<id>` conversion. |
| **B28-03** | Inactive coupon visible on customer page | `backend/apps/menu/public.py`, `frontend/src/pages/customer/Cart.jsx` | **Resolved** | Verified: Inactive and expired coupons are excluded from public API and cart preview. |
| **B28-04** | Browse categories icon discrepancy | `frontend/src/pages/customer/Home.jsx` | **Resolved** | Verified: Abstract feather shapes replaced with recognizable food icons (FaBurger, FaPizzaSlice, FaBowlRice, etc.). |
| **B28-05** | Food filter icons (All, Veg, Non-Veg mutual exclusivity) | `frontend/src/pages/customer/Home.jsx` | **Resolved** | Verified: Multi-select checkboxes replaced with mutually exclusive pills: `All`, `Veg`, `Non-Veg`. |
| **B28-06** | Cart item details missing for subsequent items | `frontend/src/components/cart/CartItem.jsx` | **Resolved** | Verified: Every item displays badge, original vs selling price, add-ons/toppings with rates, instructions, and totals. |
| **B28-07** | Dish count mismatch: Customer 3 vs Admin 4 | `backend/apps/menu/public.py` | **Resolved** | Verified: Public menu query joins main and sub-branch items so all assigned dishes show on customer menu. |
| **B28-08** | Deleting last item does not redirect to Home | `frontend/src/pages/customer/Cart.jsx` | **Resolved** | Verified: Deleting the final cart item automatically cleans server cart and redirects to `/customer/home`. |
| **B28-09** | Sticky header not shrinking on scroll | `frontend/src/components/layout/Header.jsx`, `Home.jsx` | **Resolved** | Verified: Window scroll detection compacts header navbar height, logo size, text and cart badge cleanly. |
| **B28-10** | Order bill summary calculating incorrectly | `backend/apps/orders/pricing.py`, `frontend/src/utils/pricing.js` | **Resolved** | Verified: Subtotal, item sums, add-ons, GST, takeaway packing, and round-offs match perfectly. |
| **B28-11** | Takeaway shows packing charge and service charge | `backend/apps/orders/pricing.py`, `frontend/src/utils/pricing.js` | **Resolved** | Verified: Takeaway orders strictly zero out service tax (`if order_type != "TAKEAWAY"`). |
| **B28-12** | Payment status too far & red (Unpaid / pending) | `frontend/src/components/orders/EBillModal.jsx`, `backend/apps/billing/pdf.py` | **Resolved** | Verified: Payment status placed directly below summary totals; bold red `#DC2626` when unpaid, green when paid. |
| **B28-13** | Takeaway bill shows "Thank you for dining" | `EBillModal.jsx`, `backend/apps/billing/pdf.py`, `generateEBillPDF.js` | **Resolved** | Verified: Personalizes takeaway greeting to "Thank you for choosing Foodie. Visit again." |
| **B28-14** | Takeaway bill subtotal mismatch with item sum | `EBillModal.jsx`, `backend/apps/billing/pdf.py` | **Resolved** | Verified: Items table Amount column displays `Qty * Unit Price` matching Subtotal with discounts broken out below. |
| **B28-15** | Download bill date and time discrepancy | `backend/apps/billing/services.py`, `generateEBillPDF.js` | **Resolved** | Verified: `placed_at` formatted in local time (Asia/Kolkata / IST) as `%d %b %Y, %I:%M %p`. |
| **B28-16** | Download bill payment status excessive whitespace | `backend/apps/billing/pdf.py` | **Resolved** | Verified: Reduced vertical Spacer between summary box and payment status from 10pt to 4pt. |
| **B30-01** | Hero section too tall; Dosa add button color | `frontend/src/pages/customer/Home.jsx`, `FoodCard.jsx` | **Resolved** | Verified: Hero padding reduced, font sizes clamped (`clamp(22px, 3vw, 28px)`), image size optimized. |
| **B30-02** | Mutually exclusive Veg/Non-Veg filter buttons | `frontend/src/pages/customer/Home.jsx` | **Resolved** | Verified: Clicking Veg deselects Non-Veg & All; clicking Non-Veg deselects Veg & All; All resets filters. |
| **B30-03** | Gap between Category badge and Non-Veg badge | `frontend/src/pages/customer/FoodDetails.jsx` | **Resolved** | Verified: Added `gap-2.5` and `me-2` between category and dietary badge. |
| **B30-04** | 1 Rupee calculation discrepancy | `backend/apps/orders/pricing.py`, `frontend/src/utils/pricing.js` | **Resolved** | Verified: Replaced integer-rounding with 2-decimal precision matching backend Decimal money formatting. |
| **B30-05** | Gap between buttons in Order Confirmation | `frontend/src/pages/customer/OrderConfirmation.jsx` | **Resolved** | Verified: Increased action buttons container gap to `gap-3.5`. |
| **B30-06** | Print bill: Payment status position & subtotal | `frontend/src/components/orders/EBillModal.jsx` | **Resolved** | Verified: Positioned directly beneath summary totals with bold red/green status styling. |
| **B30-07** | Download bill styling consistency | `backend/apps/billing/pdf.py`, `generateEBillPDF.js` | **Resolved** | Verified: Consistent table column alignment, border styling, and takeaway greeting in PDF generation. |
| **B30-08** | Table number shows T6 instead of T2 | `frontend/src/utils/tableUtils.js`, `Checkout.jsx` | **Resolved** | Verified: Table formatting prioritizes `table.table_number` rather than database auto-increment ID. |
| **B30-09** | Reordering on same table takes time / hangs | `frontend/src/pages/customer/OrderConfirmation.jsx`, `customerCheckout.js` | **Resolved** | Verified: Clears settled/completed `foodie_parent_order_id` so new table orders start cleanly and immediately. |
| **B30-10** | Gap between plus icon and "Continue Order" text | `Home.jsx`, `OrderConfirmation.jsx`, `OrderTracking.jsx` | **Resolved** | Verified: Added `me-2` to plus icons inside all "Continue Order" buttons. |
| **B30-11** | Space between icon and "View" text | `Home.jsx`, `OrderTracking.jsx`, `OrderHistory.jsx` | **Resolved** | Verified: Added `me-1` / `me-1.5` margin to icons before "View Bill" and "View" button text. |
| **B30-12** | Takeaway service charge removal confirmed | `backend/apps/orders/pricing.py`, `pricing.js` | **Resolved** | Verified: Enforced zero service charge on takeaway across backend and frontend. |
| **B30-13** | Space between symbol and "View Bill / Receipt" text | `OrderConfirmation.jsx`, `OrderTracking.jsx` | **Resolved** | Verified: Added `me-2` to `FiFileText` and `me-1.5` to `bi-receipt` in all receipt buttons. |
