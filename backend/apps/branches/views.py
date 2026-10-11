import uuid

from django.db import transaction
from django.db.models import Count, Q
from django.http import HttpResponse
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView

from apps.accounts.mixins import AuditedMixin
from apps.accounts.permissions import IsAdminLevel, IsOwnerLevel, IsStaffMember, StaffReadAdminWrite
from apps.accounts.scoping import BranchScopedMixin, allowed_branch_id
from apps.orders.models import Order

from .models import Branch, DiningTable, TableView
from .qr import render_png
from .serializers import BranchSerializer, TableSerializer, TableViewSerializer


class BranchViewSet(AuditedMixin, viewsets.ModelViewSet):
    """Create/deactivate: owner-level staff only. Edit: admin-level. Read: staff (own branch only if limited).
    DELETE deactivates; branches with history are never removed."""

    audit_entity = "Branch"
    queryset = Branch.objects.all().order_by("name")
    serializer_class = BranchSerializer
    filterset_fields = ["is_active"]
    search_fields = ["name", "code", "address", "city", "email", "manager_name"]

    def get_permissions(self):
        if self.action in ("create", "destroy"):
            return [IsOwnerLevel()]
        if self.action in ("update", "partial_update"):
            return [IsAdminLevel()]
        return [IsStaffMember()]

    def get_queryset(self):
        qs = super().get_queryset().annotate(
            tables_count=Count("tables", filter=Q(tables__is_active=True)))
        try:
            allowed = allowed_branch_id(self.request.user)
        except LookupError:
            return qs.none()
        return qs if allowed is None else qs.filter(pk=allowed)

    def _branch_of(self, obj):
        return obj

    def destroy(self, request, *args, **kwargs):
        branch = self.get_object()
        if Order.objects.filter(branch=branch, status__in=Order.ACTIVE_STATUSES).exists():
            return Response({"detail": "This branch has active orders. Finish or cancel them first."},
                            status=status.HTTP_409_CONFLICT)
        branch.is_active = False
        branch.is_primary = False  # a closed branch cannot keep the single headquarters slot
        branch.save(update_fields=["is_active", "is_primary", "updated_at"])
        self.audit("deactivate", branch)
        return Response({"detail": "Branch deactivated.", "deactivated": True})


class TableViewSet(AuditedMixin, BranchScopedMixin, viewsets.ModelViewSet):
    audit_entity = "Table"
    queryset = DiningTable.objects.select_related("branch").order_by("branch_id", "table_number")
    serializer_class = TableSerializer
    permission_classes = [StaffReadAdminWrite]
    filterset_fields = ["branch", "status", "is_active", "qr_is_active"]
    search_fields = ["table_number", "location"]

    def _active_orders(self, table):
        return Order.objects.filter(table=table, status__in=Order.ACTIVE_STATUSES).exists()

    def destroy(self, request, *args, **kwargs):
        table = self.get_object()
        if self._active_orders(table):
            return Response({"detail": "This table has active orders."}, status=status.HTTP_409_CONFLICT)
        if table.orders.exists():  # history exists: deactivate, keep the row
            table.is_active = False
            table.qr_is_active = False
            table.save(update_fields=["is_active", "qr_is_active", "updated_at"])
            self.audit("deactivate", table)
            return Response({"detail": "Table has order history, so it was deactivated.", "deactivated": True})
        self.audit("delete", table)
        table.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)

    @action(detail=True, methods=["post"], url_path="set-status", permission_classes=[IsStaffMember])
    def set_status(self, request, pk=None):
        """Lifecycle: AVAILABLE -> RESERVED -> OCCUPIED -> AVAILABLE (manual vacate). Any active staff of the branch."""
        new = request.data.get("status")
        if new not in DiningTable.Status.values:
            return Response({"status": [f"Must be one of {DiningTable.Status.values}."]}, status=400)
        with transaction.atomic():
            table = DiningTable.objects.select_for_update().get(pk=self.get_object().pk)
            if not table.is_active:
                return Response({"detail": "Table is inactive."}, status=status.HTTP_409_CONFLICT)
            cur = table.status
            S = DiningTable.Status
            allowed = {S.AVAILABLE: {S.RESERVED, S.OCCUPIED}, S.RESERVED: {S.OCCUPIED, S.AVAILABLE},
                       S.OCCUPIED: {S.AVAILABLE}}
            if new == cur:
                return Response(self.get_serializer(table).data)
            if new not in allowed[cur]:
                return Response({"detail": f"Cannot change a table from {cur} to {new}."}, status=409)
            # A table still used by an unfinished order must not be released (also by another order's completion).
            if new == S.AVAILABLE and self._active_orders(table):
                return Response({"detail": "Table has unfinished orders and cannot be vacated yet."}, status=409)
            table.status = new
            table.save(update_fields=["status", "updated_at"])
        self.audit("set_status", table, {"from": cur, "to": new})
        return Response(self.get_serializer(table).data)

    @action(detail=True, methods=["post"], url_path="regenerate-qr", permission_classes=[IsAdminLevel])
    def regenerate_qr(self, request, pk=None):
        """Issue a new QR identifier. The old printed QR stops working immediately."""
        table = self.get_object()
        table.qr_code = uuid.uuid4()
        table.qr_is_active = True
        table.save(update_fields=["qr_code", "qr_is_active", "updated_at"])
        self.audit("regenerate_qr", table)
        return Response(self.get_serializer(table).data)

    @action(detail=True, methods=["get"], url_path="qr", permission_classes=[IsStaffMember])
    def qr_image(self, request, pk=None):
        table = self.get_object()
        if not (table.is_active and table.qr_is_active):
            return Response({"detail": "QR code is inactive."}, status=status.HTTP_409_CONFLICT)
        resp = HttpResponse(render_png(table), content_type="image/png")
        if request.query_params.get("download"):
            resp["Content-Disposition"] = f'attachment; filename="table-{table.table_number}-qr.png"'
        return resp


