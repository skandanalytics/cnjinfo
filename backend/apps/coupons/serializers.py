from rest_framework import serializers

from apps.accounts.mixins import BranchBoundSerializerMixin
from apps.branches.models import Branch

from .models import Coupon, CouponRedemption
from .services import usage_count


class CouponSerializer(BranchBoundSerializerMixin, serializers.ModelSerializer):
    branch = serializers.PrimaryKeyRelatedField(queryset=Branch.objects.all(), required=False)
    used_count = serializers.SerializerMethodField()

    class Meta:
        model = Coupon
        fields = ["id", "branch", "code", "description", "discount_type", "discount_value", "min_order_value",
                  "max_discount", "valid_from", "valid_to", "usage_limit", "is_first_time_auto",
                  "auto_apply", "is_active",
                  "used_count", "created_at"]
        read_only_fields = ["id", "created_at"]
        validators = []

    def get_used_count(self, obj):
        return usage_count(obj)

    def validate_code(self, value):
        value = value.strip().upper()
        if not value.replace("-", "").replace("_", "").isalnum():
            raise serializers.ValidationError("Use letters, numbers, '-' or '_' only.")
        return value

    def validate(self, attrs):
        attrs = super().validate(attrs)
        inst = self.instance
        get = lambda k, d=None: attrs.get(k, getattr(inst, k, d))
        branch = attrs.get("branch") or inst.branch
        dtype, value = get("discount_type"), get("discount_value")
        if value is None or value <= 0:
            raise serializers.ValidationError({"discount_value": "Discount must be greater than zero."})
        if dtype == Coupon.Type.PERCENT and value > 100:
            raise serializers.ValidationError({"discount_value": "Percent discount cannot exceed 100."})
        if get("max_discount") is not None and get("max_discount") <= 0:
            raise serializers.ValidationError({"max_discount": "Must be greater than zero."})
        if get("valid_to") <= get("valid_from"):
            raise serializers.ValidationError({"valid_to": "End must be after start."})
        if get("usage_limit") is not None and get("usage_limit") < 1:
            raise serializers.ValidationError({"usage_limit": "Must be at least 1."})
        self.ensure_unique(Coupon, {"branch": branch, "code__iexact": get("code")},
                           "This branch already has a coupon with this code.", "code")
        if get("is_first_time_auto") and get("is_active", True):
            others = Coupon.objects.filter(branch=branch, is_first_time_auto=True, is_active=True)
            if inst:
                others = others.exclude(pk=inst.pk)
            if others.exists():
                raise serializers.ValidationError(
                    {"is_first_time_auto": "This branch already has an active first-time coupon."})
        return attrs


class RedemptionSerializer(serializers.ModelSerializer):
    order_number = serializers.CharField(source="order.order_number", read_only=True)
    order_status = serializers.CharField(source="order.status", read_only=True)
    customer_phone = serializers.CharField(source="order.customer_phone", read_only=True)

    class Meta:
        model = CouponRedemption
        fields = ["id", "order_number", "order_status", "customer_phone", "discount_amount", "created_at"]
