"""Phase 3: authentication, permissions and branch isolation, exercised through the HTTP API on MySQL."""
from datetime import timedelta

from django.core.cache import cache
from django.core.exceptions import ImproperlyConfigured
from django.test import TestCase, override_settings
from django.utils import timezone
from rest_framework.test import APIClient

from apps.accounts.models import Employee, OTPRequest, User
from apps.accounts.phone import normalize_phone
from apps.accounts.scoping import scope_queryset
from apps.branches.models import Branch
from apps.orders.models import Order

PW = "Str0ng-Pass!42"


def make_branch(code):
    return Branch.objects.create(name=f"Branch {code}", code=code, address="addr")


def make_staff(phone, role, branch, code=None, password=PW):
    user = User.objects.create_user(phone=phone, password=password, name=f"Staff {phone}", user_type="EMPLOYEE")
    return Employee.objects.create(user=user, branch=branch, role=role, employee_code=code or f"E{user.id:04d}")


def login_staff(client, code, password=PW):
    return client.post("/api/auth/staff/login/", {"employee_code": code, "password": password}, format="json")


def auth(client, tokens):
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {tokens['access']}")
    return client


class Base(TestCase):
    def setUp(self):
        cache.clear()
        self.client = APIClient()
        self.a = make_branch("A")
        self.b = make_branch("B")


@override_settings(DEBUG=True, OTP_PROVIDER="console", OTP_RESEND_COOLDOWN_SECONDS=0)
class OTPTests(Base):
    PHONE = "9876543210"
    E164 = "+919876543210"

    def send(self, phone=None):
        return self.client.post("/api/auth/otp/send/", {"phone": phone or self.PHONE}, format="json")

    def verify(self, otp, phone=None):
        return self.client.post("/api/auth/otp/verify/", {"phone": phone or self.PHONE, "otp": otp}, format="json")

    def test_phone_normalisation(self):
        self.assertEqual(normalize_phone("98765 43210"), self.E164)
        self.assertEqual(normalize_phone("+91-9876543210"), self.E164)
        for bad in ("123", "abcdefghij", "", "+0123456789", "1234567890"):
            with self.assertRaises(ValueError):
                normalize_phone(bad)

    def test_login_creates_customer_and_returns_tokens(self):
        code = self.send().json()["dev_otp"]
        r = self.verify(code)
        self.assertEqual(r.status_code, 200)
        data = r.json()
        self.assertTrue(data["access"] and data["refresh"])
        self.assertTrue(data["is_first_time_customer"])
        user = User.objects.get(phone=self.E164)
        self.assertEqual(user.user_type, "CUSTOMER")
        self.assertFalse(user.has_usable_password())
        self.assertIsNone(data["user"]["employee"])

    def test_otp_is_stored_hashed_and_single_use(self):
        code = self.send().json()["dev_otp"]
        self.assertNotIn(code, OTPRequest.objects.get().code_hash)
        self.assertEqual(self.verify(code).status_code, 200)
        self.assertEqual(self.verify(code).status_code, 400)  # replay rejected

    def test_wrong_otp_counts_attempts_and_locks(self):
        code = self.send().json()["dev_otp"]
        wrong = "000000" if code != "000000" else "111111"
        for _ in range(5):
            self.assertEqual(self.verify(wrong).status_code, 400)
        r = self.verify(code)  # correct code is refused after the limit
        self.assertEqual(r.status_code, 400)
        self.assertEqual(r.json()["code"], "otp_locked")
        self.assertFalse(User.objects.filter(phone=self.E164).exists())

    def test_expired_otp_rejected(self):
        code = self.send().json()["dev_otp"]
        OTPRequest.objects.update(expires_at=timezone.now() - timedelta(seconds=1))
        r = self.verify(code)
        self.assertEqual(r.status_code, 400)
        self.assertEqual(r.json()["code"], "otp_expired")

    def test_new_otp_invalidates_nothing_but_latest_wins(self):
        first = self.send().json()["dev_otp"]
        second = self.send().json()["dev_otp"]
        if first != second:
            self.assertEqual(self.verify(first).status_code, 400)
        self.assertEqual(self.verify(second).status_code, 200)

    @override_settings(OTP_RESEND_COOLDOWN_SECONDS=30)
    def test_resend_cooldown(self):
        self.assertEqual(self.send().status_code, 200)
        r = self.send()
        self.assertEqual(r.status_code, 429)
        self.assertIn("Retry-After", r)

    @override_settings(OTP_MAX_SENDS_PER_HOUR=3)
    def test_hourly_send_cap(self):
        for _ in range(3):
            self.assertEqual(self.send().status_code, 200)
        self.assertEqual(self.send().status_code, 429)

    def test_staff_phone_cannot_use_customer_otp(self):
        make_staff("+919000000001", "CHEF", self.a)
        self.assertEqual(self.send("+919000000001").status_code, 403)
        self.assertEqual(self.verify("123456", "+919000000001").status_code, 403)

    def test_first_time_flag_false_after_completed_order(self):
        user = User.objects.create_user(phone=self.E164)
        Order.objects.create(order_number="X1", branch=self.a, order_type="TAKEAWAY", customer=user,
                             status="COMPLETED")
        code = self.send().json()["dev_otp"]
        self.assertFalse(self.verify(code).json()["is_first_time_customer"])

    def test_pending_order_does_not_count_as_completed(self):
        user = User.objects.create_user(phone=self.E164)
        Order.objects.create(order_number="X2", branch=self.a, order_type="TAKEAWAY", customer=user,
                             status="PENDING")
        code = self.send().json()["dev_otp"]
        self.assertTrue(self.verify(code).json()["is_first_time_customer"])

    def test_invalid_phone_rejected(self):
        self.assertEqual(self.send("12345").status_code, 400)


