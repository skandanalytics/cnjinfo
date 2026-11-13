"""Create orders from a validated cart and move them through the status machine.

Accept means PENDING -> PREPARING (decision Q2). Stock is deducted when the order is created and given back
when it is cancelled (decision Q8). A table is marked OCCUPIED on a dine-in order and is released on cancel
only when no other unfinished order still uses it. Completing an order does not vacate the table; staff do that.
"""
from decimal import Decimal
from uuid import uuid4

from django.db import IntegrityError, models, transaction
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
    Order.Status.PENDING: {Order.Status.PREPARING, Order.Status.COMPLETED, Order.Status.CANCELLED},
    Order.Status.PLACED: {Order.Status.PREPARING, Order.Status.COMPLETED, Order.Status.CANCELLED},
    "PLACED": {Order.Status.PREPARING, Order.Status.COMPLETED, Order.Status.CANCELLED},
    Order.Status.PREPARING: {Order.Status.READY, Order.Status.SERVED, Order.Status.COMPLETED, Order.Status.CANCELLED},
    Order.Status.READY: {Order.Status.SERVED, Order.Status.COMPLETED},
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


def _release_if_idle(table, force=False):
    if table is None:
        return
    table = DiningTable.objects.select_for_update().get(pk=table.pk)
    if force:
        still = False
    else:
        still = Order.objects.filter(
            models.Q(table=table) | models.Q(parent_order__table=table),
            status__in=Order.ACTIVE_STATUSES,
        ).exclude(status__in=[Order.Status.CANCELLED, Order.Status.COMPLETED]).exists()
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
    if not method and order.parent_order_id and getattr(order, "parent_order", None):
        parent_payments = list(order.parent_order.payments.all())
        p_succ = [p for p in parent_payments if p.status == "SUCCESS"]
        p_chosen = p_succ or parent_payments
        if p_chosen:
            method = max(p_chosen, key=lambda p: p.id).get_method_display()
    elif not method and hasattr(order, "continuations") and order.continuations.exists():
        from apps.payments.models import Payment
        sub_payments = list(Payment.objects.filter(order__in=order.continuations.all()))
        s_succ = [p for p in sub_payments if p.status == "SUCCESS"]
        s_chosen = s_succ or sub_payments
        if s_chosen:
            method = max(s_chosen, key=lambda p: p.id).get_method_display()

    if not method and order.payment_status == Order.PaymentStatus.PAID:
        method = "Cash"
    elif method in ("Pay on Counter", "COUNTER"):
        method = "Cash"
    elif method == "Razorpay UPI":
        method = "UPI"
    elif method == "Razorpay Card":
        method = "Card"
    customer_name = ""
    if order.customer_id and getattr(order, "customer", None):
        customer_name = order.customer.name or ""
    elif order.parent_order_id and getattr(order, "parent_order", None) and order.parent_order.customer:
        customer_name = order.parent_order.customer.name or ""

    customer_phone = order.customer_phone or (order.customer.phone if order.customer_id and getattr(order, "customer", None) else "") or (order.parent_order.customer_phone if order.parent_order_id and getattr(order, "parent_order", None) else "")

    if not customer_phone and order.parent_order_id:
        from django.db.models import Q
        sibling = Order.objects.filter(
            Q(id=order.parent_order_id) | Q(parent_order_id=order.parent_order_id)
        ).exclude(customer_phone="").order_by("-id").first()
        if sibling:
            customer_phone = sibling.customer_phone
            if not customer_name and sibling.customer:
                customer_name = sibling.customer.name or ""
    elif not customer_phone:
        child = Order.objects.filter(parent_order=order).exclude(customer_phone="").order_by("-id").first()
        if child:
            customer_phone = child.customer_phone
            if not customer_name and child.customer:
                customer_name = child.customer.name or ""

    if not customer_name and customer_phone:
        user_match = User.objects.filter(phone=customer_phone).first()
        if user_match:
            customer_name = user_match.name or ""
    if not customer_name and order.parent_order_id and getattr(order, "parent_order", None) and order.parent_order.customer_phone:
        user_match = User.objects.filter(phone=order.parent_order.customer_phone).first()
        if user_match:
            customer_name = user_match.name or ""
    return {
        "branch_address": branch.address if branch else "",
        "branch_phone": branch.contact_number if branch else "",
        "branch_city": branch.city if branch else "",
        "branch_email": branch.email if branch else "",
        "customer_name": customer_name,
        "customer_phone": customer_phone,
        "payment_method": method,
    }


