"""Phase 4: branches, tables, QR codes."""
import uuid

from apps.accounts.models import Employee
from apps.branches.models import DiningTable
from apps.orders.models import Order

from .helpers import StaffTestCase, rows


class BranchTests(StaffTestCase):
    def test_owner_creates_branch_with_generated_code(self):
        r = self.owner.post("/api/branches/", {"name": "Downtown", "address": "1 Main St",
                                               "contact_number": "9876543210", "manager_name": "Asha",
                                               "gst_rate": "5.00"}, format="json")
        self.assertEqual(r.status_code, 201, r.content)
        body = r.json()
        self.assertEqual(body["code"], f"BR{body['id']:03d}")
        self.assertEqual(body["contact_number"], "+919876543210")

    def test_validation(self):
        self.assertEqual(self.owner.post("/api/branches/", {"name": "Another Place", "address": "x"},
                                         format="json").status_code, 201)
        # duplicate names are rejected case-insensitively (existing fixture branch is "Branch A")
        self.assertEqual(self.owner.post("/api/branches/", {"name": "ANOTHER PLACE", "address": "x"},
                                         format="json").status_code, 400)
        self.assertEqual(self.owner.post("/api/branches/", {"name": "branch a", "address": "x"}, format="json")
                         .status_code, 400)
        self.assertEqual(self.owner.post("/api/branches/", {"name": "Z", "address": "x", "gst_rate": "150"},
                                         format="json").status_code, 400)
        self.assertEqual(self.owner.post("/api/branches/", {"name": "Y", "address": "x", "contact_number": "12"},
                                         format="json").status_code, 400)

    def test_only_owner_level_can_create_or_deactivate(self):
        body = {"name": "New", "address": "x"}
        self.assertEqual(self.admin_a.post("/api/branches/", body, format="json").status_code, 403)
        self.assertEqual(self.chef_a.post("/api/branches/", body, format="json").status_code, 403)
        self.assertEqual(self.anon.post("/api/branches/", body, format="json").status_code, 401)
        self.assertEqual(self.admin_a.delete(f"/api/branches/{self.a.id}/").status_code, 403)

    def test_branch_limited_staff_see_only_their_branch(self):
        self.assertEqual({b["id"] for b in rows(self.owner.get("/api/branches/"))}, {self.a.id, self.b.id})
        self.assertEqual({b["id"] for b in rows(self.admin_a.get("/api/branches/"))}, {self.a.id})
        self.assertEqual({b["id"] for b in rows(self.chef_a.get("/api/branches/"))}, {self.a.id})
        self.assertEqual(self.admin_a.get(f"/api/branches/{self.b.id}/").status_code, 404)

    def test_edit_rules(self):
        r = self.admin_a.patch(f"/api/branches/{self.a.id}/", {"manager_name": "Ravi", "gst_rate": "5"},
                               format="json")
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.json()["manager_name"], "Ravi")
        self.assertEqual(self.admin_a.patch(f"/api/branches/{self.b.id}/", {"manager_name": "x"}, format="json")
                         .status_code, 404)
        self.assertEqual(self.chef_a.patch(f"/api/branches/{self.a.id}/", {"manager_name": "x"}, format="json")
                         .status_code, 403)
        self.assertEqual(self.admin_a.patch(f"/api/branches/{self.a.id}/", {"code": "HACK"}, format="json")
                         .json()["code"], "A")  # code is read-only

    def test_search_and_status_filter(self):
        self.owner.post("/api/branches/", {"name": "Riverside Grill", "address": "River Rd"}, format="json")
        self.b.is_active = False
        self.b.save()
        self.assertEqual([b["name"] for b in rows(self.owner.get("/api/branches/?search=riverside"))],
                         ["Riverside Grill"])
        inactive = rows(self.owner.get("/api/branches/?is_active=false"))
        self.assertEqual([b["id"] for b in inactive], [self.b.id])
        self.assertNotIn(self.b.id, [b["id"] for b in rows(self.owner.get("/api/branches/?is_active=true"))])

    def test_deactivation_hides_everything_and_reactivation_restores_it(self):
        t = DiningTable.objects.create(branch=self.a, table_number="T1", capacity=2)
        self.assertEqual(self.owner.patch(f"/api/branches/{self.a.id}/", {"is_active": False}, format="json")
                         .status_code, 200)
        self.assertEqual(self.anon.get(f"/api/public/qr/{t.qr_code}/").status_code, 404)
        self.assertEqual(self.chef_a.get("/api/tables/").status_code, 403)
        self.assertIsNone(self.chef_a.get("/api/auth/me/").json()["employee"])
        self.assertEqual(self.owner.patch(f"/api/branches/{self.a.id}/", {"is_active": True}, format="json")
                         .status_code, 200)
        self.assertEqual(self.anon.get(f"/api/public/qr/{t.qr_code}/").status_code, 200)
        self.assertEqual(self.chef_a.get("/api/tables/").status_code, 200)

    def test_primary_branch_rules(self):
        first = self.owner.post("/api/branches/", {"name": "First HQ", "address": "x"}, format="json").json()
        self.assertTrue(first["is_primary"])  # the first branch created with no primary becomes primary
        resp = self.owner.post("/api/branches/", {"name": "Second", "address": "x", "is_primary": True},
                               format="json")
        self.assertEqual(resp.status_code, 201, resp.content)
        second = resp.json()
        self.assertTrue(second["is_primary"])
        from apps.branches.models import Branch
        self.assertEqual(list(Branch.objects.filter(is_primary=True).values_list("id", flat=True)), [second["id"]])
        url = f"/api/branches/{second['id']}/"
        self.assertEqual(self.owner.patch(url, {"is_primary": False}, format="json").status_code, 400)
        self.assertEqual(self.owner.patch(url, {"is_active": False}, format="json").status_code, 400)


