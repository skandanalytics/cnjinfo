"""Phase 5: inventory API, stock service, concurrency."""
import threading
from decimal import Decimal

from django.db import connection
from django.test import TransactionTestCase

from apps.inventory import services
from apps.inventory.models import InventoryItem, StockTransaction
from apps.menu.models import Category, Food

from .helpers import StaffTestCase, make_branch, make_order, rows


class InventoryBase(StaffTestCase):
    def setUp(self):
        super().setUp()
        self.cat = Category.objects.create(branch=self.a, name="Mains")
        self.dosa = Food.objects.create(branch=self.a, category=self.cat, name="Dosa", price=Decimal("80"))
        self.idli = Food.objects.create(branch=self.a, category=self.cat, name="Idli", price=Decimal("40"))
        self.other = Food.objects.create(
            branch=self.b, category=Category.objects.create(branch=self.b, name="C"), name="Vada", price=30)

    def create_item(self, food=None, client=None, **kw):
        body = {"food": (food or self.dosa).id, "quantity": 10}
        body.update(kw)
        return (client or self.admin_a).post("/api/inventory/", body, format="json")


class InventoryApiTests(InventoryBase):
    def test_create_records_initial_stock_in_ledger(self):
        r = self.create_item(quantity=12)
        self.assertEqual(r.status_code, 201, r.content)
        body = r.json()
        self.assertEqual((body["quantity"], body["status"], body["low_stock_threshold"]), (12, "IN_STOCK", 5))
        item = InventoryItem.objects.get(pk=body["id"])
        self.assertEqual(item.branch_id, self.a.id)
        tx = item.transactions.get()
        self.assertEqual((tx.transaction_type, tx.quantity_change, tx.balance_after), ("ADJUSTMENT", 12, 12))

    def test_create_validation_and_permissions(self):
        self.create_item()
        self.assertEqual(self.create_item().status_code, 400)  # one record per dish
        self.assertEqual(self.create_item(self.idli, quantity=-1).status_code, 400)
        self.assertEqual(self.create_item(self.other).status_code, 400)  # other branch's dish
        self.assertEqual(self.create_item(self.idli, self.chef_a).status_code, 403)
        self.assertEqual(self.create_item(self.idli, self.anon).status_code, 401)

    def test_status_colours_thresholds(self):
        cases = [(50, "IN_STOCK"), (6, "IN_STOCK"), (5, "LOW_STOCK"), (1, "LOW_STOCK"), (0, "OUT_OF_STOCK")]
        for n, (qty, expected) in enumerate(cases):
            food = Food.objects.create(branch=self.a, category=self.cat, name=f"Dish {n}", price=10)
            self.assertEqual(self.create_item(food, quantity=qty).json()["status"], expected, qty)

    def test_custom_threshold_and_patch_cannot_change_quantity(self):
        iid = self.create_item(quantity=8).json()["id"]
        r = self.admin_a.patch(f"/api/inventory/{iid}/", {"low_stock_threshold": 10, "quantity": 999}, format="json")
        self.assertEqual((r.json()["low_stock_threshold"], r.json()["quantity"], r.json()["status"]),
                         (10, 8, "LOW_STOCK"))
        self.assertEqual(self.admin_a.patch(f"/api/inventory/{iid}/", {"low_stock_threshold": -1},
                                            format="json").status_code, 400)
        self.assertEqual(self.chef_a.patch(f"/api/inventory/{iid}/", {"low_stock_threshold": 1},
                                           format="json").status_code, 403)

    def test_no_delete(self):
        iid = self.create_item().json()["id"]
        self.assertEqual(self.admin_a.delete(f"/api/inventory/{iid}/").status_code, 405)

    def test_filters_search_and_summary(self):
        self.create_item(self.dosa, quantity=20)
        self.create_item(self.idli, quantity=3)
        self.assertEqual([i["food_name"] for i in rows(self.admin_a.get("/api/inventory/?status=LOW_STOCK"))],
                         ["Idli"])
        self.assertEqual([i["food_name"] for i in rows(self.admin_a.get("/api/inventory/?status=IN_STOCK"))],
                         ["Dosa"])
        self.assertEqual(rows(self.admin_a.get("/api/inventory/?status=OUT_OF_STOCK")), [])
        self.assertEqual([i["food_name"] for i in rows(self.admin_a.get("/api/inventory/?search=dos"))], ["Dosa"])
        self.assertEqual(self.chef_a.get("/api/inventory/summary/").json(),
                         {"total": 2, "out_of_stock": 0, "low_stock": 1, "in_stock": 1})
        # the status filter does not distort the summary cards
        self.assertEqual(self.chef_a.get("/api/inventory/summary/?status=LOW_STOCK").json()["total"], 2)

    def test_restock_by_any_staff_adds_to_current_stock(self):
        iid = self.create_item(quantity=3).json()["id"]
        r = self.chef_a.post(f"/api/inventory/{iid}/restock/", {"quantity": 7, "note": "delivery"}, format="json")
        self.assertEqual((r.status_code, r.json()["quantity"], r.json()["status"]), (200, 10, "IN_STOCK"))
        tx = StockTransaction.objects.filter(item_id=iid).order_by("-id").first()
        self.assertEqual((tx.transaction_type, tx.quantity_change, tx.balance_after, tx.note),
                         ("RESTOCK", 7, 10, "delivery"))
        self.assertEqual(tx.performed_by.phone, "+919500000003")

    def test_restock_validation(self):
        iid = self.create_item(quantity=3).json()["id"]
        for bad in (0, -5, "x", None, 10**9):
            self.assertEqual(self.chef_a.post(f"/api/inventory/{iid}/restock/", {"quantity": bad},
                                              format="json").status_code, 400, bad)
        self.assertEqual(InventoryItem.objects.get(pk=iid).quantity, 3)

    def test_restock_isolation_and_auth(self):
        iid = self.create_item().json()["id"]
        self.assertEqual(self.admin_b.post(f"/api/inventory/{iid}/restock/", {"quantity": 1}, format="json")
                         .status_code, 404)
        self.assertEqual(self.anon.post(f"/api/inventory/{iid}/restock/", {"quantity": 1}, format="json")
                         .status_code, 401)
        self.assertEqual(rows(self.admin_b.get("/api/inventory/")), [])

    def test_restock_brings_item_back_in_stock(self):
        iid = self.create_item(quantity=0).json()["id"]
        self.assertEqual(self.admin_a.get(f"/api/inventory/{iid}/").json()["status"], "OUT_OF_STOCK")
        self.chef_a.post(f"/api/inventory/{iid}/restock/", {"quantity": 20}, format="json")
        self.assertEqual(self.admin_a.get(f"/api/inventory/{iid}/").json()["status"], "IN_STOCK")

    def test_adjust_is_admin_only_and_logged(self):
        iid = self.create_item(quantity=10).json()["id"]
        self.assertEqual(self.chef_a.post(f"/api/inventory/{iid}/adjust/", {"new_quantity": 2}, format="json")
                         .status_code, 403)
        r = self.admin_a.post(f"/api/inventory/{iid}/adjust/", {"new_quantity": 4, "note": "stock-take"},
                              format="json")
        self.assertEqual(r.json()["quantity"], 4)
        self.assertEqual(self.admin_a.post(f"/api/inventory/{iid}/adjust/", {"new_quantity": -1}, format="json")
                         .status_code, 400)
        history = self.chef_a.get(f"/api/inventory/{iid}/transactions/").json()
        self.assertEqual([(t["transaction_type"], t["quantity_change"], t["balance_after"]) for t in history],
                         [("ADJUSTMENT", -6, 4), ("ADJUSTMENT", 10, 10)])  # newest first
        self.assertEqual(self.admin_b.get(f"/api/inventory/{iid}/transactions/").status_code, 404)


