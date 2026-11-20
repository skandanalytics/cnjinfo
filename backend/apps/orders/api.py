import logging
from datetime import datetime, time, timedelta
from decimal import ROUND_HALF_UP, Decimal, InvalidOperation

logger = logging.getLogger(__name__)
from django.db import transaction
from django.db.models import Q
from django.utils import timezone
from rest_framework import serializers, status
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.permissions import ADMIN_ROLES, IsCustomer, IsStaffMember, get_active_employee, sees_every_order
from apps.accounts.scoping import allowed_branch_id, can_access_branch
from apps.accounts.services import record_audit
from apps.branches.models import Branch
from apps.menu.pricing_helpers import money
from apps.payments.models import Payment, Refund

from .lifecycle import OrderError, change_status, create_assisted, create_from_cart, reject_order, serialize_order
from .models import Order
from .pricing import service_charge_for


class PlaceOrderSerializer(serializers.Serializer):
    branch = serializers.PrimaryKeyRelatedField(queryset=Branch.objects.filter(is_active=True))
    idempotency_key = serializers.CharField(max_length=64)
    payment_method = serializers.ChoiceField(
        choices=["RAZORPAY_UPI", "RAZORPAY_CARD", "CASH", "RAZORPAY", "UPI", "CARD", "NETBANKING", "WALLET", "COUNTER"]
    )
    cart_id = serializers.IntegerField(required=False, allow_null=True)
    cart = serializers.IntegerField(required=False, allow_null=True)
    parent_order = serializers.IntegerField(required=False, allow_null=True)
    parent_order_id = serializers.IntegerField(required=False, allow_null=True)
    service_tax_enabled = serializers.BooleanField(required=False, default=True)
    customer_phone = serializers.CharField(required=False, allow_blank=True, default="")
    customer_name = serializers.CharField(required=False, allow_blank=True, default="")


def _error(exc):
    return Response({"detail": exc.detail, "code": exc.code}, status=exc.http_status)


def _sees_every_order(user):
    return sees_every_order(user)


