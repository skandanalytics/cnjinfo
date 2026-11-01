# FOODIE — PROJECT-WIDE UI REDESIGN & THEME ADOPTION PLAN

## 1. Executive Summary
This document establishes the authoritative design system tokens, component architecture, reference screenshot mapping, and implementation roadmap for adopting the new Foodie Restaurant Management UI theme across every page, modal, popup, table, and customer-facing view in the codebase.

---

## 2. Global Design System Tokens

### 2.1 Color Palette
| Token Name | Light Mode Hex | Dark Mode Hex | Usage |
|---|---|---|---|
| `--primary-color` | `#F20D2D` | `#F20D2D` | Brand primary red, active nav pills, primary CTAs |
| `--primary-hover` | `#D60925` | `#D60925` | Hover state for primary buttons |
| `--primary-light` | `#FEECEE` | `rgba(242, 13, 45, 0.15)` | Soft red badge backgrounds, alert tints |
| `--sidebar-bg` | `#101B29` | `#0D1622` | Dark navy sidebar background |
| `--sidebar-border` | `#182638` | `#182638` | Sidebar right border and dividers |
| `--sidebar-text` | `#94A3B8` | `#94A3B8` | Sidebar inactive icons and labels |
| `--sidebar-text-active` | `#FFFFFF` | `#FFFFFF` | Sidebar active pill text and icon |
| `--background-color` | `#F2F7FC` | `#101B29` | Main layout background |
| `--surface-color` | `#FFFFFF` | `#182638` | Cards, modals, drawers, panels |
| `--surface-muted` | `#F8FAFC` | `#1E2D42` | Table headers, secondary containers |
| `--border-color` | `#DCE6F2` | `#24354A` | Card borders, input borders, table borders |
| `--text-primary` | `#101828` | `#F8FAFC` | Main headings, card titles, body text |
| `--text-secondary` | `#64748B` | `#94A3B8` | Subtitles, helper text, timestamps |
| `--success-color` | `#16A34A` | `#22C55E` | In Stock, Available, Paid, Completed |
| `--success-light` | `#DCFCE7` | `rgba(34, 197, 94, 0.15)` | Soft green badge background |
| `--warning-color` | `#F59E0B` | `#F59E0B` | Low Stock, Preparing, Reserved |
| `--warning-light` | `#FEF3C7` | `rgba(245, 158, 11, 0.15)` | Soft amber badge background |
| `--danger-color` | `#EF4444` | `#EF4444` | Out of Stock, Occupied, Cancelled, Unpaid |
| `--danger-light` | `#FEE2E2` | `rgba(239, 68, 68, 0.15)` | Soft red badge background |
| `--info-color` | `#2563EB` | `#3B82F6` | Ready/Serving, Takeaway badges |
| `--info-light` | `#EFF6FF` | `rgba(59, 130, 246, 0.15)` | Soft blue badge background |

### 2.2 Typography & Radii
- **Heading Font**: Inter / -apple-system, sans-serif
- **Main Heading**: 24–28px, font-weight 700
- **Section Heading**: 18–20px, font-weight 700
- **Card Title**: 15–16px, font-weight 600
- **Body**: 13–14px, font-weight 400/500
- **Supporting / Meta**: 11–12px, font-weight 500
- **Card Border Radius**: `14px` (`rounded-4`)
- **Modal Border Radius**: `16px` (`rounded-4`)
- **Button Border Radius**: Pill (`9999px`) for actions, `8–10px` (`rounded-3`) for form controls
- **Badge Border Radius**: Pill (`9999px`) with dot indicator (`●`)

---

## 3. Complete Route & Component Reference Mapping

