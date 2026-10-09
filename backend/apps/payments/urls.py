from django.urls import path

from .views import (
    CounterPaymentView,
    PaymentDetailView,
    PaymentListView,
    StartOnlinePaymentView,
    VerifyPaymentView,
    WebhookView,
)

urlpatterns = [
    path("orders/<int:pk>/pay/", StartOnlinePaymentView.as_view()),
    path("orders/<int:pk>/counter-payment/", CounterPaymentView.as_view()),
    path("payments/", PaymentListView.as_view()),
    path("payments/<int:pk>/", PaymentDetailView.as_view()),
    path("payments/verify/", VerifyPaymentView.as_view()),
    path("payments/webhook/", WebhookView.as_view()),
]
