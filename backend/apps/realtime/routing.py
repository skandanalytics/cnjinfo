from django.urls import path

from .consumers import OrderEventsConsumer

websocket_urlpatterns = [path("ws/orders/", OrderEventsConsumer.as_asgi())]