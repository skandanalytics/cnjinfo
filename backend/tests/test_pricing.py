"""Phase 5: dish discounts, coupons, first-time rules, central pricing, quote API."""
from datetime import timedelta
from decimal import Decimal

from django.utils import timezone

from apps.accounts.models import User
from apps.coupons import services as coupon_services
from apps.coupons.models import Coupon, CouponRedemption
from apps.inventory.models import InventoryItem
from apps.menu.models import Category, CustomizationOption, DishDiscount, Food
from apps.orders.models import Order

from .helpers import StaffTestCase, customer_client, make_order, rows

D = Decimal
NOW = timezone.now()


class PricingBase(StaffTestCase):
    """Branch A: GST 5%, service 10%, takeaway Rs 15 (explicit test values; the real rates are unconfirmed)."""

    def setUp(self):
        super().setUp()
        self.a.gst_rate, self.a.service_charge_rate, self.a.takeaway_charge = D("5"), D("10"), D("15")
        self.a.save()
        self.cat = Category.objects.create(branch=self.a, name="Mains")
        self.dosa = Food.objects.create(branch=self.a, category=self.cat, name="Dosa", price=D("100"))
        self.coffee = Food.objects.create(branch=self.a, category=self.cat, name="Coffee", price=D("50.50"))
        self.cheese = CustomizationOption.objects.create(food=self.dosa, name="Extra cheese", extra_price=D("20"))
        self.vada = Food.objects.create(branch=self.b, category=Category.objects.create(branch=self.b, name="X"),
                                        name="Vada", price=30)
        self.guest = self.anon

    def quote(self, items, order_type="DINE_IN", codes=(), client=None, branch=None, **extra):
        body = {"branch": (branch or self.a).id, "order_type": order_type, "items": items,
                "coupon_codes": list(codes), **extra}
        return (client or self.guest).post("/api/pricing/quote/", body, format="json")

    def coupon(self, code, **kw):
        base = dict(branch=self.a, code=code, discount_type="FLAT", discount_value=D("30"), min_order_value=D("100"),
                    valid_from=NOW - timedelta(days=1), valid_to=NOW + timedelta(days=30))
        base.update(kw)
        return Coupon.objects.create(**base)

    def customer(self, phone="+919600000001", completed=False):
        user = User.objects.create_user(phone=phone)
        if completed:
            make_order(self.a, number=f"DONE{phone[-4:]}", status="COMPLETED", customer=user)
        return user


