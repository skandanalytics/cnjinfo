# FOODIE — UI COMPONENT INVENTORY

This inventory defines all shared, reusable UI components required to reproduce the 16 reference designs consistently across the entire Foodie application.

---

## 1. Layout & Navigation Components

### 1.1 `AdminSidebar`
- **Location**: `src/components/layout/Sidebar.jsx`
- **Usage**: Admin Dashboard, POS, Orders, Tables, Kitchen, Menu Management, Inventory, Branches, Employees, Offers, Settings.
- **Reference**: `01_admin_dashboard_light.png`, `02_admin_dashboard_dark.png`
- **Features**:
  - Dark navy container (`#111827`, border-right `1px solid #1F2937`, width `240px`).
  - Brand header with red `F` logo box (`36px × 36px`, `border-radius: 8px`) and white `Foodie Admin` text.
  - Active menu link indicator: Solid Foodie red background (`#C8102E`), white text and icon, `border-radius: 10px`, brand glow shadow (`0 4px 12px rgba(200, 16, 46, 0.35)`).
  - Inactive links: Text color `#94A3B8`, hover background `rgba(255,255,255,0.06)`, text `#FFFFFF`.
  - Collapsible drawer on mobile/tablet viewports (`z-index: 1050`).

### 1.2 `AdminHeader`
- **Location**: `src/components/layout/Header.jsx`
- **Usage**: All staff and admin pages.
- **Reference**: `01_admin_dashboard_light.png`, `02_admin_dashboard_dark.png`
- **Features**:
  - Height `70px`, white background `#FFFFFF` in light mode, `#1E293B` in dark mode.
  - Sidebar toggle hamburger button.
  - Pill search bar with magnifying glass icon (`rounded-pill`, background `#F1F5F9`, border `none`).
  - Action icons: Notification bell with red notification dot badge, alert sound icon.
  - User profile widget: Circular red avatar (`38px × 38px`), bold user name (`foodieadmin`), role label (`Admin`), and chevron dropdown.

### 1.3 `CustomerHeader`
- **Location**: `src/components/layout/CustomerHeader.jsx`
- **Usage**: Customer Welcome, Menu, Food Details, Cart, Checkout, Order Tracking, History.
- **Reference**: `13_customer_menu_light.png`, `16_order_confirmation_mobile.png`
- **Features**:
  - Red `F` logo and bold `Foodie` text.
  - Branch location subtitle e.g. `Tumakuru Main`.
  - Cart button with red pill count badge.
  - Orders history quick-link, Takeaway/Dine-in mode switcher, and customer profile button.

---

## 2. Card Components

### 2.1 `StatCard` (Dashboard Metric Card)
- **Location**: `src/components/dashboard/StatCard.jsx`
- **Usage**: Admin Dashboard, Employee Dashboard, Analytics.
- **Reference**: `01_admin_dashboard_light.png`, `02_admin_dashboard_dark.png`
- **Features**:
  - Card dimensions: `border-radius: 16px`, `background: var(--surface-color)`, `border: 1px solid var(--border-color)`.
  - Padding: `20px`.
  - Metric label: `13px`, `#64748B`.
  - Metric big number: `24px - 28px`, bold `#0F172A`.
  - Circular badge icon container: `44px × 44px` circle with matching soft background and colored icon.
  - Trend badge: `+12.5% from last week` in green/red text.

### 2.2 `FoodCard` (Menu & POS Food Card)
- **Location**: `src/components/menu/FoodCard.jsx`
- **Usage**: Menu Management, POS Take Order, Customer Menu.
- **Reference**: `05_menu_management.png`, `07_pos_take_order_dine_in.png`, `13_customer_menu_light.png`
- **Features**:
  - Image container: `height: 140px - 160px`, `border-radius: 12px`, `object-fit: cover`.
  - Badges on image: Discount pill (`₹10 OFF`), Veg/Non-Veg icon (FSSAI green circle or red triangle), Popular pill (`Popular`).
  - Item name: Bold `16px`.
  - Category / description: Muted `13px`.
  - Price display: Bold red current price (`₹47.50`) and strikethrough original price (`₹60.00`).
  - Action buttons:
    - *Admin view*: Circular edit icon, circular delete icon, circular red add button.
    - *Customer/POS view*: Bold circular red `+` add button (`36px × 36px`).

### 2.3 `TableCard`
- **Location**: `src/components/tables/TableCard.jsx`
- **Usage**: Tables page (Admin & Employee).
- **Reference**: `09_tables.png`
- **Features**:
  - Dimensions: `border-radius: 16px`, padding `20px`.
  - Table number: `T01`, `T02`, ..., bold `18px`.
  - Location subtitle: `Indoor`, `Rooftop`, `Garden`.
  - Status pill:
    - Available: Mint green background (`#ECFDF5`), green dot, bold text `Available`.
    - Occupied: Soft blush background (`#FEF2F2`), red dot, bold text `Occupied`.

### 2.4 `KitchenOrderCard`
- **Location**: `src/components/kitchen/KitchenOrderCard.jsx`
- **Usage**: Kitchen Queue (Admin & Employee).
- **Reference**: `11_kitchen_queue.png`
- **Features**:
  - Order ID: `#FD00061`, elapsed time badge: `2 mins ago`.
  - Order type icon: Circular icon for Dine-in or Takeaway.
  - Status pill: `New` (peach pill), `Preparing` (blue pill), `Ready` (mint pill).
  - Dish list with quantity multipliers (`Pani Puri × 2`) and customized extras notes in muted blue.
  - Action buttons: Pill buttons for `Reject`, `Start Preparing`, `Mark Ready`, and `View Details`.

