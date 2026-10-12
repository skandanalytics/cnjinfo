"""Phase 7: orders from carts, status machine, kitchen queue, live events."""
from decimal import Decimal as D

from asgiref.sync import async_to_sync
from channels.db import database_sync_to_async
from channels.layers import get_channel_layer
from channels.testing import WebsocketCommunicator
from django.core.cache import cache
from django.test import TransactionTestCase

from apps.accounts.models import Employee, User
from apps.accounts.services import issue_tokens
from apps.branches.models import DiningTable
from apps.carts.models import Cart
from apps.inventory.models import InventoryItem
from apps.menu.models import Category, Food
from apps.orders.models import Order
from apps.payments.models import Payment

from .helpers import customer_client, make_branch, make_staff
from .test_cart import CartBase


class OrderTests(CartBase):
    def setUp(self):
        super().setUp()
        self.stock = InventoryItem.objects.create(branch=self.a, food=self.dosa, quantity=6)
        self.user = self.customer("+919600000111")
        self.cust = customer_client(self.user)
        self.other_user = self.customer("+919600000112")
        self.other = customer_client(self.other_user)

    def fill(self, client, order_type="DINE_IN", qty=1):
        self.add(client, qty=qty)
        if order_type == "DINE_IN":
            self.context(client, order_type="DINE_IN", qr=str(self.table.qr_code))
        else:
            self.context(client, order_type="TAKEAWAY")

    def place(self, client=None, method="COUNTER", key="checkout-1"):
        return (client or self.cust).post(
            "/api/orders/",
            {"branch": self.a.id, "idempotency_key": key, "payment_method": method},
            format="json",
        )

    def move(self, order_id, status, reason="", client=None):
        body = {"status": status}
        if reason:
            body["reason"] = reason
        return (client or self.chef_a).post(f"/api/orders/{order_id}/transition/", body, format="json")

    def test_dine_in_order_deducts_stock_occupies_table_and_converts_the_cart(self):
        self.fill(self.cust, qty=2)
        r = self.place(method="COUNTER", key="dine-1")
        self.assertEqual(r.status_code, 201, r.content)
        body = r.json()
        self.assertTrue(body["order_number"].startswith("FD"))
        self.assertEqual(body["status"], "PENDING")
        self.assertEqual(body["payment_status"], "UNPAID")
        self.assertEqual(body["order_type"], "DINE_IN")
        self.assertEqual(body["table"]["label"], "T1")
        self.assertEqual(body["total_amount"], "230.00")  # 200 + 5% GST + 10% service
        self.assertEqual(body["gst_rate"], "5.00")
        self.assertEqual(body["items"][0]["quantity"], 2)
        self.assertEqual(body["history"][0]["to"], "PENDING")
        self.stock.refresh_from_db()
        self.table.refresh_from_db()
        self.assertEqual(self.stock.quantity, 4)
        self.assertEqual(self.table.status, DiningTable.Status.OCCUPIED)
        self.assertEqual(Cart.objects.get(user=self.user).status, Cart.Status.CONVERTED)
        self.assertEqual(Payment.objects.count(), 0)
        self.assertEqual(self.cust.get(f"/api/orders/{body['id']}/").status_code, 200)

    def test_takeaway_has_no_table_and_online_payment_stays_pending(self):
        self.fill(self.cust, order_type="TAKEAWAY")
        r = self.place(method="UPI", key="take-1")
        self.assertEqual(r.status_code, 201, r.content)
        body = r.json()
        self.assertIsNone(body["table"])
        self.assertEqual(body["order_type"], "TAKEAWAY")
        self.assertEqual(body["payment_status"], "PENDING")
        self.assertEqual(body["takeaway_charge"], "15.00")
        self.assertEqual(body["total_amount"], "130.75")  # 100 + 15 takeaway, GST 5.75, service 10
        self.assertEqual(Payment.objects.count(), 0)
        self.table.refresh_from_db()
        self.assertEqual(self.table.status, DiningTable.Status.AVAILABLE)

    def test_idempotency_key_is_per_customer(self):
        self.fill(self.cust)
        first = self.place(key="same-key")
        self.assertEqual(first.status_code, 201, first.content)
        again = self.place(key="same-key")
        self.assertEqual(again.status_code, 200, again.content)
        self.assertEqual(again.json()["id"], first.json()["id"])
        self.stock.refresh_from_db()
        self.assertEqual(self.stock.quantity, 5)
        self.assertEqual(Order.objects.filter(idempotency_key="same-key").count(), 1)
        self.fill(self.other)
        conflict = self.place(self.other, key="same-key")
        self.assertEqual((conflict.status_code, conflict.json()["code"]), (409, "idempotency_conflict"))
        self.stock.refresh_from_db()
        self.assertEqual(self.stock.quantity, 5)

    def test_accept_is_preparing_and_completing_does_not_vacate_the_table(self):
        self.fill(self.cust)
        order_id = self.place(key="life-1").json()["id"]
        self.assertEqual(self.move(order_id, "READY").status_code, 409)
        accepted = self.move(order_id, "PREPARING")
        self.assertEqual(accepted.status_code, 200, accepted.content)
        self.assertEqual(accepted.json()["status"], "PREPARING")
        order = Order.objects.get(pk=order_id)
        self.assertEqual(order.accepted_by_id, Employee.objects.get(employee_code="CHA001").user_id)
        self.assertEqual(self.move(order_id, "READY").json()["status"], "READY")
        self.assertEqual(self.move(order_id, "SERVED").json()["status"], "SERVED")
        done = self.move(order_id, "COMPLETED")
        self.assertEqual(done.status_code, 200, done.content)
        self.assertIsNotNone(done.json()["completed_at"])
        self.table.refresh_from_db()
        self.assertEqual(self.table.status, DiningTable.Status.OCCUPIED)
        self.assertEqual(self.move(order_id, "CANCELLED", "too late").status_code, 409)

    def test_cancel_needs_a_reason_restores_stock_and_releases_an_idle_table(self):
        self.fill(self.cust, qty=2)
        first = self.place(key="cancel-1").json()["id"]
        bare = self.move(first, "CANCELLED")
        self.assertEqual((bare.status_code, bare.json()["code"]), (400, "reason_required"))
        self.stock.refresh_from_db()
        self.assertEqual(self.stock.quantity, 4)
        self.fill(self.cust)
        second = self.place(key="cancel-2").json()["id"]
        self.table.refresh_from_db()
        self.assertEqual(self.table.status, DiningTable.Status.OCCUPIED)
        cancelled = self.move(first, "CANCELLED", "customer changed mind")
        self.assertEqual(cancelled.status_code, 200, cancelled.content)
        self.assertEqual(cancelled.json()["cancel_reason"], "customer changed mind")
        self.stock.refresh_from_db()
        self.table.refresh_from_db()
        self.assertEqual(self.stock.quantity, 5)  # the two units came back; the second order still holds one
        self.assertEqual(self.table.status, DiningTable.Status.OCCUPIED)
        self.move(second, "PREPARING")
        self.assertEqual(self.move(second, "CANCELLED", "kitchen closed").status_code, 200)
        self.stock.refresh_from_db()
        self.table.refresh_from_db()
        self.assertEqual(self.stock.quantity, 6)
        self.assertEqual(self.table.status, DiningTable.Status.AVAILABLE)
        self.assertEqual(self.move(second, "PREPARING").status_code, 409)

    def test_lists_are_scoped_and_the_kitchen_queue_is_unfinished_work(self):
        self.fill(self.cust)
        mine = self.place(key="list-1").json()["id"]
        self.fill(self.other)
        theirs = self.place(self.other, key="list-2").json()["id"]
        own = {row["id"] for row in self.cust.get("/api/orders/").json()}
        self.assertEqual(own, {mine})
        self.assertEqual(self.other.get(f"/api/orders/{mine}/").status_code, 404)
        self.assertEqual(self.admin_b.get(f"/api/orders/{mine}/").status_code, 404)
        self.assertEqual(self.chef_a.get(f"/api/orders/{mine}/").status_code, 200)
        branch_a = {row["id"] for row in self.chef_a.get("/api/orders/").json()}
        self.assertEqual(branch_a, {mine, theirs})
        self.assertEqual(self.admin_b.get("/api/orders/").json(), [])
        self.assertEqual({row["id"] for row in self.owner.get("/api/orders/").json()}, {mine, theirs})
        queue = {row["id"] for row in self.chef_a.get("/api/kitchen/queue/").json()}
        self.assertEqual(queue, {mine, theirs})
        self.assertEqual(self.admin_b.get("/api/kitchen/queue/").json(), [])
        self.move(mine, "PREPARING")
        self.move(mine, "READY")
        self.assertIn(mine, {row["id"] for row in self.chef_a.get("/api/kitchen/queue/?status=READY").json()})
        self.move(mine, "SERVED")
        self.assertNotIn(mine, {row["id"] for row in self.chef_a.get("/api/kitchen/queue/").json()})
        self.assertEqual(self.cust.get("/api/kitchen/queue/").status_code, 403)
        empty = self.chef_a.post("/api/orders/", {"branch": self.a.id, "idempotency_key": "x",
                                                 "payment_method": "COUNTER"}, format="json")
        self.assertEqual((empty.status_code, empty.json()["code"]), (400, "cart_empty"))

    def test_guests_and_an_unready_cart_cannot_place(self):
        guest = self.g.post("/api/orders/", {"branch": self.a.id, "idempotency_key": "g",
                                            "payment_method": "COUNTER"}, format="json")
        self.assertEqual(guest.status_code, 401)
        self.add(self.cust)
        blocked = self.place(key="no-table")
        self.assertEqual((blocked.status_code, blocked.json()["code"]), (409, "cart_invalid"))
        self.assertEqual(Order.objects.count(), 0)
        self.cust.delete(f"/api/cart/?branch={self.a.id}")
        empty = self.place(key="empty")
        self.assertEqual((empty.status_code, empty.json()["code"]), (400, "cart_empty"))
        self.add(self.cust)
        self.context(self.cust, order_type="TAKEAWAY")
        self.dosa.is_sold_out = True
        self.dosa.save()
        sold = self.place(key="sold")
        self.assertEqual(sold.status_code, 409)
        self.assertEqual(Order.objects.count(), 0)
        quote = self.cust.post("/api/pricing/quote/", {"branch": self.a.id, "order_type": "TAKEAWAY",
                                                       "items": [{"food": self.coffee.id, "quantity": 1}]},
                               format="json")
        self.assertEqual(quote.status_code, 200, quote.content)


