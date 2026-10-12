"""Branch deletion.

Policy (all in one transaction, rolled back on any failure):
- Refused while the branch has unfinished orders.
- If the deleted branch is primary and other branches remain, the oldest remaining active branch
  becomes primary (an optional replacement id may be supplied; it is never required).
- If this is the last branch, the application is left with no primary branch until a new one is created.
- Removed: the branch's employees (and their logins), coupons, carts, dishes (with images, options, discounts
  and stock rows), categories, table views and tables. Every one of these belongs to exactly one branch.
- Kept: orders, order items, payments, invoices, coupon redemptions, the stock ledger and the audit log. Their
  branch/table/dish/coupon/staff links are cleared and the stored snapshots (names, labels, totals) remain.
  Completed orders without an invoice get one first, so the bill still shows the branch details.

MySQL stores every FK as NO ACTION, so Django SET_NULL/CASCADE is applied in Python, in dependency order.
Staff carts are deleted before their owner users: Django would otherwise SET user_id = NULL on a nullable
CASCADE and violate ck_cart_has_owner.
"""
from django.db import transaction

from apps.accounts.models import Employee
from apps.accounts.permissions import get_active_employee
from apps.accounts.services import delete_employee, record_audit
from apps.audit.models import AuditLog
from apps.carts.models import Cart
from apps.carts.services import purge_carts
from apps.coupons.models import Coupon, CouponRedemption
from apps.inventory.models import InventoryItem, StockTransaction
from apps.menu.models import Category, Food
from apps.menu.services import delete_foods
from apps.orders.models import Order, OrderItem

from .models import Branch, DiningTable, TableView


class BranchDeleteError(Exception):
    def __init__(self, detail, code, status=409):
        super().__init__(detail)
        self.detail, self.code, self.http_status = detail, code, status


def _freeze_invoices(branch):
    from apps.billing.models import Invoice
    from apps.billing.services import breakdown

    for order in Order.objects.filter(branch=branch, status=Order.Status.COMPLETED, invoice__isnull=True):
        snap = breakdown(order)
        snap["final"] = True
        snap["invoice_number"] = f"INV-{order.order_number}"
        Invoice.objects.create(order=order, invoice_number=snap["invoice_number"], snapshot=snap)


def _fallback_primary(excluded_id, preferred_id=None):
    """Pick a surviving primary branch without requiring the client to name one."""
    if preferred_id:
        chosen = (Branch.objects.select_for_update()
                  .filter(pk=preferred_id).exclude(pk=excluded_id).first())
        if chosen:
            return chosen
    return (Branch.objects.select_for_update()
            .exclude(pk=excluded_id)
            .order_by("-is_active", "id")
            .first())


def _detach_history(branch):
    """Clear FKs on retained rows. MySQL FKs are NO ACTION, so the parent cannot be deleted otherwise."""
    Order.objects.filter(branch=branch, branch_name="").update(branch_name=branch.name)
    Order.objects.filter(branch=branch).update(branch=None)

    tables = DiningTable.objects.filter(branch=branch)
    for order in Order.objects.filter(table__in=tables, table_label="").select_related("table"):
        order.table_label = order.table.table_number
        order.save(update_fields=["table_label"])
    Order.objects.filter(table__in=tables).update(table=None)

    foods = Food.objects.filter(branch=branch)
    for item in OrderItem.objects.filter(food__in=foods, food_name="").select_related("food"):
        item.food_name = item.food.name
        item.save(update_fields=["food_name"])
    OrderItem.objects.filter(food__in=foods).update(food=None)

    coupons = Coupon.objects.filter(branch=branch)
    for redemption in CouponRedemption.objects.filter(coupon__in=coupons, coupon_code="").select_related("coupon"):
        redemption.coupon_code = redemption.coupon.code
        redemption.save(update_fields=["coupon_code"])
    CouponRedemption.objects.filter(coupon__in=coupons).update(coupon=None)

    items = InventoryItem.objects.filter(branch=branch)
    for tx in StockTransaction.objects.filter(item__in=items, food_name="").select_related("item", "item__food"):
        if tx.item_id and tx.item.food_id:
            tx.food_name = tx.item.food.name
            tx.save(update_fields=["food_name"])
    StockTransaction.objects.filter(item__in=items).update(item=None)

    AuditLog.objects.filter(branch=branch).update(branch=None)
    return tables.count()


@transaction.atomic
def delete_branch(branch_id, actor, replacement_id=None, ip=None):
    actor_emp = get_active_employee(actor)
    if actor_emp is None or actor_emp.branch_id is not None:
        raise BranchDeleteError("Only an owner-level administrator can delete a branch.", "forbidden", 403)
    branch = Branch.objects.select_for_update().filter(pk=branch_id).first()
    if branch is None:
        raise BranchDeleteError("Branch not found.", "not_found", 404)
    if Order.objects.filter(branch=branch, status__in=Order.ACTIVE_STATUSES).exists():
        raise BranchDeleteError("This branch has orders that are still in progress. Complete or cancel them "
                                "before deleting the branch.", "active_orders")

    replacement = _fallback_primary(branch.pk, replacement_id) if branch.is_primary else None

    summary = {"branch": branch.name, "code": branch.code}
    _freeze_invoices(branch)

    # Carts first: deleting a staff user would SET carts.user_id = NULL and break ck_cart_has_owner.
    summary["carts"] = purge_carts(Cart.objects.filter(branch=branch))

    table_count = _detach_history(branch)

    employees = list(Employee.objects.select_related("user").filter(branch=branch))
    summary["employees"] = len(employees)
    for emp in employees:
        delete_employee(emp)

    summary["coupons"] = Coupon.objects.filter(branch=branch).count()
    Coupon.objects.filter(branch=branch).delete()

    summary["dishes"] = delete_foods(Food.objects.filter(branch=branch))
    InventoryItem.objects.filter(branch=branch).delete()

    categories = Category.objects.filter(branch=branch)
    summary["categories"] = categories.count()
    categories.update(parent=None)
    categories.delete()

    summary["tables"] = table_count
    DiningTable.objects.filter(branch=branch).delete()
    TableView.objects.filter(branch=branch).delete()

    if replacement is not None:
        branch.is_primary = False
        branch.save(update_fields=["is_primary", "updated_at"])
        replacement.is_primary = True
        fields = ["is_primary", "updated_at"]
        if not replacement.is_active:
            replacement.is_active = True
            fields.append("is_active")
        replacement.save(update_fields=fields)
        summary["new_primary"] = replacement.id

    branch.delete()
    record_audit(actor, "branch.delete", "Branch", branch_id, None, summary, ip)
    return summary
