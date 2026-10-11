# API Specification

Base path `/api/`. JSON. Authenticated calls send `Authorization: Bearer <access>`. Errors use `{"detail": "...", "code": "..."}` (DRF field errors for validation). Endpoints for later phases are added as they are implemented.

## Authentication (Phase 3, implemented and tested)

| Method and path | Auth | Purpose |
|---|---|---|
| `POST /auth/otp/send/` `{phone}` | none | Send a customer OTP. 429 + `Retry-After` on cooldown (30 s) or hourly cap (5 per phone, plus 10/hour per IP). Staff phone numbers are refused (403). In `DEBUG` with the console provider the response also contains `dev_otp`; this never happens when `DEBUG` is off, and the console provider then refuses to run. |
| `POST /auth/otp/verify/` `{phone, otp}` | none | Verify the OTP (5 attempts, 5-minute expiry, single use). Creates the customer on first success. Returns `{access, refresh, user, is_first_time_customer}`; first-time means no earlier COMPLETED order for that verified phone. |
| `POST /auth/staff/login/` `{employee_code, password}` | none | Admin/employee login. Generic 401 for wrong code or password. 5 failures lock that code for 15 min (429). 403 when the account is inactive/suspended. |
| `POST /auth/refresh/` `{refresh}` | none | Rotates the refresh token (old one is blacklisted). Fails for deactivated users. |
| `POST /auth/logout/` `{refresh}` | bearer | Blacklists the refresh token. Rejects a token that belongs to another user. |
| `GET /auth/me/` | bearer | Identity as stored in the database: `user_type`, and for staff `employee {employee_code, role, is_admin_level, branch, department, job_title}`. Suspended staff get `employee: null` immediately even with a valid token. |

Phones are normalized to E.164 (`9876543210` becomes `+919876543210`).

## Employees (admin-level only, branch-scoped)

`GET/POST /employees/`, `GET/PUT/PATCH/DELETE /employees/{id}/`

- Fields: `name, phone, email?, password (write-only), branch, role, department, job_title, status`; read-only `employee_code` (generated `EMP0001`-style; this is the login ID), `branch_name`, `created_at`.
- Filters `?role= &status= &department= &branch=`; search `?search=` (name, code, phone).
- `DELETE` **deactivates** (status `INACTIVE`, user inactive, sessions revoked). Records are never removed.
- Rules: admin-level roles are SUPER_ADMIN, ADMIN, MANAGER. A user can only assign roles ranked below their own (SUPER_ADMIN may assign any). A branch-assigned admin sees and manages only their own branch. Non-owner roles require a branch. A password change or deactivation revokes the employee's refresh tokens. Cannot deactivate yourself.
- Writes are recorded in `audit_logs`.

## Roles and access (backend-enforced)

| Role | Access |
|---|---|
| Customer (`user_type=CUSTOMER`) | Customer endpoints only (Phase 4+). Cannot call staff endpoints. |
| STAFF / CHEF / CASHIER | Employee interface (orders, kitchen, tables, inventory) scoped to their branch. No branch, menu, coupon or employee management. |
| MANAGER | Admin-level, scoped to their branch; can manage lower roles. |
| ADMIN with a branch | Admin-level, confined to that branch. |
| ADMIN / SUPER_ADMIN without a branch | Admin-level across all branches. |

Helpers: `IsCustomer`, `IsStaffMember`, `IsAdminLevel`, `scope_queryset()` / `BranchScopedMixin` (all in `apps/accounts`). Permissions are always read from the database, never from token claims.

## Branches, tables, QR (Phase 4, implemented and tested)

Lists are plain JSON arrays (no pagination yet; `?search=`, `?ordering=` and field filters work). All staff endpoints require a bearer token and are branch-scoped: branch-limited staff only see their own branch, and other branches' records return 404.

