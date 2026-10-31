from rest_framework import serializers, status
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView

from apps.accounts.models import User
from apps.accounts.permissions import get_active_employee
from apps.accounts.phone import normalize_phone
from apps.branches.models import Branch
from apps.coupons.services import NewCustomer

from .pricing import Line, PricingError, price_order, public_breakdown


class QuoteLineSerializer(serializers.Serializer):
    food = serializers.IntegerField()
    quantity = serializers.IntegerField()
    options = serializers.ListField(child=serializers.IntegerField(), required=False, default=list)
    special_instructions = serializers.CharField(max_length=500, required=False, allow_blank=True, default="")


class QuoteSerializer(serializers.Serializer):
    branch = serializers.IntegerField()
    order_type = serializers.ChoiceField(choices=["DINE_IN", "TAKEAWAY"])
    items = QuoteLineSerializer(many=True, allow_empty=False, max_length=100)
    coupon_codes = serializers.ListField(child=serializers.CharField(max_length=50), required=False, default=list,
                                         max_length=5)
    customer_phone = serializers.CharField(required=False, allow_blank=True)  # staff-assisted orders only
    service_tax_enabled = serializers.BooleanField(required=False, default=True)


class QuoteView(APIView):
    """Price a cart without creating anything. Guests, customers and staff may call it; the result is always
    computed on the server from database prices. A logged-in customer's order history decides first-time status;
    staff may pass `customer_phone` (assisted order) to price for that customer."""

    permission_classes = [AllowAny]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "quote"

    def post(self, request):
        s = QuoteSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        d = s.validated_data
        branch = Branch.objects.filter(pk=d["branch"], is_active=True).first()
        if branch is None:
            return Response({"detail": "Branch not found."}, status=status.HTTP_404_NOT_FOUND)

        customer = None
        user = request.user if request.user.is_authenticated else None
        if user is not None and user.user_type == User.UserType.CUSTOMER:
            customer = user
        elif user is not None and d.get("customer_phone"):
            emp = get_active_employee(user)
            if emp is None:
                return Response({"detail": "Not allowed."}, status=status.HTTP_403_FORBIDDEN)
            if emp.branch_id is not None and emp.branch_id != branch.id:
                return Response({"detail": "Branch not found."}, status=status.HTTP_404_NOT_FOUND)
            try:
                phone = normalize_phone(d["customer_phone"])
            except ValueError as exc:
                return Response({"customer_phone": [str(exc)]}, status=400)
            customer = User.objects.filter(phone=phone, user_type=User.UserType.CUSTOMER).first()
            # A phone with no account yet is a first-time customer with no history: handled below.
            if customer is None:
                customer = NewCustomer()
        lines = [Line(i["food"], i["quantity"], list(i["options"]), i["special_instructions"]) for i in d["items"]]
        coupon_codes = d.get("coupon_codes", [])
        allow_auto = True
        if any(str(c).upper() == "NONE" for c in coupon_codes):
            coupon_codes = [c for c in coupon_codes if str(c).upper() != "NONE"]
            allow_auto = False

        try:
            result = price_order(branch, lines, d["order_type"], customer, coupon_codes,
                                 allow_auto=allow_auto,
                                 service_tax_enabled=d.get("service_tax_enabled", True))
        except PricingError as exc:
            return Response({"detail": "Cart cannot be priced.", "errors": exc.errors}, status=400)
        return Response(public_breakdown(result))