class StockServiceTests(InventoryBase):
    def setUp(self):
        super().setUp()
        self.inv_d = InventoryItem.objects.create(branch=self.a, food=self.dosa, quantity=10)
        self.inv_i = InventoryItem.objects.create(branch=self.a, food=self.idli, quantity=2)

    def test_deduct_is_idempotent_per_order(self):
        order = make_order(self.a, [(self.dosa, 3)])
        services.deduct_for_order(order)
        services.deduct_for_order(order)  # retry / duplicate callback
        self.inv_d.refresh_from_db()
        self.assertEqual(self.inv_d.quantity, 7)
        self.assertEqual(StockTransaction.objects.filter(order=order).count(), 1)

    def test_same_dish_on_two_lines_is_summed(self):
        order = make_order(self.a, [(self.dosa, 2), (self.dosa, 3)])
        services.deduct_for_order(order)
        self.inv_d.refresh_from_db()
        self.assertEqual(self.inv_d.quantity, 5)

    def test_insufficient_stock_rolls_back_everything(self):
        order = make_order(self.a, [(self.dosa, 4), (self.idli, 3)])  # idli only has 2
        with self.assertRaises(services.InsufficientStock):
            services.deduct_for_order(order)
        self.inv_d.refresh_from_db()
        self.inv_i.refresh_from_db()
        self.assertEqual((self.inv_d.quantity, self.inv_i.quantity), (10, 2))  # nothing deducted
        self.assertFalse(StockTransaction.objects.filter(order=order).exists())

    def test_exactly_available_stock_can_be_taken_but_not_more(self):
        services.deduct_for_order(make_order(self.a, [(self.idli, 2)], number="E1"))
        self.inv_i.refresh_from_db()
        self.assertEqual(self.inv_i.quantity, 0)
        with self.assertRaises(services.InsufficientStock):
            services.deduct_for_order(make_order(self.a, [(self.idli, 1)], number="E2"))

    def test_untracked_dish_is_ignored(self):
        free = Food.objects.create(branch=self.a, category=self.cat, name="Water", price=10)
        services.deduct_for_order(make_order(self.a, [(free, 5)]))  # no inventory record: no error, no change

    def test_restore_gives_back_once_and_only_what_was_deducted(self):
        order = make_order(self.a, [(self.dosa, 3)])
        services.restore_for_order(order)  # nothing deducted yet
        self.inv_d.refresh_from_db()
        self.assertEqual(self.inv_d.quantity, 10)
        services.deduct_for_order(order)
        services.restore_for_order(order)
        services.restore_for_order(order)  # duplicate cancel
        self.inv_d.refresh_from_db()
        self.assertEqual(self.inv_d.quantity, 10)
        kinds = list(StockTransaction.objects.filter(order=order).order_by("id").values_list("transaction_type",
                                                                                              flat=True))
        self.assertEqual(kinds, ["ORDER_DEDUCTION", "ORDER_RESTORE"])

    def test_ledger_balance_always_matches_quantity(self):
        services.restock(self.inv_d.pk, 5)
        services.deduct_for_order(make_order(self.a, [(self.dosa, 4)]))
        services.adjust(self.inv_d.pk, 20)
        self.inv_d.refresh_from_db()
        last = self.inv_d.transactions.order_by("-id").first()
        self.assertEqual(last.balance_after, self.inv_d.quantity)
        total = sum(self.inv_d.transactions.values_list("quantity_change", flat=True))
        self.assertEqual(total + 10, self.inv_d.quantity)  # 10 = stock created directly in setUp (no ledger row)

    def test_db_refuses_negative_stock_directly(self):
        with self.assertRaises(Exception):
            InventoryItem.objects.filter(pk=self.inv_i.pk).update(quantity=-1)


