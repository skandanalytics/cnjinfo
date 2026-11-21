"""Database console operations. Every entry point assumes the caller already authorized the request."""
import hashlib
import hmac
import logging
import os
from decimal import Decimal

from django.conf import settings
from django.contrib.auth.password_validation import validate_password
from django.core.cache import cache
from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import IntegrityError, connection, transaction
from django.db.models import Q
from django.db.models.deletion import ProtectedError
from django.utils import timezone

from apps.accounts.models import Employee, User
from apps.accounts.permissions import get_active_employee
from apps.carts.models import Cart
from apps.carts.services import purge_carts

from .registry import deletion_order, is_sensitive, model_for_key, model_key, permitted_models

logger = logging.getLogger(__name__)
ADMIN_ROLES = (Employee.Role.SUPER_ADMIN, Employee.Role.ADMIN)
RESET_PHRASE = "DELETE ALL APPLICATION DATA"
RESET_TTL = 300


class MaintenanceError(Exception):
    def __init__(self, detail, status=400):
        super().__init__(detail)
        self.detail = detail
        self.status = status


def setup_key_configured():
    return bool(os.environ.get("DB_SETUP_SECRET", "").strip())


def administrator_exists():
    if Employee.objects.filter(role__in=ADMIN_ROLES, status=Employee.Status.ACTIVE).exists():
        return True
    from apps.accounts.models import User
    superusers = User.objects.filter(is_superuser=True)
    if superusers.exists():
        for su in superusers:
            code = "ADMIN" if not Employee.objects.filter(employee_code__iexact="ADMIN").exists() else f"ADMIN_{su.id}"
            Employee.objects.get_or_create(
                user=su,
                defaults={
                    "employee_code": code,
                    "role": Employee.Role.SUPER_ADMIN,
                    "status": Employee.Status.ACTIVE,
                },
            )
        return Employee.objects.filter(role__in=ADMIN_ROLES, status=Employee.Status.ACTIVE).exists()
    return False


def setup_status():
    required = not administrator_exists()
    unrestricted = getattr(settings, "ALLOW_UNRESTRICTED_ADMIN_CREATION", True)
    secret = setup_key_configured()
    return {
        "setup_required": required,
        "setup_enabled": required,
        "setup_key_required": bool(required and secret and not unrestricted),
        "recovery_available": True,
        "recovery_key_required": False if unrestricted else bool((not required) and secret),
    }


def _usable_superadmins():
    return Employee.objects.filter(
        role=Employee.Role.SUPER_ADMIN, status=Employee.Status.ACTIVE, user__is_active=True,
    )


def _clean_code(value):
    code = str(value or "").strip().upper()
    if not 3 <= len(code) <= 50 or not all(ch.isalnum() or ch in "-_" for ch in code):
        raise MaintenanceError("Admin ID must be 3 to 50 letters, numbers, hyphens, or underscores.")
    return code


def _clean_phone(value):
    phone = "".join(ch for ch in str(value or "") if ch.isdigit())
    if not 10 <= len(phone) <= 15:
        raise MaintenanceError("Enter a valid phone number.")
    return phone


def _validate_new_password(password, confirm, user=None):
    if password != confirm:
        raise MaintenanceError("Password and confirmation do not match.")
    try:
        validate_password(password, user)
    except DjangoValidationError as exc:
        raise MaintenanceError(" ".join(exc.messages))


