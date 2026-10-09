from django.urls import path

from .views import (CartContextView, CartCouponView, CartItemsView, CartItemView, CartMergeView, CartView,
                    CheckoutValidateView, GuestTokenView)

urlpatterns = [
    path("cart/guest-token/", GuestTokenView.as_view()),
    path("cart/", CartView.as_view()),
    path("cart/context/", CartContextView.as_view()),
    path("cart/items/", CartItemsView.as_view()),
    path("cart/items/<int:pk>/", CartItemView.as_view()),
    path("cart/coupon/", CartCouponView.as_view()),
    path("cart/merge/", CartMergeView.as_view()),
    path("checkout/validate/", CheckoutValidateView.as_view()),
]