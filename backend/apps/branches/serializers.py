from django.db import transaction
from rest_framework import serializers

from apps.accounts.mixins import BranchBoundSerializerMixin
from apps.accounts.phone import normalize_phone

from .models import Branch, DiningTable, TableView
from .qr import qr_url


class BranchSerializer(serializers.ModelSerializer):
    tables_count = serializers.SerializerMethodField()
    email = serializers.EmailField(required=False, allow_blank=True, max_length=254)
    cover_image_url = serializers.URLField(required=False, allow_blank=True, max_length=1000)

    class Meta:
        model = Branch
        fields = ["id", "code", "name", "address", "city", "contact_number", "email", "manager_name",
                  "opening_hours", "cover_image_url", "is_primary", "tables_count", "is_active",
                  "gst_rate", "service_charge_rate", "takeaway_charge", "created_at", "updated_at"]
        read_only_fields = ["id", "code", "tables_count", "created_at", "updated_at"]

    def get_tables_count(self, obj):
        annotated = getattr(obj, "tables_count", None)
        if isinstance(annotated, int):
            return annotated
        return obj.tables.filter(is_active=True).count()

    def validate_contact_number(self, value):
        if not value:
            return value
        try:
            return normalize_phone(value)
        except ValueError as exc:
            raise serializers.ValidationError(str(exc))

    def validate_name(self, value):
        qs = Branch.objects.filter(name__iexact=value.strip())
        if self.instance:
            qs = qs.exclude(pk=self.instance.pk)
        if qs.exists():
            raise serializers.ValidationError("A branch with this name already exists.")
        return value.strip()

    def validate_cover_image_url(self, value):
        value = (value or "").strip()
        if value and value.split(":", 1)[0].lower() not in ("http", "https"):
            raise serializers.ValidationError("Cover image URL must start with http:// or https://.")
        return value

    def validate(self, attrs):
        for rate in ("gst_rate", "service_charge_rate"):
            if rate in attrs and attrs[rate] > 100:
                raise serializers.ValidationError({rate: "Rate cannot exceed 100."})
        return attrs

    def create(self, validated):
        with transaction.atomic():
            if validated.get("is_primary"):
                Branch.objects.select_for_update().filter(is_primary=True).update(is_primary=False)
            branch = Branch.objects.create(code="TMP", **validated)
            branch.code = f"BR{branch.id:03d}"
            branch.save(update_fields=["code"])
        return branch

    def update(self, instance, validated):
        with transaction.atomic():
            # Clear the previous headquarters before this row becomes primary, or the unique rule rejects the save.
            if validated.get("is_primary"):
                (Branch.objects.select_for_update().exclude(pk=instance.pk).filter(is_primary=True)
                 .update(is_primary=False))
            return super().update(instance, validated)


class TableSerializer(BranchBoundSerializerMixin, serializers.ModelSerializer):
    branch = serializers.PrimaryKeyRelatedField(queryset=Branch.objects.all(), required=False)
    branch_name = serializers.CharField(source="branch.name", read_only=True)
    qr_url = serializers.SerializerMethodField()

    class Meta:
        model = DiningTable
        fields = ["id", "branch", "branch_name", "table_number", "capacity", "location", "table_view", "status",
                  "is_active", "qr_code", "qr_is_active", "qr_url", "created_at"]
        # Status changes go through the dedicated set-status action so lifecycle rules are always applied.
        read_only_fields = ["id", "status", "qr_code", "created_at"]
        validators = []

    def get_qr_url(self, obj):
        return qr_url(obj)

    def validate_table_number(self, value):
        return value.strip()

    def validate_capacity(self, value):
        if value < 1:
            raise serializers.ValidationError("Capacity must be at least 1.")
        return value

    def validate(self, attrs):
        attrs = super().validate(attrs)
        number = attrs.get("table_number", getattr(self.instance, "table_number", None))
        branch = attrs.get("branch") or self.instance.branch
        self.ensure_unique(DiningTable, {"branch": branch, "table_number__iexact": number},
                           "This branch already has a table with this number.", "table_number")
        view = attrs.get("table_view", getattr(self.instance, "table_view", None))
        if view is not None and view.branch_id != branch.id:
            raise serializers.ValidationError({"table_view": "This view belongs to a different branch."})
        if view is not None:
            attrs["location"] = view.name
        return attrs


class TableViewSerializer(BranchBoundSerializerMixin, serializers.ModelSerializer):
    branch = serializers.PrimaryKeyRelatedField(queryset=Branch.objects.all(), required=False)

    class Meta:
        model = TableView
        fields = ["id", "branch", "name", "created_at"]
        read_only_fields = ["id", "created_at"]
        validators = []

    def validate_name(self, value):
        value = value.strip()
        if not value:
            raise serializers.ValidationError("View name is required.")
        return value

    def validate(self, attrs):
        attrs = super().validate(attrs)
        name = attrs.get("name", getattr(self.instance, "name", None))
        branch = attrs.get("branch") or self.instance.branch
        self.ensure_unique(TableView, {"branch": branch, "name__iexact": name},
                           "This branch already has a view with this name.", "name")
        return attrs
