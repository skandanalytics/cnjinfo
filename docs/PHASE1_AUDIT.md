# Phase 1 Audit Report

> **Update:** the SRS and the Django employee-auth project were supplied after this report was written. Sections 1, 3, 5 and 6 below that say they were "not found / not available" are superseded by `PHASE1_ADDENDUM.md`, which also revises the backend decision (extend the supplied Django project instead of rebuilding).

Date: 2026-10-09. Scope: audit only, no application code changed.

## 1. What was accessible

| Reference | Status | Notes |
|---|---|---|
| Workspace `d:\curser\foodie` | **Empty**, not a git repo | No source, no config, no tests |
| `SRS Document.ver2.docx` | **Not found** | Searched `D:\` (depth 4), Desktop, Downloads, Documents |
| `Foodie_Django_Employee_Auth_Project.zip` | **Not found** | No Django source available at all |
| `D:\foodie.zip` (frontend archive) | **Found, inspected** | Extracted to a temp folder (not the workspace), excluding `node_modules`, `.git` and `.locust_env` |

Contents of `foodie.zip` beyond the React app: `foodie BRD-v2.docx`, `Foodie BRD.docx`, `Foodie work flow.docx`, `Frontend Development Status.docx`, `Ui pages.docx` (9 embedded images, not yet extracted or reviewed), 8 PNG/JPEG UI screenshots (menu, add/edit/delete menu, add table, tables, order page, order details, login, dashboard), `foodie implementation_plan` (a React Native plan; **stale, conflicts with the React web app**), and `QR_implementation_plan`.

**The BRD v2 is not the SRS.** It is useful evidence, but it does not replace `SRS Document.ver2.docx` and has no UI mockups (0 embedded images).

## 2. Verified findings: frontend (from `foodie.zip`)

- **Stack:** React 19, Vite 8, react-router-dom 7, axios, Bootstrap 5 and bootstrap-icons, react-icons, jspdf (client-side e-bill), qrcode. **JavaScript (JSX), no TypeScript.** Linter is oxlint. No test framework in `package.json`.
- **Styling:** Bootstrap plus CSS files. `variables.css` (primary `#b51f3a`) and `theme.css` (primary `#be123c`) **define different primary reds**, so the theme is inconsistent. This needs SRS screenshots to resolve.
- **Routes** (`AppRoutes.jsx`): customer (`/customer/welcome|login|home|food/:id|cart|checkout|payment|order-confirmation|orders|order-tracking/:id|display-board`), admin (`/admin/dashboard|orders|tables|menus|kitchen|users|inventory|branches|offers|settings`), employee (`/employee/dashboard|tables|orders`). Employee pages **reuse the admin `Orders`/`Tables` components behind `AdminRoute`**.
- **Duplicate legacy pages** exist in `src/pages/*.jsx` (Home, Cart, Login, Payment, ...) next to `pages/customer/*`. They are probably dead code, and `Home.jsx` and `FoodDetails.jsx` import mock data (`data/foodData`, `data/mockData`).
- **State:** Context API (`AuthContext`, `CartContext` at about 42 KB, `OrderContext`, `AppContext`).
- **Browser storage:** about **518** `localStorage`/`sessionStorage` references. Role tokens are in `foodie_token_admin|customer`, and a guest cart, order IDs, phone and employee-password overrides are also stored there.
- **API client** (`services/api.js`): axios base `/api`, a GET cache plus in-flight dedupe, and optional backup-URL failover. The cache key includes the token. Vite proxy target is hardcoded to `http://192.168.150.171:8000`.
- **Dev residue:** about 45 `scratch/` scripts, `test-*.cjs`, `users.json` (a real user dump with phone numbers and emails, a **privacy risk**) and `.env` files.

## 3. Verified findings: existing backend (inferred only from captured 404 pages and frontend calls)

A Django project named `foodie_project` runs at `192.168.150.171:8000` with DRF-style routers (`api/users/…`, `api/restaurant/…`, `api/orders/…`, `api/admin/coupons/`). Responses use an envelope `{state:{code,message}, count, pagination, data}`. `/api/token/` returns 404, so there is **no token or JWT auth endpoint**.

