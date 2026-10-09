from rest_framework import serializers

from apps.accounts.scoping import allowed_branch_id
from apps.menu.models import Food

from .models import InventoryItem, StockTransaction


class InventoryItemSerializer(serializers.ModelSerializer):
    food = serializers.PrimaryKeyRelatedField(queryset=Food.objects.select_related("category"))
    food_name = serializers.CharField(source="food.name", read_only=True)
    category_name = serializers.CharField(source="food.category.name", read_only=True)
    status = serializers.CharField(read_only=True)
    status_label = serializers.SerializerMethodField()

    class Meta:
        model = InventoryItem
        fields = ["id", "branch", "food", "food_name", "category_name", "quantity", "low_stock_threshold", "status",
                  "status_label", "updated_at"]
        # Quantity only changes through restock / adjust / orders so the ledger always explains it.
        read_only_fields = ["id", "branch", "updated_at"]

    def get_status_label(self, obj):
        return obj.Status(obj.status).label

    def update(self, instance, validated):
        # Only the threshold is editable here; stock moves only via restock/adjust/orders (ledger).
        validated.pop("quantity", None)
        validated.pop("food", None)
        return super().update(instance, validated)

    def validate_food(self, food):
        if self.instance is not None:
            return food  # ignored on update
        return self._validate_new_food(food)

    def _validate_new_food(self, food):
        allowed = allowed_branch_id(self.context["request"].user)
        if allowed is not None and food.branch_id != allowed:
            raise serializers.ValidationError("Dish not found.")
        if InventoryItem.objects.filter(food=food).exists():
            raise serializers.ValidationError("This dish already has an inventory record.")
        return food

    def validate_quantity(self, value):
        if value < 0:
            raise serializers.ValidationError("Stock cannot be negative.")
        return value

    def validate_low_stock_threshold(self, value):
        if value < 0:
            raise serializers.ValidationError("Threshold cannot be negative.")
        return value

    def create(self, validated):
        validated["branch"] = validated["food"].branch
        return super().create(validated)


class RestockSerializer(serializers.Serializer):
    quantity = serializers.IntegerField(min_value=1, max_value=1_000_000)
    note = serializers.CharField(max_length=255, required=False, allow_blank=True, default="")


class AdjustSerializer(serializers.Serializer):
    new_quantity = serializers.IntegerField(min_value=0, max_value=1_000_000)
    note = serializers.CharField(max_length=255, required=False, allow_blank=True, default="")


class StockTransactionSerializer(serializers.ModelSerializer):
    performed_by_name = serializers.CharField(source="performed_by.name", read_only=True, default=None)
    order_number = serializers.CharField(source="order.order_number", read_only=True, default=None)

    class Meta:
        model = StockTransaction
        fields = ["id", "transaction_type", "quantity_change", "balance_after", "order_number", "performed_by_name",
                  "note", "created_at"]
