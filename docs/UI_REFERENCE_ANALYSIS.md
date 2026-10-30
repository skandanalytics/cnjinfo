# FOODIE — UI REFERENCE DETAILED ANALYSIS (ALL 16 SCREENSHOTS)

This document provides a comprehensive, screenshot-by-screenshot UI/UX design analysis of the 16 reference screenshots in `foodie_theme_pages_separate`. It serves as the single source of truth for the Foodie design system across colors, typography, dimensions, spacing, border radii, shadows, cards, modals, and responsive states.

---

## 1. Reference 01: `01_admin_dashboard_light.png`
- **Design Family**: Admin Dashboard (Light Mode)
- **Overall Page Structure**: Two-column layout with fixed left sidebar (dark navy) and dynamic right main content area on an off-white/light grey background canvas (`#F5F7FA`).
- **Header Dimensions**:
  - Height: `70px`
  - Background: `#FFFFFF` with bottom border `1px solid #E3E7ED`
  - Elements: Hamburger menu icon (`22px`), pill search input (`width: 320px`, `height: 42px`, `rounded-pill`), action icons (Notification bell with red dot badge, sound/alert icon), User Profile Pill with circular red avatar (`38px × 38px`), bold user name (`foodieadmin`), and role label (`Admin`).
- **Sidebar Width and Styling**:
  - Width: `240px`
  - Background: Dark Navy/Slate (`#111827` to `#161F30`)
  - Header: Brand logo with red rounded square (`F` inside `#C8102E`, `36px × 36px`) and title `Foodie Admin` (`16px`, bold, white).
  - Navigation Items: Height `44px`, horizontal padding `16px`, margin `4px 12px`, border radius `10px`.
  - Inactive State: Icon `18px`, label `14px`, text color `#94A3B8`, subtle hover background `rgba(255,255,255,0.06)`.
  - Active State (Dashboard): Vibrant Foodie Red background (`#C8102E` with gradient to `#D9223F`), white text and icon, soft brand glow (`box-shadow: 0 4px 12px rgba(200, 16, 46, 0.35)`).
- **Main Content Position & Padding**:
  - Offset: `margin-left: 240px` (desktop), top padding `24px`, horizontal padding `28px`, bottom padding `32px`.
  - Top Section: Title `Dashboard` (`24px`, bold `#1E293B`), subtitle `Welcome back! Here's what's happening today.` (`14px`, `#64748B`), Date Range dropdown (`Today v`) and calendar date indicator (`27 Oct 2026`).
- **Card Dimensions & Spacing**:
  - KPI Stat Cards: 4 equal-width cards in a 4-column responsive grid (`gap: 20px`).
  - Stat Card Metrics:
    - *Total Revenue*: `₹12,450`, green trend badge `+12.5% from last week` with soft green circular trend icon (`38px`).
    - *Pending Orders*: `4`, `+2 new`, red heart circular badge.
    - *Orders in Progress*: `8`, `3 in kitchen`, yellow clipboard circular badge.
    - *Available Tables*: `12`, `of 20 tables`, blue layers circular badge.
  - Card Styling: `background: #FFFFFF`, `border: 1px solid #E2E8F0`, `border-radius: 16px`, `box-shadow: 0 2px 8px rgba(0,0,0,0.04)`, padding `20px`.
- **Chart & List Cards**:
  - Two-column bottom section (`gap: 20px`):
    - *Sales Overview* (Left, ~60% width): Header with title and filter pill (`This Week v`), Area line chart with smooth red spline (`#C8102E`), red fill gradient (`rgba(200, 16, 46, 0.15)` to transparent), interactive red tooltip pill `₹12,050` with bottom pointer pin.
    - *Top Selling Items* (Right, ~40% width): Header with title and red link `View All`, 3 item rows:
      - Item: Food thumbnail (`48px × 48px`, `border-radius: 10px`), item title (`Pani Puri`, `Masala Dosa`, `Veg Biryani`), order count (`42 orders`), and horizontal progress bar (Foodie red for top rank, orange for lower rank).

---

