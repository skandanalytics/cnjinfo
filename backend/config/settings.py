"""Foodie settings. All environment-specific values come from environment variables (.env)."""
import os
from datetime import timedelta
from pathlib import Path

import pymysql
from dotenv import load_dotenv

pymysql.version_info = (2, 2, 7, "final", 0)  # satisfy Django's mysqlclient version check
pymysql.install_as_MySQLdb()

BASE_DIR = Path(__file__).resolve().parent.parent
load_dotenv(BASE_DIR / ".env")


def env_bool(name, default=False):
    return os.getenv(name, str(default)).strip().lower() in {"1", "true", "yes", "on"}


def env_list(name, default=""):
    return [x.strip() for x in os.getenv(name, default).split(",") if x.strip()]


DEBUG = env_bool("DEBUG", False)

SECRET_KEY = os.getenv("SECRET_KEY", "")
if not SECRET_KEY:
    if DEBUG:
        SECRET_KEY = "dev-only-insecure-key-do-not-use-in-production"
    else:
        raise RuntimeError("SECRET_KEY environment variable is required when DEBUG is off.")

allowed_hosts_raw = os.getenv("DJANGO_ALLOWED_HOSTS") or os.getenv("ALLOWED_HOSTS", "")
if allowed_hosts_raw:
    ALLOWED_HOSTS = [x.strip() for x in allowed_hosts_raw.split(",") if x.strip()]
    if "*" not in ALLOWED_HOSTS and DEBUG:
        ALLOWED_HOSTS.append("*")
else:
    ALLOWED_HOSTS = ["*"]

INSTALLED_APPS = [
    "daphne",
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    "corsheaders",
    "rest_framework",
    "rest_framework_simplejwt",
    "rest_framework_simplejwt.token_blacklist",
    "django_filters",
    "channels",
    "apps.accounts",
    "apps.branches",
    "apps.menu",
    "apps.inventory",
    "apps.carts",
    "apps.coupons",
    "apps.orders",
    "apps.payments",
    "apps.billing",
    "apps.audit",
]

MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "corsheaders.middleware.CorsMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]

ROOT_URLCONF = "config.urls"

TEMPLATES = [{
    "BACKEND": "django.template.backends.django.DjangoTemplates",
    "DIRS": [],
    "APP_DIRS": True,
    "OPTIONS": {
        "context_processors": [
            "django.template.context_processors.request",
            "django.contrib.auth.context_processors.auth",
            "django.contrib.messages.context_processors.messages",
        ],
    },
}]

WSGI_APPLICATION = "config.wsgi.application"
ASGI_APPLICATION = "config.asgi.application"

# MySQL 8 is the primary operational database, with sqlite3 supported for portable testing.
DB_ENGINE = os.getenv("DB_ENGINE", "django.db.backends.mysql")
if "sqlite" in DB_ENGINE:
    DATABASES = {
        "default": {
            "ENGINE": "django.db.backends.sqlite3",
            "NAME": BASE_DIR / (os.getenv("DB_NAME", "db.sqlite3")),
        }
    }
else:
    DATABASES = {
        "default": {
            "ENGINE": DB_ENGINE,
            "NAME": os.getenv("DB_NAME", "foodie_db"),
            "USER": os.getenv("DB_USER", "foodie_user"),
            "PASSWORD": os.getenv("DB_PASSWORD", ""),
            "HOST": os.getenv("DB_HOST", "127.0.0.1"),
            "PORT": os.getenv("DB_PORT", "3306"),
            "OPTIONS": {"charset": "utf8mb4", "init_command": "SET sql_mode='STRICT_TRANS_TABLES'"},
            # Daphne/ASGI serves each request on a thread-pool worker. Persistent
            # connections (CONN_MAX_AGE > 0) are pinned to those threads and are not
            # returned the way they are under sync WSGI, so they accumulate until
            # MySQL hits max_connections. Close after every request.
            "CONN_MAX_AGE": 0,
            "TEST": {"NAME": os.getenv("DB_TEST_NAME", "test_foodie_db")},
        }
    }

AUTH_USER_MODEL = "accounts.User"