class OrderLiveTests(TransactionTestCase):
    """The socket handler reads the user on another connection, so this cannot sit inside TestCase's open transaction."""

    def setUp(self):
        cache.clear()
        self.a = make_branch("A")
        self.b = make_branch("B")
        make_staff("+919500000001", "ADMIN", None, code="OWN001")
        make_staff("+919500000003", "CHEF", self.a, code="CHA001")
        make_staff("+919500000004", "ADMIN", self.b, code="ADB001")
        self.a.gst_rate, self.a.service_charge_rate, self.a.takeaway_charge = D("5"), D("10"), D("15")
        self.a.save()
        cat = Category.objects.create(branch=self.a, name="Mains")
        self.dosa = Food.objects.create(branch=self.a, category=cat, name="Dosa", price=D("100"))
        self.table = DiningTable.objects.create(branch=self.a, table_number="T1", capacity=4)
        self.user = User.objects.create_user(phone="+919600000111")
        self.cust = customer_client(self.user)

    def _asgi(self):
        from config.asgi import application
        return application

    def test_live_event_is_sent_after_commit_to_the_right_groups(self):
        self.cust.post("/api/cart/items/", {"branch": self.a.id, "food": self.dosa.id, "quantity": 1}, format="json")
        ctx = self.cust.put("/api/cart/context/",
                            {"branch": self.a.id, "order_type": "DINE_IN", "qr": str(self.table.qr_code)},
                            format="json")
        self.assertEqual(ctx.status_code, 200, ctx.content)
        tokens = {
            "customer": issue_tokens(self.user)["access"],
            "chef": issue_tokens(Employee.objects.get(employee_code="CHA001").user)["access"],
            "owner": issue_tokens(Employee.objects.get(employee_code="OWN001").user)["access"],
            "other": issue_tokens(Employee.objects.get(employee_code="ADB001").user)["access"],
        }

        def place():
            return self.cust.post("/api/orders/", {"branch": self.a.id, "idempotency_key": "live-1",
                                                   "payment_method": "COUNTER"}, format="json")

        async def scenario():
            await get_channel_layer().flush()
            comms = {name: WebsocketCommunicator(self._asgi(), f"/ws/orders/?token={token}")
                     for name, token in tokens.items()}
            rejected = WebsocketCommunicator(self._asgi(), "/ws/orders/")
            self.assertFalse((await rejected.connect())[0])
            for comm in comms.values():
                connected, _ = await comm.connect()
                self.assertTrue(connected)
            created = await database_sync_to_async(place)()
            events = {}
            for name in ("customer", "chef", "owner"):
                events[name] = await comms[name].receive_json_from(timeout=2)
            quiet = await comms["other"].receive_nothing(timeout=0.3)
            for comm in comms.values():
                await comm.disconnect()
            return created, events, quiet

        created, events, quiet = async_to_sync(scenario)()
        self.assertEqual(created.status_code, 201, created.content)
        payload = created.json()
        for event in events.values():
            self.assertEqual((event["order_id"], event["status"], event["branch_id"]),
                             (payload["id"], "PENDING", self.a.id))
            self.assertNotIn("type", event)
        self.assertTrue(quiet)

