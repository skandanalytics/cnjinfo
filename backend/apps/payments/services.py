"""Online and counter payments.

One SUCCESS row per order (success_slot). A verified capture marks the order PAID.
A verified failure marks the payment and the order FAILED and restores stock once.
Replaying the same event id does nothing the second time.
"""
import json
from decimal import Decimal

from django.db import IntegrityError, transaction
from django.utils import timezone

from apps.inventory.services import restore_for_order
from apps.orders.models import Order

from .gateway import (
    GatewayError,
    checkout_secret,
    get_gateway,
    keys_configured,
    verify_checkout_signature,
    verify_webhook_signature,
    webhook_secret,
)
from .models import Payment, PaymentEvent

ONLINE_METHODS = {
    Payment.Method.UPI, Payment.Method.CARD, Payment.Method.NETBANKING, Payment.Method.WALLET,
}
PAYABLE = {Order.PaymentStatus.UNPAID, Order.PaymentStatus.FAILED, Order.PaymentStatus.PENDING}


class PaymentError(Exception):
    def __init__(self, detail, code="payment_error", status=400):
        super().__init__(detail)
        self.detail, self.code, self.http_status = detail, code, status


def serialize_payment(payment):
    return {
        "id": payment.id,
        "order_id": payment.order_id,
        "method": payment.method,
        "amount": str(payment.amount),
        "status": payment.status,
        "razorpay_order_id": payment.razorpay_order_id,
        "razorpay_payment_id": payment.razorpay_payment_id,
        "failure_reason": payment.failure_reason,
        "paid_at": payment.paid_at,
        "created_at": payment.created_at,
    }


def _lock_order(order_id):
    return Order.objects.select_for_update().get(pk=order_id)


def _already_paid(order):
    return order.payment_status == Order.PaymentStatus.PAID or Payment.objects.filter(
        order_id=order.id, status=Payment.Status.SUCCESS).exists()


@transaction.atomic
def start_online(customer, order_id, method):
    if method not in ONLINE_METHODS:
        raise PaymentError("Choose an online payment method.", "invalid_method")
    try:
        order = _lock_order(order_id)
    except Order.DoesNotExist:
        raise PaymentError("Not found.", "not_found", 404)
    if order.customer_id != customer.id:
        raise PaymentError("Not found.", "not_found", 404)
    if order.status == Order.Status.CANCELLED:
        raise PaymentError("This order is cancelled.", "order_cancelled", 409)
    if order.payment_status not in PAYABLE:
        raise PaymentError("This order cannot be paid online.", "not_payable", 409)
    if _already_paid(order):
        raise PaymentError("This order is already paid.", "already_paid", 409)
    # Empty keys always fail closed. A test double is used only after override_settings supplies keys,
    # and only when a test has installed one; otherwise the real client would run.
    if not keys_configured():
        raise PaymentError("Online payments are not configured.", "payments_unconfigured", 503)
    gateway = get_gateway()
    if gateway is None:
        raise PaymentError("Online payments are not configured.", "payments_unconfigured", 503)
    try:
        razorpay_order_id = gateway.create_order(
            order.total_amount, order.order_number, {"order_id": order.id, "order_number": order.order_number})
    except GatewayError as exc:
        raise PaymentError(exc.detail, exc.code, 502)
    payment = Payment.objects.create(
        order=order, method=method, amount=order.total_amount, status=Payment.Status.PENDING,
        razorpay_order_id=razorpay_order_id,
    )
    if order.payment_status != Order.PaymentStatus.PENDING:
        order.payment_status = Order.PaymentStatus.PENDING
        order.save(update_fields=["payment_status", "updated_at"])
    return payment


@transaction.atomic
def verify_checkout(customer, razorpay_order_id, razorpay_payment_id, signature):
    secret = checkout_secret()
    if not keys_configured() or not secret:
        raise PaymentError("Online payments are not configured.", "payments_unconfigured", 503)
    if not verify_checkout_signature(razorpay_order_id, razorpay_payment_id, signature, secret):
        raise PaymentError("Invalid signature.", "invalid_signature", 400)
    payment = Payment.objects.select_for_update().filter(razorpay_order_id=razorpay_order_id).first()
    if payment is None or payment.order.customer_id != customer.id:
        raise PaymentError("Not found.", "not_found", 404)
    event_id = f"checkout:{razorpay_payment_id}"
    payload = {
        "razorpay_order_id": razorpay_order_id,
        "razorpay_payment_id": razorpay_payment_id,
    }
    return _apply_capture(payment, razorpay_payment_id, signature, event_id, "checkout.captured", payload)


@transaction.atomic
def process_webhook(raw_body, signature, event_id_header=""):
    if not keys_configured():
        raise PaymentError("Online payments are not configured.", "payments_unconfigured", 503)
    secret = webhook_secret()
    if not verify_webhook_signature(raw_body, signature, secret):
        raise PaymentError("Invalid signature.", "invalid_signature", 400)
    try:
        payload = json.loads(raw_body.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError):
        raise PaymentError("Invalid payload.", "invalid_payload", 400)
    if not isinstance(payload, dict):
        raise PaymentError("Invalid payload.", "invalid_payload", 400)
    event_type = str(payload.get("event") or "")
    event_id = (event_id_header or str(payload.get("id") or "")).strip()
    if not event_id:
        raise PaymentError("Missing event id.", "invalid_payload", 400)
    if PaymentEvent.objects.filter(event_id=event_id).exists():
        return {"duplicate": True}

    entity = ((payload.get("payload") or {}).get("payment") or {}).get("entity") or {}
    razorpay_order_id = entity.get("order_id")
    razorpay_payment_id = entity.get("id") or ""
    payment = None
    if razorpay_order_id:
        payment = Payment.objects.select_for_update().filter(razorpay_order_id=razorpay_order_id).first()
    if event_type == "payment.captured":
        if payment is None:
            raise PaymentError("Unknown payment.", "unknown_payment", 404)
        _apply_capture(payment, razorpay_payment_id, signature or "", event_id, event_type, payload,
                       provider_amount=entity.get("amount"))
        return {"duplicate": False}
    if event_type == "payment.failed":
        if payment is None:
            raise PaymentError("Unknown payment.", "unknown_payment", 404)
        reason = entity.get("error_description") or entity.get("error_reason") or "Payment failed"
        _apply_failure(payment, str(reason), event_id, event_type, payload)
        return {"duplicate": False}
    _remember(event_id, event_type or "ignored", payload, payment)
    return {"ignored": True}


