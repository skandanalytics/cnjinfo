"""Comprehensive test suite for Coupon API (NameError fix, validation, 2-coupon sequential Option B)
and Table Cleaning Status Initialization & Session Management.
"""
from decimal import Decimal
from django.test import TestCase
from django.utils import timezone
from datetime import timedelta
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.branches.models import Branch, DiningTable
from apps.branches.serializers import TableSerializer
from apps.coupons.models import Coupon, CouponRedemption
from apps.orders.models import Order, OrderItem
from tests.helpers import client_for, make_branch, make_staff

D = Decimal


class CouponApiAndTableCleaningTestCase(TestCase):
    def setUp(self):
        self.branch = make_branch("CPN")
        self.table = DiningTable.objects.create(
            branch=self.branch, table_number="T02", capacity=4, status="OCCUPIED"
        )
        make_staff("+919800000011", "ADMIN", self.branch, code="ADMCPN")
        self.admin = client_for("ADMCPN")

        self.customer = User.objects.create_user(
            phone="+919888877771", name="New Customer", user_type="CUSTOMER"
        )

        now = timezone.now()
        # 1. Valid regular coupon
        self.coupon_valid = Coupon.objects.create(
            branch=self.branch,
            code="SAVE10",
            discount_type="PERCENT",
            discount_value=D("10.00"),
            min_order_value=D("100.00"),
            max_discount=D("50.00"),
            is_active=True,
            valid_from=now - timedelta(days=1),
            valid_to=now + timedelta(days=30),
            usage_limit=100,
        )
        # 2. Expired coupon
        self.coupon_expired = Coupon.objects.create(
            branch=self.branch,
            code="EXPIRED20",
            discount_type="PERCENT",
            discount_value=D("20.00"),
            min_order_value=D("100.00"),
            is_active=True,
            valid_from=now - timedelta(days=30),
            valid_to=now - timedelta(days=1),
        )
        # 3. Inactive coupon
        self.coupon_inactive = Coupon.objects.create(
            branch=self.branch,
            code="INACTIVE15",
            discount_type="PERCENT",
            discount_value=D("15.00"),
            min_order_value=D("100.00"),
            is_active=False,
            valid_from=now - timedelta(days=1),
            valid_to=now + timedelta(days=30),
        )
        # 4. High min order coupon
        self.coupon_high_min = Coupon.objects.create(
            branch=self.branch,
            code="BIG500",
            discount_type="FLAT",
            discount_value=D("100.00"),
            min_order_value=D("1000.00"),
            is_active=True,
            valid_from=now - timedelta(days=1),
            valid_to=now + timedelta(days=30),
        )
        # 5. Exhausted usage limit coupon
        self.coupon_exhausted = Coupon.objects.create(
            branch=self.branch,
            code="EXHAUSTED",
            discount_type="FLAT",
            discount_value=D("50.00"),
            min_order_value=D("100.00"),
            is_active=True,
            valid_from=now - timedelta(days=1),
            valid_to=now + timedelta(days=30),
            usage_limit=1,
        )
        # Prior order exhausting usage limit
        past_order = Order.objects.create(
            order_number="ORD-PAST-1",
            branch=self.branch,
            order_type="TAKEAWAY",
            status="COMPLETED",
            payment_status="PAID",
            total_amount=D("200.00"),
        )
        CouponRedemption.objects.create(
            coupon=self.coupon_exhausted,
            coupon_code="EXHAUSTED",
            order=past_order,
            discount_amount=D("50.00"),
        )
        # 6. New User Auto Coupon
        self.coupon_new_user = Coupon.objects.create(
            branch=self.branch,
            code="WELCOME50",
            discount_type="FLAT",
            discount_value=D("50.00"),
            min_order_value=D("200.00"),
            is_active=True,
            is_first_time_auto=True,
            valid_from=now - timedelta(days=1),
            valid_to=now + timedelta(days=30),
        )

        # Create active test order
        self.order = Order.objects.create(
            order_number="ORD-CPN-101",
            branch=self.branch,
            order_type="DINE_IN",
            table=self.table,
            customer=self.customer,
            customer_phone=self.customer.phone,
            status="PREPARING",
            payment_status="PENDING",
            items_subtotal=D("300.00"),
            customization_total=D("0.00"),
            dish_discount_total=D("0.00"),
            coupon_discount_total=D("0.00"),
            taxable_amount=D("300.00"),
            gst_rate=D("5.00"),
            gst_amount=D("15.00"),
            service_charge_rate=D("0.00"),
            service_charge_amount=D("0.00"),
            total_amount=D("315.00"),
        )
        OrderItem.objects.create(
            order=self.order,
            food_name="Biryani",
            unit_price=D("300.00"),
            customization_per_unit=D("0.00"),
            dish_discount_per_unit=D("0.00"),
            quantity=1,
            line_total=D("300.00"),
        )

    # ------------------ COUPON API REGRESSION TESTS ------------------

    def test_apply_valid_coupon_no_nameerror(self):
        """Applying a valid coupon via PATCH /api/orders/<pk>/ does not throw NameError and calculates discount."""
        res = self.admin.patch(
            f"/api/orders/{self.order.id}/",
            {"coupon_code": "SAVE10"},
            format="json"
        )
        self.assertEqual(res.status_code, 200, res.data)
        # 10% of 300 = 30.00
        self.assertEqual(Decimal(str(res.data["coupon_discount_total"])), D("30.00"))
        # Taxable = 300 - 30 = 270.00. GST 5% = 13.50. Total = 284 (or 283.50 rounded)
        self.assertEqual(Decimal(str(res.data["taxable_amount"])), D("270.00"))
        # Verify persistence in DB
        self.order.refresh_from_db()
        self.assertEqual(self.order.coupon_discount_total, D("30.00"))
        self.assertTrue(CouponRedemption.objects.filter(order=self.order, coupon=self.coupon_valid).exists())

    def test_apply_invalid_coupon_returns_structured_error(self):
        """Applying non-existent coupon returns 400 error without leaking Python traceback."""
        res = self.admin.patch(
            f"/api/orders/{self.order.id}/",
            {"coupon_code": "NONEXISTENT999"},
            format="json"
        )
        self.assertEqual(res.status_code, 400)
        self.assertIn("detail", res.data)
        self.assertNotIn("Traceback", str(res.data))

    def test_apply_expired_coupon_returns_400(self):
        """Applying an expired coupon returns clear 400 error."""
        res = self.admin.patch(
            f"/api/orders/{self.order.id}/",
            {"coupon_code": "EXPIRED20"},
            format="json"
        )
        self.assertEqual(res.status_code, 400)
        self.assertIn("detail", res.data)

    def test_apply_inactive_coupon_returns_400(self):
        """Applying an inactive coupon returns 400 error."""
        res = self.admin.patch(
            f"/api/orders/{self.order.id}/",
            {"coupon_code": "INACTIVE15"},
            format="json"
        )
        self.assertEqual(res.status_code, 400)
        self.assertIn("detail", res.data)

    def test_apply_below_min_order_value_returns_400(self):
        """Applying coupon when qualifying subtotal is below minimum order value returns 400."""
        res = self.admin.patch(
            f"/api/orders/{self.order.id}/",
            {"coupon_code": "BIG500"},
            format="json"
        )
        self.assertEqual(res.status_code, 400)
        self.assertIn("detail", res.data)

    def test_apply_exhausted_usage_limit_returns_400(self):
        """Applying a coupon that exceeded usage limit returns 400."""
        res = self.admin.patch(
            f"/api/orders/{self.order.id}/",
            {"coupon_code": "EXHAUSTED"},
            format="json"
        )
        self.assertEqual(res.status_code, 400)
        self.assertIn("detail", res.data)

    def test_apply_new_user_coupon_eligible_customer(self):
        """First-time customer can apply new user coupon."""
        res = self.admin.patch(
            f"/api/orders/{self.order.id}/",
            {"coupon_code": "WELCOME50"},
            format="json"
        )
        self.assertEqual(res.status_code, 200, res.data)
        self.assertEqual(Decimal(str(res.data["coupon_discount_total"])), D("50.00"))

    def test_apply_two_compatible_coupons_sequentially(self):
        """First-time customer can combine New User coupon and regular coupon sequentially."""
        res = self.admin.patch(
            f"/api/orders/{self.order.id}/",
            {"coupon_codes": ["WELCOME50", "SAVE10"]},
            format="json"
        )
        self.assertEqual(res.status_code, 200, res.data)
        # Option B Sequential:
        # Subtotal: 300.00
        # 1st Coupon WELCOME50: Flat 50.00 off 300.00 -> remaining: 250.00
        # 2nd Coupon SAVE10: 10% off 250.00 -> 25.00
        # Total discount: 50 + 25 = 75.00
        self.assertEqual(Decimal(str(res.data["coupon_discount_total"])), D("75.00"))
        self.assertEqual(Decimal(str(res.data["taxable_amount"])), D("225.00"))

    def test_apply_new_user_then_apply_regular_coupon_via_separate_patches(self):
        """Applying New User coupon, then applying second eligible coupon via separate PATCH requests
        retains both coupons and does not replace the New User coupon."""
        # 1. Apply New User coupon WELCOME50
        res1 = self.admin.patch(
            f"/api/orders/{self.order.id}/",
            {"coupon_code": "WELCOME50"},
            format="json"
        )
        self.assertEqual(res1.status_code, 200)
        self.assertEqual(Decimal(str(res1.data["coupon_discount_total"])), D("50.00"))

        # 2. Apply regular coupon SAVE10 in a separate request
        res2 = self.admin.patch(
            f"/api/orders/{self.order.id}/",
            {"coupon_code": "SAVE10"},
            format="json"
        )
        self.assertEqual(res2.status_code, 200, res2.data)
        # Both coupons applied with Option B sequential discount: 50 + (10% of 250) = 75.00
        self.assertEqual(Decimal(str(res2.data["coupon_discount_total"])), D("75.00"))
        self.assertEqual(Decimal(str(res2.data["taxable_amount"])), D("225.00"))

        codes = [ac["code"] for ac in res2.data["applied_coupons"]]
        self.assertIn("WELCOME50", codes)
        self.assertIn("SAVE10", codes)
        self.assertEqual(len(codes), 2)

    def test_remove_individual_coupon_via_remove_code(self):
        """Either coupon can be removed independently using remove_code."""
        # Apply both
        self.admin.patch(
            f"/api/orders/{self.order.id}/",
            {"coupon_code": "WELCOME50"},
            format="json"
        )
        self.admin.patch(
            f"/api/orders/{self.order.id}/",
            {"coupon_code": "SAVE10"},
            format="json"
        )

        # Remove only SAVE10
        res = self.admin.patch(
            f"/api/orders/{self.order.id}/",
            {"remove_coupon": True, "remove_code": "SAVE10"},
            format="json"
        )
        self.assertEqual(res.status_code, 200)
        # WELCOME50 remains
        self.assertEqual(Decimal(str(res.data["coupon_discount_total"])), D("50.00"))
        remaining_codes = [ac["code"] for ac in res.data["applied_coupons"]]
        self.assertEqual(remaining_codes, ["WELCOME50"])

    def test_remove_new_user_coupon_recalculates_remaining_regular_coupon(self):
        """Removing the New User coupon recalculates the remaining regular coupon on the full qualifying amount."""
        # Apply both
        self.admin.patch(
            f"/api/orders/{self.order.id}/",
            {"coupon_code": "WELCOME50"},
            format="json"
        )
        self.admin.patch(
            f"/api/orders/{self.order.id}/",
            {"coupon_code": "SAVE10"},
            format="json"
        )

        # Remove WELCOME50
        res = self.admin.patch(
            f"/api/orders/{self.order.id}/",
            {"remove_coupon": True, "remove_code": "WELCOME50"},
            format="json"
        )
        self.assertEqual(res.status_code, 200)
        # SAVE10 was 10% on 300 = 30.00
        self.assertEqual(Decimal(str(res.data["coupon_discount_total"])), D("30.00"))
        self.assertEqual(Decimal(str(res.data["taxable_amount"])), D("270.00"))
        remaining_codes = [ac["code"] for ac in res.data["applied_coupons"]]
        self.assertEqual(remaining_codes, ["SAVE10"])

    def test_remove_applied_coupon(self):
        """Removing an applied coupon resets coupon_discount_total to 0 and recalculates bill."""
        # First apply
        self.admin.patch(
            f"/api/orders/{self.order.id}/",
            {"coupon_code": "SAVE10"},
            format="json"
        )
        # Now remove
        res = self.admin.patch(
            f"/api/orders/{self.order.id}/",
            {"remove_coupon": True},
            format="json"
        )
        self.assertEqual(res.status_code, 200)
        self.assertEqual(Decimal(str(res.data["coupon_discount_total"])), D("0.00"))
        self.assertEqual(Decimal(str(res.data["taxable_amount"])), D("300.00"))
        self.assertFalse(CouponRedemption.objects.filter(order=self.order).exists())

    # ------------------ TABLE CLEANING & INITIALIZATION TESTS ------------------

    def test_table_clean_guard_in_progress_orders(self):
        """Table cannot be marked clean while orders are still preparing or ready."""
        res = self.admin.post(f"/api/tables/{self.table.id}/clean/")
        self.assertEqual(res.status_code, 400)
        self.assertEqual(res.data["code"], "orders_incomplete")
        self.table.refresh_from_db()
        self.assertEqual(self.table.status, DiningTable.Status.OCCUPIED)

    def test_table_clean_success_after_served_and_completed(self):
        """Once all orders are SERVED/COMPLETED, clean action marks table AVAILABLE."""
        self.order.status = "SERVED"
        self.order.save(update_fields=["status"])

        res = self.admin.post(f"/api/tables/{self.table.id}/clean/")
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.data["status"], "AVAILABLE")
        self.table.refresh_from_db()
        self.assertEqual(self.table.status, DiningTable.Status.AVAILABLE)
        # Order transitioned to COMPLETED
        self.order.refresh_from_db()
        self.assertEqual(self.order.status, "COMPLETED")

    def test_available_table_does_not_return_completed_order(self):
        """When table is AVAILABLE, TableSerializer returns has_active_order=False and active_order_id=None."""
        self.table.status = DiningTable.Status.AVAILABLE
        self.table.save(update_fields=["status"])
        self.order.status = "COMPLETED"
        self.order.save(update_fields=["status"])

        serializer = TableSerializer(self.table)
        data = serializer.data
        self.assertFalse(data["has_active_order"])
        self.assertIsNone(data["active_order_id"])

    def test_parent_and_continuation_orders_evaluate_as_one_session(self):
        """Parent order and continuation order belong to the same session on table."""
        continuation = Order.objects.create(
            order_number="ORD-CPN-101.1",
            branch=self.branch,
            order_type="DINE_IN",
            table=self.table,
            parent_order=self.order,
            status="PREPARING",
            payment_status="PENDING",
            items_subtotal=D("150.00"),
            total_amount=D("157.50"),
        )
        serializer = TableSerializer(self.table)
        data = serializer.data
        self.assertTrue(data["has_active_order"])
        self.assertEqual(data["active_order_id"], self.order.id)

    # ------------------ KITCHEN QUEUE & PLACED STATUS TESTS ------------------

    def test_placed_to_preparing_transition_api(self):
        """Order in PLACED status can transition to PREPARING without 409 error."""
        placed_order = Order.objects.create(
            order_number="ORD-PLACED-TEST-01",
            branch=self.branch,
            order_type="DINE_IN",
            table=self.table,
            table_label="T01",
            status="PLACED",
            payment_status="UNPAID",
            items_subtotal=D("300.00"),
            total_amount=D("315.00"),
        )
        OrderItem.objects.create(
            order=placed_order,
            food_name="Biryani",
            unit_price=D("150.00"),
            quantity=2,
            line_total=D("300.00"),
            dish_discount_per_unit=D("0.00"),
            customization_per_unit=D("0.00"),
        )

        res = self.admin.post(
            f"/api/orders/{placed_order.id}/transition/",
            {"status": "PREPARING"},
            format="json"
        )
        self.assertEqual(res.status_code, 200, res.data)
        placed_order.refresh_from_db()
        self.assertEqual(placed_order.status, "PREPARING")

    def test_placed_to_cancelled_transition_api(self):
        """Order in PLACED status can be rejected/cancelled cleanly."""
        placed_order = Order.objects.create(
            order_number="ORD-PLACED-TEST-02",
            branch=self.branch,
            order_type="DINE_IN",
            table=self.table,
            table_label="T01",
            status="PLACED",
            payment_status="UNPAID",
            items_subtotal=D("300.00"),
            total_amount=D("315.00"),
        )
        OrderItem.objects.create(
            order=placed_order,
            food_name="Biryani",
            unit_price=D("150.00"),
            quantity=2,
            line_total=D("300.00"),
            dish_discount_per_unit=D("0.00"),
            customization_per_unit=D("0.00"),
        )

        res = self.admin.post(
            f"/api/orders/{placed_order.id}/reject/",
            {"scope": "INDIVIDUAL", "reason": "Test rejection of placed order"},
            format="json"
        )
        self.assertEqual(res.status_code, 200, res.data)
        placed_order.refresh_from_db()
        self.assertEqual(placed_order.status, "CANCELLED")
        self.assertEqual(placed_order.cancel_reason, "Test rejection of placed order")
