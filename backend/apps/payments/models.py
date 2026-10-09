from decimal import Decimal

from django.conf import settings
from django.core.validators import MinValueValidator
from django.db import models


class Payment(models.Model):
    """One row per payment attempt. At most one attempt per order may be SUCCESS (see success_slot)."""

    class Method(models.TextChoices):
        UPI = "UPI", "UPI"
        CARD = "CARD", "Card"
        NETBANKING = "NETBANKING", "Netbanking"
        WALLET = "WALLET", "Wallet"
        COUNTER = "COUNTER", "Pay on Counter"

    class Status(models.TextChoices):
        CREATED = "CREATED", "Created"
        PENDING = "PENDING", "Pending"
        SUCCESS = "SUCCESS", "Successful"
        FAILED = "FAILED", "Failed"
        CANCELLED = "CANCELLED", "Cancelled"
        REFUNDED = "REFUNDED", "Refunded"

    order = models.ForeignKey("orders.Order", on_delete=models.PROTECT, related_name="payments")
    method = models.CharField(max_length=10, choices=Method.choices)
    amount = models.DecimalField(max_digits=12, decimal_places=2, validators=[MinValueValidator(Decimal("0"))])
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.CREATED)
    razorpay_order_id = models.CharField(max_length=64, null=True, blank=True, unique=True)
    razorpay_payment_id = models.CharField(max_length=64, null=True, blank=True, unique=True)
    razorpay_signature = models.CharField(max_length=255, blank=True)
    failure_reason = models.CharField(max_length=255, blank=True)
    recorded_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True,
                                    related_name="+")  # staff who recorded a counter payment
    paid_at = models.DateTimeField(null=True, blank=True)
    # MySQL has no partial unique index: set to the order id while SUCCESS, NULL otherwise.
    success_slot = models.BigIntegerField(null=True, blank=True, unique=True, editable=False)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "payments"
        indexes = [models.Index(fields=["order", "status"])]

    def save(self, *args, **kwargs):
        self.success_slot = self.order_id if self.status == self.Status.SUCCESS else None
        super().save(*args, **kwargs)


class PaymentEvent(models.Model):
    """Webhook/callback log. event_id is unique so a replayed webhook is detected and ignored."""

    payment = models.ForeignKey(Payment, on_delete=models.PROTECT, null=True, blank=True, related_name="events")
    event_id = models.CharField(max_length=100, unique=True)
    event_type = models.CharField(max_length=100)
    payload = models.JSONField(default=dict)
    signature_valid = models.BooleanField(default=False)
    processed_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "payment_events"
