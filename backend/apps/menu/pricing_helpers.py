"""Dish-level price and availability rules shared by the menu API, cart and the pricing service."""
from decimal import ROUND_HALF_UP, Decimal

from django.utils import timezone

from .models import DishDiscount

CENT = Decimal("0.01")


def money(value):
    return Decimal(value).quantize(CENT, rounding=ROUND_HALF_UP)


def unit_discount(base_price, discount):
    """Discount amount per unit on the dish's base price (customizations are never discounted)."""
    if discount.discount_type == DishDiscount.Type.PERCENT:
        amount = money(base_price * discount.value / 100)
    else:
        amount = money(discount.value)
    return min(amount, money(base_price))


def current_discount(food, now=None):
    """The single discount applied to the dish right now: the best active one in its validity window.
    Discounts never stack (creation rules also prevent overlapping active windows)."""
    now = now or timezone.now()
    best, best_amount = None, Decimal("0")
    for d in food.discounts.all():
        if d.is_active and d.valid_from <= now <= d.valid_to:
            amount = unit_discount(food.price, d)
            if amount > best_amount:
                best, best_amount = d, amount
    return best, best_amount


def inventory_of(food):
    return getattr(food, "inventory", None)  # None when the dish has no stock record (untracked)


def stock_status(food):
    inv = inventory_of(food)
    return inv.status if inv else None


def is_orderable(food):
    """Visible, not manually sold out, and (if stock is tracked) in stock."""
    if not food.is_active or food.is_sold_out:
        return False
    inv = inventory_of(food)
    return inv is None or inv.quantity > 0
