from django.urls import path

from .views import BillPreviewView, InvoiceDownloadView

urlpatterns = [
    path("orders/<int:pk>/invoice/", InvoiceDownloadView.as_view()),
    path("orders/<int:pk>/bill-preview/", BillPreviewView.as_view()),
    path("billing/preview/<int:pk>/", BillPreviewView.as_view()),
]
