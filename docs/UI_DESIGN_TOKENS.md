# UI Design Tokens (initial, partial)

Evidence: single-pixel samples from SRS images `image9.png` (customer menu, 355x781) and `image26.png` (admin dashboard, 737x352), plus the existing frontend CSS in `foodie.zip`. Pixel samples can hit anti-aliased text or gradients, so they are **estimates**, not exact values, unless marked otherwise.

| Token | Value | Evidence | Confidence |
|---|---|---|---|
| Customer top banner ("Ordering for: Table Dine-In") | `#DC3545` | pixel (20,20) in image9; equals Bootstrap `danger` | Exact (flat color) |
| Offer hero gradient | `#BA123C` to `#A11239` | pixels in image9 hero card | Estimated (gradient) |
| Brand primary | about `#BE123C`; dark `#9F1239` | matches `src/styles/theme.css` (`--primary-color #be123c`, `--primary-dark #9f1239`) | Likely |
| Conflicting existing token | `#b51f3a` | `src/styles/variables.css`; does **not** match the SRS samples | n/a |
| Customer page background | `#F8F9FA` | pixel (8,400) in image9 | Estimated |
| Nav bar background | `#FFFFFF` | pixel in image9 | Exact |
| Admin sidebar background | `#1E1E2D` | pixel (60,300) in image26 | Estimated |
| Admin page background | `#F1F2F3` | pixel (130,60) in image26 | Estimated |
| Admin header/card background | `#FFFFFF` | image26 | Exact |
| Admin avatar | `#BE265E` | pixel (613,16) | Estimated |

## Observed but not yet measured
- Customer: logo tile "F" in crimson with white letter; pill-shaped search field and chips; rounded cards (about 16-20 px visible radius); bottom navigation with three items (Menu, Cart, History) and the active item in crimson; veg indicator as a green dot in a square outline; "31% OFF" badge on food images.
- Admin: dark sidebar with MAIN and OPERATIONS groups (Dashboard, Orders, Tables, Kitchen Queue, Add Menu, Inventory, Manage Branch, Offers & Coupons, Employee); active item filled crimson; four summary tiles with tinted circular icons; "Recent Activities" and "Top Selling Items" cards; status pills in pink.
- Typography: appears to be a geometric sans-serif (family, weights and sizes **not determined**; check against `index.css`/Bootstrap defaults).

## Not yet determined
Font family/sizes/line-heights, spacing scale, radii, shadows, component heights, breakpoints, status colors (success/warning/error, stock colors green/yellow/red per SRS 3.2.5), dietary indicator colors. These must be measured screen by screen when UI work starts (Section 2A).

## Action implied
When UI work starts, reconcile `variables.css` and `theme.css` into one token set. The SRS evidence points to the `theme.css` values.
