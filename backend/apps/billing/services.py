"""Final invoices are created only for COMPLETED orders, from the order's stored amounts."""
from decimal import Decimal
from django.core.files.base import ContentFile
from django.db import IntegrityError, transaction

from apps.orders.lifecycle import _invoice_contact
from apps.orders.models import Order

from .models import Invoice
from .pdf import render_invoice_pdf


class BillingError(Exception):
    def __init__(self, detail, code="billing_error", status=400):
        super().__init__(detail)
        self.detail, self.code, self.http_status = detail, code, status


def breakdown(order):
    """Authoritative financial snapshot and combined bill calculation.
    If the order has continuations or is a continuation, all non-cancelled orders
    in the session are aggregated.
    """
    root = order.parent_order if order.parent_order_id else order
    all_orders = [root] + list(root.continuations.exclude(status=Order.Status.CANCELLED).order_by("continuation_index", "id"))

    branch = root.branch
    from django.utils import timezone
    local_created = timezone.localtime(root.created_at) if root.created_at else None
    placed = local_created.strftime("%d %b %Y, %I:%M %p") if local_created else ""
    contact = _invoice_contact(root)

    items_raw = []
    for ord_obj in all_orders:
        for item in ord_obj.items.all():
            items_raw.append({
                "id": item.id,
                "order_id": ord_obj.id,
                "name": item.food_name,
                "quantity": item.quantity,
                "unit_price": item.unit_price,
                "line_total": item.line_total,
                "customizations": item.customizations or [],
                "special_instructions": item.special_instructions or "",
            })

    # Combine identical items across parent & suborders:
    # Combine only when dish name, customizations, and unit_price are identical.
    # Keep differing customizations/variants as separate line items.
    combined_items_map = {}
    for it in items_raw:
        opts = []
        for o in (it.get("customizations") or []):
            if isinstance(o, dict):
                opts.append(f"{str(o.get('name', '')).strip().lower()}:{str(o.get('extra_price', 0))}")
            elif isinstance(o, str):
                opts.append(o.strip().lower())
        opts.sort()
        opts_key = "|".join(opts)
        inst_key = str(it.get("special_instructions") or "").strip().lower()
        key = (it["name"].strip().lower(), str(it["unit_price"]), opts_key, inst_key)

        if key in combined_items_map:
            existing = combined_items_map[key]
            existing["quantity"] += it["quantity"]
            existing["line_total"] = Decimal(str(existing["line_total"])) + Decimal(str(it["line_total"]))
        else:
            combined_items_map[key] = {
                "id": it["id"],
                "order_id": root.id,
                "name": it["name"],
                "quantity": it["quantity"],
                "unit_price": str(it["unit_price"]),
                "line_total": it["line_total"],
                "customizations": it["customizations"],
                "special_instructions": it["special_instructions"],
            }

    items = []
    for it in combined_items_map.values():
        it["line_total"] = str(it["line_total"])
        items.append(it)

    total_subtotal = sum((o.items_subtotal for o in all_orders), Decimal("0.00"))
    total_customization = sum((o.customization_total for o in all_orders), Decimal("0.00"))
    total_dish_discount = sum((o.dish_discount_total for o in all_orders), Decimal("0.00"))
    total_coupon_discount = sum((o.coupon_discount_total for o in all_orders), Decimal("0.00"))
    total_takeaway_charge = sum((o.takeaway_charge for o in all_orders), Decimal("0.00"))
    total_taxable_amount = sum((o.taxable_amount for o in all_orders), Decimal("0.00"))
    total_gst_amount = sum((o.gst_amount for o in all_orders), Decimal("0.00"))
    total_service_charge = sum((o.service_charge_amount for o in all_orders), Decimal("0.00"))
    total_round_off = sum((o.round_off for o in all_orders), Decimal("0.00"))
    total_grand_amount = sum((o.total_amount for o in all_orders), Decimal("0.00"))

    from apps.payments.models import Payment
    successful_payments = Payment.objects.filter(order__in=all_orders, status=Payment.Status.SUCCESS)
    paid_amount = sum((p.amount for p in successful_payments), Decimal("0.00"))
    balance_due = max(Decimal("0.00"), total_grand_amount - paid_amount)

    payment_status = root.payment_status
    if paid_amount >= total_grand_amount and total_grand_amount > 0:
        payment_status = "PAID"
    elif paid_amount > 0:
        payment_status = "PARTIAL"

    return {
        "order_id": order.id,
        "root_order_id": root.id,
        "order_number": order.order_number,
        "display_order_number": order.display_number,
        "root_display_order_number": root.display_number,
        "has_continuations": len(all_orders) > 1,
        "continuations_count": len(all_orders) - 1,
        "branch": ({
            "id": branch.id, "name": branch.name, "code": branch.code,
            "address": branch.address, "city": branch.city, "phone": branch.contact_number, "email": branch.email,
        } if branch else {
            "id": None, "name": root.branch_name, "code": "", "address": "", "city": "", "phone": "", "email": "",
        }),
        "order_type": root.order_type, "table_label": root.table_label, "placed_at": placed,
        "customer_name": contact.get("customer_name") or "",
        "customer_phone": contact.get("customer_phone") or root.customer_phone or (root.customer.phone if root.customer else ""),
        "status": root.status,
        "payment_status": payment_status,
        "payment_method": contact.get("payment_method") or "",
        "paid_amount": str(paid_amount),
        "balance_due": str(balance_due),
        "items": items,
        "items_subtotal": str(total_subtotal),
        "customization_total": str(total_customization),
        "dish_discount_total": str(total_dish_discount),
        "coupon_discount_total": str(total_coupon_discount),
        "takeaway_charge": str(total_takeaway_charge),
        "taxable_amount": str(total_taxable_amount),
        "gst_rate": str(root.gst_rate),
        "gst_amount": str(total_gst_amount),
        "service_charge_rate": str(root.service_charge_rate),
        "service_charge_amount": str(total_service_charge),
        "round_off": str(total_round_off),
        "total_amount": str(total_grand_amount),
    }


def preview_bill(order):
    body = breakdown(order)
    body["final"] = False
    body["invoice_number"] = None
    return body


@transaction.atomic
def ensure_final_invoice(order):
    is_takeaway = (order.order_type == Order.Type.TAKEAWAY)
    if order.status != Order.Status.COMPLETED and not (is_takeaway and order.status == Order.Status.SERVED):
        raise BillingError("The invoice is available after the order is completed.", "invoice_not_ready", 409)
    existing = Invoice.objects.filter(order_id=order.pk).first()
    if existing:
        if not existing.pdf_file:
            _attach_pdf(existing)
        return existing
    number = f"INV-{order.order_number}"
    snap = breakdown(order)
    snap["final"] = True
    snap["invoice_number"] = number
    try:
        with transaction.atomic():
            invoice = Invoice.objects.create(order=order, invoice_number=number, snapshot=snap)
    except IntegrityError:
        return Invoice.objects.get(order_id=order.pk)
    _attach_pdf(invoice)
    return invoice


def _attach_pdf(invoice):
    pdf = render_invoice_pdf(invoice)
    invoice.pdf_file.save(f"{invoice.invoice_number}.pdf", ContentFile(pdf), save=True)
