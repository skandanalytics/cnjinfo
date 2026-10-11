"""Phase 6: server carts, guest cart merge, checkout validation."""
import hashlib
import threading
from decimal import Decimal as D

from django.db import connection
from django.test import TransactionTestCase, override_settings
from rest_framework.test import APIClient

from apps.branches.models import DiningTable
from apps.carts.models import Cart, CartItem
from apps.menu.models import Category, Food

from .helpers import customer_client, make_branch
from .test_pricing import PricingBase


def guest_client(token):
    c = APIClient()
    c.credentials(HTTP_X_GUEST_TOKEN=token)
    return c


class CartBase(PricingBase):
    """PricingBase branch A: GST 5%, service 10%, takeaway Rs 15. Dosa 100, Coffee 50.50, Cheese +20."""

    def setUp(self):
        super().setUp()
        self.token = self.anon.post("/api/cart/guest-token/").json()["guest_token"]
        self.g = guest_client(self.token)
        self.table = DiningTable.objects.create(branch=self.a, table_number="T1", capacity=4)

    def add(self, client=None, food=None, qty=1, **kw):
        body = {"branch": self.a.id, "food": (food or self.dosa).id, "quantity": qty}
        body.update(kw)
        return (client or self.g).post("/api/cart/items/", body, format="json")

    def get(self, client=None):
        return (client or self.g).get(f"/api/cart/?branch={self.a.id}").json()

    def context(self, client=None, **kw):
        body = {"branch": self.a.id, "order_type": "TAKEAWAY"}
        body.update(kw)
        return (client or self.g).put("/api/cart/context/", body, format="json")