class BranchDeleteTests(StaffTestCase):
    """Branch deletion removes its configuration and keeps orders, payments and bills."""

    def setUp(self):
        super().setUp()
        from datetime import timedelta
        from decimal import Decimal

        from django.utils import timezone

        from apps.coupons.models import Coupon, CouponRedemption
        from apps.inventory.models import InventoryItem
        from apps.inventory.services import restock
        from apps.menu.models import Category, Food
        from apps.orders.models import OrderItem
        from apps.payments.models import Payment

        self.a.is_primary = True
        self.a.save()
        self.table = DiningTable.objects.create(branch=self.a, table_number="T1", capacity=2)
        cat = Category.objects.create(branch=self.a, name="Mains")
        self.food = Food.objects.create(branch=self.a, category=cat, name="Thali", price=Decimal("200"))
        restock(InventoryItem.objects.create(branch=self.a, food=self.food).id, 10)
        now = timezone.now()
        self.coupon = Coupon.objects.create(branch=self.a, code="SAVE", discount_type="FLAT", discount_value=10,
                                            valid_from=now, valid_to=now + timedelta(days=1))
        self.order = Order.objects.create(order_number="H1", branch=self.a, branch_name=self.a.name,
                                          table=self.table, table_label="T1", order_type="DINE_IN",
                                          status="COMPLETED", total_amount=Decimal("190"))
        OrderItem.objects.create(order=self.order, food=self.food, food_name="Thali", unit_price=200, quantity=1,
                                 line_total=200)
        CouponRedemption.objects.create(coupon=self.coupon, coupon_code="SAVE", order=self.order,
                                        discount_amount=10)
        Payment.objects.create(order=self.order, method="COUNTER", amount=Decimal("190"), status="SUCCESS")
        # branch B's data must survive
        self.b_table = DiningTable.objects.create(branch=self.b, table_number="T1", capacity=2)

    def test_non_primary_branch_is_deleted_with_its_configuration(self):
        from apps.accounts.models import Employee, User
        from apps.billing.models import Invoice
        from apps.coupons.models import Coupon, CouponRedemption
        from apps.inventory.models import InventoryItem, StockTransaction
        from apps.menu.models import Category, Food
        from apps.payments.models import Payment

        self.a.is_primary = False
        self.a.save()
        chef_user_id = Employee.objects.get(employee_code="CHA001").user_id
        r = self.owner.delete(f"/api/branches/{self.a.id}/")
        self.assertEqual(r.status_code, 200, r.content)
        self.assertTrue(r.json()["deleted"])
        from apps.branches.models import Branch
        self.assertFalse(Branch.objects.filter(pk=self.a.id).exists())
        self.assertNotIn(self.a.id, [b["id"] for b in rows(self.owner.get("/api/branches/"))])
        self.assertFalse(Employee.objects.filter(employee_code__in=["ADA001", "CHA001"]).exists())
        self.assertFalse(User.objects.filter(pk=chef_user_id).exists())
        self.assertFalse(Category.objects.filter(branch_id=self.a.id).exists())
        self.assertFalse(Food.objects.filter(pk=self.food.id).exists())
        self.assertFalse(InventoryItem.objects.filter(branch_id=self.a.id).exists())
        self.assertFalse(Coupon.objects.filter(pk=self.coupon.id).exists())
        self.assertFalse(DiningTable.objects.filter(pk=self.table.id).exists())
        # history kept
        self.order.refresh_from_db()
        self.assertEqual((self.order.branch_id, self.order.branch_name, self.order.table_id, self.order.table_label),
                         (None, "Branch A", None, "T1"))
        self.assertEqual(self.order.items.get().food_name, "Thali")
        self.assertEqual(CouponRedemption.objects.get(order=self.order).coupon_code, "SAVE")
        self.assertTrue(Payment.objects.filter(order=self.order, status="SUCCESS").exists())
        self.assertEqual(Invoice.objects.get(order=self.order).snapshot["branch"]["name"], "Branch A")
        self.assertEqual(StockTransaction.objects.get(transaction_type="RESTOCK").food_name, "Thali")
        # other branch untouched; owner still works
        self.assertTrue(DiningTable.objects.filter(pk=self.b_table.id).exists())
        self.assertTrue(Employee.objects.filter(employee_code="ADB001").exists())
        self.assertEqual(self.owner.get(f"/api/orders/{self.order.id}/").status_code, 200)

    def test_primary_branch_needs_a_replacement(self):
        from apps.branches.models import Branch
        r = self.owner.delete(f"/api/branches/{self.a.id}/")
        self.assertEqual((r.status_code, r.json()["code"]), (409, "primary_replacement_required"))
        self.assertTrue(Branch.objects.filter(pk=self.a.id).exists())
        self.assertEqual(self.owner.delete(f"/api/branches/{self.a.id}/?replacement_primary={self.a.id}")
                         .status_code, 400)
        r = self.owner.delete(f"/api/branches/{self.a.id}/?replacement_primary={self.b.id}")
        self.assertEqual(r.status_code, 200, r.content)
        self.b.refresh_from_db()
        self.assertTrue(self.b.is_primary)

    def test_unfinished_order_blocks_deletion_and_nothing_changes(self):
        from apps.menu.models import Food
        Order.objects.create(order_number="H2", branch=self.a, branch_name=self.a.name, order_type="TAKEAWAY",
                             status="PREPARING")
        self.a.is_primary = False
        self.a.save()
        r = self.owner.delete(f"/api/branches/{self.a.id}/")
        self.assertEqual((r.status_code, r.json()["code"]), (409, "active_orders"))
        self.assertTrue(Food.objects.filter(pk=self.food.id).exists())
        self.assertTrue(Employee.objects.filter(employee_code="CHA001").exists())

    def test_failure_rolls_back_everything(self):
        from unittest import mock

        from apps.menu.models import Food
        self.a.is_primary = False
        self.a.save()
        with mock.patch("apps.branches.services.delete_foods", side_effect=RuntimeError("boom")):
            with self.assertRaises(RuntimeError):
                self.owner.delete(f"/api/branches/{self.a.id}/")
        self.assertTrue(Employee.objects.filter(employee_code="CHA001").exists())
        self.assertTrue(Food.objects.filter(pk=self.food.id).exists())

    def test_only_owner_level_can_delete(self):
        self.a.is_primary = False
        self.a.save()
        self.assertEqual(self.admin_a.delete(f"/api/branches/{self.a.id}/").status_code, 403)
        self.assertEqual(self.chef_a.delete(f"/api/branches/{self.a.id}/").status_code, 403)


