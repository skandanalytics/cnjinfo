import os
import sys
import socket
from django.conf import settings
from django.db import connection

# Use Daphne's runserver command for full ASGI/WebSocket channel layer support
try:
    from daphne.management.commands.runserver import Command as BaseRunserverCommand
except ImportError:
    from django.core.management.commands.runserver import Command as BaseRunserverCommand

def detect_lan_interfaces():
    candidates = []
    try:
        hostname = socket.gethostname()
        for ip in socket.gethostbyname_ex(hostname)[2]:
            if ip.startswith('127.') or ip.startswith('169.254.') or ip == '0.0.0.0':
                continue

            is_vpn = ip.startswith('10.8.') or ip.startswith('10.9.')
            score = 0
            if ip.startswith('192.168.'):
                score += 50
            elif ip.startswith('172.'):
                score += 20
            elif ip.startswith('10.') and not is_vpn:
                score += 10
            
            if is_vpn:
                score -= 40

            candidates.append({
                'ip': ip,
                'is_vpn': is_vpn,
                'score': score
            })
    except Exception:
        pass

    candidates.sort(key=lambda x: x['score'], reverse=True)
    preferred = candidates[0]['ip'] if candidates else '127.0.0.1'
    return preferred, candidates

def test_db_connection():
    try:
        with connection.cursor() as cursor:
            cursor.execute("SELECT 1;")
            cursor.fetchone()
        return "CONNECTED"
    except Exception as exc:
        return f"FAILED ({str(exc).splitlines()[0]})"

class Command(BaseRunserverCommand):
    help = "Starts the Foodie ASGI development server with LAN discovery and status display."

    default_addr = '127.0.0.1'
    default_port = '8000'

    def inner_run(self, *args, **options):
        self.display_startup_banner(options)
        super().inner_run(*args, **options)

    def display_startup_banner(self, options):
        addr = getattr(self, 'addr', None) or options.get('addr') or self.default_addr
        port = getattr(self, 'port', None) or options.get('port') or self.default_port
        
        mode = getattr(settings, 'FOODIE_MODE', os.getenv('APP_MODE', 'LOCAL')).upper()
        
        db_config = settings.DATABASES.get('default', {})
        raw_engine = db_config.get('ENGINE', '')
        engine = 'MySQL' if 'mysql' in raw_engine.lower() else ('SQLite' if 'sqlite' in raw_engine.lower() else raw_engine)
        db_host = db_config.get('HOST', '127.0.0.1')
        db_port = db_config.get('PORT', '3306')
        db_name = db_config.get('NAME', 'foodie_db')
        
        db_status = test_db_connection()
        pref_lan_ip, candidates = detect_lan_interfaces()
        
        sep = "=" * 52
        lines = [
            f"\n{sep}",
            "FOODIE BACKEND STARTUP",
            sep,
            f"Application mode : {mode}",
            f"Backend bind     : {addr}:{port}",
            f"API base URL     : http://127.0.0.1:{port}/api/",
            f"LAN API URL      : http://{pref_lan_ip}:{port}/api/",
            f"Database engine  : {engine}",
            f"Database host    : {db_host}:{db_port}" if db_port else f"Database host    : {db_host}",
            f"Database name    : {db_name}",
            f"Database status  : {db_status}",
            sep,
            "Use this API base URL for the frontend:",
            f"http://127.0.0.1:{port}/api/ (Local Desktop)",
        ]

        if pref_lan_ip != '127.0.0.1':
            lines.append(f"http://{pref_lan_ip}:{port}/api/ (Mobile / LAN Testing)")
        
        vpn_cands = [c['ip'] for c in candidates if c['is_vpn']]
        if vpn_cands:
            lines.append("-" * 52)
            lines.append(f"Active VPN Tunnel(s) detected: {', '.join(vpn_cands)}")
            lines.append(f"Devices on local Wi-Fi router must use: http://{pref_lan_ip}:{port}/api/")
        
        lines.append(sep + "\n")

        for line in lines:
            self.stdout.write(line)
        sys.stdout.flush()