class GuestCartTests(CartBase):
    def test_guest_token_issue(self):
        t1 = self.anon.post("/api/cart/guest-token/")
        t2 = self.anon.post("/api/cart/guest-token/")
        self.assertEqual(t1.status_code, 201)
        self.assertNotEqual(t1.json()["guest_token"], t2.json()["guest_token"])
        self.assertGreaterEqual(len(t1.json()["guest_token"]), 40)

    def test_token_is_stored_hashed(self):
        self.add()
        self.assertEqual(Cart.objects.get().guest_token, hashlib.sha256(self.token.encode()).hexdigest())

    def test_header_required(self):
        r = self.anon.get(f"/api/cart/?branch={self.a.id}")
        self.assertEqual((r.status_code, r.json()["code"]), (400, "guest_token_required"))
        self.assertEqual(guest_client("short").get(f"/api/cart/?branch={self.a.id}").status_code, 400)

    def test_empty_cart_view(self):
        c = self.get()
        self.assertEqual((c["items"], c["pricing"], c["can_checkout"]), ([], None, False))

    def test_add_item_prices_on_the_server(self):
        r = self.add(qty=2, options=[self.cheese.id])
        self.assertEqual(r.status_code, 201, r.content)
        cart = r.json()
        self.assertEqual(cart["items"][0]["quantity"], 2)
        self.assertEqual((cart["items"][0]["final_unit_price"], cart["items"][0]["line_total"]), ("120.00", "240.00"))
        self.assertEqual(cart["pricing"]["total_amount"], "276.00")  # 240 + 12 GST + 24 service

    def test_cart_persists_across_requests(self):
        self.add()
        again = guest_client(self.token)  # "page refresh": new client, same token
        self.assertEqual(len(self.get(again)["items"]), 1)

    def test_identical_lines_merge_but_different_ones_stay_separate(self):
        self.add(qty=1)
        self.add(qty=2)
        self.add(qty=1, options=[self.cheese.id])
        self.add(qty=1, special_instructions="no onion")
        self.add(qty=1, special_instructions="  no onion ")  # same after trimming
        items = self.get()["items"]
        # plain dosa x3, dosa+cheese x1, "no onion" x2 (the trimmed duplicate merged)
        self.assertEqual(sorted(i["quantity"] for i in items), [1, 2, 3])
        self.assertEqual(Cart.objects.filter(status="ACTIVE").count(), 1)

    def test_quantity_limit(self):
        self.add(qty=99)
        r = self.add(qty=1)
        self.assertEqual((r.status_code, r.json()["code"]), (400, "quantity_limit"))
        self.assertEqual(self.add(qty=0).status_code, 400)

    def test_invalid_items_rejected(self):
        cases = [self.add(food=self.vada), self.add(options=[999999]),
                 self.add(food=self.coffee, options=[self.cheese.id]), self.g.post(
                     "/api/cart/items/", {"branch": self.a.id, "food": 999999, "quantity": 1}, format="json")]
        for r in cases:
            self.assertEqual(r.status_code, 400, r.content)
        self.coffee.is_sold_out = True
        self.coffee.save()
        self.assertEqual(self.add(food=self.coffee).status_code, 400)
        self.assertEqual(CartItem.objects.count(), 0)

    def test_change_quantity_and_remove(self):
        item_id = self.add().json()["items"][0]["item_id"]
        r = self.g.patch(f"/api/cart/items/{item_id}/", {"quantity": 4}, format="json")
        self.assertEqual(r.json()["items"][0]["quantity"], 4)
        self.assertEqual(self.g.patch(f"/api/cart/items/{item_id}/", {"quantity": 0}, format="json").status_code, 400)
        self.assertEqual(self.g.patch(f"/api/cart/items/{item_id}/", {"quantity": 100}, format="json").status_code, 400)
        r = self.g.delete(f"/api/cart/items/{item_id}/")
        self.assertEqual(r.json()["items"], [])

    def test_clear_cart(self):
        self.add()
        self.add(food=self.coffee)
        r = self.g.delete(f"/api/cart/?branch={self.a.id}")
        self.assertEqual(r.json()["items"], [])
        self.assertEqual(CartItem.objects.count(), 0)

    def test_carts_are_private_to_their_owner(self):
        item_id = self.add().json()["items"][0]["item_id"]
        other_token = self.anon.post("/api/cart/guest-token/").json()["guest_token"]
        other = guest_client(other_token)
        self.assertEqual(self.get(other)["items"], [])
        self.assertEqual(other.patch(f"/api/cart/items/{item_id}/", {"quantity": 5}, format="json").status_code, 404)
        self.assertEqual(other.delete(f"/api/cart/items/{item_id}/").status_code, 404)
        customer = customer_client(self.customer())
        self.assertEqual(self.get(customer)["items"], [])
        self.assertEqual(customer.delete(f"/api/cart/items/{item_id}/").status_code, 404)
        self.assertEqual(CartItem.objects.get().quantity, 1)

    def test_staff_cannot_use_customer_carts_and_bad_token_rejected(self):
        self.assertEqual(self.chef_a.get(f"/api/cart/?branch={self.a.id}").status_code, 403)
        bad = APIClient()
        bad.credentials(HTTP_AUTHORIZATION="Bearer not-a-token")
        self.assertEqual(bad.get(f"/api/cart/?branch={self.a.id}").status_code, 401)

    def test_unknown_or_inactive_branch(self):
        self.assertEqual(self.g.get("/api/cart/?branch=99999").status_code, 404)
        self.assertEqual(self.g.get("/api/cart/").status_code, 400)
        self.a.is_active = False
        self.a.save()
        self.assertEqual(self.add().status_code, 404)

    def test_prices_follow_live_menu_changes(self):
        self.add()
        self.dosa.price = D("200")
        self.dosa.save()
        self.assertEqual(self.get()["pricing"]["items_subtotal"], "200.00")

    def test_line_that_becomes_unavailable_is_kept_flagged_and_excluded(self):
        self.context()
        self.add(food=self.dosa)
        self.add(food=self.coffee)
        self.coffee.is_sold_out = True
        self.coffee.save()
        cart = self.get()
        self.assertEqual(len(cart["items"]), 2)  # nothing silently dropped
        flagged = next(i for i in cart["items"] if i["name"] == "Coffee")
        self.assertIn("not available", flagged["issue"])
        self.assertEqual(cart["pricing"]["items_subtotal"], "100.00")  # only the orderable line is priced
        self.assertFalse(cart["can_checkout"])
        self.g.delete(f"/api/cart/items/{flagged['item_id']}/")
        self.assertTrue(self.get()["can_checkout"])


