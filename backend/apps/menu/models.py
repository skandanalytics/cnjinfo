from decimal import Decimal

from django.core.exceptions import ValidationError
from django.core.validators import MinValueValidator
from django.db import models

MONEY = dict(max_digits=12, decimal_places=2, validators=[MinValueValidator(Decimal("0"))])


class Category(models.Model):
    branch = models.ForeignKey("branches.Branch", on_delete=models.PROTECT, related_name="categories")
    parent = models.ForeignKey(
        "self", on_delete=models.SET_NULL, null=True, blank=True, related_name="children")
    name = models.CharField(max_length=255)
    description = models.CharField(max_length=500, blank=True)  # short text shown under the category (SRS 3.1.3)
    display_order = models.PositiveIntegerField(default=0)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "categories"
        ordering = ["display_order", "id"]
        constraints = [models.UniqueConstraint(fields=["branch", "name"], name="uq_category_branch_name")]

    def __str__(self):
        return self.name


class Food(models.Model):
    class DietType(models.TextChoices):
        VEG = "VEG", "Veg"
        NON_VEG = "NON_VEG", "Non-Veg"
        VEGAN = "VEGAN", "Vegan"

    branch = models.ForeignKey("branches.Branch", on_delete=models.PROTECT, related_name="foods")
    category = models.ForeignKey(Category, on_delete=models.PROTECT, related_name="foods")
    name = models.CharField(max_length=255)
    description = models.TextField(blank=True)
    ingredients = models.TextField(blank=True)
    diet_type = models.CharField(max_length=10, choices=DietType.choices, default=DietType.VEG)
    price = models.DecimalField(help_text="Base price at this branch.", **MONEY)
    calories = models.PositiveIntegerField(null=True, blank=True)
    protein_grams = models.DecimalField(max_digits=6, decimal_places=2, null=True, blank=True)
    is_active = models.BooleanField(default=True)       # soft delete / hidden from menu
    is_sold_out = models.BooleanField(default=False)    # manual sold-out flag; stock status comes from inventory
    # External image chosen by the admin. When set it is the dish's display image; uploading a new primary
    # FoodImage clears it so the most recent choice wins.
    image_url = models.URLField(max_length=1000, blank=True, default="")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "foods"
        constraints = [models.UniqueConstraint(fields=["branch", "category", "name"], name="uq_food_branch_cat_name")]
        indexes = [models.Index(fields=["branch", "category", "is_active"]),
                   models.Index(fields=["branch", "diet_type"]), models.Index(fields=["name"])]

    def clean(self):
        if self.category_id and self.branch_id and self.category.branch_id != self.branch_id:
            raise ValidationError({"category": "Category belongs to a different branch."})

    def __str__(self):
        return self.name


class FoodImage(models.Model):
    food = models.ForeignKey(Food, on_delete=models.CASCADE, related_name="images")
    image = models.ImageField(upload_to="foods/%Y/%m/")
    is_primary = models.BooleanField(default=False)
    sort_order = models.PositiveSmallIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "food_images"
        ordering = ["-is_primary", "sort_order", "id"]


class CustomizationOption(models.Model):
    """Optional add-on for a dish. Item price = base price + selected option prices (SRS 3.1.4)."""

    food = models.ForeignKey(Food, on_delete=models.CASCADE, related_name="customizations")
    name = models.CharField(max_length=150)
    extra_price = models.DecimalField(default=Decimal("0"), **MONEY)
    is_active = models.BooleanField(default=True)

    class Meta:
        db_table = "customization_options"
        constraints = [models.UniqueConstraint(fields=["food", "name"], name="uq_customization_food_name")]


class DishDiscount(models.Model):
    """Per-dish discount, separate from promo coupons (SRS 3.2.7)."""

    class Type(models.TextChoices):
        PERCENT = "PERCENT", "Percent"
        FLAT = "FLAT", "Flat amount"

    food = models.ForeignKey(Food, on_delete=models.CASCADE, related_name="discounts")
    discount_type = models.CharField(max_length=10, choices=Type.choices)
    value = models.DecimalField(**MONEY)
    valid_from = models.DateTimeField()
    valid_to = models.DateTimeField()
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "dish_discounts"
        indexes = [models.Index(fields=["food", "is_active", "valid_from", "valid_to"])]
        constraints = [models.CheckConstraint(condition=models.Q(valid_to__gt=models.F("valid_from")),
                                              name="ck_dishdiscount_dates")]

    def clean(self):
        if self.discount_type == self.Type.PERCENT and self.value > 100:
            raise ValidationError({"value": "Percent discount cannot exceed 100."})
