"""Comprehensive tests for:
1. Dashboard Date-Range Filtering (single-day inclusive, multi-day, net revenue after refunds, operational metrics).
2. First-Time Customer Multiple Coupons (authoritative eligibility, Option B sequential calculation, refund restoration).
"""
from datetime import date, datetime, time, timedelta
from decimal import Decimal
import zoneinfo

from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.branches.models import Branch, DiningTable
from apps.coupons import services as coupon_services
from apps.coupons.models import Coupon, CouponRedemption
from apps.menu.models import Category, Food
from apps.orders.models import Order, OrderItem
from apps.payments.models import Payment, Refund
from tests.helpers import client_for, make_branch, make_staff

D = Decimal
TZ = zoneinfo.ZoneInfo("Asia/Kolkata")


class DateRangeFilteringAndTwoCouponsTestCase(TestCase):
    def setUp(self):
        self.branch = make_branch("DF")
        self.table = DiningTable.objects.create(branch=self.branch, table_number="T1", capacity=4, status="AVAILABLE")
        self.table2 = DiningTable.objects.create(branch=self.branch, table_number="T2", capacity=4, status="OCCUPIED")

        # Staff users
        make_staff("+919700000001", "ADMIN", self.branch, code="ADF001")
        self.admin = client_for("ADF001")

        # Menu
        self.cat = Category.objects.create(branch=self.branch, name="Main Course")
        self.dish1 = Food.objects.create(branch=self.branch, category=self.cat, name="Biryani", price=D("500.00"))
        self.dish2 = Food.objects.create(branch=self.branch, category=self.cat, name="Starter", price=D("250.00"))

        # Coupons
        now = timezone.now()
        self.coupon_new_user = Coupon.objects.create(
            branch=self.branch,
            code="WELCOME20",
            discount_type="PERCENT",
            discount_value=D("20.00"),  # 20% off
            min_order_value=D("500.00"),
            is_first_time_auto=True,
            is_active=True,
            valid_from=now - timedelta(days=1),
            valid_to=now + timedelta(days=30),
        )

        self.coupon_flat = Coupon.objects.create(
            branch=self.branch,
            code="FLAT100",
            discount_type="FLAT",
            discount_value=D("100.00"),
            min_order_value=D("400.00"),
            is_active=True,
            valid_from=now - timedelta(days=1),
            valid_to=now + timedelta(days=30),
        )

        self.coupon_pct_reg = Coupon.objects.create(
            branch=self.branch,
            code="REG10",
            discount_type="PERCENT",
            discount_value=D("10.00"),  # 10% off
            min_order_value=D("400.00"),
            is_active=True,
            valid_from=now - timedelta(days=1),
            valid_to=now + timedelta(days=30),
        )

    def _create_order_at(self, dt_local, number, total="500.00", status="COMPLETED", payment_status="PAID", customer=None):
        """Create order with exact created_at timestamp in Asia/Kolkata timezone."""
        dt_aware = timezone.make_aware(dt_local, TZ)
        order = Order.objects.create(
            order_number=number,
            branch=self.branch,
            order_type="DINE_IN",
            table=self.table,
            status=status,
            payment_status=payment_status,
            total_amount=Decimal(total),
            items_subtotal=Decimal(total),
            customer=customer,
        )
        Order.objects.filter(id=order.id).update(created_at=dt_aware)
        order.refresh_from_db()
        return order

    # =========================================================================
    # REQUIREMENT 1: DASHBOARD DATE FILTERING TESTS
    # =========================================================================

    def test_single_day_date_filtering_inclusive(self):
        """Selecting 13/11/2026 to 13/11/2026 must inclusively return orders created between
        00:00:00 and 23:59:59.999 local restaurant time on that day."""
        target_day = date(2026, 11, 13)

        # Order 1: morning of 13/11/2026 (08:30:00)
        o1 = self._create_order_at(datetime(2026, 11, 13, 8, 30, 0), "ORD-T13-01", total="600.00")
        # Order 2: night of 13/11/2026 (23:45:00)
        o2 = self._create_order_at(datetime(2026, 11, 13, 23, 45, 0), "ORD-T13-02", total="400.00")
        # Order 3: previous day (12/11/2026 23:59:00) -> should NOT be included
        o_prev = self._create_order_at(datetime(2026, 11, 12, 23, 59, 0), "ORD-T12-01", total="500.00")
        # Order 4: next day (14/11/2026 00:01:00) -> should NOT be included
        o_next = self._create_order_at(datetime(2026, 11, 14, 0, 1, 0), "ORD-T14-01", total="500.00")

        # Query orders API with from=2026-11-13 and to=2026-11-13
        res = self.admin.get(f"/api/orders/?branch={self.branch.id}&from_date=2026-11-13&to_date=2026-11-13")
        self.assertEqual(res.status_code, 200)
        data = res.json()
        results = data if isinstance(data, list) else data.get("results", [])
        order_numbers = [o["order_number"] for o in results]

        self.assertIn("ORD-T13-01", order_numbers)
        self.assertIn("ORD-T13-02", order_numbers)
        self.assertNotIn("ORD-T12-01", order_numbers)
        self.assertNotIn("ORD-T14-01", order_numbers)

    def test_multi_day_date_filtering(self):
        """Selecting 10/11/2026 to 13/11/2026 includes all orders in between."""
        o_in1 = self._create_order_at(datetime(2026, 11, 10, 0, 5, 0), "ORD-M10", total="300.00")
        o_in2 = self._create_order_at(datetime(2026, 11, 11, 14, 0, 0), "ORD-M11", total="450.00")
        o_in3 = self._create_order_at(datetime(2026, 11, 13, 23, 50, 0), "ORD-M13", total="550.00")
        o_out = self._create_order_at(datetime(2026, 11, 9, 23, 59, 0), "ORD-M09", total="200.00")

        res = self.admin.get(f"/api/orders/?branch={self.branch.id}&from_date=2026-11-10&to_date=2026-11-13")
        self.assertEqual(res.status_code, 200)
        data = res.json()
        results = data if isinstance(data, list) else data.get("results", [])
        order_numbers = [o["order_number"] for o in results]

        self.assertIn("ORD-M10", order_numbers)
        self.assertIn("ORD-M11", order_numbers)
        self.assertIn("ORD-M13", order_numbers)
        self.assertNotIn("ORD-M09", order_numbers)

    def test_operational_tables_remain_current_state(self):
        """Available tables must reflect the live physical state of tables, not filtered historically."""
        # Create an active in-progress order for table2 so it stays OCCUPIED
        Order.objects.create(
            order_number="ORD-LIVE-T2",
            branch=self.branch,
            order_type="DINE_IN",
            table=self.table2,
            status="PREPARING",
            total_amount=D("300.00"),
        )
        res = self.admin.get(f"/api/tables/?branch={self.branch.id}")
        self.assertEqual(res.status_code, 200)
        data = res.json()
        tables = data if isinstance(data, list) else data.get("results", [])
        available = [t for t in tables if t["status"] == "AVAILABLE"]
        occupied = [t for t in tables if t["status"] == "OCCUPIED"]
        self.assertEqual(len(available), 1)
        self.assertEqual(len(occupied), 1)

    # =========================================================================
    # REQUIREMENT 2: FIRST-TIME CUSTOMER TWO-COUPON TESTS
    # =========================================================================

    def test_first_time_customer_authoritative_eligibility(self):
        """Authoritative eligibility check:
        - Customer with NO orders -> first-time: True
        - Customer with UNPAID pending order -> first-time: True
        - Customer with CANCELLED unpaid order -> first-time: True
        - Customer with PAID completed order -> first-time: False
        - Customer with cancelled + fully refunded order -> first-time: True (RESTORED)
        - Customer with partially refunded order -> first-time: False (NOT RESTORED)
        """
        user = User.objects.create_user(phone="+919800000001", user_type="CUSTOMER")
        self.assertTrue(coupon_services.is_first_time(user))

        # 1. Unpaid pending order does NOT disqualify
        ord_unpaid = Order.objects.create(
            order_number="ORD-ELIG-01",
            branch=self.branch,
            order_type="DINE_IN",
            table=self.table,
            status="PENDING",
            payment_status="PENDING",
            customer=user,
            total_amount=D("500.00"),
        )
        self.assertTrue(coupon_services.is_first_time(user))

        # 2. Cancelled unpaid order does NOT disqualify
        ord_unpaid.status = "CANCELLED"
        ord_unpaid.save()
        self.assertTrue(coupon_services.is_first_time(user))

        # 3. Paid completed order disqualifies
        ord_paid = Order.objects.create(
            order_number="ORD-ELIG-02",
            branch=self.branch,
            order_type="DINE_IN",
            table=self.table,
            status="COMPLETED",
            payment_status="PAID",
            customer=user,
            total_amount=D("500.00"),
        )
        self.assertFalse(coupon_services.is_first_time(user))

        # 4. If paid order is cancelled and PARTIALLY refunded -> remains disqualified
        ord_paid.status = "CANCELLED"
        ord_paid.refund_status = "PARTIALLY_REFUNDED"
        ord_paid.refunded_amount = D("200.00")
        ord_paid.save()
        self.assertFalse(coupon_services.is_first_time(user))

        # 5. If cancelled and FULLY refunded -> restores first-time eligibility!
        ord_paid.refund_status = "FULLY_REFUNDED"
        ord_paid.refunded_amount = D("500.00")
        ord_paid.save()
        self.assertTrue(coupon_services.is_first_time(user))

    def test_sequential_discount_option_b_calculation(self):
        """Option B Sequential Calculation:
        Subtotal = ₹1,000.
        Coupon 1: WELCOME20 (20% off) -> 20% of ₹1,000 = ₹200. Remaining = ₹800.
        Coupon 2: REG10 (10% off) -> 10% of remaining ₹800 = ₹80.
        Total discount = ₹200 + ₹80 = ₹280.
        Taxable / Net food amount = ₹1,000 - ₹280 = ₹720.
        (Note: Option A would have been 20% + 10% of 1000 = 300, which is forbidden).
        """
        user = User.objects.create_user(phone="+919800000002", user_type="CUSTOMER")
        qualifying = D("1000.00")

        outcome = coupon_services.apply_coupons(
            branch=self.branch,
            qualifying_amount=qualifying,
            customer=user,
            codes=["WELCOME20", "REG10"],
        )

        self.assertEqual(len(outcome.applied), 2)
        applied_map = {a.coupon.code: a.amount for a in outcome.applied}

        self.assertEqual(applied_map["WELCOME20"], D("200.00"))
        # 10% on remaining ₹800 = ₹80.00
        self.assertEqual(applied_map["REG10"], D("80.00"))
        total_discount = sum(applied_map.values())
        self.assertEqual(total_discount, D("280.00"))

    def test_returning_customer_blocked_from_new_user_coupon(self):
        """Returning customer cannot apply a New User coupon."""
        user = User.objects.create_user(phone="+919800000003", user_type="CUSTOMER")
        Order.objects.create(
            order_number="ORD-PAID-03",
            branch=self.branch,
            order_type="DINE_IN",
            table=self.table,
            status="COMPLETED",
            payment_status="PAID",
            customer=user,
            total_amount=D("500.00"),
        )
        self.assertFalse(coupon_services.is_first_time(user))

        outcome = coupon_services.apply_coupons(
            branch=self.branch,
            qualifying_amount=D("1000.00"),
            customer=user,
            codes=["WELCOME20", "REG10"],
        )

        rejected_codes = [c for c, r in outcome.rejected]
        applied_codes = [a.coupon.code for a in outcome.applied]

        self.assertIn("WELCOME20", rejected_codes)
        self.assertIn("REG10", applied_codes)
        self.assertEqual(len(outcome.applied), 1)

    def test_cannot_apply_two_regular_or_two_new_user_coupons(self):
        """First-time customer cannot apply 2 regular coupons or 2 New User coupons."""
        user = User.objects.create_user(phone="+919800000004", user_type="CUSTOMER")

        # 1. Attempt to apply two regular coupons: only one regular coupon is allowed
        outcome = coupon_services.apply_coupons(
            branch=self.branch,
            qualifying_amount=D("1000.00"),
            customer=user,
            codes=["FLAT100", "REG10"],
        )

        applied_regular = [a.coupon.code for a in outcome.applied if not a.coupon.is_first_time_auto]
        rejected_codes = [c for c, r in outcome.rejected]
        self.assertEqual(len(applied_regular), 1)
        self.assertIn("REG10", rejected_codes)

        # 2. Attempt to apply two New User coupons
        now = timezone.now()
        Coupon.objects.create(
            branch=self.branch,
            code="NEWUSER2",
            discount_type="PERCENT",
            discount_value=D("15.00"),
            min_order_value=D("400.00"),
            is_first_time_auto=True,
            is_active=True,
            valid_from=now - timedelta(days=1),
            valid_to=now + timedelta(days=30),
        )

        outcome2 = coupon_services.apply_coupons(
            branch=self.branch,
            qualifying_amount=D("1000.00"),
            customer=user,
            codes=["WELCOME20", "NEWUSER2"],
        )
        applied_nu = [a.coupon.code for a in outcome2.applied if a.coupon.is_first_time_auto]
        rejected_nu = [c for c, r in outcome2.rejected]
        self.assertEqual(len(applied_nu), 1)
        self.assertIn("NEWUSER2", rejected_nu)