class ContextTests(CartBase):
    def test_takeaway_adds_charge_and_has_no_table(self):
        self.add(qty=2, options=[self.cheese.id])
        cart = self.context(order_type="TAKEAWAY").json()
        self.assertIsNone(cart["table"])
        self.assertEqual((cart["pricing"]["takeaway_charge"], cart["pricing"]["total_amount"]), ("15.00", "291.75"))
        self.assertTrue(cart["can_checkout"])

    def test_dine_in_requires_a_valid_scanned_table(self):
        self.add()
        r = self.context(order_type="DINE_IN")
        self.assertEqual((r.status_code, r.json()["code"]), (400, "qr_required"))
        self.assertFalse(self.get()["can_checkout"])
        r = self.context(order_type="DINE_IN", qr=str(self.table.qr_code))
        self.assertEqual(r.status_code, 200, r.content)
        cart = r.json()
        self.assertEqual(cart["table"]["table_number"], "T1")
        self.assertTrue(cart["can_checkout"])
        self.assertEqual(cart["pricing"]["takeaway_charge"], "0.00")

    def test_table_context_survives_refresh_and_switching_modes(self):
        self.context(order_type="DINE_IN", qr=str(self.table.qr_code))
        self.assertEqual(self.get(guest_client(self.token))["table"]["table_number"], "T1")
        self.context(order_type="TAKEAWAY")
        self.assertIsNone(self.get()["table"])  # takeaway never keeps a table
        self.assertEqual(self.context(order_type="DINE_IN").json()["code"], "qr_required")  # must rescan

    def test_bad_qr_codes_rejected(self):
        other_table = DiningTable.objects.create(branch=self.b, table_number="T1", capacity=2)
        self.assertEqual(self.context(order_type="DINE_IN", qr=str(other_table.qr_code)).status_code, 400)
        self.assertEqual(self.context(order_type="DINE_IN", qr="00000000-0000-0000-0000-000000000000").status_code,
                         400)
        self.assertEqual(self.context(order_type="DINE_IN", qr="nope").status_code, 400)
        self.table.qr_is_active = False
        self.table.save()
        self.assertEqual(self.context(order_type="DINE_IN", qr=str(self.table.qr_code)).status_code, 400)

    def test_table_deactivated_after_scan_blocks_checkout(self):
        self.add()
        self.context(order_type="DINE_IN", qr=str(self.table.qr_code))
        self.table.is_active = False
        self.table.save()
        cart = self.get()
        self.assertFalse(cart["can_checkout"])
        self.assertIn("no longer available", cart["issues"][0]["detail"])