class PriceCalculationTests(PricingBase):
    def test_dine_in_totals(self):
        r = self.quote([{"food": self.dosa.id, "quantity": 2, "options": [self.cheese.id]}])
        self.assertEqual(r.status_code, 200, r.content)
        b = r.json()
        self.assertEqual((b["items_subtotal"], b["customization_total"], b["dish_discount_total"]),
                         ("200.00", "40.00", "0.00"))
        self.assertEqual((b["merchandise_total"], b["takeaway_charge"], b["taxable_amount"]),
                         ("240.00", "0.00", "240.00"))
        self.assertEqual((b["gst_amount"], b["service_charge_amount"], b["total_amount"]),
                         ("12.00", "24.00", "276.00"))
        line = b["items"][0]
        self.assertEqual((line["unit_price"], line["customization_per_unit"], line["final_unit_price"],
                          line["line_total"]), ("100.00", "20.00", "120.00", "240.00"))

    def test_takeaway_adds_charge_before_gst_but_not_before_service(self):
        b = self.quote([{"food": self.dosa.id, "quantity": 2, "options": [self.cheese.id]}], "TAKEAWAY").json()
        self.assertEqual((b["takeaway_charge"], b["taxable_amount"], b["gst_amount"], b["service_charge_amount"],
                          b["total_amount"]), ("15.00", "255.00", "12.75", "24.00", "291.75"))

    def test_total_is_sum_of_rounded_parts_and_rounds_half_up(self):
        f = Food.objects.create(branch=self.a, category=self.cat, name="Odd", price=D("10.10"))
        b = self.quote([{"food": f.id, "quantity": 1}]).json()
        self.assertEqual(b["gst_amount"], "0.51")  # 10.10 x 5% = 0.505 -> half-up 0.51
        self.assertEqual(b["service_charge_amount"], "1.01")
        self.assertEqual(D(b["total_amount"]), D("10.10") + D("0.51") + D("1.01"))

    def test_zero_rates_give_plain_totals(self):
        self.a.gst_rate = self.a.service_charge_rate = self.a.takeaway_charge = D("0")
        self.a.save()
        b = self.quote([{"food": self.dosa.id, "quantity": 3}], "TAKEAWAY").json()
        self.assertEqual((b["gst_amount"], b["service_charge_amount"], b["takeaway_charge"], b["total_amount"]),
                         ("0.00", "0.00", "0.00", "300.00"))

    def test_server_ignores_client_supplied_prices_and_totals(self):
        r = self.quote([{"food": self.dosa.id, "quantity": 1, "price": "1", "unit_price": "1"}], total_amount="1")
        self.assertEqual(r.json()["items"][0]["unit_price"], "100.00")
        self.assertEqual(r.json()["items_subtotal"], "100.00")
        self.assertEqual(r.json()["total_amount"], "115.00")  # 100 + 5% GST + 10% service, from the DB price

    def test_invalid_carts_are_rejected_with_reasons(self):
        bad = [
            ([], "may not be empty"),
            ([{"food": self.dosa.id, "quantity": 0}], "Quantity"),
            ([{"food": self.dosa.id, "quantity": 100}], "Quantity"),
            ([{"food": self.vada.id, "quantity": 1}], "not found"),  # other branch's dish
            ([{"food": 999999, "quantity": 1}], "not found"),
            ([{"food": self.coffee.id, "quantity": 1, "options": [self.cheese.id]}], "Invalid customization"),
            ([{"food": self.dosa.id, "quantity": 1, "options": [999999]}], "Invalid customization"),
        ]
        for items, text in bad:
            r = self.quote(items)
            self.assertEqual(r.status_code, 400, (items, r.content))
            self.assertIn(text, r.content.decode(), items)

    def test_unavailable_dishes_rejected(self):
        self.coffee.is_sold_out = True
        self.coffee.save()
        self.assertEqual(self.quote([{"food": self.coffee.id, "quantity": 1}]).status_code, 400)
        self.coffee.is_sold_out, self.coffee.is_active = False, False
        self.coffee.save()
        self.assertEqual(self.quote([{"food": self.coffee.id, "quantity": 1}]).status_code, 400)
        self.cheese.is_active = False
        self.cheese.save()
        self.assertEqual(self.quote([{"food": self.dosa.id, "quantity": 1, "options": [self.cheese.id]}])
                         .status_code, 400)

    def test_stock_is_validated_across_lines(self):
        InventoryItem.objects.create(branch=self.a, food=self.dosa, quantity=3)
        ok = self.quote([{"food": self.dosa.id, "quantity": 3}])
        self.assertEqual(ok.status_code, 200)
        r = self.quote([{"food": self.dosa.id, "quantity": 2}, {"food": self.dosa.id, "quantity": 2,
                                                                 "options": [self.cheese.id]}])
        self.assertEqual(r.status_code, 400)
        self.assertIn("Only 3 of 'Dosa' left", r.content.decode())
        InventoryItem.objects.filter(food=self.dosa).update(quantity=0)
        self.assertEqual(self.quote([{"food": self.dosa.id, "quantity": 1}]).status_code, 400)

    def test_inactive_or_unknown_branch(self):
        self.a.is_active = False
        self.a.save()
        self.assertEqual(self.quote([{"food": self.dosa.id, "quantity": 1}]).status_code, 404)
        self.assertEqual(self.guest.post("/api/pricing/quote/", {"branch": 99999, "order_type": "DINE_IN",
                                                                 "items": [{"food": 1, "quantity": 1}]},
                                         format="json").status_code, 404)

    def test_bad_request_shapes(self):
        self.assertEqual(self.guest.post("/api/pricing/quote/", {}, format="json").status_code, 400)
        self.assertEqual(self.quote([{"food": self.dosa.id, "quantity": 1}], "DELIVERY").status_code, 400)


