"""Regression tests for the dish image URL flow and the customer checkout flow."""
from apps.branches.models import DiningTable
from apps.carts.models import Cart
from apps.inventory.models import InventoryItem
from apps.menu.models import Category, Food
from apps.orders.models import Order

from .helpers import StaffTestCase, customer_client, png_file
from .test_cart import CartBase

URL = "https://example.com/images/veg-pizza.jpg"


class DishImageUrlTests(StaffTestCase):
    def setUp(self):
        super().setUp()
        self.cat = Category.objects.create(branch=self.a, name="Pizza")

    def create(self, **kw):
        body = {"category": self.cat.id, "name": "Veg Pizza", "price": "200.00", "image_url": URL}
        body.update(kw)
        return self.admin_a.post("/api/foods/", body, format="json")

    def test_supplied_url_is_saved_and_returned_exactly(self):
        r = self.create()
        self.assertEqual(r.status_code, 201, r.content)
        self.assertEqual((r.json()["image_url"], r.json()["primary_image"]), (URL, URL))
        self.assertEqual(Food.objects.get(pk=r.json()["id"]).image_url, URL)
        got = self.admin_a.get(f"/api/foods/{r.json()['id']}/").json()
        self.assertEqual((got["image_url"], got["primary_image"]), (URL, URL))

    def test_editing_other_fields_keeps_the_url(self):
        fid = self.create().json()["id"]
        other = Category.objects.create(branch=self.a, name="Mains")
        r = self.admin_a.patch(f"/api/foods/{fid}/", {"price": "250.00", "name": "Veg Pizza XL", "category": other.id},
                               format="json")
        self.assertEqual(r.status_code, 200, r.content)
        self.assertEqual(r.json()["primary_image"], URL)
        self.assertEqual(Food.objects.get(pk=fid).image_url, URL)

    def test_changing_and_clearing_the_url(self):
        fid = self.create().json()["id"]
        new = "https://cdn.example.org/pizza-2.png"
        self.assertEqual(self.admin_a.patch(f"/api/foods/{fid}/", {"image_url": new}, format="json")
                         .json()["primary_image"], new)
        cleared = self.admin_a.patch(f"/api/foods/{fid}/", {"image_url": ""}, format="json").json()
        self.assertEqual((cleared["image_url"], cleared["primary_image"]), ("", None))

    def test_rejects_malformed_and_non_http_urls(self):
        for bad in ("not a url", "ftp://example.com/a.jpg", "javascript:alert(1)", "data:image/png;base64,AAAA"):
            r = self.create(image_url=bad, name=f"Dish {bad[:5]}")
            self.assertEqual(r.status_code, 400, bad)
            self.assertIn("image_url", r.json())
        self.assertFalse(Food.objects.exists())

    def test_no_image_means_null_not_a_stock_photo(self):
        r = self.create(image_url="")
        self.assertEqual(r.status_code, 201, r.content)
        self.assertIsNone(r.json()["primary_image"])
        menu = self.anon.get(f"/api/public/branches/{self.a.id}/menu/").json()
        self.assertIsNone(menu["foods"][0]["primary_image"])

    def test_customer_menu_dish_detail_and_cart_show_the_admin_url(self):
        fid = self.create().json()["id"]
        menu = self.anon.get(f"/api/public/branches/{self.a.id}/menu/").json()
        self.assertEqual(menu["foods"][0]["primary_image"], URL)
        self.assertEqual(self.anon.get(f"/api/public/foods/{fid}/").json()["primary_image"], URL)
        token = self.anon.post("/api/cart/guest-token/").json()["guest_token"]
        self.anon.credentials(HTTP_X_GUEST_TOKEN=token)
        cart = self.anon.post("/api/cart/items/", {"branch": self.a.id, "food": fid, "quantity": 1}, format="json")
        self.assertEqual(cart.json()["items"][0]["image"], URL)

    def test_latest_choice_wins_between_upload_and_url(self):
        fid = self.create().json()["id"]
        up = self.admin_a.post("/api/food-images/", {"food": fid, "image": png_file(), "is_primary": True},
                               format="multipart")
        self.assertEqual(up.status_code, 201, up.content)
        dish = self.admin_a.get(f"/api/foods/{fid}/").json()
        self.assertEqual(dish["image_url"], "")
        self.assertEqual(dish["primary_image"], up.json()["url"])
        again = self.admin_a.patch(f"/api/foods/{fid}/", {"image_url": URL}, format="json").json()
        self.assertEqual(again["primary_image"], URL)

    def test_only_admins_of_the_branch_can_set_it(self):
        fid = self.create().json()["id"]
        self.assertEqual(self.chef_a.patch(f"/api/foods/{fid}/", {"image_url": URL + "?x"}, format="json")
                         .status_code, 403)
        self.assertEqual(self.admin_b.patch(f"/api/foods/{fid}/", {"image_url": URL + "?x"}, format="json")
                         .status_code, 404)
        self.assertEqual(Food.objects.get(pk=fid).image_url, URL)


