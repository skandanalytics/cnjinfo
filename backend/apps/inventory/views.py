from django.db.models import F, Q
from rest_framework import mixins, status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from apps.accounts.mixins import AuditedMixin
from apps.accounts.permissions import IsAdminLevel, IsStaffMember, StaffReadAdminWrite
from apps.accounts.scoping import BranchScopedMixin

from . import services
from .models import InventoryItem
from .serializers import (AdjustSerializer, InventoryItemSerializer, RestockSerializer, StockTransactionSerializer)


class InventoryViewSet(AuditedMixin, BranchScopedMixin, mixins.CreateModelMixin, mixins.RetrieveModelMixin,
                       mixins.UpdateModelMixin, mixins.ListModelMixin, viewsets.GenericViewSet):
    """No DELETE: removing a stock record would destroy its ledger. Hide a dish by deactivating it instead."""

    audit_entity = "Inventory"
    queryset = InventoryItem.objects.select_related("food", "food__category", "branch").order_by("food__name")
    serializer_class = InventoryItemSerializer
    permission_classes = [StaffReadAdminWrite]
    filterset_fields = ["branch", "food", "food__category"]
    search_fields = ["food__name", "food__category__name"]
    ordering_fields = ["quantity", "food__name", "updated_at"]

    def get_queryset(self):
        qs = super().get_queryset()
        wanted = self.request.query_params.get("status")
        if wanted == InventoryItem.Status.OUT_OF_STOCK:
            qs = qs.filter(quantity=0)
        elif wanted == InventoryItem.Status.LOW_STOCK:
            qs = qs.filter(quantity__gt=0, quantity__lte=F("low_stock_threshold"))
        elif wanted == InventoryItem.Status.IN_STOCK:
            qs = qs.filter(quantity__gt=F("low_stock_threshold"))
        return qs

    def perform_create(self, serializer):
        item = serializer.save()
        services.set_initial_stock(item, self.request.user)
        self.audit("create", item)

    @action(detail=False, methods=["get"], permission_classes=[IsStaffMember])
    def summary(self, request):
        """Counts for the In Stock / Low Stock / Out of Stock cards."""
        qs = BranchScopedMixin.get_queryset(self)  # ignore the ?status filter
        out = qs.filter(quantity=0).count()
        low = qs.filter(quantity__gt=0, quantity__lte=F("low_stock_threshold")).count()
        total = qs.count()
        return Response({"total": total, "out_of_stock": out, "low_stock": low, "in_stock": total - out - low})

    @action(detail=True, methods=["post"], permission_classes=[IsStaffMember])
    def restock(self, request, pk=None):
        """Add stock (SRS: admin and employee may restock). Quantity is added to the current stock."""
        item = self.get_object()
        s = RestockSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        item = services.restock(item.pk, s.validated_data["quantity"], request.user, s.validated_data["note"])
        self.audit("restock", item, {"added": s.validated_data["quantity"]})
        return Response(self.get_serializer(item).data)

    @action(detail=True, methods=["post"], permission_classes=[IsAdminLevel])
    def adjust(self, request, pk=None):
        """Set the stock to an exact number (stock-take correction). Admin-level only."""
        item = self.get_object()
        s = AdjustSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        item = services.adjust(item.pk, s.validated_data["new_quantity"], request.user, s.validated_data["note"])
        self.audit("adjust", item, {"to": s.validated_data["new_quantity"]})
        return Response(self.get_serializer(item).data)

    @action(detail=True, methods=["get"], permission_classes=[IsStaffMember])
    def transactions(self, request, pk=None):
        item = self.get_object()
        qs = item.transactions.select_related("performed_by", "order").order_by("-id")
        return Response(StockTransactionSerializer(qs, many=True).data)