class DishDiscountTests(PricingBase):
    def discount(self, food=None, client=None, **kw):
        body = {"food": (food or self.dosa).id, "discount_type": "PERCENT", "value": "10",
                "valid_from": (NOW - timedelta(days=1)).isoformat(), "valid_to": (NOW + timedelta(days=5)).isoformat()}
        body.update(kw)
        return (client or self.admin_a).post("/api/dish-discounts/", body, format="json")

    def test_percent_discount_applies_to_base_price_only(self):
        self.assertEqual(self.discount().status_code, 201)
        b = self.quote([{"food": self.dosa.id, "quantity": 2, "options": [self.cheese.id]}]).json()
        # 10% of 100 = 10 per unit; the Rs 20 customization is not discounted
        self.assertEqual((b["dish_discount_total"], b["merchandise_total"]), ("20.00", "220.00"))
        self.assertEqual(b["items"][0]["final_unit_price"], "110.00")

    def test_flat_discount_and_shown_prices(self):
        self.discount(discount_type="FLAT", value="15")
        d = self.admin_a.get(f"/api/foods/{self.dosa.id}/").json()
        self.assertEqual((d["original_price"], d["discounted_price"]), ("100.00", "85.00"))
        self.assertEqual(d["current_discount"]["amount_per_unit"], "15.00")
        plain = self.admin_a.get(f"/api/foods/{self.coffee.id}/").json()
        self.assertIsNone(plain["current_discount"])
        self.assertEqual(plain["discounted_price"], "50.50")

    def test_expired_future_and_inactive_discounts_do_not_apply(self):
        past = self.discount(valid_from=(NOW - timedelta(days=10)).isoformat(),
                             valid_to=(NOW - timedelta(days=5)).isoformat())
        future = self.discount(valid_from=(NOW + timedelta(days=10)).isoformat(),
                               valid_to=(NOW + timedelta(days=15)).isoformat())
        self.assertEqual((past.status_code, future.status_code), (201, 201))
        self.assertEqual(self.quote([{"food": self.dosa.id, "quantity": 1}]).json()["dish_discount_total"], "0.00")
        live = self.discount().json()["id"]
        self.admin_a.patch(f"/api/dish-discounts/{live}/", {"is_active": False}, format="json")
        self.assertEqual(self.quote([{"food": self.dosa.id, "quantity": 1}]).json()["dish_discount_total"], "0.00")

    def test_validation(self):
        self.assertEqual(self.discount(value="0").status_code, 400)
        self.assertEqual(self.discount(value="101").status_code, 400)
        self.assertEqual(self.discount(discount_type="FLAT", value="101").status_code, 400)  # more than the price
        self.assertEqual(self.discount(valid_to=(NOW - timedelta(days=2)).isoformat()).status_code, 400)

    def test_overlapping_active_discounts_rejected_so_it_never_applies_twice(self):
        self.assertEqual(self.discount().status_code, 201)
        self.assertEqual(self.discount(value="20").status_code, 400)
        later = self.discount(valid_from=(NOW + timedelta(days=6)).isoformat(),
                              valid_to=(NOW + timedelta(days=9)).isoformat())
        self.assertEqual(later.status_code, 201)  # non-overlapping is fine

    def test_permissions_and_isolation(self):
        did = self.discount().json()["id"]
        self.assertEqual(self.discount(client=self.chef_a).status_code, 403)
        self.assertEqual(self.chef_a.get("/api/dish-discounts/").status_code, 200)
        self.assertEqual(self.discount(self.vada, client=self.admin_a).status_code, 400)  # other branch's dish
        self.assertEqual(self.admin_b.patch(f"/api/dish-discounts/{did}/", {"value": "5"}, format="json")
                         .status_code, 404)
        self.assertEqual(rows(self.admin_b.get("/api/dish-discounts/")), [])
        self.assertEqual(self.admin_a.delete(f"/api/dish-discounts/{did}/").status_code, 204)

    def test_old_orders_keep_their_price_after_discount_changes(self):
        order = make_order(self.a, [(self.dosa, 1)], number="OLD1", status="COMPLETED")
        self.discount(value="50")
        self.assertEqual(order.items.get().unit_price, D("100.00"))