class TableTests(StaffTestCase):
    def make(self, client=None, **kw):
        body = {"table_number": "T1", "capacity": 4, "location": "Window"}
        body.update(kw)
        return (client or self.admin_a).post("/api/tables/", body, format="json")

    def test_table_is_created_in_the_selected_branch(self):
        r = self.make(self.owner, branch=self.b.id)
        self.assertEqual(r.status_code, 201, r.content)
        self.assertEqual(DiningTable.objects.get(pk=r.json()["id"]).branch_id, self.b.id)
        # branch-limited admin: branch is forced to their own even when omitted
        r = self.make()
        self.assertEqual(DiningTable.objects.get(pk=r.json()["id"]).branch_id, self.a.id)

    def test_owner_defaults_to_primary_branch_and_limited_admin_cannot_use_another(self):
        self.assertEqual(self.make(self.owner).status_code, 400)  # no primary branch yet
        self.b.is_primary = True
        self.b.save()
        r = self.make(self.owner)
        self.assertEqual(r.status_code, 201, r.content)
        self.assertEqual(r.json()["branch"], self.b.id)
        self.assertEqual(self.make(self.admin_a, branch=self.b.id).status_code, 400)

    def test_create_without_linked_menu_and_edit_details(self):
        r = self.make(table_number="T05", capacity=6, location="Patio")
        self.assertEqual(r.status_code, 201, r.content)
        tid = r.json()["id"]
        r = self.admin_a.patch(f"/api/tables/{tid}/", {"table_number": "T06", "capacity": 2, "location": "Hall"},
                               format="json")
        self.assertEqual(r.status_code, 200, r.content)
        t = DiningTable.objects.get(pk=tid)
        self.assertEqual((t.table_number, t.capacity, t.location, t.branch_id), ("T06", 2, "Hall", self.a.id))

    def test_validation(self):
        self.make()
        self.assertEqual(self.make(table_number="t1").status_code, 400)  # duplicate in branch, case-insensitive
        self.assertEqual(self.make(self.admin_b, table_number="T1").status_code, 201)  # other branch ok
        self.assertEqual(self.make(table_number="T9", capacity=0).status_code, 400)
        self.assertEqual(self.make(table_number="").status_code, 400)

    def test_status_is_not_writable_through_crud(self):
        tid = self.make().json()["id"]
        r = self.admin_a.patch(f"/api/tables/{tid}/", {"status": "OCCUPIED", "location": "Patio"}, format="json")
        self.assertEqual(r.json()["status"], "AVAILABLE")
        self.assertEqual(r.json()["location"], "Patio")

    def test_permissions_and_isolation(self):
        tid = self.make().json()["id"]
        self.assertEqual(self.chef_a.get("/api/tables/").status_code, 200)
        self.assertEqual(self.chef_a.post("/api/tables/", {"table_number": "X", "capacity": 2}, format="json")
                         .status_code, 403)
        self.assertEqual(self.chef_a.delete(f"/api/tables/{tid}/").status_code, 403)
        self.assertEqual(self.admin_b.get(f"/api/tables/{tid}/").status_code, 404)
        self.assertEqual(self.admin_b.delete(f"/api/tables/{tid}/").status_code, 404)
        self.assertEqual(self.anon.get("/api/tables/").status_code, 401)
        self.assertEqual(rows(self.admin_b.get("/api/tables/")), [])
        self.assertEqual(len(rows(self.owner.get("/api/tables/"))), 1)

    def test_filters_and_search(self):
        self.make(table_number="T1", location="Window")
        self.make(table_number="T2", location="Patio")
        self.assertEqual([t["table_number"] for t in rows(self.admin_a.get("/api/tables/?search=patio"))], ["T2"])
        DiningTable.objects.filter(table_number="T2").update(status="OCCUPIED")
        self.assertEqual([t["table_number"] for t in rows(self.admin_a.get("/api/tables/?status=OCCUPIED"))],
                         ["T2"])

    # --- QR ---
    def test_each_table_has_unique_qr_and_png_image(self):
        t1, t2 = self.make().json(), self.make(table_number="T2").json()
        self.assertNotEqual(t1["qr_code"], t2["qr_code"])
        self.assertIn(t1["qr_code"], t1["qr_url"])
        r = self.chef_a.get(f"/api/tables/{t1['id']}/qr/")
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r["Content-Type"], "image/png")
        self.assertTrue(r.content.startswith(b"\x89PNG"))
        self.assertIn("attachment", self.chef_a.get(f"/api/tables/{t1['id']}/qr/?download=1")["Content-Disposition"])
        self.assertEqual(self.admin_b.get(f"/api/tables/{t1['id']}/qr/").status_code, 404)

    def test_qr_image_refused_for_inactive_qr(self):
        t = self.make().json()
        self.admin_a.patch(f"/api/tables/{t['id']}/", {"qr_is_active": False}, format="json")
        self.assertEqual(self.admin_a.get(f"/api/tables/{t['id']}/qr/").status_code, 409)

    def test_qr_resolution_public_and_safe(self):
        t = self.make().json()
        r = self.anon.get(f"/api/public/qr/{t['qr_code']}/")
        self.assertEqual(r.status_code, 200)
        body = r.json()
        self.assertEqual((body["branch"]["id"], body["table"]["table_number"]), (self.a.id, "T1"))
        self.assertNotIn("qr_code", body["table"])
        failures = [
            self.anon.get("/api/public/qr/not-a-uuid/"),
            self.anon.get(f"/api/public/qr/{uuid.uuid4()}/"),
        ]
        self.admin_a.patch(f"/api/tables/{t['id']}/", {"qr_is_active": False}, format="json")
        failures.append(self.anon.get(f"/api/public/qr/{t['qr_code']}/"))
        self.admin_a.patch(f"/api/tables/{t['id']}/", {"qr_is_active": True, "is_active": False}, format="json")
        failures.append(self.anon.get(f"/api/public/qr/{t['qr_code']}/"))
        for f in failures:
            self.assertEqual(f.status_code, 404)
            self.assertEqual(f.json(), {"detail": "Invalid or inactive QR code.", "code": "qr_invalid"})

    def test_regenerate_qr_invalidates_old_code(self):
        t = self.make().json()
        r = self.admin_a.post(f"/api/tables/{t['id']}/regenerate-qr/")
        self.assertEqual(r.status_code, 200)
        self.assertNotEqual(r.json()["qr_code"], t["qr_code"])
        self.assertEqual(self.anon.get(f"/api/public/qr/{t['qr_code']}/").status_code, 404)
        self.assertEqual(self.anon.get(f"/api/public/qr/{r.json()['qr_code']}/").status_code, 200)
        self.assertEqual(self.chef_a.post(f"/api/tables/{t['id']}/regenerate-qr/").status_code, 403)

    # --- lifecycle ---
    def test_status_lifecycle_by_any_branch_staff(self):
        tid = self.make().json()["id"]
        url = f"/api/tables/{tid}/set-status/"
        self.assertEqual(self.chef_a.post(url, {"status": "RESERVED"}, format="json").json()["status"], "RESERVED")
        self.assertEqual(self.chef_a.post(url, {"status": "OCCUPIED"}, format="json").json()["status"], "OCCUPIED")
        self.assertEqual(self.chef_a.post(url, {"status": "AVAILABLE"}, format="json").json()["status"], "AVAILABLE")
        self.assertEqual(self.chef_a.post(url, {"status": "BOGUS"}, format="json").status_code, 400)
        self.assertEqual(self.admin_b.post(url, {"status": "RESERVED"}, format="json").status_code, 404)
        self.assertEqual(self.anon.post(url, {"status": "RESERVED"}, format="json").status_code, 401)

    def test_invalid_transition_rejected(self):
        tid = self.make().json()["id"]
        url = f"/api/tables/{tid}/set-status/"
        self.chef_a.post(url, {"status": "OCCUPIED"}, format="json")
        self.assertEqual(self.chef_a.post(url, {"status": "RESERVED"}, format="json").status_code, 409)

    def test_table_with_unfinished_order_cannot_be_vacated(self):
        tid = self.make().json()["id"]
        url = f"/api/tables/{tid}/set-status/"
        self.chef_a.post(url, {"status": "OCCUPIED"}, format="json")
        t = DiningTable.objects.get(pk=tid)
        done = Order.objects.create(order_number="D1", branch=self.a, table=t, order_type="DINE_IN",
                                    status="COMPLETED")
        Order.objects.create(order_number="D2", branch=self.a, table=t, order_type="DINE_IN", status="PREPARING")
        # completing one order must not release a table another order still uses
        self.assertEqual(self.chef_a.post(url, {"status": "AVAILABLE"}, format="json").status_code, 409)
        Order.objects.filter(order_number="D2").update(status="COMPLETED")
        self.assertEqual(self.chef_a.post(url, {"status": "AVAILABLE"}, format="json").status_code, 200)
        self.assertTrue(done.pk)

    def test_inactive_table_status_locked(self):
        tid = self.make().json()["id"]
        self.admin_a.patch(f"/api/tables/{tid}/", {"is_active": False}, format="json")
        self.assertEqual(self.chef_a.post(f"/api/tables/{tid}/set-status/", {"status": "RESERVED"},
                                          format="json").status_code, 409)

    def test_delete_rules(self):
        fresh = self.make().json()["id"]
        self.assertEqual(self.admin_a.delete(f"/api/tables/{fresh}/").status_code, 204)
        self.assertFalse(DiningTable.objects.filter(pk=fresh).exists())

        used = self.make(table_number="T2").json()["id"]
        t = DiningTable.objects.get(pk=used)
        past = Order.objects.create(order_number="H1", branch=self.a, table=t, order_type="DINE_IN",
                                    status="COMPLETED")
        r = self.admin_a.delete(f"/api/tables/{used}/")
        self.assertEqual(r.status_code, 204)
        self.assertFalse(DiningTable.objects.filter(pk=used).exists())
        past.refresh_from_db()
        self.assertEqual((past.table_id, past.table_label), (None, "T2"))  # history kept

        busy = self.make(table_number="T3").json()["id"]
        Order.objects.create(order_number="H2", branch=self.a, table=DiningTable.objects.get(pk=busy),
                             order_type="DINE_IN", status="PENDING")
        self.assertEqual(self.admin_a.delete(f"/api/tables/{busy}/").status_code, 409)

    def test_audit_rows_written(self):
        from apps.audit.models import AuditLog
        tid = self.make().json()["id"]
        self.chef_a.post(f"/api/tables/{tid}/set-status/", {"status": "RESERVED"}, format="json")
        actions = set(AuditLog.objects.filter(entity_type="Table", entity_id=str(tid)).values_list("action", flat=True))
        self.assertEqual(actions, {"table.create", "table.set_status"})
        self.assertTrue(Employee.objects.exists())
