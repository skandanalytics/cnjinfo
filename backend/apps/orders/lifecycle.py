"""Create orders from a validated cart and move them through the status machine.

Accept means PENDING -> PREPARING (decision Q2). Stock is deducted when the order is created and given back
when it is cancelled (decision Q8). A table is marked OCCUPIED on a dine-in order and is released on cancel
only when no other unfinished order still uses it. Completing an order does not vacate the table; staff do that.
"""
from uuid import uuid4

from django.db import IntegrityError, transaction
from django.utils import timezone

from apps.accounts.models import User
from apps.branches.models import DiningTable
from apps.carts.models import Cart
from apps.carts.services import evaluate
from apps.coupons.services import CouponError, redeem
from apps.inventory.services import InsufficientStock, deduct_for_order, restore_for_order

from .models import Order, OrderItem, OrderStatusHistory
from .pricing import PricingError, price_order
from .realtime import publish_order_event

# status -> statuses it may move to
TRANSITIONS = {
    Order.Status.PENDING: {Order.Status.PREPARING, Order.Status.CANCELLED},
    Order.Status.PREPARING: {Order.Status.READY, Order.Status.CANCELLED},
    Order.Status.READY: {Order.Status.SERVED},
    Order.Status.SERVED: {Order.Status.COMPLETED},
}
TERMINAL = {Order.Status.COMPLETED, Order.Status.CANCELLED}


class OrderError(Exception):
    def __init__(self, detail, code="order_error", status=400):
        super().__init__(detail)
        self.detail, self.code, self.http_status = detail, code, status


def _lines_of(cart):
    from apps.orders.pricing import Line
    return [Line(i.food_id, i.quantity, [o.pk for o in i.options.all()], i.special_instructions)
            for i in cart.items.prefetch_related("options")]


def _occupy(table):
    table = DiningTable.objects.select_for_update().get(pk=table.pk)
    if table.status in (DiningTable.Status.AVAILABLE, DiningTable.Status.RESERVED):
        table.status = DiningTable.Status.OCCUPIED
        table.save(update_fields=["status", "updated_at"])


def _release_if_idle(table):
    if table is None:
        return
    table = DiningTable.objects.select_for_update().get(pk=table.pk)
    still = Order.objects.filter(table=table, status__in=Order.ACTIVE_STATUSES).exists()
    if not still and table.status == DiningTable.Status.OCCUPIED:
        table.status = DiningTable.Status.AVAILABLE
        table.save(update_fields=["status", "updated_at"])


def serialize_order(order):
    items = [{
        "id": i.id, "food_id": i.food_id, "name": i.food_name, "quantity": i.quantity,
        "unit_price": str(i.unit_price), "customizations": i.customizations,
        "customization_per_unit": str(i.customization_per_unit),
        "dish_discount_per_unit": str(i.dish_discount_per_unit), "line_total": str(i.line_total),
        "special_instructions": i.special_instructions,
    } for i in order.items.all()]
    history = [{"from": h.from_status, "to": h.to_status, "note": h.note, "at": h.created_at}
               for h in order.status_history.all()]
    return {
        "id": order.id, "order_number": order.order_number, "branch_id": order.branch_id,
        "order_type": order.order_type, "status": order.status, "payment_status": order.payment_status,
        "table": {"id": order.table_id, "label": order.table_label} if order.table_id else None,
        "customer_phone": order.customer_phone, "items": items, "history": history,
        "items_subtotal": str(order.items_subtotal), "customization_total": str(order.customization_total),
        "dish_discount_total": str(order.dish_discount_total),
        "coupon_discount_total": str(order.coupon_discount_total), "takeaway_charge": str(order.takeaway_charge),
        "taxable_amount": str(order.taxable_amount), "gst_rate": str(order.gst_rate),
        "gst_amount": str(order.gst_amount), "service_charge_rate": str(order.service_charge_rate),
        "service_charge_amount": str(order.service_charge_amount), "total_amount": str(order.total_amount),
        "cancel_reason": order.cancel_reason, "created_at": order.created_at, "completed_at": order.completed_at,
    }


