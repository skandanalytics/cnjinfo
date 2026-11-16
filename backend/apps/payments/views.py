import time
from decimal import Decimal, ROUND_HALF_UP

from django.conf import settings
from django.db import transaction
from rest_framework import serializers, status
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.permissions import IsCustomer, IsCustomerOrStaff, IsStaffMember, get_active_employee, sees_every_order
from apps.accounts.scoping import can_access_branch
from apps.accounts.services import record_audit
from apps.orders.models import Order

from .gateway import (
    GatewayError,
    checkout_secret,
    get_gateway,
    keys_configured,
    verify_checkout_signature,
)
from .models import Payment
from .services import PaymentError, _apply_capture, record_counter, serialize_payment, start_online, verify_checkout, process_webhook


def _error(exc):
    return Response({"detail": exc.detail, "code": exc.code}, status=exc.http_status)


class StartPaymentSerializer(serializers.Serializer):
    method = serializers.ChoiceField(
        choices=["RAZORPAY_UPI", "RAZORPAY_CARD", "CASH", "RAZORPAY", "UPI", "CARD", "NETBANKING", "WALLET", "COUNTER"]
    )


class VerifyPaymentSerializer(serializers.Serializer):
    razorpay_order_id = serializers.CharField(max_length=128)
    razorpay_payment_id = serializers.CharField(max_length=128)
    razorpay_signature = serializers.CharField(max_length=255)
    order_id = serializers.IntegerField(required=False, allow_null=True)
    amount = serializers.DecimalField(max_digits=12, decimal_places=2, required=False, allow_null=True)
    currency = serializers.CharField(max_length=10, required=False, allow_blank=True, default="INR")
    payment_method = serializers.CharField(max_length=30, required=False, allow_blank=True, default="")


class CreateOrderSerializer(serializers.Serializer):
    amount = serializers.DecimalField(max_digits=12, decimal_places=2, required=True)
    currency = serializers.CharField(max_length=10, default="INR", required=False)
    receipt = serializers.CharField(max_length=40, required=False, allow_blank=True, default="")
    order_id = serializers.IntegerField(required=False, allow_null=True)
    notes = serializers.DictField(required=False, default=dict)
    payment_method = serializers.CharField(max_length=30, required=False, allow_blank=True, default="RAZORPAY")


class CounterPaymentSerializer(serializers.Serializer):
    amount = serializers.DecimalField(max_digits=12, decimal_places=2, required=False)
    method = serializers.CharField(max_length=20, required=False, default="COUNTER")


