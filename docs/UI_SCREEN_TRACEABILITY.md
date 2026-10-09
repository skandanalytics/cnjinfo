# UI Screen Traceability (initial inventory)

Source: `SRS Document.ver2.docx`, section 8. Images were extracted from the docx to a temp folder (`foodie_audit\srs_media`, not part of the repo); the docx itself was not modified.

**Caveats**
- Image-to-screen mapping is derived from the document order and is **provisional**: only `image9` (Menu), `image26` (Admin Dashboard) and `image3` (ER) were opened. Image numbers may be offset by one against the captions, since an image and its caption can be in either order. Confirm each while capturing.
- Screens 5 and 6 of the admin flow (Tables, Add Table) have duplicated or missing captions in the SRS.
- Viewport of the screenshots: customer ~355x781 (mobile), admin ~737x352 crops. Full-viewport sizes for admin are not known.
- **No rendered screenshot of the current app has been captured or compared.** Every status below is `Not Started`.
- Existing route/page names come from `foodie.zip` and were not rendered.

## Customer (mobile)

| ID | Screen (SRS) | Provisional image | Existing route | Existing page | Status |
|---|---|---|---|---|---|
| C-01 | Enter Mobile Number | image5 | `/customer/welcome` | `customer/Welcome.jsx` | Not Started |
| C-02 | OTP Verification | image6 | `/customer/login` | `customer/CustomerLogin.jsx` | Not Started |
| C-03 | Choose Dining Option | image7 | modal | `components/customer/OrderTypeModal.jsx` | Not Started |
| C-04 | Digital Menu / Offers | image8 | `/customer/home` | `customer/Home.jsx` | Not Started |
| C-05 | Menu Dishes | image9 (viewed) | `/customer/home` | `customer/Home.jsx`, `FoodCard.jsx` | Not Started |
| C-06 | Food Item Details | image10 | `/customer/food/:id` | `customer/FoodDetails.jsx` | Not Started |
| C-07 | My Order / Cart | image11 | `/customer/cart` | `customer/Cart.jsx` | Not Started |
| C-08 | Coupon Applied | image12 | `/customer/cart` | `customer/Cart.jsx` | Not Started |
| C-09 | Order Bill Details | image13 | `/customer/cart` or checkout | to determine | Not Started |
| C-10 | Checkout Details | image14 | `/customer/checkout` | `customer/Checkout.jsx` | Not Started |
| C-11 | Payment Details | image15 | `/customer/payment` | `customer/Payment.jsx` | Not Started |
| C-12 | Payment Summary / Pay | image16 | `/customer/payment` | `customer/Payment.jsx` | Not Started |
| C-13 | Order Confirmation | image17 | `/customer/order-confirmation` | `customer/OrderConfirmation.jsx` | Not Started |
| C-14 | Track Order | image18 | `/customer/order-tracking/:id` | `customer/OrderTracking.jsx` | Not Started |
| C-15 | Order Status / Current Order | image19 | `/customer/order-tracking/:id` | same | Not Started |
| C-16 | Customer Order View | image20 | to determine | to determine | Not Started |
| C-17 | My Orders | image21 | `/customer/orders` | `customer/OrderHistory.jsx` | Not Started |
| C-18 | Track Order, Detailed Status | image22 | `/customer/order-tracking/:id` | `OrderTracking.jsx` | Not Started |
| C-19 | Order Invoice / Bill | image23 | modal | `components/orders/EBillModal.jsx` | Not Started |

## Admin (desktop/tablet)

| ID | Screen (SRS) | Provisional image | Existing route | Existing page | Status |
|---|---|---|---|---|---|
| A-01 | Admin Login | image24 | `/login` | `auth/Login.jsx` | Not Started |
| A-02 | Dashboard / Business Summary | image25/26 (26 viewed) | `/admin/dashboard` | `admin/Dashboard.jsx` | Not Started |
| A-03 | Business Analytics | image27 | `/admin/analytics` redirects to dashboard | `admin/Analytics.jsx` (unrouted) | Not Started |
| A-04 | Manage Orders (list + details) | image28-29 | `/admin/orders` | `admin/Orders.jsx` | Not Started |
| A-05 | Tables / Add Table | image30-31 | `/admin/tables` | `admin/Tables.jsx`, `AddTableModal.jsx` | Not Started |
| A-06 | Kitchen Queue | image32 | `/admin/kitchen` | `admin/Kitchen.jsx` | Not Started |
| A-07 | Menu: Categories | image33 | `/admin/menus` | `admin/MenuEditor.jsx` | Not Started |
| A-08 | Add Menu Category | image34 | modal | `menu/AddCategoryModal.jsx` | Not Started |
| A-09 | Food / Dish Management | image35 | `/admin/menus/:id` | `MenuEditor.jsx`, `DishCard.jsx` | Not Started |
| A-10 | Add / Edit Dish | image36 | modal | `AddDishModal.jsx`, `EditDishModal.jsx` | Not Started |
| A-11 | Inventory Management | image37 | `/admin/inventory` | `admin/Inventory.jsx` | Not Started |
| A-12 | Branch Management | image38 | `/admin/branches` | `admin/Branches.jsx` | Not Started |
| A-13 | Inventory (cards, restock) | image39 | `/admin/inventory` | `Inventory.jsx` | Not Started |
| A-14 | Coupon / Discount Management | image40 | `/admin/offers` | `admin/Offers.jsx` | Not Started |
| A-15 | Add Staff Member | image41 | `/admin/users` | `admin/Users.jsx` | Not Started |
| A-16 | Employee Form | image42 | modal | `Users.jsx` | Not Started |
| A-17 | Employee Details / Status | image43 | `/admin/users` | `Users.jsx` | Not Started |

## Employee (desktop/tablet)

| ID | Screen (SRS) | Provisional image | Existing route | Existing page | Status |
|---|---|---|---|---|---|
| E-01 | Employee Login | image44 | `/login` | `auth/Login.jsx` | Wired, not compared to the SRS |
| E-02 | Employee Dashboard | image44-45 | `/employee/dashboard` | `employee/EmployeeDashboard.jsx` | Wired, not compared to the SRS |
| E-03 | Orders and bills | image45 | `/employee/orders` | reuses `admin/Orders.jsx` | Wired, not compared to the SRS |
| E-04 | Manage Tables | image46? | `/employee/tables` | reuses `admin/Tables.jsx` | Wired, not compared to the SRS |
| E-05 | Kitchen Queue | image47? | `/employee/kitchen` | `admin/Kitchen.jsx` | Wired, not compared to the SRS |
| E-06 | Inventory | image48? | `/employee/inventory` | `admin/Inventory.jsx` | Wired, not compared to the SRS |

Note: the SRS has no separate Employee Management-style route naming, so employee routes are reused from admin. Whether the SRS shows employee screens that differ from admin screens must be checked image by image.

## Non-screen references
`image1`/`image2.svg` use-case diagram; `image3`/`image4.svg` ER diagram (viewed; summarized in `PHASE1_ADDENDUM.md`).

## Next steps for this document
1. Open each image and fix the mapping.
2. Record per-screen component inventory, sizes and colors.
3. Run the frontend, capture screenshots at the same viewport, compare, and fill in mismatches. Nothing is `Visually Compared` yet.