| Page / Route | Component File | Reference Image | Status & Scope |
|---|---|---|---|
| `/admin/dashboard` | `Dashboard.jsx` | `media_1793468490614_7f3d7132.png` | 4 StatCards, Sales Chart (8 cols), Top Selling (4 cols), Recent Activity (8 cols), Business Performance (4 cols) |
| `/admin/pos`, `/employee/pos` | `Pos.jsx` | `media_1793468490621_59382f0b.jpg` | Dine-in/Takeaway toggle, category pills, 4-col food cards with steppers, right order drawer |
| `/admin/orders`, `/employee/orders` | `Orders.jsx` | `media_1793468490567_6319585a.png` | Order type pills (All, Dine-in, Takeaway), date picker, export pill, table with badges, slide-out Order Details & Bill |
| `/admin/tables`, `/employee/tables` | `Tables.jsx` | `media_1793468454920_e202f718.png` | Stat cards, filter bar, table cards with illustrations & status pills, Add Dining Table modal |
| `/admin/kitchen`, `/employee/kitchen` | `Kitchen.jsx` | `media_1793468454789_dd9e6b2f.png` | 4 Kanban columns (New Tickets, Preparing, Ready/Serving, Completed), time ago, special instructions callouts |
| `/admin/menus` | `MenuEditor.jsx`, `Menus.jsx` | `media_1793468454789_a59e8997.jpg` | 4-col dish cards with photo, orders badge, veg/non-veg indicator, price, discount strikethrough, edit/delete icon buttons |
| `/admin/categories` | In `MenuEditor.jsx` & `CategoryModal.jsx` | Multi-panel 10 (`media_1793468454836_23c9d542.jpg`) | Category cards grid with photo, name, dish count, add/edit modal |
| `/admin/branches` | `Branches.jsx` | Multi-panel 1 & 2 (`media_1793468454836_23c9d542.jpg`) | Clean data table (Branch Code, Name, Location, Status, Actions) + Add Branch modal |
| `/admin/users` | `Users.jsx` | Multi-panel 3 & 4 (`media_1793468454836_23c9d542.jpg`) | Employee directory data table with photos, role, phone, status + Add Employee modal |
| `/admin/inventory`, `/employee/inventory` | `Inventory.jsx` | Multi-panel 5 & 6 (`media_1793468454836_23c9d542.jpg`) | Inventory data table (Item Name, Category, Stock, Min Count, Status, Actions) + Restock modal |
| `/admin/offers` | `Offers.jsx` | Multi-panel 7 & 8 (`media_1793468454836_23c9d542.jpg`) | Coupons & Offers data table + Add Coupon modal |
| `/admin/reports` | `Analytics.jsx` | Closest matching reference (Derived) | Sales & revenue charts, export PDF/Excel, filter by branch and date |
| `/admin/settings` | `Settings.jsx` | Closest matching reference (Derived) | Tabbed restaurant settings, tax/GST, profile, notifications, theme |
| `/customer/home` | `Home.jsx` | Multi-panel 13 | Foodie red hero, category pills, food cards with circular quick-add button |
| `/customer/cart` | `Cart.jsx` | Multi-panel 14 | Cart items with steppers, coupon apply box, order summary breakdown, red pill checkout button |
| `/customer/checkout` | `Checkout.jsx` | Multi-panel 14 | 4-step stepper, Dine-In table selection, takeaway option, bill summary |
| `/customer/order-confirmation` | `OrderConfirmation.jsx` | Multi-panel 15 & 16 | Order placed success icon, order number, details, 3 red outline pill action buttons |
| `/customer/order-tracking/:id` | `OrderTracking.jsx` | Multi-panel 15 & 16 | Live vertical status pipeline, order details card, view receipt modal |

---

## 4. Modal, Dialog & Popup Standardization
Every popup across the application will use the centralized `AppModal` styling:
- Top-right close icon button
- Form field labels with red asterisks for required fields
- Rounded input fields (`rounded-3`, `#DCE6F2` border)
- Red outline pill for cancel (`Cancel`)
- Solid red pill for primary action (`Create`, `Save`, `Add`, `Restock`)
- Success / Warning / Delete modals with centered icon and consistent action buttons
