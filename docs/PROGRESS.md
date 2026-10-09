# Progress

| Phase | Status | Notes |
|---|---|---|
| 1 Audit | Complete, approved | Decisions Q1-Q10 resolved with the recommendations ("go with your recommendations"). |
| 2 Django + MySQL foundation | Complete, approved | See below. |
| 3 Authentication and access control | Complete, approved | See "Phase 3 report". |
| 4 Branches, tables, QR, categories, foods | Complete, approved | See "Phase 4 report". |
| 5 Inventory, coupons, discounts, pricing | Complete, approved | See "Phase 5 report". |
| 6 Carts, guest merge, public menu | Complete, approved | See "Phase 6 report". |
| 7 Orders, kitchen queue, live updates | Complete, approved | See "Phase 7 report". |
| 8 Payments, pay-on-counter, e-bills | Complete, approved | See "Phase 8 report". |
| 9 Admin interface wiring | Complete, approved | See "Phase 9 report". |
| 10 Employee interface wiring | Complete, approved | See "Phase 10 report". |
| 11 Integration and E2E tests | Complete, approved | See "Phase 11 report". |
| 12 Deployment and release | Complete, awaiting approval | See "Phase 12 report". |

## Phase 2 report

1. **Files created:** `backend/` (manage.py, `config/` settings/urls/wsgi/asgi, `requirements.txt`, `.env.example`, `.env` (local, git-ignored)), 10 apps under `backend/apps/` (accounts, branches, menu, inventory, carts, coupons, orders, payments, billing, audit) with models, admin, and `0001_initial` migrations; `backend/tests/test_models.py`; root `.gitignore`; `docs/DATABASE_DESIGN.md`.
2. **Models/migrations:** 25 domain tables (including 2 many-to-many join tables) among 36 tables in total with Django/JWT-blacklist tables; see `DATABASE_DESIGN.md`. All migrations **applied successfully to MySQL 8.0.45** (`foodie_db`). `makemigrations --check` reported "No changes detected".
3. **APIs:** none yet (by design; Phase 3+). Django admin is registered for all models.
4. **Screens/workflows:** none.
5. **Requirements addressed (schema level only):** REQ-DATA-01, REQ-ORD-01 (DB-level table rule), REQ-INV-01 (schema), REQ-QR-02 (unique QR UUID), REQ-PAY-01 (idempotency schema), REQ-BILL-01 (invoice schema), REQ-SEC-01 (branch FK on all scoped tables; not yet enforced in code).
6. **Tests executed:** `manage.py test tests` -> **20 tests, all passed** on MySQL (isolated `test_foodie_db`). They cover: hashed passwords, employee branch rule, unique employee code, per-branch table numbers, unique QR, PROTECT on branches/categories/orders, branch/category consistency, stock status (default threshold 5), DB-enforced non-negative stock, duplicate order deduction rejected, one active cart per user and branch, cart owner required, coupon uniqueness and date checks, Dine-In/Takeaway table rule, unique order number and idempotency key, Decimal precision, one successful payment per order, webhook replay rejected. They test the schema only, not business logic.
7. **Known issues / blockers:**
   - Tax rates (GST, service, takeaway) default to 0 until an admin configures them; actual values still unconfirmed (Q3).
   - Python 3.14 + PyMySQL: a version shim in `config/settings.py` is needed because Django 5.2 checks for `mysqlclient` versions. Works in tests; flag for deployment review (consider `mysqlclient` in production).
   - Asian-locale/`utf8mb4` collation and MySQL CHECK constraints rely on MySQL >= 8.0.16 (we have 8.0.45).
   - The MySQL root password was shared in chat; it was used once, not stored in any file. Consider rotating it.
8. **Remaining:** everything in Phases 3-12; frontend not imported yet.
9. **Next:** Phase 3 (customer OTP login, employee-code login, JWT with blacklist, permission classes, branch-scoping mixin, logout/account-switch behavior) with tests.

Docs: `PHASE1_AUDIT.md`, `PHASE1_ADDENDUM.md`, `ARCHITECTURE.md`, `IMPLEMENTATION_PLAN.md`, `SRS_REQUIREMENTS.md`, `KNOWN_ISSUES.md`, `UI_SCREEN_TRACEABILITY.md`, `UI_DESIGN_TOKENS.md`, `DATABASE_DESIGN.md`, `PROGRESS.md`.

## Phase 3 report