@transaction.atomic
def create_from_cart(user, branch, idempotency_key, payment_method):
    if user.user_type != User.UserType.CUSTOMER:
        raise OrderError("Only a customer can place this order.", "not_customer", 403)
    if idempotency_key:
        existing = Order.objects.filter(idempotency_key=idempotency_key).first()
        if existing:
            if existing.customer_id != user.id:
                raise OrderError("This checkout key was already used.", "idempotency_conflict", 409)
            return existing, False
    cart = Cart.objects.select_for_update().filter(
        user=user, branch=branch, status=Cart.Status.ACTIVE).first()
    if cart is None or not cart.items.exists():
        raise OrderError("Your cart is empty.", "cart_empty")
    view = evaluate(cart)
    if not view["can_checkout"]:
        raise OrderError("Your cart needs attention before checkout.", "cart_invalid", 409)
    try:
        priced = price_order(branch, _lines_of(cart), cart.order_type, user, [c.code for c in cart.coupons.all()],
                             allow_auto=not cart.skip_auto_coupons)
    except PricingError as exc:
        raise OrderError("; ".join(e["detail"] for e in exc.errors), "cart_invalid", 409)

    order = Order(
        order_number=f"TMP{uuid4().hex[:12]}",
        branch=branch, customer=user, customer_phone=user.phone,
        table=cart.table, table_label=(f"{cart.table.table_number}" if cart.table_id else ""),
        order_type=cart.order_type, source=Order.Source.CUSTOMER, status=Order.Status.PENDING,
        # COUNTER stays UNPAID until staff records it. Online stays PENDING here; the Payment row is
        # created when the customer starts payment. Missing Razorpay keys do not block placing the order.
        payment_status=(Order.PaymentStatus.UNPAID if payment_method == "COUNTER" else Order.PaymentStatus.PENDING),
        idempotency_key=idempotency_key or None,
        items_subtotal=priced["items_subtotal"], customization_total=priced["customization_total"],
        dish_discount_total=priced["dish_discount_total"], coupon_discount_total=priced["coupon_discount_total"],
        takeaway_charge=priced["takeaway_charge"], taxable_amount=priced["taxable_amount"],
        gst_rate=priced["gst_rate"], gst_amount=priced["gst_amount"],
        service_charge_rate=priced["service_charge_rate"], service_charge_amount=priced["service_charge_amount"],
        total_amount=priced["total_amount"],
    )
    try:
        with transaction.atomic():
            order.save()
    except IntegrityError:
        if idempotency_key:
            existing = Order.objects.get(idempotency_key=idempotency_key)
            if existing.customer_id != user.id:
                raise OrderError("This checkout key was already used.", "idempotency_conflict", 409)
            return existing, False
        raise
    order.order_number = f"FD{order.id:06d}"
    order.save(update_fields=["order_number"])
    for line in priced["items"]:
        OrderItem.objects.create(
            order=order, food_id=line["food_id"], food_name=line["name"], unit_price=line["unit_price"],
            customizations=[{"name": c["name"], "extra_price": str(c["extra_price"])} for c in line["customizations"]],
            customization_per_unit=line["customization_per_unit"],
            dish_discount_per_unit=line["dish_discount_per_unit"], quantity=line["quantity"],
            line_total=line["line_total"], special_instructions=line["special_instructions"])
    try:
        deduct_for_order(order)
    except InsufficientStock as exc:
        raise OrderError(str(exc), "out_of_stock", 409)
    try:
        redeem(order, priced["_applied_coupons"])
    except CouponError as exc:
        raise OrderError(str(exc), "coupon_invalid", 409)
    OrderStatusHistory.objects.create(order=order, from_status="", to_status=Order.Status.PENDING, changed_by=user,
                                      note="Order placed")
    if order.table_id:
        _occupy(order.table)
    cart.status = Cart.Status.CONVERTED
    cart.save(update_fields=["status", "active_slot", "updated_at"])
    publish_order_event(order)
    return order, True


@transaction.atomic
def change_status(order_id, new_status, actor, reason=""):
    order = Order.objects.select_for_update().get(pk=order_id)
    if new_status not in TRANSITIONS.get(order.status, ()):
        raise OrderError(f"Cannot move an order from {order.status} to {new_status}.", "invalid_transition", 409)
    if new_status == Order.Status.CANCELLED and not reason.strip():
        raise OrderError("A reason is required to cancel an order.", "reason_required")
    previous = order.status
    order.status = new_status
    if new_status == Order.Status.PREPARING and order.accepted_by_id is None:
        order.accepted_by = actor
    if new_status == Order.Status.CANCELLED:
        order.cancel_reason = reason.strip()
        restore_for_order(order)
    if new_status == Order.Status.COMPLETED:
        order.completed_at = timezone.now()
    order.save()
    OrderStatusHistory.objects.create(order=order, from_status=previous, to_status=new_status, changed_by=actor,
                                      note=reason.strip())
    if new_status == Order.Status.CANCELLED:
        _release_if_idle(order.table)
    if new_status == Order.Status.COMPLETED:
        # E-bill only after completion. Payment may still be UNPAID; the SRS does not block completion on payment.
        from apps.billing.services import ensure_final_invoice
        ensure_final_invoice(order)
    publish_order_event(order)
    return order