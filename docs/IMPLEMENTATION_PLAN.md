# Implementation Plan

| Phase | Scope | Depends on | Key acceptance check |
|---|---|---|---|
| 1 | Audit and docs (this report) | None | Approval |
| 2 | Django + MySQL foundation, models, migrations, `.env.example` | Approval of new-backend decision, MySQL access | `migrate` succeeds on MySQL |
| 3 | Customer OTP, staff auth, permissions, logout isolation | 2 | Unauthorized API calls rejected; no client-side password checks left |
| 4 | Branches, tables, QR, categories, foods, images | 3 | CRUD persists; QR resolves server-side |
| 5 | Inventory, coupons, discounts, `PricingService` | 4, coupon rules from SRS | Pricing identical in cart, checkout and invoice |
| 6 | Customer menu, server cart, merge, checkout | 5 | Guest-to-login merge test |
| 7 | Orders, state machine, kitchen queue, Channels | 6 | Invalid transitions rejected; live updates |
| 8 | Razorpay, Pay-on-Counter, stock consistency, PDF e-bills | 7, Razorpay test keys | Duplicate webhook is idempotent |
| 9 | Admin interface wiring | 4-8 | All admin screens on real APIs |
| 10 | Employee interface wiring | 3-8 | Session isolation, assisted ordering |
| 11 | Integration and E2E tests (pytest, Playwright) | all | 24-step scenario |
| 12 | Deployment and release | 11 | Reproducible deployment |

**UI work (Section 2A)** is blocked until the SRS screenshots are available. Until then, bug fixes preserve the current styling as the baseline.

**Immediate prerequisites before Phase 2:**
1. Provide the SRS docx and the Django archive, or confirm they are unavailable.
2. Approve: new backend (C-decision), Redis, JSX/TS policy, MySQL host and credentials for dev.
3. Approve importing `foodie.zip` frontend into `frontend/` (excluding junk files).
