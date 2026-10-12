"""Phase 8: Razorpay (test double only), pay-on-counter, stock restore, PDF invoice."""
import json
from decimal import Decimal

from django.test import override_settings

from apps.accounts.models import User
from apps.billing.models import Invoice
from apps.inventory.models import InventoryItem, StockTransaction
from apps.inventory.services import deduct_for_order
from apps.menu.models import Category, Food
from apps.payments.gateway import FakeRazorpay, sign_checkout, sign_webhook, use_gateway
from apps.payments.models import Payment, PaymentEvent

from .helpers import StaffTestCase, customer_client, make_order

SECRET = "unit-test-secret"
KEYS = {"RAZORPAY_KEY_ID": "rzp_test_foodie", "RAZORPAY_KEY_SECRET": SECRET, "RAZORPAY_WEBHOOK_SECRET": ""}


def _customer(phone):
    return User.objects.create_user(phone=phone, name="Customer", user_type="CUSTOMER")


class PaymentCase(StaffTestCase):
    def setUp(self):
        super().setUp()
        self.user = _customer("+919700000201")
        self.other_user = _customer("+919700000202")
        self.cust = customer_client(self.user)
        self.other = customer_client(self.other_user)
        self.cat = Category.objects.create(branch=self.a, name="Mains")
        self.food = Food.objects.create(branch=self.a, category=self.cat, name="Dosa", price=Decimal("80"))
        self.fake = FakeRazorpay()
        use_gateway(self.fake)

    def tearDown(self):
        use_gateway(None)
        super().tearDown()

    def order(self, number, total="250.50", payment_status="PENDING", qty=1, customer=None):
        order = make_order(self.a, [(self.food, qty)], number=number, customer=customer or self.user)
        order.total_amount = Decimal(total)
        order.payment_status = payment_status
        order.save(update_fields=["total_amount", "payment_status", "updated_at"])
        return order

    def start(self, order, method="UPI", client=None):
        return (client or self.cust).post(f"/api/orders/{order.id}/pay/", {"method": method}, format="json")


