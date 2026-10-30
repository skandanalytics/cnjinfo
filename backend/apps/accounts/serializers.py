from django.contrib.auth.password_validation import validate_password
from django.db import transaction
from rest_framework import serializers

from apps.branches.models import Branch

from .models import Employee, User
from .permissions import ADMIN_ROLES, ROLE_RANK, get_active_employee
from .phone import normalize_phone
from .scoping import allowed_branch_id


class PhoneField(serializers.CharField):
    def to_internal_value(self, data):
        value = super().to_internal_value(data)
        try:
            return normalize_phone(value)
        except ValueError as exc:
            raise serializers.ValidationError(str(exc))


class SendOTPSerializer(serializers.Serializer):
    phone = PhoneField()


class VerifyOTPSerializer(serializers.Serializer):
    phone = PhoneField()
    otp = serializers.CharField(max_length=10)
    guest_token = serializers.CharField(max_length=200, required=False, allow_blank=True)  # merge guest cart


class StaffLoginSerializer(serializers.Serializer):
    employee_code = serializers.CharField(max_length=150)
    password = serializers.CharField(max_length=128, trim_whitespace=False)


class LogoutSerializer(serializers.Serializer):
    refresh = serializers.CharField()


def user_payload(user):
    """Identity and permissions as the server sees them. Clients must use this, never stored roles."""
    data = {"id": user.id, "name": user.name, "phone": user.phone, "email": user.email,
            "user_type": user.user_type, "employee": None}
    emp = get_active_employee(user)
    if emp:
        dept = "Management" if emp.role in (Employee.Role.SUPER_ADMIN, Employee.Role.ADMIN) else emp.department
        data["employee"] = {
            "employee_code": emp.employee_code, "role": emp.role, "department": dept,
            "job_title": emp.job_title, "is_admin_level": emp.role in ADMIN_ROLES,
            "branch": {"id": emp.branch_id, "name": emp.branch.name} if emp.branch_id else None,
        }
    return data


