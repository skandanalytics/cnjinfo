from decimal import Decimal

from django.conf import settings
from django.core.exceptions import ValidationError
from django.core.validators import MinValueValidator
from django.db import models

MONEY = dict(max_digits=12, decimal_places=2, validators=[MinValueValidator(Decimal("0"))])


class Coupon(models.Model):
    """Promo voucher (SRS 3.2.7): code, discount value, minimum order value, validity period."""

    class Type(models.TextChoices):
        PERCENT = "PERCENT", "Percent"
        FLAT = "FLAT", "Flat amount"

    branch = models.ForeignKey("branches.Branch", on_delete=models.PROTECT, related_name="coupons")
    code = models.CharField(max_length=50)
    description = models.CharField(max_length=255, blank=True)
    discount_type = models.CharField(max_length=10, choices=Type.choices)
    discount_value = models.DecimalField(**MONEY)
    min_order_value = models.DecimalField(default=Decimal("0"), **MONEY)
    max_discount = models.DecimalField(null=True, blank=True, **MONEY)
    valid_from = models.DateTimeField()
    valid_to = models.DateTimeField()
    usage_limit = models.PositiveIntegerField(null=True, blank=True)
    # First-time-customer coupon: auto-applied to first-time customers when the cart exceeds min_order_value.
    is_first_time_auto = models.BooleanField(default=False)
    # Admin toggle: apply this coupon automatically when the order qualifies. No code entry required.
    auto_apply = models.BooleanField(default=False)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "coupons"
        constraints = [
            models.UniqueConstraint(fields=["branch", "code"], name="uq_coupon_branch_code"),
            models.CheckConstraint(condition=models.Q(valid_to__gt=models.F("valid_from")), name="ck_coupon_dates"),
        ]
        indexes = [models.Index(fields=["branch", "is_active", "valid_from", "valid_to"])]

    def clean(self):
        if self.discount_type == self.Type.PERCENT and self.discount_value > 100:
            raise ValidationError({"discount_value": "Percent discount cannot exceed 100."})

    def __str__(self):
        return self.code


class CouponRedemption(models.Model):
    """History of coupon use; also the source of used-count, so it cannot drift."""

    coupon = models.ForeignKey(Coupon, on_delete=models.SET_NULL, null=True, blank=True, related_name="redemptions")
    coupon_code = models.CharField(max_length=50, blank=True)  # snapshot; kept after the coupon is deleted
    order = models.ForeignKey("orders.Order", on_delete=models.PROTECT, related_name="coupon_redemptions")
    customer = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True,
                                 related_name="+")
    discount_amount = models.DecimalField(**MONEY)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "coupon_redemptions"
        constraints = [models.UniqueConstraint(fields=["coupon", "order"], name="uq_redemption_coupon_order")]
        indexes = [models.Index(fields=["coupon", "customer"])]
