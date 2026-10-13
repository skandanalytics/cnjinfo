from django.urls import path

from .views import (
    AdministratorDetailView,
    AdministratorPasswordView,
    AdministratorsView,
    CreateAuthorizedAdminView,
    DeleteRecordsView,
    OverviewView,
    RecordsView,
    ResetAuthorizeView,
    RecoverAdministratorView,
    ResetView,
    SetupStatusView,
    SetupView,
)

urlpatterns = [
    path("db/status/", SetupStatusView.as_view()),
    path("db/setup/", SetupView.as_view()),
    path("db/create-admin/", CreateAuthorizedAdminView.as_view()),
    path("db/recover-admin/", RecoverAdministratorView.as_view()),
    path("db/overview/", OverviewView.as_view()),
    path("db/tables/<str:app_label>/<str:model_name>/records/", RecordsView.as_view()),
    path("db/tables/<str:app_label>/<str:model_name>/delete/", DeleteRecordsView.as_view()),
    path("db/reset/authorize/", ResetAuthorizeView.as_view()),
    path("db/reset/", ResetView.as_view()),
    path("db/administrators/", AdministratorsView.as_view()),
    path("db/administrators/<int:pk>/", AdministratorDetailView.as_view()),
    path("db/administrators/<int:pk>/password/", AdministratorPasswordView.as_view()),
]