1. **Files created/modified:** ackend/apps/accounts/ (phone.py, sms.py, otp.py, permissions.py, scoping.py, services.py, serializers.py, iews.py, urls.py; models.py comment/clean tweak), config/settings.py (throttles, cache, OTP/lockout settings), config/urls.py, 	ests/test_auth.py, docs/API_SPECIFICATION.md.
2. **Models/migrations:** none changed (`makemigrations --check`: No changes detected).
3. **APIs:** uth/otp/send, uth/otp/verify, uth/staff/login, uth/refresh, uth/logout, uth/me, and employees CRUD (see API_SPECIFICATION.md).
4. **Screens/workflows:** none (frontend not imported yet).
5. **Requirements addressed (backend):** REQ-AUTH-01 (OTP with expiry, resend and verify limits), REQ-AUTH-03 (admin-created employees, hashed passwords, employee-code login), REQ-AUTH-05 (role and branch permissions, branch scoping helper), REQ-AUTH-04 (server side: logout blacklists tokens, per-user identity from the database), first-time-customer detection (SRS 3.1.5, flag only).
6. **Tests executed:** `manage.py test tests` -> **57 tests, all passed** on MySQL (20 schema + 37 auth). Covered: OTP hashed and single use, wrong-code lockout, expiry, cooldown, hourly cap, console provider refused when DEBUG is off, staff numbers refused for OTP, first-time flag, staff login (generic errors, lockout, inactive, customer refused), identity read from DB (suspension takes effect on a live token), account switching, logout/refresh rotation/blacklist, foreign-token logout refused, employee CRUD (hashing, no password in responses, branch isolation, privilege escalation blocked, branch rules, weak/duplicate input, deactivate revokes tokens, no self-deactivation, password change revokes sessions, filters/search, audit rows), scope helper.
   During testing two defects in my own code were found and fixed: failed staff login returned 403 instead of 401, and OTP error codes were lost.
7. **Known gaps / blockers:**
   - **No real SMS provider** (none chosen). Only the dev console provider exists; production OTP will not work until a provider is configured (it fails closed, no bypass).
   - Login lockout and throttle counters use an in-process cache; a shared cache (Redis) is needed with more than one server process.
   - **Frontend session isolation is not addressed yet** (frontend not imported); only the server side is done.
   - Guest cart persistence/merge on login belongs to Phase 6; order-ownership permission for customers is applied when orders get endpoints (Phase 6-7).
   - Access tokens live 30 minutes after logout (stateless JWT); refresh tokens are revoked immediately, and inactive users are rejected immediately.
   - Concurrent OTP sends for one phone can race past the hourly cap by a request or two (minor; not locked).
8. **Remaining:** Phases 4-12.
9. **Next:** Phase 4: branches, tables, QR resolution/generation, categories, foods, images, customizations with CRUD APIs, branch scoping, and tests.

## Phase 4 report

1. **Files created/modified:** `backend/apps/branches/` (`serializers.py`, `views.py`, `urls.py`, `qr.py`), `backend/apps/menu/` (`serializers.py`, `views.py`, `urls.py`), `backend/apps/accounts/` (`mixins.py` new; `permissions.py` adds `IsOwnerLevel`, `StaffReadAdminWrite`, inactive-branch lockout), `orders/models.py` (`ACTIVE_STATUSES` constant), `config/settings.py` and `urls.py`, `requirements.txt` (qrcode), tests `tests/helpers.py`, `test_branches_tables.py`, `test_menu.py`, docs `API_SPECIFICATION.md`.
2. **Models/migrations:** none changed (`makemigrations --check`: No changes detected).
3. **APIs:** branches, tables (+ set-status, QR image, regenerate-qr), public QR resolve, categories, foods, food images, customization options (see `API_SPECIFICATION.md`).
4. **Screens/workflows:** backend only. Frontend still not imported.
5. **Requirements addressed (backend):** REQ-QR-01, REQ-QR-02, REQ-TBL-01, REQ-MENU-01 (CRUD, diet types, images, customizations; customer-side filtering is Phase 6), REQ-ADM-02 (branch, menu), REQ-SEC-01 (branch isolation on these resources), decision Q1 (branch soft-delete).
6. **Tests executed:** `manage.py test tests` -> **103 tests, all passed** on MySQL (20 schema + 37 auth + 46 new). New coverage: branch create/edit/search/filter/deactivate/reactivate and its effects, owner-vs-branch-admin rights, table creation in the correct branch, duplicate and capacity validation, QR uniqueness/PNG/regeneration/inactive handling and identical failure responses, table lifecycle and the rule that a table with an unfinished order cannot be vacated, delete-vs-deactivate rules, category/dish CRUD with category filtering, search/ordering, cross-branch rejection, history preservation after dish edit/deactivate, real image upload (file on disk, absolute URL, primary logic, bad type/oversize/corrupt rejection), customizations, audit rows.
   Two of my own tests were wrong and were corrected (duplicate-name case-insensitivity; a GIF check). No production-code defects were found in this phase's run.
