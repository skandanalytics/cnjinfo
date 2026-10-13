import logging

from django.contrib.auth.hashers import check_password, make_password
from django.db import transaction
from django.utils.crypto import get_random_string
from rest_framework import serializers, status, viewsets
from rest_framework.exceptions import PermissionDenied
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from .throttles import OTPSendIPThrottle, OTPSendPhoneThrottle, OTPVerifyIPThrottle, OTPVerifyPhoneThrottle
from rest_framework.views import APIView
from rest_framework_simplejwt.exceptions import TokenError
from rest_framework_simplejwt.tokens import RefreshToken

from apps.orders.models import Order

from . import otp
from .models import Employee, User
from .permissions import ROLE_RANK, IsAdminLevel, get_active_employee
from .scoping import BranchScopedMixin
from .serializers import (EmployeeSerializer, LogoutSerializer, SendOTPSerializer, StaffLoginSerializer,
                          VerifyOTPSerializer, user_payload)
from .services import (clear_failures, client_ip, delete_employee, is_locked, issue_tokens, mark_login,
                        record_audit, register_failure, revoke_user_tokens)
from .sms import dev_otp_visible

# Used to burn comparable CPU time when the employee code does not exist (prevents account enumeration by timing).
_DUMMY_HASH = make_password(get_random_string(16))
_GENERIC_LOGIN_ERROR = "Invalid employee ID or password."


class ThrottledView(APIView):
    throttle_classes = [ScopedRateThrottle]


class SendOTPView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []
    throttle_classes = [OTPSendPhoneThrottle, OTPSendIPThrottle]

    def post(self, request):
        s = SendOTPSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        phone = s.validated_data["phone"]
        existing = User.objects.filter(phone=phone).first()
        if existing and existing.user_type == User.UserType.EMPLOYEE:
            raise PermissionDenied("This number belongs to a staff account. Use staff login.")
        try:
            code = otp.send_otp(phone, ip=client_ip(request))
        except otp.OTPError as exc:
            body = {"detail": str(exc.detail), "code": exc.error_code}
            if exc.retry_after:
                body["retry_after"] = exc.retry_after
            resp = Response(body, status=exc.status_code)
            if exc.retry_after:
                resp["Retry-After"] = str(exc.retry_after)
            return resp
        body = {"detail": "OTP sent.", "expires_in": 300}
        if dev_otp_visible():
            body["dev_otp"] = code  # only when DEBUG and the console provider are active
        return Response(body)


class VerifyOTPView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []
    throttle_classes = [OTPVerifyPhoneThrottle, OTPVerifyIPThrottle]

    def post(self, request):
        s = VerifyOTPSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        phone = s.validated_data["phone"]
        existing = User.objects.filter(phone=phone).first()
        if existing and existing.user_type == User.UserType.EMPLOYEE:
            raise PermissionDenied("This number belongs to a staff account. Use staff login.")
        try:
            otp.verify_otp(phone, s.validated_data["otp"])
        except otp.OTPError as exc:
            body = {"detail": str(exc.detail), "code": exc.error_code}
            if getattr(exc, "retry_after", None):
                body["retry_after"] = exc.retry_after
            resp = Response(body, status=exc.status_code)
            if getattr(exc, "retry_after", None):
                resp["Retry-After"] = str(exc.retry_after)
            return resp
        with transaction.atomic():
            user = existing or User.objects.create_user(phone=phone, user_type=User.UserType.CUSTOMER)
            if not user.is_active:
                raise PermissionDenied("This account is disabled.")
            # First-time = no prior COMPLETED order for this verified phone (SRS 3.1.5).
            first_time = not Order.objects.filter(customer=user, status=Order.Status.COMPLETED).exists()
        mark_login(user)
        body = {**issue_tokens(user), "user": user_payload(user), "is_first_time_customer": first_time}
        guest_token = s.validated_data.get("guest_token")
        if guest_token:
            # A merge problem must never block login; the guest cart stays untouched and can be merged again.
            try:
                from apps.carts.services import merge_guest_carts
                body["merged_cart_branches"] = merge_guest_carts(user, guest_token)
            except Exception:  # pragma: no cover
                logging.getLogger(__name__).exception("Guest cart merge failed for user %s", user.pk)
                body["merged_cart_branches"] = None
        return Response(body)


class StaffLoginView(ThrottledView):
    """Admin and employee login with Employee ID + password (SRS 3.3.1). Customers cannot use this."""

    permission_classes = [AllowAny]
    authentication_classes = []
    throttle_scope = "staff_login"

    def post(self, request):
        s = StaffLoginSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        code = s.validated_data["employee_code"].strip().upper()
        password = s.validated_data["password"]
        if is_locked(code):
            return Response({"detail": "Too many failed attempts. Try again later."},
                            status=status.HTTP_429_TOO_MANY_REQUESTS)
        emp = Employee.objects.select_related("user", "branch").filter(employee_code=code).first()
        if emp is None:
            check_password(password, _DUMMY_HASH)
            ok = False
        else:
            ok = emp.user.check_password(password)
        if not ok:
            register_failure(code)
            # Explicit 401: with authentication_classes=[] DRF would otherwise downgrade it to 403.
            return Response({"detail": _GENERIC_LOGIN_ERROR}, status=status.HTTP_401_UNAUTHORIZED)
        if not emp.user.is_active or emp.status != Employee.Status.ACTIVE:
            raise PermissionDenied("This account is not active. Contact your administrator.")
        clear_failures(code)
        mark_login(emp.user)
        return Response({**issue_tokens(emp.user), "user": user_payload(emp.user)})


