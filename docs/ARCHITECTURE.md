# Architecture Proposal (Phase 1, pending approval)

Status: **proposal**. No part of this is implemented. Decisions marked "Needs approval" require your sign-off.

## 1. Target layout

```
foodie/
  backend/            Django 5 + DRF + Channels (ASGI), MySQL 8
    config/           settings (base/dev/prod), asgi, urls
    apps/accounts  restaurants  menu  carts  coupons  orders
         payments  inventory  employees  billing  analytics  audit
  frontend/           Vite + React (existing JSX preserved; TS for new code only)
  docs/
```

Existing frontend in `foodie.zip` will be imported **as-is** into `frontend/` (excluding `scratch/`, `users.json`, `test-*.cjs`, `.locust_env`), then its services rewritten against the new API. UI styling stays.

## 2. Key decisions

| Topic | Proposal | Reason |
|---|---|---|
| Backend | **REVISED: extend the supplied `Foodie_Django_Employee_Auth` project** (MySQL, JWT, custom User + Employee already exist). See `PHASE1_ADDENDUM.md` sections 3 and 7 for gaps D1-D16. Needs approval. | Superseded the earlier "build new" proposal now that the source is available. |
| Auth | Django auth, **three separate credential/session realms**: customer (phone+OTP), staff (employee/admin, username/password). Token via **HttpOnly session cookie or short-lived JWT + refresh** (to confirm). | Replaces fake tokens and client-side password checks. |
| Authorization | DRF permission classes plus a `BranchScopedMixin` that filters every queryset by the user's branch(es). | Backend-enforced isolation. |
| Pricing | One `PricingService`, used by cart, checkout and invoice; amounts stored as `DecimalField`. Rates in configuration, not constants. | Single source of truth. |
| Cart | Server cart for customers; guest cart keyed by an opaque, signed guest token; merge on login in one transaction. | Removes localStorage carts. |
| Orders | State machine: `PLACED -> ACCEPTED -> PREPARING -> READY -> SERVED -> COMPLETED`, with `CANCELLED/REJECTED` allowed from the early states. History table per transition. Needs approval of vocabulary. | Aligns with the frontend statuses (Pending/Preparing/Ready/Served/Completed/Cancelled). |
| Payments | Separate `Payment` and `PaymentEvent` models (idempotent webhook keyed by the Razorpay event id); order, payment and table statuses are independent. | Per SRS. |
| Inventory | Deduct inside the order-confirmation transaction using `select_for_update`; a `StockTransaction` ledger. | Prevents double deduction and negative stock. |
| Real-time | Channels + Redis channel layer; events published with `transaction.on_commit`; authorized per branch/order groups; client refetches on reconnect. | Matches the Phase 7 spec. Redis is a **new infrastructure dependency (needs approval)**. |
| Invoices | Server-side PDF (reportlab or WeasyPrint, to choose), from persisted order snapshot. | Replaces client jsPDF. |
| Media | Django `MEDIA` storage, absolute image URLs in API responses. | Addresses the "images don't load after API integration" issue. |

## 3. Core data model (outline)

`User(role)`, `CustomerProfile(phone)`, `EmployeeProfile(user, branch, department)`, `Restaurant`, `Branch`, `Table(branch, number, capacity, status, qr_code unique)`, `Category`, `Food(category, diet_type, price, discount fields)`, `FoodImage`, `Customization`, `Cart/CartItem`, `Coupon/CouponRedemption`, `Order(branch, customer?, table?, type, status, payment_status, snapshot totals)`, `OrderItem(historical name/price)`, `OrderStatusHistory`, `Payment/PaymentEvent`, `InventoryItem/StockTransaction`, `Invoice`, `AuditLog`.

Constraints: unique `(branch, table number)`; unique active QR code; one open cart per customer; FKs use `PROTECT` for financial records (never cascade-delete orders, payments or invoices); soft deactivation for branches, employees and foods.

## 4. Order, payment and table lifecycles

- **Table:** `AVAILABLE -> RESERVED -> OCCUPIED -> AVAILABLE`. A table is released only when **no other active order** references it.
- **Payment:** `CREATED -> PENDING -> SUCCESS | FAILED | CANCELLED -> REFUNDED`. Pay-on-Counter stays `UNPAID` until staff record it.
- **Stock:** reserved or deducted at order confirmation (online: after payment verification; counter: at placement). Exact timing needs approval.

## 5. Migration risks

1. No access to existing backend source or data: existing records at `192.168.150.171` can't be migrated safely without a data export.
2. The frontend depends on shapes such as `{state, data, pagination}` and aliases like `restaurant/food`. Keep the envelope or adapt `normalizeApiResponse` in one place.
3. About 518 storage references and client-side auth will need staged removal (Phase 3).
4. Theme conflict (`#b51f3a` vs `#be123c`) can't be resolved without SRS screenshots.

## 6. Conflict register

| # | Conflict | Proposed resolution |
|---|---|---|
| C1 | Prompt: TypeScript for new code; existing frontend is JSX | Keep JSX, new modules in TS (needs approval) |
| C2 | Prompt: Django Channels needs a channel layer; no Redis mentioned | Approve Redis (dev: in-memory layer) |
| C3 | Prompt: MySQL 8; BRD says "backend-managed database" | Confirm MySQL |
| C4 | `foodie implementation_plan` says React Native/Expo and "clear the foodie folder" | **Ignore (stale).** Do not execute. |
| C5 | Frontend pricing constants (5% GST, 2% service, Rs 15 packing) vs "do not invent rates" | Move to configurable settings, confirm against SRS |
| C6 | Employee pages reuse admin components | Keep UI, enforce permissions in the backend |
| C7 | BRD workflow doc mentions delivery/pickup and email/password signup; target is Dine-In/Takeaway with phone OTP | Follow the target prompt, confirm with SRS |
