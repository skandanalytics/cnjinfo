from decimal import Decimal
from django.test import TestCase
from rest_framework.test import APIClient

from apps.accounts.models import Employee, User
from apps.branches.models import Branch, DiningTable
from apps.orders.models import Order, OrderItem
from apps.payments.models import Payment, Refund
from tests.helpers import client_for, make_branch, make_staff


class RejectionAndRefundsTestCase(TestCase):
    def setUp(self):
        self.branch = make_branch("R")
        self.table = DiningTable.objects.create(branch=self.branch, table_number="T1", capacity=4)
        
        # Staff users
        make_staff("+919600000001", "ADMIN", self.branch, code="ADR001")
        make_staff("+919600000002", "CHEF", self.branch, code="CHR001")
        make_staff("+919600000003", "WAITER", self.branch, code="WAR001")
        
        self.admin = client_for("ADR001")
        self.chef = client_for("CHR001")
        self.waiter = client_for("WAR001")

    def _create_dine_in_order(self, number="ORD-101", status="CONFIRMED", total="500.00", table=None, parent=None):
        tbl = table or self.table
        order = Order.objects.create(
            order_number=number,
            branch=self.branch,
            order_type="DINE_IN",
            table=tbl,
            status=status,
            total_amount=Decimal(total),
            parent_order=parent,
        )
        OrderItem.objects.create(
            order=order,
            food_name="Paneer Butter Masala",
            unit_price=Decimal("250.00"),
            quantity=2,
            line_total=Decimal("500.00"),
            customization_per_unit=Decimal("0.00"),
            dish_discount_per_unit=Decimal("0.00"),
        )
        if tbl:
            tbl.status = "OCCUPIED"
            tbl.save()
        return order

    def test_block_completed_or_served_rejection(self):
        """Rule: block_completed - COMPLETED and SERVED orders cannot be rejected."""
        completed_order = self._create_dine_in_order(number="ORD-C1", status="COMPLETED")
        res = self.admin.post(f"/api/orders/{completed_order.id}/reject/", {"reason": "Customer changed mind"})
        self.assertEqual(res.status_code, 400)
        self.assertIn("cannot be rejected", res.json().get("detail", ""))

        served_order = self._create_dine_in_order(number="ORD-S1", status="SERVED")
        res = self.admin.post(f"/api/orders/{served_order.id}/reject/", {"reason": "Customer left"})
        self.assertEqual(res.status_code, 400)
        self.assertIn("cannot be rejected", res.json().get("detail", ""))

    def test_unpaid_order_rejection_and_table_release(self):
        """Unpaid order rejection sets CANCELLED, NOT_APPLICABLE refund_status, releases table."""
        order = self._create_dine_in_order(number="ORD-U1", status="CONFIRMED")
        self.assertEqual(self.table.status, "OCCUPIED")

        res = self.admin.post(f"/api/orders/{order.id}/reject/", {"reason": "Test rejection"})
        self.assertEqual(res.status_code, 200)

        order.refresh_from_db()
        self.assertEqual(order.status, "CANCELLED")
        self.assertEqual(order.refund_status, Order.RefundStatus.NOT_APPLICABLE)
        
        self.table.refresh_from_db()
        self.assertEqual(self.table.status, "AVAILABLE")

    def test_paid_order_rejection_marks_refund_pending(self):
        """Paid order rejection sets CANCELLED, PENDING refund_status, table released (release_pending)."""
        order = self._create_dine_in_order(number="ORD-P1", status="CONFIRMED", total="500.00")
        Payment.objects.create(
            order=order,
            amount=Decimal("500.00"),
            status=Payment.Status.SUCCESS,
            method=Payment.Method.RAZORPAY,
            razorpay_payment_id="pay_fake123",
        )
        order.payment_status = "PAID"
        order.save()

        res = self.admin.post(f"/api/orders/{order.id}/reject/", {"reason": "Item out of stock after payment"})
        self.assertEqual(res.status_code, 200)

        order.refresh_from_db()
        self.assertEqual(order.status, "CANCELLED")
        self.assertEqual(order.refund_status, Order.RefundStatus.PENDING)
        self.assertEqual(order.refunded_amount, Decimal("0.00"))

        # Table should be released as available per release_pending rule
        self.table.refresh_from_db()
        self.assertEqual(self.table.status, "AVAILABLE")

    def test_entire_session_rejection_and_block_entire(self):
        """block_entire: entire session cannot be rejected if any order is COMPLETED/SERVED."""
        parent = self._create_dine_in_order(number="ORD-PAR", status="CONFIRMED")
        child1 = self._create_dine_in_order(number="ORD-SUB1", status="SERVED", parent=parent)

        # Entire session rejection should be blocked because child1 is SERVED
        res = self.admin.post(f"/api/orders/{parent.id}/reject/", {"scope": "ENTIRE_SESSION", "reason": "Cancel all"})
        self.assertEqual(res.status_code, 400)
        self.assertIn("Cannot reject entire session", res.json().get("detail", ""))

        # Now test successful entire session rejection when neither is completed/served
        child1.status = "PREPARING"
        child1.save()

        res2 = self.admin.post(f"/api/orders/{parent.id}/reject/", {"scope": "ENTIRE_SESSION", "reason": "Cancel all"})
        self.assertEqual(res2.status_code, 200)

        parent.refresh_from_db()
        child1.refresh_from_db()
        self.assertEqual(parent.status, "CANCELLED")
        self.assertEqual(child1.status, "CANCELLED")

        self.table.refresh_from_db()
        self.assertEqual(self.table.status, "AVAILABLE")

    def test_manual_refund_flow_and_permission_checks(self):
        """Verify permissions, partial refunds, full refund, and over-refund block."""
        order = self._create_dine_in_order(number="ORD-REF1", status="CONFIRMED", total="1000.00")
        payment = Payment.objects.create(
            order=order,
            amount=Decimal("1000.00"),
            status=Payment.Status.SUCCESS,
            method=Payment.Method.RAZORPAY,
            razorpay_payment_id="pay_fake456",
        )
        order.payment_status = "PAID"
        order.save()

        # Reject order first so it's in PENDING refund status
        self.admin.post(f"/api/orders/{order.id}/reject/", {"reason": "Quality issue"})
        order.refresh_from_db()
        self.assertEqual(order.refund_status, Order.RefundStatus.PENDING)

        # Waiter / Chef cannot confirm refund
        res_waiter = self.waiter.post(f"/api/orders/{order.id}/refund/", {"amount": 400, "method": "CASH"})
        self.assertEqual(res_waiter.status_code, 403)

        # Admin can confirm refund - First partial refund of 400
        res_refund1 = self.admin.post(f"/api/orders/{order.id}/refund/", {
            "amount": "400.00",
            "method": "RAZORPAY",
            "reference": "razorpay_dash_ref_1",
            "notes": "Partial refund via portal"
        })
        self.assertEqual(res_refund1.status_code, 201)
        
        order.refresh_from_db()
        self.assertEqual(order.refund_status, Order.RefundStatus.PARTIALLY_REFUNDED)
        self.assertEqual(order.refunded_amount, Decimal("400.00"))

        # Over-refund attempt: trying to refund 700 when only 600 remains
        res_over = self.admin.post(f"/api/orders/{order.id}/refund/", {
            "amount": "700.00",
            "method": "CASH"
        })
        self.assertEqual(res_over.status_code, 400)
        self.assertIn("exceeds remaining refundable amount", res_over.json().get("detail", ""))

        # Second partial refund of remaining 600 -> FULLY_REFUNDED
        res_refund2 = self.admin.post(f"/api/orders/{order.id}/refund/", {
            "amount": "600.00",
            "method": "CASH",
            "notes": "Cash returned for remaining amount"
        })
        self.assertEqual(res_refund2.status_code, 201)

        order.refresh_from_db()
        self.assertEqual(order.refund_status, Order.RefundStatus.FULLY_REFUNDED)
        self.assertEqual(order.refunded_amount, Decimal("1000.00"))
        self.assertEqual(order.payment_status, "REFUNDED")

        # Check refund list API
        res_list = self.admin.get(f"/api/orders/{order.id}/refunds/")
        self.assertEqual(res_list.status_code, 200)
        refunds = res_list.json().get("refunds", [])
        self.assertEqual(len(refunds), 2)
        self.assertEqual(Decimal(str(refunds[0]["amount"])), Decimal("600.00"))
        self.assertEqual(Decimal(str(refunds[1]["amount"])), Decimal("400.00"))

    def test_record_failed_refund_attempt(self):
        """Record a failed refund attempt without altering refunded_amount."""
        order = self._create_dine_in_order(number="ORD-FAIL1", status="CONFIRMED", total="300.00")
        Payment.objects.create(
            order=order,
            amount=Decimal("300.00"),
            status=Payment.Status.SUCCESS,
            method=Payment.Method.CARD,
        )
        order.payment_status = "PAID"
        order.save()
        self.admin.post(f"/api/orders/{order.id}/reject/", {"reason": "Cancelled"})

        # Record failed attempt
        res = self.admin.post(f"/api/orders/{order.id}/refund/", {
            "amount": "300.00",
            "method": "CARD",
            "is_failed": True,
            "reason": "Terminal connection timeout"
        })
        self.assertEqual(res.status_code, 201)

        order.refresh_from_db()
        self.assertEqual(order.refund_status, Order.RefundStatus.FAILED)
        self.assertEqual(order.refunded_amount, Decimal("0.00"))
        self.assertEqual(order.payment_status, "PAID")
