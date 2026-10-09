from urllib.parse import parse_qs

from channels.db import database_sync_to_async
from channels.generic.websocket import AsyncJsonWebsocketConsumer
from rest_framework_simplejwt.exceptions import TokenError
from rest_framework_simplejwt.tokens import AccessToken

from apps.accounts.models import User
from apps.accounts.permissions import get_active_employee


class OrderEventsConsumer(AsyncJsonWebsocketConsumer):
    """Staff join their branch group. Owner-level staff join every branch. Customers join only their own group."""

    async def connect(self):
        raw = parse_qs(self.scope.get("query_string", b"")).get(b"token", [b""])[0].decode()
        user = await self._user_from_token(raw)
        group = await self._group_for(user) if user else None
        if group is None:
            await self.close()
            return
        self.group = group
        await self.channel_layer.group_add(group, self.channel_name)
        await self.accept()

    async def disconnect(self, code):
        if getattr(self, "group", None):
            await self.channel_layer.group_discard(self.group, self.channel_name)

    async def order_event(self, event):
        await self.send_json({k: v for k, v in event.items() if k != "type"})

    @database_sync_to_async
    def _user_from_token(self, raw):
        if not raw:
            return None
        try:
            token = AccessToken(raw)
            return User.objects.get(pk=token["user_id"], is_active=True)
        except (TokenError, User.DoesNotExist, KeyError):
            return None

    @database_sync_to_async
    def _group_for(self, user):
        emp = get_active_employee(user)
        if emp:
            return "branch-all" if emp.branch_id is None else f"branch-{emp.branch_id}"
        if user.user_type == User.UserType.CUSTOMER:
            return f"customer-{user.id}"
        return None