"""Coupon rules (SRS 3.1.5).

* First-time customer = verified customer with no COMPLETED order. Anonymous buyers are never first-time.
* First-time customer: the eligible first-time coupon is applied automatically, plus at most ONE extra coupon
  that they enter.  Everyone else: at most ONE coupon per order.
* A coupon with auto_apply is applied on its own when the order qualifies and the customer did not enter a
  different code. If several qualify, the one that saves the most is used. A code the customer enters replaces it.
* A first-time coupon can be redeemed only once per customer (while the earlier order is not cancelled), so a
  customer with a placed-but-not-completed order cannot use it again.
* Coupons are applied one after another on the remaining amount, never beyond the order value.
* Minimum order value is compared with the amount after dish discounts (>= minimum qualifies).
"""
from dataclasses import dataclass, field
from decimal import Decimal

from django.db import models, transaction
from django.utils import timezone

from apps.menu.pricing_helpers import money
from apps.orders.models import Order

from .models import Coupon, CouponRedemption


class CouponError(Exception):
    pass


@dataclass
class AppliedCoupon:
    coupon: Coupon
    amount: Decimal
    auto: bool = False


@dataclass
class CouponOutcome:
    applied: list = field(default_factory=list)
    rejected: list = field(default_factory=list)  # [(code, reason)]
    first_time: bool = False


class NewCustomer:
    """A phone number with no account yet (staff-assisted order): first-time by definition, never persisted."""

    pk = None


def is_first_time(customer):
    if customer is None:
        return False  # anonymous buyers are never first-time
    if isinstance(customer, NewCustomer):
        return True

    customer_id = getattr(customer, "id", None) or getattr(customer, "pk", None)
    if not customer_id:
        return True

    from apps.orders.models import Order
    # Authoritative backend check:
    # A customer qualifies as a first-time customer if they have never completed a successful paid order.
    # An unpaid or rejected order does not count as a successful completed purchase.
    # A fully refunded and cancelled order does not count as a retained completed purchase (restores eligibility).
    # A partially refunded completed order still counts as a previous purchase.
    # A completed purchase with a retained payment qualifies as a previous successful purchase.
    orders = Order.objects.filter(customer_id=customer_id).exclude(
        payment_status=Order.PaymentStatus.FAILED
    ).filter(
        models.Q(payment_status=Order.PaymentStatus.PAID) |
        models.Q(payments__status="SUCCESS") |
        models.Q(status=Order.Status.COMPLETED)
    ).distinct()

    for ord_obj in orders:
        # If cancelled and fully refunded -> does not disqualify (restores eligibility)
        if ord_obj.status == Order.Status.CANCELLED and ord_obj.refund_status == Order.RefundStatus.FULLY_REFUNDED:
            continue
        # Any other paid or completed order disqualifies first-time status
        return False

    return True


def usage_count(coupon, exclude_order=None):
    qs = coupon.redemptions.exclude(order__status=Order.Status.CANCELLED)
    if exclude_order is not None:
        qs = qs.exclude(order=exclude_order)
    return qs.count()


def discount_for(coupon, amount):
    if coupon.discount_type == Coupon.Type.PERCENT:
        value = money(amount * coupon.discount_value / 100)
        if coupon.max_discount is not None:
            value = min(value, coupon.max_discount)
    else:
        value = money(coupon.discount_value)
    return max(Decimal("0.00"), min(value, amount))


def ineligible_reason(coupon, branch, qualifying_amount, customer, first_time, now, exclude_order=None):
    if not coupon.is_active:
        return "This coupon is not active."
    if coupon.branch_id != branch.id:
        return "This coupon is not valid at this branch."
    if now < coupon.valid_from:
        return "This coupon is not valid yet."
    if now > coupon.valid_to:
        return "This coupon has expired."
    if coupon.usage_limit is not None and usage_count(coupon, exclude_order) >= coupon.usage_limit:
        return "This coupon has reached its usage limit."
    if qualifying_amount < coupon.min_order_value:
        return f"Add items worth Rs {money(coupon.min_order_value - qualifying_amount)} more to use this coupon."
    if coupon.is_first_time_auto:
        if not first_time:
            return "This coupon is only for first-time customers."
        if getattr(customer, "pk", None) is not None:
            used = CouponRedemption.objects.filter(coupon=coupon, customer=customer)
            if exclude_order is not None:
                used = used.exclude(order=exclude_order)
            # Fully refunded cancelled orders do not count as retained usage
            retained_used = used.exclude(
                order__status=Order.Status.CANCELLED,
                order__refund_status=Order.RefundStatus.FULLY_REFUNDED
            ).exclude(
                order__payment_status=Order.PaymentStatus.FAILED
            )
            if retained_used.exists():
                return "You have already used this coupon."
    return None


def normalise_codes(codes):
    seen, out = set(), []
    for c in codes or []:
        code = str(c).strip().upper()
        if code and code not in seen:
            seen.add(code)
            out.append(code)
    return out


def _best_auto(coupons, branch, qualifying_amount, customer, first, now, remaining, already, exclude_order=None):
    best = None
    for c in coupons:
        if c.pk in already:
            continue
        if ineligible_reason(c, branch, qualifying_amount, customer, first, now, exclude_order=exclude_order) is not None:
            continue
        amount = discount_for(c, remaining)
        if amount <= 0:
            continue
        if best is None or amount > best.amount:
            best = AppliedCoupon(c, amount, auto=True)
    return best