class OrderListCreateView(APIView):
    def get_permissions(self):
        if self.request.method == "POST":
            guest_token = self.request.META.get("HTTP_X_GUEST_TOKEN", "")
            if len(guest_token) >= 20:
                return [AllowAny()]
            return [_CustomerOrStaff()]
        elif self.request.method == "GET":
            if self.request.query_params.get("phone") or self.request.query_params.get("mobile"):
                return [AllowAny()]
            return [_AnyActive()]
        return [_AnyActive()]

    def post(self, request):
        ser = PlaceOrderSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        raw_cart_id = ser.validated_data.get("cart_id") or ser.validated_data.get("cart")
        guest_token = request.META.get("HTTP_X_GUEST_TOKEN")
        if raw_cart_id:
            from apps.carts.models import Cart
            target_cart = Cart.objects.filter(pk=raw_cart_id).first()
            if target_cart:
                if request.user.is_authenticated:
                    if target_cart.user_id != request.user.id:
                        return Response({"detail": "You do not have access to this cart.", "code": "cart_forbidden"},
                                        status=status.HTTP_403_FORBIDDEN)
                elif guest_token and len(guest_token) >= 20:
                    from apps.carts.services import hash_token
                    if target_cart.guest_token != hash_token(guest_token):
                        return Response({"detail": "You do not have access to this cart.", "code": "cart_forbidden"},
                                        status=status.HTTP_403_FORBIDDEN)
        try:
            parent_order_id = ser.validated_data.get("parent_order_id") or ser.validated_data.get("parent_order")
            order, created = create_from_cart(request.user, ser.validated_data["branch"],
                                              ser.validated_data["idempotency_key"],
                                              ser.validated_data["payment_method"],
                                              service_tax_enabled=ser.validated_data.get("service_tax_enabled", True),
                                              parent_order_id=parent_order_id,
                                              customer_phone=ser.validated_data.get("customer_phone", ""),
                                              customer_name=ser.validated_data.get("customer_name", ""),
                                              guest_token=guest_token)
        except OrderError as exc:
            return _error(exc)
        if created:
            record_audit(request.user, "order.placed", "Order", order.id, branch=order.branch, ip=self._ip(request))
        return Response(serialize_order(order), status=status.HTTP_201_CREATED if created else status.HTTP_200_OK)

    def get(self, request):
        user = request.user
        phone_param = request.query_params.get("phone") or request.query_params.get("mobile")

        if phone_param:
            clean_phone = "".join(filter(str.isdigit, str(phone_param)))[-10:]
            if user.is_authenticated and user.user_type != "CUSTOMER":
                emp = get_active_employee(user)
                if emp is None and not getattr(user, "is_superuser", False):
                    return Response({"detail": "No active staff profile."}, status=403)
                qs = Order.objects.filter(Q(customer_phone=clean_phone) | Q(customer__phone=clean_phone))
                if emp and emp.branch_id is not None:
                    qs = qs.filter(branch_id=emp.branch_id)
            elif user.is_authenticated:
                qs = Order.objects.filter(Q(customer=user) | Q(customer_phone=clean_phone) | Q(customer__phone=clean_phone))
            else:
                if len(clean_phone) == 10:
                    qs = Order.objects.filter(Q(customer_phone=clean_phone) | Q(customer__phone=clean_phone))
                else:
                    qs = Order.objects.none()
        else:
            if not user.is_authenticated:
                return Response({"detail": "Authentication credentials or phone number required."}, status=401)
            if user.user_type == "CUSTOMER":
                qs = Order.objects.filter(customer=user)
            else:
                emp = get_active_employee(user)
                if emp is None and not getattr(user, "is_superuser", False):
                    return Response({"detail": "No active staff profile."}, status=403)
                qs = Order.objects.all()
                if emp and emp.branch_id is not None:
                    qs = qs.filter(branch_id=emp.branch_id)
                elif request.query_params.get("branch"):
                    branch_param = request.query_params.get("branch")
                    if branch_param and branch_param.upper() != "ALL":
                        qs = qs.filter(branch_id=branch_param)
                if not _sees_every_order(user) or request.query_params.get("mine") == "1":
                    qs = qs.filter(placed_by=user)

        status_filter = request.query_params.get("status")
        if status_filter:
            qs = qs.filter(status=status_filter)

        from_date = request.query_params.get("from_date") or request.query_params.get("date_from")
        to_date = request.query_params.get("to_date") or request.query_params.get("date_to")
        tz = timezone.get_current_timezone()
        if from_date:
            try:
                parsed_from = datetime.strptime(str(from_date).strip(), "%Y-%m-%d").date()
                start_dt = timezone.make_aware(datetime.combine(parsed_from, time.min), tz)
                qs = qs.filter(created_at__gte=start_dt)
            except (ValueError, TypeError):
                pass
        if to_date:
            try:
                parsed_to = datetime.strptime(str(to_date).strip(), "%Y-%m-%d").date()
                end_dt = timezone.make_aware(datetime.combine(parsed_to + timedelta(days=1), time.min), tz)
                qs = qs.filter(created_at__lt=end_dt)
            except (ValueError, TypeError):
                pass

        qs = qs.order_by("-id")
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
    order_type = serializers.ChoiceField(choices=["DINE_IN", "TAKEAWAY", "SELF_SERVICE"], default="DINE_IN")
    parent_order = serializers.IntegerField(required=False, allow_null=True)
    parent_order_id = serializers.IntegerField(required=False, allow_null=True)
    items = AssistedItemSerializer(many=True)
    idempotency_key = serializers.CharField(max_length=64)
    coupon_code = serializers.CharField(max_length=150, required=False, allow_blank=True, default="")
    coupon_codes = serializers.ListField(child=serializers.CharField(), required=False, default=list)
    customer_phone = serializers.CharField(max_length=20, required=False, allow_blank=True, default="")
    customer_name = serializers.CharField(max_length=255, required=False, allow_blank=True, default="")
    payment_method = serializers.CharField(max_length=30, required=False, default="CASH")
    mark_paid = serializers.BooleanField(required=False, default=False)
    service_tax_enabled = serializers.BooleanField(required=False, default=True)

    def validate(self, attrs):
        attrs = super().validate(attrs)
        ord_type = attrs.get("order_type")
        phone = (attrs.get("customer_phone") or "").strip()
        parent_id = attrs.get("parent_order_id") or attrs.get("parent_order")

        # For Self Service: table is null, customer phone is optional
        if ord_type == "SELF_SERVICE":
            attrs["table"] = None
            if phone:
                digits = "".join(filter(str.isdigit, phone))
                if len(digits) < 7:
                    raise serializers.ValidationError({"customer_phone": "Please enter a valid mobile number."})
            return attrs

        if not parent_id and not phone:
            table_id = attrs.get("table")
            if table_id:
                from apps.orders.models import Order
                has_active = Order.objects.filter(
                    table_id=table_id,
                    order_type=Order.Type.DINE_IN,
                    status__in=Order.ACTIVE_STATUSES
                ).exists()
                if not has_active:
                    raise serializers.ValidationError({"customer_phone": "Customer mobile number is required."})
            else:
                raise serializers.ValidationError({"customer_phone": "Customer mobile number is required."})
        elif phone:
            digits = "".join(filter(str.isdigit, phone))
            if len(digits) < 7:
                raise serializers.ValidationError({"customer_phone": "Please enter a valid mobile number."})
        return attrs


