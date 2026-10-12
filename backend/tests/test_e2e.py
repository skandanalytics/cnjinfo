"""Phase 11: one API walk through the flows that already exist.

Rates are left at the branch default of 0. This file does not set GST, service, or takeaway.
Online pay is expected to fail closed (503) when Razorpay keys are empty. No gateway network call.
"""
from django.core.cache import cache
from django.core.exceptions import ImproperlyConfigured
from django.test import TestCase, override_settings
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.billing.models import Invoice
from apps.inventory.models import InventoryItem
from apps.payments.models import Payment

from .helpers import PW, make_staff

PHONE = "9811100111"


def bearer(access):
    client = APIClient()
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {access}")
    return client


@override_settings(DEBUG=True, OTP_PROVIDER="console", OTP_RESEND_COOLDOWN_SECONDS=0)
class TwentyFourStepScenario(TestCase):
    """Customer OTP, guest cart merge, counter checkout, chef status machine, one counter payment, invoice."""

    def setUp(self):
        cache.clear()
        self.anon = APIClient()
        owner = make_staff("+919811100001", "ADMIN", None, code="OWN11")
        self.owner_user = owner.user

    def test_counter_order_from_guest_cart_through_invoice(self):
        # 1. Owner signs in with the staff login.
        login = self.anon.post(
            "/api/auth/staff/login/",
            {"employee_code": "OWN11", "password": PW},
            format="json",
        )
        self.assertEqual(login.status_code, 200, login.content)
        owner = bearer(login.json()["access"])

        # 2. Admin creates the ordering branch and does not send tax or charge rates.
        created = owner.post(
            "/api/branches/",
            {"name": "Phase11 Kitchen", "address": "12 Test Lane"},
            format="json",
        )
        self.assertEqual(created.status_code, 201, created.content)
        branch = created.json()
        self.assertEqual(
            (branch["gst_rate"], branch["service_charge_rate"], branch["takeaway_charge"]),
            ("0.00", "0.00", "0.00"),
        )
        branch_id = branch["id"]

        # 3. A second branch exists only so isolation can be checked. Rates stay at the default.
        other = owner.post(
            "/api/branches/",
            {"name": "Phase11 Other", "address": "99 Other Road"},
            format="json",
        )
        self.assertEqual(other.status_code, 201, other.content)
        self.assertEqual(other.json()["gst_rate"], "0.00")
        other_id = other.json()["id"]

        # 4. Admin creates a table on the ordering branch.
        table = owner.post(
            "/api/tables/",
            {"branch": branch_id, "table_number": "T11", "capacity": 4},
            format="json",
        )
        self.assertEqual(table.status_code, 201, table.content)
        self.assertEqual(table.json()["branch"], branch_id)
        qr = table.json()["qr_code"]

        # 5. The public QR resolves to that branch and table.
        resolved = self.anon.get(f"/api/public/qr/{qr}/")
        self.assertEqual(resolved.status_code, 200, resolved.content)
        self.assertEqual(resolved.json()["branch"]["id"], branch_id)
        self.assertEqual(resolved.json()["table"]["table_number"], "T11")
        self.assertEqual(self.anon.get("/api/public/qr/not-a-uuid/").status_code, 404)

        # 6. Admin creates a category and a dish. The price is the only money figure sent.
        category = owner.post(
            "/api/categories/",
            {"branch": branch_id, "name": "Tiffin"},
            format="json",
        )
        self.assertEqual(category.status_code, 201, category.content)
        food = owner.post(
            "/api/foods/",
            {
                "branch": branch_id,
                "category": category.json()["id"],
                "name": "Masala Dosa",
                "price": "180.00",
                "diet_type": "VEG",
            },
            format="json",
        )
        self.assertEqual(food.status_code, 201, food.content)
        self.assertEqual(food.json()["price"], "180.00")
        food_id = food.json()["id"]

        # 7. Inventory starts at 4 so the later order can deduct stock.
        stock = owner.post(
            "/api/inventory/",
            {"food": food_id, "quantity": 4, "low_stock_threshold": 5},
            format="json",
        )
        self.assertEqual(stock.status_code, 201, stock.content)
        self.assertEqual(stock.json()["quantity"], 4)

        # 8. The public menu shows that dish at the stored price.
        menu = self.anon.get(f"/api/public/branches/{branch_id}/menu/")
        self.assertEqual(menu.status_code, 200, menu.content)
        listed = menu.json()["foods"]
        self.assertEqual(len(listed), 1)
        self.assertEqual(listed[0]["name"], "Masala Dosa")
        self.assertEqual((listed[0]["original_price"], listed[0]["discounted_price"]), ("180.00", "180.00"))

        # 9. A guest cart prices two units on the server. Totals stay the dish price because rates are 0.
        token = self.anon.post("/api/cart/guest-token/").json()["guest_token"]
        guest = APIClient()
        guest.credentials(HTTP_X_GUEST_TOKEN=token)
        added = guest.post(
            "/api/cart/items/",
            {"branch": branch_id, "food": food_id, "quantity": 2},
            format="json",
        )
        self.assertEqual(added.status_code, 201, added.content)
        pricing = added.json()["pricing"]
        self.assertEqual(added.json()["items"][0]["quantity"], 2)
        self.assertEqual(pricing["total_amount"], "360.00")
        self.assertEqual(
            (pricing["gst_amount"], pricing["service_charge_amount"], pricing["takeaway_charge"]),
            ("0.00", "0.00", "0.00"),
        )

        # 10. Takeaway context: no table.
        context = guest.put(
            "/api/cart/context/",
            {"branch": branch_id, "order_type": "TAKEAWAY"},
            format="json",
        )
        self.assertEqual(context.status_code, 200, context.content)
        self.assertEqual(context.json()["order_type"], "TAKEAWAY")
        self.assertIsNone(context.json()["table"])

        # 11. A guest cannot check out.
        blocked = guest.post("/api/checkout/validate/", {"branch": branch_id}, format="json")
        self.assertEqual((blocked.status_code, blocked.json()["code"]), (401, "login_required"))

        # 12. With DEBUG and the console provider, send returns dev_otp.
        sent = self.anon.post("/api/auth/otp/send/", {"phone": PHONE}, format="json")
        self.assertEqual(sent.status_code, 200, sent.content)
        self.assertIn("dev_otp", sent.json())
        self.assertEqual(len(sent.json()["dev_otp"]), 6)

        # 13. Verify merges the guest cart into the new customer.
        verified = self.anon.post(
            "/api/auth/otp/verify/",
            {"phone": PHONE, "otp": sent.json()["dev_otp"], "guest_token": token},
            format="json",
        )
        self.assertEqual(verified.status_code, 200, verified.content)
        self.assertEqual(verified.json()["merged_cart_branches"], [branch_id])
        self.assertTrue(verified.json()["is_first_time_customer"])
        self.assertEqual(verified.json()["user"]["user_type"], "CUSTOMER")
        customer = bearer(verified.json()["access"])

        # 14. The customer cart has the merged lines. The guest token no longer has them.
        mine = customer.get(f"/api/cart/?branch={branch_id}")
        self.assertEqual(mine.status_code, 200, mine.content)
        self.assertEqual(mine.json()["items"][0]["quantity"], 2)
        self.assertEqual(mine.json()["pricing"]["total_amount"], "360.00")
        self.assertEqual(mine.json()["order_type"], "TAKEAWAY")
        leftover = guest.get(f"/api/cart/?branch={branch_id}")
        self.assertEqual(leftover.json()["items"], [])

        # 15. Checkout offers Pay on Counter and is ready.
        review = customer.post("/api/checkout/validate/", {"branch": branch_id}, format="json")
        self.assertEqual(review.status_code, 200, review.content)
        self.assertTrue(review.json()["ready"])
        methods = {row["code"] for row in review.json()["payment_methods"]}
        self.assertIn("COUNTER", methods)
        self.assertEqual(review.json()["cart"]["pricing"]["total_amount"], "360.00")

        # 16. The customer places a counter order. It is unpaid. No payment row yet.
        placed = customer.post(
            "/api/orders/",
            {"branch": branch_id, "idempotency_key": "phase11-counter", "payment_method": "COUNTER"},
            format="json",
        )
        self.assertEqual(placed.status_code, 201, placed.content)
        order = placed.json()
        order_id = order["id"]
        self.assertEqual(order["status"], "PENDING")
        self.assertEqual(order["payment_status"], "UNPAID")
        self.assertEqual(order["order_type"], "TAKEAWAY")
        self.assertIsNone(order["table"])
        self.assertEqual(order["total_amount"], "360.00")
        self.assertEqual((order["gst_rate"], order["gst_amount"], order["takeaway_charge"]), ("0.00", "0.00", "0.00"))
        self.assertEqual(order["service_charge_amount"], "0.00")
        self.assertEqual(Payment.objects.filter(order_id=order_id).count(), 0)
        tracked = customer.get(f"/api/orders/{order_id}/")
        self.assertEqual(tracked.json()["order_number"], order["order_number"])

        # 17. Branch chefs are created by the admin. Each chef sees only their branch.
        chef_a_row = owner.post(
            "/api/employees/",
            {
                "name": "Phase11 Chef",
                "phone": "9811100112",
                "password": PW,
                "branch": branch_id,
                "role": "CHEF",
            },
            format="json",
        )
        self.assertEqual(chef_a_row.status_code, 201, chef_a_row.content)
        chef_b_row = owner.post(
            "/api/employees/",
            {
                "name": "Phase11 Other Chef",
                "phone": "9811100113",
                "password": PW,
                "branch": other_id,
                "role": "CHEF",
            },
            format="json",
        )
        self.assertEqual(chef_b_row.status_code, 201, chef_b_row.content)
        chef_a = self._staff(chef_a_row.json()["employee_code"])
        chef_b = self._staff(chef_b_row.json()["employee_code"])
        visible = {row["id"] for row in chef_a.get("/api/orders/").json()}
        hidden = {row["id"] for row in chef_b.get("/api/orders/").json()}
        self.assertIn(order_id, visible)
        self.assertNotIn(order_id, hidden)
        self.assertEqual(chef_b.get(f"/api/orders/{order_id}/").status_code, 404)

        # 18. Staff checkout without a cart is refused (empty cart), not treated as a customer order.
        assisted = chef_a.post(
            "/api/orders/",
            {"branch": branch_id, "idempotency_key": "phase11-assisted", "payment_method": "COUNTER"},
            format="json",
        )
        self.assertEqual((assisted.status_code, assisted.json()["code"]), (400, "cart_empty"))

        # 19. Online pay fails closed while Razorpay keys are empty. No network call.
        online = customer.post(f"/api/orders/{order_id}/pay/", {"method": "UPI"}, format="json")
        self.assertEqual((online.status_code, online.json()["code"]), (503, "payments_unconfigured"))
        self.assertEqual(Payment.objects.filter(order_id=order_id).count(), 0)

        # 20. The branch chef walks the status machine. The other branch's queue stays empty of this order.
        queue_a = {row["id"] for row in chef_a.get("/api/kitchen/queue/").json()}
        queue_b = {row["id"] for row in chef_b.get("/api/kitchen/queue/").json()}
        self.assertIn(order_id, queue_a)
        self.assertNotIn(order_id, queue_b)
        self.assertEqual(chef_a.post(f"/api/orders/{order_id}/transition/", {"status": "READY"}, format="json").status_code, 409)
        for status_name in ("PREPARING", "READY", "SERVED"):
            moved = chef_a.post(
                f"/api/orders/{order_id}/transition/",
                {"status": status_name},
                format="json",
            )
            self.assertEqual(moved.status_code, 200, moved.content)
            self.assertEqual(moved.json()["status"], status_name)
        self.assertEqual(customer.get(f"/api/orders/{order_id}/").json()["status"], "SERVED")
        self.assertEqual(
            chef_b.post(f"/api/orders/{order_id}/transition/", {"status": "COMPLETED"}, format="json").status_code,
            404,
        )

        # 21. The invoice is refused until the order is completed, and nothing is stored yet.
        early = customer.get(f"/api/orders/{order_id}/invoice/")
        self.assertEqual((early.status_code, early.json()["code"]), (409, "invoice_not_ready"))
        self.assertEqual(Invoice.objects.filter(order_id=order_id).count(), 0)
        preview = chef_a.get(f"/api/orders/{order_id}/bill-preview/")
        self.assertEqual(preview.status_code, 200, preview.content)
        self.assertFalse(preview.json()["final"])
        self.assertEqual(preview.json()["total_amount"], "360.00")
        self.assertEqual(Invoice.objects.filter(order_id=order_id).count(), 0)

        # 22. Completing the order stores the invoice. The PDF is the stored snapshot.
        done = chef_a.post(f"/api/orders/{order_id}/transition/", {"status": "COMPLETED"}, format="json")
        self.assertEqual(done.status_code, 200, done.content)
        self.assertEqual(done.json()["status"], "COMPLETED")
        pdf = customer.get(f"/api/orders/{order_id}/invoice/")
        self.assertEqual(pdf.status_code, 200)
        self.assertEqual(pdf["Content-Type"], "application/pdf")
        body = pdf.content
        self.assertTrue(body.startswith(b"%PDF"))
        invoice = Invoice.objects.get(order_id=order_id)
        self.assertEqual(invoice.snapshot["total_amount"], "360.00")
        self.assertEqual(invoice.snapshot["gst_amount"], "0.00")
        self.assertEqual(invoice.snapshot["takeaway_charge"], "0.00")
        self.assertTrue(invoice.invoice_number.startswith("INV-"))

        # 23. Counter payment is recorded once for the full total. A second success is rejected.
        paid = chef_a.post(f"/api/orders/{order_id}/counter-payment/", {}, format="json")
        self.assertEqual(paid.status_code, 201, paid.content)
        self.assertEqual((paid.json()["method"], paid.json()["status"], paid.json()["amount"]), ("COUNTER", "SUCCESS", "360.00"))
        again = chef_a.post(f"/api/orders/{order_id}/counter-payment/", {}, format="json")
        self.assertEqual((again.status_code, again.json()["code"]), (409, "already_paid"))
        self.assertEqual(Payment.objects.filter(order_id=order_id, status="SUCCESS").count(), 1)
        self.assertEqual(customer.get(f"/api/orders/{order_id}/").json()["payment_status"], "PAID")

        # 24. The other branch cannot pay or download the invoice. Stock dropped by the ordered quantity.
        self.assertEqual(chef_b.post(f"/api/orders/{order_id}/counter-payment/", {}, format="json").status_code, 404)
        self.assertEqual(chef_b.get(f"/api/orders/{order_id}/invoice/").status_code, 404)
        self.assertEqual(InventoryItem.objects.get(food_id=food_id).quantity, 2)
        self.assertEqual(User.objects.filter(phone="+919811100111", user_type="CUSTOMER").count(), 1)

    def _staff(self, code):
        client = APIClient()
        logged = client.post(
            "/api/auth/staff/login/",
            {"employee_code": code, "password": PW},
            format="json",
        )
        self.assertEqual(logged.status_code, 200, logged.content)
        client.credentials(HTTP_AUTHORIZATION=f"Bearer {logged.json()['access']}")
        return client


@override_settings(DEBUG=False, OTP_PROVIDER="console")
class DevOtpHiddenWhenDebugOff(TestCase):
    def test_console_otp_is_refused_and_does_not_return_a_code(self):
        cache.clear()
        client = APIClient()
        with self.assertRaises(ImproperlyConfigured):
            client.post("/api/auth/otp/send/", {"phone": PHONE}, format="json")
