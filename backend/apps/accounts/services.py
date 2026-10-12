from django.conf import settings
from django.core.cache import cache
from django.db import transaction
from django.utils import timezone
from rest_framework_simplejwt.token_blacklist.models import BlacklistedToken, OutstandingToken
from rest_framework_simplejwt.tokens import RefreshToken

from apps.audit.models import AuditLog


def issue_tokens(user):
    refresh = RefreshToken.for_user(user)
    refresh["user_type"] = user.user_type  # convenience for clients only; the server never trusts it
    return {"access": str(refresh.access_token), "refresh": str(refresh)}


def revoke_user_tokens(user):
    """Blacklist every outstanding refresh token (password change, deactivation). Access tokens expire in 30 min."""
    for token in OutstandingToken.objects.filter(user=user):
        BlacklistedToken.objects.get_or_create(token=token)


def delete_employee(emp):
    """Remove an employee profile and its login. Orders keep the staff name snapshot; the user row is deleted
    unless it is still referenced as a customer, in which case it is disabled instead."""
    from django.db.models import ProtectedError

    from apps.orders.models import Order

    from apps.carts.models import Cart
    from apps.carts.services import purge_carts

    user = emp.user
    revoke_user_tokens(user)
    for order in Order.objects.filter(placed_by=user, placed_by_name=""):
        order.placed_by_name = user.name or user.phone
        order.save(update_fields=["placed_by_name"])
    # Delete this user's carts before the user row. Django CASCADE on a nullable FK first
    # sets user_id = NULL, which violates ck_cart_has_owner on staff/customer carts.
    purge_carts(Cart.objects.filter(user=user))
    emp.delete()
    try:
        with transaction.atomic():
            user.delete()
        return "deleted"
    except ProtectedError:
        user.is_active = False
        user.set_unusable_password()
        user.save(update_fields=["is_active", "password"])
        return "disabled"


def record_audit(actor, action, entity_type, entity_id="", branch=None, changes=None, ip=None):
    AuditLog.objects.create(actor=actor if getattr(actor, "pk", None) else None, action=action,
                            entity_type=entity_type, entity_id=str(entity_id), branch=branch,
                            changes=changes or {}, ip_address=ip)


def client_ip(request):
    return request.META.get("REMOTE_ADDR")


# --- staff login lockout (cache based; production needs a shared cache such as Redis) ---
def _fail_key(code):
    return f"staff-login-fail:{code}"


def is_locked(code):
    return cache.get(_fail_key(code), 0) >= settings.STAFF_LOGIN_MAX_FAILURES


def register_failure(code):
    key = _fail_key(code)
    cache.add(key, 0, timeout=settings.STAFF_LOGIN_LOCK_SECONDS)
    try:
        cache.incr(key)
    except ValueError:
        cache.set(key, 1, timeout=settings.STAFF_LOGIN_LOCK_SECONDS)


def clear_failures(code):
    cache.delete(_fail_key(code))


def mark_login(user):
    user.last_login = timezone.now()
    user.save(update_fields=["last_login"])