class CouponInCartTests(CartBase):
    def test_apply_and_remove_coupon(self):
        self.coupon("SAVE30")
        self.add(qty=2)
        self.context()
        r = self.g.post("/api/cart/coupon/", {"branch": self.a.id, "code": "save30"}, format="json")
        self.assertEqual(r.status_code, 200, r.content)
        cart = r.json()
        self.assertEqual(cart["coupon_codes"], ["SAVE30"])
        self.assertEqual(cart["pricing"]["coupon_discount_total"], "30.00")
        self.assertEqual(self.get()["coupon_codes"], ["SAVE30"])  # persisted
        r = self.g.delete(f"/api/cart/coupon/?branch={self.a.id}")
        self.assertEqual((r.json()["coupon_codes"], r.json()["pricing"]["coupon_discount_total"]), ([], "0.00"))

    def test_bad_coupons_rejected_with_reason(self):
        self.coupon("BIG", min_order_value=D("1000"))
        self.add()
        for code, text in [("NOPE", "Invalid coupon code"), ("BIG", "Add items worth")]:
            r = self.g.post("/api/cart/coupon/", {"branch": self.a.id, "code": code}, format="json")
            self.assertEqual(r.status_code, 400, code)
            self.assertIn(text, r.json()["detail"])
        self.assertEqual(self.get()["coupon_codes"], [])
        empty = guest_client(self.anon.post("/api/cart/guest-token/").json()["guest_token"])
        self.assertEqual(empty.post("/api/cart/coupon/", {"branch": self.a.id, "code": "X"}, format="json")
                         .status_code, 400)

    def test_first_time_customer_gets_auto_coupon_in_cart(self):
        self.coupon("WELCOME", is_first_time_auto=True, discount_type="PERCENT", discount_value=D("10"))
        c = customer_client(self.customer())
        self.add(c, qty=2)
        pricing = self.get(c)["pricing"]
        self.assertTrue(pricing["is_first_time_customer"])
        self.assertEqual([(x["code"], x["auto_applied"]) for x in pricing["coupons"]], [("WELCOME", True)])
        # a guest with the same cart gets nothing automatically
        self.add(self.g, qty=2)
        self.assertEqual(self.get(self.g)["pricing"]["coupons"], [])

    def test_offer_progress_message_data(self):
        self.coupon("NEAR", min_order_value=D("300"))
        self.add(qty=2)
        op = self.get()["pricing"]["offer_progress"]
        self.assertEqual((op["coupon_code"], op["remaining_amount"]), ("NEAR", "100.00"))


