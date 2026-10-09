"""Phase 4: categories, dishes, images, customizations."""
import io
import os
import shutil
import tempfile
from decimal import Decimal

from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import override_settings
from PIL import Image

from apps.carts.models import Cart, CartItem
from apps.menu.models import Category, CustomizationOption, Food, FoodImage
from apps.orders.models import Order, OrderItem

from .helpers import StaffTestCase, png_file, rows

MEDIA = tempfile.mkdtemp(prefix="foodie_test_media_")


@override_settings(MEDIA_ROOT=MEDIA)
class MenuBase(StaffTestCase):
    @classmethod
    def tearDownClass(cls):
        super().tearDownClass()
        shutil.rmtree(MEDIA, ignore_errors=True)

    def cat(self, client=None, **kw):
        body = {"name": "Starters", "description": "Light bites"}
        body.update(kw)
        return (client or self.admin_a).post("/api/categories/", body, format="json")

    def food(self, category_id, client=None, **kw):
        body = {"category": category_id, "name": "Masala Dosa", "price": "80.00", "diet_type": "VEG",
                "description": "Crisp", "ingredients": "rice, lentils"}
        body.update(kw)
        return (client or self.admin_a).post("/api/foods/", body, format="json")


class CategoryTests(MenuBase):
    def test_crud_and_forced_branch(self):
        r = self.cat()
        self.assertEqual(r.status_code, 201, r.content)
        cid = r.json()["id"]
        self.assertEqual(Category.objects.get(pk=cid).branch_id, self.a.id)
        r = self.admin_a.patch(f"/api/categories/{cid}/", {"description": "Updated", "display_order": 2},
                               format="json")
        self.assertEqual((r.status_code, r.json()["description"]), (200, "Updated"))
        self.assertEqual(self.admin_a.get(f"/api/categories/{cid}/").status_code, 200)

    def test_validation(self):
        self.cat()
        self.assertEqual(self.cat(name="starters").status_code, 400)  # duplicate in branch, case-insensitive
        self.assertEqual(self.cat(self.admin_b, name="Starters").status_code, 201)  # other branch ok
        self.assertEqual(self.cat(name="").status_code, 400)
        self.assertEqual(self.cat(self.owner, name="X").status_code, 400)  # owner must pick a branch
        self.assertEqual(self.cat(self.owner, name="X", branch=self.b.id).status_code, 201)
        self.assertEqual(self.cat(self.admin_a, name="Y", branch=self.b.id).status_code, 400)

    def test_branch_cannot_change(self):
        cid = self.cat().json()["id"]
        self.assertEqual(self.owner.patch(f"/api/categories/{cid}/", {"branch": self.b.id}, format="json")
                         .status_code, 400)

    def test_permissions_and_isolation(self):
        cid = self.cat().json()["id"]
        self.assertEqual(self.chef_a.get("/api/categories/").status_code, 200)
        self.assertEqual(self.chef_a.post("/api/categories/", {"name": "N"}, format="json").status_code, 403)
        self.assertEqual(self.chef_a.patch(f"/api/categories/{cid}/", {"name": "N"}, format="json").status_code, 403)
        self.assertEqual(self.chef_a.delete(f"/api/categories/{cid}/").status_code, 403)
        self.assertEqual(self.admin_b.get(f"/api/categories/{cid}/").status_code, 404)
        self.assertEqual(self.admin_b.delete(f"/api/categories/{cid}/").status_code, 404)
        self.assertEqual(self.anon.get("/api/categories/").status_code, 401)

    def test_search_filter_active_and_dish_count(self):
        c1 = self.cat(name="Desserts").json()["id"]
        self.cat(name="Mains")
        self.food(c1)
        self.assertEqual([c["name"] for c in rows(self.admin_a.get("/api/categories/?search=dess"))], ["Desserts"])
        self.admin_a.patch(f"/api/categories/{c1}/", {"is_active": False}, format="json")
        self.assertEqual([c["name"] for c in rows(self.admin_a.get("/api/categories/?is_active=false"))],
                         ["Desserts"])
        self.assertEqual(rows(self.admin_a.get(f"/api/categories/?search=dess"))[0]["dish_count"], 1)

    def test_delete_unused_removes_but_used_deactivates(self):
        empty = self.cat(name="Empty").json()["id"]
        self.assertEqual(self.admin_a.delete(f"/api/categories/{empty}/").status_code, 204)
        self.assertFalse(Category.objects.filter(pk=empty).exists())
        used = self.cat(name="Used").json()["id"]
        self.food(used)
        r = self.admin_a.delete(f"/api/categories/{used}/")
        self.assertEqual((r.status_code, r.json()["deactivated"]), (200, True))
        self.assertFalse(Category.objects.get(pk=used).is_active)
        self.assertTrue(Food.objects.filter(category_id=used).exists())  # dishes keep their history