@override_settings(**KEYS)
class OnlinePaymentTests(PaymentCase):
    def test_verified_signature_marks_paid_and_replay_does_not_apply_twice(self):
        order = self.order("PAY1")
        started = self.start(order, method="CARD")
        self.assertEqual(started.status_code, 201, started.content)
        body = started.json()
        self.assertEqual(body["key_id"], "rzp_test_foodie")
        self.assertNotIn(SECRET, started.content.decode())
        self.assertEqual(body["amount"], "250.50")
        self.assertEqual(body["status"], "PENDING")
        self.assertEqual(len(self.fake.created), 1)
        pay_id = "pay_test_1"
        signature = sign_checkout(body["razorpay_order_id"], pay_id, SECRET)
        payload = {
            "razorpay_order_id": body["razorpay_order_id"],
            "razorpay_payment_id": pay_id,
            "razorpay_signature": signature,
        }
        first = self.cust.post("/api/payments/verify/", payload, format="json")
        self.assertEqual(first.status_code, 200, first.content)
        self.assertEqual(first.json()["status"], "SUCCESS")
        order.refresh_from_db()
        self.assertEqual(order.payment_status, "PAID")
        again = self.cust.post("/api/payments/verify/", payload, format="json")
        self.assertEqual(again.status_code, 200, again.content)
        self.assertEqual(Payment.objects.filter(order=order, status="SUCCESS").count(), 1)
        self.assertEqual(PaymentEvent.objects.filter(event_id=f"checkout:{pay_id}").count(), 1)
        order.refresh_from_db()
        self.assertEqual(order.payment_status, "PAID")

    def test_bad_signature_does_not_mark_paid(self):
        order = self.order("PAY2")
        started = self.start(order)
        self.assertEqual(started.status_code, 201, started.content)
        bad = self.cust.post("/api/payments/verify/", {
            "razorpay_order_id": started.json()["razorpay_order_id"],
            "razorpay_payment_id": "pay_test_bad",
            "razorpay_signature": "not-a-valid-signature",
        }, format="json")
        self.assertEqual((bad.status_code, bad.json()["code"]), (400, "invalid_signature"))
        order.refresh_from_db()
        self.assertEqual(order.payment_status, "PENDING")
        self.assertFalse(Payment.objects.filter(status="SUCCESS").exists())
        self.assertFalse(PaymentEvent.objects.exists())

    def _webhook(self, payload, event_id, signature=None):
        raw = json.dumps(payload, separators=(",", ":"))
        if signature is None:
            signature = sign_webhook(raw, SECRET)
        return self.anon.post(
            "/api/payments/webhook/", data=raw, content_type="application/json",
            HTTP_X_RAZORPAY_SIGNATURE=signature, HTTP_X_RAZORPAY_EVENT_ID=event_id,
        )

    def test_captured_webhook_marks_paid_once(self):
        order = self.order("PAY4", total="100.00")
        started = self.start(order, method="WALLET")
        self.assertEqual(started.status_code, 201, started.content)
        rz_order = started.json()["razorpay_order_id"]
        payload = {"id": "evt_cap_1", "event": "payment.captured", "payload": {"payment": {"entity": {
            "id": "pay_cap_1", "order_id": rz_order, "amount": 10000, "status": "captured",
        }}}}
        first = self._webhook(payload, "evt_cap_1")
        self.assertEqual(first.status_code, 200, first.content)
        order.refresh_from_db()
        self.assertEqual(order.payment_status, "PAID")
        replay = self._webhook(payload, "evt_cap_1")
        self.assertEqual(replay.status_code, 200, replay.content)
        self.assertTrue(replay.json()["duplicate"])
        forged = dict(payload)
        forged["id"] = "evt_cap_bad"
        rejected = self._webhook(forged, "evt_cap_bad", signature="deadbeef")
        self.assertEqual(rejected.json()["code"], "invalid_signature")
        self.assertEqual(Payment.objects.filter(order=order, status="SUCCESS").count(), 1)
        self.assertEqual(PaymentEvent.objects.filter(payment__order=order).count(), 1)

    def test_payment_failure_restores_stock_once(self):
        stock = InventoryItem.objects.create(branch=self.a, food=self.food, quantity=5)
        order = self.order("PAY3", qty=2)
        deduct_for_order(order)
        stock.refresh_from_db()
        self.assertEqual(stock.quantity, 3)
        started = self.start(order, method="UPI")
        self.assertEqual(started.status_code, 201, started.content)
        rz_order = started.json()["razorpay_order_id"]

        def send(event_id):
            payload = {
                "id": event_id,
                "event": "payment.failed",
                "payload": {"payment": {"entity": {
                    "id": "pay_fail_1", "order_id": rz_order, "error_description": "Bank declined",
                }}},
            }
            raw = json.dumps(payload, separators=(",", ":"))
            return self.anon.post(
                "/api/payments/webhook/", data=raw, content_type="application/json",
                HTTP_X_RAZORPAY_SIGNATURE=sign_webhook(raw, SECRET),
                HTTP_X_RAZORPAY_EVENT_ID=event_id,
            )

        first = send("evt_fail_1")
        self.assertEqual(first.status_code, 200, first.content)
        order.refresh_from_db()
        stock.refresh_from_db()
        self.assertEqual(order.payment_status, "FAILED")
        self.assertEqual(Payment.objects.get(order=order).status, "FAILED")
        self.assertEqual(stock.quantity, 5)
        replay = send("evt_fail_1")
        self.assertEqual(replay.status_code, 200, replay.content)
        self.assertTrue(replay.json()["duplicate"])
        second = send("evt_fail_2")
        self.assertEqual(second.status_code, 200, second.content)
        stock.refresh_from_db()
        self.assertEqual(stock.quantity, 5)
        self.assertEqual(StockTransaction.objects.filter(
            order=order, transaction_type=StockTransaction.Type.ORDER_RESTORE).count(), 1)
        self.assertFalse(Payment.objects.filter(status="SUCCESS").exists())