class MergeTests(CartBase):
    def setUp(self):
        super().setUp()
        self.user = self.customer("+919700000001")
        self.c = customer_client(self.user)

    def merge(self, token=None, client=None):
        return (client or self.c).post("/api/cart/merge/", {"guest_token": token or self.token}, format="json")

    def active(self, branch=None):
        return Cart.objects.filter(user=self.user, branch=branch or self.a, status="ACTIVE")

    def test_guest_cart_is_adopted_when_customer_has_none(self):
        self.add(qty=2, options=[self.cheese.id])
        self.context(order_type="DINE_IN", qr=str(self.table.qr_code))
        self.assertEqual(self.merge().json(), {"merged_branches": [self.a.id]})
        cart = self.get(self.c)
        self.assertEqual((cart["items"][0]["quantity"], cart["table"]["table_number"]), (2, "T1"))
        self.assertEqual(self.active().count(), 1)
        self.assertEqual(self.get(self.g)["items"], [])  # the guest token no longer owns anything

    def test_merge_adds_quantities_and_keeps_other_lines(self):
        self.add(self.c, qty=1)  # customer already has 1 dosa
        self.add(self.c, food=self.coffee, qty=1)
        self.add(qty=2)  # guest: 2 dosa
        self.add(qty=1, options=[self.cheese.id])  # guest: dosa + cheese (a different line)
        self.add(food=self.coffee, qty=3)
        self.merge()
        items = {(i["name"], tuple(i["options"])): i["quantity"] for i in self.get(self.c)["items"]}
        self.assertEqual(items, {("Dosa", ()): 3, ("Dosa", (self.cheese.id,)): 1, ("Coffee", ()): 4})
        self.assertEqual(self.active().count(), 1)  # never two active carts
        self.assertEqual(Cart.objects.filter(status="MERGED").count(), 1)

    def test_merge_respects_quantity_cap(self):
        self.add(self.c, qty=90)
        self.add(qty=50)
        self.merge()
        self.assertEqual(self.get(self.c)["items"][0]["quantity"], 99)

    def test_merge_keeps_guest_context_and_adopts_coupon(self):
        self.coupon("SAVE30")
        self.add(self.c)
        self.add(qty=2)
        self.context(order_type="TAKEAWAY")
        self.g.post("/api/cart/coupon/", {"branch": self.a.id, "code": "SAVE30"}, format="json")
        self.merge()
        cart = self.get(self.c)
        self.assertEqual((cart["order_type"], cart["coupon_codes"]), ("TAKEAWAY", ["SAVE30"]))

    def test_each_branch_is_merged_separately(self):
        self.add()
        self.g.post("/api/cart/items/", {"branch": self.b.id, "food": self.vada.id, "quantity": 2}, format="json")
        self.assertEqual(sorted(self.merge().json()["merged_branches"]), sorted([self.a.id, self.b.id]))
        self.assertEqual(len(self.get(self.c)["items"]), 1)
        self.assertEqual(self.c.get(f"/api/cart/?branch={self.b.id}").json()["items"][0]["quantity"], 2)

    def test_unavailable_guest_item_is_kept_and_flagged_not_dropped(self):
        self.add(food=self.coffee)
        self.coffee.is_sold_out = True
        self.coffee.save()
        self.merge()
        cart = self.get(self.c)
        self.assertEqual(len(cart["items"]), 1)
        self.assertIsNotNone(cart["items"][0]["issue"])
        self.assertFalse(cart["can_checkout"])

    def test_merge_is_repeatable_and_unknown_tokens_are_harmless(self):
        self.add()
        self.merge()
        self.assertEqual(self.merge().json(), {"merged_branches": []})  # nothing left to merge
        self.assertEqual(self.merge("x" * 43).json(), {"merged_branches": []})
        self.assertEqual(self.get(self.c)["items"][0]["quantity"], 1)  # not doubled

    def test_merge_requires_a_customer_login(self):
        self.assertEqual(self.merge(client=self.anon).status_code, 401)
        self.assertEqual(self.merge(client=self.chef_a).status_code, 401)

    def test_another_customers_cart_is_untouched(self):
        oc = customer_client(self.customer("+919700000002"))
        self.add(oc, qty=5)
        self.add(qty=1)
        self.merge()
        self.assertEqual(self.get(oc)["items"][0]["quantity"], 5)

    @override_settings(DEBUG=True, OTP_PROVIDER="console", OTP_RESEND_COOLDOWN_SECONDS=0)
    def test_login_with_otp_merges_the_guest_cart(self):
        self.add(qty=3)
        phone = "9876500000"
        code = self.anon.post("/api/auth/otp/send/", {"phone": phone}, format="json").json()["dev_otp"]
        r = self.anon.post("/api/auth/otp/verify/", {"phone": phone, "otp": code, "guest_token": self.token},
                           format="json")
        self.assertEqual(r.status_code, 200, r.content)
        self.assertEqual(r.json()["merged_cart_branches"], [self.a.id])
        c = APIClient()
        c.credentials(HTTP_AUTHORIZATION=f"Bearer {r.json()['access']}")
        self.assertEqual(c.get(f"/api/cart/?branch={self.a.id}").json()["items"][0]["quantity"], 3)

    @override_settings(DEBUG=True, OTP_PROVIDER="console", OTP_RESEND_COOLDOWN_SECONDS=0)
    def test_login_without_guest_cart_still_works(self):
        code = self.anon.post("/api/auth/otp/send/", {"phone": "9876500001"}, format="json").json()["dev_otp"]
        r = self.anon.post("/api/auth/otp/verify/", {"phone": "9876500001", "otp": code, "guest_token": "x" * 43},
                           format="json")
        self.assertEqual((r.status_code, r.json()["merged_cart_branches"]), (200, []))


