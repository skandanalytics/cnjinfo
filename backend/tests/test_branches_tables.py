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

    def test_deactivation_blocked_by_active_orders_then_hides_everything(self):
        t = DiningTable.objects.create(branch=self.a, table_number="T1", capacity=2)
        order = Order.objects.create(order_number="O1", branch=self.a, table=t, order_type="DINE_IN")
        self.assertEqual(self.owner.delete(f"/api/branches/{self.a.id}/").status_code, 409)
        order.status = "COMPLETED"
        order.save()
        r = self.owner.delete(f"/api/branches/{self.a.id}/")
        self.assertEqual(r.status_code, 200)
        self.a.refresh_from_db()
        self.assertFalse(self.a.is_active)
        self.assertTrue(Order.objects.filter(pk=order.pk).exists())  # history untouched
        # QR for its tables stops resolving; its staff lose access
        self.assertEqual(self.anon.get(f"/api/public/qr/{t.qr_code}/").status_code, 404)
        self.assertEqual(self.chef_a.get("/api/tables/").status_code, 403)
        self.assertIsNone(self.chef_a.get("/api/auth/me/").json()["employee"])
        # reactivation by the owner restores everything
        self.assertEqual(self.owner.patch(f"/api/branches/{self.a.id}/", {"is_active": True}, format="json")
                         .status_code, 200)
        self.assertEqual(self.anon.get(f"/api/public/qr/{t.qr_code}/").status_code, 200)
        self.assertEqual(self.chef_a.get("/api/tables/").status_code, 200)


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

    def test_owner_must_choose_branch_and_limited_admin_cannot_use_another(self):
        self.assertEqual(self.make(self.owner).status_code, 400)
        self.assertEqual(self.make(self.admin_a, branch=self.b.id).status_code, 400)

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
        Order.objects.create(order_number="H1", branch=self.a, table=t, order_type="DINE_IN", status="COMPLETED")
        r = self.admin_a.delete(f"/api/tables/{used}/")
        self.assertEqual(r.status_code, 200)
        t.refresh_from_db()
        self.assertEqual((t.is_active, t.qr_is_active), (False, False))

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