class EmployeeSerializer(serializers.ModelSerializer):
    name = serializers.CharField(source="user.name", max_length=255)
    phone = PhoneField(source="user.phone")
    email = serializers.EmailField(source="user.email", required=False, allow_null=True, allow_blank=True)
    password = serializers.CharField(write_only=True, required=False, trim_whitespace=False)
    branch_name = serializers.CharField(source="branch.name", read_only=True, default=None)
    user_id = serializers.IntegerField(read_only=True)

    class Meta:
        model = Employee
        fields = ["id", "user_id", "employee_code", "name", "phone", "email", "password", "branch", "branch_name", "role",
                  "department", "job_title", "bill_access", "status", "created_at"]
        read_only_fields = ["id", "employee_code", "created_at"]

    # --- validation -------------------------------------------------------------------------------------------
    def validate_password(self, value):
        validate_password(value)
        return value

    def validate_branch(self, branch):
        if branch is not None and not branch.is_active:
            raise serializers.ValidationError("Branch is inactive.")
        return branch

    def validate(self, attrs):
        request_user = self.context["request"].user
        actor = get_active_employee(request_user)
        inst = self.instance
        role = attrs.get("role", inst.role if inst else Employee.Role.STAFF)
        branch = attrs["branch"] if "branch" in attrs else (inst.branch if inst else None)
        allowed = allowed_branch_id(request_user)
        if inst is None and "branch" not in attrs and role not in (Employee.Role.SUPER_ADMIN, Employee.Role.ADMIN):
            if allowed is None and not Branch.objects.exists():
                raise serializers.ValidationError(
                    {"branch": "Create a branch first to manage tables, meals, categories, "
                               "employees, offers, and coupons."})
            branch = (Branch.objects.filter(pk=allowed).first() if allowed is not None
                      else Branch.objects.filter(is_primary=True).first())
            attrs["branch"] = branch

        # Privilege escalation: you can only grant roles below your own (SUPER_ADMIN may grant any).
        if actor.role != Employee.Role.SUPER_ADMIN and ROLE_RANK[role] >= ROLE_RANK[actor.role]:
            raise serializers.ValidationError({"role": "You cannot assign a role equal to or above your own."})
        if inst and actor.role != Employee.Role.SUPER_ADMIN and ROLE_RANK[inst.role] >= ROLE_RANK[actor.role]:
            raise serializers.ValidationError("You cannot modify an employee with an equal or higher role.")

        # Branch rules: only owner-level roles may be branchless; branch-limited admins stay in their branch.
        if branch is None and role not in (Employee.Role.SUPER_ADMIN, Employee.Role.ADMIN):
            raise serializers.ValidationError({"branch": "Branch is required for this role."})
        if allowed is not None and (branch is None or branch.id != allowed):
            raise serializers.ValidationError({"branch": "You can only manage employees of your own branch."})

        if inst is None and not attrs.get("password"):
            raise serializers.ValidationError({"password": "Password is required."})

        user_data = attrs.get("user", {})
        name = user_data.get("name")
        if name:
            if any(ch.isdigit() for ch in name):
                raise serializers.ValidationError({"name": "Employee name cannot contain numbers."})

        phone = user_data.get("phone")
        if phone:
            qs = User.objects.filter(phone=phone)
            if inst:
                qs = qs.exclude(pk=inst.user_id)
            if qs.exists():
                raise serializers.ValidationError({"phone": "This phone number is already registered."})
        email = user_data.get("email")
        if email:
            qs = User.objects.filter(email__iexact=email)
            if inst:
                qs = qs.exclude(pk=inst.user_id)
            if qs.exists():
                raise serializers.ValidationError({"email": "This email is already registered."})

        if inst and inst.user_id == request_user.id and attrs.get("status", inst.status) != Employee.Status.ACTIVE:
            raise serializers.ValidationError({"status": "You cannot deactivate your own account."})

        from .staff_catalog import validate_assignment
        if role in (Employee.Role.SUPER_ADMIN, Employee.Role.ADMIN):
            attrs["department"] = "Management"
        department = attrs.get("department", inst.department if inst else "")
        job_title = attrs.get("job_title", inst.job_title if inst else "")
        bill_access = attrs.get("bill_access", inst.bill_access if inst else "")
        if job_title and job_title.strip().lower() == "waiter":
            job_title = "Steward"
            attrs["job_title"] = job_title
        if role != Employee.Role.CASHIER:
            attrs["bill_access"] = ""
            bill_access = ""
        assignment_error = validate_assignment(department, role, job_title, bill_access)
        if assignment_error:
            raise serializers.ValidationError(assignment_error)
        return attrs

    # --- persistence ------------------------------------------------------------------------------------------
    @transaction.atomic
    def create(self, validated):
        user_data = validated.pop("user")
        password = validated.pop("password")
        user = User.objects.create_user(
            phone=user_data["phone"], password=password, name=user_data["name"],
            email=user_data.get("email") or None, user_type=User.UserType.EMPLOYEE)
        status = validated.get("status", Employee.Status.ACTIVE)
        user.is_active = status == Employee.Status.ACTIVE
        user.save(update_fields=["is_active"])
        emp = Employee.objects.create(user=user, employee_code=f"TMP{user.id}", **validated)
        emp.employee_code = f"EMP{user.id:04d}"
        emp.save(update_fields=["employee_code"])
        return emp

    @transaction.atomic
    def update(self, inst, validated):
        user_data = validated.pop("user", {})
        password = validated.pop("password", None)
        user = inst.user
        for field in ("name", "phone", "email"):
            if field in user_data:
                setattr(user, field, user_data[field] or None if field == "email" else user_data[field])
        if password:
            user.set_password(password)
        for field, value in validated.items():
            setattr(inst, field, value)
        user.is_active = inst.status == Employee.Status.ACTIVE
        user.save()
        inst.save()
        return inst
