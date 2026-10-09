from rest_framework import serializers

from apps.branches.models import Branch

from .scoping import allowed_branch_id
from .services import client_ip, record_audit


class BranchBoundSerializerMixin:
    """Serializer mixin for models with a `branch` FK.

    - Branch-limited staff always create inside their own branch (a different one is rejected).
    - Owner-level staff must say which branch.
    - A record's branch cannot be changed after creation.
    Declare `branch = serializers.PrimaryKeyRelatedField(queryset=Branch.objects.all(), required=False)`.
    """

    def validate(self, attrs):
        attrs = super().validate(attrs)
        user = self.context["request"].user
        allowed = allowed_branch_id(user)
        if self.instance is None:
            branch = attrs.get("branch")
            if allowed is not None:
                if branch is not None and branch.id != allowed:
                    raise serializers.ValidationError({"branch": "You can only create records in your own branch."})
                attrs["branch"] = Branch.objects.get(pk=allowed)
            elif branch is None:
                raise serializers.ValidationError({"branch": "Branch is required."})
            if not attrs["branch"].is_active:
                raise serializers.ValidationError({"branch": "Branch is inactive."})
        elif "branch" in attrs and attrs["branch"].id != self.instance.branch_id:
            raise serializers.ValidationError({"branch": "Branch cannot be changed."})
        return attrs

    def ensure_unique(self, model, lookup, message, field):
        """Friendly replacement for DB uniqueness errors (checked before saving)."""
        qs = model.objects.filter(**lookup)
        if self.instance is not None:
            qs = qs.exclude(pk=self.instance.pk)
        if qs.exists():
            raise serializers.ValidationError({field: message})


class AuditedMixin:
    """Writes an audit row for create/update/deactivate. Set `audit_entity` on the view."""

    audit_entity = "Record"

    def _branch_of(self, obj):
        return getattr(obj, "branch", None) or getattr(getattr(obj, "food", None), "branch", None)

    def audit(self, action, obj, changes=None):
        record_audit(self.request.user, f"{self.audit_entity.lower()}.{action}", self.audit_entity, obj.pk,
                     self._branch_of(obj), changes or {}, client_ip(self.request))

    def perform_create(self, serializer):
        obj = serializer.save()
        self.audit("create", obj)

    def perform_update(self, serializer):
        obj = serializer.save()
        self.audit("update", obj, {"fields": sorted(serializer.validated_data.keys())})
