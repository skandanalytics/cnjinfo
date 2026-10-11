from django.shortcuts import get_object_or_404
from rest_framework import serializers, status
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView

from apps.accounts.models import User
from apps.accounts.permissions import get_active_employee
from apps.accounts.scoping import can_access_branch
from apps.branches.models import Branch
from apps.payments.gateway import keys_configured

from . import services
from .models import Cart, CartItem
from .services import CartError, Identity

GUEST_HEADER = "HTTP_X_GUEST_TOKEN"


def fail(exc):
    return Response({"detail": exc.detail, "code": exc.code}, status=status.HTTP_400_BAD_REQUEST)


class GuestTokenView(APIView):
    """Issue an unguessable guest token. The client keeps it and sends it as `X-Guest-Token`."""

    permission_classes = [AllowAny]
    authentication_classes = []
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "guest_token"

    def post(self, request):
        return Response({"guest_token": services.new_guest_token()}, status=status.HTTP_201_CREATED)


class CartBase(APIView):
    """Cart owner = logged-in customer, logged-in staff (assisted order), or guest (X-Guest-Token)."""

    permission_classes = [AllowAny]

    def identity(self, request):
        user = request.user
        if user.is_authenticated:
            if user.user_type == User.UserType.CUSTOMER and user.is_active:
                return Identity(user=user), None
            if get_active_employee(user) is not None:
                return Identity(user=user), None
            return None, Response({"detail": "Carts are for customers, staff, and guests.", "code": "not_customer"},
                                  status=status.HTTP_403_FORBIDDEN)
        token = request.META.get(GUEST_HEADER, "")
        if len(token) < 20:
            return None, Response({"detail": "Guest token required (X-Guest-Token).", "code": "guest_token_required"},
                                  status=status.HTTP_400_BAD_REQUEST)
        return Identity(guest_hash=services.hash_token(token)), None

    def branch_from(self, data):
        try:
            bid = int(data.get("branch"))
        except (TypeError, ValueError):
            raise serializers.ValidationError({"branch": "Branch id is required."})
        branch = get_object_or_404(Branch, pk=bid, is_active=True)
        user = self.request.user
        if user.is_authenticated and user.user_type != User.UserType.CUSTOMER and not can_access_branch(user, branch.id):
            raise serializers.ValidationError({"branch": "You cannot order for this branch."})
        return branch

    def render(self, request, cart, code=200):
        return Response(services.evaluate(cart, request), status=code)


class CartView(CartBase):
    def get(self, request):
        ident, err = self.identity(request)
        if err:
            return err
        branch = self.branch_from(request.query_params)
        cart = services.get_cart(ident, branch)
        return self.render(request, cart) if cart else Response(services.empty_cart_view(branch))

    def delete(self, request):
        ident, err = self.identity(request)
        if err:
            return err
        branch = self.branch_from(request.query_params)
        cart = services.get_cart(ident, branch)
        if cart:
            cart.items.all().delete()
            cart.coupons.clear()
            if cart.skip_auto_coupons:
                cart.skip_auto_coupons = False
                cart.save(update_fields=["skip_auto_coupons", "updated_at"])
        return Response(services.empty_cart_view(branch))


class ContextSerializer(serializers.Serializer):
    branch = serializers.IntegerField()
    order_type = serializers.ChoiceField(choices=["DINE_IN", "TAKEAWAY"])
    qr = serializers.UUIDField(required=False)
    table = serializers.IntegerField(required=False, min_value=1)


class CartContextView(CartBase):
    def put(self, request):
        ident, err = self.identity(request)
        if err:
            return err
        s = ContextSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        branch = self.branch_from(s.validated_data)
        cart = services.get_or_create_cart(ident, branch)
        try:
            services.set_context(cart, s.validated_data["order_type"], s.validated_data.get("qr"),
                                 s.validated_data.get("table"))
        except CartError as exc:
            return fail(exc)
        return self.render(request, cart)


class AddItemSerializer(serializers.Serializer):
    branch = serializers.IntegerField()
    food = serializers.IntegerField()
    quantity = serializers.IntegerField(min_value=1, max_value=99)
    options = serializers.ListField(child=serializers.IntegerField(), required=False, default=list, max_length=20)
    special_instructions = serializers.CharField(max_length=500, required=False, allow_blank=True, default="")


