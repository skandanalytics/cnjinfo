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

from apps.realtime.publish import publish_catalog_event
from .models import Order, OrderItem, OrderStatusHistory
from .pricing import PricingError, price_order
from .realtime import publish_order_event

# status -> statuses it may move to
TRANSITIONS = {
    Order.Status.PENDING: {Order.Status.PREPARING, Order.Status.CANCELLED},
    Order.Status.PREPARING: {Order.Status.READY, Order.Status.SERVED, Order.Status.CANCELLED},
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
        publish_catalog_event(table.branch_id, "table", "updated")


def _release_if_idle(table):
    if table is None:
        return
    table = DiningTable.objects.select_for_update().get(pk=table.pk)
    still = Order.objects.filter(table=table, status__in=Order.ACTIVE_STATUSES).exists()
    if not still and table.status == DiningTable.Status.OCCUPIED:
        table.status = DiningTable.Status.AVAILABLE
        table.save(update_fields=["status", "updated_at"])
        publish_catalog_event(table.branch_id, "table", "updated")


def _invoice_contact(order):
    branch = order.branch if order.branch_id else None
    payments = list(order.payments.all())
    successful = [payment for payment in payments if payment.status == "SUCCESS"]
    chosen = successful or payments
    method = ""
    if chosen:
        method = max(chosen, key=lambda payment: payment.id).get_method_display()
    customer_name = ""
    if order.customer_id and getattr(order, "customer", None):
        customer_name = order.customer.name or ""
    return {
        "branch_address": branch.address if branch else "",
        "branch_phone": branch.contact_number if branch else "",
        "branch_city": branch.city if branch else "",
        "branch_email": branch.email if branch else "",
        "customer_name": customer_name,
        "payment_method": method,
    }


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
        "branch_name": order.branch_name,
        "order_type": order.order_type, "status": order.status, "payment_status": order.payment_status,
        "table": ({"id": order.table_id, "label": order.table_label}
                  if order.table_id or order.table_label else None),
        "customer_phone": order.customer_phone,
        "placed_by": order.placed_by_id,
        "placed_by_name": order.placed_by_name or (order.placed_by.name if order.placed_by_id else None),
        "items": items, "history": history,
        "items_subtotal": str(order.items_subtotal), "customization_total": str(order.customization_total),
        "dish_discount_total": str(order.dish_discount_total),
        "coupon_discount_total": str(order.coupon_discount_total), "takeaway_charge": str(order.takeaway_charge),
        "taxable_amount": str(order.taxable_amount), "gst_rate": str(order.gst_rate),
        "gst_amount": str(order.gst_amount), "service_charge_rate": str(order.service_charge_rate),
        "service_charge_amount": str(order.service_charge_amount),
        "round_off": str(order.round_off), "total_amount": str(order.total_amount),
        "cancel_reason": order.cancel_reason, "created_at": order.created_at, "completed_at": order.completed_at,
        **_invoice_contact(order),
    }


def _owns_order(order, user):
    return order.customer_id == user.id or order.placed_by_id == user.id


