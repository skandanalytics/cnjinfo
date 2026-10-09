# Phase 1 Addendum: SRS and Django project now inspected

This supersedes the "not found" and "missing information" parts of `PHASE1_AUDIT.md`, which was written before the two files were supplied.

## 1. Sources now read

| Source | What was inspected |
|---|---|
| `SRS Document.ver2.docx` (Downloads) | Full text (about 36k chars), 49 embedded media files (ER diagram, use-case diagram, 40+ UI screenshots) extracted to a temp folder. The ER diagram and three UI screenshots were viewed. **The other ~45 images have not yet been individually reviewed.** |
| `Foodie_Django_Employee_Auth_Project.zip` | All source: `models.py`, `views.py`, `serializers.py`, `permissions.py`, `urls.py`, `settings.py`, README, `requirements.txt`. **No migrations, no tests.** (A Windows-reserved `nul` entry is in the zip and was skipped.) Never executed. |

SRS numbering quirks: sections 3.2.5, 3.3.2 and several admin screens have duplicate numbers, and some "what this screen does" captions are duplicated. Treat the screen IDs in `UI_SCREEN_TRACEABILITY.md` as provisional.

## 2. Django project: what exists

- Django + DRF + **MySQL (PyMySQL)** + **SimpleJWT** (30-min access, 7-day refresh) + django-filter + throttling (30/min anon, 120/min user) + CORS. Production block sets SSL redirect, secure cookies and HSTS.
- 14 tables: `users, employees, restaurants, tables, categories, food, inventory, carts, cart_items, orders, order_items, payments, addresses, coupons`. Custom `User` (email login, unique phone).
- Auth endpoints: `auth/register|login|refresh|logout|me|verify`. Employee authorization is by `employees.employee_type` (SUPER_ADMIN, ADMIN, RESTAURANT_MANAGER, STAFF, CHEF, CASHIER, DELIVERY, SUPPORT, ACCOUNTANT). Roles/user_roles tables were removed.
- ViewSets for all 14 tables. Money fields are `DecimalField`.

**It is a sound starting point** (real hashing, JWT, MySQL, DecimalField, uniqueness constraints on category and inventory). It is **not** feature-complete.

## 3. Django project vs SRS: gaps (verified by reading the code)

| # | Gap | SRS reference |
|---|---|---|
| D1 | **No OTP.** Customers register with email + password. No phone-login, no provider, no limits. | 3.1.1, 4.1 |
| D2 | Employee login is by email; SRS says **Employee ID + password** (`employee_code` exists but is not used for login). | 3.3.1 |
| D3 | **No branch concept beyond `Restaurant`.** SRS Branch has name, address, contact, manager and status. `Restaurant` has lat/long (required) and no manager. No branch scoping on any queryset, and an employee's `restaurant` is never used for filtering. | 3.2.6, 4.x |
| D4 | **`Order.restaurant` and `Food`/`Table` use `on_delete=CASCADE`.** Deleting a restaurant deletes its orders. `OrderItem.food` CASCADE deletes historical lines. | Prompt 4.4 |
| D5 | **No server-side pricing.** Totals are read-only but never computed (default 0). No GST/service/takeaway charge, no coupon validation. | 3.1.4, 3.1.5 |
| D6 | **No order state machine or history.** `status` is a free string defaulting to "PENDING". The client can set it on create/update. No `placed_by` / `accepted_by` employee, so "employee sees only own orders" can't work, and employees currently see **all** orders. | 3.3.2 |
| D7 | **IDOR/leaks:** `CartItemViewSet` and `OrderItemViewSet` have no ownership filter. `CartViewSet` returns all carts with `user` null to anyone. `UserViewSet.list` lets any authenticated user list all users (name, email, phone). Tables list is `AllowAny` and exposes `qr_token`. | Prompt 4.3 |
| D8 | `OrderSerializer` is `__all__` and writable (status, coupon, table, restaurant from the client). `perform_create` does not validate table/restaurant or branch. | |
| D9 | **Payments:** only a `Payment` row; no Razorpay order id, signature, webhook event, idempotency, or payment status on the order. Customers can't create payments (`IsCashier`). | 3.1.6 |
| D10 | **Inventory:** per dish only, status is a free string, **no stock transactions, no automatic deduction, no restock endpoint**, no negative-stock guard. | 3.2.5 |
| D11 | **Food:** `images` is a JSON list (no upload/ImageField, which explains the reported image issues), no ingredients, discount, customizations or branch price, and `is_veg` + `food_type` duplicate the Veg/Non-Veg/Vegan classification. | 3.2.5 |
| D12 | **Tables:** no location or linked menu, free-text status, `qr_data` text. | 3.2.3 |
| D13 | **Coupons:** one table. No redemptions, no dish discounts, no first-time logic beyond a flag, no branch. | 3.1.5, 3.2.7 |
| D14 | No e-bill/invoice model, no PDF, no Channels/WebSockets, no audit log, no analytics API, no tests, no migrations committed. | 3.x, 5.3 |
| D15 | Logout does not blacklist tokens (`rest_framework_simplejwt.token_blacklist` not installed); `ROTATE_REFRESH_TOKENS` without blacklist. | 4.1 |
| D16 | `register` is `AllowAny` and creates a `User` with `is_staff` False: fine. But nothing stops anyone registering with a staff-looking name or phone, and there is no verified phone. | |

## 4. URL mismatch with the existing frontend

The frontend calls `/users/users`, `/restaurant/food`, `/orders/orders`, `/users/roles`... and expects `{state, data, pagination}`. This Django project exposes `/users`, `/food`, `/orders` and `/auth/*` and only wraps the auth responses in the `{state, data}` envelope; viewsets return `StandardPagination` output (not inspected). The frontend's server (`192.168.150.171`) was **an earlier build with roles/user_roles**. So the frontend services have to be re-pointed in any case.

