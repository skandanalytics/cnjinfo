from django.conf import settings
from django.db import models


class InventoryItem(models.Model):
    """Stock for one dish. Status is derived, never stored, so it cannot drift from quantity."""

    class Status(models.TextChoices):
        IN_STOCK = "IN_STOCK", "In Stock"
        LOW_STOCK = "LOW_STOCK", "Low Stock"
        OUT_OF_STOCK = "OUT_OF_STOCK", "Out of Stock"

    branch = models.ForeignKey("branches.Branch", on_delete=models.PROTECT, related_name="inventory")
    food = models.OneToOneField("menu.Food", on_delete=models.CASCADE, related_name="inventory")
    quantity = models.PositiveIntegerField(default=0)
    low_stock_threshold = models.PositiveIntegerField(default=5)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "inventory_items"
        indexes = [models.Index(fields=["branch", "quantity"])]
        constraints = [models.CheckConstraint(condition=models.Q(quantity__gte=0), name="ck_inventory_qty_nonneg")]

    @property
    def status(self):
        if self.quantity <= 0:
            return self.Status.OUT_OF_STOCK
        if self.quantity <= self.low_stock_threshold:
            return self.Status.LOW_STOCK
        return self.Status.IN_STOCK


class StockTransaction(models.Model):
    """Append-only ledger of every stock change."""

    class Type(models.TextChoices):
        RESTOCK = "RESTOCK", "Restock"
        ADJUSTMENT = "ADJUSTMENT", "Adjustment"
        ORDER_DEDUCTION = "ORDER_DEDUCTION", "Order deduction"
        ORDER_RESTORE = "ORDER_RESTORE", "Order restore"

    # The ledger outlives the stock row: deleting a dish removes its InventoryItem and leaves item NULL here.
    item = models.ForeignKey(InventoryItem, on_delete=models.SET_NULL, null=True, blank=True,
                             related_name="transactions")
    food_name = models.CharField(max_length=255, blank=True)  # snapshot
    transaction_type = models.CharField(max_length=20, choices=Type.choices)
    quantity_change = models.IntegerField()
    balance_after = models.PositiveIntegerField()
    order = models.ForeignKey("orders.Order", on_delete=models.PROTECT, null=True, blank=True,
                              related_name="stock_transactions")
    performed_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True,
                                     related_name="+")
    note = models.CharField(max_length=255, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "stock_transactions"
        indexes = [models.Index(fields=["item", "created_at"])]
        constraints = [
            # An order can deduct (and restore) a given item at most once -> prevents duplicate deductions.
            models.UniqueConstraint(fields=["item", "order", "transaction_type"], name="uq_stock_item_order_type"),
        ]
