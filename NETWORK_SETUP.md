# Foodie — Network Configuration, Database Modes, and Mobile QR Scanning Guide

This document is the definitive guide to configuring, operating, and troubleshooting the Foodie restaurant management application across different network environments and deployment modes.

---

## 1. Operating Modes Overview

Foodie supports two primary deployment and operating modes:

### Mode A — Centralized Database & Server
- **Frontend URL**: `http://192.168.150.171:5173` (Designated server IP)
- **Backend API URL**: `http://192.168.150.171:8000/api/`
- **Database**: Centralized MySQL database (`192.168.150.171:3306`, database `foodie_db`)
- **Use Case**: Production or multi-workstation restaurant environment where all terminals, cashier POS stations, and customer mobile devices communicate with the designated central server.

### Mode B — Local Database & Server
- **Frontend URL**: `http://127.0.0.1:5173` (or active Wi-Fi LAN IP e.g. `http://192.168.68.104:5173`)
- **Backend API URL**: `http://127.0.0.1:8000/api/` (or active Wi-Fi LAN IP `http://192.168.68.104:8000/api/`)
- **Database**: Local development MySQL database (`127.0.0.1:3306`, database `foodie_db`, user `root`)
- **Use Case**: Offline local development, feature testing, and on-premises local testing.

---

## 2. Switching Modes Without Modifying Code

To switch between modes without editing source code:

### Option 1: One-Click Windows Batch Scripts
- Double-click **`switch-to-centralized.bat`** &rarr; switches both frontend and backend configurations to Centralized Mode.
- Double-click **`switch-to-local.bat`** &rarr; switches both frontend and backend configurations to Local Mode.

### Option 2: Command Line
```powershell
# Switch to Centralized Mode:
node scripts/switch-mode.cjs centralized

# Switch to Local Mode:
node scripts/switch-mode.cjs local
```

### Option 3: Manual Environment Files
Copy the desired templates:
- **Centralized**:
  - `frontend/.env.centralized.example` &rarr; `frontend/.env`
  - `backend/.env.centralized.example` &rarr; `backend/.env`
- **Local**:
  - `frontend/.env.local.example` &rarr; `frontend/.env`
  - `backend/.env.local.example` &rarr; `backend/.env`

---

## 3. Strict Database Policy (No Silent Fallbacks)

- **Zero Silent Fallback**: If Centralized mode is selected and `192.168.150.171:3306` is unreachable, Django **will NOT silently fall back** to SQLite or a local MySQL database.
- An explicit error is thrown, protecting data integrity so migrations and orders are never written to the wrong database.
- Test your active database connection at any time using:
  ```powershell
  .\backend\.venv\Scripts\python.exe backend\scripts\check_database.py
  ```

---

## 4. Frontend Architecture & Authoritative Modules

The frontend configuration has been centralized under clean, authoritative modules:

1. **`frontend/src/config/environment.js`**:
   - Parses `VITE_APP_MODE` (`'centralized'` vs `'local'`).
   - Resolves `API_BASE_URL`, `PUBLIC_FRONTEND_URL`, `SERVER_ORIGIN`, `WS_BASE_URL`, `MEDIA_BASE_URL`.
   - In centralized mode: uses designated server address `http://192.168.150.171:8000/api/` and `http://192.168.150.171:5173`.
   - In local mode: dynamically resolves to the browser's hostname when accessed over Wi-Fi so mobile phones can connect seamlessly.
2. **`frontend/src/config/urls.js`**:
   - Authoritative URL builders: `getApiUrl()`, `getWsUrl()`, `getMediaUrl()`, `getCustomerWelcomeUrl()`.
3. **`frontend/src/utils/qrUrl.js`**:
   - Authoritative QR code generator and validator (`buildTableQrUrl`, `validateQrUrl`).
   - Guarantees:
     - Never encodes `localhost` for mobile scanning without warning.
     - Never uses backend port `8000` for customer frontend routes.
     - Uses `PUBLIC_FRONTEND_URL` or active LAN host.
4. **`frontend/src/services/apiClient.js`** & **`frontend/src/services/api.js`**:
   - Single authoritative Axios client configured with `API_BASE_URL`, interceptors for JWT auth, guest token (`X-Guest-Token`), token refreshing, and GET request deduplication.

---

## 5. Starting the Development Servers

### Start Django Backend (Bound to 0.0.0.0)
Always bind to `0.0.0.0:8000` so other devices on the LAN can reach the API:
```powershell
cd "c:\curser foodie\foodie\backend"
.\.venv\Scripts\python.exe manage.py runserver 0.0.0.0:8000
```

### Start Vite Frontend (Bound to 0.0.0.0)
```powershell
cd "c:\curser foodie\foodie\frontend"
npm run dev
```

---

## 6. Mobile Testing & Table QR Scanning

1. Connect your mobile phone to the **same Wi-Fi router** as your development computer.
2. If in **Centralized Mode**:
   - Open `http://192.168.150.171:5173` on your PC and mobile device.
3. If in **Local Mode**:
   - Run `diagnose-network.bat` or `node scripts/network-diagnostics.js` to get your computer's current Wi-Fi LAN IP (e.g. `192.168.68.104`).
   - Open `http://192.168.68.104:5173` in your browser.
4. Go to **Manage Tables** &rarr; click on a table to view the QR modal.
5. Scan the QR code using your phone camera. It will open:
   `http://<host>:5173/customer/welcome?table=1&qr=...`
6. You can browse the menu, add dishes to cart, and checkout directly from your mobile device!

---

## 7. Network Diagnostics & Troubleshooting

Run the comprehensive diagnostic tool anytime:

```powershell
# Option A: One-click batch script
diagnose-network.bat

# Option B: Node CLI
node scripts/network-diagnostics.js

# Option C: From frontend
npm --prefix frontend run network:check
```

The diagnostic tool checks:
- Active operating modes (Frontend & Backend).
- Network interfaces (Physical Wi-Fi vs. OpenVPN tunnel vs. virtual adapters).
- Port 8000 (Django) and port 5173 (Vite) listening state.
- Django API response (`/api/`).
- Database connectivity test (refuses silent fallback).
- QR code URL safety inspection.

### Windows Defender Firewall
If mobile devices cannot connect over Wi-Fi, run in an **Administrator PowerShell**:
```powershell
netsh advfirewall firewall add rule name="Foodie Frontend (5173)" dir=in action=allow protocol=TCP localport=5173
netsh advfirewall firewall add rule name="Foodie Backend (8000)" dir=in action=allow protocol=TCP localport=8000
```
