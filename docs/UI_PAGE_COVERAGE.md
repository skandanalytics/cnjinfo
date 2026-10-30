# FOODIE — UI PAGE COVERAGE MATRIX

This matrix tracks the complete application route inventory, user roles, reference screenshot mappings, UI components used, and implementation verification status.

---

## 1. Customer Pages

| Route | Page Name | Role | Reference Screenshot | Layout & Components | Status |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `/` | Splash Screen | Guest | Mobile Onboarding | Minimal brand hero, Red `F` logo, animated loader | Verified |
| `/customer/welcome` | Welcome Screen | Guest | Mobile Onboarding | Hero banner, Dine-In / Takeaway selector, Pill CTA | Verified |
| `/customer/login` | Mobile Login | Guest | Panel 4 / Onboarding | Phone input, OTP input, Pill Login button | Verified |
| `/login` | Staff / Admin Login | Staff/Admin | Panel 4 / Auth | Split card, username/password inputs, pill submit | Verified |
| `/signup` | Staff / Admin Signup | Guest/Admin | Panel 4 / Auth | Form inputs, role select, pill register button | Verified |
| `/customer/home` | Customer Menu | Customer | `13_customer_menu_light.png` | CustomerHeader, Hero banner, Category pills, FoodCard grid | Verified |
| `/customer/food/:id` | Dish Details | Customer | `13_customer_menu_light.png` | Large image, Veg icon, spice level, toppings, Pill Add-to-cart | Verified |
| `/customer/cart` | Cart & Checkout | Customer | `14_customer_cart_checkout.png` | 4-step stepper, item list with stepper, coupon input, summary | Verified |
| `/customer/checkout` | Customer Details & Table | Customer | `14_customer_cart_checkout.png` | Table selector, customer phone, notes, pill submit | Verified |
| `/customer/payment` | Payment Method | Customer | `14_customer_cart_checkout.png` | Pay at counter, Cash, UPI options, order summary | Verified |
| `/customer/order-confirmation` | Order Confirmation | Customer | `15_order_confirmation_web.png` & `16_order_confirmation_mobile.png` | Green checkmark, order metadata, 3 pill buttons (E-Bill, Track, Reorder) | Verified |
| `/customer/orders` | Order History | Customer | `12_orders_admin_employee.png` | Customer orders list, status badges, view e-bill modal | Verified |
| `/customer/order-tracking/:id` | Live Order Tracking | Customer | `15_order_confirmation_web.png` / Track | Step tracker (Received, Preparing, Ready, Delivered), Bill CTA | Verified |
| `/customer/display-board` | Kitchen Display Board | Public/Staff | `11_kitchen_queue.png` | Large token numbers under Preparing and Ready columns | Verified |

---

## 2. Admin Management Pages

| Route | Page Name | Role | Reference Screenshot | Layout & Components | Status |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `/admin/dashboard` | Admin Dashboard | Admin | `01_admin_dashboard_light.png` & `02_admin_dashboard_dark.png` | AdminSidebar, AdminHeader, 4 StatCards, Line Chart, Top Sellers | Verified |
| `/admin/pos` | Take Order / POS | Admin | `07_pos_take_order_dine_in.png` & `08_pos_take_order_takeaway.png` | Dine-in/Takeaway toggle, category pills, FoodCard grid, Current Order | Verified |
| `/admin/orders` | Orders Management | Admin | `12_orders_admin_employee.png` | Filter pills, status dropdown, date picker, orders table, action pills | Verified |
| `/admin/tables` | Table Management | Admin | `09_tables.png` | Location dropdown, available/occupied legend, 5-column TableCard grid | Verified |
| `/admin/kitchen` | Kitchen Queue | Admin/Chef | `11_kitchen_queue.png` | Status tabs (New, Preparing, Ready, Completed), KitchenOrderCards | Verified |
| `/admin/menus` | Menu Management | Admin | `05_menu_management.png` & `06_add_edit_menu.png` | Dish search, category/veg/status filters, FoodCards, AddDishModal | Verified |
| `/admin/inventory` | Inventory Management | Admin | Panel 12 Design Family | Inventory table, stock level badges, RestockItemModal with pills | Verified |
| `/admin/branches` | Branch Management | Admin | `03_create_branch.png` & `04_branch_created_success.png` | Branch cards/table, AddBranchModal (2x2 grid), BranchCreatedSuccess modal | Verified |
| `/admin/users` | Employee Management | Admin | Panel 4 / 12 Design Family | Staff table, role badges, AddEmployeeModal, success popup with checkmark | Verified |
| `/admin/offers` | Coupons & Offers | Admin | Panel 4 / 12 Design Family | Active coupon cards, AddCouponModal with pill buttons | Verified |
| `/admin/settings` | Restaurant Settings | Admin | Panel 1 Design Family | Tabs (General, Printing, Tax), form inputs, pill save buttons | Verified |
| `/db` | Database Health Console | Admin/Dev | Developer Utility | System check status, table diagnostics, pill actions | Verified |

---

## 3. Employee Pages

| Route | Page Name | Role | Reference Screenshot | Layout & Components | Status |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `/employee/dashboard` | Staff Dashboard | Staff | `01_admin_dashboard_light.png` | Assigned tables, live pending orders, quick actions | Verified |
| `/employee/pos` | Staff POS / Take Order | Staff | `07_pos_take_order_dine_in.png` & `08_pos_take_order_takeaway.png` | Catalog grid, table selector, current order panel, proceed to bill | Verified |
| `/employee/orders` | Staff Orders Tracking | Staff | `12_orders_admin_employee.png` | Staff order table, live statuses, invoice view | Verified |
| `/employee/tables` | Staff Table Status | Staff | `09_tables.png` | Table cards grid, occupied status toggle | Verified |
| `/employee/kitchen` | Kitchen Order Display | Kitchen Staff | `11_kitchen_queue.png` | Kitchen order queue, start preparing, mark ready | Verified |
| `/employee/inventory` | Staff Stock View | Staff | Panel 12 Design Family | Low stock alerts, stock counts | Verified |
