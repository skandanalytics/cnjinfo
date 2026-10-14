from datetime import date, timedelta
from decimal import Decimal
from django.core.cache import cache
from django.test import TestCase, override_settings
from django.utils import timezone
from rest_framework.test import APIClient

from apps.accounts.models import Employee, User
from apps.branches.models import Branch
from apps.coupons.models import Coupon
from apps.maintenance.services import setup_status

PW = "Str0ng-Pass!42"


def make_admin(phone, code, role=Employee.Role.SUPER_ADMIN, password=PW):
    user = User.objects.create_user(phone=phone, password=password, name=f"Admin {code}", user_type=User.UserType.EMPLOYEE)
    return Employee.objects.create(
        user=user,
        role=role,
        employee_code=code,
        job_title="Owner" if role == Employee.Role.SUPER_ADMIN else "Manager",
        department="Administration",
        status=Employee.Status.ACTIVE,
    )


class MultipleAdminsTests(TestCase):
    def setUp(self):
        cache.clear()
        self.client = APIClient()
        self.owner = make_admin("+919100000001", "OWNER01", role=Employee.Role.SUPER_ADMIN)
        login_res = self.client.post("/api/auth/staff/login/", {
            "employee_code": "OWNER01",
            "password": PW,
        }, format="json")
        self.owner_token = login_res.json()["access"]
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {self.owner_token}")

    def test_status_indicates_setup_not_required(self):
        status = setup_status()
        self.assertFalse(status["setup_required"])

    def test_authorized_admin_can_create_new_manager_without_existing_credentials_in_body(self):
        body = {
            "employee_code": "MGR01",
            "name": "Branch Manager 1",
            "phone": "+919100000002",
            "email": "mgr1@example.com",
            "role": Employee.Role.ADMIN,
            "password": "NewManagerPassword123!",
            "confirm_password": "NewManagerPassword123!",
        }
        res = self.client.post("/api/db/create-admin/", body, format="json")
        self.assertEqual(res.status_code, 201, res.content)
        data = res.json()
        self.assertEqual(data["employee_code"], "MGR01")
        self.assertEqual(data["role"], "ADMIN")

        # Verify both administrators exist simultaneously
        self.assertTrue(Employee.objects.filter(employee_code="OWNER01").exists())
        self.assertTrue(Employee.objects.filter(employee_code="MGR01").exists())

        # Verify new manager can immediately log in via staff login
        anon_client = APIClient()
        login_res = anon_client.post("/api/auth/staff/login/", {
            "employee_code": "MGR01",
            "password": "NewManagerPassword123!",
        }, format="json")
        self.assertEqual(login_res.status_code, 200, login_res.content)
        login_data = login_res.json()
        self.assertEqual(login_data["user"]["employee"]["employee_code"], "MGR01")
        self.assertTrue(login_data["user"]["employee"]["is_admin_level"])

        # Verify existing owner can still log in independently
        owner_login = anon_client.post("/api/auth/staff/login/", {
            "employee_code": "OWNER01",
            "password": PW,
        }, format="json")
        self.assertEqual(owner_login.status_code, 200)

    def test_unauthenticated_request_cannot_bypass_backend_authorization(self):
        anon_client = APIClient()
        body = {
            "employee_code": "MGR02",
            "name": "Branch Manager 2",
            "phone": "+919100000003",
            "role": Employee.Role.ADMIN,
            "password": "NewPassword123!",
            "confirm_password": "NewPassword123!",
        }
        res = anon_client.post("/api/db/create-admin/", body, format="json")
        self.assertIn(res.status_code, (401, 403))
        self.assertFalse(Employee.objects.filter(employee_code="MGR02").exists())

    def test_rejects_duplicate_admin_id(self):
        body = {
            "employee_code": "OWNER01",  # duplicate ID
            "name": "Another Owner",
            "phone": "+919100000004",
            "role": Employee.Role.ADMIN,
            "password": "NewPassword123!",
            "confirm_password": "NewPassword123!",
        }
        res = self.client.post("/api/db/create-admin/", body, format="json")
        self.assertEqual(res.status_code, 400)
        self.assertIn("already in use", res.json()["detail"])

    def test_manager_cannot_create_owner(self):
        make_admin("+919100000005", "MGR05", role=Employee.Role.ADMIN)
        anon_client = APIClient()
        login_res = anon_client.post("/api/auth/staff/login/", {
            "employee_code": "MGR05",
            "password": PW,
        }, format="json")
        mgr_token = login_res.json()["access"]
        anon_client.credentials(HTTP_AUTHORIZATION=f"Bearer {mgr_token}")

        body = {
            "employee_code": "OWNER99",
            "name": "Attempted Owner",
            "phone": "+919100000006",
            "role": Employee.Role.SUPER_ADMIN,
            "password": "NewPassword123!",
            "confirm_password": "NewPassword123!",
        }
        res = anon_client.post("/api/db/create-admin/", body, format="json")
        self.assertEqual(res.status_code, 403)
        self.assertIn("Only an Owner", res.json()["detail"])

    def test_owner_can_create_another_owner(self):
        body = {
            "employee_code": "OWNER03",
            "name": "Co-Owner",
            "phone": "+919100000007",
            "role": Employee.Role.SUPER_ADMIN,
            "password": "NewOwnerPassword123!",
            "confirm_password": "NewOwnerPassword123!",
        }
        res = self.client.post("/api/db/create-admin/", body, format="json")
        self.assertEqual(res.status_code, 201)
        self.assertEqual(res.json()["role"], "SUPER_ADMIN")

    def test_unauthenticated_request_with_valid_recovery_key_creates_manager(self):
        import os
        os.environ["DB_SETUP_SECRET"] = "foodie-setup-secret"
        anon_client = APIClient()
        body = {
            "setup_key": "foodie-setup-secret",
            "employee_code": "RECOV_MGR",
            "name": "Recovered Manager",
            "phone": "+919100000008",
            "email": "recov_mgr@example.com",
            "role": Employee.Role.ADMIN,
            "password": "RecoveredPassword123!",
            "confirm_password": "RecoveredPassword123!",
        }
        res = anon_client.post("/api/db/create-admin/", body, format="json")
        self.assertEqual(res.status_code, 201, res.content)
        data = res.json()
        self.assertEqual(data["employee_code"], "RECOV_MGR")
        self.assertEqual(data["role"], "ADMIN")

        # Verify existing admin is still present
        self.assertTrue(Employee.objects.filter(employee_code="OWNER01").exists())
        # Verify new recovered admin exists
        recov_emp = Employee.objects.filter(employee_code="RECOV_MGR").first()
        self.assertIsNotNone(recov_emp)
        self.assertEqual(recov_emp.role, Employee.Role.ADMIN)
        self.assertEqual(recov_emp.job_title, "Manager")

        # Verify recovered manager can immediately log in via staff login
        login_res = anon_client.post("/api/auth/staff/login/", {
            "employee_code": "RECOV_MGR",
            "password": "RecoveredPassword123!",
        }, format="json")
        self.assertEqual(login_res.status_code, 200, login_res.content)

    def test_unauthenticated_request_with_valid_recovery_key_creates_owner(self):
        import os
        os.environ["DB_SETUP_SECRET"] = "foodie-setup-secret"
        anon_client = APIClient()
        body = {
            "setup_key": "foodie-setup-secret",
            "employee_code": "RECOV_OWNER",
            "name": "Recovered Owner",
            "phone": "+919100000009",
            "role": Employee.Role.SUPER_ADMIN,
            "password": "RecoveredOwnerPassword123!",
            "confirm_password": "RecoveredOwnerPassword123!",
        }
        res = anon_client.post("/api/db/create-admin/", body, format="json")
        self.assertEqual(res.status_code, 201, res.content)
        data = res.json()
        self.assertEqual(data["employee_code"], "RECOV_OWNER")
        self.assertEqual(data["role"], "SUPER_ADMIN")

        recov_emp = Employee.objects.filter(employee_code="RECOV_OWNER").first()
        self.assertIsNotNone(recov_emp)
        self.assertEqual(recov_emp.role, Employee.Role.SUPER_ADMIN)
        self.assertEqual(recov_emp.job_title, "Owner")
        self.assertTrue(recov_emp.user.is_superuser)

        # Verify recovered owner can immediately log in
        login_res = anon_client.post("/api/auth/staff/login/", {
            "employee_code": "RECOV_OWNER",
            "password": "RecoveredOwnerPassword123!",
        }, format="json")
        self.assertEqual(login_res.status_code, 200, login_res.content)

    def test_unauthenticated_request_with_invalid_recovery_key_rejected(self):
        import os
        os.environ["DB_SETUP_SECRET"] = "foodie-setup-secret"
        anon_client = APIClient()
        body = {
            "setup_key": "wrong-secret-key",
            "employee_code": "HACKER01",
            "name": "Intruder",
            "phone": "+919100000010",
            "role": Employee.Role.SUPER_ADMIN,
            "password": "SomePassword123!",
            "confirm_password": "SomePassword123!",
        }
        res = anon_client.post("/api/db/create-admin/", body, format="json")
        self.assertEqual(res.status_code, 403)
        self.assertIn("could not be authorized", res.json()["detail"].lower())
        self.assertFalse(Employee.objects.filter(employee_code="HACKER01").exists())


