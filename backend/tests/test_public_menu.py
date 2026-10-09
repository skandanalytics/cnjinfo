"""Phase 6: customer-facing menu (no login)."""
from datetime import timedelta
from decimal import Decimal as D

from django.core.cache import cache
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from apps.coupons.models import Coupon
from apps.inventory.models import InventoryItem
from apps.menu.models import Category, CustomizationOption, DishDiscount, Food, FoodImage

from .helpers import make_branch

NOW = timezone.now()


class PublicMenuTests(TestCase):
    def setUp(self):
        cache.clear()
        self.client = APIClient()
        self.a, self.b = make_branch("A"), make_branch("B")
        self.starters = Category.objects.create(branch=self.a, name="Starters", description="Light bites",
                                                display_order=0)
        self.mains = Category.objects.create(branch=self.a, name="Mains", display_order=1)
        mk = lambda cat, name, price, diet, **kw: Food.objects.create(branch=self.a, category=cat, name=name,
                                                                      price=D(price), diet_type=diet, **kw)
        self.roll = mk(self.starters, "Spring Roll", "80", "VEG", description="crispy rolls")
        self.wings = mk(self.starters, "Chicken Wings", "220", "NON_VEG")
        self.tofu = mk(self.mains, "Tofu Bowl", "150", "VEGAN")
        self.paneer = mk(self.mains, "Paneer Tikka", "200", "VEG")
        DishDiscount.objects.create(food=self.paneer, discount_type="PERCENT", value=D("50"),
                                    valid_from=NOW - timedelta(days=1), valid_to=NOW + timedelta(days=1))
        # things that must never show up
        mk(self.mains, "Retired", "10", "VEG", is_active=False)
        dead_cat = Category.objects.create(branch=self.a, name="Old", is_active=False)
        mk(dead_cat, "In dead category", "10", "VEG")
        Food.objects.create(branch=self.b, category=Category.objects.create(branch=self.b, name="X"),
                            name="Other branch dish", price=5)

    def menu(self, qs="", branch=None):
        return self.client.get(f"/api/public/branches/{(branch or self.a).id}/menu/{qs}")

    def food_named(self, name):
        return next(f for f in self.menu().json()["foods"] if f["name"] == name)

    def names(self, qs=""):
        return [f["name"] for f in self.menu(qs).json()["foods"]]

    def test_no_login_needed_and_only_active_branch_data(self):
        r = self.menu()
        self.assertEqual(r.status_code, 200)
        body = r.json()
        self.assertEqual(body["branch"], {"id": self.a.id, "name": "Branch A"})
        self.assertEqual(set(self.names()), {"Spring Roll", "Chicken Wings", "Tofu Bowl", "Paneer Tikka"})
        self.assertEqual([c["name"] for c in body["categories"]], ["Starters", "Mains"])
        self.assertEqual(body["categories"][0]["description"], "Light bites")

    def test_default_order_is_category_then_name(self):
        self.assertEqual(self.names(), ["Chicken Wings", "Spring Roll", "Paneer Tikka", "Tofu Bowl"])

    def test_food_fields_hide_internals(self):
        food = self.food_named("Spring Roll")
        for hidden in ("branch", "is_active", "created_at", "quantity", "inventory"):
            self.assertNotIn(hidden, food)
        self.assertEqual((food["original_price"], food["discounted_price"], food["has_discount"]),
                         ("80.00", "80.00", False))

    def test_discount_prices(self):
        p = self.food_named("Paneer Tikka")
        self.assertEqual((p["original_price"], p["discounted_price"], p["discount_percent"], p["has_discount"]),
                         ("200.00", "100.00", "50.00", True))

    def test_filters_combine(self):
        self.assertEqual(self.names(f"?category={self.starters.id}"), ["Chicken Wings", "Spring Roll"])
        self.assertEqual(self.names("?diet_type=VEG"), ["Spring Roll", "Paneer Tikka"])
        self.assertEqual(set(self.names("?diet_type=veg,vegan")), {"Spring Roll", "Paneer Tikka", "Tofu Bowl"})
        self.assertEqual(self.names("?search=wing"), ["Chicken Wings"])
        self.assertEqual(self.names("?search=crispy"), ["Spring Roll"])  # matches description too
        self.assertEqual(self.names(f"?category={self.mains.id}&diet_type=VEGAN"), ["Tofu Bowl"])
        self.assertEqual(self.names(f"?category={self.starters.id}&diet_type=VEGAN"), [])

    def test_sorting_uses_the_price_customers_pay(self):
        self.assertEqual(self.names("?ordering=price"),
                         ["Spring Roll", "Paneer Tikka", "Tofu Bowl", "Chicken Wings"])  # paneer is 100 after 50%
        self.assertEqual(self.names("?ordering=-price"),
                         ["Chicken Wings", "Tofu Bowl", "Paneer Tikka", "Spring Roll"])
        self.assertEqual(self.names("?ordering=discount")[0], "Paneer Tikka")

    def test_filters_and_sort_together(self):
        self.assertEqual(self.names("?diet_type=VEG,VEGAN&ordering=-price"),
                         ["Tofu Bowl", "Paneer Tikka", "Spring Roll"])

    def test_bad_parameters_rejected(self):
        self.assertEqual(self.menu("?diet_type=MEAT").status_code, 400)
        self.assertEqual(self.menu("?ordering=cheapest").status_code, 400)
        self.assertEqual(self.menu("?category=abc").status_code, 400)

    def test_availability_flags(self):
        self.roll.is_sold_out = True
        self.roll.save()
        InventoryItem.objects.create(branch=self.a, food=self.wings, quantity=0)
        InventoryItem.objects.create(branch=self.a, food=self.tofu, quantity=3)
        foods = {f["name"]: f for f in self.menu().json()["foods"]}
        self.assertEqual((foods["Spring Roll"]["is_orderable"], foods["Spring Roll"]["stock_status"]), (False, None))
        self.assertEqual((foods["Chicken Wings"]["is_orderable"], foods["Chicken Wings"]["stock_status"]),
                         (False, "OUT_OF_STOCK"))
        self.assertEqual((foods["Tofu Bowl"]["is_orderable"], foods["Tofu Bowl"]["stock_status"]),
                         (True, "LOW_STOCK"))
        self.assertTrue(foods["Paneer Tikka"]["is_orderable"])
        self.assertEqual(len(foods), 4)  # sold-out dishes stay visible (greyed out by the UI)

    def test_customizations_and_images(self):
        CustomizationOption.objects.create(food=self.roll, name="Extra sauce", extra_price=D("10"))
        CustomizationOption.objects.create(food=self.roll, name="Hidden option", extra_price=D("5"), is_active=False)
        FoodImage.objects.create(food=self.roll, image="foods/2026/10/roll.png", is_primary=True)
        food = self.food_named("Spring Roll")
        self.assertEqual([c["name"] for c in food["customizations"]], ["Extra sauce"])
        self.assertEqual(food["primary_image"], "http://testserver/media/foods/2026/10/roll.png")

    def test_offers_only_live_ones(self):
        mk = lambda code, **kw: Coupon.objects.create(
            branch=self.a, code=code, discount_type="FLAT", discount_value=30, min_order_value=100,
            **{"valid_from": NOW - timedelta(days=1), "valid_to": NOW + timedelta(days=1), **kw})
        mk("LIVE")
        mk("OLD", valid_from=NOW - timedelta(days=5), valid_to=NOW - timedelta(days=2))
        mk("OFF", is_active=False)
        Coupon.objects.create(branch=self.b, code="OTHER", discount_type="FLAT", discount_value=1,
                              valid_from=NOW - timedelta(days=1), valid_to=NOW + timedelta(days=1))
        self.assertEqual([o["code"] for o in self.menu().json()["offers"]], ["LIVE"])

    def test_inactive_or_unknown_branch(self):
        self.a.is_active = False
        self.a.save()
        self.assertEqual(self.menu().status_code, 404)
        self.assertEqual(self.client.get("/api/public/branches/99999/menu/").status_code, 404)

    def test_dish_detail(self):
        r = self.client.get(f"/api/public/foods/{self.roll.id}/")
        self.assertEqual((r.status_code, r.json()["name"]), (200, "Spring Roll"))
        self.assertEqual(self.client.get(f"/api/public/foods/{Food.objects.get(name='Retired').id}/").status_code, 404)
        self.assertEqual(self.client.get(f"/api/public/foods/{Food.objects.get(name='In dead category').id}/")
                         .status_code, 404)
        self.b.is_active = False
        self.b.save()
        other = Food.objects.get(name="Other branch dish")
        self.assertEqual(self.client.get(f"/api/public/foods/{other.id}/").status_code, 404)