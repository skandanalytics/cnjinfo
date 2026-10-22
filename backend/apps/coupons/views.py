from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from apps.accounts.mixins import AuditedMixin
from apps.accounts.permissions import StaffReadAdminWrite
from apps.accounts.scoping import BranchScopedMixin
from apps.realtime.mixins import CatalogBroadcastMixin
from apps.realtime.publish import publish_catalog_event

from .models import Coupon
from .serializers import CouponSerializer, RedemptionSerializer


class CouponViewSet(CatalogBroadcastMixin, AuditedMixin, BranchScopedMixin, viewsets.ModelViewSet):
    audit_entity = "Coupon"
    catalog_resource = "coupon"
    queryset = Coupon.objects.select_related("branch").order_by("-id")
    serializer_class = CouponSerializer
    permission_classes = [StaffReadAdminWrite]
    filterset_fields = ["branch", "is_active", "discount_type", "is_first_time_auto", "auto_apply"]
    search_fields = ["code", "description"]

    def destroy(self, request, *args, **kwargs):
        """Coupons are deleted cleanly; historical redemptions retain snapshot coupon_code and order data."""
        coupon = self.get_object()
        branch_id = coupon.branch_id
        self.audit("delete", coupon)
        coupon.delete()
        publish_catalog_event(branch_id, "coupon", "deleted")
        return Response(status=status.HTTP_204_NO_CONTENT)

    @action(detail=True, methods=["get"])
    def redemptions(self, request, pk=None):
        qs = self.get_object().redemptions.select_related("order").order_by("-id")
        return Response(RedemptionSerializer(qs, many=True).data)
