"""Server-side cart. Prices are never stored: every read re-prices the cart through the central pricing service,
so menu edits, discounts, coupons and stock changes are always reflected and the browser can't influence totals."""
import hashlib
import secrets
from dataclasses import dataclass
from typing import Optional

from django.db import IntegrityError, transaction

from apps.accounts.models import User
from apps.branches.models import DiningTable
from apps.coupons.models import Coupon
from apps.menu.images import display_image
from apps.orders.pricing import MAX_QTY_PER_LINE, Line, PricingError, price_order, public_breakdown

from .models import Cart, CartItem


class CartError(Exception):
    def __init__(self, detail, code="cart_error"):
        super().__init__(detail)
        self.detail, self.code = detail, code


def hash_token(token):
    return hashlib.sha256(token.encode()).hexdigest()  # only the hash is stored


def new_guest_token():
    return secrets.token_urlsafe(32)


@dataclass
class Identity:
    user: Optional[User] = None
    guest_hash: Optional[str] = None


def _active(identity, branch):
    qs = Cart.objects.filter(branch=branch, status=Cart.Status.ACTIVE)
    return qs.filter(user=identity.user) if identity.user else qs.filter(guest_token=identity.guest_hash)


def get_cart(identity, branch):
    return _active(identity, branch).first()


def get_or_create_cart(identity, branch):
    """One active cart per owner and branch; the UNIQUE active_slot makes concurrent creates safe."""
    cart = get_cart(identity, branch)
    if cart:
        return cart
    try:
        with transaction.atomic():
            return Cart.objects.create(user=identity.user, guest_token=None if identity.user else identity.guest_hash,
                                       branch=branch)
    except IntegrityError:
        return _active(identity, branch).get()


def _option_ids(item):
    return tuple(sorted(o.pk for o in item.options.all()))


def _key(food_id, option_ids, instructions):
    return (food_id, tuple(sorted(option_ids)), (instructions or "").strip())


def _validate_line(cart, food_id, qty, option_ids):
    try:
        price_order(cart.branch, [Line(food_id, qty, list(option_ids))], cart.order_type, None, [])
    except PricingError as exc:
        raise CartError("; ".join(e["detail"] for e in exc.errors), "item_invalid")


@transaction.atomic
def add_item(cart, food_id, quantity, option_ids=(), instructions=""):
    cart = Cart.objects.select_for_update().get(pk=cart.pk)  # serialises concurrent adds to the same cart
    option_ids = list(dict.fromkeys(option_ids))
    wanted = _key(food_id, option_ids, instructions)
    existing = next((i for i in cart.items.prefetch_related("options")
                     if _key(i.food_id, _option_ids(i), i.special_instructions) == wanted), None)
    total = quantity + (existing.quantity if existing else 0)
    if total > MAX_QTY_PER_LINE:
        raise CartError(f"You can order at most {MAX_QTY_PER_LINE} of one item.", "quantity_limit")
    _validate_line(cart, food_id, total, option_ids)
    if existing:
        existing.quantity = total
        existing.save(update_fields=["quantity", "updated_at"])
        return existing
    item = CartItem.objects.create(cart=cart, food_id=food_id, quantity=quantity,
                                   special_instructions=(instructions or "").strip())
    item.options.set(option_ids)
    return item


@transaction.atomic
def set_quantity(item, quantity):
    return update_line(item, quantity=quantity)


@transaction.atomic
def update_line(item, quantity=None, option_ids=None, instructions=None):
    """Update quantity, selected add-ons, or notes on an existing cart line. Totals are repriced on read."""
    qty = item.quantity if quantity is None else quantity
    if not 1 <= qty <= MAX_QTY_PER_LINE:
        raise CartError(f"Quantity must be between 1 and {MAX_QTY_PER_LINE}.", "quantity_limit")
    opts = _option_ids(item) if option_ids is None else list(dict.fromkeys(option_ids))
    _validate_line(item.cart, item.food_id, qty, opts)
    item.quantity = qty
    fields = ["quantity", "updated_at"]
    if instructions is not None:
        item.special_instructions = (instructions or "").strip()
        fields.append("special_instructions")
    item.save(update_fields=fields)
    if option_ids is not None:
        item.options.set(opts)
    return item


