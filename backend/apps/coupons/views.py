from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from apps.accounts.mixins import AuditedMixin
from apps.accounts.permissions import StaffReadAdminWrite
from apps.accounts.scoping import BranchScopedMixin

from .models import Coupon
from .serializers import CouponSerializer, RedemptionSerializer


class CouponViewSet(AuditedMixin, BranchScopedMixin, viewsets.ModelViewSet):
    audit_entity = "Coupon"
    queryset = Coupon.objects.select_related("branch").order_by("-id")
    serializer_class = CouponSerializer
    permission_classes = [StaffReadAdminWrite]
    filterset_fields = ["branch", "is_active", "discount_type", "is_first_time_auto", "auto_apply"]
    search_fields = ["code", "description"]

    def destroy(self, request, *args, **kwargs):
        """Coupons that were ever redeemed are deactivated (redemption history is kept); others are deleted."""
        coupon = self.get_object()
        if coupon.redemptions.exists():
            coupon.is_active = False
            coupon.save(update_fields=["is_active", "updated_at"])
            self.audit("deactivate", coupon)
            return Response({"detail": "Coupon has redemptions, so it was deactivated.", "deactivated": True})
        self.audit("delete", coupon)
        coupon.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)

    @action(detail=True, methods=["get"])
    def redemptions(self, request, pk=None):
        qs = self.get_object().redemptions.select_related("order").order_by("-id")
        return Response(RedemptionSerializer(qs, many=True).data)
