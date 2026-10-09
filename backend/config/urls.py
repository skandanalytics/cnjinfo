from django.conf import settings
from django.conf.urls.static import static
from django.contrib import admin
from django.urls import include, path

urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/", include("apps.accounts.urls")),
    path("api/", include("apps.branches.urls")),
    path("api/", include("apps.menu.urls")),
    path("api/", include("apps.inventory.urls")),
    path("api/", include("apps.coupons.urls")),
    path("api/", include("apps.orders.urls")),
    path("api/", include("apps.carts.urls")),
    path("api/", include("apps.payments.urls")),
    path("api/", include("apps.billing.urls")),
    # Further resource routes are added per phase (Phase 4+).
]

if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)