@transaction.atomic
def create_from_cart(user, branch, idempotency_key, payment_method):
    from apps.accounts.permissions import get_active_employee
    from apps.accounts.scoping import can_access_branch

    assisted = user.user_type != User.UserType.CUSTOMER
    if assisted and (get_active_employee(user) is None or not can_access_branch(user, branch.id)):
        raise OrderError("You cannot place an order for this branch.", "not_staff", 403)
    if idempotency_key:
        existing = Order.objects.filter(idempotency_key=idempotency_key).first()
        if existing:
            if not _owns_order(existing, user):
                raise OrderError("This checkout key was already used.", "idempotency_conflict", 409)
            return existing, False
    cart = Cart.objects.select_for_update().filter(
        user=user, branch=branch, status=Cart.Status.ACTIVE).first()
    if cart is None or not cart.items.exists():
        raise OrderError("Your cart is empty.", "cart_empty")
    if cart.order_type == Order.Type.TAKEAWAY:
        from apps.carts.services import _branch_has_orderable_food
        if not _branch_has_orderable_food(branch):
            raise OrderError("Takeaway ordering is unavailable because no dishes are currently available.",
                             "no_dishes", 409)
    elif cart.order_type == Order.Type.DINE_IN:
        if cart.table_id is None:
            raise OrderError("Please select an available table for Dine-In.", "table_required", 400)
    view = evaluate(cart)
    if not view["can_checkout"]:
        raise OrderError("Your cart needs attention before checkout.", "cart_invalid", 409)
    try:
        priced = price_order(branch, _lines_of(cart), cart.order_type, None if assisted else user,
                             [c.code for c in cart.coupons.all()], allow_auto=not cart.skip_auto_coupons)
    except PricingError as exc:
        raise OrderError("; ".join(e["detail"] for e in exc.errors), "cart_invalid", 409)

    order = Order(
        order_number=f"TMP{uuid4().hex[:12]}",
        branch=branch, branch_name=branch.name,
        customer=None if assisted else user, customer_phone="" if assisted else user.phone,
        table=cart.table, table_label=(f"{cart.table.table_number}" if cart.table_id else ""),
        order_type=cart.order_type,
        source=Order.Source.EMPLOYEE if assisted else Order.Source.CUSTOMER,
        placed_by=user if assisted else None, placed_by_name=(user.name or user.phone) if assisted else "",
        status=Order.Status.PENDING,
        # COUNTER stays UNPAID until staff records it. Online stays PENDING here; the Payment row is
        # created when the customer starts payment. Missing Razorpay keys do not block placing the order.
        payment_status=(Order.PaymentStatus.UNPAID if payment_method == "COUNTER" else Order.PaymentStatus.PENDING),
        idempotency_key=idempotency_key or None,
        items_subtotal=priced["items_subtotal"], customization_total=priced["customization_total"],
        dish_discount_total=priced["dish_discount_total"], coupon_discount_total=priced["coupon_discount_total"],
        takeaway_charge=priced["takeaway_charge"], taxable_amount=priced["taxable_amount"],
        gst_rate=priced["gst_rate"], gst_amount=priced["gst_amount"],
        service_charge_rate=priced["service_charge_rate"], service_charge_amount=priced["service_charge_amount"],
        round_off=priced["round_off"], total_amount=priced["total_amount"],
    )
    try:
        with transaction.atomic():
            order.save()
    except IntegrityError:
        if idempotency_key:
            existing = Order.objects.get(idempotency_key=idempotency_key)
            if not _owns_order(existing, user):
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
        claimed = DiningTable.objects.select_for_update().get(pk=order.table_id)
        # Occupied is allowed: a seated table can take another order (same or another diner).
        # The table stays occupied until the last unfinished order is cancelled or staff vacate it.
        if not claimed.is_active:
            raise OrderError("This table is no longer available. Choose another table or Takeaway.",
                             "table_unavailable", 409)
        _occupy(claimed)
    cart.status = Cart.Status.CONVERTED
    cart.save(update_fields=["status", "active_slot", "updated_at"])
    publish_order_event(order)
    return order, True


def _money_fields(priced):
    return {
        "items_subtotal": priced["items_subtotal"], "customization_total": priced["customization_total"],
        "dish_discount_total": priced["dish_discount_total"], "coupon_discount_total": priced["coupon_discount_total"],
        "takeaway_charge": priced["takeaway_charge"], "taxable_amount": priced["taxable_amount"],
        "gst_rate": priced["gst_rate"], "gst_amount": priced["gst_amount"],
        "service_charge_rate": priced["service_charge_rate"],
        "service_charge_amount": priced["service_charge_amount"],
        "round_off": priced["round_off"], "total_amount": priced["total_amount"],
    }


def _write_items(order, priced):
    for line in priced["items"]:
        OrderItem.objects.create(
            order=order, food_id=line["food_id"], food_name=line["name"], unit_price=line["unit_price"],
            customizations=[{"name": c["name"], "extra_price": str(c["extra_price"])} for c in line["customizations"]],
            customization_per_unit=line["customization_per_unit"],
            dish_discount_per_unit=line["dish_discount_per_unit"], quantity=line["quantity"],
            line_total=line["line_total"], special_instructions=line["special_instructions"])