class LogoutView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        s = LogoutSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        try:
            token = RefreshToken(s.validated_data["refresh"])
        except TokenError:
            return Response({"detail": "Invalid or expired refresh token."}, status=status.HTTP_400_BAD_REQUEST)
        if str(token.get("user_id")) != str(request.user.id):
            raise PermissionDenied("Token does not belong to this user.")
        try:
            token.blacklist()
        except AttributeError:  # pragma: no cover
            pass
        return Response({"detail": "Logged out."})


class MeView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        return Response(user_payload(request.user))


class ChangePasswordSerializer(serializers.Serializer):
    current_password = serializers.CharField(trim_whitespace=False)
    new_password = serializers.CharField(trim_whitespace=False)
    confirm_password = serializers.CharField(trim_whitespace=False)

    def validate(self, attrs):
        if attrs["new_password"] != attrs["confirm_password"]:
            raise serializers.ValidationError({"confirm_password": "New password and confirmation do not match."})
        from django.contrib.auth.password_validation import validate_password
        from django.core.exceptions import ValidationError
        try:
            validate_password(attrs["new_password"], self.context["request"].user)
        except ValidationError as exc:
            raise serializers.ValidationError({"new_password": list(exc.messages)})
        return attrs


class ChangePasswordView(APIView):
    """The signed-in staff member changes only their own password."""

    permission_classes = [IsAuthenticated]

    def post(self, request):
        if request.user.user_type != "EMPLOYEE":
            return Response({"detail": "Only a staff account can change this password."}, status=403)
        serializer = ChangePasswordSerializer(data=request.data, context={"request": request})
        serializer.is_valid(raise_exception=True)
        if not request.user.check_password(serializer.validated_data["current_password"]):
            return Response({"current_password": ["Current password is incorrect."]}, status=400)
        request.user.set_password(serializer.validated_data["new_password"])
        request.user.save(update_fields=["password"])
        revoke_user_tokens(request.user)
        record_audit(request.user, "auth.password_change", "User", request.user.id, None, {}, client_ip(request))
        return Response({"detail": "Password updated."})


class EmployeeViewSet(BranchScopedMixin, viewsets.ModelViewSet):
    """Admin-level only. DELETE removes the employee and their login; orders keep the staff name snapshot."""

    queryset = Employee.objects.select_related("user", "branch").order_by("-id")
    serializer_class = EmployeeSerializer
    permission_classes = [IsAdminLevel]
    filterset_fields = ["role", "status", "department", "branch"]
    search_fields = ["user__name", "employee_code", "user__phone"]
    http_method_names = ["get", "post", "put", "patch", "delete", "head", "options"]

    def perform_create(self, serializer):
        emp = serializer.save()
        record_audit(self.request.user, "employee.create", "Employee", emp.id, emp.branch,
                     {"role": emp.role}, client_ip(self.request))

    def perform_update(self, serializer):
        before = serializer.instance
        was = (before.role, before.status, before.branch_id)
        emp = serializer.save()
        if "password" in serializer.validated_data or emp.status != Employee.Status.ACTIVE:
            revoke_user_tokens(emp.user)
        record_audit(self.request.user, "employee.update", "Employee", emp.id, emp.branch,
                     {"from": list(was), "to": [emp.role, emp.status, emp.branch_id]}, client_ip(self.request))

    def destroy(self, request, *args, **kwargs):
        emp = self.get_object()
        if emp.user_id == request.user.id:
            raise PermissionDenied("You cannot delete your own account.")
        if emp.role in (Employee.Role.SUPER_ADMIN, Employee.Role.ADMIN):
            remaining = Employee.objects.filter(
                role__in=(Employee.Role.SUPER_ADMIN, Employee.Role.ADMIN),
                status=Employee.Status.ACTIVE,
            ).exclude(pk=emp.pk).count()
            if remaining < 1:
                raise PermissionDenied("The last active administrator cannot be removed.")
        actor = get_active_employee(request.user)
        if actor.role != Employee.Role.SUPER_ADMIN and ROLE_RANK[emp.role] >= ROLE_RANK[actor.role]:
            raise PermissionDenied("You cannot delete an employee with an equal or higher role.")
        details = {"employee_code": emp.employee_code, "name": emp.user.name, "role": emp.role}
        emp_id, branch = emp.id, emp.branch
        with transaction.atomic():
            details["login"] = delete_employee(emp)
            record_audit(request.user, "employee.delete", "Employee", emp_id, branch, details, client_ip(request))
        return Response(status=status.HTTP_204_NO_CONTENT)

