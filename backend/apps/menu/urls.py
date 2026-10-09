from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .public import PublicFoodView, PublicMenuView
from .views import CategoryViewSet, CustomizationViewSet, DishDiscountViewSet, FoodImageViewSet, FoodViewSet

router = DefaultRouter()
router.register("categories", CategoryViewSet, basename="categories")
router.register("foods", FoodViewSet, basename="foods")
router.register("food-images", FoodImageViewSet, basename="food-images")
router.register("customization-options", CustomizationViewSet, basename="customization-options")
router.register("dish-discounts", DishDiscountViewSet, basename="dish-discounts")

urlpatterns = [
    path("public/branches/<int:branch_id>/menu/", PublicMenuView.as_view()),
    path("public/foods/<int:food_id>/", PublicFoodView.as_view()),
    path("", include(router.urls)),
]