def serialize_order(order):
    items = [{
        "id": i.id, "order_id": order.id, "order_display_number": order.display_number,
        "food_id": i.food_id, "name": i.food_name, "quantity": i.quantity,
        "price": str(i.unit_price), "unit_price": str(i.unit_price),
        "customizations": i.customizations,
        "customization_per_unit": str(i.customization_per_unit),
        "dish_discount_per_unit": str(i.dish_discount_per_unit),
        "line_total": str(i.line_total), "lineTotal": str(i.line_total),
        "special_instructions": i.special_instructions,
    } for i in order.items.all()]
    history = [{"from": h.from_status, "to": h.to_status, "note": h.note, "at": h.created_at}
               for h in order.status_history.all()]
    diner_count = order.number_of_diners or (order.table.capacity if order.table else None)

    continuations_data = []
    combined_items = list(items)
    combined_total = order.total_amount
    combined_items_subtotal = order.items_subtotal
    combined_dish_discount = order.dish_discount_total
    combined_taxable_amount = order.taxable_amount
    combined_gst_amount = order.gst_amount
    combined_service_charge_amount = order.service_charge_amount
    has_continuations = False

    if order.parent_order_id is None:
        continuations_qs = order.continuations.exclude(status=Order.Status.CANCELLED).order_by("continuation_index", "id").prefetch_related("items")
        for cont in continuations_qs:
            has_continuations = True
            c_items = [{
                "id": i.id, "order_id": cont.id, "order_display_number": cont.display_number,
                "food_id": i.food_id, "name": i.food_name, "quantity": i.quantity,
                "price": str(i.unit_price), "unit_price": str(i.unit_price),
                "customizations": i.customizations,
                "customization_per_unit": str(i.customization_per_unit),
                "dish_discount_per_unit": str(i.dish_discount_per_unit),
                "line_total": str(i.line_total), "lineTotal": str(i.line_total),
                "special_instructions": i.special_instructions,
            } for i in cont.items.all()]
            combined_items.extend(c_items)
            combined_total += cont.total_amount
            combined_items_subtotal += cont.items_subtotal
            combined_dish_discount += cont.dish_discount_total
            combined_taxable_amount += cont.taxable_amount
            combined_gst_amount += cont.gst_amount
            combined_service_charge_amount += cont.service_charge_amount
            continuations_data.append({
                "id": cont.id,
                "order_number": cont.order_number,
                "display_order_number": cont.display_number,
                "status": cont.status,
                "payment_status": cont.payment_status,
                "total_amount": str(cont.total_amount),
                "items_count": cont.items.count(),
                "created_at": cont.created_at,
            })

    redemptions = list(order.coupon_redemptions.select_related("coupon").all())
    applied_coupon_codes = [r.coupon_code for r in redemptions]
    applied_coupon_code = ", ".join(applied_coupon_codes) if applied_coupon_codes else ""
    applied_coupons_data = [{
        "code": r.coupon_code,
        "discount": str(r.discount_amount),
        "is_first_time": r.coupon.is_first_time_auto if r.coupon else False
    } for r in redemptions]

    return {
        "id": order.id, "order_number": order.order_number,
        "display_order_number": order.display_number,
        "parent_order_id": order.parent_order_id,
        "continuation_index": order.continuation_index,
        "has_continuations": has_continuations,
        "continuations": continuations_data,
        "combined_items": combined_items,
        "combined_total": str(combined_total),
        "combined_items_subtotal": str(combined_items_subtotal),
        "combined_dish_discount_total": str(combined_dish_discount),
        "combined_taxable_amount": str(combined_taxable_amount),
        "combined_gst_amount": str(combined_gst_amount),
        "combined_service_charge_amount": str(combined_service_charge_amount),
        "coupon_code": applied_coupon_code,
        "coupon_codes": applied_coupon_codes,
        "applied_coupons": applied_coupons_data,
        "coupon": applied_coupon_code,
        "voucher": applied_coupon_code,
        "voucherCode": applied_coupon_code,
        "branch_id": order.branch_id,
        "branch_name": order.branch_name,
        "order_type": order.order_type, "status": order.status, "payment_status": order.payment_status,
        "refund_status": getattr(order, "refund_status", "NOT_APPLICABLE"),
        "refunded_amount": str(getattr(order, "refunded_amount", Decimal("0.00"))),
        "parent_order_display_number": (order.parent_order.display_number if order.parent_order_id and getattr(order, "parent_order", None) else None),
        "table": ({"id": order.table_id, "label": order.table_label, "capacity": order.table.capacity if order.table else None}
                  if order.table_id or order.table_label else None),
        "table_id": order.table_id,
        "table_number": order.table_label,
        "number_of_diners": diner_count,
        "diners": diner_count,
        "customer_phone": order.customer_phone or (order.customer.phone if order.customer_id and getattr(order, "customer", None) else "") or (order.parent_order.customer_phone if order.parent_order_id and getattr(order, "parent_order", None) else ""),
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
def create_from_cart(user, branch, idempotency_key, payment_method, service_tax_enabled=True, parent_order_id=None, customer_phone="", customer_name=""):
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

    parent_order = None
    continuation_idx = 0
    if parent_order_id:
        parent_order = Order.objects.select_for_update().filter(pk=parent_order_id).first()
        if parent_order:
            if parent_order.status in (Order.Status.CANCELLED, Order.Status.COMPLETED):
                if not assisted:
                    parent_order = None
                else:
                    raise OrderError("This order has proceeded to bill and cannot be continued.", "continuation_closed", 400)
            elif parent_order.branch_id != branch.id or parent_order.order_type != Order.Type.DINE_IN:
                parent_order = None
            else:
                root = parent_order.parent_order if parent_order.parent_order_id else parent_order
                if root.id != parent_order.id:
                    root = Order.objects.select_for_update().get(pk=root.id)
                if root.status in (Order.Status.CANCELLED, Order.Status.COMPLETED):
                    if not assisted:
                        parent_order = None
                    else:
                        raise OrderError("This order has proceeded to bill and cannot be continued.", "continuation_closed", 400)
                else:
                    parent_order = root
                    last_idx = Order.objects.filter(parent_order=parent_order).aggregate(models.Max('continuation_index'))['continuation_index__max'] or 0
                    continuation_idx = last_idx + 1
                    if parent_order.table_id and cart.table_id != parent_order.table_id:
                        cart.table = parent_order.table
                        cart.save(update_fields=['table'])

    if cart.order_type == Order.Type.TAKEAWAY:
        if parent_order:
            raise OrderError("Continuation orders must be Dine-In.", "invalid_order_type", 400)
        from apps.carts.services import _branch_has_orderable_food
        if not _branch_has_orderable_food(branch):
            raise OrderError("Takeaway ordering is unavailable because no dishes are currently available.",
                             "no_dishes", 409)
    elif cart.order_type == Order.Type.DINE_IN:
        if cart.table_id is None and parent_order and parent_order.table_id:
            cart.table = parent_order.table
            cart.save(update_fields=['table'])
        elif cart.table_id is None:
            raise OrderError("Please select an available table for Dine-In.", "table_required", 400)

        # Automatic continuation detection: if no parent_order was specified, but there is an active
        # Dine-In order for this table/branch that is not completed/cancelled, chain onto it
        if parent_order is None and cart.table_id:
            active_root = (
                Order.objects.select_for_update()
                .filter(
                    branch=branch,
                    table_id=cart.table_id,
                    order_type=Order.Type.DINE_IN,
                    parent_order__isnull=True,
                )
                .exclude(status__in=[Order.Status.CANCELLED, Order.Status.COMPLETED])
                .order_by("-id")
                .first()
            )
            if active_root:
                # Prevent cross-customer table reuse: another customer cannot arbitrarily piggyback
                # unless they are the same customer or part of the same dining session.
                is_same_customer = False
                if user and getattr(user, 'is_authenticated', False) and active_root.customer_id == getattr(user, 'id', None):
                    is_same_customer = True
                elif customer_phone and active_root.customer_phone == customer_phone:
                    is_same_customer = True
                elif getattr(user, 'phone', None) and active_root.customer_phone == user.phone:
                    is_same_customer = True
                elif assisted:
                    is_same_customer = True

                if is_same_customer:
                    parent_order = active_root
                    last_idx = Order.objects.filter(parent_order=parent_order).aggregate(models.Max('continuation_index'))['continuation_index__max'] or 0
                    continuation_idx = last_idx + 1
                else:
                    raise OrderError("Table is currently occupied by another customer.", "table_occupied", 409)
    view = evaluate(cart)
    if not view["can_checkout"]:
        raise OrderError("Your cart needs attention before checkout.", "cart_invalid", 409)
    try:
        priced = price_order(branch, _lines_of(cart), cart.order_type, None if assisted else user,
                             [c.code for c in cart.coupons.all()], allow_auto=not cart.skip_auto_coupons,
                             service_tax_enabled=service_tax_enabled)
    except PricingError as exc:
        raise OrderError("; ".join(e["detail"] for e in exc.errors), "cart_invalid", 409)

    order_customer = (user if not assisted and getattr(user, 'is_authenticated', False) and getattr(user, 'user_type', None) == User.UserType.CUSTOMER else None) or (parent_order.customer if parent_order else None)
    if not order_customer and customer_phone:
        order_customer = User.objects.filter(phone=customer_phone, user_type=User.UserType.CUSTOMER).first()

    order_customer_phone = (
        customer_phone or
        (getattr(user, 'phone', '') if not assisted and getattr(user, 'user_type', None) == User.UserType.CUSTOMER else '') or
        (parent_order.customer_phone if parent_order else '')
    )

    order = Order(
        order_number=f"TMP{uuid4().hex[:12]}",
        branch=branch, branch_name=branch.name,
        customer=order_customer, customer_phone=order_customer_phone,
        table=cart.table or (parent_order.table if parent_order else None),
        table_label=(f"{cart.table.table_number}" if cart.table_id else (parent_order.table_label if parent_order else "")),
        order_type=cart.order_type,
        parent_order=parent_order,
        continuation_index=continuation_idx,
        display_order_number=f"{parent_order.id}.{continuation_idx}" if parent_order else "",
        source=Order.Source.EMPLOYEE if assisted else Order.Source.CUSTOMER,
        placed_by=user if assisted else None, placed_by_name=(user.name or user.phone) if assisted else "",
        status=Order.Status.PENDING,
        # COUNTER/CASH stays UNPAID until staff records it. Online stays PENDING here; the Payment row is
        # created when the customer starts payment. Missing Razorpay keys do not block placing the order.
        payment_status=(Order.PaymentStatus.UNPAID if payment_method in ("COUNTER", "CASH") else Order.PaymentStatus.PENDING),
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
    update_fields = ["order_number"]
    if not parent_order:
        order.display_order_number = str(order.id)
        update_fields.append("display_order_number")
    order.save(update_fields=update_fields)
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
def create_assisted(staff_user, table_id, item_rows, idempotency_key, branch_id=None, order_type=Order.Type.DINE_IN, coupon_code="", customer_phone="", customer_name="", mark_paid=False, payment_method="CASH", service_tax_enabled=True, parent_order_id=None):
    """Staff places a dine-in or takeaway order. The creator is the logged-in staff member."""
    from apps.accounts.permissions import get_active_employee
    from apps.accounts.scoping import can_access_branch
    from apps.branches.models import Branch
    from apps.orders.pricing import Line
    from apps.payments.models import Payment

    emp = get_active_employee(staff_user)
    if emp is None and not (staff_user.is_superuser or staff_user.is_staff):
        raise OrderError("No active staff profile.", "not_staff", 403)
    if emp and (emp.role == "CHEF" or (emp.job_title and "cook" in emp.job_title.lower()) or (emp.job_title and "chef" in emp.job_title.lower())):
        raise OrderError("Kitchen staff and cooks are not permitted to place orders.", "cook_forbidden", 403)
    if idempotency_key:
        existing = Order.objects.filter(idempotency_key=idempotency_key).first()
        if existing:
            if existing.placed_by_id != staff_user.id:
                raise OrderError("This checkout key was already used.", "idempotency_conflict", 409)
            return existing, False

    parent_order = None
    continuation_idx = 0
    if parent_order_id:
        parent_order = Order.objects.select_for_update().filter(pk=parent_order_id).first()
        if parent_order:
            if parent_order.status in (Order.Status.CANCELLED, Order.Status.COMPLETED):
                raise OrderError("This order has proceeded to bill and cannot be continued.", "continuation_closed", 400)
            if table_id and parent_order.table_id and parent_order.table_id != table_id:
                raise OrderError("Cannot continue order on a different table.", "invalid_table", 400)
            root = parent_order.parent_order if parent_order.parent_order_id else parent_order
            if root.id != parent_order.id:
                root = Order.objects.select_for_update().get(pk=root.id)
            if root.status in (Order.Status.CANCELLED, Order.Status.COMPLETED):
                raise OrderError("This order has proceeded to bill and cannot be continued.", "continuation_closed", 400)
            parent_order = root
            last_idx = Order.objects.filter(parent_order=parent_order).aggregate(models.Max('continuation_index'))['continuation_index__max'] or 0
            continuation_idx = last_idx + 1
            if not table_id and parent_order.table_id:
                table_id = parent_order.table_id

    table = None
    if order_type == Order.Type.DINE_IN:
        if not table_id:
            raise OrderError("Please select a table for Dine-In order.", "table_required", 400)
        table = DiningTable.objects.select_for_update().filter(pk=table_id).first()
        if table is None or not can_access_branch(staff_user, table.branch_id):
            raise OrderError("Table not found or unauthorized.", "not_found", 404)
        if not table.is_active:
            raise OrderError("This table is not available for a new order.", "table_unavailable", 409)
        if not parent_order and table.status == DiningTable.Status.OCCUPIED:
            active_root = (
                Order.objects.select_for_update()
                .filter(
                    branch=table.branch,
                    table=table,
                    order_type=Order.Type.DINE_IN,
                    parent_order__isnull=True,
                )
                .exclude(status__in=[Order.Status.CANCELLED, Order.Status.COMPLETED])
                .order_by("-id")
                .first()
            )
            if active_root:
                parent_order = active_root
                last_idx = Order.objects.filter(parent_order=parent_order).aggregate(models.Max('continuation_index'))['continuation_index__max'] or 0
                continuation_idx = last_idx + 1
            else:
                raise OrderError("Table is occupied.", "table_occupied", 409)
        branch = table.branch
    else:
        order_type = Order.Type.TAKEAWAY
        if parent_order:
            raise OrderError("Continuation orders must be Dine-In.", "invalid_order_type", 400)
        resolved_branch_id = branch_id or (emp.branch_id if emp else None)
        if not resolved_branch_id:
            first_b = Branch.objects.filter(is_active=True).first()
            resolved_branch_id = first_b.id if first_b else None
        branch = Branch.objects.filter(pk=resolved_branch_id, is_active=True).first()
        if branch is None or not can_access_branch(staff_user, branch.id):
            raise OrderError("Branch not found or unauthorized.", "not_found", 404)

    # Customer lookup/association
    if parent_order:
        if not customer_phone or len(str(customer_phone).strip()) < 7:
            cand = parent_order.customer_phone or (parent_order.customer.phone if parent_order.customer else "")
            if not cand:
                from django.db.models import Q
                sibling = Order.objects.filter(
                    Q(id=parent_order.id) | Q(parent_order=parent_order)
                ).exclude(customer_phone="").order_by("-id").first()
                if sibling:
                    cand = sibling.customer_phone
            customer_phone = cand or ""

        if not customer_name:
            cand_name = (parent_order.customer.name if parent_order.customer else "")
            if not cand_name:
                from django.db.models import Q
                sibling_cust = Order.objects.filter(
                    Q(id=parent_order.id) | Q(parent_order=parent_order),
                    customer__isnull=False
                ).order_by("-id").first()
                if sibling_cust and sibling_cust.customer and sibling_cust.customer.name:
                    cand_name = sibling_cust.customer.name
            customer_name = cand_name or ""

    customer = None
    if parent_order and parent_order.customer:
        customer = parent_order.customer
        if not customer_phone and customer.phone:
            customer_phone = customer.phone

    if customer_phone:
        clean_phone = "".join(filter(str.isdigit, str(customer_phone)))[-10:]
        if len(clean_phone) >= 7:
            customer_phone = clean_phone
        else:
            customer_phone = str(customer_phone).strip()

    if customer_phone and not customer:
        customer = User.objects.filter(phone=customer_phone, user_type=User.UserType.CUSTOMER).first()
        if customer is None and not User.objects.filter(phone=customer_phone).exists():
            customer = User.objects.create(
                phone=customer_phone,
                name=(customer_name or "").strip(),
                user_type=User.UserType.CUSTOMER,
            )
        elif customer and customer_name and customer_name.strip() and not customer.name:
            customer.name = customer_name.strip()
            customer.save(update_fields=["name"])

    if not customer_phone and customer and customer.phone:
        customer_phone = customer.phone

    lines = [Line(row["food"], row["quantity"], row.get("options", []), row.get("special_instructions", "")) for row in item_rows]
    if order_type == Order.Type.DINE_IN:
        # Per REQ-3: Dine-in orders created in POS do not receive POS coupon discounts.
        # Coupons for dine-in are only applied at session completion in Orders / Billing.
        coupon_codes = []
        allow_auto = False
    else:
        if isinstance(coupon_code, list):
            coupon_codes = [str(c).strip() for c in coupon_code if str(c).strip()]
        elif coupon_code and coupon_code.strip():
            coupon_codes = [c.strip() for c in str(coupon_code).split(",") if c.strip()]
        else:
            coupon_codes = []

        # If explicit 'NONE' passed, do not auto-apply coupons
        allow_auto = True
        if any(str(c).upper() == "NONE" for c in coupon_codes):
            coupon_codes = [c for c in coupon_codes if str(c).upper() != "NONE"]
            allow_auto = False

    try:
        priced = price_order(branch, lines, order_type, customer, coupon_codes, allow_auto=allow_auto, service_tax_enabled=service_tax_enabled)
    except PricingError as exc:
        raise OrderError("; ".join(e["detail"] for e in exc.errors), "cart_invalid", 409)

    order = Order(
        order_number=f"TMP{uuid4().hex[:12]}",
        branch=branch,
        branch_name=branch.name,
        customer=customer or (parent_order.customer if parent_order else None),
        customer_phone=customer_phone or (customer.phone if customer else "") or (parent_order.customer_phone if parent_order else "") or "",
        table=table,
        table_label=table.table_number if table else "Takeaway",
        order_type=order_type,
        parent_order=parent_order,
        continuation_index=continuation_idx,
        display_order_number=f"{parent_order.id}.{continuation_idx}" if parent_order else "",
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
    update_fields = ["order_number"]
    if not parent_order:
        order.display_order_number = str(order.id)
        update_fields.append("display_order_number")
    order.save(update_fields=update_fields)
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
        resolved_method = Payment.Method.CASH
        clean_method = str(payment_method or "").strip().upper()
        if clean_method in ("RAZORPAY_UPI", "UPI"):
            resolved_method = Payment.Method.RAZORPAY_UPI
        elif clean_method in ("RAZORPAY_CARD", "CARD"):
            resolved_method = Payment.Method.RAZORPAY_CARD
        elif clean_method in ("CASH", "COUNTER"):
            resolved_method = Payment.Method.CASH
        elif hasattr(Payment.Method, clean_method):
            resolved_method = clean_method

        try:
            with transaction.atomic():
                Payment.objects.create(
                    order=order,
                    amount=order.total_amount,
                    method=resolved_method,
                    status=Payment.Status.SUCCESS,
                    recorded_by=staff_user,
                    paid_at=timezone.now(),
                )
        except IntegrityError:
            # success_slot unique constraint: order already has a SUCCESS payment (e.g. duplicate retry).
            # The order is already paid; no action needed — proceed normally.
            pass
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
def reject_order(order_id, actor, scope="INDIVIDUAL", reason=""):
    """
    Authoritative order rejection workflow.
    Validates:
      - block_completed: Completed and served orders cannot be rejected.
      - block_entire: If any order in session is completed or served, entire-session rejection is blocked.
      - never_restore: Stock is not restored automatically.
      - release_pending: Table is released when all session orders are cancelled, even if refund is pending.
      - remaining_session: Coupon eligibility evaluated against remaining active session orders.
    """
    order = Order.objects.select_for_update().get(pk=order_id)
    if order.status == Order.Status.CANCELLED:
        return order

    # Rule: block_completed
    if order.status in (Order.Status.COMPLETED, Order.Status.SERVED):
        raise OrderError(
            f"Order #{order.display_number} is {order.status.lower()} and cannot be rejected.",
            "block_completed",
            400,
        )

    root = order.parent_order if order.parent_order_id else order

    if str(scope).upper() == "ENTIRE_SESSION":
        # Rule: block_entire
        all_session = [root] + list(root.continuations.select_for_update().all())
        ineligible = [o for o in all_session if o.status in (Order.Status.COMPLETED, Order.Status.SERVED)]
        if ineligible:
            blocked_refs = ", ".join(f"#{o.display_number} ({o.status})" for o in ineligible)
            raise OrderError(
                f"Cannot reject entire session because the following order(s) are completed or served: {blocked_refs}. You may reject eligible orders individually.",
                "block_entire",
                400,
            )

        # Reject all eligible orders in session
        for ord_item in all_session:
            if ord_item.status != Order.Status.CANCELLED:
                previous = ord_item.status
                ord_item.status = Order.Status.CANCELLED
                ord_item.cancel_reason = reason.strip()
                if ord_item.payment_status == Order.PaymentStatus.PAID:
                    ord_item.refund_status = Order.RefundStatus.PENDING
                else:
                    ord_item.refund_status = Order.RefundStatus.NOT_APPLICABLE
                ord_item.save(update_fields=["status", "cancel_reason", "refund_status", "updated_at"])
                OrderStatusHistory.objects.create(
                    order=ord_item,
                    from_status=previous,
                    to_status=Order.Status.CANCELLED,
                    changed_by=actor,
                    note=reason.strip() or "Session rejected by administrator",
                )
                publish_order_event(ord_item)

        # Rule: remaining_session for coupon
        from apps.coupons.models import CouponRedemption
        CouponRedemption.objects.filter(order=root).delete()
        root.coupon_discount_total = Decimal("0.00")
        root.save(update_fields=["coupon_discount_total", "updated_at"])

        # Release table
        target_table = root.table
        if target_table:
            _release_if_idle(target_table)

        return root
    else:
        # scope == "INDIVIDUAL"
        previous = order.status
        order.status = Order.Status.CANCELLED
        order.cancel_reason = reason.strip()
        if order.payment_status == Order.PaymentStatus.PAID:
            order.refund_status = Order.RefundStatus.PENDING
        else:
            order.refund_status = Order.RefundStatus.NOT_APPLICABLE
        order.save(update_fields=["status", "cancel_reason", "refund_status", "updated_at"])
        OrderStatusHistory.objects.create(
            order=order,
            from_status=previous,
            to_status=Order.Status.CANCELLED,
            changed_by=actor,
            note=reason.strip() or "Order rejected by administrator",
        )
        publish_order_event(order)

        # Rule: remaining_session for coupon
        all_valid = [root] + list(root.continuations.exclude(status=Order.Status.CANCELLED))
        valid_non_cancelled = [o for o in all_valid if o.status != Order.Status.CANCELLED]
        if not valid_non_cancelled or (root.id == order.id and not root.continuations.exclude(status=Order.Status.CANCELLED).exists()):
            from apps.coupons.models import CouponRedemption
            CouponRedemption.objects.filter(order=root).delete()
            root.coupon_discount_total = Decimal("0.00")
            root.save(update_fields=["coupon_discount_total", "updated_at"])
        elif root.coupon_discount_total > 0:
            redemption = root.coupon_redemptions.first()
            if redemption and redemption.coupon:
                c = redemption.coupon
                session_subtotal = sum((o.items_subtotal for o in valid_non_cancelled), Decimal("0.00"))
                session_customization = sum((o.customization_total for o in valid_non_cancelled), Decimal("0.00"))
                session_dish_discount = sum((o.dish_discount_total for o in valid_non_cancelled), Decimal("0.00"))
                qualifying = session_subtotal + session_customization - session_dish_discount
                if c.min_order_amount and qualifying < c.min_order_amount:
                    from apps.coupons.models import CouponRedemption
                    CouponRedemption.objects.filter(order=root).delete()
                    root.coupon_discount_total = Decimal("0.00")
                    root.save(update_fields=["coupon_discount_total", "updated_at"])

        # Release table only if all session orders are now idle/closed
        target_table = order.table or (root.table if root else None)
        if target_table:
            _release_if_idle(target_table)

        return order


@transaction.atomic
def change_status(order_id, new_status, actor, reason=""):
    if new_status == Order.Status.CANCELLED:
        return reject_order(order_id, actor, scope="INDIVIDUAL", reason=reason)
    order = Order.objects.select_for_update().get(pk=order_id)
    if new_status == order.status:
        return order
    if new_status not in TRANSITIONS.get(order.status, ()):
        raise OrderError(f"Cannot move an order from {order.status} to {new_status}.", "invalid_transition", 409)
    previous = order.status
    order.status = new_status
    if new_status == Order.Status.PREPARING and order.accepted_by_id is None:
        order.accepted_by = actor
    if new_status == Order.Status.CANCELLED:
        order.cancel_reason = reason.strip()
        restore_for_order(order)
    if new_status == Order.Status.COMPLETED or (order.order_type == Order.Type.TAKEAWAY and new_status == Order.Status.SERVED):
        # Check if any continuation suborder is still in progress (PENDING or PREPARING)
        root = order.parent_order if order.parent_order_id else order
        active_suborders = root.continuations.filter(status__in=[Order.Status.PENDING, Order.Status.PREPARING]).exclude(pk=order.pk)
        if active_suborders.exists():
            raise OrderError("Cannot complete order while sub-orders are still preparing.", "suborder_in_progress", 400)

        if not order.completed_at:
            order.completed_at = timezone.now()
        # Complete all related session orders (root and active continuations) for dine-in tables
        root = order.parent_order if order.parent_order_id else order
        related_orders = [root] if root.id != order.id and root.status in Order.ACTIVE_STATUSES else []
        for sibling in root.continuations.filter(status__in=Order.ACTIVE_STATUSES):
            if sibling.id != order.id and sibling not in related_orders:
                related_orders.append(sibling)
        for rel in related_orders:
            rel.status = Order.Status.COMPLETED
            if not rel.completed_at:
                rel.completed_at = timezone.now()
            rel.save(update_fields=["status", "completed_at", "updated_at"])
            OrderStatusHistory.objects.create(
                order=rel,
                from_status=rel.status,
                to_status=Order.Status.COMPLETED,
                changed_by=actor,
                note=f"Completed together with order {order.id} upon Proceed to Bill",
            )
            publish_order_event(rel)
    order.save()
    OrderStatusHistory.objects.create(order=order, from_status=previous, to_status=new_status, changed_by=actor,
                                      note=reason.strip() or "Status updated via Proceed to Bill")
    if new_status == Order.Status.CANCELLED:
        # Automatically make the table AVAILABLE only when all orders on it are cancelled
        target_table = order.table or (order.parent_order.table if order.parent_order else None)
        if target_table:
            _release_if_idle(target_table)
        root = order.parent_order if order.parent_order_id else order
        if root and root.table and (not target_table or root.table_id != target_table.id):
            _release_if_idle(root.table)

    if new_status == Order.Status.COMPLETED or (order.order_type == Order.Type.TAKEAWAY and new_status == Order.Status.SERVED):
        # E-bill after completion or takeaway serving.
        from apps.billing.services import ensure_final_invoice
        try:
            ensure_final_invoice(order)
        except Exception:
            pass
    publish_order_event(order)
    return order