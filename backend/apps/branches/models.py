import uuid
from decimal import Decimal

from django.core.validators import MinValueValidator
from django.db import models

MONEY = dict(max_digits=12, decimal_places=2)
RATE = dict(max_digits=5, decimal_places=2, validators=[MinValueValidator(Decimal("0"))])


class Branch(models.Model):
    """A restaurant location. Deleting one goes through branches.services.delete_branch, which removes its
    configuration and keeps orders, payments and invoices with snapshots."""

    name = models.CharField(max_length=255)
    code = models.CharField(max_length=30, unique=True)
    address = models.TextField()
    contact_number = models.CharField(max_length=30, blank=True)
    email = models.EmailField(max_length=254, blank=True, default="")
    city = models.CharField(max_length=100, blank=True, default="")
    manager_name = models.CharField(max_length=255, blank=True)
    opening_hours = models.CharField(max_length=100, blank=True, default="")
    cover_image_url = models.URLField(max_length=1000, blank=True, default="")
    is_primary = models.BooleanField(default=False)  # at most one branch is the main headquarters
    configured_table_count = models.PositiveIntegerField(
        default=0, help_text="Planned table count. Existing dining tables are never deleted when this changes.")
    is_active = models.BooleanField(default=True)

    # Tax and charge configuration. The SRS gives no rates, so they default to 0 until configured by an admin.
    gst_rate = models.DecimalField(default=Decimal("5"), help_text="GST percent on the taxable amount.", **RATE)
    service_charge_rate = models.DecimalField(default=Decimal("0"), help_text="Service charge percent.", **RATE)
    takeaway_charge = models.DecimalField(default=Decimal("0"), help_text="Flat takeaway charge per order.",
                                          max_digits=12, decimal_places=2,
                                          validators=[MinValueValidator(Decimal("0"))])

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "branches"
        indexes = [models.Index(fields=["is_active", "name"])]
        constraints = [models.UniqueConstraint(
            fields=["is_primary"], condition=models.Q(is_primary=True), name="uq_one_primary_branch")]

    def __str__(self):
        return self.name


class RestaurantSetting(models.Model):
    """One row for restaurant-wide switches. Existing table QR codes are kept; this only controls whether they are used."""

    qr_enabled = models.BooleanField(default=True)
    card_enabled = models.BooleanField(default=True, help_text="Enable or disable Card/Swipe payments across POS and Checkout.")

    class Meta:
        db_table = "restaurant_settings"

    def __str__(self):
        return "Restaurant settings"


def qr_ordering_enabled():
    row, _ = RestaurantSetting.objects.get_or_create(pk=1, defaults={"qr_enabled": True, "card_enabled": True})
    return bool(row.qr_enabled)


def card_payment_enabled():
    row, _ = RestaurantSetting.objects.get_or_create(pk=1, defaults={"qr_enabled": True, "card_enabled": True})
    return bool(getattr(row, "card_enabled", True))


class DiningTable(models.Model):
    class Status(models.TextChoices):
        AVAILABLE = "AVAILABLE", "Available"
        RESERVED = "RESERVED", "Reserved"
        OCCUPIED = "OCCUPIED", "Occupied"

    branch = models.ForeignKey(Branch, on_delete=models.PROTECT, related_name="tables")
    table_number = models.CharField(max_length=30)
    capacity = models.PositiveSmallIntegerField(validators=[MinValueValidator(1)])
    location = models.CharField(max_length=100, blank=True)
    table_view = models.ForeignKey(
        "TableView", on_delete=models.SET_NULL, null=True, blank=True, related_name="tables")
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.AVAILABLE)
    is_active = models.BooleanField(default=True)
    # Opaque identifier embedded in the QR URL. Resolved and validated server-side.
    qr_code = models.UUIDField(default=uuid.uuid4, unique=True, editable=False)
    qr_is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "dining_tables"
        constraints = [models.UniqueConstraint(fields=["branch", "table_number"], name="uq_table_branch_number")]
        indexes = [models.Index(fields=["branch", "status"])]

    def __str__(self):
        return f"{self.branch.code}-{self.table_number}"


class TableView(models.Model):
    """A configurable floor or area. Tables in one view stay on the same branch."""

    branch = models.ForeignKey(Branch, on_delete=models.PROTECT, related_name="table_views")
    name = models.CharField(max_length=100)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "table_views"
        constraints = [models.UniqueConstraint(fields=["branch", "name"], name="uq_table_view_branch_name")]
        ordering = ["name"]

    def __str__(self):
        return self.name
