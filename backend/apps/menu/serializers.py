from django.conf import settings
from rest_framework import serializers

from apps.accounts.mixins import BranchBoundSerializerMixin
from apps.accounts.scoping import allowed_branch_id
from apps.branches.models import Branch

from .models import Category, CustomizationOption, DishDiscount, Food, FoodImage
from .pricing_helpers import current_discount, is_orderable, money, stock_status

ALLOWED_IMAGE_TYPES = {"image/jpeg", "image/png", "image/webp"}


class CategorySerializer(BranchBoundSerializerMixin, serializers.ModelSerializer):
    branch = serializers.PrimaryKeyRelatedField(queryset=Branch.objects.all(), required=False)
    dish_count = serializers.IntegerField(read_only=True)

    class Meta:
        model = Category
        fields = ["id", "branch", "parent", "name", "description", "display_order", "is_active", "dish_count",
                  "created_at"]
        read_only_fields = ["id", "created_at"]
        validators = []

    def validate_name(self, value):
        return value.strip()

    def validate(self, attrs):
        attrs = super().validate(attrs)
        name = attrs.get("name", getattr(self.instance, "name", None))
        branch = attrs.get("branch") or self.instance.branch
        self.ensure_unique(Category, {"branch": branch, "name__iexact": name},
                           "This branch already has a category with this name.", "name")
        parent = attrs.get("parent", getattr(self.instance, "parent", None))
        if parent is not None:
            if parent.branch_id != branch.id:
                raise serializers.ValidationError({"parent": "Parent category belongs to a different branch."})
            cursor = parent
            seen = set()
            while cursor is not None:
                if self.instance and cursor.pk == self.instance.pk:
                    raise serializers.ValidationError({"parent": "A category cannot be its own parent."})
                if cursor.pk in seen:
                    break
                seen.add(cursor.pk)
                cursor = cursor.parent
        return attrs


class FoodImageSerializer(serializers.ModelSerializer):
    url = serializers.SerializerMethodField()

    class Meta:
        model = FoodImage
        fields = ["id", "food", "image", "url", "is_primary", "sort_order"]
        read_only_fields = ["id", "url"]
        extra_kwargs = {"image": {"write_only": True}}

    def get_url(self, obj):
        request = self.context.get("request")
        return request.build_absolute_uri(obj.image.url) if request else obj.image.url

    def validate_food(self, food):
        allowed = allowed_branch_id(self.context["request"].user)
        if allowed is not None and food.branch_id != allowed:
            raise serializers.ValidationError("Dish not found.")
        return food

    def validate_image(self, f):
        if f.size > settings.MAX_IMAGE_UPLOAD_BYTES:
            raise serializers.ValidationError("Image must be 5 MB or smaller.")
        ctype = getattr(f, "content_type", None)
        if ctype and ctype not in ALLOWED_IMAGE_TYPES:
            raise serializers.ValidationError("Only JPEG, PNG or WebP images are allowed.")
        return f

    def validate(self, attrs):
        if self.instance and "food" in attrs and attrs["food"].id != self.instance.food_id:
            raise serializers.ValidationError({"food": "An image cannot be moved to another dish."})
        return attrs

    def _normalise_primary(self, image):
        siblings = FoodImage.objects.filter(food=image.food)
        if image.is_primary:
            siblings.exclude(pk=image.pk).update(is_primary=False)
        elif not siblings.exclude(pk=image.pk).filter(is_primary=True).exists():
            image.is_primary = True  # a dish always has a primary image once it has any image
            image.save(update_fields=["is_primary"])

    def create(self, validated):
        image = super().create(validated)
        self._normalise_primary(image)
        return image

    def update(self, inst, validated):
        image = super().update(inst, validated)
        self._normalise_primary(image)
        return image


class CustomizationSerializer(serializers.ModelSerializer):
    class Meta:
        model = CustomizationOption
        fields = ["id", "food", "name", "extra_price", "is_active"]
        read_only_fields = ["id"]
        validators = []

    def validate_food(self, food):
        allowed = allowed_branch_id(self.context["request"].user)
        if allowed is not None and food.branch_id != allowed:
            raise serializers.ValidationError("Dish not found.")
        return food

    def validate_extra_price(self, value):
        if value < 0:
            raise serializers.ValidationError("Price cannot be negative.")
        return value

    def validate(self, attrs):
        food = attrs.get("food") or self.instance.food
        if self.instance and "food" in attrs and attrs["food"].id != self.instance.food_id:
            raise serializers.ValidationError({"food": "An option cannot be moved to another dish."})
        name = attrs.get("name", getattr(self.instance, "name", None))
        qs = CustomizationOption.objects.filter(food=food, name__iexact=name)
        if self.instance:
            qs = qs.exclude(pk=self.instance.pk)
        if qs.exists():
            raise serializers.ValidationError({"name": "This dish already has an option with this name."})
        return attrs