## 5. SRS requirements: new or clarified facts

- Statuses named in the SRS: **admin boxes** Pending, Preparing, Ready, Serving, Completed, Cancelled. **Customer tracker** Placed, Preparing, Ready, Served, Completed. Employee updates through Preparing, Ready, Served, Completed. "Accept" and "Reject" exist. Rejected shows "Order Cancelled".
- Coupons: first-time = mobile number has no prior **completed** order, checked at OTP verification. Auto-applied when cart total exceeds the coupon minimum. First-timers can add **one** extra coupon. Returning customers: one coupon per order. Promo voucher fields: code, discount value, minimum order value, validity. Dish discounts are separate and per dish.
- Price = base + customization; total includes **GST, "service taxes", coupons**, plus an additional **takeaway charge**. **No rates are given.**
- Stock is deducted "when an order is placed". Out-of-stock dishes are shown in greyscale, and Restock lives on the dish card and the inventory card. Low-stock colors: green, yellow, red.
- Table fields: number, capacity, location, **linked menu**. Tables: Available / Reserved / Occupied; manual vacate. Admin and employee both get a **Takeaway Order** button; takeaway has no table and (for staff) no customer login; the customer sees no Track Order. After placing, staff see **Go to Menu / Track Order / Kitchen Queue**.
- E-bill: visible and downloadable only when status is Completed; admin/employee can preview the bill while in progress. After viewing the e-bill and logging out, return to the login/landing screen.
- Employee form: name, branch, phone, password, department, role, job title. Admin filters by department and searches by name. Employee sees only their own orders (can filter by employee), plus the full kitchen queue.
- Non-functional: relational database, real-time sync without refresh, HTTPS-style secure transport, mobile-first customer UI, desktop/tablet admin and employee UI.
- **ER diagram:** Admin, Branch, Employee, Category, Dish (name, price, discount, dietary type), Dining table (number, qr_code, status), Inventory (item, quantity, stock_status), Orders (type, status, total), Order item, Payment (amount, mode, status), Coupon (code, discount, min order, validity), Ebill (generated_at, file_url). "Each Order generates exactly one Payment and one E-bill."

## 6. Conflicts and ambiguities that need your decision

| # | Issue | Options / my recommendation |
|---|---|---|
| Q1 | **SRS 3.2.6: deleting a branch deletes its tables, employees, menu and coupons.** The project rules forbid deleting historical orders, payments and invoices. | Soft-delete (deactivate) branch; hide its tables/menu/coupons/employees; keep orders and bills. **Recommended.** Confirm. |
| Q2 | **Order statuses:** Is there an "Accepted" state, or does Accept move Pending to Preparing? The SRS boxes have no Accepted. Also Serving vs Served. | Recommend `PENDING -> PREPARING` on Accept (no separate state), `READY`, `SERVED`, `COMPLETED`, `CANCELLED`. Confirm. |
| Q3 | **Tax rates:** GST, "service tax" and takeaway charge are unspecified. The old frontend used 5% GST, 2% service, Rs 15 per item takeaway. | Store as admin-configurable settings per branch; confirm the values. |
| Q4 | "Exactly one Payment per order" vs retries after failure. | One successful payment per order; keep failed attempts as separate rows. |
| Q5 | **Table "linked menu"** and "branch price": is there a per-branch or per-table menu entity, or just branch-specific dishes? | Recommend branch-scoped categories/dishes with a per-branch price. Confirm. |
| Q6 | Admin "take order for a table" prompts for the customer's **mobile number** (3.2.3), but employee takeaway needs **no login**. For anonymous takeaway, first-time coupon eligibility can't be determined. | Table orders: capture mobile (no OTP, flagged unverified?) or OTP; anonymous takeaway: no first-time coupon. Confirm. |
| Q7 | **Employee login by Employee ID** (SRS) vs email (Django). | Use `employee_code` as the login identifier; keep email optional. |
| Q8 | **Stock deduction timing** ("when order placed") vs online payment failure. | Deduct on order creation inside the transaction; restore on payment failure/cancel/reject. Confirm. |
| Q9 | Customers: can the same phone have multiple concurrent active orders? SRS says the latest order's tracking is also visible on second order. | Allow; show the active-orders list. |
| Q10 | Customer identity for staff-assisted dine-in orders without a customer account. | See Q6. |

## 7. Revised architecture decision

Previous proposal: build a new backend. **Revised: use the supplied Django project as the base** and extend it in place (preserve what works: MySQL, JWT, custom user, employees). Concretely:
- Keep `User`/`Employee` and JWT; add phone-OTP customer login, `employee_code` login, token blacklist.
- Introduce a branch model (evolve `Restaurant` to `Branch` or add `Branch`), and add a branch-scoping mixin; replace `CASCADE` with `PROTECT` on financial relations.
- Split the single `api` app into the domain apps listed in the plan **only when needed**. Phase 2 will propose the minimum restructuring so as to avoid unnecessary rewrites.
- Because there are no migrations in the archive and the live DB (the earlier build at `192.168.150.171`) had roles/user_roles, Phase 2 starts with a **fresh dev database**; data migration from the live server needs separate approval and a backup.

## 8. UI source of truth

SRS screenshots are available (see `UI_SCREEN_TRACEABILITY.md`). The screenshots match the **existing frontend crimson theme** (`theme.css` `#be123c`/`#9f1239`), not `variables.css` (`#b51f3a`); see `UI_DESIGN_TOKENS.md` for sampled values. Rendering the current frontend and comparing is a later-phase task and **has not been done**.
