"""Final invoices are created only for COMPLETED orders, from the order's stored amounts."""
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
    """The same money fields already stored on the order. Nothing is repriced."""
    branch = order.branch
    placed = order.created_at.strftime("%d %b %Y, %H:%M") if order.created_at else ""
    items = [{
        "name": item.food_name,
        "quantity": item.quantity,
        "unit_price": str(item.unit_price),
        "line_total": str(item.line_total),
        "customizations": item.customizations or [],
    } for item in order.items.all()]
    contact = _invoice_contact(order)
    return {
        "order_id": order.id,
        "order_number": order.order_number,
        "branch": ({
            "id": branch.id, "name": branch.name, "code": branch.code,
            "address": branch.address, "city": branch.city, "phone": branch.contact_number, "email": branch.email,
        } if branch else {
            "id": None, "name": order.branch_name, "code": "", "address": "", "city": "", "phone": "", "email": "",
        }),
        "order_type": order.order_type, "table_label": order.table_label, "placed_at": placed,
        "customer_name": contact.get("customer_name") or "",
        "status": order.status,
        "payment_status": order.payment_status,
        "payment_method": contact.get("payment_method") or "",
        "items": items,
        "items_subtotal": str(order.items_subtotal),
        "customization_total": str(order.customization_total),
        "dish_discount_total": str(order.dish_discount_total),
        "coupon_discount_total": str(order.coupon_discount_total),
        "takeaway_charge": str(order.takeaway_charge),
        "taxable_amount": str(order.taxable_amount),
        "gst_rate": str(order.gst_rate),
        "gst_amount": str(order.gst_amount),
        "service_charge_rate": str(order.service_charge_rate),
        "service_charge_amount": str(order.service_charge_amount),
        "round_off": str(order.round_off),
        "total_amount": str(order.total_amount),
    }


def preview_bill(order):
    body = breakdown(order)
    body["final"] = False
    body["invoice_number"] = None
    return body


@transaction.atomic
def ensure_final_invoice(order):
    if order.status != Order.Status.COMPLETED:
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
