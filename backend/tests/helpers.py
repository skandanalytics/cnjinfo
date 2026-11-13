import io

from django.core.cache import cache
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase
from PIL import Image
from rest_framework.test import APIClient

from apps.accounts.models import Employee, User
from apps.branches.models import Branch

PW = "Str0ng-Pass!42"


def make_branch(code, **kw):
    return Branch.objects.create(name=f"Branch {code}", code=code, address="addr", **kw)


def make_staff(phone, role, branch, code=None, password=PW):
    user = User.objects.create_user(phone=phone, password=password, name=f"Staff {phone}", user_type="EMPLOYEE")
    return Employee.objects.create(user=user, branch=branch, role=role, employee_code=code or f"E{user.id:04d}")


def client_for(code, password=PW):
    cache.clear()
    c = APIClient()
    emp = Employee.objects.filter(employee_code=code).first()
    if emp and emp.user:
        from rest_framework_simplejwt.tokens import RefreshToken
        token = str(RefreshToken.for_user(emp.user).access_token)
        c.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")
        return c
    r = c.post("/api/auth/staff/login/", {"employee_code": code, "password": password}, format="json")
    assert r.status_code == 200, r.content
    c.credentials(HTTP_AUTHORIZATION=f"Bearer {r.json()['access']}")
    return c


def rows(resp):
    j = resp.json()
    return j["results"] if isinstance(j, dict) and "results" in j else j


def png_file(name="dish.png", size=(40, 30), color=(200, 30, 60)):
    buf = io.BytesIO()
    Image.new("RGB", size, color).save(buf, format="PNG")
    return SimpleUploadedFile(name, buf.getvalue(), content_type="image/png")


class StaffTestCase(TestCase):
    """Two branches; owner (no branch), one admin and one chef per branch, each with a logged-in client."""

    def setUp(self):
        cache.clear()
        self.a = make_branch("A")
        self.b = make_branch("B")
        make_staff("+919500000001", "ADMIN", None, code="OWN001")
        make_staff("+919500000002", "ADMIN", self.a, code="ADA001")
        make_staff("+919500000003", "CHEF", self.a, code="CHA001")
        make_staff("+919500000004", "ADMIN", self.b, code="ADB001")
        self.owner = client_for("OWN001")
        self.admin_a = client_for("ADA001")
        self.chef_a = client_for("CHA001")
        self.admin_b = client_for("ADB001")
        self.anon = APIClient()


def customer_client(user):
    from apps.accounts.services import issue_tokens
    c = APIClient()
    c.credentials(HTTP_AUTHORIZATION=f"Bearer {issue_tokens(user)['access']}")
    return c


def make_order(branch, items=(), number="ORD1", status="PENDING", customer=None, order_type="TAKEAWAY", table=None):
    """items: iterable of (food, quantity)."""
    from apps.orders.models import Order, OrderItem
    order = Order.objects.create(order_number=number, branch=branch, order_type=order_type, table=table,
                                 status=status, customer=customer)
    for food, qty in items:
        OrderItem.objects.create(order=order, food=food, food_name=food.name, unit_price=food.price, quantity=qty,
                                 line_total=food.price * qty)
    return order