def _provision_administrator(payload, role=Employee.Role.SUPER_ADMIN, allow_update=False):
    code = _clean_code(payload.get("employee_code"))
    name = str(payload.get("name") or "").strip()
    if not 2 <= len(name) <= 255:
        raise MaintenanceError("Enter the administrator's full name.")
    phone = _clean_phone(payload.get("phone"))
    email = str(payload.get("email") or "").strip() or None
    password = payload.get("password") or ""
    _validate_new_password(password, payload.get("confirm_password") or "")
    if role not in ADMIN_ROLES:
        raise MaintenanceError("Choose an administrator role.")
    with transaction.atomic():
        existing_emp = Employee.objects.select_for_update().select_related("user").filter(
            Q(employee_code__iexact=code) | Q(user__phone=phone) | (Q(user__email__iexact=email) if email else Q())
        ).first()

        if existing_emp and allow_update:
            user = existing_emp.user
            user.name = name or user.name
            if email:
                user.email = email
            user.is_active = True
            user.set_password(password)
            user.save()
            existing_emp.role = role
            existing_emp.status = Employee.Status.ACTIVE
            existing_emp.job_title = "Owner" if role == Employee.Role.SUPER_ADMIN else "Manager"
            existing_emp.save()
            from apps.accounts.services import clear_failures
            clear_failures(existing_emp.employee_code)
            return {"id": existing_emp.id, "employee_code": existing_emp.employee_code, "name": user.name, "role": existing_emp.role, "detail": "Password updated."}

        if User.objects.filter(phone=phone).exists():
            raise MaintenanceError("That phone number is already in use.")
        if email and User.objects.filter(email__iexact=email).exists():
            raise MaintenanceError("That email address is already in use.")
        if Employee.objects.filter(employee_code=code).exists():
            raise MaintenanceError("That admin ID is already in use.")
        user = User(name=name, phone=phone, email=email, user_type=User.UserType.EMPLOYEE,
                    is_active=True, is_staff=role == Employee.Role.SUPER_ADMIN,
                    is_superuser=role == Employee.Role.SUPER_ADMIN)
        user.set_password(password)
        user.save()
        emp = Employee.objects.create(
            user=user, employee_code=code, role=role,
            department="Administration",
            job_title="Owner" if role == Employee.Role.SUPER_ADMIN else "Manager",
            status=Employee.Status.ACTIVE,
        )
    return {"id": emp.id, "employee_code": code, "name": name, "role": role}


def create_first_administrator(payload):
    if administrator_exists():
        raise MaintenanceError("An administrator already exists. Sign in to continue.", 409)
    expected = os.environ.get("DB_SETUP_SECRET", "").strip()
    if expected:
        provided = str(payload.get("setup_key") or "")
        if not provided or not hmac.compare_digest(expected, provided):
            raise MaintenanceError("Setup could not be authorized.", 403)
    if not cache.add("foodie-db-setup-lock", "1", timeout=30):
        raise MaintenanceError("Initial setup is already in progress.", 409)
    try:
        with transaction.atomic():
            if Employee.objects.select_for_update().filter(role__in=ADMIN_ROLES).exists():
                raise MaintenanceError("An administrator already exists. Sign in to continue.", 409)
            return _provision_administrator(payload, role=Employee.Role.SUPER_ADMIN)
    finally:
        cache.delete("foodie-db-setup-lock")


def recover_administrator(payload, bypass_secret=False):
    """Create an additional administrator or recover access without requiring an existing login.

    Existing administrator accounts are updated/recovered if already present.
    """
    expected = os.environ.get("DB_SETUP_SECRET", "").strip()
    unrestricted = getattr(settings, "ALLOW_UNRESTRICTED_ADMIN_CREATION", True)
    if expected and not bypass_secret:
        provided = str(payload.get("setup_key") or "")
        if not provided or not hmac.compare_digest(expected, provided):
            logger.warning("Administrator recovery failed: unauthorized attempt")
            raise MaintenanceError("Recovery could not be authorized.", 403)
    elif not (bypass_secret or unrestricted):
        raise MaintenanceError(
            "Administrator recovery is not enabled. Sign in as an existing administrator, or set the server setup key.",
            403,
        )

    if not cache.add("foodie-db-recover-lock", "1", timeout=30):
        raise MaintenanceError("Administrator recovery is already in progress.", 409)
    try:
        role = payload.get("role") or Employee.Role.ADMIN
        if role not in ADMIN_ROLES:
            raise MaintenanceError("Choose an administrator role.")
        res = _provision_administrator(payload, role=role, allow_update=True)
        logger.info("Administrator %s recovered/created successfully with role %s", res["employee_code"], role)
        return res
    finally:
        cache.delete("foodie-db-recover-lock")


