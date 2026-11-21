import uuid

from django.db import IntegrityError, transaction
from django.db.models import Count, ProtectedError, Q
from django.http import HttpResponse
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView

from apps.accounts.mixins import AuditedMixin
from apps.accounts.permissions import IsAdminLevel, IsOwnerLevel, IsStaffMember, IsSuperAdmin, StaffReadAdminWrite
from apps.accounts.scoping import BranchScopedMixin, allowed_branch_id
from apps.accounts.services import client_ip
from apps.orders.models import Order
from apps.realtime.mixins import CatalogBroadcastMixin
from apps.realtime.publish import publish_catalog_event

from .models import Branch, DiningTable, TableView, qr_ordering_enabled
from .qr import render_png
from .serializers import BranchSerializer, TableSerializer, TableViewSerializer
from .services import BranchDeleteError, delete_branch


class BranchViewSet(CatalogBroadcastMixin, AuditedMixin, viewsets.ModelViewSet):
    catalog_resource = "branch"
    """Create/delete: owner-level staff only. Edit: admin-level. Read: staff (own branch only if limited).
    DELETE removes the branch and its configuration (see branches.services); orders and bills are kept.
    If the deleted branch is primary, another surviving branch is promoted automatically."""

    audit_entity = "Branch"
    queryset = Branch.objects.all().order_by("name")
    serializer_class = BranchSerializer
    filterset_fields = ["is_active"]
    search_fields = ["name", "code", "address", "city", "email", "manager_name"]

    def get_permissions(self):
        if self.action in ("create", "destroy"):
            return [IsSuperAdmin()]
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
        replacement = request.query_params.get("replacement_primary") or request.data.get("replacement_primary")
        try:
            replacement_id = int(replacement) if replacement not in (None, "") else None
        except (TypeError, ValueError):
            return Response({"replacement_primary": ["Must be a branch id."]}, status=status.HTTP_400_BAD_REQUEST)
        try:
            summary = delete_branch(branch.pk, request.user, replacement_id, client_ip(request))
        except BranchDeleteError as exc:
            return Response({"detail": exc.detail, "code": exc.code}, status=exc.http_status)
        except (IntegrityError, ProtectedError):
            return Response(
                {"detail": "This branch could not be deleted because related records are still in use. "
                           "Complete or cancel in-progress orders and try again.",
                 "code": "constraint"},
                status=status.HTTP_409_CONFLICT,
            )
        except Exception:
            return Response(
                {"detail": "This branch could not be deleted. Complete or cancel in-progress orders and try again.",
                 "code": "delete_failed"},
                status=status.HTTP_409_CONFLICT,
            )
        return Response({"detail": "Branch deleted.", "deleted": True, "summary": summary})


