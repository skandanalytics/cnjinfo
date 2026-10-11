from django.conf import settings
from rest_framework import serializers, status
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.permissions import IsCustomer, IsCustomerOrStaff, IsStaffMember, get_active_employee
from apps.accounts.scoping import can_access_branch
from apps.accounts.services import record_audit

from .models import Payment
from .services import PaymentError, record_counter, serialize_payment, start_online, verify_checkout, process_webhook


def _error(exc):
    return Response({"detail": exc.detail, "code": exc.code}, status=exc.http_status)


class StartPaymentSerializer(serializers.Serializer):
    method = serializers.ChoiceField(choices=["UPI", "CARD", "NETBANKING", "WALLET"])


class VerifyPaymentSerializer(serializers.Serializer):
    razorpay_order_id = serializers.CharField(max_length=64)
    razorpay_payment_id = serializers.CharField(max_length=64)
    razorpay_signature = serializers.CharField(max_length=255)


class CounterPaymentSerializer(serializers.Serializer):
    amount = serializers.DecimalField(max_digits=12, decimal_places=2, required=False)


class StartOnlinePaymentView(APIView):
    permission_classes = [IsCustomerOrStaff]

    def post(self, request, pk):
        ser = StartPaymentSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        try:
            payment = start_online(request.user, pk, ser.validated_data["method"])
        except PaymentError as exc:
            return _error(exc)
        body = serialize_payment(payment)
        body["key_id"] = settings.RAZORPAY_KEY_ID
        body["currency"] = "INR"
        return Response(body, status=status.HTTP_201_CREATED)


class VerifyPaymentView(APIView):
    permission_classes = [IsCustomerOrStaff]

    def post(self, request):
        ser = VerifyPaymentSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        data = ser.validated_data
        try:
            payment = verify_checkout(
                request.user, data["razorpay_order_id"], data["razorpay_payment_id"], data["razorpay_signature"])
        except PaymentError as exc:
            return _error(exc)
        record_audit(request.user, "payment.captured", "Payment", payment.id, branch=payment.order.branch,
                     changes={"order_id": payment.order_id}, ip=request.META.get("REMOTE_ADDR"))
        return Response(serialize_payment(payment))


class WebhookView(APIView):
    authentication_classes = []
    permission_classes = [AllowAny]

    def post(self, request):
        signature = request.headers.get("X-Razorpay-Signature", "")
        event_id = request.headers.get("X-Razorpay-Event-Id", "")
        try:
            result = process_webhook(request.body, signature, event_id)
        except PaymentError as exc:
            return _error(exc)
        return Response({"received": True, **result})


class CounterPaymentView(APIView):
    permission_classes = [IsStaffMember]

    def post(self, request, pk):
        ser = CounterPaymentSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        try:
            payment = record_counter(request.user, pk, ser.validated_data.get("amount"))
        except PaymentError as exc:
            return _error(exc)
        record_audit(request.user, "payment.counter", "Payment", payment.id, branch=payment.order.branch,
                     changes={"order_id": payment.order_id}, ip=request.META.get("REMOTE_ADDR"))
        return Response(serialize_payment(payment), status=status.HTTP_201_CREATED)


class PaymentListView(APIView):
    def get(self, request):
        user = request.user
        if not user.is_authenticated:
            return Response({"detail": "Authentication credentials were not provided."}, status=401)
        qs = Payment.objects.select_related("order").order_by("-id")
        if user.user_type == "CUSTOMER":
            qs = qs.filter(order__customer=user)
        else:
            emp = get_active_employee(user)
            if emp is None:
                return Response({"detail": "No active staff profile."}, status=403)
            if emp.branch_id is not None:
                qs = qs.filter(order__branch_id=emp.branch_id)
        return Response([serialize_payment(p) for p in qs])


class PaymentDetailView(APIView):
    def get(self, request, pk):
        user = request.user
        if not user.is_authenticated:
            return Response({"detail": "Authentication credentials were not provided."}, status=401)
        payment = Payment.objects.select_related("order").filter(pk=pk).first()
        if payment is None:
            return Response({"detail": "Not found."}, status=404)
        order = payment.order
        if user.user_type == "CUSTOMER":
            if order.customer_id != user.id:
                return Response({"detail": "Not found."}, status=404)
        elif not can_access_branch(user, order.branch_id):
            return Response({"detail": "Not found."}, status=404)
        return Response(serialize_payment(payment))
