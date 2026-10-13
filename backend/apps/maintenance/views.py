from rest_framework.permissions import AllowAny, BasePermission
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView

from apps.accounts.models import Employee
from apps.accounts.permissions import get_active_employee

from .services import (
    MaintenanceError,
    administrator_rows,
    authorize_reset,
    change_administrator_password,
    create_administrator,
    create_first_administrator,
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


class ConsoleView(APIView):
    permission_classes = [IsDatabaseAdmin]


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
        if emp.role != Employee.Role.SUPER_ADMIN:
            return Response({"detail": "Only a super administrator can manage administrator accounts."}, status=403)
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
