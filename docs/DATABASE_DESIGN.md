# Database Design (Phase 2)

MySQL 8.0 (utf8mb4), Django ORM, migrations in `backend/apps/*/migrations`. Verified: all migrations apply on MySQL 8.0.45, and 20 schema tests pass (`backend/tests/test_models.py`).

## Setup

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\python -m pip install -r requirements.txt
copy .env.example .env        # then fill in DB_* and SECRET_KEY
```
```sql
CREATE DATABASE foodie_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'foodie_user'@'localhost' IDENTIFIED BY '<password>';
GRANT ALL PRIVILEGES ON foodie_db.* TO 'foodie_user'@'localhost';
GRANT ALL PRIVILEGES ON `test_foodie_db`.* TO 'foodie_user'@'localhost';  -- Django test runner
```
```powershell
.\.venv\Scripts\python manage.py migrate
.\.venv\Scripts\python manage.py createsuperuser   # phone number + password
.\.venv\Scripts\python manage.py runserver
.\.venv\Scripts\python manage.py test tests
```
`DEBUG=False` requires `SECRET_KEY` to be set and turns on HTTPS-only cookies, HSTS and SSL redirect. The `.env` file is git-ignored; no credentials are committed.

## Tables (apps)

| App | Tables | Notes |
|---|---|---|
| accounts | `users`, `employees`, `otp_requests` | Phone is the unique login identifier. Customers have an unusable password (OTP only). Employees log in with `employee_code` + password (Phase 3). OTP stores only a hash. |
| branches | `branches`, `dining_tables` | `Branch` replaces the old `Restaurant`. Tax/charge rates live on the branch (default 0, see Q3). Table `qr_code` is a unique UUID. Unique (branch, table_number). |
| menu | `categories`, `foods`, `food_images`, `customization_options`, `dish_discounts` | Branch-scoped. `diet_type` is VEG / NON_VEG / VEGAN. Images are real `ImageField` uploads. Dish discounts are separate from coupons. |
| inventory | `inventory_items`, `stock_transactions` | Status is derived (default threshold 5), never stored. `quantity >= 0` check. Ledger is unique per (item, order, type), which prevents duplicate deductions. |
| carts | `carts`, `cart_items`, `carts_coupons`, `cart_items_options` | Guest carts use `guest_token`. Prices are not stored (recomputed). `active_slot` unique column gives one active cart per owner and branch (MySQL has no partial unique index). |
| coupons | `coupons`, `coupon_redemptions` | Unique (branch, code). Date-range check. `is_first_time_auto` marks the auto-applied first-time coupon. |
| orders | `orders`, `order_items`, `order_status_history` | Price snapshot on the order; names and prices copied onto items. Status and payment status are separate fields. DB check: DINE_IN requires a table, TAKEAWAY forbids one. `idempotency_key` unique. |
| payments | `payments`, `payment_events` | One row per attempt. `success_slot` unique => at most one SUCCESS per order. `event_id` unique => webhook replays detected. |
| billing | `invoices` | One per order (SRS ER). Frozen JSON snapshot + PDF file. |
| audit | `audit_logs` | Append-only by convention. |

Plus Django's auth, sessions, admin and `token_blacklist` tables (JWT logout/rotation).

## Integrity policy
- **No hard deletes of history.** Orders, order items, payments, invoices, coupon redemptions and the stock ledger are never deleted (`PROTECT` between them). Their links to configuration records (branch, table, dish, coupon, staff user, stock row) are `SET_NULL`, and snapshots keep what the history needs (`branch_name`, `table_label`, `food_name`, `coupon_code`, `placed_by_name`). Branches, tables, dishes, categories and employees are therefore hard-deleted through their endpoints; branch deletion runs in one transaction in `apps/branches/services.py` (SRS 3.2.6).
- Money is `DecimalField(12,2)`; rates are `DecimalField(5,2)`.
- Order statuses: PENDING, PREPARING, READY, SERVED, COMPLETED, CANCELLED (decision Q2). **Transitions are not enforced yet** (Phase 7 service layer).
- Cascades that remain: cart items with their cart, food images/customizations/discounts with their dish (dishes themselves are never deleted once ordered), a customer's carts with the customer.

## Not in the schema yet / deliberately deferred
- Order state-machine rules, pricing, stock-deduction logic, OTP logic, permissions, all REST endpoints (later phases; this phase is the schema only).
- `Address` table from the old project was dropped (no SRS requirement). `Restaurant`/`roles`/`user_roles` are gone.
- Table "linked menu" (SRS 3.2.3): modeled as branch-scoped menus (decision Q5); no per-table menu link.
- Channels/Redis: not installed yet (Phase 7).

## Differences from the supplied Django project
Replaced: email login -> phone login; `employee_type` -> `role` (simplified: removed DELIVERY, SUPPORT, ACCOUNTANT, RESTAURANT_MANAGER renamed MANAGER, since the SRS has no such staff); JSON image list -> `FoodImage`; free-string statuses -> choices; `CASCADE` -> `PROTECT`. The old `api` views/serializers/permissions were **not** carried over; they are rebuilt in Phases 3-4 (they depended on the old models and had the authorization gaps listed in `PHASE1_ADDENDUM.md`).