| Endpoint | Who | Notes |
|---|---|---|
| `GET /branches/`, `GET /branches/{id}/` | any active staff | filters `is_active`; search name, code, address, manager |
| `POST /branches/` | owner-level (admin with no branch) | `name, address, city, contact_number, email, manager_name, opening_hours, cover_image_url, is_primary, gst_rate, service_charge_rate, takeaway_charge`; `code` is generated (`BR001`); name unique (case-insensitive). `email` is optional and must be a valid address when set. `cover_image_url` is optional and must be `http` or `https`. At most one branch has `is_primary`; saving a new headquarters clears the previous one in the same transaction. `tables_count` is read-only (active tables) |
| `PATCH /branches/{id}/` | admin-level in scope | `is_active` can reactivate |
| `DELETE /branches/{id}/` | owner-level | **Deactivates** (409 if it has unfinished orders). Staff of an inactive branch lose access; its QR codes stop resolving; history is untouched |
| `/tables/` CRUD | read: staff; write: admin-level | `table_number, capacity, location, is_active, qr_is_active`; branch is forced to the caller's branch (owner must pass `branch`); number unique per branch (case-insensitive). `status` is read-only here |
| `POST /tables/{id}/set-status/` `{status}` | any staff of the branch | AVAILABLE->RESERVED/OCCUPIED, RESERVED->OCCUPIED/AVAILABLE, OCCUPIED->AVAILABLE. Vacating returns 409 while any unfinished order uses the table |
| `GET /tables/{id}/qr/` (`?download=1`) | any staff | PNG of `<FRONTEND_BASE_URL>/customer/welcome?qr=<uuid>`; 409 if the table or QR is inactive |
| `POST /tables/{id}/regenerate-qr/` | admin-level | New UUID; the old printed code stops working immediately |
| `DELETE /tables/{id}/` | admin-level | Deleted if it never had orders, else deactivated; 409 if it has unfinished orders |
| `GET /public/branches/{id}/tables/` | **public** | Active tables of that branch whose status is `AVAILABLE`. `{id, table_number, location, capacity}`. Occupied, reserved and inactive tables are omitted |
| `GET /public/qr/{uuid}/` | **public** (throttled 60/min) | Returns `{branch:{id,name}, table:{id,table_number,location,capacity}}`. Malformed, unknown, inactive-table, inactive-QR and inactive-branch cases all return the same 404 `{"detail":"Invalid or inactive QR code.","code":"qr_invalid"}` |

## Menu (Phase 4, implemented and tested)

Read: any active staff (needed for assisted ordering). Write: admin-level only. Same branch scoping. Customer-facing menu endpoints arrive in Phase 6.

| Endpoint | Notes |
|---|---|
| `/categories/` CRUD | `name, description, display_order, is_active`; read-only `dish_count`; unique name per branch; filters `branch, is_active`; search. `DELETE` removes an unused category, otherwise deactivates it (200 with `deactivated: true`) |
| `/foods/` CRUD | `category, name, description, ingredients, diet_type (VEG/NON_VEG/VEGAN), price, calories, protein_grams, image_url, is_active, is_sold_out`; response embeds `images`, `primary_image` and `customizations`. `image_url` is an admin-supplied `http(s)` image address (other schemes are 400); `primary_image` is `image_url` when set, else the primary uploaded file (absolute URL), else `null`. Uploading a new primary file clears `image_url`, so the latest choice wins. The same `primary_image` is used by the public menu and cart lines. `?category=<id>` returns only that category's dishes. Filters `diet_type, is_active, is_sold_out, branch`; search name/description/ingredients; ordering `price, name`. Category must be in the same branch. `DELETE` removes an unreferenced dish, otherwise deactivates it (dishes with order, cart or stock records) |
| `/food-images/` | `multipart`: `food, image, is_primary?, sort_order?`. JPEG/PNG/WebP, max 5 MB, validated by Pillow from the file content. First image is primary; setting another primary demotes the rest; deleting the primary promotes the next; the file is removed from disk. URLs are absolute and served from `/media/` |
| `/customization-options/` CRUD | `food, name, extra_price (>=0), is_active`; unique per dish. Options used in carts are deactivated instead of deleted |

Order history is preserved: order lines copy name and price, so editing or deactivating a dish never alters old orders (tested).

## Inventory (Phase 5, implemented and tested)

