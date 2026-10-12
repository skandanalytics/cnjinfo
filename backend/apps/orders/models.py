from decimal import Decimal

from django.conf import settings
from django.core.validators import MinValueValidator
from django.db import models

MONEY = dict(max_digits=12, decimal_places=2, default=Decimal("0"), validators=[MinValueValidator(Decimal("0"))])


class Order(models.Model):
    class Type(models.TextChoices):
        DINE_IN = "DINE_IN", "Dine-In"
        TAKEAWAY = "TAKEAWAY", "Takeaway"

    # Canonical statuses (decision Q2: Accept moves PENDING -> PREPARING). Transitions are enforced in the service layer.
    class Status(models.TextChoices):
        PENDING = "PENDING", "Pending"
        PREPARING = "PREPARING", "Preparing"
        READY = "READY", "Ready"
        SERVED = "SERVED", "Served"
        COMPLETED = "COMPLETED", "Completed"
        CANCELLED = "CANCELLED", "Cancelled"

    # Orders that still occupy a table / kitchen.
    ACTIVE_STATUSES = (Status.PENDING, Status.PREPARING, Status.READY, Status.SERVED)

    class PaymentStatus(models.TextChoices):  # independent of order status
        UNPAID = "UNPAID", "Unpaid"
        PENDING = "PENDING", "Payment pending"
        PAID = "PAID", "Paid"
        FAILED = "FAILED", "Failed"
        REFUNDED = "REFUNDED", "Refunded"

    class Source(models.TextChoices):
        CUSTOMER = "CUSTOMER", "Customer"
        EMPLOYEE = "EMPLOYEE", "Employee-assisted"

    order_number = models.CharField(max_length=30, unique=True)
    # Branch, table and staff references become NULL when that record is deleted; the snapshots keep the history.
    branch = models.ForeignKey("branches.Branch", on_delete=models.SET_NULL, null=True, blank=True,
                               related_name="orders")
    branch_name = models.CharField(max_length=255, blank=True)  # snapshot
    customer = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, null=True, blank=True,
                                 related_name="orders")
    customer_phone = models.CharField(max_length=20, blank=True)  # snapshot; empty for anonymous takeaway
    table = models.ForeignKey("branches.DiningTable", on_delete=models.SET_NULL, null=True, blank=True,
                              related_name="orders")
    table_label = models.CharField(max_length=60, blank=True)  # snapshot
    order_type = models.CharField(max_length=10, choices=Type.choices)
    source = models.CharField(max_length=10, choices=Source.choices, default=Source.CUSTOMER)
    placed_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True,
                                  related_name="placed_orders")  # employee who took an assisted order
    placed_by_name = models.CharField(max_length=255, blank=True)  # snapshot
    accepted_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True,
                                    related_name="accepted_orders")
    status = models.CharField(max_length=12, choices=Status.choices, default=Status.PENDING)
    payment_status = models.CharField(max_length=10, choices=PaymentStatus.choices, default=PaymentStatus.UNPAID)
    number_of_diners = models.PositiveSmallIntegerField(null=True, blank=True)
    special_instructions = models.CharField(max_length=500, blank=True)
    cancel_reason = models.CharField(max_length=255, blank=True)

    # Price snapshot, computed by the server-side pricing service and never recomputed afterwards.
    items_subtotal = models.DecimalField(**MONEY)       # base price x qty
    customization_total = models.DecimalField(**MONEY)
    dish_discount_total = models.DecimalField(**MONEY)
    coupon_discount_total = models.DecimalField(**MONEY)
    takeaway_charge = models.DecimalField(**MONEY)
    taxable_amount = models.DecimalField(**MONEY)
    gst_rate = models.DecimalField(max_digits=5, decimal_places=2, default=Decimal("0"))
    gst_amount = models.DecimalField(**MONEY)
    service_charge_rate = models.DecimalField(max_digits=5, decimal_places=2, default=Decimal("0"))
    service_charge_amount = models.DecimalField(**MONEY)
    round_off = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal("0"))
    total_amount = models.DecimalField(**MONEY)

    # Client-supplied key; a repeated checkout request with the same key returns the original order.
    idempotency_key = models.CharField(max_length=64, null=True, blank=True, unique=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    completed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = "orders"
        ordering = ["-id"]
        indexes = [
            models.Index(fields=["branch", "status", "created_at"]),
            models.Index(fields=["branch", "payment_status"]),
            models.Index(fields=["customer", "created_at"]),
            models.Index(fields=["placed_by", "created_at"]),
            models.Index(fields=["table", "status"]),
        ]
        constraints = [
            # A dine-in order keeps its table label after the table itself is deleted.
            models.CheckConstraint(
                condition=((models.Q(order_type="DINE_IN") & (models.Q(table__isnull=False) | ~models.Q(table_label="")))
                           | models.Q(order_type="TAKEAWAY", table__isnull=True)),
                name="ck_order_table_matches_type"),
        ]

    def __str__(self):
        return self.order_number


class OrderItem(models.Model):
    """Historical line: name and prices are copied at order time so later menu edits never change old orders."""

    order = models.ForeignKey(Order, on_delete=models.PROTECT, related_name="items")
    food = models.ForeignKey("menu.Food", on_delete=models.SET_NULL, null=True, blank=True,
                             related_name="order_items")
    food_name = models.CharField(max_length=255)
    unit_price = models.DecimalField(max_digits=12, decimal_places=2)             # base price at order time
    customizations = models.JSONField(default=list, blank=True)                    # [{"name":..,"extra_price":..}]
    customization_per_unit = models.DecimalField(**MONEY)
    dish_discount_per_unit = models.DecimalField(**MONEY)
    quantity = models.PositiveIntegerField(validators=[MinValueValidator(1)])
    line_total = models.DecimalField(**MONEY)
    special_instructions = models.CharField(max_length=500, blank=True)

    class Meta:
        db_table = "order_items"
        constraints = [models.CheckConstraint(condition=models.Q(quantity__gte=1), name="ck_orderitem_qty_pos")]


class OrderStatusHistory(models.Model):
    order = models.ForeignKey(Order, on_delete=models.PROTECT, related_name="status_history")
    from_status = models.CharField(max_length=12, blank=True)
    to_status = models.CharField(max_length=12)
    changed_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True,
                                   related_name="+")
    note = models.CharField(max_length=255, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "order_status_history"
        ordering = ["id"]
        indexes = [models.Index(fields=["order", "created_at"])]