7. **Known gaps:**
   - Image serving over HTTP via the `/media/` route (DEBUG only) was **not** exercised by an automated test; the stored file and URL path are verified. Production needs the web server or object storage to serve media.
   - List endpoints are unpaginated arrays; the old frontend expected `{state,data,pagination}`. Decide the envelope when the frontend is integrated.
   - Per-branch dish price ("branch price") is the dish's own `price` because dishes are branch-scoped; there is no shared cross-branch menu. Table "linked menu" is not modeled (decision Q5).
   - Dish discounts, coupons and inventory are Phase 5.
8. **Remaining:** Phases 5-12.
9. **Next:** Phase 5: inventory (restock, adjustments, ledger, status), dish discounts, coupons, first-time rules, and the central pricing service.

## Phase 5 report

1. **Files created/modified:** `apps/inventory/` (`services.py`, `serializers.py`, `views.py`, `urls.py`), `apps/menu/` (`pricing_helpers.py`; discount serializer/view/route; richer dish serializer), `apps/coupons/` (`services.py`, `serializers.py`, `views.py`, `urls.py`), `apps/orders/` (`pricing.py`, `views.py`, `urls.py`), `config/urls.py` and `settings.py` (quote throttle), tests `test_inventory.py`, `test_pricing.py` and shared helpers, docs `API_SPECIFICATION.md`.
2. **Models/migrations:** none changed (`makemigrations --check`: No changes detected).
3. **APIs:** inventory (CRUD-minus-delete, summary, restock, adjust, ledger), dish discounts, coupons (+ redemptions), `pricing/quote`.
4. **Screens/workflows:** backend only.
5. **Requirements addressed (backend):** REQ-INV-01, REQ-PRICE-01, REQ-CPN-01, REQ-CPN-02, dish discounts (SRS 3.2.7), stock deduction primitives for SRS 3.2.5 (wired to orders in Phase 7-8).
6. **Tests executed:** `manage.py test tests` -> **161 tests, all passed** on MySQL (103 earlier + 58 new). Includes real-thread concurrency tests: 10 simultaneous orders against 4 units sell exactly 4 (final stock 0, 4 ledger rows), and 6 simultaneous deductions of the same order deduct once. Also covered: status thresholds, restock/adjust/ledger integrity, negative stock refused by the database, all-or-nothing deduction, restore-once, pricing arithmetic (dine-in, takeaway, half-up rounding, zero rates), dish-discount rules and non-overlap, expired/future/inactive discounts, coupon rules (first-time auto + one extra, returning customer one only, guests never first-time, one-time use, cancelled-order release, usage limits, caps, minimum after dish discount, offer progress), staff-assisted first-time lookup, rejection reasons, client prices ignored, stock validation across lines, branch isolation and permissions.
   Two test-side mistakes were corrected (expected message wording; deleting a ledger-protected record, which itself confirmed the protection works).
7. **Known gaps / needs your input:**
   - **Tax/charge rates and formula are unconfirmed.** Branch GST, service and takeaway charge default to 0. The order of operations follows the legacy frontend (decision Q3 still open): confirm (a) rates, (b) takeaway charge flat per order vs per item, (c) service charge excluding the takeaway charge, (d) "exceeds the minimum" treated as >= minimum.
   - Stock is only *validated* by quotes; actual deduction happens at order creation (Phase 7-8). Nothing reserves stock between quote and order.
   - Dishes without an inventory record are treated as unlimited. Inventory "delete" from the SRS screens is not offered (ledger protection); say if you want a different behavior.
   - Per-customer coupon limits beyond the first-time rule are not in the SRS and were not added.
   - The old frontend's coupon rounding (whole rupees) is replaced by 2-decimal rounding.
8. **Remaining:** Phases 6-12.
9. **Next:** Phase 6: server carts (guest token + customer), guest-to-customer merge on login, checkout validation, idempotent order creation hooks, customer menu/QR entry endpoints.


## Phase 6 report

