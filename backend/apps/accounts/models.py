from django.conf import settings
from django.contrib.auth.models import AbstractBaseUser, BaseUserManager, PermissionsMixin
from django.db import models
from django.utils import timezone


class UserManager(BaseUserManager):
    use_in_migrations = True

    def create_user(self, phone, password=None, **extra):
        if not phone:
            raise ValueError("Phone number is required")
        if extra.get("email"):
            extra["email"] = self.normalize_email(extra["email"])
        else:
            extra["email"] = None
        user = self.model(phone=phone, **extra)
        if password:
            user.set_password(password)
        else:
            user.set_unusable_password()  # customers authenticate via OTP only
        user.save(using=self._db)
        return user

    def create_superuser(self, phone, password=None, **extra):
        extra.setdefault("name", "Super Admin")
        extra.setdefault("user_type", User.UserType.EMPLOYEE)
        extra["is_staff"] = True
        extra["is_superuser"] = True
        user = self.create_user(phone, password, **extra)
        try:
            from apps.accounts.models import Employee
            code = extra.get("employee_code", "ADMIN")
            if Employee.objects.filter(employee_code__iexact=code).exists():
                code = f"ADMIN_{user.id}"
            Employee.objects.get_or_create(
                user=user,
                defaults={
                    "employee_code": code,
                    "role": Employee.Role.SUPER_ADMIN,
                    "status": Employee.Status.ACTIVE,
                },
            )
        except Exception:
            pass
        return user



class User(AbstractBaseUser, PermissionsMixin):
    """One identity table for customers and staff. Authorization comes from user_type + Employee."""

    class UserType(models.TextChoices):
        CUSTOMER = "CUSTOMER", "Customer"
        EMPLOYEE = "EMPLOYEE", "Employee"

    name = models.CharField(max_length=255, blank=True)
    phone = models.CharField(max_length=20, unique=True)
    email = models.EmailField(max_length=255, unique=True, null=True, blank=True)
    user_type = models.CharField(max_length=20, choices=UserType.choices, default=UserType.CUSTOMER)
    is_active = models.BooleanField(default=True)
    is_staff = models.BooleanField(default=False)  # Django admin site access only
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    USERNAME_FIELD = "phone"
    REQUIRED_FIELDS = []
    objects = UserManager()

    class Meta:
        db_table = "users"

    def __str__(self):
        return f"{self.name or self.phone}"


class Employee(models.Model):
    """Staff profile. Created by an admin; logs in with employee_code + password."""

    class Role(models.TextChoices):
        SUPER_ADMIN = "SUPER_ADMIN", "Super Admin"
        ADMIN = "ADMIN", "Admin"
        MANAGER = "MANAGER", "Branch Manager"
        CASHIER = "CASHIER", "Cashier"
        CHEF = "CHEF", "Chef"
        STAFF = "STAFF", "Staff"

    class Status(models.TextChoices):
        ACTIVE = "ACTIVE", "Active"
        INACTIVE = "INACTIVE", "Inactive"
        SUSPENDED = "SUSPENDED", "Suspended"

    user = models.OneToOneField(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="employee")
    # SUPER_ADMIN and ADMIN may have no branch (owner-level, sees all branches). Everyone else must have one
    # (enforced in clean() and the serializer). A branch-assigned admin is confined to that branch.
    branch = models.ForeignKey("branches.Branch", on_delete=models.PROTECT, null=True, blank=True,
                               related_name="employees")
    employee_code = models.CharField(max_length=50, unique=True)
    role = models.CharField(max_length=20, choices=Role.choices, default=Role.STAFF)
    department = models.CharField(max_length=100, blank=True)
    job_title = models.CharField(max_length=150, blank=True)
    # Cashier bill duties already supported by the employee screens, stored as comma-separated keys.
    bill_access = models.CharField(max_length=200, blank=True)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.ACTIVE)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "employees"
        indexes = [models.Index(fields=["branch", "role"]), models.Index(fields=["department"])]

    def __str__(self):
        return f"{self.employee_code} ({self.role})"

    def clean(self):
        from django.core.exceptions import ValidationError
        if self.role == self.Role.SUPER_ADMIN and self.branch_id is not None:
            raise ValidationError({"branch": "Super Admin should not be assigned a fixed branch."})
        if self.role != self.Role.SUPER_ADMIN and self.branch_id is None:
            raise ValidationError({"branch": "Branch is required for this role."})


class OTPRequest(models.Model):
    """Customer OTP challenge. Only a hash of the code is stored."""

    class Purpose(models.TextChoices):
        LOGIN = "LOGIN", "Login"

    phone = models.CharField(max_length=20, db_index=True)
    purpose = models.CharField(max_length=20, choices=Purpose.choices, default=Purpose.LOGIN)
    code_hash = models.CharField(max_length=128)
    created_at = models.DateTimeField(auto_now_add=True)
    expires_at = models.DateTimeField()
    attempts = models.PositiveSmallIntegerField(default=0)
    verified_at = models.DateTimeField(null=True, blank=True)
    ip_address = models.GenericIPAddressField(null=True, blank=True)

    class Meta:
        db_table = "otp_requests"
        indexes = [models.Index(fields=["phone", "created_at"])]

    @property
    def is_expired(self):
        return timezone.now() >= self.expires_at