class CounterAndInvoiceTests(PaymentCase):
    def test_customer_cannot_record_counter_payment(self):
        order = self.order("CTR1", payment_status="UNPAID")
        denied = self.cust.post(f"/api/orders/{order.id}/counter-payment/", {}, format="json")
        self.assertEqual(denied.status_code, 403)
        order.refresh_from_db()
        self.assertEqual(order.payment_status, "UNPAID")
        self.assertFalse(Payment.objects.exists())

    def test_branch_staff_record_counter_once_and_other_branch_is_hidden(self):
        order = self.order("CTR2", payment_status="UNPAID", total="250.50")
        mismatch = self.chef_a.post(
            f"/api/orders/{order.id}/counter-payment/", {"amount": "1.00"}, format="json")
        self.assertEqual(mismatch.json()["code"], "amount_mismatch")
        recorded = self.chef_a.post(f"/api/orders/{order.id}/counter-payment/", {"amount": "250.50"}, format="json")
        self.assertEqual(recorded.status_code, 201, recorded.content)
        self.assertEqual(recorded.json()["method"], "COUNTER")
        self.assertEqual(recorded.json()["status"], "SUCCESS")
        self.assertEqual(recorded.json()["amount"], "250.50")
        order.refresh_from_db()
        self.assertEqual(order.payment_status, "PAID")
        again = self.admin_a.post(f"/api/orders/{order.id}/counter-payment/", {}, format="json")
        self.assertEqual((again.status_code, again.json()["code"]), (409, "already_paid"))
        self.assertEqual(Payment.objects.filter(order=order, status="SUCCESS").count(), 1)
        self.assertEqual(self.admin_b.post(f"/api/orders/{order.id}/counter-payment/", {}, format="json").status_code, 404)
        own = {row["id"] for row in self.cust.get("/api/payments/").json()}
        self.assertEqual(own, {recorded.json()["id"]})
        self.assertEqual(self.other.get("/api/payments/").json(), [])
        self.assertEqual(self.other.get(f"/api/payments/{recorded.json()['id']}/").status_code, 404)
        self.assertEqual(self.admin_b.get("/api/payments/").json(), [])
        self.assertEqual(self.chef_a.get(f"/api/payments/{recorded.json()['id']}/").status_code, 200)

    def test_invoice_only_after_completed_and_preview_is_not_stored(self):
        order = self.order("BILL1", payment_status="UNPAID", total="80.00")
        preview = self.chef_a.get(f"/api/orders/{order.id}/bill-preview/")
        self.assertEqual(preview.status_code, 200, preview.content)
        body = preview.json()
        self.assertFalse(body["final"])
        self.assertIsNone(body["invoice_number"])
        self.assertEqual(body["total_amount"], "80.00")
        self.assertEqual(body["payment_status"], "UNPAID")
        self.assertEqual(body["items"][0]["quantity"], 1)
        self.assertEqual(Invoice.objects.count(), 0)
        self.assertEqual(self.admin_b.get(f"/api/orders/{order.id}/bill-preview/").status_code, 404)
        early = self.cust.get(f"/api/orders/{order.id}/invoice/")
        self.assertEqual((early.status_code, early.json()["code"]), (409, "invoice_not_ready"))
        self.assertEqual(Invoice.objects.count(), 0)
        for step in ("PREPARING", "READY", "SERVED"):
            moved = self.chef_a.post(f"/api/orders/{order.id}/transition/", {"status": step}, format="json")
            self.assertEqual(moved.status_code, 200, moved.content)
            self.assertEqual(Invoice.objects.count(), 0)
        done = self.chef_a.post(f"/api/orders/{order.id}/transition/", {"status": "COMPLETED"}, format="json")
        self.assertEqual(done.status_code, 200, done.content)
        self.assertEqual(done.json()["payment_status"], "UNPAID")
        self.assertEqual(Invoice.objects.count(), 1)
        invoice = Invoice.objects.get(order=order)
        self.assertEqual(invoice.invoice_number, f"INV-{order.order_number}")
        downloaded = self.cust.get(f"/api/orders/{order.id}/invoice/")
        self.assertEqual(downloaded.status_code, 200)
        self.assertTrue(downloaded["Content-Type"].startswith("application/pdf"))
        pdf = downloaded.content
        self.assertTrue(pdf.startswith(b"%PDF"))
        self.assertIn(order.order_number.encode(), pdf)
        self.assertIn(invoice.invoice_number.encode(), pdf)
        self.assertEqual(Invoice.objects.count(), 1)
        self.assertEqual(self.other.get(f"/api/orders/{order.id}/invoice/").status_code, 404)
        self.assertEqual(self.admin_b.get(f"/api/orders/{order.id}/invoice/").status_code, 404)
        staff_copy = self.chef_a.get(f"/api/orders/{order.id}/invoice/")
        self.assertEqual(staff_copy.status_code, 200)
        self.assertTrue(staff_copy.content.startswith(b"%PDF"))


@override_settings(RAZORPAY_KEY_ID="", RAZORPAY_KEY_SECRET="", RAZORPAY_WEBHOOK_SECRET="")
class UnconfiguredPaymentTests(PaymentCase):
    def test_start_online_fails_closed_when_keys_are_empty(self):
        use_gateway(None)
        order = self.order("PAY0", payment_status="PENDING")
        refused = self.start(order, method="NETBANKING")
        self.assertEqual((refused.status_code, refused.json()["code"]), (503, "payments_unconfigured"))
        self.assertFalse(Payment.objects.filter(order=order).exists())
        order.refresh_from_db()
        self.assertEqual(order.payment_status, "PENDING")
        self.assertEqual(self.fake.created, [])