class CreateOrderView(APIView):
    """POST /api/create-order - Standard Razorpay order creation endpoint."""
    permission_classes = [AllowAny]

    def post(self, request):
        data = request.data
        if not isinstance(data, dict):
            return Response({"detail": "Invalid JSON payload.", "code": "invalid_payload"}, status=status.HTTP_400_BAD_REQUEST)

        raw_amount = data.get("amount")
        if raw_amount is None:
            return Response({"detail": "amount is required.", "code": "invalid_amount"}, status=status.HTTP_400_BAD_REQUEST)

        try:
            dec_amount = Decimal(str(raw_amount).strip())
        except (ValueError, TypeError, ArithmeticError):
            return Response({"detail": "amount must be numeric.", "code": "invalid_amount"}, status=status.HTTP_400_BAD_REQUEST)

        if dec_amount <= 0:
            return Response({"detail": "amount must be greater than zero.", "code": "invalid_amount"}, status=status.HTTP_400_BAD_REQUEST)

        # Standard Razorpay API amounts are in paise (integer >= 100).
        # If amount contains a decimal point (e.g. "250.50"), convert rupees to paise.
        # If amount is an integer (e.g. 50000 or 50), treat directly as paise.
        if "." in str(raw_amount):
            paise = int((dec_amount * 100).quantize(Decimal("1"), rounding=ROUND_HALF_UP))
        else:
            paise = int(dec_amount)

        if paise < 100:
            return Response({"detail": "amount must be at least 100 paise.", "code": "invalid_amount"}, status=status.HTTP_400_BAD_REQUEST)

        currency = str(data.get("currency") or "INR").strip().upper()
        if not currency or len(currency) != 3 or not currency.isalpha():
            return Response({"detail": "currency must be a valid 3-letter currency code (e.g. INR).", "code": "invalid_currency"}, status=status.HTTP_400_BAD_REQUEST)

        receipt = str(data.get("receipt") or "")[:40]
        notes = data.get("notes") or {}
        if not isinstance(notes, dict):
            notes = {}

        if not keys_configured():
            return Response({"detail": "Online payments are not configured.", "code": "payments_unconfigured"}, status=status.HTTP_503_SERVICE_UNAVAILABLE)

        gateway = get_gateway()
        if gateway is None:
            return Response({"detail": "Online payments are not configured.", "code": "payments_unconfigured"}, status=status.HTTP_503_SERVICE_UNAVAILABLE)

        order_id_param = data.get("order_id")
        foodie_order = None
        if order_id_param:
            try:
                foodie_order = Order.objects.filter(pk=order_id_param).first()
                if foodie_order:
                    notes["order_id"] = str(foodie_order.id)
                    notes["order_number"] = str(foodie_order.order_number)
                    if not receipt:
                        receipt = str(foodie_order.order_number)[:40]
            except Exception:
                pass

        try:
            rzp_order_id = gateway.create_order(
                amount=paise,
                receipt=receipt or f"rcpt_{int(time.time())}",
                notes=notes,
                currency=currency
            )
        except GatewayError as exc:
            return Response({"detail": exc.detail, "code": exc.code}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
        except Exception:
            return Response({"detail": "The payment provider could not create the order.", "code": "gateway_error"}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

        raw_method = str(data.get("payment_method") or "RAZORPAY").strip().upper()
        if raw_method in ("UPI", "RAZORPAY_UPI"):
            target_method = Payment.Method.RAZORPAY_UPI
        elif raw_method in ("CARD", "RAZORPAY_CARD"):
            target_method = Payment.Method.RAZORPAY_CARD
        elif raw_method in ("COUNTER", "CASH"):
            target_method = Payment.Method.CASH
        else:
            target_method = Payment.Method.RAZORPAY

        if foodie_order:
            try:
                Payment.objects.create(
                    order=foodie_order,
                    method=target_method,
                    amount=Decimal(paise) / Decimal("100"),
                    status=Payment.Status.PENDING,
                    razorpay_order_id=rzp_order_id
                )
                if foodie_order.payment_status != Order.PaymentStatus.PENDING:
                    foodie_order.payment_status = Order.PaymentStatus.PENDING
                    foodie_order.save(update_fields=["payment_status", "updated_at"])
            except Exception:
                pass

        return Response({
            "order_id": rzp_order_id,
            "amount": paise,
            "currency": currency,
            "key_id": settings.RAZORPAY_KEY_ID,
            "payment_method": target_method,
            "customer_order_id": foodie_order.id if foodie_order else None
        }, status=status.HTTP_201_CREATED)


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
    """POST /api/verify-payment & POST /api/payments/verify/ - Verifies Razorpay signature."""
    permission_classes = [AllowAny]

    def post(self, request):
        ser = VerifyPaymentSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        data = ser.validated_data

        secret = checkout_secret()
        if not keys_configured() or not secret:
            return Response({"detail": "Online payments are not configured.", "code": "payments_unconfigured"}, status=status.HTTP_503_SERVICE_UNAVAILABLE)

        if not verify_checkout_signature(data["razorpay_order_id"], data["razorpay_payment_id"], data["razorpay_signature"], secret):
            return Response({"detail": "Invalid signature.", "code": "invalid_signature"}, status=status.HTTP_400_BAD_REQUEST)

        # Check for linked Payment in DB
        payment = Payment.objects.filter(razorpay_order_id=data["razorpay_order_id"]).first()
        if not payment and data.get("order_id"):
            target_order = Order.objects.filter(pk=data["order_id"]).first()
            if target_order:
                req_method = str(data.get("payment_method") or "").strip().upper()
                resolved_method = None
                if req_method in ("UPI", "RAZORPAY_UPI"):
                    resolved_method = Payment.Method.RAZORPAY_UPI
                elif req_method in ("CARD", "RAZORPAY_CARD"):
                    resolved_method = Payment.Method.RAZORPAY_CARD
                else:
                    resolved_method = Payment.Method.RAZORPAY
                payment = Payment.objects.create(
                    order=target_order,
                    method=resolved_method,
                    amount=target_order.total_amount,
                    status=Payment.Status.PENDING,
                    razorpay_order_id=data["razorpay_order_id"],
                )

        if payment:
            # Additional Validations:
            # 1. Order exists and belongs to payment
            if not payment.order_id:
                return Response({"detail": "Order not found for this payment.", "code": "order_not_found"}, status=status.HTTP_400_BAD_REQUEST)
            if data.get("order_id") and payment.order_id != data["order_id"]:
                return Response({"detail": "Payment does not belong to the specified order.", "code": "order_mismatch"}, status=status.HTTP_400_BAD_REQUEST)

            # 2. Amount matches
            if data.get("amount") is not None:
                reported_amount = Decimal(str(data["amount"]))
                amount_in_rupees = reported_amount / Decimal("100")
                if reported_amount != payment.amount and amount_in_rupees != payment.amount:
                    return Response({"detail": "Payment amount mismatch.", "code": "amount_mismatch"}, status=status.HTTP_400_BAD_REQUEST)

            # 3. Currency matches
            if data.get("currency"):
                curr = str(data["currency"]).strip().upper()
                if curr != "INR":
                    return Response({"detail": "Payment currency mismatch.", "code": "currency_mismatch"}, status=status.HTTP_400_BAD_REQUEST)

            # If request user is authenticated, ensure customer has access
            if request.user and request.user.is_authenticated:
                if (payment.order.customer_id and payment.order.customer_id != request.user.id and
                        payment.order.placed_by_id and payment.order.placed_by_id != request.user.id and
                        not get_active_employee(request.user)):
                    return Response({"detail": "Not found.", "code": "not_found"}, status=status.HTTP_404_NOT_FOUND)
            event_id = f"checkout:{data['razorpay_payment_id']}"
            payload = {
                "razorpay_order_id": data["razorpay_order_id"],
                "razorpay_payment_id": data["razorpay_payment_id"],
            }
            req_method = str(data.get("payment_method") or "").strip().upper()
            resolved_method = None
            if req_method in ("UPI", "RAZORPAY_UPI"):
                resolved_method = Payment.Method.RAZORPAY_UPI
            elif req_method in ("CARD", "RAZORPAY_CARD"):
                resolved_method = Payment.Method.RAZORPAY_CARD
            try:
                with transaction.atomic():
                    payment = _apply_capture(
                        payment,
                        data["razorpay_payment_id"],
                        data["razorpay_signature"],
                        event_id,
                        "checkout.captured",
                        payload,
                        method=resolved_method,
                    )
                if request.user and request.user.is_authenticated:
                    record_audit(request.user, "payment.captured", "Payment", payment.id, branch=payment.order.branch,
                                 changes={"order_id": payment.order_id}, ip=request.META.get("REMOTE_ADDR"))
            except PaymentError as exc:
                return _error(exc)

        resp = {
            "status": "SUCCESS",
            "success": True,
            "message": "Payment verified successfully",
            "razorpay_order_id": data["razorpay_order_id"],
            "razorpay_payment_id": data["razorpay_payment_id"],
        }
        if payment:
            serialized = serialize_payment(payment)
            serialized["status"] = "SUCCESS"
            serialized["success"] = True
            serialized["message"] = "Payment verified successfully"
            return Response(serialized)

        return Response(resp, status=status.HTTP_200_OK)


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
            payment = record_counter(
                request.user,
                pk,
                ser.validated_data.get("amount"),
                method=ser.validated_data.get("method"),
            )
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
            if not sees_every_order(user):
                qs = qs.filter(order__placed_by=user)
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
        elif not sees_every_order(user) and order.placed_by_id != user.id:
            return Response({"detail": "Not found."}, status=404)
        return Response(serialize_payment(payment))


class OrderPaymentStatusView(APIView):
    """GET /api/orders/<int:pk>/payment-status/ - Real-time payment verification for POS, Billing & Customer."""
    permission_classes = [AllowAny]

    def get(self, request, pk):
        order = Order.objects.filter(pk=pk).first()
        if not order:
            return Response({"detail": "Order not found.", "code": "order_not_found"}, status=status.HTTP_404_NOT_FOUND)

        latest_payment = Payment.objects.filter(order=order).order_by("-id").first()
        is_paid = (order.payment_status == Order.PaymentStatus.PAID) or (latest_payment and latest_payment.status == Payment.Status.SUCCESS)

        return Response({
            "order_id": order.id,
            "order_number": order.order_number,
            "payment_status": "PAID" if is_paid else order.payment_status,
            "is_paid": is_paid,
            "payment_method": latest_payment.method if latest_payment else None,
            "amount": str(order.total_amount),
            "payment": serialize_payment(latest_payment) if latest_payment else None
        }, status=status.HTTP_200_OK)