def _apply_capture(payment, razorpay_payment_id, signature, event_id, event_type, payload, provider_amount=None):
    payment = Payment.objects.select_for_update().get(pk=payment.pk)
    order = _lock_order(payment.order_id)
    if PaymentEvent.objects.filter(event_id=event_id).exists():
        return payment
    if provider_amount is not None:
        expected = int((payment.amount * 100).quantize(Decimal("1")))
        try:
            reported = int(provider_amount)
        except (TypeError, ValueError):
            reported = -1
        if reported != expected:
            raise PaymentError("The captured amount does not match the order.", "amount_mismatch", 400)
    if payment.status == Payment.Status.SUCCESS and payment.razorpay_payment_id == razorpay_payment_id:
        _remember(event_id, event_type, payload, payment)
        return payment
    if _already_paid(order) and payment.status != Payment.Status.SUCCESS:
        _remember(event_id, event_type, payload, payment)
        raise PaymentError("This order is already paid.", "already_paid", 409)
    payment.razorpay_payment_id = razorpay_payment_id or payment.razorpay_payment_id
    payment.razorpay_signature = signature or ""
    payment.status = Payment.Status.SUCCESS
    payment.paid_at = payment.paid_at or timezone.now()
    payment.failure_reason = ""
    try:
        with transaction.atomic():
            payment.save()
    except IntegrityError:
        raise PaymentError("This order is already paid.", "already_paid", 409)
    order.payment_status = Order.PaymentStatus.PAID
    order.save(update_fields=["payment_status", "updated_at"])
    _remember(event_id, event_type, payload, payment)
    return payment


def _apply_failure(payment, reason, event_id, event_type, payload):
    payment = Payment.objects.select_for_update().get(pk=payment.pk)
    order = _lock_order(payment.order_id)
    if PaymentEvent.objects.filter(event_id=event_id).exists():
        return payment
    if payment.status == Payment.Status.SUCCESS or order.payment_status == Order.PaymentStatus.PAID:
        _remember(event_id, event_type, payload, payment)
        return payment
    first_failure = payment.status != Payment.Status.FAILED and order.payment_status != Order.PaymentStatus.FAILED
    if payment.status != Payment.Status.FAILED:
        payment.status = Payment.Status.FAILED
        payment.failure_reason = reason[:255]
        payment.save()
    if order.payment_status != Order.PaymentStatus.PAID and order.payment_status != Order.PaymentStatus.FAILED:
        order.payment_status = Order.PaymentStatus.FAILED
        order.save(update_fields=["payment_status", "updated_at"])
    if first_failure:
        restore_for_order(order)
    _remember(event_id, event_type, payload, payment)
    return payment


def _remember(event_id, event_type, payload, payment):
    if PaymentEvent.objects.filter(event_id=event_id).exists():
        return
    try:
        with transaction.atomic():
            PaymentEvent.objects.create(
                payment=payment, event_id=event_id, event_type=event_type[:100],
                payload=payload if isinstance(payload, dict) else {}, signature_valid=True,
                processed_at=timezone.now(),
            )
    except IntegrityError:
        return


@transaction.atomic
def record_counter(staff_user, order_id, amount=None):
    from apps.accounts.scoping import can_access_branch
    order = Order.objects.select_for_update().filter(pk=order_id).first()
    if order is None or not can_access_branch(staff_user, order.branch_id):
        raise PaymentError("Not found.", "not_found", 404)
    from apps.accounts.models import Employee
    from apps.accounts.staff_catalog import parse_bill_access
    cashier = Employee.objects.filter(user=staff_user, role=Employee.Role.CASHIER).first()
    if cashier is not None:
        duties = parse_bill_access(cashier.bill_access)
        if duties and "counter_payment" not in duties:
            raise PaymentError("This cashier is not allowed to record counter payments.", "bill_access_denied", 403)
    if order.status == Order.Status.CANCELLED:
        raise PaymentError("This order is cancelled.", "order_cancelled", 409)
    if _already_paid(order):
        raise PaymentError("This order is already paid.", "already_paid", 409)
    if amount is not None and Decimal(amount) != order.total_amount:
        raise PaymentError("The amount must equal the order total.", "amount_mismatch")
    try:
        with transaction.atomic():
            payment = Payment.objects.create(
                order=order, method=Payment.Method.COUNTER, amount=order.total_amount,
                status=Payment.Status.SUCCESS, recorded_by=staff_user, paid_at=timezone.now(),
            )
    except IntegrityError:
        raise PaymentError("This order is already paid.", "already_paid", 409)
    order.payment_status = Order.PaymentStatus.PAID
    order.save(update_fields=["payment_status", "updated_at"])
    return payment
