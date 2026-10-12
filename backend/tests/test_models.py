"""Phase 2 schema tests. They run on MySQL and check that constraints are enforced by the database itself."""
from datetime import timedelta
from decimal import Decimal

from django.core.exceptions import ValidationError
from django.db import IntegrityError, transaction
from django.db.models import ProtectedError
from django.test import TestCase
from django.utils import timezone

from apps.accounts.models import Employee, User
from apps.branches.models import Branch, DiningTable
from apps.carts.models import Cart
from apps.coupons.models import Coupon
from apps.inventory.models import InventoryItem, StockTransaction
from apps.menu.models import Category, Food
from apps.orders.models import Order
from apps.payments.models import Payment, PaymentEvent


def make_branch(code="B1"):
    return Branch.objects.create(name=f"Branch {code}", code=code, address="addr")


def make_order(branch, table=None, order_type="TAKEAWAY", number="O1"):
    return Order.objects.create(order_number=number, branch=branch, table=table, order_type=order_type)


class SchemaTests(TestCase):
    def setUp(self):
        self.branch = make_branch()
        self.table = DiningTable.objects.create(branch=self.branch, table_number="T1", capacity=4)
        self.cat = Category.objects.create(branch=self.branch, name="Starters")
        self.food = Food.objects.create(branch=self.branch, category=self.cat, name="Dosa", price=Decimal("80"))

    # accounts
    def test_customer_has_unusable_password_and_staff_login_fields(self):
        c = User.objects.create_user(phone="+919999999999")
        self.assertFalse(c.has_usable_password())
        self.assertEqual(c.user_type, User.UserType.CUSTOMER)
        u = User.objects.create_user(phone="+918888888888", password="S3cure-pass!x", user_type="EMPLOYEE")
        e = Employee.objects.create(user=u, branch=self.branch, employee_code="EMP001", role="CHEF")
        self.assertTrue(u.check_password("S3cure-pass!x"))
        self.assertNotEqual(u.password, "S3cure-pass!x")  # hashed
        self.assertEqual(e.branch, self.branch)

    def test_non_super_admin_employee_requires_branch(self):
        u = User.objects.create_user(phone="+917777777777", password="S3cure-pass!x", user_type="EMPLOYEE")
        with self.assertRaises(ValidationError):
            Employee(user=u, employee_code="EMP002", role="STAFF").clean()

    def test_duplicate_employee_code_rejected(self):
        for i, code in enumerate(["EMP9", "EMP9"]):
            u = User.objects.create_user(phone=f"+9100000000{i}", password="S3cure-pass!x", user_type="EMPLOYEE")
            if i == 0:
                Employee.objects.create(user=u, branch=self.branch, employee_code=code)
            else:
                with self.assertRaises(IntegrityError), transaction.atomic():
                    Employee.objects.create(user=u, branch=self.branch, employee_code=code)

    # branches / tables
    def test_table_number_unique_per_branch_only(self):
        other = make_branch("B2")
        DiningTable.objects.create(branch=other, table_number="T1", capacity=2)  # same number, other branch: ok
        with self.assertRaises(IntegrityError), transaction.atomic():
            DiningTable.objects.create(branch=self.branch, table_number="T1", capacity=2)

    def test_each_table_gets_unique_qr_code(self):
        t2 = DiningTable.objects.create(branch=self.branch, table_number="T2", capacity=2)
        self.assertNotEqual(self.table.qr_code, t2.qr_code)

    def test_branch_with_configuration_cannot_be_deleted_directly(self):
        # Tables, categories and dishes still point at it; deletion goes through branches.services.
        with self.assertRaises(ProtectedError):
            self.branch.delete()

    def test_deleting_a_branch_keeps_its_orders_with_a_snapshot(self):
        empty = make_branch("B9")
        order = Order.objects.create(order_number="H9", branch=empty, branch_name=empty.name, order_type="TAKEAWAY")
        empty.delete()
        order.refresh_from_db()
        self.assertEqual((order.branch_id, order.branch_name), (None, "Branch B9"))

    def test_dine_in_order_keeps_its_label_after_the_table_is_deleted(self):
        t = DiningTable.objects.create(branch=self.branch, table_number="T7", capacity=2)
        order = make_order(self.branch, table=t, order_type="DINE_IN", number="H8")
        Order.objects.filter(pk=order.pk).update(table_label="T7")
        t.delete()
        order.refresh_from_db()
        self.assertEqual((order.table_id, order.table_label), (None, "T7"))

    # menu
    def test_food_category_must_match_branch(self):
        other = make_branch("B3")
        with self.assertRaises(ValidationError):
            Food(branch=other, category=self.cat, name="X", price=1).clean()

    def test_category_with_foods_cannot_be_deleted(self):
        with self.assertRaises(ProtectedError):
            self.cat.delete()

    # inventory
    def test_stock_status_thresholds(self):
        inv = InventoryItem.objects.create(branch=self.branch, food=self.food, quantity=10)
        self.assertEqual(inv.status, InventoryItem.Status.IN_STOCK)
        inv.quantity = 5
        self.assertEqual(inv.status, InventoryItem.Status.LOW_STOCK)  # default threshold 5
        inv.quantity = 0
        self.assertEqual(inv.status, InventoryItem.Status.OUT_OF_STOCK)

    def test_negative_stock_rejected_by_database(self):
        inv = InventoryItem.objects.create(branch=self.branch, food=self.food, quantity=1)
        with self.assertRaises(Exception), transaction.atomic():
            InventoryItem.objects.filter(pk=inv.pk).update(quantity=-1)

    def test_duplicate_order_deduction_rejected(self):
        inv = InventoryItem.objects.create(branch=self.branch, food=self.food, quantity=10)
        order = make_order(self.branch)
        kw = dict(item=inv, transaction_type="ORDER_DEDUCTION", quantity_change=-1, balance_after=9, order=order)
        StockTransaction.objects.create(**kw)
        with self.assertRaises(IntegrityError), transaction.atomic():
            StockTransaction.objects.create(**kw)

    # carts
    def test_only_one_active_cart_per_user_and_branch(self):
        user = User.objects.create_user(phone="+916666666666")
        Cart.objects.create(user=user, branch=self.branch)
        with self.assertRaises(IntegrityError), transaction.atomic():
            Cart.objects.create(user=user, branch=self.branch)
        old = Cart.objects.get(user=user)
        old.status = Cart.Status.MERGED
        old.save()
        Cart.objects.create(user=user, branch=self.branch)  # allowed once the first is no longer active

    def test_cart_requires_owner(self):
        with self.assertRaises(IntegrityError), transaction.atomic():
            Cart.objects.create(branch=self.branch)

    # coupons
    def test_coupon_code_unique_per_branch_and_dates_checked(self):
        now = timezone.now()
        kw = dict(branch=self.branch, code="SAVE", discount_type="FLAT", discount_value=10,
                  valid_from=now, valid_to=now + timedelta(days=1))
        Coupon.objects.create(**kw)
        with self.assertRaises(IntegrityError), transaction.atomic():
            Coupon.objects.create(**kw)
        with self.assertRaises(IntegrityError), transaction.atomic():
            Coupon.objects.create(**{**kw, "code": "BAD", "valid_to": now - timedelta(days=1)})

    # orders
    def test_dine_in_requires_table_and_takeaway_forbids_it(self):
        with self.assertRaises(IntegrityError), transaction.atomic():
            make_order(self.branch, table=None, order_type="DINE_IN", number="O2")
        with self.assertRaises(IntegrityError), transaction.atomic():
            make_order(self.branch, table=self.table, order_type="TAKEAWAY", number="O3")
        make_order(self.branch, table=self.table, order_type="DINE_IN", number="O4")

    def test_order_number_and_idempotency_key_unique(self):
        Order.objects.create(order_number="O5", branch=self.branch, order_type="TAKEAWAY", idempotency_key="k1")
        with self.assertRaises(IntegrityError), transaction.atomic():
            Order.objects.create(order_number="O6", branch=self.branch, order_type="TAKEAWAY", idempotency_key="k1")

    def test_order_money_is_decimal_and_precise(self):
        o = make_order(self.branch, number="O7")
        o.total_amount = Decimal("118.35")
        o.save()
        o.refresh_from_db()
        self.assertEqual(o.total_amount, Decimal("118.35"))

    # payments
    def test_only_one_successful_payment_per_order(self):
        order = make_order(self.branch, number="O8")
        Payment.objects.create(order=order, method="UPI", amount=100, status="FAILED")
        Payment.objects.create(order=order, method="UPI", amount=100, status="SUCCESS")
        with self.assertRaises(IntegrityError), transaction.atomic():
            Payment.objects.create(order=order, method="CARD", amount=100, status="SUCCESS")

    def test_payment_event_replay_rejected(self):
        PaymentEvent.objects.create(event_id="evt_1", event_type="payment.captured")
        with self.assertRaises(IntegrityError), transaction.atomic():
            PaymentEvent.objects.create(event_id="evt_1", event_type="payment.captured")

    def test_paid_order_with_payment_cannot_be_deleted(self):
        order = make_order(self.branch, number="O9")
        Payment.objects.create(order=order, method="COUNTER", amount=10)
        with self.assertRaises(ProtectedError):
            order.delete()
