# Deployment (Phase 12)

Reproducible local release path for the code in this repository. This does not create a cloud account or publish the app to the internet.

Run backend commands from `backend/` with the virtualenv Python (`.\.venv\Scripts\python` on Windows). The database password stays in `backend/.env` only. That file is git-ignored. Do not copy it into docs, scripts, or `.env.example`.

## MySQL

MySQL 8 with `utf8mb4`. The app database is `foodie_db` and the user is `foodie_user`. Create statements and the test database name are in `DATABASE_DESIGN.md`. Django opens the connection with `charset=utf8mb4` and `STRICT_TRANS_TABLES`.

The MySQL driver is PyMySQL, installed as `MySQLdb` with a version shim in `config/settings.py` so Django 5.2 accepts it. `mysqlclient` is not required by this release.

## Environment

Copy `backend/.env.example` to `backend/.env` and fill in the blanks. Variables the process reads:

| Variable | Role |
|---|---|
| `DEBUG` | `True` for local development. `False` for a release. |
| `SECRET_KEY` | Required when `DEBUG` is off. The dev fallback key is not used then. |
| `ALLOWED_HOSTS` | Comma-separated host names. |
| `CORS_ALLOWED_ORIGINS` | Comma-separated browser origins. Credentials are not allowed. |
| `DB_NAME`, `DB_USER`, `DB_PASSWORD`, `DB_HOST`, `DB_PORT` | MySQL connection. Leave the password empty in the example file. |
| `DB_TEST_NAME` | Django test database. |
| `OTP_PROVIDER` | `console` only while `DEBUG` is on. Any other name fails until a real provider is added in code. |
| `OTP_TTL_SECONDS`, `OTP_MAX_SENDS_PER_HOUR`, `OTP_MAX_VERIFY_ATTEMPTS` | OTP limits. Resend cooldown defaults to 30 seconds (`OTP_RESEND_COOLDOWN_SECONDS`). |
| `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET` | Leave empty until real Razorpay test or live keys exist. Empty keys make online pay return 503 `payments_unconfigured`. |
| `FRONTEND_BASE_URL` | Prefix encoded in table QR links. |
| `SECURE_SSL_REDIRECT` | Read only when `DEBUG` is off. Default is true. |

`load_dotenv` does not override variables already set in the process environment.

## Migrate and static files

```powershell
.\.venv\Scripts\python manage.py migrate
.\.venv\Scripts\python manage.py collectstatic --noinput
```

`STATIC_ROOT` is `backend/staticfiles` (Django admin assets). `MEDIA_ROOT` is `backend/media` (dish images and invoice PDFs). `config/urls.py` mounts `/media/` only when `DEBUG` is on. A release must serve `MEDIA_ROOT` at `/media/` and `STATIC_ROOT` at `/static/` from the web server. Daphne does not do that when `DEBUG` is off.

## HTTP and WebSocket

`config/asgi.py` serves HTTP and WebSocket on one ASGI app. `backend/Procfile` starts one process:

```text
daphne -b 0.0.0.0 -p 8000 config.asgi:application
```

Run that with the working directory `backend/`. `manage.py runserver` is for development; with `daphne` first in `INSTALLED_APPS` it also speaks ASGI, including `/ws`.

Gunicorn is a WSGI server and does not serve `/ws/orders/`. Use Daphne for both HTTP and WebSocket. A split (Gunicorn for HTTP plus a second Daphne process for WebSocket) only works after the channel layer and the cache are shared. They are not shared today: `CHANNEL_LAYERS` is `InMemoryChannelLayer` and `CACHES` is local memory. One process is the supported release shape. More than one process needs Redis for live order events, OTP and login counters, and throttles. `channels-redis` is not installed and settings do not read a Redis URL. This release does not require a running Redis.

## Frontend build

```powershell
cd frontend
npm run build
```

Output is `frontend/dist`. The Vite dev server proxies `/api`, `/ws`, and `/media` to `http://127.0.0.1:8000` (override the target with `VITE_API_TARGET` for that dev server only). `npm run build` and `npm run preview` do not proxy. Serve `dist` and forward:

- `/api` to Django
- `/ws` to Django with the WebSocket upgrade
- `/media` to `MEDIA_ROOT`
- `/static` to `STATIC_ROOT` if Django admin is used
- everything else to `index.html` so client routes work

Staff calls use relative `/api`, and the order socket uses `window.location.host` plus `/ws/orders/`. The customer axios client also defaults to `/api` when `VITE_MAIN_API_URL` and `VITE_API_BASE_URL` are unset. Dish image URLs in `frontend/src/utils/imageUtils.js` still fall back to `http://192.168.68.150:8000` when those variables are unset. That fallback was left as-is.

Behind TLS, send `X-Forwarded-Proto: https`. Settings already set `SECURE_PROXY_SSL_HEADER` to that header when `DEBUG` is off.

## DEBUG off

Set `DEBUG=False` in the process environment or in the uncommitted `.env`. Do not commit `DEBUG=False` as the example default. Also set a long random `SECRET_KEY` and the public `ALLOWED_HOSTS`.

When `DEBUG` is off the code sets:

- `SECURE_SSL_REDIRECT` true unless `SECURE_SSL_REDIRECT` is false
- secure session and CSRF cookies
- HSTS for one year, including subdomains, with preload
- `SECURE_CONTENT_TYPE_NOSNIFF`
- `X_FRAME_OPTIONS = DENY`
- `SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")`

Plain HTTP then redirects to HTTPS. A local trial without TLS needs `SECURE_SSL_REDIRECT=False` in the environment. Leave the redirect on behind a TLS proxy.

OTP: the console provider raises `ImproperlyConfigured` when `DEBUG` is off, and the API does not return `dev_otp`. No SMS vendor is bundled. Customer OTP will not send until a provider exists in `apps/accounts/sms.py`.

Razorpay: empty key id or secret returns 503 `payments_unconfigured`. There is no fake success on that path.

Branch GST, service charge, and takeaway charge stay at the values stored on the branch (default 0). This release does not set rates.

## Checks recorded for this phase

With `DEBUG=False` only in the process environment (`.env` was not edited):

`manage.py check --deploy` -> `System check identified no issues (0 silenced).`

`manage.py check` (normal `.env`, `DEBUG` on) -> `System check identified no issues (0 silenced).`

`npm run build` in `frontend` succeeded. Vite reported chunks larger than 500 kB and ineffective dynamic imports in `orderService.js`, `staffClient.js`, and `adminApi.js`. The build still completed.

## Local development stack

1. MySQL 8 running, `foodie_db` present, password only in `backend/.env`, `DEBUG=True`.
2. `backend`: `python -m venv .venv`, `pip install -r requirements.txt`, `manage.py migrate`.
3. `.\.venv\Scripts\python manage.py runserver 127.0.0.1:8000` or `daphne -b 127.0.0.1 -p 8000 config.asgi:application`.
4. `frontend`: `npm install`, `npm run dev` (http://localhost:5173). The dev proxy forwards `/api`, `/ws`, and `/media`.