class FoodTests(MenuBase):
    def setUp(self):
        super().setUp()
        self.c1 = self.cat(name="Starters").json()["id"]
        self.c2 = self.cat(name="Mains").json()["id"]

    def test_create_and_read_back(self):
        r = self.food(self.c1, price="99.50", calories=250, protein_grams="6.5")
        self.assertEqual(r.status_code, 201, r.content)
        f = Food.objects.get(pk=r.json()["id"])
        self.assertEqual((f.branch_id, f.price, f.diet_type), (self.a.id, Decimal("99.50"), "VEG"))
        self.assertEqual(r.json()["category_name"], "Starters")
        self.assertEqual(r.json()["images"], [])

    def test_validation(self):
        self.assertEqual(self.food(self.c1, diet_type="MEAT").status_code, 400)
        self.assertEqual(self.food(self.c1, price="-1").status_code, 400)
        self.assertEqual(self.food(self.c1, price="abc").status_code, 400)
        self.assertEqual(self.food(self.c1, name="").status_code, 400)
        self.food(self.c1)
        self.assertEqual(self.food(self.c1, name="masala dosa").status_code, 400)  # duplicate in category
        self.assertEqual(self.food(self.c2, name="Masala Dosa").status_code, 201)  # other category ok

    def test_category_must_belong_to_same_branch(self):
        other = self.cat(self.admin_b, name="B-cat").json()["id"]
        self.assertEqual(self.food(other).status_code, 400)  # branch A admin, branch B category -> not found/400
        self.assertEqual(self.food(other, self.owner, branch=self.a.id).status_code, 400)

    def test_selecting_a_category_shows_only_its_dishes(self):
        self.food(self.c1, name="Spring Roll")
        self.food(self.c1, name="Samosa")
        self.food(self.c2, name="Thali")
        self.assertEqual({f["name"] for f in rows(self.admin_a.get(f"/api/foods/?category={self.c1}"))},
                         {"Spring Roll", "Samosa"})
        self.assertEqual({f["name"] for f in rows(self.admin_a.get(f"/api/foods/?category={self.c2}"))}, {"Thali"})

    def test_filters_search_and_ordering(self):
        self.food(self.c1, name="Paneer Tikka", price="150", diet_type="VEG")
        self.food(self.c1, name="Chicken Wings", price="220", diet_type="NON_VEG")
        self.food(self.c1, name="Tofu Bowl", price="130", diet_type="VEGAN")
        names = lambda q: [f["name"] for f in rows(self.admin_a.get(f"/api/foods/{q}"))]
        self.assertEqual(names("?diet_type=NON_VEG"), ["Chicken Wings"])
        self.assertEqual(names("?search=tofu"), ["Tofu Bowl"])
        self.assertEqual(names("?ordering=price"), ["Tofu Bowl", "Paneer Tikka", "Chicken Wings"])
        self.assertEqual(names("?ordering=-price"), ["Chicken Wings", "Paneer Tikka", "Tofu Bowl"])

    def test_sold_out_and_active_flags(self):
        fid = self.food(self.c1).json()["id"]
        r = self.admin_a.patch(f"/api/foods/{fid}/", {"is_sold_out": True}, format="json")
        self.assertTrue(r.json()["is_sold_out"])
        self.assertEqual(len(rows(self.admin_a.get("/api/foods/?is_sold_out=true"))), 1)
        self.admin_a.patch(f"/api/foods/{fid}/", {"is_active": False}, format="json")
        self.assertEqual(len(rows(self.admin_a.get("/api/foods/?is_active=false"))), 1)

    def test_permissions_and_isolation(self):
        fid = self.food(self.c1).json()["id"]
        self.assertEqual(self.chef_a.get("/api/foods/").status_code, 200)
        self.assertEqual(self.chef_a.post("/api/foods/", {"category": self.c1, "name": "X", "price": "1"},
                                          format="json").status_code, 403)
        self.assertEqual(self.chef_a.patch(f"/api/foods/{fid}/", {"price": "1"}, format="json").status_code, 403)
        self.assertEqual(self.admin_b.get(f"/api/foods/{fid}/").status_code, 404)
        self.assertEqual(self.admin_b.patch(f"/api/foods/{fid}/", {"price": "1"}, format="json").status_code, 404)
        self.assertEqual(rows(self.admin_b.get("/api/foods/")), [])
        self.assertEqual(self.anon.get("/api/foods/").status_code, 401)

    def test_delete_unreferenced_removes(self):
        fid = self.food(self.c1).json()["id"]
        self.assertEqual(self.admin_a.delete(f"/api/foods/{fid}/").status_code, 204)
        self.assertFalse(Food.objects.filter(pk=fid).exists())

    def test_delete_referenced_by_order_deactivates_and_preserves_history(self):
        fid = self.food(self.c1).json()["id"]
        food = Food.objects.get(pk=fid)
        order = Order.objects.create(order_number="H1", branch=self.a, order_type="TAKEAWAY", status="COMPLETED")
        OrderItem.objects.create(order=order, food=food, food_name="Masala Dosa", unit_price=80, quantity=1,
                                 line_total=80)
        r = self.admin_a.delete(f"/api/foods/{fid}/")
        self.assertEqual((r.status_code, r.json()["deactivated"]), (200, True))
        food.refresh_from_db()
        self.assertFalse(food.is_active)
        # later menu edits never touch the historical order line
        self.admin_a.patch(f"/api/foods/{fid}/", {"name": "Renamed", "price": "999"}, format="json")
        item = OrderItem.objects.get(order=order)
        self.assertEqual((item.food_name, item.unit_price), ("Masala Dosa", Decimal("80.00")))

    def test_delete_referenced_by_cart_deactivates(self):
        fid = self.food(self.c1).json()["id"]
        cart = Cart.objects.create(guest_token="g1", branch=self.a)
        CartItem.objects.create(cart=cart, food_id=fid, quantity=1)
        self.assertEqual(self.admin_a.delete(f"/api/foods/{fid}/").json()["deactivated"], True)