## 2. Reference 02: `02_admin_dashboard_dark.png`
- **Design Family**: Admin Dashboard (Dark Mode)
- **Overall Page Structure**: Identical layout to Light Mode, operating entirely on dark charcoal/slate tones.
- **Color Tokens**:
  - Background Canvas: `#0F172A` (deep dark slate)
  - Card Surfaces: `#1E293B`
  - Sidebar: `#0B1120` (pitch dark navy)
  - Borders: `1px solid #334155`
  - Primary Text: `#F8FAFC`
  - Secondary Text: `#94A3B8`
  - Accent / Active: Foodie Red `#E61E40`
  - Circular Icon Containers: Semi-transparent tinted dark circles (e.g. `rgba(34, 197, 94, 0.15)` for revenue green icon, `rgba(230, 30, 64, 0.15)` for pending orders).
- **Chart Behavior**:
  - Chart grid lines: `#334155`
  - Glow on line chart: Red spline with glowing translucent red underfill gradient.
  - Tooltip: Vibrant Foodie red badge with sharp contrast white text.

---

## 3. Reference 03: `03_create_branch.png`
- **Design Family**: Global Modal / Form System
- **Modal Dimensions**:
  - Width: `460px`
  - Border radius: `20px`
  - Background: `#FFFFFF`
  - Shadow: `0 20px 40px rgba(0,0,0,0.15)`
  - Padding: `28px`
- **Header**:
  - Title: `Add New Branch` (`18px`, bold `#1E293B`)
  - Close button: `x` icon (`20px`, `#64748B`, hover `#1E293B`)
- **Form Layout**:
  - 2x2 grid (`gap: 18px`):
    - Row 1: `Branch Name *` (text input) | `Restaurant *` (select dropdown with chevron)
    - Row 2: `Location *` (text input) | `Status *` (select dropdown with `Active`)
  - Form Labels: `13px`, font-weight `600`, color `#334155`, with red required asterisk (`*` in `#C8102E`).
  - Inputs: Height `42px`, border `1.5px solid #CBD5E1`, border-radius `10px`, background `#FFFFFF`, font-size `14px`, text `#1E293B`, focus ring `#C8102E`.
- **Footer Buttons**:
  - 2 equal-sized action buttons (`flex: 1`, `height: 44px`, `rounded-pill`):
    - `Cancel`: Background `#FFFFFF`, border `1.5px solid #C8102E`, text `#C8102E`, font-weight `600`.
    - `Create Branch`: Background `#C8102E`, border none, text `#FFFFFF`, font-weight `600`, subtle brand shadow.

---

## 4. Reference 04: `04_branch_created_success.png`
- **Design Family**: Global Success Modal / Popup
- **Dimensions & Styling**:
  - Width: `420px`
  - Background: `#FFFFFF`
  - Border radius: `20px`
  - Padding: `28px`
  - Shadow: `0 20px 40px rgba(0,0,0,0.12)`
- **Header Banner**:
  - Rounded container (`background: #ECFDF5`, `border: 1px solid #A7F3D0`, `border-radius: 14px`, padding `16px`).
  - Left: Large circular checkmark icon (`44px × 44px`, vibrant emerald green `#10B981` circle with white checkmark).
  - Right: Heading `Branch Created Successfully!` (`16px`, bold `#065F46`), description `The new branch has been added to your system.` (`13px`, `#047857`).
- **Body Details**:
  - 2-column detail grid (`margin-top: 24px`):
    - Column 1: Label `Branch Code` (`13px`, `#64748B`), Value `BR-003` (`22px`, bold `#0F172A`).
    - Column 2: Label `Branch Name` (`13px`, `#64748B`), Value `Tumakuru Main` (`18px`, bold `#0F172A`).

---

## 5. Reference 05: `05_menu_management.png`
- **Design Family**: Admin Menu Management
- **Page Header**:
  - Title: `Menu Management` (`22px`, bold)
  - Subtitle: `Manage your dishes, categories and offers.` (`13px`, `#64748B`)
  - Action Controls: Search dish input (`rounded-pill`, `width: 260px`), Category dropdown (`All Categories v`), Food type dropdown (`Veg v`), Status dropdown (`All Status v`), and Primary CTA `+ Add Menu` (`rounded-pill`, `#C8102E`, white text, bold).
