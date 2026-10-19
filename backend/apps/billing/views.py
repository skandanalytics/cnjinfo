from django.http import HttpResponse
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.permissions import IsStaffMember
from apps.accounts.scoping import can_access_branch
from apps.orders.models import Order

from .pdf import render_invoice_pdf
from .services import ensure_final_invoice, preview_bill


def _visible(request, pk):
    order = Order.objects.select_related("branch").prefetch_related("items").filter(pk=pk).first()
    if order is None or not request.user.is_authenticated:
        return None
    user = request.user
    if user.user_type == "CUSTOMER":
        return order if order.customer_id == user.id else None
    if can_access_branch(user, order.branch_id):
        return order
    return None


class InvoiceDownloadView(APIView):
    def get(self, request, pk):
        order = _visible(request, pk)
        if order is None:
            return Response({"detail": "Not found."}, status=404)
        is_takeaway = (order.order_type == Order.Type.TAKEAWAY)
        if order.status != Order.Status.COMPLETED and not (is_takeaway and order.status == Order.Status.SERVED):
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
    permission_classes = [IsStaffMember]

    def get(self, request, pk):
        order = Order.objects.select_related("branch").prefetch_related("items").filter(pk=pk).first()
        if order is None or not can_access_branch(request.user, order.branch_id):
            return Response({"detail": "Not found."}, status=404)
        return Response(preview_bill(order))