def _branch_has_orderable_food(branch):
    from apps.menu.models import Food
    from apps.menu.pricing_helpers import is_orderable
    foods = Food.objects.filter(branch=branch, is_active=True, is_sold_out=False).select_related("inventory")
    return any(is_orderable(food) for food in foods)


def set_context(cart, order_type, qr_code=None, table_id=None):
    """Dine-In needs a table of this branch: the scanned QR, or a table that is currently available.
    Takeaway never has a table."""
    if order_type == Cart.OrderType.TAKEAWAY:
        if not _branch_has_orderable_food(cart.branch):
            raise CartError("Takeaway ordering is unavailable because no dishes are currently available.", "no_dishes")
        cart.order_type, cart.table = order_type, None
    else:
        table = None
        if qr_code is not None:
            table = DiningTable.objects.filter(qr_code=qr_code, branch=cart.branch, is_active=True,
                                               qr_is_active=True).first()
            if table is None:
                raise CartError("Invalid or inactive QR code for this branch.", "qr_invalid")
        elif table_id is not None:
            # Occupied and reserved tables can take another order. Inactive tables cannot.
            table = DiningTable.objects.filter(
                pk=table_id, branch=cart.branch, is_active=True).first()
            if table is None:
                raise CartError("That table is not available for dine-in.", "table_unavailable")
        elif cart.table_id is None:
            raise CartError("Choose an available table, or scan the table QR code.", "qr_required")
        cart.order_type = order_type
        if table:
            cart.table = table
    cart.save()
    return cart


def apply_coupon(cart, code):
    code = (code or "").strip().upper()
    coupon = Coupon.objects.filter(branch=cart.branch, code__iexact=code).first()
    if coupon is None:
        raise CartError("Invalid coupon code.", "coupon_invalid")
    # Dry-run the pricing with this code to learn whether it is acceptable right now.
    result = evaluate(cart, code_override=[coupon.code])
    if result["pricing"] is None:
        raise CartError("Fix the problems in your cart before applying a coupon.", "cart_invalid")
    for rej in result["pricing"]["rejected_coupons"]:
        if rej["code"].upper() == coupon.code.upper():
            raise CartError(rej["reason"], "coupon_rejected")
    cart.coupons.set([coupon])  # one manually entered coupon at a time
    if cart.skip_auto_coupons:
        cart.skip_auto_coupons = False
        cart.save(update_fields=["skip_auto_coupons", "updated_at"])
    return cart


def remove_coupon(cart):
    attached = list(cart.coupons.all())
    cart.coupons.clear()
    # Dismissing an automatic coupon, or the implicit one that was not stored on the cart, keeps it off.
    if not attached or any(c.auto_apply for c in attached):
        cart.skip_auto_coupons = True
        cart.save(update_fields=["skip_auto_coupons", "updated_at"])


def _line_info(item, image):
    selected = [{"id": o.pk, "name": o.name, "extra_price": str(o.extra_price)} for o in item.options.all()]
    available = [{"id": o.pk, "name": o.name, "extra_price": str(o.extra_price)}
                 for o in item.food.customizations.all() if o.is_active]
    return {"item_id": item.pk, "food_id": item.food_id, "name": item.food.name, "quantity": item.quantity,
            "image": image, "special_instructions": item.special_instructions,
            "options": selected, "available_customizations": available}


