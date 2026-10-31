import io
from decimal import Decimal

from django.db import transaction
from django.utils import timezone
from PIL import Image

from apps.accounts.models import Employee
from apps.audit.models import AuditLog
from apps.accounts.permissions import get_active_employee
from apps.accounts.services import delete_employee, record_audit
from apps.billing.models import Invoice
from apps.carts.models import Cart
from apps.carts.services import purge_carts
from apps.coupons.models import Coupon
from apps.inventory.models import InventoryItem, StockTransaction
from apps.menu.models import Category, Food
from apps.menu.services import delete_foods
from apps.orders.models import Order, OrderItem

from .models import Branch, DiningTable, TableView


class BranchDeleteError(Exception):
    def __init__(self, detail, code="cannot_delete", status_code=409, http_status=None):
        super().__init__(detail)
        self.detail = detail
        self.code = code
        self.status_code = http_status or status_code
        self.http_status = self.status_code


def _freeze_invoices(branch):
    """Invoice model links to Order, not directly to Branch.
    Historical orders have their branch/table/dish details preserved in _detach_history
    and Invoice.snapshot contains the immutable frozen bill."""
    pass

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
        raise BranchDeleteError("This branch has orders still in progress. Please complete or cancel them before deleting the branch.", "active_orders", 409)

    # Do not automatically assign another branch as the main branch after deletion unless explicitly requested.
    replacement = None
    if replacement_id:
        replacement = (Branch.objects.select_for_update()
                       .filter(pk=replacement_id).exclude(pk=branch.pk).first())

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
