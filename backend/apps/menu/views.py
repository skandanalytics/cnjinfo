from django.db import transaction
from django.db.models import Count, Q
from rest_framework import status, viewsets
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.response import Response

from apps.accounts.mixins import AuditedMixin
from apps.accounts.permissions import StaffReadAdminWrite
from apps.accounts.scoping import BranchScopedMixin
from apps.accounts.services import client_ip, record_audit
from apps.realtime.mixins import CatalogBroadcastMixin
from apps.realtime.publish import publish_catalog_event

from .models import Category, CustomizationOption, DishDiscount, Food, FoodImage
from .serializers import (CategorySerializer, CustomizationSerializer, DishDiscountSerializer, FoodImageSerializer,
                          FoodSerializer)
from .services import delete_foods, foods_in_active_orders


class CategoryViewSet(CatalogBroadcastMixin, AuditedMixin, BranchScopedMixin, viewsets.ModelViewSet):
    audit_entity = "Category"
    queryset = Category.objects.select_related("branch").annotate(
        dish_count=Count("foods", filter=Q(foods__is_active=True)))
    serializer_class = CategorySerializer
    permission_classes = [StaffReadAdminWrite]
    filterset_fields = ["branch", "is_active"]
    search_fields = ["name", "description"]
    ordering_fields = ["display_order", "name", "id"]

    def get_queryset(self):
        qs = super().get_queryset()
        user = self.request.user
        if user.is_authenticated:
            emp = getattr(user, "employee", None)
            if emp and emp.role == "SUPER_ADMIN":
                qs = qs.filter(Q(created_by=user) | Q(created_by__isnull=True))
        return qs.distinct()

    def destroy(self, request, *args, **kwargs):
        """A category that still lists dishes is not deleted; the admin deletes or moves them first. Dishes that
        were already removed from the menu (inactive) are deleted with it."""
        category = self.get_object()
        listed = category.foods.filter(is_active=True).count()
        if listed:
            noun = "dish" if listed == 1 else "dishes"
            return Response({"detail": f"This category still has {listed} {noun}. Delete them or move them to "
                                       "another category first.", "code": "category_not_empty"},
                            status=status.HTTP_409_CONFLICT)
        hidden = category.foods.filter(is_active=False)
        if foods_in_active_orders(hidden):
            return Response({"detail": "A dish from this category is in an order that is still in progress.",
                             "code": "dish_in_active_order"}, status=status.HTTP_409_CONFLICT)
        with transaction.atomic():
            delete_foods(hidden)
            category.children.update(parent=None)
            self.audit("delete", category)
            branch_id = category.branch_id
            category.delete()
        publish_catalog_event(branch_id, "menu", "deleted")
        return Response(status=status.HTTP_204_NO_CONTENT)


class FoodViewSet(CatalogBroadcastMixin, AuditedMixin, BranchScopedMixin, viewsets.ModelViewSet):
    audit_entity = "Food"
    queryset = (Food.objects.select_related("branch", "category", "inventory")
                .prefetch_related("images", "customizations", "discounts")
                .order_by("category__display_order", "name"))
    serializer_class = FoodSerializer
    permission_classes = [StaffReadAdminWrite]
    filterset_fields = ["branch", "category", "diet_type", "is_active", "is_sold_out"]
    search_fields = ["name", "description", "ingredients"]
    ordering_fields = ["name", "price", "created_at"]

    def get_queryset(self):
        qs = super().get_queryset()
        user = self.request.user
        if user.is_authenticated:
            emp = getattr(user, "employee", None)
            if emp and emp.role == "SUPER_ADMIN":
                qs = qs.filter(Q(created_by=user) | Q(created_by__isnull=True))
        return qs.distinct()

    def destroy(self, request, *args, **kwargs):
        """Deletes the dish. Past orders keep their item snapshot and the stock ledger keeps its rows."""
        food = self.get_object()
        target = Food.objects.filter(pk=food.pk)
        if foods_in_active_orders(target):
            return Response({"detail": "This dish is in an order that is still in progress. Complete or cancel "
                                       "that order before deleting the dish.", "code": "dish_in_active_order"},
                            status=status.HTTP_409_CONFLICT)
        with transaction.atomic():
            self.audit("delete", food)
            branch_id = food.branch_id
            delete_foods(target)
        publish_catalog_event(branch_id, "menu", "deleted")
        return Response(status=status.HTTP_204_NO_CONTENT)


class FoodImageViewSet(BranchScopedMixin, viewsets.ModelViewSet):
    """Multipart upload: POST {food, image, is_primary?}. Images are served from MEDIA_URL."""

    branch_field = "food__branch"
    queryset = FoodImage.objects.select_related("food")
    serializer_class = FoodImageSerializer
    permission_classes = [StaffReadAdminWrite]
    parser_classes = [MultiPartParser, FormParser, JSONParser]
    filterset_fields = ["food"]

    def _audit(self, action, obj):
        record_audit(self.request.user, f"foodimage.{action}", "FoodImage", obj.pk, obj.food.branch, {},
                     client_ip(self.request))

    def perform_create(self, serializer):
        image = serializer.save()
        self._audit("create", image)
        publish_catalog_event(image.food.branch_id, "menu", "updated")

    def perform_destroy(self, instance):
        self._audit("delete", instance)
        was_primary, food = instance.is_primary, instance.food
        instance.image.delete(save=False)  # remove the file too
        instance.delete()
        if was_primary:
            nxt = FoodImage.objects.filter(food=food).first()
            if nxt:
                nxt.is_primary = True
                nxt.save(update_fields=["is_primary"])
        publish_catalog_event(food.branch_id, "menu", "updated")


class CustomizationViewSet(CatalogBroadcastMixin, BranchScopedMixin, viewsets.ModelViewSet):
    branch_field = "food__branch"
    queryset = CustomizationOption.objects.select_related("food")
    serializer_class = CustomizationSerializer
    permission_classes = [StaffReadAdminWrite]
    filterset_fields = ["food", "is_active"]
    search_fields = ["name"]

    def destroy(self, request, *args, **kwargs):
        """Options in carts are deactivated instead of deleted so carts stay consistent."""
        option = self.get_object()
        record_audit(request.user, "customization.delete", "CustomizationOption", option.pk, option.food.branch, {},
                     client_ip(request))
        branch_id = option.food.branch_id
        if option.cart_items.exists():
            option.is_active = False
            option.save(update_fields=["is_active"])
            publish_catalog_event(branch_id, "menu", "updated")
            return Response({"detail": "Option is in use, so it was deactivated.", "deactivated": True})
        option.delete()
        publish_catalog_event(branch_id, "menu", "deleted")
        return Response(status=status.HTTP_204_NO_CONTENT)


class DishDiscountViewSet(CatalogBroadcastMixin, AuditedMixin, BranchScopedMixin, viewsets.ModelViewSet):
    audit_entity = "DishDiscount"
    branch_field = "food__branch"
    queryset = DishDiscount.objects.select_related("food", "food__branch").order_by("-id")
    serializer_class = DishDiscountSerializer
    permission_classes = [StaffReadAdminWrite]
    filterset_fields = ["food", "is_active", "discount_type"]
    search_fields = ["food__name"]

    def get_queryset(self):
        qs = super().get_queryset()
        user = self.request.user
        if user.is_authenticated:
            emp = getattr(user, "employee", None)
            if emp and emp.role == "SUPER_ADMIN":
                qs = qs.filter(Q(food__created_by=user) | Q(food__created_by__isnull=True))
        return qs.distinct()
