"""Central pricing service. The ONLY place order totals are computed; menu, cart, checkout, orders and invoices
all use it. The browser never supplies a price.

Calculation order (rates come from the branch; the SRS gives no values, so they default to 0 until configured):

    items_subtotal        = sum(base_price x qty)
    customization_total   = sum(selected option prices x qty)
    dish_discount_total   = sum(per-unit dish discount x qty)          (discount applies to the base price only)
    merchandise           = items_subtotal + customization_total - dish_discount_total
    coupon_discount_total = coupons applied one after another on `merchandise` (see coupons.services)
    food_after_coupon     = merchandise - coupon_discount_total
    takeaway_charge       = branch.takeaway_charge for TAKEAWAY orders (flat per order), else 0
    taxable_amount        = food_after_coupon + takeaway_charge
    gst_amount            = taxable_amount x gst_rate%
    service_charge_amount = food_after_coupon x tier rate               (not charged on the takeaway charge)
    total_amount          = taxable_amount + gst_amount + service_charge_amount

Every amount is rounded half-up to 2 decimals at each step and totals are sums of the rounded parts.
These formulas follow the legacy frontend's `pricing.js` and are UNCONFIRMED against the SRS (docs: Q3).
"""
from dataclasses import dataclass, field
from decimal import ROUND_HALF_UP, Decimal

from django.db.models import Q
from django.utils import timezone

from apps.branches.models import Branch
from apps.coupons.services import apply_coupons, offer_progress
from apps.menu.models import CustomizationOption, Food
from apps.menu.pricing_helpers import current_discount, inventory_of, is_orderable, money, unit_discount

MAX_QTY_PER_LINE = 99
ZERO = Decimal("0.00")


def service_charge_for(food_after_coupon, configured_rate):
    """Service charge on the food amount after discounts, before this charge and before round-off.

    Up to 999: 0%. Above 999 through 1,999: 1%. Above 1,999 through 20,000: 2%.
    Above 20,000 the branch's configured rate is kept, because no higher tier is defined.
    """
    base = money(food_after_coupon)
    if base <= Decimal("999"):
        rate = Decimal("0.00")
    elif base <= Decimal("1999"):
        rate = Decimal("1.00")
    elif base <= Decimal("20000"):
        rate = Decimal("2.00")
    else:
        rate = money(configured_rate or 0)
    return rate, money(base * rate / Decimal("100"))


class PricingError(Exception):
    def __init__(self, errors):
        super().__init__("; ".join(e["detail"] for e in errors))
        self.errors = errors  # [{"line": index, "detail": "..."}]


@dataclass
class Line:
    food_id: int
    quantity: int
    option_ids: list = field(default_factory=list)
    special_instructions: str = ""


def _load_lines(branch, lines):
    errors, resolved = [], []
    food_ids = {l.food_id for l in lines}
    if branch.is_primary:
        foods_qs = Food.objects.filter(pk__in=food_ids, branch=branch)
    else:
        primary = Branch.objects.filter(is_primary=True, is_active=True).first()
        branch_q = Q(branch=branch)
        if primary:
            branch_q |= Q(branch=primary)
        foods_qs = Food.objects.filter(pk__in=food_ids).filter(branch_q)
    foods = {f.pk: f for f in foods_qs.select_related("inventory").prefetch_related("discounts")}
    option_ids = {o for l in lines for o in l.option_ids}
    options = {o.pk: o for o in CustomizationOption.objects.filter(pk__in=option_ids)}
    wanted_per_food = {}
    for i, l in enumerate(lines):
        food = foods.get(l.food_id)
        if food is None:
            errors.append({"line": i, "detail": "Dish not found at this branch."})
            continue
        if not (1 <= l.quantity <= MAX_QTY_PER_LINE):
            errors.append({"line": i, "detail": f"Quantity must be between 1 and {MAX_QTY_PER_LINE}."})
            continue
        if not is_orderable(food):
            errors.append({"line": i, "detail": f"'{food.name}' is not available."})
            continue
        opts = []
        for oid in dict.fromkeys(l.option_ids):  # de-duplicate, keep order
            o = options.get(oid)
            if o is None or o.food_id != food.pk or not o.is_active:
                errors.append({"line": i, "detail": f"Invalid customization for '{food.name}'."})
                break
            opts.append(o)
        else:
            wanted_per_food[food.pk] = wanted_per_food.get(food.pk, 0) + l.quantity
            resolved.append((i, l, food, opts))
    for _, l, food, _ in resolved:  # stock check across all lines of the same dish
        inv = inventory_of(food)
        if inv is not None and wanted_per_food[food.pk] > inv.quantity:
            errors.append({"line": -1, "detail": f"Only {inv.quantity} of '{food.name}' left."})
    if errors:
        raise PricingError(list({e["detail"]: e for e in errors}.values()))
    return resolved