@override_settings(DEBUG=False, OTP_PROVIDER="console", OTP_RESEND_COOLDOWN_SECONDS=0)
class OTPProductionSafetyTests(Base):
    def test_console_provider_refused_and_no_bypass_when_debug_off(self):
        with self.assertRaises(ImproperlyConfigured):
            self.client.post("/api/auth/otp/send/", {"phone": "9876543210"}, format="json")
        self.assertEqual(OTPRequest.objects.count(), 0)


class StaffAuthTests(Base):
    def setUp(self):
        super().setUp()
        self.admin = make_staff("+919100000001", "ADMIN", None, code="ADM001")
        self.chef = make_staff("+919100000002", "CHEF", self.a, code="CHF001")

    def test_login_success_returns_server_side_identity(self):
        r = login_staff(self.client, "adm001")  # case-insensitive code
        self.assertEqual(r.status_code, 200)
        emp = r.json()["user"]["employee"]
        self.assertEqual((emp["role"], emp["is_admin_level"], emp["branch"]), ("ADMIN", True, None))
        r = login_staff(self.client, "CHF001")
        emp = r.json()["user"]["employee"]
        self.assertEqual((emp["role"], emp["is_admin_level"], emp["branch"]["id"]), ("CHEF", False, self.a.id))

    def test_wrong_password_and_unknown_code_give_same_error(self):
        r1 = login_staff(self.client, "ADM001", "wrong-password")
        r2 = login_staff(self.client, "NOPE99", "wrong-password")
        self.assertEqual((r1.status_code, r2.status_code), (401, 401))
        self.assertEqual(r1.json()["detail"], r2.json()["detail"])

    def test_lockout_after_repeated_failures(self):
        for _ in range(5):
            login_staff(self.client, "CHF001", "bad")
        self.assertEqual(login_staff(self.client, "CHF001", PW).status_code, 429)  # even the right password
        self.assertEqual(login_staff(self.client, "ADM001", PW).status_code, 200)  # other accounts unaffected

    def test_inactive_employee_cannot_login(self):
        self.chef.status = "INACTIVE"
        self.chef.save()
        self.assertEqual(login_staff(self.client, "CHF001").status_code, 403)

    def test_customer_cannot_use_staff_login(self):
        User.objects.create_user(phone="+919100000009", password=PW)
        self.assertEqual(login_staff(self.client, "+919100000009").status_code, 401)

    def test_me_requires_auth_and_reflects_database_not_token(self):
        self.assertEqual(self.client.get("/api/auth/me/").status_code, 401)
        tokens = login_staff(self.client, "CHF001").json()
        auth(self.client, tokens)
        self.assertEqual(self.client.get("/api/auth/me/").json()["employee"]["role"], "CHEF")
        # Demote/disable in the DB: the same still-valid token loses staff identity immediately.
        self.chef.status = "SUSPENDED"
        self.chef.save()
        self.assertIsNone(self.client.get("/api/auth/me/").json()["employee"])

    def test_account_switching_returns_each_users_own_identity(self):
        t_admin = login_staff(self.client, "ADM001").json()
        t_chef = login_staff(self.client, "CHF001").json()
        c = APIClient()
        self.assertEqual(auth(c, t_admin).get("/api/auth/me/").json()["employee"]["role"], "ADMIN")
        self.assertEqual(auth(c, t_chef).get("/api/auth/me/").json()["employee"]["role"], "CHEF")

    def test_logout_blacklists_refresh_token(self):
        tokens = login_staff(self.client, "CHF001").json()
        auth(self.client, tokens)
        self.assertEqual(self.client.post("/api/auth/logout/", {"refresh": tokens["refresh"]}, format="json")
                         .status_code, 200)
        r = APIClient().post("/api/auth/refresh/", {"refresh": tokens["refresh"]}, format="json")
        self.assertEqual(r.status_code, 401)

    def test_cannot_logout_with_someone_elses_refresh_token(self):
        t_admin = login_staff(self.client, "ADM001").json()
        t_chef = login_staff(self.client, "CHF001").json()
        auth(self.client, t_chef)
        r = self.client.post("/api/auth/logout/", {"refresh": t_admin["refresh"]}, format="json")
        self.assertEqual(r.status_code, 403)

    def test_refresh_rotates_and_old_token_dies(self):
        tokens = login_staff(self.client, "CHF001").json()
        c = APIClient()
        r = c.post("/api/auth/refresh/", {"refresh": tokens["refresh"]}, format="json")
        self.assertEqual(r.status_code, 200)
        self.assertEqual(c.post("/api/auth/refresh/", {"refresh": tokens["refresh"]}, format="json").status_code, 401)

    def test_deactivated_user_cannot_refresh(self):
        tokens = login_staff(self.client, "CHF001").json()
        self.chef.user.is_active = False
        self.chef.user.save()
        r = APIClient().post("/api/auth/refresh/", {"refresh": tokens["refresh"]}, format="json")
        self.assertEqual(r.status_code, 401)