1. **Files created/modified:** `apps/menu/public.py` (+ routes in `menu/urls.py`), `apps/carts/` (`services.py`, `views.py`, `urls.py`), `apps/accounts` (OTP verify accepts `guest_token` and merges), `config/urls.py` and `settings.py` (throttle scopes), tests `test_public_menu.py` and `test_cart.py`, docs `API_SPECIFICATION.md`.
2. **Models/migrations:** none changed (`makemigrations --check`: No changes detected).
3. **APIs:** public menu and dish detail, guest token, cart (get/clear), context, items, quantity, coupon, merge, checkout validate; login-time merge.
4. **Screens/workflows:** backend only.
5. **Requirements addressed (backend):** REQ-MENU-02, REQ-CART-01, REQ-CART-02, REQ-AUTH-02 (guest browsing and cart, login required to check out), REQ-ORD-01 (Dine-In needs a scanned table, Takeaway has none), REQ-QR-01 (QR context kept in the cart), offer progress (SRS floating bar), REQ-PRICE-01 in cart.
6. **Tests executed:** `manage.py test tests` -> **220 tests, all passed** on MySQL (161 earlier + 59 new). New coverage: public menu visibility rules, filters and multi-diet filter, combined filters and sorting by the paid price, availability flags, internals not exposed, offers; guest token (stored hashed), cart persistence across requests, line merging rules, quantity cap, invalid items, owner isolation (guests, customers, staff, bad tokens), live repricing, unavailable lines kept and flagged, QR and table context rules, coupon apply/remove and first-time auto coupon in the cart, offer progress, guest-to-customer merge (adopt, add quantities, caps, context and coupon carry-over, per-branch, unavailable lines kept, repeatable, other customers untouched, merge during OTP login, login still works with a stale token), checkout validation (guest refused, staff refused, empty cart, Dine-In and Takeaway summaries, unavailable items, live price changes, no order created), and a real-thread test: 6 parallel adds to one guest cart create exactly one active cart with quantity 6.
   **Incident:** during this phase the workspace was reverted to the end of Phase 5 (not by me), which removed the Phase 6 files. After your confirmation I rebuilt Phase 6 from scratch and re-ran the **entire** suite. Phase 5 files were untouched by the revert.
7. **Known gaps:**
   - Nothing reserves stock or a table between cart and order; stock is deducted at order creation (Phase 7-8).
   - Guest carts never expire yet (no cleanup job). Guest tokens are bearer secrets: anyone holding one controls that cart.
   - Staff-assisted ordering uses the same pricing but has no cart endpoints yet (Phase 10).
   - Tax rates are still unconfirmed (see Phase 5 notes); every total uses the branch settings, default 0.
   - The checkout payment methods list is static; Razorpay availability will be driven by configuration in Phase 8.
8. **Remaining:** Phases 7-12.
9. **Next:** Phase 7: create orders from validated carts in one transaction (idempotent via `idempotency_key`), status state machine with history, kitchen queue, customer tracking and history, real-time updates via Channels.

## Phase 7 report

1. **Files created/modified:** `apps/orders/` (`lifecycle.py`, `realtime.py`, `api.py`; `urls.py` keeps `pricing/quote/` and adds orders, transition, kitchen queue), `apps/realtime/` (`consumers.py`, `routing.py`), `config/asgi.py` (HTTP + WebSocket), `config/settings.py` (`daphne` and `channels`, in-memory `CHANNEL_LAYERS`), `requirements.txt` (`channels`, `daphne`), tests `test_orders.py`, docs `API_SPECIFICATION.md`.
2. **Models/migrations:** order models unchanged (`makemigrations --check --dry-run`: No changes detected). `payments/0002_payment_method_choices` only records payment-method choices that were already on the model and missing from `0001`; it is not an orders schema change.
3. **APIs:** `POST/GET /orders/`, `GET /orders/{id}/`, `POST /orders/{id}/transition/`, `GET /kitchen/queue/`, WebSocket `ws/orders/?token=<access>`. `POST /pricing/quote/` is unchanged. See `API_SPECIFICATION.md`.
4. **Screens/workflows:** backend only. No visual UI verification.
5. **Requirements addressed (backend):** place an order from the customer's active cart in one transaction; Dine-In requires the scanned table and Takeaway has none; stock deducted on create and restored on cancel; idempotency key returns the same order for the same customer and 409 for another customer; Accept is `PENDING` -> `PREPARING`; cancel only from `PENDING` or `PREPARING` with a reason, and an `OCCUPIED` table is released only when no other order is in `PENDING`, `PREPARING`, `READY` or `SERVED`; completing an order does not vacate the table; `COUNTER` is `UNPAID` and online methods are `PENDING`; placing an order does not create a `Payment` row; kitchen queue; customer order list and detail; live events after commit.
6. **Tests executed:** `manage.py check`: no issues. `manage.py makemigrations --check --dry-run`: No changes detected. `manage.py test tests --noinput` -> **236 tests, all passed** on MySQL (220 earlier + 8 new order tests + 8 payment/invoice tests already in the tree). Order coverage: dine-in stock deduction, table occupied, cart converted, counter unpaid and no `Payment` row; takeaway with no table and online `PENDING`; idempotency for the same customer and 409 for another; accept/ready/served/completed leaves the table occupied; cancel requires a reason, restores stock, and releases the table only when it is idle; list and kitchen scoping; guest and unready cart refused; quote still works; a WebSocket event after commit reaches the customer group, the branch group and `branch-all`, and not another branch. Two audit calls passed a dict where a branch was required (order placement, and the same mistake on payment capture/counter) and were fixed. The invoice download test reads the PDF from `streaming_content` because `FileResponse` has no `.content`.
7. **Known gaps:**
   - **GST, service and takeaway rates are still unconfirmed.** Totals use the branch settings. Tests set 5 / 10 / 15. The production default is 0.
   - The channel layer is in-memory. One process is fine. More than one server process needs Redis or listeners will miss events.
   - Completing an order does not vacate the table. Staff do that.
   - Nothing here records a Razorpay or counter `Payment`. That is Phase 8, and this phase stops for approval before that work is treated as approved.
