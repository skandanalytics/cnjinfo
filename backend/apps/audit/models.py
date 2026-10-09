from django.conf import settings
from django.db import models


class AuditLog(models.Model):
    """Append-only record of sensitive actions. Never updated or deleted by application code."""

    actor = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True,
                              related_name="+")
    branch = models.ForeignKey("branches.Branch", on_delete=models.SET_NULL, null=True, blank=True, related_name="+")
    action = models.CharField(max_length=100)
    entity_type = models.CharField(max_length=60)
    entity_id = models.CharField(max_length=60, blank=True)
    changes = models.JSONField(default=dict, blank=True)
    ip_address = models.GenericIPAddressField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "audit_logs"
        ordering = ["-id"]
        indexes = [models.Index(fields=["entity_type", "entity_id"]), models.Index(fields=["actor", "created_at"]),
                   models.Index(fields=["branch", "created_at"])]