class CouponApiTests(PricingBase):
    def create(self, client=None, **kw):
        body = {"code": "save30", "discount_type": "FLAT", "discount_value": "30", "min_order_value": "100",
                "valid_from": (NOW - timedelta(days=1)).isoformat(), "valid_to": (NOW + timedelta(days=9)).isoformat()}
        body.update(kw)
        return (client or self.admin_a).post("/api/coupons/", body, format="json")

    def test_create_normalises_code_and_scopes_branch(self):
        r = self.create()
        self.assertEqual(r.status_code, 201, r.content)
        self.assertEqual(r.json()["code"], "SAVE30")
        self.assertEqual(Coupon.objects.get(pk=r.json()["id"]).branch_id, self.a.id)

    def test_validation(self):
        self.create()
        self.assertEqual(self.create(code="Save30").status_code, 400)  # duplicate, case-insensitive
        self.assertEqual(self.create(self.admin_b, code="SAVE30").status_code, 201)  # other branch ok
        self.assertEqual(self.create(code="P1", discount_type="PERCENT", discount_value="150").status_code, 400)
        self.assertEqual(self.create(code="Z", discount_value="0").status_code, 400)
        self.assertEqual(self.create(code="E", valid_to=(NOW - timedelta(days=3)).isoformat()).status_code, 400)
        self.assertEqual(self.create(code="L", usage_limit=0).status_code, 400)
        self.assertEqual(self.create(code="bad code!").status_code, 400)

    def test_only_one_active_first_time_coupon_per_branch(self):
        self.assertEqual(self.create(code="FIRST1", is_first_time_auto=True).status_code, 201)
        self.assertEqual(self.create(code="FIRST2", is_first_time_auto=True).status_code, 400)
        self.assertEqual(self.create(self.admin_b, code="FIRST2", is_first_time_auto=True).status_code, 201)

    def test_permissions_isolation_and_listing(self):
        cid = self.create().json()["id"]
        self.assertEqual(self.create(self.chef_a, code="X1").status_code, 403)
        self.assertEqual(self.chef_a.get("/api/coupons/").status_code, 200)
        self.assertEqual(self.admin_b.get(f"/api/coupons/{cid}/").status_code, 404)
        self.assertEqual(self.admin_b.patch(f"/api/coupons/{cid}/", {"description": "x"}, format="json")
                         .status_code, 404)
        self.assertEqual([c["code"] for c in rows(self.admin_a.get("/api/coupons/?search=save"))], ["SAVE30"])
        self.assertEqual(self.anon.get("/api/coupons/").status_code, 401)

    def test_edit_and_delete_rules(self):
        cid = self.create().json()["id"]
        r = self.admin_a.patch(f"/api/coupons/{cid}/", {"discount_value": "40", "is_active": False}, format="json")
        self.assertEqual((r.json()["discount_value"], r.json()["is_active"]), ("40.00", False))
        self.assertEqual(self.admin_a.delete(f"/api/coupons/{cid}/").status_code, 204)
        used = self.coupon("USED")
        order = make_order(self.a, [(self.dosa, 1)], number="RD1", status="COMPLETED")
        CouponRedemption.objects.create(coupon=used, order=order, discount_amount=30)
        r = self.admin_a.delete(f"/api/coupons/{used.id}/")
        self.assertEqual((r.status_code, r.json()["deactivated"]), (200, True))
        hist = self.admin_a.get(f"/api/coupons/{used.id}/redemptions/").json()
        self.assertEqual([(h["order_number"], h["discount_amount"]) for h in hist], [("RD1", "30.00")])
        self.assertEqual(self.admin_a.get(f"/api/coupons/{used.id}/").json()["used_count"], 1)