8. **Remaining:** Phases 8-12.
9. **Next:** Phase 8: payments and e-bills, after this phase is approved.

## Phase 8 report

1. **Files created/modified:** `apps/payments/` (`gateway.py`, `services.py`, `views.py`, `urls.py`; `models.py` adds `NETBANKING` and `WALLET`), `apps/billing/` (`pdf.py`, `services.py`, `views.py`, `urls.py`), `apps/orders/lifecycle.py` (final invoice when status becomes `COMPLETED`; counter stays `UNPAID` and online stays `PENDING` with no `Payment` row at placement), `config/urls.py`, `requirements.txt` (`reportlab`, already installed as 4.5.1), tests `tests/test_payments.py`, docs `API_SPECIFICATION.md`.
2. **Models/migrations:** `payments/0002_payment_method_choices` (method choices now include `NETBANKING` and `WALLET`; column width unchanged). Applied to `foodie_db`. Invoice and payment tables otherwise unchanged. `manage.py makemigrations --check --dry-run`: No changes detected. `manage.py check`: no issues.
3. **APIs:** `POST /orders/{id}/pay/`, `POST /payments/verify/`, `POST /payments/webhook/`, `POST /orders/{id}/counter-payment/`, `GET /payments/`, `GET /payments/{id}/`, `GET /orders/{id}/invoice/`, `GET /orders/{id}/bill-preview/`. See `API_SPECIFICATION.md`.
4. **Screens/workflows:** backend only. Frontend was not imported and no admin UI was wired.
5. **Requirements addressed (backend):** REQ-PAY-01 (Razorpay order via a gateway wrapper, HMAC verify, signed webhook, idempotent event id, one `SUCCESS` per order), REQ-PAY-02 (staff pay-on-counter for the full total), REQ-BILL-01 (PDF e-bill from the stored order when status is `COMPLETED`; staff JSON preview is not stored). Q4 and Q8 as specified. Branch isolation on payments and invoices.
6. **Tests executed:** `manage.py test tests.test_payments --noinput` -> **8 tests, all passed**. `manage.py test tests.test_orders --noinput` -> **8 tests, all passed**. `manage.py test tests --noinput` -> **236 tests, all passed** on MySQL (about 456 seconds). Coverage includes: customer cannot record a counter payment; branch staff can record one success and a second success is rejected; another branch is 404; fake gateway checkout signature marks `PAID` and a replay does not apply twice; a bad signature does not mark `PAID`; a captured webhook is idempotent; a payment failure restores stock once and a second failure event does not; the invoice exists only after `COMPLETED`; the customer can download that PDF; an in-progress invoice is 409; another customer and another branch are 404; staff preview JSON works before completion and is not stored; empty Razorpay keys return 503 `payments_unconfigured`. No test called the Razorpay network.
7. **Known gaps:**
   - **Razorpay is not configured.** `RAZORPAY_KEY_ID` and `RAZORPAY_KEY_SECRET` are empty, so starting an online payment fails closed (`payments_unconfigured`). Tests set keys with `override_settings` and inject `FakeRazorpay`. There is no demo success on the production path.
   - **GST, service and takeaway rates are still unconfirmed** and stay per branch, default 0. Invoices copy the order snapshot and do not invent rates.
   - Completing an order is allowed while `payment_status` is `UNPAID`. The SRS asks for the e-bill after completion and does not say the kitchen must wait for payment.
   - Stock is restored on payment failure. A later successful payment does not deduct again, because `deduct_for_order` already recorded a deduction for that order.
   - `POST /checkout/validate/` still lists only `UPI`, `CARD` and `COUNTER`. The pay endpoint also accepts `NETBANKING` and `WALLET`.
   - No partial payments and no refund flow.
