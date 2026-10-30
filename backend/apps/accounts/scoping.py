"""Branch isolation helpers. Every staff-facing queryset must pass through scope_queryset()."""
from .permissions import get_active_employee


def allowed_branch_id(user):
    """None means 'all branches' (owner-level staff with no branch). Raises LookupError for non-staff."""
    if getattr(user, "is_superuser", False):
        return None
    emp = get_active_employee(user)
    if emp is None:
        raise LookupError("Not an active staff member")
    if emp.role == "SUPER_ADMIN":
        return None
    return emp.branch_id


def scope_queryset(qs, user, branch_field="branch"):
    try:
        branch_id = allowed_branch_id(user)
    except LookupError:
        return qs.none()
    if branch_id is None:
        return qs
    return qs.filter(**{f"{branch_field}_id": branch_id})


def can_access_branch(user, branch_id):
    try:
        allowed = allowed_branch_id(user)
    except LookupError:
        return False
    return allowed is None or allowed == branch_id


class BranchScopedMixin:
    """For DRF views: restricts get_queryset() to the staff member's branch."""

    branch_field = "branch"

    def get_queryset(self):
        return scope_queryset(super().get_queryset(), self.request.user, self.branch_field)
