# Foodie — Centralized Backend Deployment & Setup Guide

This guide describes how to configure, run, and deploy the Foodie backend (Django REST Framework + Channels ASGI + MySQL) on a central server so that all Admin, Employee, and Customer frontend devices can connect seamlessly over LAN, Wi-Fi, or the internet.

---

## 1. Architecture Overview

- **Backend Framework**: Django 5.2 + Django REST Framework (DRF)
- **ASGI & WebSockets**: Daphne + Django Channels (real-time live order events, kitchen queue sync, table occupancy)
- **Database**: MySQL 8.0 (UTF-8 mb4)
- **Cache & Channel Layer**: In-Memory (single process / dev) or Redis (recommended for multi-worker production)
- **Frontend Clients**: React + Vite (Customer menu/ordering, Admin management, POS terminal, Kitchen Queue)

---

## 2. Prerequisites

### Windows (Local Development)
- Python 3.10 or higher
- MySQL 8.0 (or MariaDB)
- Git & PowerShell

### Linux / Ubuntu Server (Production / Centralized Server)
```bash
sudo apt update
sudo apt install -y python3 python3-pip python3-venv python3-dev \
    default-libmysqlclient-dev build-essential pkg-config \
    mysql-server redis-server nginx
```

---

## 3. Database Setup (MySQL 8)

Run the following SQL commands in MySQL (`sudo mysql` or MySQL Workbench):

```sql
CREATE DATABASE IF NOT EXISTS foodie_db
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

CREATE USER IF NOT EXISTS 'foodie_user'@'localhost' IDENTIFIED BY 'YourSecurePassword123!';
-- If connecting from a remote machine:
-- CREATE USER IF NOT EXISTS 'foodie_user'@'%' IDENTIFIED BY 'YourSecurePassword123!';

GRANT ALL PRIVILEGES ON foodie_db.* TO 'foodie_user'@'localhost';
-- GRANT ALL PRIVILEGES ON foodie_db.* TO 'foodie_user'@'%';
FLUSH PRIVILEGES;
```

---

## 4. Backend Environment Configuration (`.env`)

Copy `.env.example` to `.env` in the `backend/` directory:

```bash
cp .env.example .env
```

Edit `.env` with your server configuration:

```ini
DEBUG=False
SECRET_KEY=use-a-strong-random-secret-key-here

# IMPORTANT: Put your server's IP address or domain here
# Example: 192.168.1.100 or yourdomain.com
ALLOWED_HOSTS=127.0.0.1,localhost,192.168.1.100,yourdomain.com

# Allow requests from frontend clients
CORS_ALLOW_ALL_ORIGINS=True
# Or restrict to specific origins:
# CORS_ALLOWED_ORIGINS=http://192.168.1.100:5173,http://localhost:5173

# CSRF Trusted Origins
CSRF_TRUSTED_ORIGINS=http://192.168.1.100:5173,http://localhost:5173

# Database credentials
DB_ENGINE=django.db.backends.mysql
DB_NAME=foodie_db
DB_USER=foodie_user
DB_PASSWORD=YourSecurePassword123!
DB_HOST=127.0.0.1
DB_PORT=3306

# Redis (optional for development, recommended for multi-worker production)
# REDIS_URL=redis://127.0.0.1:6379/0

# Production SSL (keep False unless running behind HTTPS domain)
SECURE_SSL_REDIRECT=False
```

---

## 5. Quick Start (Windows Development)

1. **Activate virtual environment**:
   ```powershell
   cd backend
   .\.venv\Scripts\Activate.ps1
   ```
2. **Install dependencies**:
   ```powershell
   pip install -r requirements.txt
   ```
3. **Run migrations**:
   ```powershell
   python manage.py migrate
   ```
4. **Create initial admin**:
   ```powershell
   python manage.py runserver 0.0.0.0:8000
   ```
   Navigate in your browser to `http://localhost:5173/db` to initialize the database and set up the first administrator.

---

## 6. Linux Production Deployment (Ubuntu/Debian)

### Step 1: Deploy code to server
```bash
sudo mkdir -p /var/www/foodie
sudo chown -R $USER:$USER /var/www/foodie
git clone <YOUR_REPO_URL> /var/www/foodie
cd /var/www/foodie/backend
```

### Step 2: Virtual Environment & Packages
```bash
python3 -m venv .venv
source .venv/bin/activate
pip install --upgrade pip
pip install -r requirements.txt
```

### Step 3: Run Database Migrations & Collect Static Files
```bash
python manage.py migrate
python manage.py collectstatic --noinput
```

### Step 4: Configure Daphne Systemd Service
Copy the provided unit file:
```bash
sudo cp deployment/foodie-backend.service /etc/systemd/system/foodie-backend.service
sudo systemctl daemon-reload
sudo systemctl enable foodie-backend
sudo systemctl start foodie-backend
sudo systemctl status foodie-backend
```

### Step 5: Configure Nginx Reverse Proxy
Copy the Nginx configuration:
```bash
sudo cp deployment/nginx.conf.example /etc/nginx/sites-available/foodie
# Edit with your domain or server IP
sudo nano /etc/nginx/sites-available/foodie

sudo ln -s /etc/nginx/sites-available/foodie /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
```

---

## 7. Connecting Frontend to the Central Backend

Foodie features a **single centralized configuration file** for all API and WebSocket endpoints:

`frontend/src/config/apiConfig.js`

### Option A: Edit the Config File Directly (Zero Environment Setup Required)
Open `frontend/src/config/apiConfig.js` and set your server's IP address or domain:

```javascript
export const DEFAULT_SERVER_URL = 'http://192.168.1.100:8000';
```

### Option B: Use Environment Variable
In `frontend/.env` or `frontend/.env.production`:

```ini
VITE_API_BASE_URL=http://192.168.1.100:8000
```

> **Note**: WebSockets (`WS_BASE_URL`) and image URLs (`MEDIA_BASE_URL`) are automatically derived from the server URL (e.g. `http://` converts to `ws://` and `https://` converts to `wss://`). You never need to edit multiple files!

Build and distribute the frontend:
```bash
cd frontend
npm install
npm run build
```

---

## 8. Verifying Connection & Troubleshooting

1. **Verify HTTP API**:
   ```bash
   curl -I http://<SERVER_IP>:8000/api/branches/active/
   # Should return HTTP 200 OK
   ```

2. **Verify Database Health**:
   ```bash
   curl http://<SERVER_IP>:8000/api/db/status/
   # Returns JSON status {"setup_required": false, ...}
   ```

3. **Verify WebSockets**:
   In your browser console on the frontend:
   ```javascript
   const ws = new WebSocket("ws://<SERVER_IP>:8000/ws/orders/?token=<JWT_TOKEN>");
   ws.onopen = () => console.log("WebSocket connected successfully!");
   ```

4. **Firewall / Port Access**:
   Make sure port 80 (HTTP) or 8000 (Direct Daphne) is open in your server firewall:
   ```bash
   sudo ufw allow 80/tcp
   sudo ufw allow 8000/tcp
   ```