class TableViewSet(CatalogBroadcastMixin, AuditedMixin, BranchScopedMixin, viewsets.ModelViewSet):
    catalog_resource = "table"
    audit_entity = "Table"
    queryset = DiningTable.objects.select_related("branch").order_by("branch_id", "table_number")
    serializer_class = TableSerializer
    permission_classes = [StaffReadAdminWrite]
    filterset_fields = ["branch", "status", "is_active", "qr_is_active"]
    search_fields = ["table_number", "location"]

    def get_queryset(self):
        return super().get_queryset()

    def _active_orders(self, table):
        return Order.objects.filter(table=table, status__in=Order.ACTIVE_STATUSES).exists()

    def destroy(self, request, *args, **kwargs):
        """Deletes the table. Past orders keep their table label; an unfinished order blocks deletion."""
        table = self.get_object()
        if self._active_orders(table):
            return Response({"detail": "This table has an order that is still in progress. Complete or cancel it "
                                       "before deleting the table.", "code": "active_orders"},
                            status=status.HTTP_409_CONFLICT)
        with transaction.atomic():
            Order.objects.filter(table=table, table_label="").update(table_label=table.table_number)
            self.audit("delete", table)
            branch_id = table.branch_id
            table.delete()
        publish_catalog_event(branch_id, "table", "deleted")
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
            force = bool(request.data.get("force"))
            # A table still used by an unfinished order must not be released unless forced
            if new == S.AVAILABLE and self._active_orders(table) and not force:
                return Response({
                    "detail": "Table has unfinished orders and cannot be vacated yet.",
                    "code": "unfinished_orders",
                    "table_id": table.id,
                    "table_number": table.table_number,
                }, status=409)
            table.status = new
            table.save(update_fields=["status", "updated_at"])
        self.audit("set_status", table, {"from": cur, "to": new})
        from apps.realtime.publish import publish_catalog_event
        publish_catalog_event(table.branch_id, "table", "updated")
        return Response(self.get_serializer(table).data)

    @action(detail=True, methods=["post"], url_path="clean", permission_classes=[IsStaffMember])
    def clean(self, request, pk=None):
        """Mark table as cleaned / cleared, resetting status to AVAILABLE immediately.
        REQ-16: Table Cleaned persistence and order completion guard."""
        from django.utils import timezone
        from apps.orders.models import Order, OrderStatusHistory
        table = self.get_object()
        with transaction.atomic():
            table = DiningTable.objects.select_for_update().get(pk=table.pk)

            # 1. Guard: Check if any order for this table is still in progress (PENDING, PREPARING, READY)
            in_progress = Order.objects.filter(
                Q(table=table) | Q(parent_order__table=table),
                status__in=[Order.Status.PENDING, Order.Status.PREPARING, Order.Status.READY]
            )
            if in_progress.exists():
                return Response(
                    {"detail": "Cannot clean table while orders are still preparing or ready to serve.", "code": "orders_incomplete"},
                    status=status.HTTP_400_BAD_REQUEST
                )

            # 2. Complete any remaining SERVED orders for this table session
            served_orders = Order.objects.filter(
                Q(table=table) | Q(parent_order__table=table),
                status=Order.Status.SERVED
            )
            for ord_obj in served_orders:
                prev_st = ord_obj.status
                ord_obj.status = Order.Status.COMPLETED
                if not ord_obj.completed_at:
                    ord_obj.completed_at = timezone.now()
                ord_obj.save(update_fields=["status", "completed_at", "updated_at"])
                OrderStatusHistory.objects.create(
                    order=ord_obj,
                    from_status=prev_st,
                    to_status=Order.Status.COMPLETED,
                    note="Session closed and table cleaned",
                    changed_by=request.user
                )
                from apps.realtime.publish import publish_order_event
                try:
                    publish_order_event(ord_obj)
                except Exception:
                    pass

            # 3. Update table status to AVAILABLE persistently
            cur = table.status
            table.status = DiningTable.Status.AVAILABLE
            table.save(update_fields=["status", "updated_at"])

        self.audit("clean_table", table, {"from": cur, "to": "AVAILABLE"})
        from apps.realtime.publish import publish_catalog_event
        publish_catalog_event(table.branch_id, "table", "updated")
        return Response(self.get_serializer(table).data)

    @action(detail=True, methods=["post"], url_path="regenerate-qr", permission_classes=[IsAdminLevel])
    def regenerate_qr(self, request, pk=None):
        """Issue a new QR identifier. The old printed QR stops working immediately."""
        if not qr_ordering_enabled():
            return Response({"detail": "QR codes are turned off in Settings.", "code": "qr_disabled"}, status=409)
        table = self.get_object()
        table.qr_code = uuid.uuid4()
        table.qr_is_active = True
        table.save(update_fields=["qr_code", "qr_is_active", "updated_at"])
        self.audit("regenerate_qr", table)
        return Response(self.get_serializer(table).data)

    @action(detail=True, methods=["get"], url_path="qr", permission_classes=[IsStaffMember])
    def qr_image(self, request, pk=None):
        if not qr_ordering_enabled():
            return Response({"detail": "QR codes are turned off in Settings.", "code": "qr_disabled"}, status=409)
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
        if not qr_ordering_enabled():
            return Response({"detail": "QR codes are turned off.", "code": "qr_disabled"}, status=409)
        invalid = Response({"detail": "Invalid or inactive QR code.", "code": "qr_invalid"}, status=404)
        table = None
        raw_qr = str(qr).strip()
        try:
            code = uuid.UUID(raw_qr)
            table = DiningTable.objects.select_related("branch").filter(qr_code=code).first()
        except (ValueError, AttributeError):
            pass

        if not table:
            if raw_qr.upper().startswith("FOODIE-TABLE-"):
                num_str = raw_qr[len("FOODIE-TABLE-"):].strip()
                if num_str.isdigit():
                    table = DiningTable.objects.select_related("branch").filter(pk=int(num_str)).first()
            elif raw_qr.isdigit():
                table = DiningTable.objects.select_related("branch").filter(pk=int(raw_qr)).first()

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
        rows = [{
            "id": b.id, "name": b.name, "code": b.code, "dish_count": b.dish_count,
            "is_primary": b.is_primary, "is_active": True, "status": "Active",
            "city": b.city
        } for b in branches]
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
        try:
            active_table_ids = Order.objects.filter(
                branch_id=branch_id,
                status__in=Order.ACTIVE_STATUSES,
                table__isnull=False
            ).values_list("table_id", flat=True)
            idle_ids = list(branch.tables.filter(status=DiningTable.Status.OCCUPIED).exclude(id__in=active_table_ids).values_list("id", flat=True))
            if idle_ids:
                branch.tables.filter(id__in=idle_ids).update(status=DiningTable.Status.AVAILABLE)
        except Exception:
            pass
        tables = branch.tables.filter(is_active=True).order_by("table_number")
        return Response([{
            "id": t.id, "table_number": t.table_number, "location": t.location, "capacity": t.capacity,
            "status": t.status,
            "available": t.status == DiningTable.Status.AVAILABLE and t.qr_is_active,
        } for t in tables])



class PublicRestaurantSettingsView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []

    def get(self, request):
        from .models import qr_ordering_enabled, card_payment_enabled
        return Response({
            "qr_enabled": qr_ordering_enabled(),
            "card_enabled": card_payment_enabled(),
        })


class RestaurantSettingsView(APIView):
    """Staff can read the restaurant switches. Only an administrator can change them."""

    def get_permissions(self):
        if self.request.method == "GET":
            return [IsStaffMember()]
        return [IsAdminLevel()]

    def get(self, request):
        from .models import qr_ordering_enabled, card_payment_enabled
        return Response({
            "qr_enabled": qr_ordering_enabled(),
            "card_enabled": card_payment_enabled(),
        })

    def patch(self, request):
        from .models import RestaurantSetting
        row, _ = RestaurantSetting.objects.get_or_create(pk=1, defaults={"qr_enabled": True, "card_enabled": True})
        fields_to_update = []
        if "qr_enabled" in request.data:
            row.qr_enabled = bool(request.data.get("qr_enabled"))
            fields_to_update.append("qr_enabled")
        if "card_enabled" in request.data:
            row.card_enabled = bool(request.data.get("card_enabled"))
            fields_to_update.append("card_enabled")
        if fields_to_update:
            row.save(update_fields=fields_to_update)
        return Response({
            "qr_enabled": row.qr_enabled,
            "card_enabled": getattr(row, "card_enabled", True),
        })
