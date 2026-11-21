import os
import django

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")
django.setup()

from django.contrib.auth import get_user_model
from apps.accounts.models import Employee

User = get_user_model()

def create_admin():
    phone = "0000000001"
    user, created = User.objects.get_or_create(phone=phone, defaults={
        "name": "Phase 9 Admin",
        "user_type": User.UserType.EMPLOYEE,
        "is_staff": True,
        "is_superuser": False
    })
    
    if created or not user.has_usable_password():
        user.set_password("Foodie-Dev-2026!")
        user.save()
        
    Employee.objects.get_or_create(user=user, defaults={
        "employee_code": "PHASE9",
        "role": Employee.Role.ADMIN,
        "status": Employee.Status.ACTIVE
    })
    print("Admin user PHASE9 created.")

def create_chef():
    phone = "0000000002"
    user, created = User.objects.get_or_create(phone=phone, defaults={
        "name": "Chef 10",
        "user_type": User.UserType.EMPLOYEE,
    })
    
    if created or not user.has_usable_password():
        user.set_password("Foodie-Dev-2026!")
        user.save()

    # The chef might need a branch if the clean method enforces it, 
    # but let's check if we can get away without it or create a default branch.
    # From models.py: SUPER_ADMIN and ADMIN may have no branch. Everyone else must have one.
    # Let's create a default branch first.
    from apps.branches.models import Branch
    branch, _ = Branch.objects.get_or_create(
        name="Main Branch", 
        defaults={
            "address": "123 Main St",
        }
    )
        
    Employee.objects.get_or_create(user=user, defaults={
        "employee_code": "CHEF10",
        "role": Employee.Role.CHEF,
        "status": Employee.Status.ACTIVE,
        "branch": branch
    })
    print("Chef user CHEF10 created.")

if __name__ == "__main__":
    create_admin()
    create_chef()