class CouponValidUntilTests(TestCase):
    def setUp(self):
        cache.clear()
        self.client = APIClient()
        self.branch = Branch.objects.create(name="Main Branch", code="MAIN", address="Street 1")
        self.owner = make_admin("+919200000001", "OWNER02", role=Employee.Role.SUPER_ADMIN)
        login_res = self.client.post("/api/auth/staff/login/", {
            "employee_code": "OWNER02",
            "password": PW,
        }, format="json")
        self.token = login_res.json()["access"]
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {self.token}")

    def test_rejects_missing_valid_to(self):
        body = {
            "branch": self.branch.id,
            "code": "TESTNOEXP",
            "discount_type": "FLAT",
            "discount_value": "50.00",
            "valid_from": date.today().isoformat(),
        }
        res = self.client.post("/api/coupons/", body, format="json")
        self.assertEqual(res.status_code, 400, res.content)
        self.assertIn("valid_to", res.json())

    def test_rejects_past_valid_to(self):
        yesterday = (date.today() - timedelta(days=1)).isoformat()
        body = {
            "branch": self.branch.id,
            "code": "TESTPAST",
            "discount_type": "FLAT",
            "discount_value": "50.00",
            "valid_from": (date.today() - timedelta(days=2)).isoformat(),
            "valid_to": yesterday,
        }
        res = self.client.post("/api/coupons/", body, format="json")
        self.assertEqual(res.status_code, 400, res.content)
        self.assertIn("valid_to", res.json())

    def test_rejects_valid_to_earlier_than_valid_from(self):
        body = {
            "branch": self.branch.id,
            "code": "TESTORDER",
            "discount_type": "FLAT",
            "discount_value": "50.00",
            "valid_from": (date.today() + timedelta(days=10)).isoformat(),
            "valid_to": (date.today() + timedelta(days=5)).isoformat(),
        }
        res = self.client.post("/api/coupons/", body, format="json")
        self.assertEqual(res.status_code, 400, res.content)
        self.assertIn("valid_to", res.json())

    def test_accepts_valid_future_dates(self):
        body = {
            "branch": self.branch.id,
            "code": "TESTVALID",
            "discount_type": "FLAT",
            "discount_value": "50.00",
            "valid_from": date.today().isoformat(),
            "valid_to": (date.today() + timedelta(days=30)).isoformat(),
        }
        res = self.client.post("/api/coupons/", body, format="json")
        self.assertEqual(res.status_code, 201, res.content)
        self.assertTrue(Coupon.objects.filter(code="TESTVALID").exists())