Resources the frontend calls:
- `users/users`, `users/roles`, `users/user-roles`, `users/addresses`
- `restaurant/restaurants`, `restaurant/tables`, `restaurant/categories`, `restaurant/food`, `restaurant/food-images`, `restaurant/inventory`
- `orders/orders`, `orders/order-items`, `orders/carts`, `orders/cart-items`, `orders/payments`
- `coupons`, `admin/coupons`, `admin/audit-logs`
- Legacy aliases without prefixes: `tables`, `qr-codes`, `carts`, and others.

**Not verifiable:** models, serializers, permissions, database engine (the BRD says "backend-managed database"; MySQL is not confirmed), and whether the server still runs. **The backend source is not in hand.**

## 4. Critical defects and security gaps (verified in frontend code)

| ID | Severity | Finding | Evidence |
|---|---|---|---|
| S1 | Critical | **Admin password is checked in the browser** (`=== '123456'`) | `authService.js` ~L191 |
| S2 | Critical | **Employee login validated client-side** against passwords fetched from `users/users`, localStorage overrides, or default `'123456'`. The API returns a `password` field to the browser. | `authService.js` ~L255, 301-315 |
| S3 | Critical | **Tokens are fake:** `dummy-token` and `token_emp_<id>_<random>`. No server session exists. | `AuthContext`, `authService` |
| S4 | Critical | **OTP is frontend/demo only**; the code comments say there is no backend OTP endpoint | `authService.js` L482 |
| S5 | High | Customer accounts are created with a synthesized email and password `'hash_pwd'` | `authService.js` ~L390-397 |
| S6 | High | **Pricing, GST (5%), service charge (2%), packing (Rs 15/item) and coupon math run in the browser.** The SRS requires server-side pricing. | `utils/pricing.js` |
| S7 | High | Roles come from browser storage and `AdminRoute` guards, with no backend authorization | `AuthContext`, routes |
| S8 | Medium | `users.json` (real PII) and `.env` with an internal IP are in the archive | root |
| S9 | Medium | Auth state is duplicated in both sessionStorage and localStorage, so logout clears many keys by hand. This explains the reported state-leak and account-switching issues. | `AuthContext.logout` |

Implication: **the existing backend appears to be a generic CRUD layer** with no auth, OTP, permission, pricing or payment logic. The existing frontend compensates on the client. **The target requirements cannot be met by wiring up the current backend.** A real backend has to be built (Phases 2-8).

## 5. Gap analysis against the target (known requirements)

| Area | Status in `foodie.zip` frontend | Gap |
|---|---|---|
| Customer OTP login | UI exists, OTP is fake | Backend OTP and provider needed |
| Guest cart and merge | Client-side, localStorage | Server cart plus merge needed |
| QR/table | `qrService`, `QRDisplayModal`, URL params `?table=`/`?qr=` | Server-side validation and unique codes |
| Dine-In/Takeaway | Order type modal exists | Server rules (no table for takeaway) |
| Coupons | Frontend marked "in progress"; math in `pricing.js` | Server engine, first-time rules |
| Razorpay | Only `paymentService.js` (427 B) and Payment.jsx | Entire integration is missing |
| Pay on Counter | Not verified | Missing or unknown |
| E-bill PDF | `generateEBillPDF.js` (client jsPDF) | Server-side invoice from persisted data |
| Real-time | None found (polling and `foodie_orders_updated` events) | Channels and WebSockets are missing |
| Branch isolation | Frontend filtering only | Backend enforcement missing |
| Inventory | Pages exist | Transactional stock logic is unknown or missing |
| Audit | `auditLogService` | Server-side append-only audit |
| Tests | Only ad hoc scratch scripts | No automated tests |

## 6. Missing information (blocks safe decisions)

1. `SRS Document.ver2.docx`, needed for the field-level requirements and **all UI screenshots** (Section 2A cannot start without it).
2. Django backend source (`Foodie_Django_Employee_Auth_Project.zip` and the backend running at `192.168.150.171`), needed to decide reuse vs rebuild.
3. Confirmation that MySQL 8 is the live database and whether production data must be migrated.
4. The exact rules for first-time coupons (the "additional eligible coupon") and the order status vocabulary.
5. GST/service-charge/packing rates: the frontend uses 5%, 2% and Rs 15/item. They are **not confirmed by the SRS**, so treat them as unverified configuration.

See `docs/ARCHITECTURE.md`, `docs/IMPLEMENTATION_PLAN.md`, `docs/KNOWN_ISSUES.md`.
