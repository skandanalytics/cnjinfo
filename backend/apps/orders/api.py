from rest_framework import serializers, status
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.permissions import ADMIN_ROLES, IsCustomer, IsStaffMember, get_active_employee
from apps.accounts.scoping import allowed_branch_id, can_access_branch
from apps.accounts.services import record_audit
from apps.branches.models import Branch

from .lifecycle import OrderError, change_status, create_assisted, create_from_cart, serialize_order
from .models import Order


class PlaceOrderSerializer(serializers.Serializer):
    branch = serializers.PrimaryKeyRelatedField(queryset=Branch.objects.filter(is_active=True))
    idempotency_key = serializers.CharField(max_length=64)
    payment_method = serializers.ChoiceField(choices=["UPI", "CARD", "NETBANKING", "WALLET", "COUNTER"])
    cart_id = serializers.IntegerField(required=False, allow_null=True)
    cart = serializers.IntegerField(required=False, allow_null=True)


def _error(exc):
    return Response({"detail": exc.detail, "code": exc.code}, status=exc.http_status)


def _sees_every_order(user):
    """Admins and branch managers see every order in their branch. Other staff see orders they placed."""
    if not user or not user.is_authenticated:
        return False
    if getattr(user, "is_superuser", False):
        return True
    employee = get_active_employee(user)
    return employee is not None and employee.role in ADMIN_ROLES


class OrderListCreateView(APIView):
    def get_permissions(self):
        if self.request.method == "POST":
            return [_CustomerOrStaff()]
        return [_AnyActive()]

    def post(self, request):
        ser = PlaceOrderSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        raw_cart_id = ser.validated_data.get("cart_id") or ser.validated_data.get("cart")
        if raw_cart_id:
            from apps.carts.models import Cart
            target_cart = Cart.objects.filter(pk=raw_cart_id).first()
            if target_cart and target_cart.user_id != request.user.id:
                return Response({"detail": "You do not have access to this cart.", "code": "cart_forbidden"},
                                status=status.HTTP_403_FORBIDDEN)
        try:
            order, created = create_from_cart(request.user, ser.validated_data["branch"],
                                              ser.validated_data["idempotency_key"],
                                              ser.validated_data["payment_method"])
        except OrderError as exc:
            return _error(exc)
        if created:
            record_audit(request.user, "order.placed", "Order", order.id, branch=order.branch, ip=self._ip(request))
        return Response(serialize_order(order), status=status.HTTP_201_CREATED if created else status.HTTP_200_OK)

    def get(self, request):
        user = request.user
        if user.user_type == "CUSTOMER":
            qs = Order.objects.filter(customer=user)
        else:
            emp = get_active_employee(user)
            if emp is None and not getattr(user, "is_superuser", False):
                return Response({"detail": "No active staff profile."}, status=403)
            qs = Order.objects.all()
            if emp and emp.branch_id is not None:
                qs = qs.filter(branch_id=emp.branch_id)
            if not _sees_every_order(user) or request.query_params.get("mine") == "1":
                qs = qs.filter(placed_by=user)
        status_filter = request.query_params.get("status")
        if status_filter:
            qs = qs.filter(status=status_filter)
        return Response([serialize_order(o) for o in qs.select_related("placed_by", "table").prefetch_related("items", "status_history")])

    def _ip(self, request):
        return request.META.get("REMOTE_ADDR")


class AssistedItemSerializer(serializers.Serializer):
    food = serializers.IntegerField(min_value=1)
    quantity = serializers.IntegerField(min_value=1, max_value=99)
    options = serializers.ListField(child=serializers.IntegerField(), required=False, default=list)
    special_instructions = serializers.CharField(max_length=500, required=False, allow_blank=True, default="")


class AssistedOrderSerializer(serializers.Serializer):
    table = serializers.IntegerField(min_value=1, required=False, allow_null=True)
    branch = serializers.IntegerField(min_value=1, required=False, allow_null=True)
    order_type = serializers.ChoiceField(choices=["DINE_IN", "TAKEAWAY"], default="DINE_IN")
    items = AssistedItemSerializer(many=True)
    idempotency_key = serializers.CharField(max_length=64)
    coupon_code = serializers.CharField(max_length=50, required=False, allow_blank=True, default="")
    customer_phone = serializers.CharField(max_length=20, required=False, allow_blank=True, default="")
    customer_name = serializers.CharField(max_length=255, required=False, allow_blank=True, default="")
    payment_method = serializers.CharField(max_length=30, required=False, default="CASH")
    mark_paid = serializers.BooleanField(required=False, default=False)


