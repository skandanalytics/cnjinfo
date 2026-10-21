"""
Gunicorn configuration for Foodie Backend.
Usage with Uvicorn worker for ASGI / WebSockets:
    gunicorn -c deployment/gunicorn.conf.py config.asgi:application
"""
import multiprocessing
import os

# Server socket
bind = os.getenv("GUNICORN_BIND", "0.0.0.0:8000")
backlog = 2048

# Worker processes
# For ASGI + WebSockets, uvicorn worker class is recommended
worker_class = "uvicorn.workers.UvicornWorker"
workers = int(os.getenv("GUNICORN_WORKERS", multiprocessing.cpu_count() * 2 + 1))
worker_connections = 1000
timeout = 60
keepalive = 5

# Process naming
proc_name = "foodie_backend"

# Logging
accesslog = "-"
errorlog = "-"
loglevel = os.getenv("GUNICORN_LOG_LEVEL", "info")

# Reload on code changes (development only)
reload = False
