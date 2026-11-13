import hashlib
from decimal import Decimal
from django.core.cache import cache
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from apps.accounts.models import Employee, User
from apps.branches.models import Branch, DiningTable
from apps.menu.models import Category, Food
from apps.orders.models import Order, OrderItem
from apps.maintenance.services import (
    MaintenanceError,
    authorize_reset,
    delete_records,
    overview,
    reset_application_data,
    setup_status,
)

PW = "Str0ng-Pass!42"


def make_admin(phone, code, role=Employee.Role.SUPER_ADMIN, password=PW, branch=None):
    user = User.objects.create_user(phone=phone, password=password, name=f"Admin {code}", user_type=User.UserType.EMPLOYEE)
    if role == Employee.Role.SUPER_ADMIN:
        user.is_superuser = True
        user.is_staff = True
        user.save()
    return Employee.objects.create(
        user=user,
        role=role,
        employee_code=code,
        branch=branch,
        job_title="Owner" if role == Employee.Role.SUPER_ADMIN else "Manager",
        department="Administration",
        status=Employee.Status.ACTIVE,
    )


class EmployeeDirectoryAndDatabaseResetTests(TestCase):
    def setUp(self):
        cache.clear()
        self.client = APIClient()
        self.skand = make_admin("+919999900001", "SKAND", role=Employee.Role.SUPER_ADMIN)
        login_res = self.client.post("/api/auth/staff/login/", {
            "employee_code": "SKAND",
            "password": PW,
        }, format="json")
        self.assertEqual(login_res.status_code, 200, login_res.content)
        self.skand_token = login_res.json()["access"]
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {self.skand_token}")

    def test_employee_directory_with_zero_branches(self):
        """When zero branches exist, the employee list API still returns the Super Admin/Owner."""
        self.assertEqual(Branch.objects.count(), 0)
        res = self.client.get("/api/employees/")
        self.assertEqual(res.status_code, 200)
        data = res.json()
        items = data if isinstance(data, list) else data.get("results", [])
        codes = [e["employee_code"] for e in items]
        self.assertIn("SKAND", codes)

    def test_employee_directory_with_multiple_branches(self):
        """When branches exist, employee listing and branch-filtering work cleanly."""
        b1 = Branch.objects.create(name="Branch North", code="BR01", city="Hyderabad")
        b2 = Branch.objects.create(name="Branch South", code="BR02", city="Hyderabad")

        staff1 = make_admin("+919999900002", "STAFF01", role=Employee.Role.STAFF, branch=b1)
        staff2 = make_admin("+919999900003", "STAFF02", role=Employee.Role.STAFF, branch=b2)

        # All employees
        res_all = self.client.get("/api/employees/")
        self.assertEqual(res_all.status_code, 200)
        items_all = res_all.json() if isinstance(res_all.json(), list) else res_all.json().get("results", [])
        codes_all = [e["employee_code"] for e in items_all]
        self.assertIn("SKAND", codes_all)
        self.assertIn("STAFF01", codes_all)
        self.assertIn("STAFF02", codes_all)

        # Filter by branch 1
        res_b1 = self.client.get(f"/api/employees/?branch={b1.id}")
        self.assertEqual(res_b1.status_code, 200)
        items_b1 = res_b1.json() if isinstance(res_b1.json(), list) else res_b1.json().get("results", [])
        codes_b1 = [e["employee_code"] for e in items_b1]
        self.assertIn("STAFF01", codes_b1)
        self.assertNotIn("STAFF02", codes_b1)

    def test_protected_account_cannot_be_deleted_via_delete_records(self):
        """SKAND and Super Admin cannot be deleted through console delete_records."""
        res = delete_records("accounts.Employee", [self.skand.id])
        self.assertEqual(len(res["deleted"]), 0)
        self.assertEqual(len(res["blocked"]), 1)
        self.assertIn("Protected Super Admin", res["blocked"][0]["detail"])
        self.assertTrue(Employee.objects.filter(id=self.skand.id).exists())

    def test_non_superadmin_cannot_authorize_or_reset(self):
        """Regular branch admin/manager cannot authorize or perform a reset."""
        b1 = Branch.objects.create(name="Branch Central", code="BR03")
        mgr = make_admin("+919999900004", "MGR01", role=Employee.Role.ADMIN, branch=b1)

        mgr_client = APIClient()
        login_res = mgr_client.post("/api/auth/staff/login/", {
            "employee_code": "MGR01",
            "password": PW,
        }, format="json")
        mgr_token = login_res.json()["access"]
        mgr_client.credentials(HTTP_AUTHORIZATION=f"Bearer {mgr_token}")

        # Authorize attempt by manager returns 403
        auth_res = mgr_client.post("/api/db/reset/authorize/", {"password": PW}, format="json")
        self.assertEqual(auth_res.status_code, 403)

        # Reset attempt by manager returns 403
        reset_res = mgr_client.post("/api/db/reset/", {
            "confirmation": "DELETE ALL APPLICATION DATA",
            "password": PW,
            "reset_token": "dummy",
        }, format="json")
        self.assertEqual(reset_res.status_code, 403)

    def test_successful_reset_preserves_skand_owner_and_wipes_application_data(self):
        """Full reset deletes operational data but leaves the SKAND Owner account active and functional."""
        b1 = Branch.objects.create(name="Branch Reset Test", code="BR04")
        t1 = DiningTable.objects.create(branch=b1, table_number="T1", capacity=4)
        c1 = Category.objects.create(branch=b1, name="Starters")
        f1 = Food.objects.create(branch=b1, category=c1, name="Paneer Tikka", price=Decimal("250.00"))
        ord1 = Order.objects.create(
            branch=b1, table=t1, table_label="T1", order_type="DINE_IN", order_number="FD9999",
            status="PLACED", total_amount=Decimal("250.00"),
        )
        OrderItem.objects.create(order=ord1, food=f1, food_name=f1.name, unit_price=f1.price, quantity=1, line_total=f1.price)

        # Non-superadmin employee
        staff = make_admin("+919999900005", "CHEF99", role=Employee.Role.CHEF, branch=b1)

        # Authorize reset
        auth_res = self.client.post("/api/db/reset/authorize/", {"password": PW}, format="json")
        self.assertEqual(auth_res.status_code, 200, auth_res.content)
        token = auth_res.json()["reset_token"]

        # Wrong confirmation phrase is rejected with 400 without deleting data
        bad_res = self.client.post("/api/db/reset/", {
            "confirmation": "WRONG PHRASE",
            "password": PW,
            "reset_token": token,
        }, format="json")
        self.assertEqual(bad_res.status_code, 400)
        self.assertTrue(Order.objects.filter(id=ord1.id).exists())

        # Execute reset with correct phrase
        good_res = self.client.post("/api/db/reset/", {
            "confirmation": "DELETE ALL APPLICATION DATA",
            "password": PW,
            "reset_token": token,
        }, format="json")
        self.assertEqual(good_res.status_code, 200, good_res.content)
        self.assertTrue(good_res.json()["reset"])
        self.assertFalse(good_res.json()["setup_required"])

        # Operational data is wiped
        self.assertEqual(Order.objects.count(), 0)
        self.assertEqual(OrderItem.objects.count(), 0)
        self.assertEqual(Food.objects.count(), 0)
        self.assertEqual(Category.objects.count(), 0)
        self.assertEqual(DiningTable.objects.count(), 0)
        self.assertEqual(Branch.objects.count(), 0)

        # Non-superadmin staff is deleted
        self.assertFalse(Employee.objects.filter(employee_code="CHEF99").exists())

        # SKAND Owner account is PRESERVED
        self.skand.refresh_from_db()
        self.skand.user.refresh_from_db()
        self.assertEqual(self.skand.employee_code, "SKAND")
        self.assertEqual(self.skand.role, Employee.Role.SUPER_ADMIN)
        self.assertEqual(self.skand.status, Employee.Status.ACTIVE)
        self.assertTrue(self.skand.user.is_active)
        self.assertTrue(self.skand.user.check_password(PW))

        # SKAND can log in immediately after reset
        anon_client = APIClient()
        post_login = anon_client.post("/api/auth/staff/login/", {
            "employee_code": "SKAND",
            "password": PW,
        }, format="json")
        self.assertEqual(post_login.status_code, 200, post_login.content)
        self.assertIn("access", post_login.json())

    def test_database_overview_counts(self):
        """Overview accurately counts tables and records."""
        ov = overview(self.skand)
        self.assertIn("database_name", ov)
        self.assertEqual(ov["connection_status"], "connected")
        self.assertGreater(ov["table_count"], 0)
        self.assertGreaterEqual(ov["record_count"], 1)
        self.assertEqual(ov["access"]["employee_code"], "SKAND")
        self.assertEqual(ov["access"]["role"], "SUPER_ADMIN")
