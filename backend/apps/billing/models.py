from django.db import models


class Invoice(models.Model):
    """E-bill (SRS ER: exactly one per order). Created when the order is COMPLETED, from persisted order data."""

    order = models.OneToOneField("orders.Order", on_delete=models.PROTECT, related_name="invoice")
    invoice_number = models.CharField(max_length=40, unique=True)
    snapshot = models.JSONField(help_text="Frozen bill: branch, items, discounts, taxes, totals, payment.")
    pdf_file = models.FileField(upload_to="invoices/%Y/%m/", null=True, blank=True)
    generated_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "invoices"
