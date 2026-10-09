from django.urls import include, path
from rest_framework.routers import DefaultRouter
from rest_framework_simplejwt.views import TokenRefreshView

from .views import EmployeeViewSet, LogoutView, MeView, SendOTPView, StaffLoginView, VerifyOTPView

router = DefaultRouter()
router.register("employees", EmployeeViewSet, basename="employees")

urlpatterns = [
    path("auth/otp/send/", SendOTPView.as_view()),
    path("auth/otp/verify/", VerifyOTPView.as_view()),
    path("auth/staff/login/", StaffLoginView.as_view()),
    path("auth/refresh/", TokenRefreshView.as_view()),
    path("auth/logout/", LogoutView.as_view()),
    path("auth/me/", MeView.as_view()),
    path("", include(router.urls)),
]