class CheckoutFlowTests(CartBase):
    """The browser flow: PUT /cart/context/ -> POST /checkout/validate/ -> POST /orders/."""

    def setUp(self):
        super().setUp()
        self.stock = InventoryItem.objects.create(branch=self.a, food=self.dosa, quantity=5)
        self.user = self.customer("+919600000201")
        self.cust = customer_client(self.user)

    def checkout(self, order_type, qr=None, key="k-1", method="COUNTER", client=None):
        client = client or self.cust
        body = {"branch": self.a.id, "order_type": order_type}
        if qr is not None:
            body["qr"] = qr
        ctx = client.put("/api/cart/context/", body, format="json")
        if ctx.status_code != 200:
            return ctx
        review = client.post("/api/checkout/validate/", {"branch": self.a.id}, format="json")
        if review.status_code != 200:
            return review
        return client.post("/api/orders/", {"branch": self.a.id, "idempotency_key": key, "payment_method": method,
                                            "total_amount": "1.00"}, format="json")

    def test_takeaway_needs_no_qr_and_reaches_customer_kitchen_and_admin(self):
        self.add(self.cust, qty=2)
        r = self.checkout("TAKEAWAY")
        self.assertEqual(r.status_code, 201, r.content)
        body = r.json()
        order = Order.objects.get()
        self.assertEqual((body["id"], body["order_number"]), (order.id, order.order_number))
        self.assertEqual((order.order_type, order.table_id, order.status), ("TAKEAWAY", None, "PENDING"))
        self.assertEqual(body["total_amount"], "245.75")  # 200 + 15 takeaway, GST 5% on 215, service 10% on 200
        self.assertEqual(self.cust.get(f"/api/orders/{order.id}/").json()["id"], order.id)
        self.assertIn(order.id, [o["id"] for o in self.chef_a.get("/api/kitchen/queue/").json()])
        self.assertIn(order.id, [o["id"] for o in self.admin_a.get("/api/orders/").json()])
        self.assertNotIn(order.id, [o["id"] for o in self.admin_b.get("/api/orders/").json()])
        self.assertEqual(self.admin_b.get(f"/api/orders/{order.id}/").status_code, 404)

    def test_dine_in_needs_a_verified_qr_of_this_branch(self):
        self.add(self.cust)
        r = self.checkout("DINE_IN")
        self.assertEqual((r.status_code, r.json()["code"]), (400, "qr_required"))
        foreign = DiningTable.objects.create(branch=self.b, table_number="B1", capacity=2)
        r = self.checkout("DINE_IN", qr=str(foreign.qr_code))
        self.assertEqual((r.status_code, r.json()["code"]), (400, "qr_invalid"))
        self.assertEqual(self.checkout("DINE_IN", qr="T01").status_code, 400)
        self.assertFalse(Order.objects.exists())
        r = self.checkout("DINE_IN", qr=str(self.table.qr_code))
        self.assertEqual(r.status_code, 201, r.content)
        self.assertEqual(r.json()["table"]["label"], "T1")
        self.table.refresh_from_db()
        self.assertEqual(self.table.status, DiningTable.Status.OCCUPIED)

    def test_switching_from_dine_in_to_takeaway_drops_the_table(self):
        self.add(self.cust)
        self.context(self.cust, order_type="DINE_IN", qr=str(self.table.qr_code))
        r = self.checkout("TAKEAWAY")
        self.assertEqual(r.status_code, 201, r.content)
        self.assertIsNone(r.json()["table"])

    def test_repeated_submit_creates_one_order_and_deducts_once(self):
        self.add(self.cust, qty=2)
        first = self.checkout("TAKEAWAY", key="same")
        second = self.cust.post("/api/orders/", {"branch": self.a.id, "idempotency_key": "same",
                                                 "payment_method": "COUNTER"}, format="json")
        self.assertEqual((first.status_code, second.status_code), (201, 200))
        self.assertEqual(first.json()["id"], second.json()["id"])
        self.assertEqual(Order.objects.count(), 1)
        self.stock.refresh_from_db()
        self.assertEqual(self.stock.quantity, 3)

    def test_empty_and_unorderable_carts_are_refused(self):
        r = self.checkout("TAKEAWAY")
        self.assertEqual((r.status_code, r.json()["code"]), (400, "cart_empty"))
        self.add(self.cust)
        Food.objects.filter(pk=self.dosa.pk).update(is_sold_out=True)
        r = self.checkout("TAKEAWAY")
        self.assertEqual((r.status_code, r.json()["code"]), (409, "cart_invalid"))
        self.assertTrue(r.json()["issues"])
        self.assertFalse(Order.objects.exists())

    def test_cart_lifecycle_after_order(self):
        self.add(self.cust)
        self.assertEqual(self.checkout("TAKEAWAY").status_code, 201)
        self.assertEqual(Cart.objects.get(user=self.user).status, Cart.Status.CONVERTED)
        after = self.cust.get(f"/api/cart/?branch={self.a.id}").json()
        self.assertEqual((after["id"], after["items"]), (None, []))

    def test_customers_cannot_see_each_others_orders(self):
        self.add(self.cust)
        oid = self.checkout("TAKEAWAY").json()["id"]
        other = customer_client(self.customer("+919600000202"))
        self.assertEqual(other.get(f"/api/orders/{oid}/").status_code, 404)
        self.assertEqual(other.get("/api/orders/").json(), [])
        self.assertEqual(other.post(f"/api/orders/{oid}/pay/", {"method": "UPI"}, format="json").status_code, 404)

    def test_online_order_is_not_paid_until_the_server_verifies(self):
        self.add(self.cust)
        r = self.checkout("TAKEAWAY", method="UPI")
        self.assertEqual(r.status_code, 201, r.content)
        self.assertEqual(r.json()["payment_status"], "PENDING")
        fake = self.cust.post("/api/payments/verify/", {"razorpay_order_id": "order_x", "razorpay_payment_id": "pay_x",
                                                        "razorpay_signature": "forged"}, format="json")
        self.assertIn(fake.status_code, (400, 503))
        self.assertEqual(Order.objects.get().payment_status, "PENDING")