def overview(employee):
    try:
        connection.ensure_connection()
        connected = connection.is_usable()
    except Exception:
        connected = False
    tables = []
    total = 0
    for model in permitted_models():
        count = model.objects.count()
        total += count
        tables.append({
            "key": model_key(model),
            "label": model.__name__,
            "db_table": model._meta.db_table,
            "count": count,
            "can_delete": True,
        })
    return {
        "database_name": connection.settings_dict.get("NAME") or "",
        "connection_status": "connected" if connected else "unavailable",
        "table_count": len(tables),
        "record_count": total,
        "tables": tables,
        "access": {
            "employee_code": employee.employee_code,
            "name": employee.user.name,
            "role": employee.role,
            "can_manage_administrators": employee.role in ADMIN_ROLES,
            "can_create_owner": employee.role == Employee.Role.SUPER_ADMIN,
        },
    }


def _columns(model):
    columns = [{"key": "id", "label": "ID"}]
    for field in model._meta.concrete_fields:
        if field.primary_key:
            continue
        columns.append({
            "key": field.name,
            "label": str(field.verbose_name),
            "sortable": not is_sensitive(field.name),
        })
    return columns


def _cell(obj, field):
    if is_sensitive(field.name):
        raw = getattr(obj, field.attname, None)
        return "••••••" if raw else None
    if field.is_relation:
        pk = getattr(obj, field.attname)
        if pk is None:
            return None
        related = getattr(obj, field.name, None)
        label = str(related)[:80] if related is not None else str(pk)
        return f"{label} (#{pk})"
    value = getattr(obj, field.attname)
    if value is None:
        return None
    if hasattr(value, "isoformat"):
        return value.isoformat()
    if isinstance(value, Decimal):
        return str(value)
    if isinstance(value, (dict, list)):
        import json
        return json.dumps(value, default=str)[:400]
    if isinstance(value, bool):
        return value
    if isinstance(value, (int, float, str)):
        return value
    return str(value)[:400]