AUTH_PASSWORD_VALIDATORS = [
    {"NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator"},
    {"NAME": "django.contrib.auth.password_validation.MinimumLengthValidator"},
    {"NAME": "django.contrib.auth.password_validation.CommonPasswordValidator"},
    {"NAME": "django.contrib.auth.password_validation.NumericPasswordValidator"},
]

LANGUAGE_CODE = "en-us"
TIME_ZONE = "Asia/Kolkata"
USE_I18N = True
USE_TZ = True

STATIC_URL = "static/"
STATIC_ROOT = BASE_DIR / "staticfiles"
MEDIA_URL = "/media/"
MEDIA_ROOT = BASE_DIR / "media"

DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

# CORS & CSRF Configuration
CORS_ALLOW_ALL_ORIGINS = env_bool("CORS_ALLOW_ALL_ORIGINS", default=True)
CORS_ORIGIN_ALLOW_ALL = CORS_ALLOW_ALL_ORIGINS
CORS_ALLOW_CREDENTIALS = True

# Allow any LAN / Wi-Fi IP on port 5173 or other dev ports (e.g. 192.168.x.x, 10.x.x.x)
CORS_ALLOWED_ORIGIN_REGEXES = [
    r"^http://127\.0\.0\.1:\d+$",
    r"^http://localhost:\d+$",
    r"^http://192\.168\.\d+\.\d+(:\d+)?$",
    r"^http://10\.\d+\.\d+\.\d+(:\d+)?$",
    r"^http://172\.(1[6-9]|2\d|3[01])\.\d+\.\d+(:\d+)?$",
]

cors_origins_env = env_list("CORS_ALLOWED_ORIGINS")
if cors_origins_env:
    CORS_ALLOWED_ORIGINS = cors_origins_env
else:
    CORS_ALLOWED_ORIGINS = [
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://192.168.1.15:5173",
        "http://192.168.150.171:5173",
        "http://192.168.68.102:5173",
    ]

CORS_ALLOW_HEADERS = [
    "accept",
    "accept-encoding",
    "authorization",
    "content-type",
    "dnt",
    "origin",
    "user-agent",
    "x-csrftoken",
    "x-requested-with",
    "x-guest-token",
    "x-branch-id",
]

CSRF_TRUSTED_ORIGINS = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://192.168.1.15:5173",
    "http://192.168.150.171:5173",
    "http://192.168.68.102:5173",
]
csrf_trusted_env = env_list("CSRF_TRUSTED_ORIGINS")
if csrf_trusted_env:
    for o in csrf_trusted_env:
        if o not in CSRF_TRUSTED_ORIGINS:
            CSRF_TRUSTED_ORIGINS.append(o)

REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": ("rest_framework_simplejwt.authentication.JWTAuthentication",),
    "DEFAULT_PERMISSION_CLASSES": ("rest_framework.permissions.IsAuthenticated",),
    "DEFAULT_FILTER_BACKENDS": (
        "django_filters.rest_framework.DjangoFilterBackend",
        "rest_framework.filters.SearchFilter",
        "rest_framework.filters.OrderingFilter",
    ),
    "DEFAULT_THROTTLE_CLASSES": (
        "rest_framework.throttling.AnonRateThrottle",
        "rest_framework.throttling.UserRateThrottle",
    ),
    "DEFAULT_THROTTLE_RATES": {
        "anon": "60/minute", "user": "240/minute",
        # OTP send/verify are scoped on those views. Phone keys keep one diner from blocking the LAN;
        # IP caps stay high enough for a shared restaurant network. Old otp_send/otp_verify IP buckets
        # are intentionally unused so leftover hourly locks no longer apply.
        "otp_send_phone": "8/hour",
        "otp_send_ip": "120/hour" if DEBUG else "60/hour",
        "otp_verify_phone": "20/hour",
        "otp_verify_ip": "180/hour" if DEBUG else "80/hour",
        "staff_login": "20/minute", "qr_resolve": "60/minute", "quote": "120/minute",
        "public_menu": "120/minute", "guest_token": "30/hour",
        "db_setup": "60/minute" if DEBUG else "30/hour", "db_reset": "6/hour",
    },
    "EXCEPTION_HANDLER": "config.exceptions.foodie_exception_handler",
}

