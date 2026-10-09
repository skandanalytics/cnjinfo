# Known Issues (Phase 1 audit)

## Verified in code
See `PHASE1_AUDIT.md` section 4: S1-S9 (client-side admin/employee password checks, fake tokens, fake OTP, `hash_pwd` accounts, frontend pricing, storage-based roles, PII dump in archive, duplicated auth state).

Other verified items:
- K1: Two inconsistent primary colors (`variables.css` `#b51f3a`, `theme.css` `#be123c`).
- K2: Legacy duplicate pages in `src/pages/*.jsx` import mock data (`Home.jsx`, `FoodDetails.jsx`, `OrderConfirmation.jsx` and `orderService.js` reference `data/foodData` or `mockData`).
- K3: Vite proxy target hardcoded to `http://192.168.150.171:8000`.
- K4: No automated tests; ad hoc scripts in `scratch/` only.
- K5: `foodie implementation_plan` describes a React Native rewrite that contradicts the project. Do not follow it.

## Previously reported, not yet reproduced (backend and running frontend unavailable)
Food images not loading after API integration, cart not persisting, blank page on category changes, wrong branch on table creation, table availability drift, order status not visible across admin and employee views, inventory wrong after refresh, coupon and price totals, logout state leakage.

## Django project issues (verified by reading code; see `PHASE1_ADDENDUM.md` D1-D16)
Notable: no OTP, no branch isolation, CASCADE deletes on financial records, no server-side pricing, no order state machine, IDOR on carts, cart items and order items, any authenticated user can list all users, public table list exposes QR tokens, no stock deduction, no migrations or tests.

## Operational
- Daphne/ASGI plus `CONN_MAX_AGE=60` pinned a MySQL connection on each worker thread until `max_connections` (error 1040). `CONN_MAX_AGE` is 0 so each request closes its connection. Staff order polling is a 30s fallback and backs off for 60s after a 5xx; the orders websocket remains the live channel.

## Blockers
- B1: ~~SRS not available~~ **Resolved** (supplied). About 45 of 49 SRS images still need individual review.
- B2: ~~Django source not available~~ **Resolved** (supplied, never executed).
- B3: MySQL connection details not provided (a fresh dev database is proposed).
- B4: Razorpay test credentials and an SMS provider are needed for Phases 3 and 8.
- B5: Open decisions Q1-Q10 in `PHASE1_ADDENDUM.md` (branch deletion, status vocabulary, tax rates, etc.).
