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
    extra = {
        "order_id": order.id,
        "order_number": order.order_number,
        "status": order.status,
        "payment_status": order.payment_status,
        "resource": "order",
        "action": "updated",
    }
    extra_groups = [f"customer-{order.customer_id}"] if order.customer_id else None
    publish_branch_event(order.branch_id, "order.event", extra, extra_groups)


def publish_catalog_event(branch_id, resource, action="updated"):
    publish_branch_event(branch_id, "catalog.event", {"resource": resource, "action": action})