- **Dish Cards Grid**:
  - 4-column responsive grid (`gap: 20px`).
  - Dish Card:
    - Dimensions: Equal card height (~`320px`), background `#FFFFFF`, border `1px solid #E2E8F0`, border-radius `16px`, overflow hidden, shadow `0 2px 6px rgba(0,0,0,0.04)`.
    - Image: Full-width top photo (`height: 150px`, `object-fit: cover`, `border-radius: 12px` inside 10px padding).
    - Badges on Image:
      - Offer badge (top-left): Red pill with discount e.g. `₹10 OFF`.
      - Veg / Non-Veg icon (top-right): Green bordered square with solid green circle (standard FSSAI veg symbol) or red triangle for non-veg.
    - Card Body:
      - Item Name: `16px`, bold `#1E293B` (e.g. `Pani Puri`, `Masala Dosa`, `Veg Biryani`, `Veg Burger`).
      - Category: `12px`, muted `#64748B` (`Chats`, `Main Course`, `Rice`, `Fast Food`).
      - Price & Status Row: Left has current price in bold red (`₹47.50`) and original price strikethrough (`₹60.00`). Status pill: `In Stock` (soft green pill) or `Low Stock` (soft orange pill).
      - Card Footer / Actions:
        - Edit button (circular outline with pencil icon).
        - Delete button (circular red outline with red trash icon).
        - Quick Add button: Solid red circle with white plus icon (`36px × 36px`).

---

## 6. Reference 06: `06_add_edit_menu.png`
- **Design Family**: Add / Edit Dish Modal
- **Dimensions**: Width `540px`, border radius `20px`, padding `28px`, background `#FFFFFF`.
- **Header**: Title `Add New Menu Item`, close `x` icon.
- **Body Layout**:
  - Left column (~30% width): `Upload Image` dashed border area (`140px × 140px`, `border: 2px dashed #93C5FD`, light blue fill `#F0F7FF`, camera/image icon, center label `Upload Image`).
  - Right column (~70% width):
    - `Item Name *` (text input, e.g. `Masala Dosa`)
    - Row: `Category *` (select dropdown) | `Food Type *` (select `Veg` / `Non-Veg`)
  - Bottom Rows:
    - Row 1: `Price (₹) *` (number input, `0.00`) | `Description` (textarea with placeholder `Enter description...`, spanning right column).
    - Row 2: `Status` (select dropdown with `In Stock` / `Out of Stock`).
- **Footer**:
  - Cancel button (`rounded-pill`, red outline, red text).
  - Save Menu button (`rounded-pill`, solid Foodie red `#C8102E`, white text).

---

## 7. Reference 07: `07_pos_take_order_dine_in.png` & Reference 08: `08_pos_take_order_takeaway.png`
- **Design Family**: Admin / Employee POS Interface
- **Layout**: Two main columns — Catalog Area (Left, ~65% width) and Current Order Panel (Right, ~35% width).
- **Top Order Type Switcher**:
  - Segmented toggle at top left: `Dine-in` (active: solid red pill `#C8102E`, white text) vs `Takeaway` (inactive: grey border pill, dark text). In Reference 08, `Takeaway` is active and `Dine-in` is inactive.
- **Catalog Controls**:
  - Dish search bar (`rounded-pill`, `width: 100%`, height `40px`).
  - Category Filter Pills: Horizontal scrollable pills: `All` (active red pill), `Chats`, `Main Course`, `South Indian`, etc.
- **Product Card Grid**:
  - 4 columns of food items with image, item name, price, and round red `+` add button.