def apply_coupons(branch, qualifying_amount, customer, codes=None, now=None, allow_auto=True, exclude_order=None):
    """Decide which coupons apply to an order whose amount (after dish discounts) is `qualifying_amount`.
    Option B: Apply New User Coupon first, then calculate the second coupon on the remaining eligible subtotal.
    """
    now = now or timezone.now()
    first = is_first_time(customer)
    out = CouponOutcome(first_time=first)
    remaining = qualifying_amount

    clean_codes = normalise_codes(codes)
    if not clean_codes:
        if allow_auto:
            if first:
                best_first = _best_auto(
                    Coupon.objects.filter(branch=branch, is_first_time_auto=True, is_active=True),
                    branch, qualifying_amount, customer, first, now, remaining, set(),
                    exclude_order=exclude_order
                )
                if best_first:
                    out.applied.append(best_first)
                    remaining -= best_first.amount

            best_reg = _best_auto(
                Coupon.objects.filter(branch=branch, auto_apply=True, is_active=True),
                branch, qualifying_amount, customer, first, now, remaining,
                {a.coupon.pk for a in out.applied},
                exclude_order=exclude_order
            )
            if best_reg:
                out.applied.append(best_reg)
                remaining -= best_reg.amount
        return out

    # Resolve codes to coupon objects
    resolved_coupons = []
    for code in clean_codes:
        coupon = Coupon.objects.filter(branch=branch, code__iexact=code).first()
        if coupon is None:
            out.rejected.append((code, "Invalid coupon code."))
        else:
            resolved_coupons.append(coupon)

    # Separate New User coupons and regular coupons
    new_user_coupons = [c for c in resolved_coupons if c.is_first_time_auto]
    regular_coupons = [c for c in resolved_coupons if not c.is_first_time_auto]

    if not first:
        for c in new_user_coupons:
            out.rejected.append((c.code, "This coupon is only for first-time customers."))
        if len(regular_coupons) > 1:
            for c in regular_coupons[1:]:
                out.rejected.append((c.code, "Only one coupon can be used per order."))
        eligible_to_apply = regular_coupons[:1]
    else:
        if len(new_user_coupons) > 1:
            for c in new_user_coupons[1:]:
                out.rejected.append((c.code, "Only one New User coupon can be applied."))
        if len(regular_coupons) > 1:
            for c in regular_coupons[1:]:
                out.rejected.append((c.code, "Only one additional coupon is allowed per order."))

        # If user did not manually enter a New User coupon, auto-apply the best one
        if not new_user_coupons and allow_auto:
            best_first = _best_auto(
                Coupon.objects.filter(branch=branch, is_first_time_auto=True, is_active=True),
                branch, qualifying_amount, customer, first, now, remaining, set(),
                exclude_order=exclude_order
            )
            if best_first:
                out.applied.append(best_first)
                remaining -= best_first.amount

        # Mandatory sequential calculation: New User coupon FIRST (if entered), then regular coupon
        eligible_to_apply = []
        if new_user_coupons:
            eligible_to_apply.append(new_user_coupons[0])
        if regular_coupons:
            eligible_to_apply.append(regular_coupons[0])

    for c in eligible_to_apply:
        reason = ineligible_reason(c, branch, qualifying_amount, customer, first, now, exclude_order=exclude_order)
        if reason:
            out.rejected.append((c.code, reason))
            continue

        amount = discount_for(c, remaining)
        amount = min(amount, remaining)
        if amount > Decimal("0.00"):
            out.applied.append(AppliedCoupon(c, amount))
            remaining = max(Decimal("0.00"), remaining - amount)
        else:
            out.rejected.append((c.code, "Coupon does not provide any discount on this order."))

    return out


def offer_progress(branch, qualifying_amount, customer, applied=(), now=None):
    """Nearest offer the customer has not unlocked yet and how much more they must add (SRS floating bar)."""
    now = now or timezone.now()
    first = is_first_time(customer)
    applied_ids = {a.coupon.pk for a in applied}
    best = None
    for c in Coupon.objects.filter(branch=branch, is_active=True, valid_from__lte=now, valid_to__gte=now,
                                   min_order_value__gt=qualifying_amount).exclude(pk__in=applied_ids):
        if ineligible_reason(c, branch, c.min_order_value, customer, first, now) is not None:
            continue  # unreachable for this customer (expired, used up, first-time only, ...)
        if best is None or c.min_order_value < best.min_order_value:
            best = c
    if best is None:
        return None
    return {"coupon_code": best.code, "description": best.description, "min_order_value": str(best.min_order_value),
            "remaining_amount": str(money(best.min_order_value - qualifying_amount)),
            "is_first_time_offer": best.is_first_time_auto}


@transaction.atomic
def redeem(order, applied):
    """Record redemptions for a freshly created order. Rechecks limits under a row lock; idempotent per order."""
    now = timezone.now()
    for a in sorted(applied, key=lambda x: x.coupon.pk):
        coupon = Coupon.objects.select_for_update().get(pk=a.coupon.pk)
        if CouponRedemption.objects.filter(coupon=coupon, order=order).exists():
            continue
        if coupon.usage_limit is not None and usage_count(coupon, order) >= coupon.usage_limit:
            raise CouponError(f"Coupon {coupon.code} has reached its usage limit.")
        if coupon.is_first_time_auto and order.customer_id:
            if CouponRedemption.objects.filter(coupon=coupon, customer=order.customer).exclude(
                    order__status=Order.Status.CANCELLED).exclude(
                    order__payment_status=Order.PaymentStatus.FAILED).exists():
                raise CouponError(f"Coupon {coupon.code} was already used.")
        if now > coupon.valid_to or not coupon.is_active:
            raise CouponError(f"Coupon {coupon.code} is no longer valid.")
        CouponRedemption.objects.create(coupon=coupon, coupon_code=coupon.code, order=order,
                                        customer=order.customer, discount_amount=a.amount)