class CouponRuleTests(PricingBase):
    def items(self):  # 2 x Dosa = 200
        return [{"food": self.dosa.id, "quantity": 2}]

    def test_manual_coupon_for_guest_applies_and_reduces_tax_base(self):
        self.coupon("SAVE30")
        b = self.quote(self.items(), codes=["save30"]).json()
        self.assertEqual([(c["code"], c["discount"], c["auto_applied"]) for c in b["coupons"]],
                         [("SAVE30", "30.00", False)])
        # (200 - 30) = 170 -> gst 8.50, service 17.00, total 195.50
        self.assertEqual((b["coupon_discount_total"], b["taxable_amount"], b["gst_amount"], b["total_amount"]),
                         ("30.00", "170.00", "8.50", "195.50"))
        self.assertFalse(b["is_first_time_customer"])

    def test_guest_never_gets_first_time_coupon(self):
        self.coupon("WELCOME", is_first_time_auto=True, discount_type="PERCENT", discount_value=D("10"))
        b = self.quote(self.items()).json()
        self.assertEqual(b["coupons"], [])
        r = self.quote(self.items(), codes=["WELCOME"]).json()
        self.assertEqual(r["rejected_coupons"][0]["reason"], "This coupon is only for first-time customers.")

    def test_first_time_customer_gets_auto_coupon_plus_one_extra(self):
        self.coupon("WELCOME", is_first_time_auto=True, discount_type="PERCENT", discount_value=D("10"),
                    min_order_value=D("100"))
        self.coupon("SAVE30")
        self.coupon("SAVE20", discount_value=D("20"))
        c = customer_client(self.customer())
        b = self.quote(self.items(), codes=["SAVE30", "SAVE20"], client=c).json()
        self.assertTrue(b["is_first_time_customer"])
        # auto 10% of 200 = 20, then 30 flat on the remaining 180 -> 50 total; the second extra is refused
        self.assertEqual([(x["code"], x["discount"], x["auto_applied"]) for x in b["coupons"]],
                         [("WELCOME", "20.00", True), ("SAVE30", "30.00", False)])
        self.assertEqual(b["coupon_discount_total"], "50.00")
        self.assertEqual(b["rejected_coupons"], [{"code": "SAVE20",
                                                  "reason": "Only one additional coupon is allowed per order."}])

    def test_auto_coupon_needs_minimum_order(self):
        self.coupon("WELCOME", is_first_time_auto=True, min_order_value=D("500"))
        b = self.quote(self.items(), client=customer_client(self.customer())).json()
        self.assertEqual(b["coupons"], [])
        self.assertEqual(b["offer_progress"]["coupon_code"], "WELCOME")
        self.assertEqual(b["offer_progress"]["remaining_amount"], "300.00")

    def test_auto_apply_coupon_is_used_when_the_order_qualifies(self):
        self.coupon("RAINY20", auto_apply=True, discount_value=D("30"), min_order_value=D("100"))
        self.coupon("SMALL", auto_apply=True, discount_value=D("10"), min_order_value=D("100"))
        b = self.quote(self.items()).json()
        self.assertEqual([(c["code"], c["discount"], c["auto_applied"]) for c in b["coupons"]],
                         [("RAINY20", "30.00", True)])

    def test_auto_apply_waits_for_the_minimum_and_yields_to_a_typed_code(self):
        self.coupon("RAINY20", auto_apply=True, discount_value=D("30"), min_order_value=D("500"))
        self.coupon("SAVE20", discount_value=D("20"), min_order_value=D("100"))
        below = self.quote(self.items()).json()
        self.assertEqual(below["coupons"], [])
        typed = self.quote(self.items(), codes=["SAVE20"]).json()
        self.assertEqual([c["code"] for c in typed["coupons"]], ["SAVE20"])
        self.coupon("READY", auto_apply=False, discount_value=D("15"), min_order_value=D("100"))
        off = self.quote(self.items()).json()
        self.assertEqual(off["coupons"], [])

    def test_returning_customer_gets_one_coupon_only(self):
        self.coupon("WELCOME", is_first_time_auto=True, discount_type="PERCENT", discount_value=D("10"))
        self.coupon("SAVE30")
        self.coupon("SAVE20", discount_value=D("20"))
        c = customer_client(self.customer(completed=True))
        b = self.quote(self.items(), codes=["SAVE30", "SAVE20"], client=c).json()
        self.assertFalse(b["is_first_time_customer"])
        self.assertEqual([x["code"] for x in b["coupons"]], ["SAVE30"])  # no auto coupon, one manual
        self.assertEqual(b["rejected_coupons"][0]["reason"], "Only one coupon can be used per order.")
        r = self.quote(self.items(), codes=["WELCOME"], client=c).json()
        self.assertEqual(r["coupons"], [])
        self.assertIn("first-time", r["rejected_coupons"][0]["reason"])

    def test_pending_order_does_not_end_first_time_status_but_coupon_cannot_be_reused(self):
        welcome = self.coupon("WELCOME", is_first_time_auto=True, discount_type="PERCENT", discount_value=D("10"))
        user = self.customer()
        c = customer_client(user)
        first = self.quote(self.items(), client=c).json()
        self.assertEqual(len(first["coupons"]), 1)
        order = make_order(self.a, [(self.dosa, 2)], number="P1", status="PENDING", customer=user)
        coupon_services.redeem(order, [coupon_services.AppliedCoupon(welcome, D("20.00"), True)])
        second = self.quote(self.items(), client=c).json()
        self.assertTrue(second["is_first_time_customer"])  # nothing completed yet
        self.assertEqual(second["coupons"], [])  # but the one-time coupon is spent
        order.status = "CANCELLED"
        order.save()
        self.assertEqual(len(self.quote(self.items(), client=c).json()["coupons"]), 1)  # cancelled -> available again

    def test_rejection_reasons(self):
        self.coupon("OLD", valid_to=NOW - timedelta(hours=1), valid_from=NOW - timedelta(days=2))
        self.coupon("LATER", valid_from=NOW + timedelta(days=1), valid_to=NOW + timedelta(days=3))
        self.coupon("OFF", is_active=False)
        self.coupon("BIG", min_order_value=D("1000"))
        Coupon.objects.create(branch=self.b, code="OTHER", discount_type="FLAT", discount_value=5,
                              valid_from=NOW - timedelta(days=1), valid_to=NOW + timedelta(days=1))
        expect = {"OLD": "expired", "LATER": "not valid yet", "OFF": "not active", "BIG": "Add items worth",
                  "OTHER": "Invalid coupon code", "NOPE": "Invalid coupon code"}
        for code, text in expect.items():
            r = self.quote(self.items(), codes=[code]).json()
            self.assertEqual(r["coupons"], [], code)
            self.assertIn(text, r["rejected_coupons"][0]["reason"], code)

    def test_usage_limit_counts_only_non_cancelled_redemptions(self):
        limited = self.coupon("ONCE", usage_limit=1)
        o1 = make_order(self.a, [(self.dosa, 1)], number="U1", status="PENDING")
        coupon_services.redeem(o1, [coupon_services.AppliedCoupon(limited, D("30"))])
        self.assertIn("usage limit", self.quote(self.items(), codes=["ONCE"]).json()["rejected_coupons"][0]["reason"])
        o1.status = "CANCELLED"
        o1.save()
        self.assertEqual(len(self.quote(self.items(), codes=["ONCE"]).json()["coupons"]), 1)

    def test_redeem_enforces_limit_and_is_idempotent(self):
        limited = self.coupon("ONE", usage_limit=1)
        o1 = make_order(self.a, [(self.dosa, 1)], number="R1")
        o2 = make_order(self.a, [(self.dosa, 1)], number="R2")
        applied = [coupon_services.AppliedCoupon(limited, D("30"))]
        coupon_services.redeem(o1, applied)
        coupon_services.redeem(o1, applied)  # same order again: no duplicate
        self.assertEqual(CouponRedemption.objects.filter(coupon=limited).count(), 1)
        with self.assertRaises(coupon_services.CouponError):
            coupon_services.redeem(o2, applied)

    def test_percent_coupon_capped_and_flat_never_exceeds_amount(self):
        self.coupon("PCT", discount_type="PERCENT", discount_value=D("50"), max_discount=D("40"))
        self.assertEqual(self.quote(self.items(), codes=["PCT"]).json()["coupon_discount_total"], "40.00")
        self.coupon("HUGE", discount_value=D("5000"), min_order_value=D("0"))
        b = self.quote(self.items(), codes=["HUGE"]).json()
        self.assertEqual((b["coupon_discount_total"], b["taxable_amount"], b["total_amount"]),
                         ("200.00", "0.00", "0.00"))  # never negative

    def test_minimum_is_checked_after_dish_discounts(self):
        DishDiscount.objects.create(food=self.dosa, discount_type="PERCENT", value=D("50"),
                                    valid_from=NOW - timedelta(days=1), valid_to=NOW + timedelta(days=1))
        self.coupon("MIN150", min_order_value=D("150"))
        b = self.quote(self.items(), codes=["MIN150"]).json()  # 200 -> 100 after dish discount < 150
        self.assertEqual(b["merchandise_total"], "100.00")
        self.assertEqual(b["coupons"], [])
        self.assertEqual(b["offer_progress"]["remaining_amount"], "50.00")

    def test_offer_progress_picks_nearest_and_disappears_when_unlocked(self):
        self.coupon("NEAR", min_order_value=D("300"))
        self.coupon("FAR", min_order_value=D("800"))
        b = self.quote(self.items()).json()
        self.assertEqual((b["offer_progress"]["coupon_code"], b["offer_progress"]["remaining_amount"]),
                         ("NEAR", "100.00"))
        b = self.quote([{"food": self.dosa.id, "quantity": 4}], codes=["NEAR"]).json()
        self.assertEqual(b["offer_progress"]["coupon_code"], "FAR")
        self.assertEqual(b["offer_progress"]["remaining_amount"], "400.00")
        b = self.quote([{"food": self.dosa.id, "quantity": 9}]).json()
        self.assertIsNone(b["offer_progress"])

    def test_offer_progress_ignores_offers_the_customer_cannot_get(self):
        self.coupon("WELCOME", is_first_time_auto=True, min_order_value=D("500"))
        returning = customer_client(self.customer(completed=True))
        self.assertIsNone(self.quote(self.items(), client=returning).json()["offer_progress"])
        self.assertIsNone(self.quote(self.items()).json()["offer_progress"])  # guest

    def test_staff_assisted_quote_uses_customer_phone_for_first_time_status(self):
        self.coupon("WELCOME", is_first_time_auto=True, discount_type="PERCENT", discount_value=D("10"))
        new = self.quote(self.items(), client=self.chef_a, customer_phone="9811111111").json()
        self.assertTrue(new["is_first_time_customer"])
        self.assertEqual(new["coupons"][0]["code"], "WELCOME")
        self.customer("+919822222222", completed=True)
        old = self.quote(self.items(), client=self.chef_a, customer_phone="9822222222").json()
        self.assertFalse(old["is_first_time_customer"])
        self.assertEqual(old["coupons"], [])
        # without a phone the order is anonymous takeaway: never first-time
        self.assertFalse(self.quote(self.items(), client=self.chef_a).json()["is_first_time_customer"])

    def test_customer_phone_is_ignored_for_guests_and_customers_and_blocked_cross_branch(self):
        self.coupon("WELCOME", is_first_time_auto=True)
        self.assertFalse(self.quote(self.items(), customer_phone="9811111111").json()["is_first_time_customer"])
        mine = customer_client(self.customer(completed=True))
        self.assertFalse(self.quote(self.items(), client=mine, customer_phone="9811111111")
                         .json()["is_first_time_customer"])  # still judged by their own history
        self.assertEqual(self.quote(self.items(), client=self.admin_b, customer_phone="9811111111").status_code, 404)
        self.assertEqual(self.quote(self.items(), client=self.chef_a, customer_phone="12").status_code, 400)