8. **Remaining:** Phases 9-12.
9. **Next:** Phase 9 frontend (admin wiring). Not started.

## Phase 9 report

1. **Files created/modified:** Imported `D:\foodie.zip` into `frontend/` (JSX, styles, Vite). Excluded `scratch/`, `users.json`, `.env`, `.locust_env`, `dist/`, and `test_login.js`. New `frontend/src/services/staffClient.js` and `adminApi.js`. Admin services now call `/api/` when the path is `/admin` or `/employee`. Vite proxy targets `http://127.0.0.1:8000` for `/api`, `/media`, and `/ws`. `docs/API_SPECIFICATION.md` notes the admin client. Backend code was not changed.
2. **Models/migrations:** none.
3. **APIs:** no new endpoints. The admin UI uses staff login, branches, tables, categories, foods, inventory, coupons, employees, orders, kitchen transitions, and the order WebSocket.
4. **Screens/workflows:** Admin login with employee code, dashboard totals from orders, branches, tables, menu categories and dishes, inventory, employee directory, orders list, kitchen queue. Verified in the browser at `http://localhost:5173/`. Not compared to the SRS screenshots.
5. **Requirements addressed:** REQ-ADM-01 and REQ-ADM-02 for the admin screens that have APIs (branch, menu, coupons, employees, orders, kitchen, inventory). REQ-AUTH-03 staff login. REQ-AUTH-04 logout clears the staff session. Tax rates were not entered; the created branch kept GST, service charge, and takeaway charge at 0.
6. **Tests executed:** Backend suite was not re-run. No backend files changed. Browser: logged in as `PHASE9`, created branch `Phase9 Kitchen` (`BR001`, rates 0), table `T07`, category `Starters`, dish `Paneer Tikka` at 240 with stock 20. Inventory showed 1 in-stock row. Employee directory showed 1 staff member, `Phase9 Owner`. Orders and kitchen were empty, which matches the database. A screenshot of the employee directory was taken. It was not compared to the SRS.
7. **Known gaps:**
   - Customer routes still use the old service code. That is not Phase 9. The plan's Phase 9 is admin wiring.
   - Phase 10 (employee interface) was not started. The employee dashboard was not wired as its own workflow.
   - Settings switches are not saved. The page says GST, service, and takeaway stay on the branch record.
   - Branch city, email, opening hours, cover image, and "main branch" are not stored. The API has no fields for them.
   - Dish image URL entry is not uploaded. A chosen image file is posted to `/food-images/`.
   - Inventory rows cannot be deleted. The ledger has no delete. The screen says to deactivate the dish.
   - The kitchen "Mark Serving" button sends `SERVED`. A separate "Mark Completed" button sends `COMPLETED`. The old button skipped `SERVED`, which the API rejects.
   - Dashboard no longer shows the old hardcoded conversion and growth figures. Revenue is the sum of stored order totals.
   - Visual match to the SRS was not done.
8. **Remaining:** Phases 10-12. Customer ordering UI is still on the old contract.
9. **Next:** Phase 10 employee interface wiring, after this phase is approved. Not started.

## Phase 10 report

