from django.urls import path, re_path

from .views import (
    CounterPaymentView,
    CreateOrderView,
    PaymentDetailView,
    PaymentListView,
    StartOnlinePaymentView,
    VerifyPaymentView,
    WebhookView,
    OrderPaymentStatusView,
)

urlpatterns = [
    # Standard Razorpay Web Checkout endpoints
    re_path(r"^create-order/?$", CreateOrderView.as_view(), name="razorpay-create-order"),
    re_path(r"^verify-payment/?$", VerifyPaymentView.as_view(), name="razorpay-verify-payment"),

    # Existing Order-linked Payment endpoints
    path("orders/<int:pk>/pay/", StartOnlinePaymentView.as_view(), name="order-start-payment"),
    path("orders/<int:pk>/payment-status/", OrderPaymentStatusView.as_view(), name="order-payment-status"),
    path("orders/<int:pk>/counter-payment/", CounterPaymentView.as_view(), name="order-counter-payment"),
    path("payments/", PaymentListView.as_view(), name="payment-list"),
    path("payments/<int:pk>/", PaymentDetailView.as_view(), name="payment-detail"),
    path("payments/verify/", VerifyPaymentView.as_view(), name="payment-verify"),
    path("payments/webhook/", WebhookView.as_view(), name="payment-webhook"),
]