class ImageTests(MenuBase):
    def setUp(self):
        super().setUp()
        cid = self.cat().json()["id"]
        self.fid = self.food(cid).json()["id"]

    def upload(self, client=None, file=None, **extra):
        data = {"food": self.fid, "image": file or png_file(), **extra}
        return (client or self.admin_a).post("/api/food-images/", data, format="multipart")

    def test_upload_stores_file_and_returns_absolute_url(self):
        r = self.upload()
        self.assertEqual(r.status_code, 201, r.content)
        body = r.json()
        self.assertTrue(body["url"].startswith("http://testserver/media/foods/"))
        self.assertNotIn("image", body)
        stored = FoodImage.objects.get(pk=body["id"])
        self.assertTrue(os.path.exists(stored.image.path))
        self.assertTrue(stored.is_primary)  # the first image becomes primary
        detail = self.admin_a.get(f"/api/foods/{self.fid}/").json()
        self.assertEqual(detail["primary_image"], body["url"])
        self.assertEqual(len(detail["images"]), 1)

    def test_primary_switching_and_delete_promotion(self):
        first = self.upload().json()
        second = self.upload(is_primary="true").json()
        imgs = {i["id"]: i["is_primary"] for i in self.admin_a.get(f"/api/foods/{self.fid}/").json()["images"]}
        self.assertEqual(imgs, {first["id"]: False, second["id"]: True})
        self.assertEqual(self.admin_a.get(f"/api/foods/{self.fid}/").json()["primary_image"], second["url"])
        path = FoodImage.objects.get(pk=second["id"]).image.path
        self.assertEqual(self.admin_a.delete(f"/api/food-images/{second['id']}/").status_code, 204)
        self.assertFalse(os.path.exists(path))  # file removed from disk
        self.assertTrue(FoodImage.objects.get(pk=first["id"]).is_primary)  # promoted

    def test_rejects_non_images_oversize_and_wrong_type(self):
        txt = SimpleUploadedFile("a.png", b"not really an image", content_type="image/png")
        self.assertEqual(self.upload(file=txt).status_code, 400)
        buf = io.BytesIO()
        Image.new("RGB", (10, 10)).save(buf, format="GIF")  # a real, valid image in a disallowed format
        gif = SimpleUploadedFile("a.gif", buf.getvalue(), content_type="image/gif")
        self.assertEqual(self.upload(file=gif).status_code, 400)
        with self.settings(MAX_IMAGE_UPLOAD_BYTES=10):
            self.assertEqual(self.upload().status_code, 400)
        self.assertEqual(FoodImage.objects.count(), 0)

    def test_permissions_and_isolation(self):
        self.assertEqual(self.upload(self.chef_a).status_code, 403)
        self.assertEqual(self.upload(self.admin_b).status_code, 400)  # dish of another branch is "not found"
        iid = self.upload().json()["id"]
        self.assertEqual(self.chef_a.get("/api/food-images/").status_code, 200)
        self.assertEqual(self.admin_b.delete(f"/api/food-images/{iid}/").status_code, 404)
        self.assertEqual(rows(self.admin_b.get("/api/food-images/")), [])
        self.assertEqual(self.anon.get("/api/food-images/").status_code, 401)