class AssistedOrderView(APIView):
    permission_classes = [IsStaffMember]

    def post(self, request):
        ser = AssistedOrderSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        data = ser.validated_data
        if not data["items"]:
            return Response({"detail": "Add at least one dish.", "code": "cart_empty"}, status=400)
        try:
            order, created = create_assisted(
                request.user,
                data.get("table"),
                data["items"],
                data["idempotency_key"],
                branch_id=data.get("branch"),
                order_type=data.get("order_type", Order.Type.DINE_IN),
                coupon_code=data.get("coupon_code", ""),
                customer_phone=data.get("customer_phone", ""),
                customer_name=data.get("customer_name", ""),
                mark_paid=data.get("mark_paid", False),
                payment_method=data.get("payment_method", "CASH"),
            )
        except OrderError as exc:
            return _error(exc)
        if created:
            record_audit(request.user, "order.assisted", "Order", order.id, branch=order.branch,
                         ip=request.META.get("REMOTE_ADDR"))
        return Response(serialize_order(order), status=status.HTTP_201_CREATED if created else status.HTTP_200_OK)


class _AnyActive:
    def has_permission(self, request, view):
        return bool(request.user and request.user.is_authenticated)


class _CustomerOrStaff:
    def has_permission(self, request, view):
        user = request.user
        if not user.is_authenticated or not user.is_active:
            return False
        if user.user_type == "CUSTOMER":
            return True
        return get_active_employee(user) is not None


class OrderDetailView(APIView):
    def get(self, request, pk):
        order = self._visible(request, pk)
        if order is None:
            return Response({"detail": "Not found."}, status=404)
        return Response(serialize_order(order))

    def _visible(self, request, pk):
        try:
            if str(pk).isdigit():
                order = Order.objects.prefetch_related("items", "status_history").get(pk=int(pk))
            else:
                order = Order.objects.prefetch_related("items", "status_history").get(order_number=str(pk))
        except Order.DoesNotExist:
            return None
        user = request.user
        if not user.is_authenticated:
            return None
        if user.user_type == "CUSTOMER":
            return order if order.customer_id == user.id else None
        if not can_access_branch(user, order.branch_id):
            return None
        if not _sees_every_order(user) and order.placed_by_id != user.id:
            return None
        return order


class OrderTransitionView(APIView):
    permission_classes = [IsStaffMember]

    def post(self, request, pk):
        if str(pk).isdigit():
            order = Order.objects.filter(pk=int(pk)).first()
        else:
            order = Order.objects.filter(order_number=str(pk)).first()
        if order is None or not can_access_branch(request.user, order.branch_id):
            return Response({"detail": "Not found."}, status=404)
        if not _sees_every_order(request.user) and order.placed_by_id != request.user.id:
            return Response({"detail": "You can only update your own orders."}, status=403)
        new_status = request.data.get("status", "")
        if new_status not in Order.Status.values:
            return Response({"detail": "Unknown status."}, status=400)
        try:
            order = change_status(order.id, new_status, request.user, request.data.get("reason", ""))
        except OrderError as exc:
            return _error(exc)
        record_audit(request.user, "order.status", "Order", order.id, changes={"status": new_status},
                     ip=request.META.get("REMOTE_ADDR"))
        return Response(serialize_order(order))


class KitchenQueueView(APIView):
    permission_classes = [IsStaffMember]

    def get(self, request):
        emp = get_active_employee(request.user)
        qs = Order.objects.filter(status__in=[Order.Status.PENDING, Order.Status.PREPARING, Order.Status.READY,
                                              Order.Status.SERVED, Order.Status.COMPLETED])
        if emp and emp.branch_id is not None:
            qs = qs.filter(branch_id=emp.branch_id)
        if not _sees_every_order(request.user) or request.query_params.get("mine") == "1":
            qs = qs.filter(placed_by=request.user)
        wanted = request.query_params.get("status")
        if wanted:
            qs = qs.filter(status=wanted)
        branch = request.query_params.get("branch")
        if branch and emp and emp.branch_id is None:
            qs = qs.filter(branch_id=branch)
        return Response([serialize_order(o) for o in qs.order_by("created_at").prefetch_related("items", "status_history")])