Read: any active staff. Branch-scoped. A dish with no inventory record is **untracked** (unlimited); a dish with a record is orderable only while quantity > 0. Status is derived: quantity 0 = OUT_OF_STOCK, <= threshold (default 5) = LOW_STOCK, else IN_STOCK. There is no DELETE (it would erase the stock ledger); deactivate the dish instead.

| Endpoint | Who | Notes |
|---|---|---|
| `GET /inventory/` | staff | filters `?status=IN_STOCK|LOW_STOCK|OUT_OF_STOCK`, `food`, `food__category`; search dish/category |
| `GET /inventory/summary/` | staff | `{total, in_stock, low_stock, out_of_stock}` for the status cards |
| `POST /inventory/` `{food, quantity, low_stock_threshold?}` | admin-level | one record per dish; initial stock is written to the ledger |
| `PATCH /inventory/{id}/` `{low_stock_threshold}` | admin-level | quantity cannot be changed here |
| `POST /inventory/{id}/restock/` `{quantity, note?}` | any staff | adds to current stock (1..1,000,000) |
| `POST /inventory/{id}/adjust/` `{new_quantity, note?}` | admin-level | stock-take correction to an exact number |
| `GET /inventory/{id}/transactions/` | staff | ledger, newest first |

Service layer (`apps/inventory/services.py`, used by orders in Phase 7-8): `deduct_for_order` (idempotent per order, locks rows in a fixed order, all-or-nothing, raises `InsufficientStock`), `restore_for_order` (only what was deducted, once). The database also enforces `quantity >= 0` and one deduction per (dish, order).

## Dish discounts (Phase 5)

`/dish-discounts/` CRUD (read: staff, write: admin-level, branch-scoped): `food, discount_type (PERCENT|FLAT), value, valid_from, valid_to, is_active`. Value > 0; percent <= 100; flat <= dish price; end after start; **two active discounts on one dish cannot overlap**. A discount applies to the base price only (customizations are not discounted). Dish responses now include `original_price`, `discounted_price`, `current_discount`, `stock_status` and `is_orderable`.

## Coupons (Phase 5)

`/coupons/` CRUD (read: staff, write: admin-level, branch-scoped): `code` (stored upper-case, unique per branch), `description, discount_type, discount_value, min_order_value, max_discount, valid_from, valid_to, usage_limit, is_first_time_auto, is_active`; read-only `used_count`. At most one active first-time coupon per branch. `DELETE` deletes unused coupons and deactivates redeemed ones. `GET /coupons/{id}/redemptions/` gives the history.

Rules (`apps/coupons/services.py`):
- First-time customer = verified customer with no COMPLETED order. Guests and anonymous takeaway are never first-time.
- First-time customers get the eligible first-time coupon automatically (no code) plus at most one extra entered coupon. All others: one coupon per order.
- A first-time coupon can be used once per customer unless that earlier order was cancelled.
- Coupons apply one after another on the remaining amount and never exceed it. Percent coupons honor `max_discount`.
- The minimum order value is compared with the amount **after dish discounts**; an amount equal to the minimum qualifies. Usage limits ignore cancelled orders.
- Offer progress: the nearest not-yet-unlocked offer the customer could actually get, with the remaining amount.

## Pricing quote (Phase 5)

`POST /pricing/quote/` (public, throttled 120/min): `{branch, order_type, items:[{food, quantity, options:[ids], special_instructions?}], coupon_codes:[...], customer_phone?}`. Returns every figure computed on the server from database prices (client prices are ignored): `items` (unit price, customization, discount, line total), `items_subtotal, customization_total, dish_discount_total, merchandise_total, coupons, rejected_coupons (with reasons), coupon_discount_total, takeaway_charge, taxable_amount, gst_*, service_charge_*, total_amount, is_first_time_customer, offer_progress`. Errors: 400 with a list of per-line reasons (unavailable, sold out, over stock, bad option, quantity 1..99), 404 for an unknown or inactive branch. A logged-in customer is priced from their own history; staff may pass `customer_phone` for an assisted order (an unknown phone counts as first-time). The same `price_order` function will create orders in Phase 7.

