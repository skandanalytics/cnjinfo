import re
from django.db import transaction
from rest_framework import serializers

from apps.accounts.mixins import BranchBoundSerializerMixin
from apps.accounts.phone import normalize_phone

from .models import Branch, DiningTable, TableView
from .qr import qr_url

TABLE_LOCATIONS = ("Indoor Main", "Garden View", "Rooftop Terrace")
LOCATION_ALIASES = {
    "indoor main": "Indoor Main",
    "indoor": "Indoor Main",
    "main": "Indoor Main",
    "garden view": "Garden View",
    "garden": "Garden View",
    "rooftop terrace": "Rooftop Terrace",
    "rooftop": "Rooftop Terrace",
    "terrace": "Rooftop Terrace",
}


def canonicalize_location(value):
    value = (value or "").strip()
    if not value:
        return ""
    if value in TABLE_LOCATIONS:
        return value
    return LOCATION_ALIASES.get(value.lower(), value)


class BranchSerializer(serializers.ModelSerializer):
    tables_count = serializers.SerializerMethodField()
    email = serializers.EmailField(required=False, allow_blank=True, max_length=254)
    cover_image_url = serializers.URLField(required=False, allow_blank=False, max_length=1000)
    opening_hours = serializers.CharField(required=True, allow_blank=False, max_length=150)

    class Meta:
        model = Branch
        fields = ["id", "code", "name", "address", "city", "contact_number", "email", "manager_name",
                  "opening_hours", "cover_image_url", "is_primary", "tables_count",
                  "configured_table_count", "is_active",
                  "gst_rate", "service_charge_rate", "takeaway_charge", "created_at", "updated_at"]
        read_only_fields = ["id", "code", "tables_count", "created_at", "updated_at"]
        # create()/update() move the primary flag under a row lock, so the generated unique check would only
        # reject the hand-over.
        extra_kwargs = {"is_primary": {"validators": []}}

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
        val = value.strip()
        if not val:
            raise serializers.ValidationError("Branch name is required.")
        if len(val) > 30:
            raise serializers.ValidationError("Branch name cannot exceed 30 characters.")
        if any(ch.isdigit() for ch in val):
            raise serializers.ValidationError("Branch name cannot contain numbers.")
        qs = Branch.objects.filter(name__iexact=val)
        if self.instance:
            qs = qs.exclude(pk=self.instance.pk)
        if qs.exists():
            raise serializers.ValidationError("A branch with this name already exists.")
        return val

    def validate_manager_name(self, value):
        val = (value or "").strip()
        if val and any(ch.isdigit() for ch in val):
            raise serializers.ValidationError("Manager name cannot contain numbers.")
        return val

    def validate_opening_hours(self, value):
        val = (value or "").strip()
        if not val:
            raise serializers.ValidationError("Opening hours are required.")
        clean_val = val.replace(" ", "").replace("-", "").lower()
        if clean_val in ("00:00", "00:0000:00", "0:00", "00:00-00:00", "0:00-0:00"):
            raise serializers.ValidationError("Please provide valid opening hours.")
        return val

    def validate_cover_image_url(self, value):
        value = (value or "").strip()
        if not value:
            raise serializers.ValidationError("Branch image is mandatory.")
        if value.split(":", 1)[0].lower() not in ("http", "https"):
            raise serializers.ValidationError("Cover image URL must start with http:// or https://.")
        return value

    def validate_configured_table_count(self, value):
        if value < 0:
            raise serializers.ValidationError("Total tables cannot be negative.")
        if self.instance is not None:
            existing = self.instance.tables.filter(is_active=True).count()
            if value < existing:
                raise serializers.ValidationError(
                    f"This branch already has {existing} tables. Total tables cannot be lower than that.")
        return value

    def validate(self, attrs):
        for rate in ("gst_rate", "service_charge_rate"):
            if rate in attrs and attrs[rate] > 100:
                raise serializers.ValidationError({rate: "Rate cannot exceed 100."})
        inst = self.instance
        primary = attrs.get("is_primary", inst.is_primary if inst else False)
        active = attrs.get("is_active", inst.is_active if inst else True)
        if primary and not active:
            raise serializers.ValidationError({"is_active": "The primary branch must stay active. Mark another "
                                                            "branch as primary first."})
        # Exactly one primary once one exists: it moves by marking another branch, never by clearing it.
        if inst and inst.is_primary and not primary:
            raise serializers.ValidationError({"is_primary": "Mark another branch as primary instead; the "
                                                             "application always keeps one primary branch."})
        return attrs

    def create(self, validated):
        with transaction.atomic():
            if validated.get("is_active", True) and not Branch.objects.filter(is_primary=True).exists():
                validated["is_primary"] = True
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
    has_active_order = serializers.SerializerMethodField()
    active_order_id = serializers.SerializerMethodField()
    active_order = serializers.SerializerMethodField()

    class Meta:
        model = DiningTable
        fields = ["id", "branch", "branch_name", "table_number", "capacity", "location", "table_view", "status",
                  "is_active", "qr_code", "qr_is_active", "qr_url", "has_active_order", "active_order_id", "active_order", "created_at"]
        # Status changes go through the dedicated set-status action so lifecycle rules are always applied.
        read_only_fields = ["id", "status", "qr_code", "created_at"]
        validators = []

    def get_qr_url(self, obj):
        return qr_url(obj)

    def _find_active_or_session_order(self, obj):
        from apps.orders.models import Order
        # 1. Any root order currently in ACTIVE_STATUSES (PENDING, PREPARING, READY, SERVED)
        active_root = Order.objects.filter(
            table=obj,
            status__in=Order.ACTIVE_STATUSES,
            parent_order__isnull=True
        ).order_by("-id").first()
        if active_root:
            return active_root

        # 2. Any continuation order currently in ACTIVE_STATUSES -> return its root
        any_active = Order.objects.filter(
            table=obj,
            status__in=Order.ACTIVE_STATUSES
        ).order_by("-id").first()
        if any_active:
            return any_active.parent_order or any_active

        # 3. If table is OCCUPIED, find the latest session root that is not CANCELLED
        if obj.status == DiningTable.Status.OCCUPIED:
            latest = Order.objects.filter(
                table=obj
            ).exclude(status=Order.Status.CANCELLED).order_by("-id").first()
            if latest:
                return latest.parent_order or latest

        return None

    def get_has_active_order(self, obj):
        return bool(self._find_active_or_session_order(obj))

    def get_active_order_id(self, obj):
        ord_obj = self._find_active_or_session_order(obj)
        return ord_obj.id if ord_obj else None

    def get_active_order(self, obj):
        from apps.orders.models import Order
        active = self._find_active_or_session_order(obj)
        if not active:
            return None
        c_name = active.customer.name if active.customer and getattr(active.customer, "name", None) else ""
        c_phone = active.customer_phone or (active.customer.phone if active.customer and getattr(active.customer, "phone", None) else "")
        if not c_phone and active.parent_order_id:
            from django.db.models import Q
            sibling = Order.objects.filter(
                Q(id=active.parent_order_id) | Q(parent_order_id=active.parent_order_id)
            ).exclude(customer_phone="").order_by("-id").first()
            if sibling:
                c_phone = sibling.customer_phone
                if not c_name and sibling.customer:
                    c_name = sibling.customer.name or ""
        elif not c_phone:
            child = Order.objects.filter(parent_order=active).exclude(customer_phone="").order_by("-id").first()
            if child:
                c_phone = child.customer_phone
                if not c_name and child.customer:
                    c_name = child.customer.name or ""
        if not c_name and c_phone:
            from apps.accounts.models import User
            user_match = User.objects.filter(phone=c_phone).first()
            if user_match:
                c_name = user_match.name or ""
        return {
            "id": active.id,
            "order_number": active.order_number,
            "display_order_number": active.display_number,
            "status": active.status,
            "payment_status": active.payment_status,
            "customer_name": c_name,
            "customer_phone": c_phone,
            "total_amount": str(active.total_amount),
            "created_at": active.created_at,
        }

    def validate_table_number(self, value):
        return value.strip()

    def validate_capacity(self, value):
        if value < 1:
            raise serializers.ValidationError("Capacity must be at least 1.")
        return value

    def validate_location(self, value):
        value = canonicalize_location(value)
        if not value:
            raise serializers.ValidationError(
                "Location must be Indoor Main, Garden View, or Rooftop Terrace.")
        existing = (self.instance.location or "") if self.instance else ""
        if value not in TABLE_LOCATIONS and value != existing:
            raise serializers.ValidationError(
                "Location must be Indoor Main, Garden View, or Rooftop Terrace.")
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
        if self.instance is None and not canonicalize_location(attrs.get("location", "")):
            attrs["location"] = "Indoor Main"
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
