# Foodie

Restaurant ordering app: customer QR / dine-in / takeaway, admin and employee dashboards, kitchen queue, inventory, and live order updates.

**Stack:** React + Vite frontend, Django REST Framework backend, MySQL 8, Django Channels (Daphne) for WebSockets.

## Languages required

| Language | Where it is used |
|---|---|
| **Python** | Backend (Django, REST APIs, business logic, migrations, WebSockets) |
| **SQL** | MySQL 8 database (`foodie_db`). Schema is applied through Django migrations; you still need SQL to create the database and inspect data. |
| **JavaScript (JSX)** | Frontend (React, Vite, pages, API clients) |
| **HTML / CSS** | Frontend markup and styling (Bootstrap and project CSS) |
| **JSON** | API request/response bodies and frontend config |

You need **Python** and **SQL/MySQL** on your machine to run the backend, and **JavaScript** via Node.js/npm to run the frontend.

---

## Prerequisites

Install these before the first run, and keep them installed after every pull:

| Software | Used for |
|---|---|
| Python 3.12+ | Django backend |
| Node.js 20+ and npm | Vite frontend |
| MySQL 8 (`utf8mb4`) | Application database |

On Windows, use PowerShell. Backend commands below assume `backend/.venv`.

---

## After pulling a new build

Run these from the repo root whenever you `git pull`. They install new packages, apply database schema changes, and start both servers.

### 1. Get the code

```powershell
git pull
```

### 2. Backend — install and migrate

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\python -m pip install --upgrade pip
.\.venv\Scripts\python -m pip install -r requirements.txt
```

If `backend/.env` does not exist yet:

```powershell
copy .env.example .env
```

Edit `backend/.env` and set `DB_NAME`, `DB_USER`, `DB_PASSWORD`, `DB_HOST`, `DB_PORT`, `SECRET_KEY`, and `ALLOWED_HOSTS`. Do not commit `.env`.

Create the database once (MySQL must be running):

```sql
CREATE DATABASE foodie_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```

Apply migrations (required after most backend pulls):

```powershell
.\.venv\Scripts\python manage.py migrate
```

Start the API and WebSocket server (Daphne via `runserver`; required for `/ws/orders/`):

```powershell
.\.venv\Scripts\python manage.py runserver 127.0.0.1:8000
```

Leave this terminal open.

### 3. Frontend — install and run

In a second terminal:

```powershell
cd frontend
npm install
npm run dev
```

The Vite app is at **http://localhost:5173**. It proxies `/api`, `/ws`, and `/media` to `http://127.0.0.1:8000`.

If you open the app from another device on the LAN, add that machine's IP to `ALLOWED_HOSTS` in `backend/.env` and restart Django.

### 4. Restart after a pull

Stop both terminals (Ctrl+C), then start Django and Vite again with the commands above. New Python or npm packages and new migrations do not load until you reinstall/migrate and restart.

---

## Create the first administrator

Staff login uses an **employee code** (username) and password. A Django `createsuperuser` account is not enough; the app needs an `Employee` row with an admin role.

1. Start MySQL, the backend on port 8000, and the frontend on port 5173.
2. Open **http://localhost:5173/login**.
3. If no administrator exists, the app redirects to **http://localhost:5173/db** (Create First Admin). You can also open `/db` directly.
4. Fill in:
   - **Username** — employee code, 3-50 letters, numbers, hyphens, or underscores (example: `OWN001`)
   - **Full name**
   - **Phone** — 10 to 15 digits
   - **Email** — optional
   - **Password** and **Confirm password** — at least 8 characters, not too common, not only numbers, not too similar to the name or username
5. If `DB_SETUP_SECRET` is set in `backend/.env`, the form also asks for that **Server setup key**. Leave `DB_SETUP_SECRET` empty for local development so the form is available whenever no admin exists.
6. Click **Create Admin**.
7. Sign in at `/login` with that username and password.

The first admin is a **super administrator** (no branch restriction). After login:

1. Create at least one **branch** (Manage Branches) and mark a primary branch.
2. Add categories, dishes, stock, and tables for that branch.
3. Create employees from the Users screen. Only an existing admin can create further administrators.

If an administrator already exists, `/db` shows **Login** and **Create New Admin**. Sign in as an existing administrator, then use **Administrator account management** to add more Owner (`SUPER_ADMIN`) or Manager (`ADMIN`) accounts. The server setup key is not required for that. Each administrator keeps a unique Admin ID and password and logs in at `/login`. Unauthenticated recovery with the server setup key is only for when nobody can sign in.

If application data is reset from `/db`, Create First Admin appears again. Existing dish, order, and payment rows are not created automatically.

---

## Daily run (already set up)

MySQL running, then:

```powershell
# Terminal 1
cd backend
.\.venv\Scripts\python manage.py runserver 127.0.0.1:8000

# Terminal 2
cd frontend
npm run dev
```

| App | URL |
|---|---|
| Customer | http://localhost:5173/customer/welcome |
| Staff login | http://localhost:5173/login |
| First admin / database console | http://localhost:5173/db |

Customers sign in with a phone OTP. With `OTP_PROVIDER=console` in `backend/.env`, the code is printed in the Django terminal.

Five wrong staff passwords lock that employee code for 15 minutes.

---

## What gets installed

**Backend** (`backend/requirements.txt`): Django 5.2, Django REST Framework, SimpleJWT, django-cors-headers, django-filter, PyMySQL, Pillow, python-dotenv, qrcode, Channels, Daphne, asgiref, reportlab.

**Frontend** (`frontend/package.json`): React 19, React Router, Vite, Axios, Bootstrap, bootstrap-icons, react-icons, qrcode, jsPDF.

---

## Notes for this codebase

- Use **Daphne** (`manage.py runserver` with Daphne installed, or `daphne -b 127.0.0.1 -p 8000 config.asgi:application`). Gunicorn does not serve WebSockets.
- After schema changes, run `.\.venv\Scripts\python manage.py migrate` before starting the server. Example: `menu.0004` removes the dish `protein_grams` column.
- Kitchen, orders, inventory, menu, and coupons update over the existing `/ws/orders/` connection plus a refetch when you open the page. Do not add 20-second polling as a workaround.
- Table vacate with unfinished orders is blocked by the API (409 `unfinished_orders`) and shown in a Foodie dialog, not a browser alert.
- Keep `backend/.env` and secrets out of git.

---

## Keep this README current

When a change affects setup, install steps, environment variables, migrations, how to create an admin, or how to start the servers, update this file in the same change.
