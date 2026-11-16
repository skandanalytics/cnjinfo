import sys
sys.path.insert(0, r"D:\curser\foodie-push\backend")
import os, django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
django.setup()

from django.db import connection
cursor = connection.cursor()

for db in ['foodie_push_db', 'foodie_db', 'foodie']:
    try:
        cursor.execute(f"USE {db};")
        cursor.execute("SELECT id, name, code, is_active FROM branches;")
        print(f"=== {db} branches ===", cursor.fetchall())
        cursor.execute("SELECT id, name, branch_id FROM categories;")
        print(f"=== {db} categories ===", cursor.fetchall())
        cursor.execute("SELECT id, employee_code, role, branch_id FROM employees;")
        print(f"=== {db} employees ===", cursor.fetchall())
    except Exception as e:
        print(f"Error inspecting {db}:", e)

cursor.execute("USE foodie_push_db;")