---

## 3. Modal and Dialog Components

### 3.1 `Modal` (Central Dialog Wrapper)
- **Location**: `src/components/common/Modal.jsx`
- **Usage**: Used by all modal popups across the system.
- **Reference**: `03_create_branch.png`, `04_branch_created_success.png`, `06_add_edit_menu.png`, `10_track_existing_order.png`
- **Features**:
  - Darkened backdrop overlay (`rgba(15, 23, 42, 0.5)` with blur).
  - Centered dialog container with `border-radius: 20px`, padding `28px`, shadow `0 20px 40px rgba(0,0,0,0.15)`.
  - Clean header with title and close icon button.
  - Responsive max-width (`420px` to `640px`).

### 3.2 `BranchModal` (Create/Edit Branch)
- **Location**: `src/components/branches/BranchModal.jsx`
- **Usage**: Branch Management.
- **Reference**: `03_create_branch.png`
- **Features**:
  - 2x2 grid form: Branch Name, Restaurant, Location, Status.
  - Pill action buttons: `Cancel` (red outline) and `Create Branch` (solid red).

### 3.3 `SuccessModal` / Confirmation Popup
- **Location**: `src/components/common/SuccessModal.jsx`
- **Usage**: Branch creation, order placement, action confirmations.
- **Reference**: `04_branch_created_success.png`
- **Features**:
  - Soft green top banner with circular green checkmark icon.
  - Headline and description.
  - 2-column key-value metrics (e.g. Branch Code `BR-003`, Branch Name `Tumakuru Main`).

### 3.4 `MenuModal` (Add/Edit Dish)
- **Location**: `src/components/menu/AddDishModal.jsx` & `EditDishModal.jsx`
- **Usage**: Menu Management, Food Editor.
- **Reference**: `06_add_edit_menu.png`
- **Features**:
  - Image upload dropzone (`140px × 140px`, dashed blue border, light blue background).
  - Dish name, Category select, Food type select (`Veg`/`Non-Veg`), Price, Description textarea, Status select.
  - Pill footer action buttons.

### 3.5 `TrackOrderModal`
- **Location**: `src/components/orders/TrackOrderModal.jsx`
- **Usage**: POS, Tables, Orders.
- **Reference**: `10_track_existing_order.png`
- **Features**:
  - Table number, Order number, Order time, Customer phone.
  - Red table header bar (`Item`, `Qty`, `Amount`).
  - Financial breakdown (Subtotal, Discount, GST, Grand Total in red).
  - Pill buttons: `Close`, `Continue Order`, `Proceed to Bill`.

---

## 4. Form and Input Components

### 4.1 Form Fields
- **Input text / number**: Height `42px`, `border-radius: 10px`, border `1.5px solid #CBD5E1`, focus ring `#C8102E`.
- **Select Dropdown**: Height `42px`, `border-radius: 10px`, custom chevron arrow.
- **Textarea**: `border-radius: 12px`, padding `12px`, placeholder `#94A3B8`.
- **Search Pill**: Height `40px - 44px`, `rounded-pill`, leading search icon.
- **Stepper**: `rounded-pill`, decrement `-` button, bold number display, increment `+` button.

---

## 5. Button Components

### 5.1 Button Variants
- **Primary Pill**: `background: #C8102E`, white text, `border-radius: 9999px`, height `42px - 48px`, font-weight `600`, brand shadow.
- **Secondary / Outline Pill**: `background: #FFFFFF`, border `1.5px solid #C8102E`, text `#C8102E`, `border-radius: 9999px`.
- **Neutral / Cancel Pill**: `background: #FFFFFF`, border `1px solid #CBD5E1`, text `#475569`, `border-radius: 9999px`.
- **Success Pill**: `background: #10B981`, white text, `border-radius: 9999px`.
- **Icon Circle Button**: `36px × 36px` circular button for edit, delete, or quick add.

---

## 6. Status Badge System

| Status | Background | Text Color | Border |
| :--- | :--- | :--- | :--- |
| **New** | `#FEF3C7` (amber/peach) | `#D97706` | None |
| **Preparing** | `#EFF6FF` (soft blue) | `#2563EB` | None |
| **Ready** | `#ECFDF5` (soft mint) | `#059669` | None |
| **Completed** | `#F1F5F9` (neutral slate) | `#475569` | None |
| **Canceled / Rejected** | `#FEE2E2` (blush red) | `#DC2626` | None |
| **Paid / Available** | `#ECFDF5` (emerald light) | `#10B981` | None |
| **Unpaid / Occupied** | `#FEF2F2` (blush light) | `#EF4444` | None |
| **In Stock** | `#ECFDF5` (emerald light) | `#10B981` | None |
| **Low Stock** | `#FEF3C7` (amber light) | `#D97706` | None |
| **Ongoing** | `#10B981` (solid green) | `#FFFFFF` | None |

All status badges use `border-radius: 9999px` (`rounded-pill`), font-weight `600`, font-size `12px`, padding `4px 12px`.