def list_records(key, page, page_size, search, ordering):
    model = model_for_key(key)
    if model is None:
        raise MaintenanceError("That table is not available.", 404)
    try:
        page = max(1, int(page or 1))
        page_size = min(50, max(1, int(page_size or 25)))
    except (TypeError, ValueError):
        raise MaintenanceError("Page values are invalid.")
    qs = model.objects.all()
    term = str(search or "").strip()
    if term:
        query = Q()
        for field in model._meta.concrete_fields:
            if is_sensitive(field.name) or field.is_relation:
                continue
            if field.get_internal_type() in {"CharField", "TextField", "EmailField", "SlugField"}:
                query |= Q(**{f"{field.name}__icontains": term})
        if term.isdigit():
            query |= Q(pk=int(term))
        if query:
            qs = qs.filter(query)
        else:
            qs = qs.none()
    order_field = str(ordering or "-id").strip()
    direction = "-" if order_field.startswith("-") else ""
    name = order_field[1:] if direction else order_field
    allowed = {field.name for field in model._meta.concrete_fields if not is_sensitive(field.name)}
    allowed.add("id")
    if name not in allowed:
        raise MaintenanceError("That sort field is not available.")
    qs = qs.order_by(f"{direction}{name}", "pk")
    count = qs.count()
    start = (page - 1) * page_size
    rows = []
    for obj in qs[start:start + page_size]:
        row = {"id": obj.pk}
        for field in model._meta.concrete_fields:
            if field.primary_key:
                continue
            row[field.name] = _cell(obj, field)
        rows.append(row)
    pages = max(1, (count + page_size - 1) // page_size)
    return {
        "table": model_key(model),
        "label": model.__name__,
        "db_table": model._meta.db_table,
        "count": count,
        "page": page,
        "page_size": page_size,
        "pages": pages,
        "columns": _columns(model),
        "results": rows,
    }


def _is_last_superadmin(obj):
    supers = list(_usable_superadmins()[:2])
    if len(supers) != 1:
        return False
    only = supers[0]
    if isinstance(obj, Employee) and obj.pk == only.pk:
        return True
    if isinstance(obj, User) and obj.pk == only.user_id:
        return True
    return False


def _is_protected_admin(obj):
    if isinstance(obj, Employee):
        return (
            obj.role == Employee.Role.SUPER_ADMIN
            or str(obj.employee_code).upper() == "SKAND"
            or getattr(obj.user, "is_superuser", False)
        )
    if isinstance(obj, User):
        return (
            obj.is_superuser
            or (hasattr(obj, "employee") and (
                obj.employee.role == Employee.Role.SUPER_ADMIN
                or str(obj.employee.employee_code).upper() == "SKAND"
            ))
        )
    return False


def delete_records(key, ids):
    model = model_for_key(key)
    if model is None:
        raise MaintenanceError("That table is not available.", 404)
    if not isinstance(ids, list) or not ids:
        raise MaintenanceError("Select at least one record.")
    if len(ids) > 100:
        raise MaintenanceError("Delete at most 100 records at a time.")
    cleaned = []
    for raw in ids:
        try:
            cleaned.append(int(raw))
        except (TypeError, ValueError):
            raise MaintenanceError("Record ids must be numbers.")
    deleted, blocked = [], []
    for pk in cleaned:
        obj = model.objects.filter(pk=pk).first()
        if obj is None:
            blocked.append({"id": pk, "detail": "Record was not found."})
            continue
        if _is_last_superadmin(obj) or _is_protected_admin(obj):
            blocked.append({"id": pk, "detail": "Protected Super Admin and SKAND Owner accounts cannot be deleted here."})
            continue
        try:
            with transaction.atomic():
                if isinstance(obj, User):
                    purge_carts(Cart.objects.filter(user=obj))
                obj.delete()
            deleted.append(pk)
        except ProtectedError:
            blocked.append({
                "id": pk,
                "detail": "This record is still referenced by other records. Remove those dependent records first.",
            })
        except IntegrityError:
            blocked.append({
                "id": pk,
                "detail": "The database rejected this deletion because of a related record or constraint.",
            })
    return {"deleted": deleted, "blocked": blocked}


def _reset_cache_key(user_id):
    return f"foodie-db-reset:{user_id}"


def authorize_reset(user, password):
    emp = get_active_employee(user)
    if not (getattr(user, "is_superuser", False) or (emp and emp.role == Employee.Role.SUPER_ADMIN)):
        raise MaintenanceError("Only the Super Admin Owner can authorize a database reset.", 403)
    if not user.check_password(password or ""):
        raise MaintenanceError("Password was not accepted.", 401)
    raw = os.urandom(24).hex()
    digest = hashlib.sha256(raw.encode()).hexdigest()
    cache.set(_reset_cache_key(user.id), digest, timeout=RESET_TTL)
    return {"reset_token": raw, "expires_in": RESET_TTL}


def _protected_detail(exc):
    names = []
    for obj in list(getattr(exc, "protected_objects", []))[:5]:
        label = str(obj._meta.verbose_name)
        if label not in names:
            names.append(label)
    if names:
        return "The reset was rolled back because these related records still block deletion: " + ", ".join(names) + "."
    return "The reset was rolled back because related records still block deletion."


def reset_application_data(user, password, confirmation, token):
    if str(confirmation or "") != RESET_PHRASE:
        raise MaintenanceError("Type the confirmation phrase exactly.")
    if not user.check_password(password or ""):
        raise MaintenanceError("Password was not accepted.", 401)
    emp = get_active_employee(user)
    if not (getattr(user, "is_superuser", False) or (emp and emp.role == Employee.Role.SUPER_ADMIN)):
        raise MaintenanceError("Only the Super Admin Owner can reset application data.", 403)
    expected = cache.get(_reset_cache_key(user.id))
    provided = hashlib.sha256(str(token or "").encode()).hexdigest()
    if not expected or not hmac.compare_digest(str(expected), provided):
        raise MaintenanceError("Reset authorization is missing or expired.", 403)
    try:
        ordered = deletion_order()
    except ValueError as exc:
        raise MaintenanceError(str(exc))
    cache.delete(_reset_cache_key(user.id))
    removed = {}
    try:
        with transaction.atomic():
            removed["carts.Cart"] = purge_carts(Cart.objects.all())
            for model in ordered:
                label = model_key(model)
                if label == "accounts.Employee":
                    # Clear branch association from protected employees so Branch can be safely deleted
                    primary_emp = get_active_employee(user)
                    primary_emp_id = primary_emp.id if primary_emp else None

                    Employee.objects.filter(
                        Q(pk=primary_emp_id) |
                        Q(role=Employee.Role.SUPER_ADMIN, employee_code__iexact="ADMIN") |
                        Q(employee_code__iexact="SKAND")
                    ).filter(branch__isnull=False).update(branch=None)

                    # Delete only non-primary staff (managers, admins, employees)
                    to_delete = Employee.objects.exclude(
                        Q(pk=primary_emp_id) |
                        Q(role=Employee.Role.SUPER_ADMIN, employee_code__iexact="ADMIN") |
                        Q(employee_code__iexact="SKAND")
                    )
                    count, _ = to_delete.delete()
                    removed[label] = count
                elif label == "accounts.User":
                    # Delete non-primary users (customers, staff, secondary admins)
                    to_delete = User.objects.exclude(
                        Q(pk=user.pk) |
                        Q(employee__role=Employee.Role.SUPER_ADMIN, employee__employee_code__iexact="ADMIN") |
                        Q(employee__employee_code__iexact="SKAND")
                    )
                    count, _ = to_delete.delete()
                    removed[label] = count
                elif label == "carts.Cart":
                    count, _ = model.objects.all().delete()
                    removed[label] += count
                else:
                    count, _ = model.objects.all().delete()
                    removed[label] = count
            try:
                from rest_framework_simplejwt.token_blacklist.models import BlacklistedToken, OutstandingToken
            except ImportError:
                BlacklistedToken = None
            if BlacklistedToken is not None:
                BlacklistedToken.objects.all().delete()
                OutstandingToken.objects.all().delete()
    except ProtectedError as exc:
        logger.exception("Application reset hit a protected relation")
        raise MaintenanceError(_protected_detail(exc))
    except IntegrityError:
        logger.exception("Application reset hit an integrity error")
        raise MaintenanceError("The reset was rolled back because related records could not be removed together.")
    except MaintenanceError:
        raise
    except Exception:
        logger.exception("Application reset failed")
        raise MaintenanceError("The reset could not be completed. Application data was not removed.", 500)
    status = setup_status()
    return {
        "reset": True,
        "at": timezone.now().isoformat(),
        "removed": removed,
        "setup_required": status["setup_required"],
        "setup_enabled": status["setup_enabled"],
    }


def administrator_rows():
    rows = []
    for emp in Employee.objects.select_related("user").filter(role__in=ADMIN_ROLES).order_by("employee_code"):
        rows.append({
            "id": emp.id,
            "employee_code": emp.employee_code,
            "name": emp.user.name,
            "phone": emp.user.phone,
            "email": emp.user.email or "",
            "role": emp.role,
            "status": emp.status,
            "is_active": emp.user.is_active,
        })
    return rows


def create_administrator(actor, payload):
    if actor.role not in ADMIN_ROLES:
        raise MaintenanceError("Only an administrator can create administrator accounts.", 403)
    code = _clean_code(payload.get("employee_code"))
    name = str(payload.get("name") or "").strip()
    if not 2 <= len(name) <= 255:
        raise MaintenanceError("Enter the administrator's full name.")
    phone = _clean_phone(payload.get("phone"))
    email = str(payload.get("email") or "").strip() or None
    role = payload.get("role") or Employee.Role.ADMIN
    if role not in ADMIN_ROLES:
        raise MaintenanceError("Choose an administrator role.")
    if actor.role != Employee.Role.SUPER_ADMIN and role == Employee.Role.SUPER_ADMIN:
        raise MaintenanceError("Only an Owner can create another Owner account.", 403)
    password = payload.get("password") or ""
    _validate_new_password(password, payload.get("confirm_password") or "")
    with transaction.atomic():
        if User.objects.filter(phone=phone).exists():
            raise MaintenanceError("That phone number is already in use.")
        if email and User.objects.filter(email__iexact=email).exists():
            raise MaintenanceError("That email address is already in use.")
        if Employee.objects.filter(employee_code=code).exists():
            raise MaintenanceError("That admin ID is already in use.")
        user = User(name=name, phone=phone, email=email, user_type=User.UserType.EMPLOYEE, is_active=True,
                    is_staff=role == Employee.Role.SUPER_ADMIN, is_superuser=role == Employee.Role.SUPER_ADMIN)
        user.set_password(password)
        user.save()
        emp = Employee.objects.create(
            user=user, employee_code=code, role=role, department="Administration",
            job_title="Owner" if role == Employee.Role.SUPER_ADMIN else "Manager",
            status=Employee.Status.ACTIVE,
        )
    return {"id": emp.id, "employee_code": emp.employee_code, "role": emp.role, "name": emp.user.name}


def update_administrator(actor, pk, payload):
    if actor.role != Employee.Role.SUPER_ADMIN:
        raise MaintenanceError("Only a super administrator can edit administrators.", 403)
    emp = Employee.objects.select_related("user").filter(pk=pk, role__in=ADMIN_ROLES).first()
    if emp is None:
        raise MaintenanceError("Administrator was not found.", 404)
    name = str(payload.get("name", emp.user.name) or "").strip()
    if not 2 <= len(name) <= 255:
        raise MaintenanceError("Enter the administrator's full name.")
    phone = _clean_phone(payload.get("phone", emp.user.phone))
    email = payload.get("email", emp.user.email)
    email = str(email or "").strip() or None
    role = payload.get("role", emp.role)
    status = payload.get("status", emp.status)
    if role not in ADMIN_ROLES:
        raise MaintenanceError("Choose an administrator role.")
    if status not in Employee.Status.values:
        raise MaintenanceError("Choose a valid account status.")
    if emp.role == Employee.Role.SUPER_ADMIN and (role != Employee.Role.SUPER_ADMIN or status != Employee.Status.ACTIVE):
        others = _usable_superadmins().exclude(pk=emp.pk).exists()
        if not others:
            raise MaintenanceError("The last active super administrator cannot be deactivated or demoted.")
    with transaction.atomic():
        if User.objects.filter(phone=phone).exclude(pk=emp.user_id).exists():
            raise MaintenanceError("That phone number is already in use.")
        if email and User.objects.filter(email__iexact=email).exclude(pk=emp.user_id).exists():
            raise MaintenanceError("That email address is already in use.")
        emp.user.name = name
        emp.user.phone = phone
        emp.user.email = email
        emp.user.is_active = status == Employee.Status.ACTIVE
        emp.user.save(update_fields=["name", "phone", "email", "is_active", "updated_at"])
        emp.role = role
        emp.status = status
        emp.save(update_fields=["role", "status", "updated_at"])
    return {"id": emp.id}


def change_administrator_password(actor, pk, payload):
    if actor.role != Employee.Role.SUPER_ADMIN:
        raise MaintenanceError("Only a super administrator can change administrator passwords.", 403)
    if not actor.user.check_password(payload.get("current_password") or ""):
        raise MaintenanceError("Your current password was not accepted.", 401)
    emp = Employee.objects.select_related("user").filter(pk=pk, role__in=ADMIN_ROLES).first()
    if emp is None:
        raise MaintenanceError("Administrator was not found.", 404)
    password = payload.get("new_password") or ""
    _validate_new_password(password, payload.get("confirm_password") or "", emp.user)
    emp.user.set_password(password)
    emp.user.save(update_fields=["password", "updated_at"])
    return {"id": emp.id}
