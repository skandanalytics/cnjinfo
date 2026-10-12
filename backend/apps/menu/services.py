"""Hard deletion of dishes. Order items keep their name and price snapshot (food becomes NULL), the stock
ledger keeps its rows (item becomes NULL), and cart lines, images, options, discounts and stock rows go."""
from django.db import transaction

from apps.orders.models import Order, OrderItem

from .models import FoodImage


def foods_in_active_orders(foods):
    return OrderItem.objects.filter(food__in=foods, order__status__in=Order.ACTIVE_STATUSES).exists()


def delete_foods(foods):
    """Delete the given Food queryset. Call inside a transaction. Image files are removed after commit."""
    images = list(FoodImage.objects.filter(food__in=foods))
    storage_paths = [(img.image.storage, img.image.name) for img in images if img.image]
    count = foods.count()
    foods.delete()

    def remove_files():
        for storage, name in storage_paths:
            if not FoodImage.objects.filter(image=name).exists():
                storage.delete(name)

    transaction.on_commit(remove_files)
    return count
