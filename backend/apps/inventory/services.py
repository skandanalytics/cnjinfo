"""Stock changes. Every function locks the inventory row (SELECT ... FOR UPDATE) and writes a ledger row, so
concurrent orders can never drive stock negative and an order can never deduct (or restore) twice."""
from collections import defaultdict

from django.db import transaction

from .models import InventoryItem, StockTransaction

T = StockTransaction.Type


class InsufficientStock(Exception):
    def __init__(self, food_name, available, requested):
        super().__init__(f"Only {available} of '{food_name}' left (requested {requested}).")
        self.food_name, self.available, self.requested = food_name, available, requested


def _ledger(item, kind, change, user=None, order=None, note=""):
    return StockTransaction.objects.create(item=item, transaction_type=kind, quantity_change=change,
                                           balance_after=item.quantity, order=order, performed_by=user, note=note)


@transaction.atomic
def set_initial_stock(item, user=None):
    if item.quantity:
        _ledger(item, T.ADJUSTMENT, item.quantity, user, note="Initial stock")


@transaction.atomic
def restock(item_id, quantity, user=None, note=""):
    if quantity <= 0:
        raise ValueError("Restock quantity must be positive.")
    item = InventoryItem.objects.select_for_update().get(pk=item_id)
    item.quantity += quantity
    item.save(update_fields=["quantity", "updated_at"])
    _ledger(item, T.RESTOCK, quantity, user, note=note)
    return item


@transaction.atomic
def adjust(item_id, new_quantity, user=None, note=""):
    if new_quantity < 0:
        raise ValueError("Stock cannot be negative.")
    item = InventoryItem.objects.select_for_update().get(pk=item_id)
    delta = new_quantity - item.quantity
    if delta:
        item.quantity = new_quantity
        item.save(update_fields=["quantity", "updated_at"])
        _ledger(item, T.ADJUSTMENT, delta, user, note=note)
    return item


def _order_quantities(order):
    totals = defaultdict(int)
    for line in order.items.all():
        totals[line.food_id] += line.quantity
    return dict(sorted(totals.items()))  # fixed lock order avoids deadlocks between concurrent orders


@transaction.atomic
def deduct_for_order(order):
    """Deduct stock for every tracked dish in the order. Idempotent per order. Dishes without an inventory
    record are untracked (unlimited). Raises InsufficientStock (and rolls everything back) if any is short."""
    for food_id, qty in _order_quantities(order).items():
        item = InventoryItem.objects.select_for_update().select_related("food").filter(food_id=food_id).first()
        if item is None:
            continue
        if StockTransaction.objects.filter(item=item, order=order, transaction_type=T.ORDER_DEDUCTION).exists():
            continue  # already deducted for this order
        if item.quantity < qty:
            raise InsufficientStock(item.food.name, item.quantity, qty)
        item.quantity -= qty
        item.save(update_fields=["quantity", "updated_at"])
        _ledger(item, T.ORDER_DEDUCTION, -qty, order=order)


@transaction.atomic
def restore_for_order(order):
    """Give stock back (order cancelled/rejected/payment failed). Only restores what was actually deducted, once."""
    for food_id, qty in _order_quantities(order).items():
        item = InventoryItem.objects.select_for_update().filter(food_id=food_id).first()
        if item is None:
            continue
        deducted = StockTransaction.objects.filter(item=item, order=order, transaction_type=T.ORDER_DEDUCTION)
        restored = StockTransaction.objects.filter(item=item, order=order, transaction_type=T.ORDER_RESTORE)
        if not deducted.exists() or restored.exists():
            continue
        item.quantity += qty
        item.save(update_fields=["quantity", "updated_at"])
        _ledger(item, T.ORDER_RESTORE, qty, order=order)