Formula (rates are per-branch settings, default 0, **unconfirmed**): items + customizations - dish discounts - coupons; + takeaway charge (flat per order) = taxable; GST on taxable; service charge on the food amount after coupons (not on the takeaway charge); total = taxable + GST + service. Every figure is rounded half-up to 2 places.

## Customer menu (Phase 6, implemented and tested; public, throttled 120/min)

- `GET /public/branches/{id}/menu/` returns `{branch, categories[{id,name,description,dish_count}], foods[], offers[]}`. Only active branches, categories and dishes. Query: `category=<id>`, `diet_type=VEG,NON_VEG,VEGAN` (several allowed), `search=` (name or description), `ordering=price|-price|discount|name`. Filters and sort combine. Default order is category order, then name. `price` sorting uses the price the customer pays (after dish discount); `discount` puts the biggest discount first.
- Each dish: `original_price, discounted_price, discount_percent, has_discount, diet_type, ingredients, calories, protein_grams, images, primary_image (absolute URL), customizations (active only), is_orderable, stock_status` (IN_STOCK, LOW_STOCK, OUT_OF_STOCK or null when untracked). Exact stock numbers and branch internals are never exposed. Sold-out dishes are returned with `is_orderable=false` for greyed-out display.
- `offers`: currently valid coupons (code, description, minimum, `is_first_time_offer`).
- `GET /public/foods/{id}/`: one active dish. Unknown or inactive branch, category or dish gives 404.

## Cart and checkout (Phase 6, implemented and tested)

Cart owner is a logged-in **customer** (Bearer) or a **guest** (header `X-Guest-Token`). Staff tokens get 403. One active cart per owner and branch. Prices are never stored: every response re-prices the cart through the central pricing service.

| Endpoint | Notes |
|---|---|
| `POST /cart/guest-token/` | Returns `{guest_token}` (unguessable; only its SHA-256 is stored). 30/hour per IP |
| `GET /cart/?branch=<id>` | Cart view (empty view if none): `items` with server prices and per-line `issue`, `pricing` (full breakdown, same as the quote), `issues`, `order_type`, `table`, `coupon_codes`, `can_checkout` |
| `PUT /cart/context/` `{branch, order_type, qr?, table?}` | Dine-In needs either a scanned `qr` or `table` (an id returned by the available-tables list, which must still be `AVAILABLE` on this branch). Otherwise 400 `qr_required`, `qr_invalid` or `table_unavailable`. Takeaway removes any table. The table is claimed (occupied) only when the order is created, and a second order for a table that is already occupied is 409 |
| `POST /cart/items/` `{branch, food, quantity, options[], special_instructions}` | Adds, or increases an identical line (same dish, same options, same trimmed instructions). Validated like a quote (availability, options, stock, max 99 per line) |
| `PATCH /cart/items/{id}/` `{quantity}`, `DELETE /cart/items/{id}/` | Only the owner's items (others get 404) |
| `DELETE /cart/?branch=` | Clear |
| `POST /cart/coupon/` `{branch, code}`, `DELETE /cart/coupon/?branch=` | Applies one entered coupon after a dry-run; rejections return the reason (400) and nothing is stored |
| `POST /cart/merge/` `{guest_token}` | Customer only. Folds the guest's carts into the customer's: quantities of identical lines add (cap 99), other lines move over, no duplicate active carts, guest context and coupon carry over, the guest cart is marked MERGED. Lines that became unavailable are kept and flagged, never dropped. Repeating it is harmless |
| `POST /auth/otp/verify/` with optional `guest_token` | Does the same merge during login and returns `merged_cart_branches`. A merge problem never blocks login |
| `POST /checkout/validate/` `{branch}` | Customers only (guest gets 401 `login_required`). Re-prices and revalidates everything. 409 `cart_invalid` with `issues` if anything is wrong; otherwise `{ready, cart, payment_methods, customer}`. `payment_methods` is `[UPI, CARD, COUNTER]` when Razorpay keys are configured and `[COUNTER]` otherwise. Does **not** create an order or clear the cart (Phase 7) |

