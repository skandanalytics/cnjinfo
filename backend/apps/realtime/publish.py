"""Live events. Published only after the database transaction commits, so listeners never see a rolled-back change.
With DEBUG the channel layer is in-memory (one process). More than one server needs Redis.
"""
from asgiref.sync import async_to_sync
from channels.layers import get_channel_layer
from django.db import transaction


def _send(groups, payload):
    layer = get_channel_layer()
    if layer is None:
        return
    for name in groups:
        async_to_sync(layer.group_send)(name, payload)


def publish_branch_event(branch_id, type_name, extra=None, extra_groups=None):
    payload = {"type": type_name}
    if branch_id:
        payload["branch_id"] = branch_id
        groups = [f"branch-{branch_id}", "branch-all"]
    else:
        groups = ["branch-all"]
    if extra:
        payload.update(extra)
    if extra_groups:
        groups.extend(extra_groups)

    def send():
        _send(groups, payload)

    try:
        transaction.on_commit(send)
    except Exception:
        send()


def publish_order_event(order):
    table_label = ""
    try:
        if getattr(order, "table", None):
            table_label = getattr(order.table, "table_number", str(order.table))
        elif str(getattr(order, "order_type", "")).upper() == "TAKEAWAY":
            table_label = "Takeaway"
    except Exception:
        table_label = "N/A"
    total_val = float(getattr(order, "total_amount", 0) or 0)
    extra = {
        "order_id": order.id,
        "order_number": order.order_number,
        "table": table_label,
        "total_amount": total_val,
        "status": order.status,
        "payment_status": order.payment_status,
        "placed_by_id": order.placed_by_id,
        "resource": "order",
        "action": "created" if str(getattr(order, "status", "")).upper() in ["PENDING", "CONFIRMED", "PLACED", "NEW"] else "updated",
    }
    extra_groups = []
    if order.customer_id:
        extra_groups.append(f"customer-{order.customer_id}")
    if order.placed_by_id:
        extra_groups.append(f"employee-{order.placed_by_id}")
    publish_branch_event(order.branch_id, "order.event", extra, extra_groups if extra_groups else None)


def publish_catalog_event(branch_id, resource, action="updated"):
    publish_branch_event(branch_id, "catalog.event", {"resource": resource, "action": action})
