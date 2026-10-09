from django.db.models import Count
from rest_framework import status, viewsets
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.response import Response

from apps.accounts.mixins import AuditedMixin
from apps.accounts.permissions import StaffReadAdminWrite
from apps.accounts.scoping import BranchScopedMixin
from apps.accounts.services import client_ip, record_audit

from .models import Category, CustomizationOption, DishDiscount, Food, FoodImage
from .serializers import (CategorySerializer, CustomizationSerializer, DishDiscountSerializer, FoodImageSerializer,
                          FoodSerializer)


class CategoryViewSet(AuditedMixin, BranchScopedMixin, viewsets.ModelViewSet):
    audit_entity = "Category"
    queryset = Category.objects.select_related("branch").annotate(dish_count=Count("foods"))
    serializer_class = CategorySerializer
    permission_classes = [StaffReadAdminWrite]
    filterset_fields = ["branch", "is_active"]
    search_fields = ["name", "description"]
    ordering_fields = ["display_order", "name", "id"]

    def destroy(self, request, *args, **kwargs):
        """Never-used categories are deleted; categories that hold dishes are deactivated (history is kept)."""
        category = self.get_object()
        if category.foods.exists():
            category.is_active = False
            category.save(update_fields=["is_active", "updated_at"])
            self.audit("deactivate", category)
            return Response({"detail": "Category contains dishes, so it was deactivated.", "deactivated": True})
        self.audit("delete", category)
        category.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class FoodViewSet(AuditedMixin, BranchScopedMixin, viewsets.ModelViewSet):
    audit_entity = "Food"
    queryset = (Food.objects.select_related("branch", "category", "inventory")
                .prefetch_related("images", "customizations", "discounts")
                .order_by("category__display_order", "name"))
    serializer_class = FoodSerializer
    permission_classes = [StaffReadAdminWrite]
    filterset_fields = ["branch", "category", "diet_type", "is_active", "is_sold_out"]
    search_fields = ["name", "description", "ingredients"]
    ordering_fields = ["name", "price", "created_at"]

    def destroy(self, request, *args, **kwargs):
        """Dishes that were ordered, carted or stocked are deactivated; others are deleted."""
        food = self.get_object()
        referenced = (food.order_items.exists() or food.cart_items.exists()
                      or hasattr(food, "inventory"))
        if referenced:
            food.is_active = False
            food.save(update_fields=["is_active", "updated_at"])
            self.audit("deactivate", food)
            return Response({"detail": "Dish is referenced by orders or stock, so it was deactivated.",
                             "deactivated": True})
        self.audit("delete", food)
        food.delete()
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
        self._audit("create", serializer.save())

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


class CustomizationViewSet(BranchScopedMixin, viewsets.ModelViewSet):
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
        if option.cart_items.exists():
            option.is_active = False
            option.save(update_fields=["is_active"])
            return Response({"detail": "Option is in use, so it was deactivated.", "deactivated": True})
        option.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class DishDiscountViewSet(AuditedMixin, BranchScopedMixin, viewsets.ModelViewSet):
    audit_entity = "DishDiscount"
    branch_field = "food__branch"
    queryset = DishDiscount.objects.select_related("food", "food__branch").order_by("-id")
    serializer_class = DishDiscountSerializer
    permission_classes = [StaffReadAdminWrite]
    filterset_fields = ["food", "is_active", "discount_type"]
    search_fields = ["food__name"]