Cart-line problems (dish sold out, out of stock, deactivated, table deactivated, Dine-In without table) set `can_checkout=false` and are listed in `issues`.

## Orders, kitchen queue, live updates (Phase 7, implemented and tested)

`POST /pricing/quote/` is unchanged. Customers place from their own active cart. Dine-In uses the scanned table. Takeaway has none. Stock is deducted when the order is created and restored on cancel. `COUNTER` sets `payment_status` to `UNPAID`; `UPI`, `CARD`, `NETBANKING` and `WALLET` set it to `PENDING`. Placing an order does not create a `Payment` row. Tax, service and takeaway figures are whatever is stored on the branch (tests use 5 / 10 / 15; the production default is 0).

| Endpoint | Who | Notes |
|---|---|---|
| `POST /orders/` `{branch, idempotency_key, payment_method}` | customer | 201 with the new order. The same key for the same customer returns that order with 200 and does not deduct stock again. Another customer reusing the key is 409 `idempotency_conflict`. Empty cart is 400 `cart_empty`. A cart that cannot check out is 409 `cart_invalid`. Short stock is 409 `out_of_stock`. A guest (no Bearer token) is 401. Staff is 403. The cart is marked `CONVERTED`. A dine-in table becomes `OCCUPIED` |
| `GET /orders/?status=` | customer: own orders; branch staff: that branch; owner-level staff (no branch): all | Optional `status` filter |
| `GET /orders/{id}/` | the customer who owns it, or staff who can access that branch | Anyone else gets 404 |
| `POST /orders/{id}/transition/` `{status, reason?}` | staff of that branch | Accept is `PENDING` -> `PREPARING`. Then `PREPARING` -> `READY` -> `SERVED` -> `COMPLETED`. Cancel is allowed only from `PENDING` or `PREPARING`, requires `reason` (400 `reason_required`), restores stock, and sets an `OCCUPIED` table back to `AVAILABLE` only when no other order on that table is in `PENDING`, `PREPARING`, `READY` or `SERVED`. Completing an order does not vacate the table. Any other jump is 409 `invalid_transition`. Unknown status is 400 |
| `GET /kitchen/queue/?status=&branch=` | staff | Orders in `PENDING`, `PREPARING` or `READY`, oldest first. Branch staff see only their branch. Owner-level staff see every branch and may pass `branch`. `status` narrows that queue. Customers get 403 |

Live events are published only after the database transaction commits, so a rolled-back order is never announced. The development channel layer is in-memory (one process). More than one server process needs Redis. Each event goes to `customer-{customer_id}`, `branch-{branch_id}`, and `branch-all`. Payload: `order_id`, `order_number`, `status`, `branch_id`, `payment_status`.

WebSocket `ws/orders/?token=<access>`. The access token is the query parameter (not a cookie). A missing or invalid token closes the socket. A customer joins only `customer-{id}`. Branch staff join `branch-{branch_id}`. Owner-level staff (no branch) join `branch-all`.

## Payments and e-bills (Phase 8, implemented and tested)

Placing an order is unchanged. `COUNTER` leaves `payment_status` `UNPAID` and does not create a `Payment`. `UPI`, `CARD`, `NETBANKING` and `WALLET` leave `payment_status` `PENDING` and also create no `Payment` until the customer starts payment. Missing Razorpay keys do not block the order. Starting an online payment fails closed with **503** `payments_unconfigured` until `RAZORPAY_KEY_ID` and `RAZORPAY_KEY_SECRET` are both set. Responses never include the key secret.

