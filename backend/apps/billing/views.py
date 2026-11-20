from django.http import HttpResponse
from rest_framework.response import Response
from rest_framework.views import APIView

from rest_framework.permissions import IsAuthenticated

from apps.accounts.permissions import IsStaffMember, sees_every_order
from apps.accounts.scoping import can_access_branch
from apps.orders.models import Order

from .pdf import render_invoice_pdf
from .services import ensure_final_invoice, preview_bill


def _visible(request, pk):
    try:
        if str(pk).isdigit():
            order = Order.objects.select_related("branch", "parent_order").prefetch_related("items").filter(pk=int(pk)).first()
        else:
            order = Order.objects.select_related("branch", "parent_order").prefetch_related("items").filter(order_number=str(pk)).first()
    except Exception:
        return None
    if order is None or not request.user.is_authenticated:
        return None
    user = request.user
    if user.user_type == "CUSTOMER":
        clean_phone = str(user.phone).replace("+91", "").strip() if getattr(user, "phone", None) else ""
        is_owner = (order.customer_id == user.id) or (
            bool(clean_phone and order.customer_phone and str(order.customer_phone).replace("+91", "").strip() == clean_phone)
        )
        if not is_owner and order.parent_order_id:
            p = order.parent_order
            if p and (p.customer_id == user.id or bool(clean_phone and p.customer_phone and str(p.customer_phone).replace("+91", "").strip() == clean_phone)):
                is_owner = True
        if not is_owner:
            root = order.parent_order if order.parent_order_id else order
            if root.continuations.filter(customer_id=user.id).exists():
                is_owner = True
            elif clean_phone and any(str(c.customer_phone or "").replace("+91", "").strip() == clean_phone for c in root.continuations.all()):
                is_owner = True
        return order if is_owner else None
    if not can_access_branch(user, order.branch_id):
        return None
    return order


class InvoiceDownloadView(APIView):
    def get(self, request, pk):
        order = _visible(request, pk)
        if order is None:
            return Response({"detail": "Not found."}, status=404)
        is_takeaway = (order.order_type == Order.Type.TAKEAWAY)
        is_self_service = (order.order_type in (Order.Type.SELF_SERVICE, "SELF_SERVICE", getattr(Order.Type, "SELF_SERVICE", "SELF_SERVICE")))
        if order.status != Order.Status.COMPLETED and not (is_takeaway and order.status == Order.Status.SERVED) and not is_self_service:
            return Response(
                {"detail": "The invoice is available after the order is completed.", "code": "invoice_not_ready"},
                status=409,
            )
        invoice = ensure_final_invoice(order)
        # Render from the saved snapshot on each download, so a layout change does not need a new invoice.
        is_customer = getattr(request.user, "user_type", None) == "CUSTOMER"
        response = HttpResponse(render_invoice_pdf(invoice, for_customer=is_customer), content_type="application/pdf")
        response["Content-Disposition"] = f'attachment; filename="Foodie-Invoice-{invoice.invoice_number}.pdf"'
        return response


class BillPreviewView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, pk):
        order = _visible(request, pk)
        if order is None:
            return Response({"detail": "Not found."}, status=404)
        return Response(preview_bill(order))
