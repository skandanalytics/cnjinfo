from rest_framework.permissions import SAFE_METHODS, BasePermission

from .models import Employee, User

# Admin-level roles may manage branch configuration, menu, coupons and employees (SRS 3.2). Other roles
# (CASHIER, CHEF, STAFF) get the employee interface only (SRS 3.3.1).
ADMIN_ROLES = {Employee.Role.SUPER_ADMIN, Employee.Role.ADMIN, Employee.Role.MANAGER}
ROLE_RANK = {Employee.Role.SUPER_ADMIN: 4, Employee.Role.ADMIN: 3, Employee.Role.MANAGER: 2,
             Employee.Role.CASHIER: 1, Employee.Role.CHEF: 1, Employee.Role.STAFF: 1}


def get_active_employee(user):
    """The user's Employee profile if they are an active staff member, else None. Always read from the database."""
    if not user or not user.is_authenticated or user.user_type != User.UserType.EMPLOYEE or not user.is_active:
        return None
    try:
        emp = user.employee
    except Employee.DoesNotExist:
        return None
    if emp.status != Employee.Status.ACTIVE:
        return None
    # Staff of a deactivated branch lose access until it is reactivated (decision Q1).
    if emp.branch_id is not None and not emp.branch.is_active:
        return None
    return emp


class IsCustomer(BasePermission):
    def has_permission(self, request, view):
        u = request.user
        return bool(u and u.is_authenticated and u.is_active and u.user_type == User.UserType.CUSTOMER)


class IsStaffMember(BasePermission):
    """Any active employee (cashier, chef, staff, manager, admin)."""

    def has_permission(self, request, view):
        return get_active_employee(request.user) is not None


class IsAdminLevel(BasePermission):
    def has_permission(self, request, view):
        emp = get_active_employee(request.user)
        return bool(emp and emp.role in ADMIN_ROLES)


class IsOwnerLevel(BasePermission):
    """Admin-level staff with no branch restriction (can create and deactivate branches)."""

    def has_permission(self, request, view):
        emp = get_active_employee(request.user)
        return bool(emp and emp.role in ADMIN_ROLES and emp.branch_id is None)


class StaffReadAdminWrite(BasePermission):
    """Any active staff may read; only admin-level staff may write (SRS 3.3.1: employees cannot manage menu etc.)."""

    def has_permission(self, request, view):
        if request.method in SAFE_METHODS:
            return get_active_employee(request.user) is not None
        return IsAdminLevel().has_permission(request, view)


class IsKitchenStaff(BasePermission):
    """Kitchen queue access: every active employee (SRS 3.3.2). Branch scoping is applied by the view."""

    def has_permission(self, request, view):
        return get_active_employee(request.user) is not None
