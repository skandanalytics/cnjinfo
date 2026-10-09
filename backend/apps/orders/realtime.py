"""Live order events. Published only after the database transaction commits, so listeners never see a change
that was rolled back. With DEBUG the channel layer is in-memory (one process). More than one server needs Redis.
"""
from asgiref.sync import async_to_sync
from channels.layers import get_channel_layer
from django.db import transaction


def publish_order_event(order):
    payload = {"type": "order.event", "order_id": order.id, "order_number": order.order_number,
               "status": order.status, "branch_id": order.branch_id, "payment_status": order.payment_status}

    def _send():
        layer = get_channel_layer()
        if layer is None:
            return
        groups = [f"branch-{order.branch_id}", "branch-all"]
        if order.customer_id:
            groups.append(f"customer-{order.customer_id}")
        for name in groups:
            async_to_sync(layer.group_send)(name, payload)

    transaction.on_commit(_send)