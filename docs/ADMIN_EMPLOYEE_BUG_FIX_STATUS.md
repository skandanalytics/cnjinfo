# ADMIN & EMPLOYEE BUG FIX STATUS TRACKING DOCUMENT

Generated on: 2026-11-05
Scope: Admin and Employee Modules Only. Customer Module is strictly frozen.

---

## 1. Deferred Work (Customer Module)
- **Issue:** WELCOME100 coupon restriction & multi-coupon application (PDF Issue 1).
  - **Reason:** Customer-facing coupon functionality. Customer module is strictly frozen per task instructions.
  - **Status:** DEFERRED to Customer Phase.

---

## 2. Issues Breakdown and Status

| Issue # | Description | Affected Area | Root Cause | Files Modified | Fix Details | Status |
|---|---|---|---|---|---|---|
| **PDF 2** | Low-stock and out-of-stock dish visibility | Admin POS | Dish cards lacked clear badge presentation and clipped badges when stock was low or zero | `frontend/src/pages/admin/Pos.jsx` | Clear badges `Low Stock (N)` (warning pill) and `Out of Stock` (danger pill) displayed beside price row without clipping | **Resolved & Verified** |
| **PDF 3** | POS dish card buttons | Admin POS | Initial unadded dish cards had duplicate button layout | `frontend/src/pages/admin/Pos.jsx` | Unadded dish card displays only `Customize` (outlined with red border & icon) and `Add` (+ icon) buttons. Stepper only shown once added | **Resolved & Verified** |
| **PDF 4** | Selected table info layout | Admin POS | Seat capacity and location were on single line or wrapped awkwardly | `frontend/src/pages/admin/Pos.jsx` | Clean 2-line layout in selected table section: Line 1 = Seat capacity with icon; Line 2 = Location (`Indoor Main`) with pin icon | **Resolved & Verified** |
| **PDF 5** | Remove blue-box-marked control | Admin POS | Redundant in-page branch dropdown selector in POS header duplicate with global Admin header branch selector | `frontend/src/pages/admin/Pos.jsx` | Removed local branch `<select>` dropdown from POS header. Single global branch selector in top navbar now governs POS | **Resolved & Verified** |
| **PDF 6** | Admin Tables page filters | Admin Tables | Location & Status filter buttons/toolbar were cluttering the top bar | `frontend/src/pages/admin/Tables.jsx` | Removed top Location buttons and status dropdown; retained clean `SearchBar` and table count pills | **Resolved & Verified** |
| **3.1** | Super Admin Edit Page | Admin Users/Staff | Super Admin form displayed redundant Department, Role Access, and Designation fields | `frontend/src/pages/admin/Users.jsx` | Hidden Department, Role Access, and Designation fields when editing `SUPER_ADMIN`. Relaxed validation requirements for those fields for Super Admin | **Resolved & Verified** |
| **3.2** | Responsive POS Layout | Admin POS | Viewport/zoom clipping, unequal button widths on bottom actions | `frontend/src/pages/admin/Pos.jsx` | Equal-width action buttons (`Confirm Order` and `Proceed to Payment` flex: 1 1 0), clean responsive layout | **Resolved & Verified** |
| **3.3** | POS Order Instructions | Admin POS | Customizations and special instructions were not displayed under the dish in POS cart ticket | `frontend/src/pages/admin/Pos.jsx` | Item-level special instructions and options are rendered directly beneath the dish name in the cart list | **Resolved & Verified** |
| **3.4** | Branch Name Character Limit (15 chars) | Admin Branches & Backend | Branch name input allowed unrestricted length; branch cards overflowed long addresses | `backend/apps/branches/serializers.py`, `frontend/src/pages/admin/Branches.jsx` | Enforced 15-character maximum in backend serializer (`validate_name`), frontend input `maxLength={15}`, validation check, and address truncation with ellipsis tooltip | **Resolved & Verified** |
| **3.5** | Admin & Employee Responsiveness | Admin/Employee Layouts | Mobile responsive layout had sidebar overlapping on smaller screens | `frontend/src/components/layout/AdminLayout.jsx`, `frontend/src/index.css` | Verified responsive sidebar backdrop, mobile toggle, and responsive container wrapping | **Resolved & Verified** |
| **3.6** | Branch Switching Data Sync & Notifications | Admin Header & Settle Payment | Notifications were showing cross-branch alerts; continuation orders (#25 and #25.1) left child orders unpaid when paying parent | `frontend/src/services/notificationService.js`, `frontend/src/components/layout/AdminLayout.jsx`, `backend/apps/payments/services.py` | Notifications scoped by `selectedBranch.id`; counter payment automatically marks all continuation sub-orders atomically as `PAID` | **Resolved & Verified** |
| **3.7 & 3.8** | Kitchen Queue Layout & Spacing | Admin Kitchen Queue | Fixed column height caused huge vertical whitespace gaps when columns were empty | `frontend/src/pages/admin/Kitchen.jsx` | Removed fixed `620px` height; added `FiChevronLeft` back arrow button; increased header title size; cards now render naturally | **Resolved & Verified** |
| **3.9** | Admin Login Page Default Credentials | Auth / Admin Login | Screen displayed static helper box with `Admin ID: ADMIN` and `Password: Admin@123` | `frontend/src/pages/auth/Login.jsx` | Completely removed default credentials helper card; login form remains pristine and clean | **Resolved & Verified** |
| **Runtime 1** | `selectedBranch` before initialization | Admin Layout | Temporal dead zone error caused by hook reordering | `frontend/src/components/layout/AdminLayout.jsx` | Declared `selectedBranch` before dependent memoized notification filters | **Resolved & Verified** |
| **Runtime 2** | `assignedBranchName is not defined` | Employee Layout & Dashboard | `assignedBranchName` was accidentally deleted during the previous header cleanup | `frontend/src/components/layout/AdminLayout.jsx` | Restored `assignedBranchName` computation from `user.branchName`, `user.branchId`, and `user.branch` | **Resolved & Verified** |

---

## 3. Build & Test Summary
1. **Frontend Production Build**: `npm run build` completed successfully (exit code 0).
2. **Django Backend System Check**: `python manage.py check` completed with 0 errors.
3. **Puppeteer Headless Chrome E2E Test**:
   - Admin Login page: Default credentials card confirmed ABSENT.
   - Admin Branches page: Branch cards and character constraints verified.
   - Admin POS page: Dish card buttons, stock badges, and 2-line table layout verified.
   - Admin Tables page: Location/Status filter bar cleanly removed; search bar intact.
   - Kitchen Queue: Back button present, heading enlarged, gaps eliminated.
   - Admin Users modal: Super Admin edit fields streamlined.
   - Employee Login: Logged in as `EMP0088`, verified URL `http://localhost:5173/employee/dashboard`, verified header shows assigned branch `Banglore main`, tested page refresh and mobile viewport.