class ConcurrentStockTests(TransactionTestCase):
    """Real threads and real MySQL transactions (no wrapping test transaction)."""

    def test_concurrent_orders_never_oversell(self):
        branch = make_branch("CC")
        cat = Category.objects.create(branch=branch, name="C")
        food = Food.objects.create(branch=branch, category=cat, name="Special", price=100)
        inv = InventoryItem.objects.create(branch=branch, food=food, quantity=4)
        orders = [make_order(branch, [(food, 1)], number=f"CC{i}") for i in range(10)]
        results, lock = [], threading.Lock()

        def worker(order):
            try:
                services.deduct_for_order(order)
                outcome = "ok"
            except services.InsufficientStock:
                outcome = "short"
            except Exception as exc:  # pragma: no cover - surfaced by the assertion below
                outcome = f"error: {exc!r}"
            finally:
                connection.close()
            with lock:
                results.append(outcome)

        threads = [threading.Thread(target=worker, args=(o,)) for o in orders]
        [t.start() for t in threads]
        [t.join(timeout=60) for t in threads]

        self.assertEqual(sorted(results), ["ok"] * 4 + ["short"] * 6, results)
        inv.refresh_from_db()
        self.assertEqual(inv.quantity, 0)
        self.assertEqual(StockTransaction.objects.filter(item=inv, transaction_type="ORDER_DEDUCTION").count(), 4)

    def test_same_order_deducted_concurrently_only_once(self):
        branch = make_branch("CD")
        cat = Category.objects.create(branch=branch, name="C")
        food = Food.objects.create(branch=branch, category=cat, name="Special", price=100)
        inv = InventoryItem.objects.create(branch=branch, food=food, quantity=10)
        order = make_order(branch, [(food, 3)], number="CD1")
        errors = []

        def worker():
            try:
                services.deduct_for_order(order)
            except Exception as exc:  # pragma: no cover
                errors.append(repr(exc))
            finally:
                connection.close()

        threads = [threading.Thread(target=worker) for _ in range(6)]
        [t.start() for t in threads]
        [t.join(timeout=60) for t in threads]
        self.assertEqual(errors, [])
        inv.refresh_from_db()
        self.assertEqual(inv.quantity, 7)  # 10 - 3, not 10 - 18