- **Current Order Side Panel**:
  - Header: `Current Order` title (`16px`, bold) and soft red `Clear` button (`rounded-pill`, `#FEE2E2` bg, red text).
  - Order Items List:
    - Food thumbnail (`44px × 44px`, rounded `8px`).
    - Title (`Pani Puri`, `Masala Dosa`), unit price (`₹47.50`).
    - Stepper: Pill stepper with `-`, quantity count, `+` (`rounded-pill`, border `#CBD5E1`).
    - Item total on right (`₹95.00`, bold).
  - Price Summary Box:
    - `Items Total`: `₹180.00`
    - `Menu Discount`: `-₹9.00` (green text)
    - `Taxable Amount`: `₹171.00`
    - `GST (5%)`: `₹8.55`
    - `Grand Total`: `₹179.55` (`20px`, bold red `#C8102E`)
  - Footer Action Buttons:
    - `Save Order`: `rounded-pill`, red outline, white background, red text.
    - `Proceed to Payment`: `rounded-pill`, solid Foodie red `#C8102E`, white text, bold.

---

## 8. Reference 09: `09_tables.png`
- **Design Family**: Admin & Staff Table Management
- **Header**:
  - Title: `Tables`
  - Subtitle: `Manage dine-in tables and availability.`
  - Controls: Location filter dropdown (`All Locations v`), Summary legend with colored dots:
    - Green dot: `Available (12)`
    - Red dot: `Occupied (8)`
- **Table Card Grid**:
  - 5-column responsive grid of table cards.
  - Card Dimensions & Styling:
    - Padding: `20px`
    - Border-radius: `16px`
    - Table Code: `T01`, `T02`, ..., bold `18px`.
    - Section/Zone: `Indoor`, `Rooftop`, `Garden` (`13px`, muted `#64748B`).
    - Status Badge:
      - Available: Soft mint background (`#ECFDF5`), green dot, green bold text `Available` (`#10B981`).
      - Occupied: Soft blush red background (`#FEF2F2`), red dot, red bold text `Occupied` (`#EF4444`).

---

## 9. Reference 10: `10_track_existing_order.png`
- **Design Family**: Track Existing Order Dialog / Modal
- **Dimensions**: Width `520px`, border-radius `20px`, background `#FFFFFF`, padding `24px`.
- **Header**:
  - Left: `Table T01 - Existing Order` (`16px`, bold `#1E293B`), `Order #79` (`20px`, extra bold `#0F172A`), metadata: `Dine-in • 28 Oct 2026, 4:32 pm`, `Customer: +919248157423`.
  - Right: Status Pill: `Ongoing` (`rounded-pill`, emerald green `#10B981`, white text, bold).
  - Close button `x` top right.
- **Items Table**:
  - Table Header: Red bar (`background: #C8102E`, white text, columns: `Item`, `Qty`, `Amount`).
  - Rows: Alternating clean rows with item name, quantity, and line amount (`₹47.50`, `₹170.00`).
- **Financial Breakdown**:
  - `Subtotal`: `₹217.50`
  - `Menu Discount`: `-₹10.00`
  - `GST (5%)`: `₹10.38`
  - `Grand Total`: `₹217.88` (`20px`, bold red `#C8102E`)
- **Footer Buttons**:
  - `Close`: Pill button, light grey border.
  - `Continue Order`: Pill button, red outline, red text.
  - `Proceed to Bill`: Pill button, solid red background `#C8102E`, white text.

---

## 10. Reference 11: `11_kitchen_queue.png`
- **Design Family**: Kitchen Display System / Queue
- **Header Tabs**:
  - Pill tabs: `New (3)` (active solid red pill `#C8102E`), `Preparing (5)`, `Ready (2)`, `Completed (12)`.
  - Right: Branch dropdown (`All Branches v`).
- **Kitchen Order Cards**:
  - 2-column or 3-column card grid (`gap: 20px`).
  - Card Dimensions: `border-radius: 16px`, `border: 1px solid #E2E8F0`, padding `20px`.
  - Card Header:
    - Left: Order ID `#FD00061`, elapsed time `2 mins ago`, circular type icon (red bell/pot for Dine-in, blue for Takeaway).
    - Right: Status Pill: `New` (warm amber/peach pill) or `Preparing` (soft blue pill).
  - Metadata: `Dine-in • T01` or `Takeaway`.
  - Items List:
    - Item line: Bold item name and multiplier e.g. `Pani Puri × 2`.
    - Customization note: Blue/muted text e.g. `(Extra: Sevapuri Masala)`, `(Extra: Extra Chutney, Sambar)`.
  - Action Footer:
    - If New: `Reject` (red outline pill) and `Start Preparing` (solid red pill).
    - If Preparing: `Mark Ready` (solid emerald green pill `#10B981`) and `View Details` (grey outline pill).

