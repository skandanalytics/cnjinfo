from urllib.parse import parse_qs

from channels.db import database_sync_to_async
from channels.generic.websocket import AsyncJsonWebsocketConsumer
from rest_framework_simplejwt.exceptions import TokenError
from rest_framework_simplejwt.tokens import AccessToken

from apps.accounts.models import User
from apps.accounts.permissions import ADMIN_ROLES, get_active_employee


class OrderEventsConsumer(AsyncJsonWebsocketConsumer):
    """Staff join their branch group and branch-all. Owner-level staff join every branch. Customers join only their own group."""

    async def connect(self):
        raw = parse_qs(self.scope.get("query_string", b"")).get(b"token", [b""])[0].decode()
        user = await self._user_from_token(raw)
        self.user = user
        groups = await self._groups_for(user) if user else []
        if not groups:
            await self.accept()
            await self.close(code=4401)
            return
        self.groups = groups
        for group in groups:
            await self.channel_layer.group_add(group, self.channel_name)
        await self.accept()

    async def disconnect(self, code):
        for group in getattr(self, "groups", []):
            try:
                await self.channel_layer.group_discard(group, self.channel_name)
            except Exception:
                pass

    async def order_event(self, event):
        user = getattr(self, "user", None)
        if user and not getattr(user, "is_superuser", False):
            emp = await self._get_emp(user)
            if emp and emp.role not in ADMIN_ROLES:
                placed_by = event.get("placed_by_id")
                if placed_by is not None and str(placed_by) != str(user.id):
                    return
        await self.send_json({k: v for k, v in event.items() if k != "type"})

    async def catalog_event(self, event):
        await self.send_json({k: v for k, v in event.items() if k != "type"})

    async def receive_json(self, content, **kwargs):
        msg_type = content.get("type") or content.get("action")
        if msg_type == "ping":
            await self.send_json({"type": "pong"})

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
    def _groups_for(self, user):
        emp = get_active_employee(user)
        if emp:
            groups = ["branch-all"]
            if emp.branch_id is not None:
                groups.append(f"branch-{emp.branch_id}")
            return groups
        if user.is_superuser or user.is_staff or getattr(user, "user_type", None) == User.UserType.EMPLOYEE:
            return ["branch-all"]
        if getattr(user, "user_type", None) == User.UserType.CUSTOMER:
            return [f"customer-{user.id}"]
        return []

    @database_sync_to_async
    def _get_emp(self, user):
        return get_active_employee(user)