@transaction.atomic
def create_assisted(staff_user, table_id, item_rows, idempotency_key, branch_id=None, order_type=Order.Type.DINE_IN, coupon_code="", customer_phone="", customer_name="", mark_paid=False, payment_method="CASH"):
    """Staff places a dine-in or takeaway order. The creator is the logged-in staff member."""
    from apps.accounts.permissions import get_active_employee
    from apps.accounts.scoping import can_access_branch
    from apps.branches.models import Branch
    from apps.orders.pricing import Line
    from apps.payments.models import Payment

    emp = get_active_employee(staff_user)
    if emp is None and not (staff_user.is_superuser or staff_user.is_staff):
        raise OrderError("No active staff profile.", "not_staff", 403)
    if idempotency_key:
        existing = Order.objects.filter(idempotency_key=idempotency_key).first()
        if existing:
            if existing.placed_by_id != staff_user.id:
                raise OrderError("This checkout key was already used.", "idempotency_conflict", 409)
            return existing, False

    table = None
    if order_type == Order.Type.DINE_IN:
        if not table_id:
            raise OrderError("Please select a table for Dine-In order.", "table_required", 400)
        table = DiningTable.objects.select_for_update().filter(pk=table_id).first()
        if table is None or not can_access_branch(staff_user, table.branch_id):
            raise OrderError("Table not found or unauthorized.", "not_found", 404)
        if not table.is_active:
            raise OrderError("This table is not available for a new order.", "table_unavailable", 409)
        branch = table.branch
    else:
        order_type = Order.Type.TAKEAWAY
        resolved_branch_id = branch_id or (emp.branch_id if emp else None)
        if not resolved_branch_id:
            first_b = Branch.objects.filter(is_active=True).first()
            resolved_branch_id = first_b.id if first_b else None
        branch = Branch.objects.filter(pk=resolved_branch_id, is_active=True).first()
        if branch is None or not can_access_branch(staff_user, branch.id):
            raise OrderError("Branch not found or unauthorized.", "not_found", 404)

    # Customer lookup/association
    customer = None
    if customer_phone:
        customer = User.objects.filter(phone=customer_phone, user_type=User.UserType.CUSTOMER).first()

    lines = [Line(row["food"], row["quantity"], row.get("options", []), row.get("special_instructions", "")) for row in item_rows]
    coupon_codes = [coupon_code.strip()] if coupon_code and coupon_code.strip() else []
    try:
        priced = price_order(branch, lines, order_type, customer, coupon_codes)
    except PricingError as exc:
        raise OrderError("; ".join(e["detail"] for e in exc.errors), "cart_invalid", 409)

    order = Order(
        order_number=f"TMP{uuid4().hex[:12]}",
        branch=branch,
        branch_name=branch.name,
        customer=customer,
        customer_phone=customer_phone or "",
        table=table,
        table_label=table.table_number if table else "Takeaway",
        order_type=order_type,
        source=Order.Source.EMPLOYEE,
        placed_by=staff_user,
        placed_by_name=staff_user.name or staff_user.phone,
        status=Order.Status.PENDING,
        payment_status=Order.PaymentStatus.PAID if mark_paid else Order.PaymentStatus.UNPAID,
        idempotency_key=idempotency_key or None,
        **_money_fields(priced),
    )
    try:
        with transaction.atomic():
            order.save()
    except IntegrityError:
        if idempotency_key:
            existing = Order.objects.get(idempotency_key=idempotency_key)
            if existing.placed_by_id != staff_user.id:
                raise OrderError("This checkout key was already used.", "idempotency_conflict", 409)
            return existing, False
        raise
    order.order_number = f"FD{order.id:06d}"
    order.save(update_fields=["order_number"])
    _write_items(order, priced)
    try:
        deduct_for_order(order)
    except InsufficientStock as exc:
        raise OrderError(str(exc), "out_of_stock", 409)
    if priced.get("_applied_coupons"):
        try:
            redeem(order, priced["_applied_coupons"])
        except CouponError as exc:
            raise OrderError(str(exc), "coupon_invalid", 409)
    if mark_paid:
        Payment.objects.create(
            order=order,
            branch=branch,
            amount=order.total_amount,
            method=Payment.Method.COUNTER,
            status=Payment.Status.SUCCESS,
            recorded_by=staff_user,
            paid_at=timezone.now(),
        )
    OrderStatusHistory.objects.create(
        order=order,
        from_status="",
        to_status=Order.Status.PENDING,
        changed_by=staff_user,
        note="Order placed via POS",
    )
    if table:
        _occupy(table)
    publish_order_event(order)
    return order, True


@transaction.atomic
def change_status(order_id, new_status, actor, reason=""):
    order = Order.objects.select_for_update().get(pk=order_id)
    if new_status == order.status:
        return order
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
    if new_status == Order.Status.COMPLETED or (order.order_type == Order.Type.TAKEAWAY and new_status == Order.Status.SERVED):
        if not order.completed_at:
            order.completed_at = timezone.now()
    order.save()
    OrderStatusHistory.objects.create(order=order, from_status=previous, to_status=new_status, changed_by=actor,
                                      note=reason.strip())
    if new_status in (Order.Status.CANCELLED, Order.Status.COMPLETED):
        # Free the table only when no other unfinished order still uses it. A reservation is left alone
        # because _release_if_idle only changes OCCUPIED tables. Payment status is not changed here.
        _release_if_idle(order.table)
    if new_status == Order.Status.COMPLETED or (order.order_type == Order.Type.TAKEAWAY and new_status == Order.Status.SERVED):
        # E-bill after completion or takeaway serving.
        from apps.billing.services import ensure_final_invoice
        try:
            ensure_final_invoice(order)
        except Exception:
            pass
    publish_order_event(order)
    return order