@override_settings(DEBUG=True, OTP_PROVIDER="console", OTP_RESEND_COOLDOWN_SECONDS=0)
class OTPThrottlingTests(TestCase):
    def setUp(self):
        cache.clear()
        self.client = APIClient()

    def test_otp_throttling_formats_error_and_returns_retry_after(self):
        from django.conf import settings
        rates = dict(settings.REST_FRAMEWORK.get("DEFAULT_THROTTLE_RATES", {}))
        rates["otp_send_phone"] = "1/hour"
        new_rf = dict(settings.REST_FRAMEWORK)
        new_rf["DEFAULT_THROTTLE_RATES"] = rates
        with override_settings(REST_FRAMEWORK=new_rf):
            from django.core.cache import cache
            cache.clear()
            # First request succeeds
            r1 = self.client.post("/api/auth/otp/send/", {"phone": "9876543210"}, format="json")
            self.assertEqual(r1.status_code, 200, r1.content)

            # Second request within the same hour hits phone throttle
            r2 = self.client.post("/api/auth/otp/send/", {"phone": "9876543210"}, format="json")
            self.assertEqual(r2.status_code, 429, r2.content)
            data = r2.json()
            self.assertIn("detail", data)
            self.assertIn("temporarily limited", data["detail"].lower())
            self.assertIn("retry_after", data)
            self.assertGreater(data["retry_after"], 0)
            self.assertIn("Retry-After", r2)