| Endpoint | Who | Notes |
|---|---|---|
| `POST /orders/{id}/pay/` `{method: UPI\|CARD\|NETBANKING\|WALLET}` | the customer who owns the order | Creates one `Payment` for `order.total_amount` and a Razorpay order. Returns `key_id` (public), `razorpay_order_id`, `amount`, `currency`, `status: PENDING`. 404 if it is not their order. 409 `order_cancelled` or `already_paid`. 503 `payments_unconfigured` when keys are empty |
| `POST /payments/verify/` `{razorpay_order_id, razorpay_payment_id, razorpay_signature}` | that customer | HMAC-SHA256 of `order_id\|payment_id` using the key secret. A valid capture stores exactly one `SUCCESS` row (`success_slot`), sets `payment_status` `PAID`, and writes one `PaymentEvent`. Sending the same payment id again does not apply twice. 400 `invalid_signature` leaves the order unpaid |
| `POST /payments/webhook/` | Razorpay, no login | `X-Razorpay-Signature` is HMAC-SHA256 of the raw body, using `RAZORPAY_WEBHOOK_SECRET` or, if that is empty, the key secret. `X-Razorpay-Event-Id` is the idempotency key. `payment.captured` marks the order paid once. `payment.failed` sets the payment and the order to `FAILED` and restores stock once (Q8); a later failure event does not restore again. A bad signature is 400 and changes nothing |
| `POST /orders/{id}/counter-payment/` `{amount?}` | staff of that branch | Records one `SUCCESS` counter payment for the order total and sets `payment_status` `PAID`. The customer gets 403. Another branch gets 404. If `amount` is sent it must equal `total_amount` (400 `amount_mismatch`). A second success is 409 `already_paid`. A cancelled order is 409 |
| `GET /payments/`, `GET /payments/{id}/` | customer: their orders; staff: their branch; owner-level (no branch): all | Someone else's payment is omitted or 404. The signature and the key secret are not in the body |

Pay-on-counter is recorded by staff only. The client cannot mark an order paid. There are no partial payments.

## Invoices (Phase 8)

The final invoice is created when staff move the order to `COMPLETED` (inside `change_status`). One invoice per order. The number is `INV-` plus the order number and does not change. The snapshot copies the money fields already stored on the order; nothing is repriced. GST, service and takeaway figures stay whatever the branch had at order time (defaults 0 until configured). Completing an order is allowed while `payment_status` is still `UNPAID`; the SRS does not say the kitchen must wait for payment.

| Endpoint | Who | Notes |
|---|---|---|
| `GET /orders/{id}/invoice/` | the customer who owns a **completed** order, or staff of that branch | PDF (`order number`, branch, items, quantities, price breakdown, total, invoice number, payment status). **409** `invoice_not_ready` when the order is not `COMPLETED` (no invoice is stored). Another customer or another branch: **404** |
| `GET /orders/{id}/bill-preview/` | staff of that branch | Same breakdown as JSON with `final: false` and `invoice_number: null`. Not stored. Another branch: **404**. Works while the order is still in progress |

`POST /checkout/validate/` advertises `UPI` and `CARD` only when Razorpay keys are configured; `COUNTER` is always listed. `POST /orders/{id}/pay/` also accepts `NETBANKING` and `WALLET`.

## Admin client (Phase 9)

The admin screens in `frontend/` call the staff endpoints above. The access token and refresh token stay in `sessionStorage` for that browser tab. The client does not send `gst_rate`, `service_charge_rate`, or `takeaway_charge`; those stay at the branch values already stored (default 0). The invoice download button calls `GET /orders/{id}/invoice/` only when the order status is `COMPLETED`. Before that, the screen says the invoice is not ready. Kitchen status buttons follow the server transitions: `PENDING` to `PREPARING` to `READY` to `SERVED` to `COMPLETED`. Cancel sends a reason. There is no employee-interface work in this phase.

## Employee client (Phase 10)

A branch employee (role not admin-level) signs in with the same staff login and lands on `/employee/dashboard`. Tokens stay in `sessionStorage`. The employee screens call the same staff endpoints: orders for their branch, kitchen transitions, table status, inventory restock (not adjust), and `POST /orders/{id}/counter-payment/` for one full-total success. The invoice download still calls `GET /orders/{id}/invoice/` only when the status is `COMPLETED`. Bill figures on screen are the amounts stored on the order. GST, service, and takeaway stay at the branch values (default 0). Admin-only routes (menu, branches, coupons, employees, settings) redirect a branch employee to the employee dashboard. `POST /orders/` is still customer-only, so the employee UI does not place an assisted order.