ALLOW_UNRESTRICTED_ADMIN_CREATION = env_bool("ALLOW_UNRESTRICTED_ADMIN_CREATION", default=True)

# Cache & Live Events
# Single-process development can use InMemoryChannelLayer and LocMemCache.
# Multi-worker or production deployments use Redis (specify REDIS_URL in .env).
REDIS_URL = os.getenv("REDIS_URL", "").strip()
if REDIS_URL:
    CACHES = {
        "default": {
            "BACKEND": "django.core.cache.backends.redis.RedisCache",
            "LOCATION": REDIS_URL,
        }
    }
    CHANNEL_LAYERS = {
        "default": {
            "BACKEND": "channels_redis.core.RedisChannelLayer",
            "CONFIG": {
                "hosts": [REDIS_URL],
            },
        }
    }
else:
    CACHES = {"default": {"BACKEND": "django.core.cache.backends.locmem.LocMemCache"}}
    CHANNEL_LAYERS = {"default": {"BACKEND": "channels.layers.InMemoryChannelLayer"}}

STAFF_LOGIN_MAX_FAILURES = 5
STAFF_LOGIN_LOCK_SECONDS = 900

SIMPLE_JWT = {
    "ACCESS_TOKEN_LIFETIME": timedelta(minutes=30),
    "REFRESH_TOKEN_LIFETIME": timedelta(days=7),
    "ROTATE_REFRESH_TOKENS": True,
    "BLACKLIST_AFTER_ROTATION": True,
    "AUTH_HEADER_TYPES": ("Bearer",),
}

# OTP (Phase 3). Provider credentials stay in the environment; no production bypass exists.
OTP_LENGTH = 6
OTP_TTL_SECONDS = int(os.getenv("OTP_TTL_SECONDS", "300"))
OTP_RESEND_COOLDOWN_SECONDS = int(os.getenv("OTP_RESEND_COOLDOWN_SECONDS", "30"))
OTP_MAX_SENDS_PER_HOUR = int(os.getenv("OTP_MAX_SENDS_PER_HOUR", "5"))
OTP_MAX_VERIFY_ATTEMPTS = int(os.getenv("OTP_MAX_VERIFY_ATTEMPTS", "5"))
OTP_PROVIDER = os.getenv("OTP_PROVIDER", "console")  # "console" is rejected when DEBUG is off (enforced in Phase 3)

# Razorpay (Phase 8). Secrets live on the backend only.
RAZORPAY_KEY_ID = os.getenv("RAZORPAY_KEY_ID", "")
RAZORPAY_KEY_SECRET = os.getenv("RAZORPAY_KEY_SECRET", "")
RAZORPAY_WEBHOOK_SECRET = os.getenv("RAZORPAY_WEBHOOK_SECRET", "")

LOW_STOCK_DEFAULT_THRESHOLD = 5

# Base URL of the customer web app; table QR codes encode "<FRONTEND_BASE_URL>/customer/welcome?qr=<uuid>".
FRONTEND_BASE_URL = os.getenv("FRONTEND_BASE_URL", "http://localhost:5173").rstrip("/")
MAX_IMAGE_UPLOAD_BYTES = 5 * 1024 * 1024

if not DEBUG:
    # Set SECURE_SSL_REDIRECT=True in .env only when production TLS/HTTPS termination is enabled.
    # When deployed to an internal LAN IP or behind an HTTP reverse proxy, leave it as False.
    SECURE_SSL_REDIRECT = env_bool("SECURE_SSL_REDIRECT", False)
    SESSION_COOKIE_SECURE = env_bool("SESSION_COOKIE_SECURE", SECURE_SSL_REDIRECT)
    CSRF_COOKIE_SECURE = env_bool("CSRF_COOKIE_SECURE", SECURE_SSL_REDIRECT)
    if SECURE_SSL_REDIRECT:
        SECURE_HSTS_SECONDS = 31536000
        SECURE_HSTS_INCLUDE_SUBDOMAINS = True
        SECURE_HSTS_PRELOAD = True
    SECURE_CONTENT_TYPE_NOSNIFF = True
    SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")
    X_FRAME_OPTIONS = "DENY"

