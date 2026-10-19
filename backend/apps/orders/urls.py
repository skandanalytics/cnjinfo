from django.urls import path

from .api import AssistedOrderView, KitchenQueueView, OrderDetailView, OrderListCreateView, OrderTransitionView
from .views import QuoteView

urlpatterns = [
    path("pricing/quote/", QuoteView.as_view()),
    path("orders/", OrderListCreateView.as_view()),
    path("orders/assisted/", AssistedOrderView.as_view()),
    path("orders/<str:pk>/", OrderDetailView.as_view()),
    path("orders/<str:pk>/transition/", OrderTransitionView.as_view()),
    path("kitchen/queue/", KitchenQueueView.as_view()),
]