def evaluate(cart, request=None, code_override=None):
    """Price the cart. Lines that can't be ordered any more stay in the cart, are flagged in `issues`, and are
    left out of the totals (nothing is silently discarded). `can_checkout` is only true when everything is valid."""
    items = list(cart.items.select_related("food").prefetch_related(
        "options", "food__images", "food__customizations").order_by("id"))
    customer = cart.user if cart.user_id else None
    codes = code_override if code_override is not None else [c.code for c in cart.coupons.all()]

    issues, rows, valid = [], [], []
    for item in items:
        info = _line_info(item, display_image(item.food, request))
        line = Line(item.food_id, item.quantity, [o.pk for o in item.options.all()], item.special_instructions)
        try:
            price_order(cart.branch, [line], cart.order_type, None, [])
            info["issue"] = None
            valid.append((info, line))
        except PricingError as exc:
            info["issue"] = "; ".join(e["detail"] for e in exc.errors)
            issues.append({"item_id": item.pk, "detail": info["issue"]})
        rows.append(info)

    pricing = None
    if valid:
        try:
            breakdown = price_order(cart.branch, [l for _, l in valid], cart.order_type, customer, codes,
                                    allow_auto=not cart.skip_auto_coupons)
            pricing = public_breakdown(breakdown)
            for (info, _), priced in zip(valid, pricing["items"]):  # already string-converted copies
                info.update({k: priced[k] for k in ("unit_price", "customization_per_unit", "dish_discount_per_unit",
                                                    "final_unit_price", "line_total", "customizations")})
        except PricingError as exc:  # e.g. total stock across lines of one dish is short
            for e in exc.errors:
                issues.append({"item_id": None, "detail": e["detail"]})

    context_issue = None
    if cart.order_type == Cart.OrderType.DINE_IN and cart.table_id is None:
        context_issue = "Scan the table QR code to order Dine-In, or choose Takeaway."
    elif cart.table_id and not (cart.table.is_active and cart.table.qr_is_active):
        context_issue = "This table is no longer available."
    if context_issue:
        issues.append({"item_id": None, "detail": context_issue})

    return {
        "id": cart.pk, "branch": cart.branch_id, "order_type": cart.order_type,
        "table": ({"id": cart.table_id, "table_number": cart.table.table_number, "location": cart.table.location}
                  if cart.table_id else None),
        "coupon_codes": [c.code for c in cart.coupons.all()],
        "items": rows, "pricing": pricing, "issues": issues,
        "can_checkout": bool(items) and not issues and pricing is not None,
    }


def empty_cart_view(branch, order_type="DINE_IN"):
    return {"id": None, "branch": branch.pk, "order_type": order_type, "table": None, "coupon_codes": [],
            "items": [], "pricing": None, "issues": [], "can_checkout": False}


@transaction.atomic
def merge_guest_carts(user, guest_token):
    """Fold the guest's carts into the customer's carts after login. Nothing is discarded: lines that can no
    longer be ordered are kept and flagged on the next read. Returns the list of merged branch ids."""
    h = hash_token(guest_token)
    merged = []
    for g in Cart.objects.select_for_update().filter(guest_token=h, status=Cart.Status.ACTIVE).order_by("id"):
        mine = Cart.objects.select_for_update().filter(user=user, branch=g.branch, status=Cart.Status.ACTIVE).first()
        if mine is None:  # simply adopt the guest cart
            g.user, g.guest_token = user, None
            g.save()
        else:
            lookup = {_key(i.food_id, _option_ids(i), i.special_instructions): i
                      for i in mine.items.prefetch_related("options")}
            for gi in g.items.prefetch_related("options"):
                k = _key(gi.food_id, _option_ids(gi), gi.special_instructions)
                if k in lookup:
                    target = lookup[k]
                    target.quantity = min(MAX_QTY_PER_LINE, target.quantity + gi.quantity)
                    target.save(update_fields=["quantity", "updated_at"])
                    gi.delete()
                else:
                    gi.cart = mine
                    gi.save(update_fields=["cart", "updated_at"])
                    lookup[k] = gi
            mine.order_type, mine.table = g.order_type, g.table  # the session just used wins
            mine.save()
            if not mine.coupons.exists():
                mine.coupons.set(g.coupons.all())
            g.status = Cart.Status.MERGED
            g.save()
        merged.append(g.branch_id)
    return merged


def purge_carts(queryset):
    """Delete carts and their lines without nulling the owner (that would break ck_cart_has_owner)."""
    ids = list(queryset.values_list("pk", flat=True))
    if not ids:
        return 0
    Cart.coupons.through.objects.filter(cart_id__in=ids).delete()
    CartItem.options.through.objects.filter(cartitem__cart_id__in=ids).delete()
    CartItem.objects.filter(cart_id__in=ids).delete()
    deleted, _ = Cart.objects.filter(pk__in=ids).delete()
    return deleted