class QRResolveView(APIView):
    """Public: resolve a scanned QR identifier to its branch and table. Every failure looks the same."""

    permission_classes = [AllowAny]
    authentication_classes = []
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "qr_resolve"

    def get(self, request, qr):
        invalid = Response({"detail": "Invalid or inactive QR code.", "code": "qr_invalid"}, status=404)
        try:
            code = uuid.UUID(str(qr))
        except ValueError:
            return invalid
        table = DiningTable.objects.select_related("branch").filter(qr_code=code).first()
        if not table or not (table.is_active and table.qr_is_active and table.branch.is_active):
            return invalid
        return Response({
            "branch": {"id": table.branch_id, "name": table.branch.name},
            "table": {"id": table.id, "table_number": table.table_number, "location": table.location,
                      "capacity": table.capacity},
        })


class DiningAreaViewSet(AuditedMixin, BranchScopedMixin, viewsets.ModelViewSet):
    """Named floors or areas for a branch. Deleting a view does not delete its tables."""

    audit_entity = "TableView"
    queryset = TableView.objects.select_related("branch").order_by("name")
    serializer_class = TableViewSerializer
    permission_classes = [StaffReadAdminWrite]
    filterset_fields = ["branch"]
    search_fields = ["name"]

    def destroy(self, request, *args, **kwargs):
        view = self.get_object()
        view.tables.update(table_view=None)
        self.audit("delete", view)
        view.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class PublicBranchListView(APIView):
    """Active branches a customer can open a menu for. Id and name only."""

    permission_classes = [AllowAny]
    authentication_classes = []
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "public_menu"

    def get(self, request):
        branches = Branch.objects.filter(is_active=True).annotate(
            dish_count=Count("foods", filter=Q(foods__is_active=True))
        ).order_by("-dish_count", "name")
        rows = [{"id": b.id, "name": b.name, "dish_count": b.dish_count, "is_primary": b.is_primary,
                 "city": b.city} for b in branches]
        return Response(rows)


class PublicAvailableTablesView(APIView):
    """Tables a customer may start a new dine-in order at. Availability is the live table status."""

    permission_classes = [AllowAny]
    authentication_classes = []
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "public_menu"

    def get(self, request, branch_id):
        branch = Branch.objects.filter(pk=branch_id, is_active=True).first()
        if branch is None:
            return Response({"detail": "Branch not found."}, status=status.HTTP_404_NOT_FOUND)
        tables = branch.tables.filter(
            is_active=True, qr_is_active=True, status=DiningTable.Status.AVAILABLE
        ).order_by("table_number")
        return Response([{"id": t.id, "table_number": t.table_number, "location": t.location,
                          "capacity": t.capacity} for t in tables])