class CheckoutValidateTests(CartBase):
    def setUp(self):
        super().setUp()
        self.user = self.customer("+919800000001")
        self.c = customer_client(self.user)

    def check(self, client=None, **kw):
        body = {"branch": self.a.id}
        body.update(kw)
        return (client or self.c).post("/api/checkout/validate/", body, format="json")

    def ready_cart(self, **ctx):
        self.add(self.c, qty=2, options=[self.cheese.id])
        self.context(self.c, **(ctx or {"order_type": "DINE_IN", "qr": str(self.table.qr_code)}))

    def test_guest_must_log_in(self):
        self.add()
        r = self.check(self.g)
        self.assertEqual((r.status_code, r.json()["code"]), (401, "login_required"))
        self.assertEqual(self.check(self.anon).status_code, 401)

    def test_staff_cannot_check_out_as_customer(self):
        self.assertEqual(self.check(self.chef_a).status_code, 403)

    def test_empty_cart(self):
        r = self.check()
        self.assertEqual((r.status_code, r.json()["code"]), (400, "cart_empty"))

    def test_valid_dine_in_checkout_summary(self):
        self.ready_cart()
        r = self.check()
        self.assertEqual(r.status_code, 200, r.content)
        body = r.json()
        self.assertTrue(body["ready"])
        self.assertEqual(body["cart"]["table"]["table_number"], "T1")
        self.assertEqual(body["cart"]["pricing"]["total_amount"], "276.00")
        self.assertEqual(body["customer"]["phone"], "+919800000001")

    @override_settings(RAZORPAY_KEY_ID="", RAZORPAY_KEY_SECRET="")
    def test_online_methods_hidden_without_gateway_keys(self):
        self.ready_cart()
        self.assertEqual([m["code"] for m in self.check().json()["payment_methods"]], ["COUNTER"])

    @override_settings(RAZORPAY_KEY_ID="rzp_test_x", RAZORPAY_KEY_SECRET="secret")
    def test_online_methods_listed_with_gateway_keys(self):
        self.ready_cart()
        self.assertEqual([m["code"] for m in self.check().json()["payment_methods"]], ["UPI", "CARD", "COUNTER"])

    def test_valid_takeaway_checkout(self):
        self.ready_cart(order_type="TAKEAWAY")
        body = self.check().json()
        self.assertEqual((body["cart"]["table"], body["cart"]["pricing"]["takeaway_charge"]), (None, "15.00"))

    def test_dine_in_without_table_is_refused(self):
        self.add(self.c)
        r = self.check()
        self.assertEqual((r.status_code, r.json()["code"]), (409, "cart_invalid"))
        self.assertIn("QR", r.json()["issues"][0]["detail"])

    def test_item_no_longer_available_blocks_checkout(self):
        self.ready_cart()
        self.dosa.is_sold_out = True
        self.dosa.save()
        r = self.check()
        self.assertEqual(r.status_code, 409)
        self.assertIn("not available", r.json()["issues"][0]["detail"])

    def test_checkout_reflects_changes_made_after_adding(self):
        self.ready_cart()
        self.dosa.price = D("300")
        self.dosa.save()
        self.assertEqual(self.check().json()["cart"]["pricing"]["items_subtotal"], "600.00")

    def test_checkout_does_not_create_orders_or_clear_the_cart(self):
        from apps.orders.models import Order
        self.ready_cart()
        self.check()
        self.assertEqual(Order.objects.count(), 0)
        self.assertEqual(len(self.get(self.c)["items"]), 1)


class ConcurrentCartTests(TransactionTestCase):
    def test_parallel_adds_create_one_cart_and_lose_nothing(self):
        branch = make_branch("CT")
        cat = Category.objects.create(branch=branch, name="C")
        food = Food.objects.create(branch=branch, category=cat, name="Dosa", price=100)
        token = APIClient().post("/api/cart/guest-token/").json()["guest_token"]
        statuses = []

        def worker():
            try:
                r = guest_client(token).post("/api/cart/items/", {"branch": branch.id, "food": food.id,
                                                                  "quantity": 1}, format="json")
                statuses.append(r.status_code)
            finally:
                connection.close()

        threads = [threading.Thread(target=worker) for _ in range(6)]
        [t.start() for t in threads]
        [t.join(timeout=60) for t in threads]
        self.assertEqual(statuses, [201] * 6, statuses)
        self.assertEqual(Cart.objects.filter(status="ACTIVE").count(), 1)  # no duplicate active carts
        self.assertEqual(CartItem.objects.get().quantity, 6)  # no lost updates