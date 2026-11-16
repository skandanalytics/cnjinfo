import os, sys
sys.path.insert(0, r'D:\curser\foodie-push\backend')
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
import django
django.setup()
from apps.accounts.models import User, Employee
from apps.branches.models import Branch

print('BRANCHES:')
for b in Branch.objects.all():
    print(f'  ID: {b.id}, Code: {b.code}, Name: {b.name}, Active: {b.is_active}, Primary: {b.is_primary}')

print('\nEMPLOYEES:')
for emp in Employee.objects.select_related('user', 'branch').all():
    b_str = f"{emp.branch.name} ({emp.branch_id})" if emp.branch else "None"
    print(f'  EmpID: {emp.id}, Code: {emp.employee_code}, Role: {emp.role}, Status: {emp.status}, Branch: {b_str}, User: {emp.user.email} (ID {emp.user.id})')
