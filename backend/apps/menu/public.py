"""Customer-facing menu (no login needed). Only active branches, categories and dishes are exposed, and only
fields a customer should see (no branch internals, no exact stock numbers)."""
from decimal import Decimal

from django.db.models import Q
from django.utils import timezone
from rest_framework import status
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView

from apps.branches.models import Branch
from apps.coupons.models import Coupon

from .images import display_image, uploaded_url
from .models import Category, Food
from .pricing_helpers import current_discount, inventory_of, is_orderable, money, stock_status

MENU_SORTS = {"price", "-price", "discount", "name"}


def public_food(food, request, now=None):
    disc, amount = current_discount(food, now)
    price = money(food.price)
    percent = (amount / price * 100).quantize(Decimal("0.01")) if disc and price > 0 else Decimal("0.00")
    imgs = list(food.images.all())
    return {
        "id": food.id, "category": food.category_id, "category_name": food.category.name, "name": food.name,
        "description": food.description, "ingredients": food.ingredients, "diet_type": food.diet_type,
        "original_price": str(price), "discounted_price": str(money(price - amount)),
        "discount_percent": str(percent), "has_discount": disc is not None,
        "calories": food.calories,
        "is_orderable": is_orderable(food), "stock_status": stock_status(food),
        "quantity": None if inventory_of(food) is None else inventory_of(food).quantity,
        "primary_image": display_image(food, request),
        "images": [{"id": i.id, "url": uploaded_url(request, i), "is_primary": i.is_primary} for i in imgs],
        "customizations": [{"id": o.id, "name": o.name, "extra_price": str(o.extra_price)}
                           for o in food.customizations.all() if o.is_active],
    }


def _foods(branch):
    return (Food.objects.filter(branch=branch, is_active=True, category__is_active=True)
            .select_related("category", "inventory").prefetch_related("images", "customizations", "discounts"))


class PublicThrottled(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "public_menu"


class PublicMenuView(PublicThrottled):
    """GET /public/branches/{id}/menu/?category=&diet_type=VEG,VEGAN&search=&ordering=price|-price|discount|name

    Filters combine (AND); `diet_type` accepts several values. Sold-out dishes are returned with
    `is_orderable=false` so the UI can show them greyed out. Default order: category order, then name."""

    def get(self, request, branch_id):
        branch = Branch.objects.filter(pk=branch_id, is_active=True).first()
        if branch is None:
            return Response({"detail": "Branch not found."}, status=status.HTTP_404_NOT_FOUND)
        now = timezone.now()
        q = request.query_params

        diets = [d.strip().upper() for d in q.get("diet_type", "").split(",") if d.strip()]
        bad = [d for d in diets if d not in Food.DietType.values]
        if bad:
            return Response({"diet_type": [f"Invalid value(s): {', '.join(bad)}."]}, status=400)
        ordering = q.get("ordering", "")
        if ordering and ordering not in MENU_SORTS:
            return Response({"ordering": [f"Must be one of {sorted(MENU_SORTS)}."]}, status=400)

        foods_qs = _foods(branch)
        if q.get("category"):
            if not q["category"].isdigit():
                return Response({"category": ["Must be a category id."]}, status=400)
            cat_id = int(q["category"])
            target_cat = Category.objects.filter(pk=cat_id).first()
            if target_cat:
                foods_qs = foods_qs.filter(Q(category_id=cat_id) | Q(category__name__iexact=target_cat.name))
            else:
                foods_qs = foods_qs.filter(category_id=cat_id)
        if diets:
            foods_qs = foods_qs.filter(diet_type__in=diets)
        if q.get("search", "").strip():
            term = q["search"].strip()
            foods_qs = foods_qs.filter(Q(name__icontains=term) | Q(description__icontains=term))

        foods_list = list(foods_qs.order_by("category__display_order", "name"))
        # Deduplicate by food name: if both sub-branch and main branch have the same dish name, keep sub-branch
        seen_names = {}
        deduped_foods = []
        for f in foods_list:
            lower_name = f.name.strip().lower()
            if lower_name not in seen_names:
                seen_names[lower_name] = f
                deduped_foods.append(f)
            elif f.branch_id == branch.id and seen_names[lower_name].branch_id != branch.id:
                # Replace primary branch dish with sub-branch specific dish
                idx = deduped_foods.index(seen_names[lower_name])
                deduped_foods[idx] = f
                seen_names[lower_name] = f

        rows = [public_food(f, request, now) for f in deduped_foods]
        if ordering == "price":
            rows.sort(key=lambda r: Decimal(r["discounted_price"]))
        elif ordering == "-price":
            rows.sort(key=lambda r: Decimal(r["discounted_price"]), reverse=True)
        elif ordering == "discount":
            rows.sort(key=lambda r: Decimal(r["discount_percent"]), reverse=True)
        elif ordering == "name":
            rows.sort(key=lambda r: r["name"].lower())

        cat_branch_q = Q(branch=branch, is_active=True)
        raw_cats = list(Category.objects.filter(cat_branch_q).order_by("display_order", "id"))
        seen_cat_names = set()
        categories = []
        for c in raw_cats:
            c_name_lower = c.name.strip().lower()
            if c_name_lower not in seen_cat_names:
                seen_cat_names.add(c_name_lower)
                count = sum(1 for f in deduped_foods if (f.category_id == c.id or f.category.name.strip().lower() == c_name_lower))
                categories.append({
                    "id": c.id, "name": c.name, "description": c.description,
                    "dish_count": count
                })

        coupon_branch_q = Q(branch=branch, is_active=True, valid_from__lte=now, valid_to__gte=now)
        raw_coupons = list(Coupon.objects.filter(coupon_branch_q).order_by("min_order_value", "code"))
        seen_coupon_codes = set()
        offers = []
        for c in raw_coupons:
            code_upper = c.code.strip().upper()
            if code_upper not in seen_coupon_codes:
                seen_coupon_codes.add(code_upper)
                offers.append({
                    "code": c.code, "description": c.description, "discount_type": c.discount_type,
                    "discount_value": str(c.discount_value), "min_order_value": str(c.min_order_value),
                    "max_discount": None if c.max_discount is None else str(c.max_discount),
                    "valid_from": c.valid_from, "valid_to": c.valid_to, "is_active": c.is_active,
                    "is_first_time_offer": c.is_first_time_auto, "auto_apply": c.auto_apply
                })

        return Response({"branch": {"id": branch.id, "name": branch.name}, "categories": categories,
                         "foods": rows, "offers": offers})


class PublicFoodView(PublicThrottled):
    def get(self, request, food_id):
        food = (Food.objects.select_related("category", "inventory", "branch")
                .prefetch_related("images", "customizations", "discounts")
                .filter(pk=food_id, is_active=True, category__is_active=True, branch__is_active=True).first())
        if food is None:
            return Response({"detail": "Dish not found."}, status=status.HTTP_404_NOT_FOUND)
        return Response(public_food(food, request))