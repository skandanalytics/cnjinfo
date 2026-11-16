import sys
sys.path.insert(0, r"D:\curser\foodie-push\backend")
import os, django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
django.setup()

from django.db import connection
cursor = connection.cursor()

for db in ['foodie', 'foodie_db', 'foodie_push_db']:
    try:
        cursor.execute(f"USE {db};")
        cursor.execute("SELECT id, name, category_id, branch_id, price FROM foods;")
        print(f"=== {db} foods ===", cursor.fetchall())
    except Exception as e:
        print(f"Error {db}:", e)

cursor.execute("USE foodie_push_db;")
