from django.conf import settings
from django.core.validators import MinValueValidator
from django.db import models


class Cart(models.Model):
    """Server-side cart. Guests are identified by an opaque guest_token; customers by user."""

    class Status(models.TextChoices):
        ACTIVE = "ACTIVE", "Active"
        MERGED = "MERGED", "Merged into another cart"
        CONVERTED = "CONVERTED", "Converted to order"
        ABANDONED = "ABANDONED", "Abandoned"

    class OrderType(models.TextChoices):
        DINE_IN = "DINE_IN", "Dine-In"
        TAKEAWAY = "TAKEAWAY", "Takeaway"

    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, null=True, blank=True,
                             related_name="carts")
    guest_token = models.CharField(max_length=64, null=True, blank=True, db_index=True)
    branch = models.ForeignKey("branches.Branch", on_delete=models.PROTECT, related_name="carts")
    table = models.ForeignKey("branches.DiningTable", on_delete=models.SET_NULL, null=True, blank=True,
                              related_name="carts")
    order_type = models.CharField(max_length=10, choices=OrderType.choices, default=OrderType.DINE_IN)
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.ACTIVE)
    coupons = models.ManyToManyField("coupons.Coupon", blank=True, related_name="carts")
    # Set when the customer removes an automatically applied coupon for this cart.
    skip_auto_coupons = models.BooleanField(default=False)
    # MySQL has no partial unique indexes. active_slot = "<owner>:<branch>" while ACTIVE, NULL otherwise;
    # its UNIQUE constraint guarantees at most one active cart per owner and branch.
    active_slot = models.CharField(max_length=120, null=True, blank=True, unique=True, editable=False)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "carts"
        constraints = [
            models.CheckConstraint(condition=models.Q(user__isnull=False) | models.Q(guest_token__isnull=False),
                                   name="ck_cart_has_owner"),
        ]

    def save(self, *args, **kwargs):
        if self.status == self.Status.ACTIVE:
            owner = f"u{self.user_id}" if self.user_id else f"g{self.guest_token}"
            self.active_slot = f"{owner}:{self.branch_id}"
        else:
            self.active_slot = None
        super().save(*args, **kwargs)


class CartItem(models.Model):
    """Prices are not stored: they are recomputed by the pricing service on every read."""

    cart = models.ForeignKey(Cart, on_delete=models.CASCADE, related_name="items")
    food = models.ForeignKey("menu.Food", on_delete=models.PROTECT, related_name="cart_items")
    quantity = models.PositiveIntegerField(validators=[MinValueValidator(1)])
    options = models.ManyToManyField("menu.CustomizationOption", blank=True, related_name="cart_items")
    special_instructions = models.CharField(max_length=500, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "cart_items"
        indexes = [models.Index(fields=["cart", "food"])]
        constraints = [models.CheckConstraint(condition=models.Q(quantity__gte=1), name="ck_cartitem_qty_pos")]
