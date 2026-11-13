"""Tests for Table Active Order & Session Retrieval:
1. Occupied table with active orders (PENDING, PREPARING, READY, SERVED) returns root order.
2. Occupied table with parent + continuation suborders returns root order ID.
3. Occupied table with completed session (billed/paid, awaiting cleaning) returns completed session order.
4. Available table returns active_order_id=None (does not leak past closed orders).
5. Cancelled/rejected orders are excluded and cannot be reopened as active.
6. Table cleaned resets table to AVAILABLE and clears active order.
"""
from decimal import Decimal
from django.test import TestCase
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.branches.models import Branch, DiningTable
from apps.branches.serializers import TableSerializer
from apps.orders.models import Order
from tests.helpers import client_for, make_branch, make_staff

D = Decimal


class TableActiveOrderRetrievalTestCase(TestCase):
    def setUp(self):
        self.branch = make_branch("TAB")
        self.table = DiningTable.objects.create(
            branch=self.branch, table_number="T01", capacity=4, status="AVAILABLE"
        )
        self.table_occupied = DiningTable.objects.create(
            branch=self.branch, table_number="T03", capacity=4, status="OCCUPIED"
        )

        make_staff("+919700000088", "ADMIN", self.branch, code="ADT001")
        self.admin = client_for("ADT001")

    def test_occupied_table_with_in_progress_order(self):
        """When an order is PREPARING, TableSerializer returns has_active_order=True and active_order_id."""
        order = Order.objects.create(
            order_number="ORD-LIVE-1",
            branch=self.branch,
            order_type="DINE_IN",
            table=self.table_occupied,
            status="PREPARING",
            payment_status="PENDING",
            total_amount=D("500.00"),
        )
        serializer = TableSerializer(self.table_occupied)
        data = serializer.data
        self.assertTrue(data["has_active_order"])
        self.assertEqual(data["active_order_id"], order.id)
        self.assertEqual(data["active_order"]["id"], order.id)
        self.assertEqual(data["active_order"]["status"], "PREPARING")

    def test_occupied_table_with_continuations_returns_root(self):
        """When parent and continuation suborders exist, active_order_id returns root order."""
        parent = Order.objects.create(
            order_number="ORD-ROOT-1",
            branch=self.branch,
            order_type="DINE_IN",
            table=self.table_occupied,
            status="SERVED",
            payment_status="PENDING",
            total_amount=D("600.00"),
        )
        continuation = Order.objects.create(
            order_number="ORD-CONT-1",
            branch=self.branch,
            order_type="DINE_IN",
            table=self.table_occupied,
            status="PREPARING",
            payment_status="PENDING",
            total_amount=D("200.00"),
            parent_order=parent,
        )
        serializer = TableSerializer(self.table_occupied)
        data = serializer.data
        self.assertTrue(data["has_active_order"])
        self.assertEqual(data["active_order_id"], parent.id)
        self.assertEqual(data["active_order"]["id"], parent.id)

    def test_occupied_table_with_completed_session_returns_completed_order(self):
        """When an order has proceeded to bill / completed but the table has not been cleaned yet,
        active_order_id returns the completed session order so staff can view invoice/details."""
        order = Order.objects.create(
            order_number="ORD-COMP-1",
            branch=self.branch,
            order_type="DINE_IN",
            table=self.table_occupied,
            status="COMPLETED",
            payment_status="PAID",
            total_amount=D("450.00"),
        )
        serializer = TableSerializer(self.table_occupied)
        data = serializer.data
        self.assertTrue(data["has_active_order"])
        self.assertEqual(data["active_order_id"], order.id)
        self.assertEqual(data["active_order"]["id"], order.id)
        self.assertEqual(data["active_order"]["status"], "COMPLETED")

    def test_available_table_does_not_return_past_closed_orders(self):
        """An available table must return active_order_id=None even if historical completed orders exist."""
        past_order = Order.objects.create(
            order_number="ORD-PAST-1",
            branch=self.branch,
            order_type="DINE_IN",
            table=self.table,  # status is AVAILABLE
            status="COMPLETED",
            payment_status="PAID",
            total_amount=D("300.00"),
        )
        serializer = TableSerializer(self.table)
        data = serializer.data
        self.assertFalse(data["has_active_order"])
        self.assertIsNone(data["active_order_id"])
        self.assertIsNone(data["active_order"])

    def test_cancelled_order_cannot_be_reopened_as_active(self):
        """Cancelled orders are excluded and do not count as active sessions."""
        cancelled = Order.objects.create(
            order_number="ORD-CANC-1",
            branch=self.branch,
            order_type="DINE_IN",
            table=self.table_occupied,
            status="CANCELLED",
            payment_status="REFUNDED",
            total_amount=D("350.00"),
        )
        serializer = TableSerializer(self.table_occupied)
        data = serializer.data
        self.assertFalse(data["has_active_order"])
        self.assertIsNone(data["active_order_id"])
        self.assertIsNone(data["active_order"])

    def test_clean_table_resets_status_and_clears_active_order(self):
        """Calling table clean action resets status to AVAILABLE and clears active_order."""
        order = Order.objects.create(
            order_number="ORD-CLEAN-1",
            branch=self.branch,
            order_type="DINE_IN",
            table=self.table_occupied,
            status="SERVED",
            payment_status="PAID",
            total_amount=D("400.00"),
        )
        # Call clean endpoint
        res = self.admin.post(f"/api/tables/{self.table_occupied.id}/clean/")
        self.assertEqual(res.status_code, 200)
        self.table_occupied.refresh_from_db()
        self.assertEqual(self.table_occupied.status, "AVAILABLE")

        serializer = TableSerializer(self.table_occupied)
        data = serializer.data
        self.assertFalse(data["has_active_order"])
        self.assertIsNone(data["active_order_id"])
        self.assertIsNone(data["active_order"])

