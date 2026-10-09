from rest_framework import serializers, status
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.permissions import IsCustomer, IsStaffMember, get_active_employee
from apps.accounts.scoping import allowed_branch_id, can_access_branch
from apps.accounts.services import record_audit
from apps.branches.models import Branch

from .lifecycle import OrderError, change_status, create_from_cart, serialize_order
from .models import Order


class PlaceOrderSerializer(serializers.Serializer):
    branch = serializers.PrimaryKeyRelatedField(queryset=Branch.objects.filter(is_active=True))
    idempotency_key = serializers.CharField(max_length=64)
    payment_method = serializers.ChoiceField(choices=["UPI", "CARD", "NETBANKING", "WALLET", "COUNTER"])


def _error(exc):
    return Response({"detail": exc.detail, "code": exc.code}, status=exc.http_status)


class OrderListCreateView(APIView):
    def get_permissions(self):
        if self.request.method == "POST":
            return [IsCustomer()]
        return [IsStaffMember() if False else _AnyActive()]

    def post(self, request):
        ser = PlaceOrderSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
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
            if emp is None:
                return Response({"detail": "No active staff profile."}, status=403)
            qs = Order.objects.all()
            if emp.branch_id is not None:
                qs = qs.filter(branch_id=emp.branch_id)
        status_filter = request.query_params.get("status")
        if status_filter:
            qs = qs.filter(status=status_filter)
        return Response([serialize_order(o) for o in qs.prefetch_related("items", "status_history")])

    def _ip(self, request):
        return request.META.get("REMOTE_ADDR")


class _AnyActive:
    def has_permission(self, request, view):
        return bool(request.user and request.user.is_authenticated)


class OrderDetailView(APIView):
    def get(self, request, pk):
        order = self._visible(request, pk)
        if order is None:
            return Response({"detail": "Not found."}, status=404)
        return Response(serialize_order(order))

    def _visible(self, request, pk):
        try:
            order = Order.objects.prefetch_related("items", "status_history").get(pk=pk)
        except Order.DoesNotExist:
            return None
        user = request.user
        if not user.is_authenticated:
            return None
        if user.user_type == "CUSTOMER":
            return order if order.customer_id == user.id else None
        if can_access_branch(user, order.branch_id):
            return order
        return None


class OrderTransitionView(APIView):
    permission_classes = [IsStaffMember]

    def post(self, request, pk):
        order = Order.objects.filter(pk=pk).first()
        if order is None or not can_access_branch(request.user, order.branch_id):
            return Response({"detail": "Not found."}, status=404)
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
        qs = Order.objects.filter(status__in=[Order.Status.PENDING, Order.Status.PREPARING, Order.Status.READY])
        if emp.branch_id is not None:
            qs = qs.filter(branch_id=emp.branch_id)
        wanted = request.query_params.get("status")
        if wanted:
            qs = qs.filter(status=wanted)
        branch = request.query_params.get("branch")
        if branch and emp.branch_id is None:
            qs = qs.filter(branch_id=branch)
        return Response([serialize_order(o) for o in qs.order_by("created_at").prefetch_related("items", "status_history")])