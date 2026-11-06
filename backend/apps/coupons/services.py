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

from django.db import transaction
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
    # A customer is first-time only if they have NO non-cancelled and non-failed orders,
    # and NO active redemptions for a first-time coupon.
    has_orders = Order.objects.filter(customer=customer).exclude(
        status=Order.Status.CANCELLED
    ).exclude(
        payment_status=Order.PaymentStatus.FAILED
    ).exists()
    return not has_orders


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
            used = CouponRedemption.objects.filter(coupon=coupon, customer=customer).exclude(
                order__status=Order.Status.CANCELLED
            ).exclude(
                order__payment_status=Order.PaymentStatus.FAILED
            )
            if exclude_order is not None:
                used = used.exclude(order=exclude_order)
            if used.exists():
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


def _best_auto(coupons, branch, qualifying_amount, customer, first, now, remaining, already):
    best = None
    for c in coupons:
        if c.pk in already:
            continue
        if ineligible_reason(c, branch, qualifying_amount, customer, first, now) is not None:
            continue
        amount = discount_for(c, remaining)
        if amount <= 0:
            continue
        if best is None or amount > best.amount:
            best = AppliedCoupon(c, amount, auto=True)
    return best


def apply_coupons(branch, qualifying_amount, customer, codes=None, now=None, allow_auto=True):
    """Decide which coupons apply to an order whose amount (after dish discounts) is `qualifying_amount`."""
    now = now or timezone.now()
    first = is_first_time(customer)
    out = CouponOutcome(first_time=first)
    remaining = qualifying_amount

    if first:  # automatic first-time coupon: the eligible one that saves the most
        best = _best_auto(
            Coupon.objects.filter(branch=branch, is_first_time_auto=True, is_active=True),
            branch, qualifying_amount, customer, first, now, qualifying_amount, set())
        if best:
            out.applied.append(best)
            remaining -= best.amount

    codes = normalise_codes(codes)
    if allow_auto and not codes:
        best = _best_auto(
            Coupon.objects.filter(branch=branch, auto_apply=True, is_active=True),
            branch, qualifying_amount, customer, first, now, remaining,
            {a.coupon.pk for a in out.applied})
        if best:
            out.applied.append(best)
            remaining -= best.amount
    for i, code in enumerate(codes):
        if i >= 1:
            out.rejected.append((code, "Only one additional coupon is allowed per order." if first
                                 else "Only one coupon can be used per order."))
            continue
        coupon = Coupon.objects.filter(branch=branch, code__iexact=code).first()
        if coupon is None:
            out.rejected.append((code, "Invalid coupon code."))
        elif any(a.coupon.pk == coupon.pk for a in out.applied):
            out.rejected.append((code, "This coupon is already applied automatically."))
        else:
            # Check higher-value priority rule: if a higher minimum order coupon is available/entered,
            # lower-value coupons are disabled.
            if coupon.min_order_value < Decimal("500") and qualifying_amount >= Decimal("500"):
                higher_exists = Coupon.objects.filter(
                    branch=branch, is_active=True, min_order_value__gte=Decimal("500"), min_order_value__lte=qualifying_amount
                ).exists()
                if higher_exists:
                    reason = "A higher-value coupon is eligible for this order."
                else:
                    reason = ineligible_reason(coupon, branch, qualifying_amount, customer, first, now)
            else:
                reason = ineligible_reason(coupon, branch, qualifying_amount, customer, first, now)

            if reason:
                out.rejected.append((code, reason))
            else:
                amount = discount_for(coupon, remaining)
                out.applied.append(AppliedCoupon(coupon, amount))
                remaining -= amount
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