---

## 11. Reference 12: `12_orders_admin_employee.png`
- **Design Family**: Admin & Staff Orders Table
- **Header & Filters**:
  - Title: `Orders` (`22px`, bold), subtitle: `Manage and track all orders.`
  - Filter Pills: `All` (active red pill), `Dine-in`, `Takeaway`.
  - Dropdowns: Status filter (`Completed v`), Date selector (`27 Oct 2026 x`).
- **Table Structure**:
  - Columns: `Order #`, `Table`, `Type`, `Amount`, `Status`, `Payment`, `Actions`.
  - Data rows:
    - `Order #`: Monospace bold `#FD00061`, `#FD00062`, etc.
    - `Table`: `T01`, `-`, `T02`.
    - `Type`: `Dine-in`, `Takeaway`.
    - `Amount`: `₹145.50`, `₹220.00`.
    - `Status Badges`:
      - `New`: Soft peach/yellow pill (`#FEF3C7`, text `#D97706`).
      - `Preparing`: Soft blue pill (`#EFF6FF`, text `#2563EB`).
      - `Ready`: Soft mint green pill (`#ECFDF5`, text `#059669`).
      - `Completed`: Soft grey/slate pill (`#F1F5F9`, text `#475569`).
      - `Canceled`: Soft blush red pill (`#FEE2E2`, text `#DC2626`).
    - `Payment Badges`:
      - `Paid`: Soft green pill (`#ECFDF5`, green text `#10B981`).
      - `Unpaid`: Soft grey pill (`#F1F5F9`, muted text `#64748B`).
    - `Actions`: `View` button (`rounded-pill`, red outline, red text, padding `4px 16px`).

---

## 12. Reference 13: `13_customer_menu_light.png`
- **Design Family**: Customer Home / Food Menu
- **Top Navigation Bar**:
  - Logo: Red rounded square with `F` (`36px × 36px`), title `Foodie` (bold), branch label `Tumakuru Main` (`12px`, muted `#64748B`).
  - Right Controls: Cart icon with red badge counter (`1`), Order History icon, QR code/takeaway icon, User Profile icon.
- **Hero Promotional Banner**:
  - Full-width hero banner with warm cream/peach gradient, appetizing food photography (bowls of biryani, curry, tomatoes), bold red heading:
    - `Delicious Food` (red `#C8102E`)
    - `For Every Mood` (red `#C8102E`)
    - Subtext: `Fresh ingredients, tasty dishes, great moments.`
- **Search & Category Navigation**:
  - Floating pill search bar: `Search for dishes...` with search magnifying glass icon.
  - Category Pills: Horizontal scrollable pills with cute category icons:
    - `All` (active red pill `#C8102E`)
    - `Chats` (icon + label)
    - `South Indian`
    - `North Indian`
    - `Fast Food`
    - `Beverages`
- **Dish Cards Grid**:
  - 4 cards per row.
  - Image with rounded corners (`12px`), badges:
    - `₹10 OFF` (red pill badge)
    - Veg icon (green square)
    - `Popular` (teal pill badge)
  - Details: Item name (`Pani Puri`, `Masala Dosa`, `Veg Biryani`), prices (`₹47.50` with `₹60.00` strikeout), and circular red `+` add button (`36px × 36px`, red background `#C8102E`, white icon).

---

## 13. Reference 14: `14_customer_cart_checkout.png`
- **Design Family**: Customer Cart & Checkout
- **Progress Stepper**:
  - 4-step horizontal progress bar:
    - Step 1: `Cart` (active: red circle with white check/icon, label `Cart` in bold red).
    - Connecting line: Red for completed/active step.
    - Step 2: `Customer Details`
    - Step 3: `Payment`
    - Step 4: `Confirmation`
