"""
Foodie — Database Connectivity Check

Validates that Django can connect to the currently configured MySQL database.
Explicitly refuses silent fallback to SQLite or a secondary database.
"""
import os
import sys
from pathlib import Path

# Setup Django environment
BASE_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BASE_DIR))
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")

import django
django.setup()

from django.db import connection
from django.conf import settings

def check_database():
    db_config = settings.DATABASES.get("default", {})
    mode = getattr(settings, "FOODIE_MODE", "unknown").upper()
    host = db_config.get("HOST", "127.0.0.1")
    port = db_config.get("PORT", "3306")
    name = db_config.get("NAME", "foodie_db")
    user = db_config.get("USER", "unknown")
    engine = db_config.get("ENGINE", "")

    print("=" * 64)
    print("   FOODIE DATABASE CONNECTIVITY DIAGNOSTIC")
    print("=" * 64)
    print(f" > Selected Mode:      {mode}")
    print(f" > Database Engine:    {engine}")
    print(f" > Target Host & Port: {host}:{port}")
    print(f" > Target Database:    {name}")
    print(f" > Target User:        {user}")
    print("-" * 64)

    try:
        with connection.cursor() as cursor:
            cursor.execute("SELECT 1;")
            cursor.fetchone()
            
            # Count tables to verify schema
            cursor.execute("SHOW TABLES;")
            tables = cursor.fetchall()
            table_count = len(tables)

        print(f" [PASS] Successfully connected to database '{name}' on {host}:{port}!")
        print(f"        Found {table_count} tables in database schema.")
        print("=" * 64 + "\n")
        return True
    except Exception as exc:
        print(f" [FAIL] Failed to connect to database '{name}' on {host}:{port}")
        print(f"        Error details: {exc}")
        print("-" * 64)
        print(" [!] STRICT POLICY: No automatic database fallback was attempted.")
        print(f"     Operating Mode '{mode}' requires a reachable MySQL database at {host}:{port}.")
        print("     Please verify that:")
        print(f"     1. MySQL server is running at {host}:{port}")
        print(f"     2. Database '{name}' exists and user '{user}' has permissions")
        print("     3. Firewalls and network routes allow this connection")
        print("=" * 64 + "\n")
        return False

if __name__ == "__main__":
    success = check_database()
    sys.exit(0 if success else 1)
