from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import (
    BranchViewSet, DiningAreaViewSet, PublicAvailableTablesView, PublicBranchListView, QRResolveView, TableViewSet,
)

router = DefaultRouter()
router.register("branches", BranchViewSet, basename="branches")
router.register("tables", TableViewSet, basename="tables")
router.register("table-views", DiningAreaViewSet, basename="table-views")

urlpatterns = [
    path("public/branches/", PublicBranchListView.as_view()),
    path("public/branches/<int:branch_id>/tables/", PublicAvailableTablesView.as_view()),
    path("public/qr/<str:qr>/", QRResolveView.as_view()),
    path("", include(router.urls)),
]