class AssistedOrderView(APIView):
    permission_classes = [IsStaffMember]

    def post(self, request):
        emp = get_active_employee(request.user)
        if emp and (emp.role == "CHEF" or (emp.job_title and "cook" in emp.job_title.lower()) or (emp.job_title and "chef" in emp.job_title.lower())):
            return Response({"detail": "Kitchen staff and cooks are not permitted to place orders.", "code": "cook_forbidden"}, status=status.HTTP_403_FORBIDDEN)
        ser = AssistedOrderSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        data = ser.validated_data
        if not data["items"]:
            return Response({"detail": "Add at least one dish.", "code": "cart_empty"}, status=400)
        try:
            parent_order_id = data.get("parent_order_id") or data.get("parent_order")
            order, created = create_assisted(
                request.user,
                data.get("table"),
                data["items"],
                data["idempotency_key"],
                branch_id=data.get("branch"),
                order_type=data.get("order_type", Order.Type.DINE_IN),
                coupon_code=data.get("coupon_codes") or data.get("coupon_code", ""),
                customer_phone=data.get("customer_phone", ""),
                customer_name=data.get("customer_name", ""),
                mark_paid=data.get("mark_paid", False),
                payment_method=data.get("payment_method", "CASH"),
                service_tax_enabled=data.get("service_tax_enabled", True),
                parent_order_id=parent_order_id,
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

    def patch(self, request, pk):
        user = request.user
        if not user or not user.is_authenticated:
            return Response({"detail": "Authentication credentials were not provided."}, status=status.HTTP_401_UNAUTHORIZED)

        # Authorized staff or administrators who have access to this branch can modify service charge or coupons
        if getattr(user, "is_superuser", False) or getattr(user, "user_type", None) == "ADMIN":
            is_authorized = True
        else:
            emp = get_active_employee(user)
            is_authorized = emp is not None or user.is_staff
        if not is_authorized:
            return Response({"detail": "Only staff members can modify order settings.", "code": "permission_denied"}, status=status.HTTP_403_FORBIDDEN)

        enabled_raw = request.data.get("service_charge_enabled")
        if enabled_raw is None:
            enabled_raw = request.data.get("service_tax_enabled")

        coupon_code = request.data.get("coupon_code")
        coupon_codes = request.data.get("coupon_codes")
        remove_coupon = request.data.get("remove_coupon")

        if enabled_raw is None and coupon_code is None and coupon_codes is None and remove_coupon is None:
            return Response({"detail": "Missing service_charge_enabled, coupon_code, or remove_coupon field.", "code": "invalid_input"}, status=status.HTTP_400_BAD_REQUEST)

        try:
            with transaction.atomic():
                try:
                    if str(pk).isdigit():
                        order = Order.objects.select_for_update().prefetch_related("items", "status_history").get(pk=int(pk))
                    else:
                        order = Order.objects.select_for_update().prefetch_related("items", "status_history").get(order_number=str(pk))
                except Order.DoesNotExist:
                    return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)

                if not can_access_branch(user, order.branch_id):
                    return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)

                if order.status == Order.Status.CANCELLED:
                    return Response({"detail": "Cannot modify a cancelled order.", "code": "order_cancelled"}, status=status.HTTP_400_BAD_REQUEST)

                # If this is a continuation, operate on root order for session coupons
                root = order.parent_order if order.parent_order_id else order
                if root.id != order.id:
                    root = Order.objects.select_for_update().prefetch_related("items", "status_history").get(pk=root.id)

                if coupon_code is not None or remove_coupon:
                    if root.payment_status == Order.PaymentStatus.PAID:
                        return Response({"detail": "Cannot modify coupon for a paid order.", "code": "order_paid"}, status=status.HTTP_400_BAD_REQUEST)
                    if root.status in (Order.Status.CANCELLED, Order.Status.COMPLETED):
                        return Response({"detail": "Cannot modify coupon for a completed or cancelled order.", "code": "order_closed"}, status=status.HTTP_400_BAD_REQUEST)

                branch = Branch.objects.filter(pk=root.branch_id).first() if root.branch_id else None

                # Handle Coupon Apply or Remove
                all_session_orders = [root] + list(root.continuations.exclude(status=Order.Status.CANCELLED))
                session_subtotal = sum((o.items_subtotal for o in all_session_orders), Decimal("0.00"))
                session_customization = sum((o.customization_total for o in all_session_orders), Decimal("0.00"))
                session_dish_discount = sum((o.dish_discount_total for o in all_session_orders), Decimal("0.00"))
                session_takeaway = sum((o.takeaway_charge for o in all_session_orders), Decimal("0.00"))
                qualifying_amount = session_subtotal + session_customization - session_dish_discount

                from apps.coupons.models import Coupon, CouponRedemption
                from apps.coupons.services import apply_coupons

                remove_code = request.data.get("remove_code")
                if remove_coupon and not remove_code:
                    root.coupon_discount_total = Decimal("0.00")
                    CouponRedemption.objects.filter(order=root).delete()
                elif remove_code:
                    CouponRedemption.objects.filter(order=root, coupon_code__iexact=str(remove_code).strip()).delete()
                    remaining_codes = list(CouponRedemption.objects.filter(order=root).values_list("coupon_code", flat=True))
                    CouponRedemption.objects.filter(order=root).delete()
                    if remaining_codes:
                        outcome = apply_coupons(branch, qualifying_amount, root.customer, remaining_codes, allow_auto=False, exclude_order=root)
                        root.coupon_discount_total = sum((a.amount for a in outcome.applied), Decimal("0.00"))
                        for a in outcome.applied:
                            CouponRedemption.objects.create(
                                coupon=a.coupon,
                                coupon_code=a.coupon.code,
                                order=root,
                                customer=root.customer if root.customer_id else None,
                                discount_amount=a.amount,
                            )
                    else:
                        root.coupon_discount_total = Decimal("0.00")
                elif coupon_code is not None or request.data.get("coupon_codes"):
                    req_codes = request.data.get("coupon_codes")
                    if not req_codes:
                        clean_code = str(coupon_code).strip()
                        if clean_code:
                            # If customer is first-time, see if there is an existing coupon they can combine with
                            existing_redemptions = list(CouponRedemption.objects.filter(order=root).select_related("coupon"))
                            target_coupon = Coupon.objects.filter(branch=branch, code__iexact=clean_code).first()
                            if target_coupon and target_coupon.is_first_time_auto:
                                remaining_ex = [r.coupon_code for r in existing_redemptions if not (r.coupon and r.coupon.is_first_time_auto)]
                                req_codes = [clean_code] + remaining_ex
                            else:
                                new_user_ex = [r.coupon_code for r in existing_redemptions if r.coupon and r.coupon.is_first_time_auto]
                                req_codes = new_user_ex + [clean_code]
                        else:
                            req_codes = []

                    if not req_codes:
                        root.coupon_discount_total = Decimal("0.00")
                        CouponRedemption.objects.filter(order=root).delete()
                    else:
                        outcome = apply_coupons(branch, qualifying_amount, root.customer, req_codes, allow_auto=False, exclude_order=root)
                        if outcome.rejected:
                            return Response({"detail": outcome.rejected[0][1], "code": "coupon_rejected"}, status=status.HTTP_400_BAD_REQUEST)
                        if not outcome.applied:
                            return Response({"detail": "Coupon is not applicable to this order.", "code": "coupon_not_applicable"}, status=status.HTTP_400_BAD_REQUEST)

                        CouponRedemption.objects.filter(order=root).delete()
                        root.coupon_discount_total = sum((a.amount for a in outcome.applied), Decimal("0.00"))
                        for a in outcome.applied:
                            CouponRedemption.objects.create(
                                coupon=a.coupon,
                                coupon_code=a.coupon.code,
                                order=root,
                                customer=root.customer if root.customer_id else None,
                                discount_amount=a.amount,
                            )

                # Service charge flag
                if enabled_raw is not None:
                    enabled = str(enabled_raw).lower() in ("true", "1", "yes") if not isinstance(enabled_raw, bool) else enabled_raw
                else:
                    enabled = root.service_charge_rate > Decimal("0")

                is_session = len(all_session_orders) > 1
                merchandise = session_subtotal + session_customization - session_dish_discount if is_session else (root.items_subtotal + root.customization_total - root.dish_discount_total)
                food_after_coupon = max(Decimal("0.00"), merchandise - root.coupon_discount_total)
                takeaway_charge = session_takeaway if is_session else root.takeaway_charge
                root.taxable_amount = food_after_coupon + takeaway_charge
                root.gst_amount = money(root.taxable_amount * root.gst_rate / Decimal("100"))

                if enabled and root.order_type != Order.Type.TAKEAWAY:
                    configured_rate = branch.service_charge_rate if branch else Decimal("0")
                    if configured_rate > Decimal("0"):
                        rate = configured_rate
                        service = money(food_after_coupon * rate / Decimal("100"))
                    else:
                        rate, service = service_charge_for(food_after_coupon, configured_rate)
                        if rate == Decimal("0.00") and food_after_coupon > Decimal("0"):
                            rate = Decimal("2.00")
                            service = money(food_after_coupon * rate / Decimal("100"))
                else:
                    rate = Decimal("0.00")
                    service = Decimal("0.00")

                raw_total = root.taxable_amount + root.gst_amount + service
                payable = raw_total.quantize(Decimal("1"), rounding=ROUND_HALF_UP)
                round_off = payable - raw_total

                root.service_charge_rate = rate
                root.service_charge_amount = service
                root.round_off = round_off
                root.total_amount = payable
                root.save(update_fields=[
                    "coupon_discount_total", "taxable_amount", "gst_amount",
                    "service_charge_rate", "service_charge_amount", "round_off", "total_amount", "updated_at"
                ])

                if root.payment_status == Order.PaymentStatus.PAID:
                    root.payments.filter(status="SUCCESS").update(amount=payable)

                record_audit(
                    user,
                    "order.details_update",
                    "Order",
                    root.id,
                    branch=branch,
                    changes={
                        "service_charge_enabled": enabled,
                        "service_charge_rate": str(rate),
                        "service_charge_amount": str(service),
                        "coupon_discount_total": str(root.coupon_discount_total),
                        "total_amount": str(payable),
                    },
                    ip=request.META.get("REMOTE_ADDR"),
                )

            return Response(serialize_order(root))
        except Exception as exc:
            logger.exception("Failed to update order %s details: %s", pk, exc)
            return Response(
                {"detail": "Unable to update order coupon at this time. Please try again.", "code": "coupon_processing_error"},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

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
            return order
        if user.user_type == "CUSTOMER":
            return order
        if not can_access_branch(user, order.branch_id):
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
        if new_status == Order.Status.CANCELLED:
            from apps.accounts.permissions import is_admin_level
            if not is_admin_level(request.user):
                return Response(
                    {"detail": "Only administrators can cancel bills or orders.", "code": "admin_only_cancellation"},
                    status=status.HTTP_403_FORBIDDEN
                )
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
        qs = Order.objects.filter(status__in=[Order.Status.PENDING, Order.Status.PLACED, Order.Status.PREPARING, Order.Status.READY,
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


class ProceedToBillView(APIView):
    permission_classes = [_CustomerOrStaff]

    def post(self, request, pk):
        detail_view = OrderDetailView()
        order = detail_view._visible(request, pk)
        if order is None:
            return Response({"detail": "Not found."}, status=404)

        root = order.parent_order if order.parent_order_id else order

        if root.status == Order.Status.CANCELLED:
            return Response({"detail": "Cancelled orders cannot proceed to bill.", "code": "order_cancelled"}, status=400)

        # REQ-10.4: Check if root or any continuation suborder is still in progress (PENDING, PREPARING, READY)
        all_session_orders = [root] + list(root.continuations.all())
        in_progress = [
            o for o in all_session_orders 
            if o.status in [Order.Status.PENDING, Order.Status.PREPARING, Order.Status.READY]
        ]
        if in_progress:
            return Response({
                "detail": "Order in progress. Cannot complete session while orders are still preparing or being served.",
                "code": "order_in_progress"
            }, status=400)

        # Transition root order and all sibling continuations if not already completed
        if root.status != Order.Status.COMPLETED:
            try:
                change_status(root.id, Order.Status.COMPLETED, request.user, "Proceed to Bill confirmed")
            except OrderError as exc:
                return _error(exc)

        from django.utils import timezone
        from .models import OrderStatusHistory
        for sibling in root.continuations.exclude(status__in=[Order.Status.CANCELLED, Order.Status.COMPLETED]):
            prev_status = sibling.status
            sibling.status = Order.Status.COMPLETED
            if not sibling.completed_at:
                sibling.completed_at = timezone.now()
            sibling.save(update_fields=["status", "completed_at", "updated_at"])
            OrderStatusHistory.objects.create(
                order=sibling,
                from_status=prev_status,
                to_status=Order.Status.COMPLETED,
                note="Proceed to Bill confirmed",
                changed_by=request.user,
            )

        # Ensure final invoice is generated
        from apps.billing.services import ensure_final_invoice, preview_bill
        try:
            ensure_final_invoice(root)
        except Exception:
            pass

        # REQ-10.4 & REQ-16: Table is NOT automatically released here.
        # Table remains OCCUPIED until staff explicitly clicks Table Cleaned in Kitchen Queue.

        order.refresh_from_db()

        record_audit(
            request.user,
            "order.proceed_to_bill",
            "Order",
            order.id,
            branch=order.branch,
            changes={"status": Order.Status.COMPLETED},
            ip=request.META.get("REMOTE_ADDR"),
        )
        return Response({
            "order": serialize_order(order),
            "bill": preview_bill(root),
        })


class OrderEligibleCouponsView(APIView):
    def get(self, request, pk):
        user = request.user
        if not user or not user.is_authenticated:
            return Response({"detail": "Authentication credentials were not provided."}, status=status.HTTP_401_UNAUTHORIZED)

        if getattr(user, "is_superuser", False) or getattr(user, "user_type", None) == "ADMIN":
            is_authorized = True
        else:
            emp = get_active_employee(user)
            is_authorized = emp is not None or user.is_staff or getattr(user, "user_type", None) == "CUSTOMER"
        if not is_authorized:
            return Response({"detail": "Permission denied.", "code": "permission_denied"}, status=status.HTTP_403_FORBIDDEN)

        detail_view = OrderDetailView()
        order = detail_view._visible(request, pk)
        if order is None:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)

        root = order.parent_order if order.parent_order_id else order
        branch = Branch.objects.filter(pk=root.branch_id).first() if root.branch_id else None
        if not branch:
            return Response({"order_id": order.id, "root_order_id": root.id, "qualifying_amount": "0.00", "coupons": []})

        all_session_orders = [root] + list(root.continuations.exclude(status=Order.Status.CANCELLED))
        session_subtotal = sum((o.items_subtotal for o in all_session_orders), Decimal("0.00"))
        session_customization = sum((o.customization_total for o in all_session_orders), Decimal("0.00"))
        session_dish_discount = sum((o.dish_discount_total for o in all_session_orders), Decimal("0.00"))
        qualifying_amount = max(Decimal("0.00"), session_subtotal + session_customization - session_dish_discount)

        from django.utils import timezone
        now = timezone.now()
        customer = root.customer

        from apps.coupons.models import Coupon
        from apps.coupons.services import ineligible_reason, discount_for, is_first_time

        first_time = is_first_time(customer)

        branch_coupons = Coupon.objects.filter(
            branch=branch, is_active=True, valid_from__lte=now, valid_to__gte=now
        ).order_by("min_order_value", "-discount_value")

        coupons_list = []
        for c in branch_coupons:
            reason = ineligible_reason(c, branch, qualifying_amount, customer, first_time, now, exclude_order=root)

            potential_discount = discount_for(c, qualifying_amount) if not reason else Decimal("0.00")

            coupons_list.append({
                "id": c.id,
                "code": c.code,
                "description": c.description or (f"{c.discount_value}% OFF" if c.discount_type == Coupon.Type.PERCENT else f"Flat ₹{c.discount_value} OFF"),
                "discount_type": c.discount_type,
                "discount_value": str(c.discount_value),
                "min_order_value": str(c.min_order_value),
                "max_discount": str(c.max_discount) if c.max_discount is not None else None,
                "calculated_discount": str(potential_discount),
                "is_eligible": reason is None,
                "ineligible_reason": reason,
                "is_first_time_auto": c.is_first_time_auto,
                "valid_from": c.valid_from.isoformat(),
                "valid_to": c.valid_to.isoformat(),
            })

        applied_coupons = [{
            "code": r.coupon_code,
            "discount": str(r.discount_amount),
            "is_first_time": r.coupon.is_first_time_auto if r.coupon else False
        } for r in root.coupon_redemptions.select_related("coupon").all()]

        return Response({
            "order_id": order.id,
            "root_order_id": root.id,
            "is_first_time_customer": first_time,
            "qualifying_amount": str(qualifying_amount),
            "applied_coupons": applied_coupons,
            "coupons": coupons_list,
        })


class OrderRejectView(APIView):
    permission_classes = [IsStaffMember]

    def post(self, request, pk):
        detail_view = OrderDetailView()
        order = detail_view._visible(request, pk)
        if order is None:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)

        from apps.accounts.permissions import IsAdminLevel
        if not IsAdminLevel().has_permission(request, self):
            return Response(
                {"detail": "Only administrators can reject orders.", "code": "admin_only_rejection"},
                status=status.HTTP_403_FORBIDDEN
            )

        scope = request.data.get("scope", "INDIVIDUAL")
        reason = request.data.get("reason", "")
        try:
            rejected = reject_order(order.id, request.user, scope=scope, reason=reason)
        except OrderError as exc:
            return _error(exc)

        record_audit(
            request.user, "order.reject", "Order", rejected.id,
            changes={"status": Order.Status.CANCELLED, "scope": scope, "reason": reason},
            ip=request.META.get("REMOTE_ADDR")
        )
        return Response(serialize_order(rejected))


class OrderRefundView(APIView):
    permission_classes = [IsStaffMember]

    def get(self, request, pk):
        detail_view = OrderDetailView()
        order = detail_view._visible(request, pk)
        if order is None:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)

        captured_payment = order.payments.filter(status=Payment.Status.SUCCESS).first()
        captured_amount = captured_payment.amount if captured_payment else (order.total_amount if order.payment_status == Order.PaymentStatus.PAID else Decimal("0.00"))
        refunds_qs = order.refunds.select_related("confirmed_by").all()
        refunds_data = [{
            "id": r.id,
            "amount": str(r.amount),
            "method": r.method,
            "status": r.status,
            "reason": r.reason,
            "notes": r.notes,
            "reference": r.reference,
            "confirmed_by": r.confirmed_by.name or r.confirmed_by.phone if r.confirmed_by else None,
            "created_at": r.created_at,
        } for r in refunds_qs]

        remaining = max(Decimal("0.00"), captured_amount - order.refunded_amount)
        return Response({
            "order_id": order.id,
            "order_number": order.order_number,
            "display_order_number": order.display_number,
            "payment_status": order.payment_status,
            "refund_status": order.refund_status,
            "captured_amount": str(captured_amount),
            "refunded_amount": str(order.refunded_amount),
            "remaining_refundable_amount": str(remaining),
            "payment_method": captured_payment.method if captured_payment else (getattr(order, 'payment_method', '') or "CASH"),
            "razorpay_payment_id": captured_payment.razorpay_payment_id if captured_payment else None,
            "refunds": refunds_data,
        })

    def post(self, request, pk):
        detail_view = OrderDetailView()
        order = detail_view._visible(request, pk)
        if order is None:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)

        from apps.accounts.permissions import can_confirm_refund
        from apps.realtime.publish import publish_order_event
        if not can_confirm_refund(request.user):
            return Response(
                {"detail": "You do not have permission to confirm manual refunds.", "code": "refund_permission_denied"},
                status=status.HTTP_403_FORBIDDEN
            )

        captured_payment = order.payments.filter(status=Payment.Status.SUCCESS).first()
        if order.payment_status != Order.PaymentStatus.PAID and not captured_payment and order.refunded_amount == 0:
            return Response(
                {"detail": "Cannot refund an unpaid order.", "code": "unpaid_order_refund"},
                status=status.HTTP_400_BAD_REQUEST
            )

        captured_amount = captured_payment.amount if captured_payment else order.total_amount
        status_req = str(request.data.get("status", "SUCCESS")).upper()
        is_failed = request.data.get("is_failed") in (True, "true", "True", 1, "1") or status_req == "FAILED"

        if is_failed:
            reason = request.data.get("reason", "") or request.data.get("notes", "Manual refund attempt failed")
            notes = request.data.get("notes", "")
            ref = request.data.get("reference", "")
            method = request.data.get("method") or (captured_payment.method if captured_payment else Payment.Method.CASH)
            with transaction.atomic():
                order = Order.objects.select_for_update().get(pk=order.id)
                Refund.objects.create(
                    order=order,
                    payment=captured_payment,
                    amount=Decimal("0.00"),
                    method=method,
                    status=Refund.Status.FAILED,
                    reason=reason,
                    notes=notes,
                    reference=ref,
                    confirmed_by=request.user,
                )
                order.refund_status = Order.RefundStatus.FAILED
                order.save(update_fields=["refund_status", "updated_at"])
                publish_order_event(order)

            return Response({
                "detail": "Failed refund recorded.",
                "order": serialize_order(order)
            }, status=status.HTTP_201_CREATED)

        try:
            req_amount = Decimal(str(request.data.get("amount", "")))
        except (TypeError, ValueError, InvalidOperation):
            return Response({"detail": "A valid refund amount is required.", "code": "invalid_amount"}, status=status.HTTP_400_BAD_REQUEST)

        if req_amount <= Decimal("0.00"):
            return Response({"detail": "Refund amount must be greater than zero.", "code": "invalid_amount"}, status=status.HTTP_400_BAD_REQUEST)

        with transaction.atomic():
            order = Order.objects.select_for_update().get(pk=order.id)
            current_refunded = order.refunded_amount
            remaining = captured_amount - current_refunded
            if req_amount > remaining:
                return Response(
                    {"detail": f"Refund amount (₹{req_amount}) exceeds remaining refundable amount (₹{remaining}).", "code": "exceeds_remaining"},
                    status=status.HTTP_400_BAD_REQUEST
                )

            method = request.data.get("method") or (captured_payment.method if captured_payment else Payment.Method.CASH)
            reason = request.data.get("reason", "")
            notes = request.data.get("notes", "")
            ref = request.data.get("reference", "")

            refund = Refund.objects.create(
                order=order,
                payment=captured_payment,
                amount=req_amount,
                method=method,
                status=Refund.Status.SUCCESS,
                reason=reason,
                notes=notes,
                reference=ref,
                confirmed_by=request.user,
            )

            new_refunded = current_refunded + req_amount
            order.refunded_amount = new_refunded
            if new_refunded >= captured_amount:
                order.refund_status = Order.RefundStatus.FULLY_REFUNDED
                order.payment_status = Order.PaymentStatus.REFUNDED
            else:
                order.refund_status = Order.RefundStatus.PARTIALLY_REFUNDED

            order.save(update_fields=["refunded_amount", "refund_status", "payment_status", "updated_at"])
            publish_order_event(order)

        record_audit(
            request.user, "order.refund", "Order", order.id,
            changes={"refund_id": refund.id, "amount": str(req_amount), "status": order.refund_status},
            ip=request.META.get("REMOTE_ADDR")
        )

        return Response({
            "detail": "Refund confirmed successfully.",
            "order": serialize_order(order),
            "refund": {
                "id": refund.id,
                "amount": str(refund.amount),
                "method": refund.method,
                "status": refund.status,
                "reference": refund.reference,
                "notes": refund.notes,
                "created_at": refund.created_at,
            }
        }, status=status.HTTP_201_CREATED)