class EmployeeManagementTests(Base):
    def setUp(self):
        super().setUp()
        self.owner = make_staff("+919200000001", "ADMIN", None, code="OWN001")
        self.admin_a = make_staff("+919200000002", "ADMIN", self.a, code="ADA001")
        self.chef_a = make_staff("+919200000003", "CHEF", self.a, code="CHA001")
        self.chef_b = make_staff("+919200000004", "CHEF", self.b, code="CHB001")
        self.owner_c = auth(APIClient(), login_staff(APIClient(), "OWN001").json())
        self.admin_a_c = auth(APIClient(), login_staff(APIClient(), "ADA001").json())
        self.chef_c = auth(APIClient(), login_staff(APIClient(), "CHA001").json())

    def payload(self, **kw):
        base = {"name": "New Cook", "phone": "9300000001", "password": PW, "branch": self.a.id, "role": "CHEF",
                "department": "Kitchen", "job_title": "Line cook"}
        base.update(kw)
        return base

    def test_admin_creates_employee_who_can_login(self):
        r = self.admin_a_c.post("/api/employees/", self.payload(), format="json")
        self.assertEqual(r.status_code, 201, r.content)
        body = r.json()
        self.assertTrue(body["employee_code"].startswith("EMP"))
        self.assertNotIn("password", body)
        emp = Employee.objects.get(pk=body["id"])
        self.assertNotEqual(emp.user.password, PW)  # hashed
        self.assertEqual(emp.user.user_type, "EMPLOYEE")
        self.assertEqual(emp.user.phone, "+919300000001")
        self.assertEqual(login_staff(APIClient(), body["employee_code"]).status_code, 200)

    def test_non_admin_and_customers_are_forbidden(self):
        self.assertEqual(self.chef_c.get("/api/employees/").status_code, 403)
        self.assertEqual(self.chef_c.post("/api/employees/", self.payload(), format="json").status_code, 403)
        cust = APIClient()
        self.assertEqual(cust.get("/api/employees/").status_code, 401)
        user = User.objects.create_user(phone="+919300000099")
        from apps.accounts.services import issue_tokens
        self.assertEqual(auth(cust, issue_tokens(user)).get("/api/employees/").status_code, 403)

    def test_branch_isolation_on_list_and_detail(self):
        ids = {e["id"] for e in self.admin_a_c.get("/api/employees/").json()["results"]
               } if "results" in self.admin_a_c.get("/api/employees/").json() else {
            e["id"] for e in self.admin_a_c.get("/api/employees/").json()}
        self.assertIn(self.chef_a.id, ids)
        self.assertNotIn(self.chef_b.id, ids)
        self.assertEqual(self.admin_a_c.get(f"/api/employees/{self.chef_b.id}/").status_code, 404)
        self.assertEqual(self.admin_a_c.patch(f"/api/employees/{self.chef_b.id}/", {"department": "X"},
                                              format="json").status_code, 404)
        self.assertEqual(self.owner_c.get(f"/api/employees/{self.chef_b.id}/").status_code, 200)

    def test_branch_admin_cannot_create_in_other_branch_or_branchless(self):
        r = self.admin_a_c.post("/api/employees/", self.payload(branch=self.b.id), format="json")
        self.assertEqual(r.status_code, 400)
        r = self.admin_a_c.post("/api/employees/", self.payload(branch=None, role="ADMIN"), format="json")
        self.assertEqual(r.status_code, 400)

    def test_no_privilege_escalation(self):
        r = self.admin_a_c.post("/api/employees/", self.payload(role="ADMIN"), format="json")
        self.assertEqual(r.status_code, 400)
        r = self.admin_a_c.post("/api/employees/", self.payload(role="SUPER_ADMIN"), format="json")
        self.assertEqual(r.status_code, 400)
        r = self.admin_a_c.patch(f"/api/employees/{self.chef_a.id}/", {"role": "ADMIN"}, format="json")
        self.assertEqual(r.status_code, 400)

    def test_branch_required_for_non_admin_roles(self):
        r = self.owner_c.post("/api/employees/", self.payload(branch=None), format="json")
        self.assertEqual(r.status_code, 400)

    def test_weak_password_and_duplicates_rejected(self):
        self.assertEqual(self.admin_a_c.post("/api/employees/", self.payload(password="12345678"),
                                             format="json").status_code, 400)
        self.assertEqual(self.admin_a_c.post("/api/employees/", self.payload(phone="+919200000003"),
                                             format="json").status_code, 400)
        self.assertEqual(self.admin_a_c.post("/api/employees/", self.payload(phone="bad"),
                                             format="json").status_code, 400)

    def test_delete_deactivates_and_revokes_tokens(self):
        chef_tokens = login_staff(APIClient(), "CHA001").json()
        r = self.admin_a_c.delete(f"/api/employees/{self.chef_a.id}/")
        self.assertEqual(r.status_code, 204)
        self.chef_a.refresh_from_db()
        self.assertEqual(self.chef_a.status, "INACTIVE")
        self.assertTrue(Employee.objects.filter(pk=self.chef_a.id).exists())  # history preserved
        self.assertEqual(login_staff(APIClient(), "CHA001").status_code, 403)
        r = APIClient().post("/api/auth/refresh/", {"refresh": chef_tokens["refresh"]}, format="json")
        self.assertEqual(r.status_code, 401)
        # The still-unexpired access token is rejected immediately (inactive users cannot authenticate at all).
        self.assertEqual(auth(APIClient(), chef_tokens).get("/api/employees/").status_code, 401)

    def test_cannot_deactivate_self(self):
        self.assertEqual(self.admin_a_c.delete(f"/api/employees/{self.admin_a.id}/").status_code, 403)

    def test_password_change_revokes_sessions_and_new_password_works(self):
        old = login_staff(APIClient(), "CHA001").json()
        new_pw = "An0ther-Str0ng!pw"
        r = self.admin_a_c.patch(f"/api/employees/{self.chef_a.id}/", {"password": new_pw}, format="json")
        self.assertEqual(r.status_code, 200)
        self.assertEqual(APIClient().post("/api/auth/refresh/", {"refresh": old["refresh"]}, format="json")
                         .status_code, 401)
        self.assertEqual(login_staff(APIClient(), "CHA001", PW).status_code, 401)
        self.assertEqual(login_staff(APIClient(), "CHA001", new_pw).status_code, 200)

    def test_filter_and_search(self):
        self.admin_a_c.post("/api/employees/", self.payload(name="Zed Waiter", phone="9300000002",
                                                           role="STAFF", department="Service"), format="json")

        def names(resp):
            j = resp.json()
            rows = j["results"] if isinstance(j, dict) and "results" in j else j
            return {row["name"] for row in rows}

        self.assertEqual(names(self.admin_a_c.get("/api/employees/?department=Service")), {"Zed Waiter"})
        self.assertEqual(names(self.admin_a_c.get("/api/employees/?search=zed")), {"Zed Waiter"})

    def test_audit_trail_written(self):
        from apps.audit.models import AuditLog
        self.admin_a_c.post("/api/employees/", self.payload(), format="json")
        self.assertTrue(AuditLog.objects.filter(action="employee.create", actor=self.admin_a.user).exists())


class ScopingTests(Base):
    def test_scope_queryset_limits_to_branch(self):
        Order.objects.create(order_number="S1", branch=self.a, order_type="TAKEAWAY")
        Order.objects.create(order_number="S2", branch=self.b, order_type="TAKEAWAY")
        chef = make_staff("+919400000001", "CHEF", self.a)
        owner = make_staff("+919400000002", "ADMIN", None)
        customer = User.objects.create_user(phone="+919400000003")
        qs = Order.objects.all()
        self.assertEqual(list(scope_queryset(qs, chef.user).values_list("order_number", flat=True)), ["S1"])
        self.assertEqual(scope_queryset(qs, owner.user).count(), 2)
        self.assertEqual(scope_queryset(qs, customer).count(), 0)  # non-staff gets nothing