class CustomizationTests(MenuBase):
    def setUp(self):
        super().setUp()
        cid = self.cat().json()["id"]
        self.fid = self.food(cid).json()["id"]

    def make(self, client=None, **kw):
        body = {"food": self.fid, "name": "Extra cheese", "extra_price": "20.00"}
        body.update(kw)
        return (client or self.admin_a).post("/api/customization-options/", body, format="json")

    def test_crud_and_embedded_in_dish(self):
        r = self.make()
        self.assertEqual(r.status_code, 201, r.content)
        oid = r.json()["id"]
        self.assertEqual(self.admin_a.patch(f"/api/customization-options/{oid}/", {"extra_price": "25"},
                                            format="json").json()["extra_price"], "25.00")
        opts = self.admin_a.get(f"/api/foods/{self.fid}/").json()["customizations"]
        self.assertEqual([(o["name"], o["extra_price"]) for o in opts], [("Extra cheese", "25.00")])
        self.assertEqual(self.admin_a.delete(f"/api/customization-options/{oid}/").status_code, 204)

    def test_validation_and_permissions(self):
        self.make()
        self.assertEqual(self.make(name="extra CHEESE").status_code, 400)
        self.assertEqual(self.make(name="Neg", extra_price="-5").status_code, 400)
        self.assertEqual(self.make(self.chef_a, name="N").status_code, 403)
        self.assertEqual(self.make(self.admin_b, name="N").status_code, 400)  # other branch's dish
        self.assertEqual(rows(self.admin_b.get("/api/customization-options/")), [])

    def test_option_in_a_cart_is_deactivated_not_deleted(self):
        oid = self.make().json()["id"]
        cart = Cart.objects.create(guest_token="g2", branch=self.a)
        item = CartItem.objects.create(cart=cart, food_id=self.fid, quantity=1)
        item.options.add(CustomizationOption.objects.get(pk=oid))
        r = self.admin_a.delete(f"/api/customization-options/{oid}/")
        self.assertEqual((r.status_code, r.json()["deactivated"]), (200, True))
        self.assertFalse(CustomizationOption.objects.get(pk=oid).is_active)