class FoodSerializer(BranchBoundSerializerMixin, serializers.ModelSerializer):
    branch = serializers.PrimaryKeyRelatedField(queryset=Branch.objects.all(), required=False)
    category_name = serializers.CharField(source="category.name", read_only=True)
    images = serializers.SerializerMethodField()
    primary_image = serializers.SerializerMethodField()
    customizations = CustomizationSerializer(many=True, read_only=True)
    original_price = serializers.DecimalField(source="price", max_digits=12, decimal_places=2, read_only=True)
    discounted_price = serializers.SerializerMethodField()
    current_discount = serializers.SerializerMethodField()
    stock_status = serializers.SerializerMethodField()
    is_orderable = serializers.SerializerMethodField()

    class Meta:
        model = Food
        fields = ["id", "branch", "category", "category_name", "name", "description", "ingredients", "diet_type",
                  "price", "original_price", "discounted_price", "current_discount", "calories", "protein_grams",
                  "is_active", "is_sold_out", "stock_status", "is_orderable", "images", "primary_image",
                  "customizations", "created_at", "updated_at"]
        read_only_fields = ["id", "created_at", "updated_at"]
        validators = []

    def get_discounted_price(self, obj):
        _, amount = current_discount(obj)
        return str(money(obj.price - amount))

    def get_current_discount(self, obj):
        d, amount = current_discount(obj)
        if d is None:
            return None
        return {"id": d.id, "type": d.discount_type, "value": str(d.value), "amount_per_unit": str(amount),
                "valid_to": d.valid_to}

    def get_stock_status(self, obj):
        return stock_status(obj)

    def get_is_orderable(self, obj):
        return is_orderable(obj)

    def _url(self, img):
        request = self.context.get("request")
        return request.build_absolute_uri(img.image.url) if request else img.image.url

    def get_images(self, obj):
        return [{"id": i.id, "url": self._url(i), "is_primary": i.is_primary} for i in obj.images.all()]

    def get_primary_image(self, obj):
        imgs = list(obj.images.all())
        return self._url(imgs[0]) if imgs else None  # ordering puts the primary first

    def validate_price(self, value):
        if value < 0:
            raise serializers.ValidationError("Price cannot be negative.")
        return value

    def validate(self, attrs):
        attrs = super().validate(attrs)
        branch = attrs.get("branch") or self.instance.branch
        category = attrs.get("category") or self.instance.category
        if category.branch_id != branch.id:
            raise serializers.ValidationError({"category": "Category belongs to a different branch."})
        name = attrs.get("name", getattr(self.instance, "name", None)).strip()
        attrs["name"] = name
        self.ensure_unique(Food, {"branch": branch, "category": category, "name__iexact": name},
                           "This category already has a dish with this name.", "name")
        return attrs


class DishDiscountSerializer(serializers.ModelSerializer):
    food_name = serializers.CharField(source="food.name", read_only=True)

    class Meta:
        model = DishDiscount
        fields = ["id", "food", "food_name", "discount_type", "value", "valid_from", "valid_to", "is_active",
                  "created_at"]
        read_only_fields = ["id", "created_at"]

    def validate_food(self, food):
        allowed = allowed_branch_id(self.context["request"].user)
        if allowed is not None and food.branch_id != allowed:
            raise serializers.ValidationError("Dish not found.")
        return food

    def validate(self, attrs):
        inst = self.instance
        if inst and "food" in attrs and attrs["food"].id != inst.food_id:
            raise serializers.ValidationError({"food": "A discount cannot be moved to another dish."})
        food = attrs.get("food") or inst.food
        dtype = attrs.get("discount_type", getattr(inst, "discount_type", None))
        value = attrs.get("value", getattr(inst, "value", None))
        start = attrs.get("valid_from", getattr(inst, "valid_from", None))
        end = attrs.get("valid_to", getattr(inst, "valid_to", None))
        active = attrs.get("is_active", getattr(inst, "is_active", True))
        if value is None or value <= 0:
            raise serializers.ValidationError({"value": "Discount must be greater than zero."})
        if dtype == DishDiscount.Type.PERCENT and value > 100:
            raise serializers.ValidationError({"value": "Percent discount cannot exceed 100."})
        if dtype == DishDiscount.Type.FLAT and value > food.price:
            raise serializers.ValidationError({"value": "Flat discount cannot exceed the dish price."})
        if end <= start:
            raise serializers.ValidationError({"valid_to": "End must be after start."})
        if active:  # two active discounts on one dish must not overlap, so a discount can never apply twice
            overlap = DishDiscount.objects.filter(food=food, is_active=True, valid_from__lt=end, valid_to__gt=start)
            if inst:
                overlap = overlap.exclude(pk=inst.pk)
            if overlap.exists():
                raise serializers.ValidationError("This dish already has an active discount in that period.")
        return attrs
