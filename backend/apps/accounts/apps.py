from django.apps import AppConfig
from django.db.models.signals import post_migrate


def ensure_default_admin(sender, **kwargs):
    try:
        from apps.accounts.models import User, Employee
        if not Employee.objects.filter(role__in=[Employee.Role.SUPER_ADMIN, Employee.Role.ADMIN], status=Employee.Status.ACTIVE).exists():
            user = User.objects.filter(phone="9192436828").first()
            if not user:
                user = User.objects.create_user(
                    phone="9192436828",
                    password="Admin@123",
                    name="Super Admin",
                    user_type=User.UserType.EMPLOYEE,
                    is_staff=True,
                    is_superuser=True,
                )
            else:
                user.user_type = User.UserType.EMPLOYEE
                user.is_staff = True
                user.is_superuser = True
                user.set_password("Admin@123")
                user.save()

            Employee.objects.update_or_create(
                user=user,
                defaults={
                    "employee_code": "ADMIN",
                    "role": Employee.Role.SUPER_ADMIN,
                    "status": Employee.Status.ACTIVE,
                },
            )
    except Exception:
        pass


class AccountsConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "apps.accounts"
    label = "accounts"

    def ready(self):
        post_migrate.connect(ensure_default_admin, sender=self)

