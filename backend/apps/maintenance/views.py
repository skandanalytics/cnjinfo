from rest_framework.permissions import AllowAny, BasePermission
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView

from apps.accounts.models import Employee
from apps.accounts.permissions import get_active_employee

from .services import (
    MaintenanceError,
    administrator_exists,
    administrator_rows,
    authorize_reset,
    change_administrator_password,
    create_administrator,
    create_first_administrator,
    recover_administrator,
    delete_records,
    list_records,
    overview,
    reset_application_data,
    setup_status,
    update_administrator,
)


def fail(exc):
    return Response({"detail": exc.detail}, status=exc.status)


class IsDatabaseAdmin(BasePermission):
    def has_permission(self, request, view):
        emp = get_active_employee(request.user)
        return bool(emp and emp.role in (Employee.Role.SUPER_ADMIN, Employee.Role.ADMIN))


class SetupStatusView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []

    def get(self, request):
        return Response(setup_status())


class SetupView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "db_setup"

    def post(self, request):
        try:
            return Response(create_first_administrator(request.data), status=201)
        except MaintenanceError as exc:
            return fail(exc)


class RecoverAdministratorView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "db_setup"

    def post(self, request):
        try:
            return Response(recover_administrator(request.data), status=201)
        except MaintenanceError as exc:
            return fail(exc)


class ConsoleView(APIView):
    permission_classes = [IsDatabaseAdmin]


class CreateAuthorizedAdminView(APIView):
    permission_classes = [AllowAny]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "db_setup"

    def post(self, request):
        actor = get_active_employee(request.user) if request.user.is_authenticated else None
        if not actor:
            authorizing_code = str(request.data.get("authorizing_code") or request.data.get("authorizing_admin_id") or "").strip().upper()
            authorizing_password = str(request.data.get("authorizing_password") or "")
            if authorizing_code and authorizing_password:
                candidate = Employee.objects.select_related("user").filter(employee_code=authorizing_code, status=Employee.Status.ACTIVE).first()
                if not candidate or not candidate.user.check_password(authorizing_password):
                    return Response({"detail": "Invalid authorizing administrator credentials."}, status=401)
                if candidate.role not in (Employee.Role.SUPER_ADMIN, Employee.Role.ADMIN):
                    return Response({"detail": "Only an authorized administrator can create administrator accounts."}, status=403)
                actor = candidate

        if actor and actor.role in (Employee.Role.SUPER_ADMIN, Employee.Role.ADMIN):
            try:
                return Response(create_administrator(actor, request.data), status=201)
            except MaintenanceError as exc:
                return fail(exc)

        # Unauthenticated recovery workflow requires valid setup_key
        if request.data.get("setup_key"):
            try:
                return Response(recover_administrator(request.data, bypass_secret=False), status=201)
            except MaintenanceError as exc:
                return fail(exc)

        return Response({"detail": "Authentication or authorization credentials required."}, status=401)


class OverviewView(ConsoleView):
    def get(self, request):
        return Response(overview(get_active_employee(request.user)))


class RecordsView(ConsoleView):
    def get(self, request, app_label, model_name):
        try:
            return Response(list_records(
                f"{app_label}.{model_name}",
                request.query_params.get("page"),
                request.query_params.get("page_size"),
                request.query_params.get("search"),
                request.query_params.get("ordering"),
            ))
        except MaintenanceError as exc:
            return fail(exc)


class DeleteRecordsView(ConsoleView):
    def post(self, request, app_label, model_name):
        try:
            return Response(delete_records(f"{app_label}.{model_name}", request.data.get("ids")))
        except MaintenanceError as exc:
            return fail(exc)


class ResetAuthorizeView(ConsoleView):
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "db_reset"

    def post(self, request):
        try:
            return Response(authorize_reset(request.user, request.data.get("password")))
        except MaintenanceError as exc:
            return fail(exc)


class ResetView(ConsoleView):
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "db_reset"

    def post(self, request):
        try:
            return Response(reset_application_data(
                request.user,
                request.data.get("password"),
                request.data.get("confirmation"),
                request.data.get("reset_token"),
            ))
        except MaintenanceError as exc:
            return fail(exc)


class AdministratorsView(ConsoleView):
    def get(self, request):
        emp = get_active_employee(request.user)
        if emp.role not in (Employee.Role.SUPER_ADMIN, Employee.Role.ADMIN):
            return Response({"detail": "Only an administrator can manage administrator accounts."}, status=403)
        return Response(administrator_rows())

    def post(self, request):
        try:
            return Response(create_administrator(get_active_employee(request.user), request.data), status=201)
        except MaintenanceError as exc:
            return fail(exc)


class AdministratorDetailView(ConsoleView):
    def patch(self, request, pk):
        try:
            return Response(update_administrator(get_active_employee(request.user), pk, request.data))
        except MaintenanceError as exc:
            return fail(exc)


class AdministratorPasswordView(ConsoleView):
    def post(self, request, pk):
        try:
            return Response(change_administrator_password(get_active_employee(request.user), pk, request.data))
        except MaintenanceError as exc:
            return fail(exc)