1. **Files created/modified:** `frontend/src/pages/employee/EmployeeDashboard.jsx`, `frontend/src/routes/AppRoutes.jsx`, `frontend/src/routes/AdminRoute.jsx`, `frontend/src/components/layout/Sidebar.jsx`, `frontend/src/services/adminApi.js`, `frontend/src/services/orderService.js`, `frontend/src/context/OrderContext.jsx`, `frontend/src/pages/admin/Orders.jsx`, `frontend/src/pages/admin/Kitchen.jsx`, `frontend/src/pages/admin/Tables.jsx`, `frontend/src/pages/admin/Inventory.jsx`, `frontend/src/components/orders/OrderDetailsModal.jsx`, `frontend/src/components/orders/EBillModal.jsx`, `docs/API_SPECIFICATION.md`, `docs/UI_SCREEN_TRACEABILITY.md`. Backend code was not changed.
2. **Models/migrations:** none.
3. **APIs:** no new endpoints. The employee UI uses staff login, `GET /orders/`, `POST /orders/{id}/transition/`, `GET /kitchen/queue/` through the order list, `GET/POST /tables/` and `POST /tables/{id}/set-status/`, `POST /inventory/{id}/restock/`, `POST /orders/{id}/counter-payment/`, `GET /orders/{id}/invoice/` only after `COMPLETED`, and the order WebSocket already opened on staff routes. Bill amounts are the figures stored on the order.
4. **Screens/workflows:** Employee code login lands on `/employee/dashboard` (`http://localhost:5173/employee/dashboard`). Sidebar is Dashboard, Orders, Tables, Kitchen Queue, and Inventory. Verified in the browser. Not compared to the SRS screenshots.
5. **Requirements addressed:** REQ-EMP-01 for the dashboard and branch orders (assisted placement is a gap, below). REQ-AUTH-04 session stays in `sessionStorage` and a branch chef is not sent to the admin dashboard. REQ-KIT-01 kitchen queue for that branch. REQ-PAY-02 one counter payment for the full total. REQ-TBL-01 table list and status for that branch. REQ-INV-01 restock adds quantity; adjust stays admin-only. REQ-SEC-01 branch isolation. GST, service, and takeaway were not entered; the order total was the stored dish price with those rates at 0.
6. **Tests executed:** Backend suite was not re-run. No backend files changed. Browser at `http://localhost:5173/`:
   - Created branch chef `CHEF10` (role CHEF, branch `Phase9 Kitchen` / `BR001`, password meeting the validators).
   - Placed customer takeaway `FD000001` (Paneer Tikka, ₹240, `PENDING`, `UNPAID`) on branch 1 through the customer cart and `POST /orders/`.
   - Placed `FD000002` on a second branch (`Other Branch`, `BR010`, table `Z9`) the same way.
   - Logged in as `CHEF10` and landed on the employee dashboard, not the admin dashboard. The sidebar has no menu, branch, coupon, employee, or settings links.
   - `http://localhost:5173/admin/menus` redirected back to `/employee/dashboard`. From that session, `POST /categories/` and `POST /foods/` returned 403, and `GET /employees/` returned 403. `GET /categories/` returned 200, which matches staff read access.
   - The dashboard listed only `FD000001`. Accept moved it from `PENDING` to `PREPARING`. The kitchen queue at `/employee/kitchen` showed that preparing ticket (Paneer Tikka) and not `FD000002`.
   - Record counter payment once. The card then showed `PAID` and the button was gone. A second `POST /orders/1/counter-payment/` returned 409 `already_paid`.
   - Tables showed only `T07`. `Z9` and `FD000002` were not listed. `GET /orders/` for this chef returned only `FD000001`.
7. **Known gaps:**
   - Assisted ordering is not wired to a create call. `POST /orders/` is customer-only (staff receive 403) and there is no staff cart. The employee dashboard says so. Take Order on a table does not mark the table occupied or open the customer menu. Anonymous takeaway still has no Track Order, and no employee-placed order was invented.
   - The status path after `PREPARING` (`READY`, `SERVED`, `COMPLETED`) and the completed-order PDF were not clicked in the browser. The invoice button still calls the PDF endpoint only when the status is `COMPLETED`.
   - Inventory restock was not clicked in the browser. The employee stock action calls `POST /inventory/{id}/restock/` with the added quantity. Reducing stock still uses admin adjust.
   - Customer routes still use the old service code.
   - Visual match to the SRS was not done.
   - Verification data left in the dev database: chef `CHEF10`, branch `BR010`, orders `FD000001` (`PREPARING`, `PAID`) and `FD000002` (`PENDING`, `UNPAID`).
8. **Remaining:** Phases 11-12. Customer ordering UI is still on the old contract.
9. **Next:** Phase 11 integration and E2E tests (pytest, Playwright), after this phase is approved. Not started.

## Phase 11 report