def price_order(branch, lines, order_type, customer=None, coupon_codes=None, now=None, allow_auto=True, service_tax_enabled=True):
    """Return a dict breakdown for the cart. Raises PricingError when any line is invalid."""
    now = now or timezone.now()
    if not lines:
        raise PricingError([{"line": -1, "detail": "The cart is empty."}])
    resolved = _load_lines(branch, lines)

    items, items_subtotal, custom_total, discount_total = [], ZERO, ZERO, ZERO
    for _, l, food, opts in resolved:
        base = money(food.price)
        custom_unit = money(sum((o.extra_price for o in opts), Decimal("0")))
        disc, _ = current_discount(food, now)
        disc_unit = unit_discount(food.price, disc) if disc else ZERO
        qty = l.quantity
        items_subtotal += base * qty
        custom_total += custom_unit * qty
        discount_total += disc_unit * qty
        items.append({
            "food_id": food.pk, "name": food.name, "quantity": qty,
            "unit_price": base, "customizations": [{"id": o.pk, "name": o.name, "extra_price": money(o.extra_price)}
                                                   for o in opts],
            "customization_per_unit": custom_unit, "dish_discount_per_unit": disc_unit,
            "final_unit_price": base + custom_unit - disc_unit,
            "line_total": (base + custom_unit - disc_unit) * qty,
            "special_instructions": l.special_instructions,
        })

    merchandise = items_subtotal + custom_total - discount_total
    outcome = apply_coupons(branch, merchandise, customer, coupon_codes, now, allow_auto=allow_auto)
    coupon_total = sum((a.amount for a in outcome.applied), ZERO)
    food_after_coupon = merchandise - coupon_total
    # For every takeaway order, apply a packing charge of ₹10 per item quantity:
    # Packing Charges = Total takeaway item quantities × ₹10
    total_item_quantity = sum((l.quantity for _, l, _, _ in resolved), 0)
    takeaway = money(Decimal(total_item_quantity) * Decimal("10.00")) if order_type == "TAKEAWAY" else ZERO
    taxable = food_after_coupon + takeaway
    gst = money(taxable * branch.gst_rate / 100)
    if service_tax_enabled and order_type != "TAKEAWAY":
        service_rate, service = service_charge_for(food_after_coupon, branch.service_charge_rate)
    else:
        service_rate, service = Decimal("0.00"), Decimal("0.00")
    raw_total = taxable + gst + service
    payable = raw_total.quantize(Decimal("1"), rounding=ROUND_HALF_UP)
    round_off = payable - raw_total

    return {
        "order_type": order_type, "items": items,
        "items_subtotal": items_subtotal, "customization_total": custom_total,
        "dish_discount_total": discount_total, "merchandise_total": merchandise,
        "coupons": [{"code": a.coupon.code, "coupon_id": a.coupon.pk, "discount": a.amount, "auto_applied": a.auto}
                    for a in outcome.applied],
        "rejected_coupons": [{"code": c, "reason": r} for c, r in outcome.rejected],
        "coupon_discount_total": coupon_total, "takeaway_charge": takeaway, "taxable_amount": taxable,
        "gst_rate": branch.gst_rate, "gst_amount": gst,
        "service_charge_rate": service_rate, "service_charge_amount": service,
        "amount_before_round": raw_total, "round_off": round_off, "total_amount": payable,
        "is_first_time_customer": outcome.first_time,
        "offer_progress": offer_progress(branch, merchandise, customer, outcome.applied, now),
        "_applied_coupons": outcome.applied,  # internal: consumed by order creation (Phase 7), stripped for APIs
    }


def public_breakdown(breakdown):
    """JSON-safe copy without internal objects. Decimals become 2-place strings."""
    def conv(v):
        if isinstance(v, Decimal):
            return str(v)
        if isinstance(v, dict):
            return {k: conv(x) for k, x in v.items()}
        if isinstance(v, list):
            return [conv(x) for x in v]
        return v
    return conv({k: v for k, v in breakdown.items() if not k.startswith("_")})
