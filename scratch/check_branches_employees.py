import os, sys
sys.path.insert(0, r'D:\curser\foodie-push\backend')
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
import django
django.setup()
from apps.branches.models import Branch
from apps.accounts.models import Employee
print('--- ALL BRANCHES ---')
for b in Branch.objects.all():
    print(f'Branch ID: {b.id}, Name: "{b.name}", Code: "{b.code}", is_primary: {b.is_primary}, is_active: {b.is_active}')
print('--- ALL EMPLOYEES ---')
for e in Employee.objects.all():
    print(f'Emp ID: {e.id}, User ID: {e.user_id}, Code: "{e.employee_code}", Role: "{e.role}", Email: "{e.user.email}", Branch ID: {e.branch_id}')
