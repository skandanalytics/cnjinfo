from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import CouponViewSet

router = DefaultRouter()
router.register("admin/coupons", CouponViewSet, basename="admin-coupons")
router.register("coupons", CouponViewSet, basename="coupons")

urlpatterns = [path("", include(router.urls))]