- **Two-Column Layout**:
  - Left: `My Order` Card
    - Header: Title `My Order`, action link `Clear Cart` (soft pink text).
    - Items: Dish thumbnail, name, price, red subtitle link `+ Add Instructions & Toppings`, pill stepper (`-`, `qty`, `+`), total price.
    - Promo Code Section: Label `Have a Promo Coupon?`, text input (`FOODIE50`), red `Apply` button (`rounded-pill`), green success confirmation pill `Coupon applied! You saved ₹35.00`.
  - Right: `Order Summary` Card
    - `Items Total`: `₹180.00`
    - `Menu Discount`: `-₹9.00` (green text)
    - `Taxable Amount`: `₹171.00`
    - `Coupon Discount`: `-₹35.00` (highlighted in soft red pill row with bold red text)
    - `GST (5%)`: `₹8.55`
    - `Round Off`: `-₹0.05` (green text)
    - `Grand Total`: `₹144.50` (`22px`, bold red `#C8102E`)
    - CTA: `Proceed to Checkout` (full-width `rounded-pill`, solid Foodie red `#C8102E`, white text, bold, height `48px`).

---

## 14. Reference 15: `15_order_confirmation_web.png`
- **Design Family**: Customer Order Confirmation (Desktop Web)
- **Container**: Centered white card (`width: 580px`, `border-radius: 20px`, `box-shadow: 0 10px 30px rgba(0,0,0,0.08)`, padding `36px`).
- **Success Header**:
  - Large green circular icon (`56px × 56px`, emerald green `#10B981` circle with white checkmark).
  - Title: `Order Placed Successfully!` (`22px`, bold `#1E293B`).
  - Subtitle: `Order number FD00060` (`14px`, `#64748B`).
- **Order Details Key-Value Table**:
  - `Status`: `Pending` (bold `#1E293B`)
  - `Order Type`: `Dine-in`
  - `Dining Table`: `T01` (bold `#1E293B`)
  - `Payment`: `Pay at the counter`
  - `Items`: `2 items`
  - `Total`: `₹144.50` (`20px`, bold red `#C8102E`)
- **Action Buttons**:
  - 3 pill action buttons in a row (`gap: 12px`):
    - `View E-Bill / Receipt`: `rounded-pill`, red outline, red text.
    - `Track Order`: `rounded-pill`, red outline, red text.
    - `Order Again`: `rounded-pill`, red outline, red text.

---

## 15. Reference 16: `16_order_confirmation_mobile.png`
- **Design Family**: Customer Order Confirmation (Mobile Viewport)
- **Mobile Frame**: Compact width (`360px - 414px`).
- **Mobile Header**: Foodie red logo icon, title `Foodie`, cart icon with notification dot.
- **Card Content**:
  - Green circular checkmark icon centered.
  - Headline: `Order Placed!` (`20px`, bold).
  - Subtitle: `Order number FD00060`.
  - Compact detail rows: Status (`Pending`), Order Type (`Dine-in`), Dining Table (`T01`), Payment (`Pay at the counter`), Items (`2 items`), Total (`₹144.50` in bold red).
  - Stacked full-width pill action buttons:
    - Button 1: `View E-Bill / Receipt` (`rounded-pill`, red outline, red text, full width).
    - Button 2: `Track Again` (`rounded-pill`, red outline, red text, full width).

---

## Summary of Global Design Tokens Extracted from 16 References
1. **Primary Accent**: `#C8102E` (Foodie Red), hover `#A90E27`, dark-mode `#E61E40`
2. **Surfaces**: Light canvas `#F5F7FA`, Dark canvas `#0F172A`, Card `#FFFFFF` / `#1E293B`
3. **Sidebar**: `#111827` (Navy), active item `#C8102E` with brand glow `0 4px 12px rgba(200,16,46,0.35)`
4. **Border Radii**: Cards `16px`, Modals `20px`, Buttons `rounded-pill` (`9999px`), Inputs `10px - 12px`
5. **Button Geometry**: All primary/secondary action buttons use `rounded-pill` pill shapes.
