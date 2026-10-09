from django.urls import path

from .api import KitchenQueueView, OrderDetailView, OrderListCreateView, OrderTransitionView
from .views import QuoteView

urlpatterns = [
    path("pricing/quote/", QuoteView.as_view()),
    path("orders/", OrderListCreateView.as_view()),
    path("orders/<int:pk>/", OrderDetailView.as_view()),
    path("orders/<int:pk>/transition/", OrderTransitionView.as_view()),
    path("kitchen/queue/", KitchenQueueView.as_view()),
]
