import os
from django.core.management.base import BaseCommand
from django.conf import settings
from django.db import connection

class Command(BaseCommand):
    help = "Tests and displays the active Django database connection status."

    def handle(self, *args, **options):
        db_config = settings.DATABASES.get("default", {})
        mode = getattr(settings, "FOODIE_MODE", os.getenv("APP_MODE", "LOCAL")).upper()
        raw_engine = db_config.get("ENGINE", "")
        engine = "MySQL" if "mysql" in raw_engine.lower() else ("SQLite" if "sqlite" in raw_engine.lower() else raw_engine)
        host = db_config.get("HOST", "127.0.0.1")
        port = db_config.get("PORT", "3306")
        name = db_config.get("NAME", "foodie_db")

        try:
            with connection.cursor() as cursor:
                cursor.execute("SELECT 1;")
                cursor.fetchone()
            
            result = "CONNECTED"
            error_message = None
        except Exception as exc:
            result = "FAILED"
            # Sanitize error message to ensure no passwords appear
            error_message = str(exc)
            db_pass = str(db_config.get("PASSWORD", ""))
            if db_pass and len(db_pass) > 2:
                error_message = error_message.replace(db_pass, "******")

        self.stdout.write(f"Database mode: {mode}")
        self.stdout.write(f"Database engine: {engine}")
        self.stdout.write(f"Database host: {host}:{port}" if port else f"Database host: {host}")
        self.stdout.write(f"Database: {name}")
        self.stdout.write(f"Connection result: {result}")

        if error_message:
            self.stderr.write(f"Error details: {error_message}")
            return 1
        return 0