class CartItemsView(CartBase):
    def post(self, request):
        ident, err = self.identity(request)
        if err:
            return err
        s = AddItemSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        d = s.validated_data
        branch = self.branch_from(d)
        cart = services.get_or_create_cart(ident, branch)
        try:
            services.add_item(cart, d["food"], d["quantity"], d["options"], d["special_instructions"])
        except CartError as exc:
            return fail(exc)
        return self.render(request, cart, status.HTTP_201_CREATED)


class QuantitySerializer(serializers.Serializer):
    quantity = serializers.IntegerField(min_value=1, max_value=99)


class CartItemView(CartBase):
    def _item(self, ident, pk):
        qs = CartItem.objects.select_related("cart", "food").filter(pk=pk, cart__status=Cart.Status.ACTIVE)
        qs = qs.filter(cart__user=ident.user) if ident.user else qs.filter(cart__guest_token=ident.guest_hash)
        return get_object_or_404(qs)

    def patch(self, request, pk):
        ident, err = self.identity(request)
        if err:
            return err
        item = self._item(ident, pk)
        s = QuantitySerializer(data=request.data)
        s.is_valid(raise_exception=True)
        try:
            services.set_quantity(item, s.validated_data["quantity"])
        except CartError as exc:
            return fail(exc)
        return self.render(request, item.cart)

    def delete(self, request, pk):
        ident, err = self.identity(request)
        if err:
            return err
        item = self._item(ident, pk)
        cart = item.cart
        item.delete()
        if not cart.items.exists() and cart.skip_auto_coupons:
            cart.skip_auto_coupons = False
            cart.coupons.clear()
            cart.save(update_fields=["skip_auto_coupons", "updated_at"])
        return self.render(request, cart)


class CouponSerializer(serializers.Serializer):
    branch = serializers.IntegerField()
    code = serializers.CharField(max_length=50)


class CartCouponView(CartBase):
    def post(self, request):
        ident, err = self.identity(request)
        if err:
            return err
        s = CouponSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        branch = self.branch_from(s.validated_data)
        cart = services.get_cart(ident, branch)
        if cart is None:
            return Response({"detail": "Your cart is empty.", "code": "cart_empty"}, status=400)
        try:
            services.apply_coupon(cart, s.validated_data["code"])
        except CartError as exc:
            return fail(exc)
        return self.render(request, cart)

    def delete(self, request):
        ident, err = self.identity(request)
        if err:
            return err
        branch = self.branch_from(request.query_params)
        cart = services.get_cart(ident, branch)
        if cart is None:
            return Response(services.empty_cart_view(branch))
        services.remove_coupon(cart)
        return self.render(request, cart)


class MergeSerializer(serializers.Serializer):
    guest_token = serializers.CharField(max_length=200)


class CartMergeView(CartBase):
    """For a customer who just logged in: fold the guest cart into their cart."""

    def post(self, request):
        if not request.user.is_authenticated or request.user.user_type != User.UserType.CUSTOMER:
            return Response({"detail": "Login required.", "code": "login_required"}, status=401)
        s = MergeSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        merged = services.merge_guest_carts(request.user, s.validated_data["guest_token"])
        return Response({"merged_branches": merged})


class CheckoutValidateView(CartBase):
    """Final server-side review before an order is placed (order creation itself is Phase 7). Customers only:
    a guest is told to log in. Everything is re-priced and re-validated here."""

    def post(self, request):
        if not request.user.is_authenticated:
            return Response({"detail": "Please log in with your phone number to check out.",
                             "code": "login_required"}, status=status.HTTP_401_UNAUTHORIZED)
        ident, err = self.identity(request)
        if err:
            return err
        branch = self.branch_from(request.data)
        cart = services.get_cart(ident, branch)
        if cart is None or not cart.items.exists():
            return Response({"detail": "Your cart is empty.", "code": "cart_empty"}, status=400)
        view = services.evaluate(cart, request)
        if not view["can_checkout"]:
            return Response({"detail": "Your cart needs attention before checkout.", "code": "cart_invalid",
                             "issues": view["issues"], "cart": view}, status=status.HTTP_409_CONFLICT)
        methods = [{"code": "COUNTER", "label": "Pay on Counter"}]
        if keys_configured():  # online methods would fail with 503 payments_unconfigured otherwise
            methods = [{"code": "UPI", "label": "UPI"}, {"code": "CARD", "label": "Card"}] + methods
        return Response({
            "ready": True, "cart": view, "payment_methods": methods,
            "customer": {"name": request.user.name, "phone": request.user.phone},
        })