1. **Files created/modified:** `backend/tests/test_e2e.py`. No production backend code. No frontend code. No Playwright project.
2. **Models/migrations:** none.
3. **APIs:** no new endpoints. The scenario calls the existing staff, public, cart, OTP, order, kitchen, payment, and invoice APIs.
4. **Screens/workflows:** none. The customer UI still calls the old service contract (`authService.js` talks about `/users/` and `/roles/`; `cartService.js` uses a local guest session id). A browser walk of QR, cart, OTP, and tracking would not be an honest test of the Django API, so it was not automated and the customer pages were not rewritten.
5. **Requirements addressed:** one API scenario covers REQ-AUTH-01 (`dev_otp` only while `DEBUG` is on; the console provider raises when `DEBUG` is off), REQ-QR-01, REQ-MENU-01 (admin create plus public menu), REQ-CART-01, REQ-CART-02 (guest merge on OTP verify), REQ-AUTH-02 (guest checkout refused), REQ-ORD-01 (takeaway, no table), REQ-PRICE-01 (server total equals the dish price because branch GST, service, and takeaway stayed at the default 0), REQ-PAY-02 (one counter payment), REQ-ORD-02 and REQ-KIT-01 (chef status machine and branch queue), REQ-BILL-01 (invoice PDF only after `COMPLETED`), REQ-SEC-01 (the other branch's chef gets 404), REQ-ADM-02 smoke (branch, table, category, dish, employee). REQ-PAY-01 is only the empty-keys failure: `POST /orders/{id}/pay/` returns 503 `payments_unconfigured`. REQ-EMP-01 assisted placement is asserted as 403 on `POST /orders/` and was not built. REQ-UI-01 was not checked.
6. **Tests executed:** `manage.py test tests.test_e2e --noinput` -> **2 tests, OK**. `manage.py test tests --noinput` -> **238 tests, OK** on MySQL (about 535 seconds). That is the previous 236 plus these 2. The 24-step test leaves GST, service, and takeaway at 0 and checks the order total is ₹360 for two units of a ₹180 dish. It does not call Razorpay.
7. **Known gaps / not automated:**
   - Assisted ordering is still not a product feature. Staff `POST /orders/` is 403. The test records that; it does not add a staff cart.
   - Razorpay success, verify, and webhook stay in the Phase 8 tests with a fake gateway. This phase does not call the Razorpay network.
   - Anonymous takeaway still has no Track Order in the employee UI. No employee-placed order was created.
   - Customer pages were not driven in a browser. Playwright was not added. SRS screenshot match was not done.
   - WebSocket delivery was not repeated here. Phase 7 already covers a live event after commit.
   - Tax rates were not configured. The scenario asserts the stored zeros.
8. **Remaining:** Phase 12. Django and Vite were not started for this phase.
9. **Next:** Phase 12 deployment and release, after this phase is approved. Not started.

## Phase 12 report

1. **Files created/modified:** `docs/DEPLOYMENT.md`, `backend/Procfile` (one Daphne process on port 8000), `backend/requirements.txt` (added `asgiref>=3.8.1,<4` because `apps/orders/realtime.py` imports it; existing pins kept), `backend/.env.example` (comments only: `DEBUG` off requires `SECRET_KEY`, and `SECURE_SSL_REDIRECT` defaults to true). No application logic change. `.env` was not edited and `DEBUG` was not set off in that file.
2. **Models/migrations:** none.
3. **APIs:** none.
4. **Screens/workflows:** none. The customer UI was not rewritten. `npm run build` produced `frontend/dist`.
5. **Requirements addressed:** reproducible release path for the code that exists. Production flags in `config/settings.py` were checked, not weakened: with `DEBUG` off, `SECRET_KEY` is required, `SECURE_SSL_REDIRECT` defaults true, session and CSRF cookies are secure, HSTS is one year with subdomains and preload, nosniff is on, `X_FRAME_OPTIONS` is `DENY`, and `SECURE_PROXY_SSL_HEADER` is `X-Forwarded-Proto`. Daphne serves HTTP and WebSocket. Gunicorn alone would not serve `/ws`. One process only; Redis is documented and not installed. No GST, service, or takeaway rates were invented.
6. **Tests executed:** `manage.py check` -> `System check identified no issues (0 silenced).` `manage.py check --deploy` with `DEBUG=False` only in the process environment -> `System check identified no issues (0 silenced).` `npm run build` in `frontend` succeeded (Vite 8.2.1, about 1 second). Warnings: one JS chunk larger than 500 kB, and ineffective dynamic imports for `orderService.js`, `staffClient.js`, and `adminApi.js`. The full 238-test suite was not re-run; Python application behavior was not changed.
7. **Known gaps (not production-ready):**
   - Razorpay keys are empty. Online pay returns 503 `payments_unconfigured`. No fake success was added.
   - OTP is the console provider only while `DEBUG` is on. With `DEBUG` off it fails closed. No SMS vendor was added, and `dev_otp` is not returned.
   - Channel layer and cache are in-process. More than one server process needs Redis. `channels-redis` is not a dependency and settings do not read a Redis URL.
   - Customer routes still use the old service contract. `imageUtils.js` still falls back to `http://192.168.68.150:8000` when the Vite API env vars are unset. Admin and employee use the real API.
   - Assisted ordering is not implemented. Staff `POST /orders/` is 403.
   - Branch GST, service, and takeaway rates are unconfirmed and stay at the stored default 0.
   - No SRS screenshot match.
   - `/media/` is served by Django only when `DEBUG` is on. A release must serve `MEDIA_ROOT` and `STATIC_ROOT` itself. Nothing was deployed to a public host.
8. **Remaining:** no later phase is planned. The gaps above are still open.
9. **Next:** approval of this phase. Do not treat the app as live on the internet.
