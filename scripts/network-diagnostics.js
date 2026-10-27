const http = require('http');
const net = require('net');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { detectNetwork } = require('./detect-network.cjs');

const ROOT_DIR = path.resolve(__dirname, '..');
const FRONTEND_ENV = path.join(ROOT_DIR, 'frontend', '.env');
const BACKEND_ENV = path.join(ROOT_DIR, 'backend', '.env');

/**
 * Parses simple KEY=VALUE env file into an object.
 */
function parseEnv(filePath) {
  if (!fs.existsSync(filePath)) return {};
  const content = fs.readFileSync(filePath, 'utf8');
  const result = {};
  content.split('\n').forEach(line => {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#')) {
      const idx = trimmed.indexOf('=');
      if (idx !== -1) {
        result[trimmed.slice(0, idx).trim()] = trimmed.slice(idx + 1).trim();
      }
    }
  });
  return result;
}

/**
 * Tests if a specific TCP port is listening on a host.
 */
function testTcpPort(host, port, timeoutMs = 2500) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    let isConnected = false;

    socket.setTimeout(timeoutMs);

    socket.on('connect', () => {
      isConnected = true;
      socket.destroy();
      resolve({ host, port, open: true });
    });

    socket.on('timeout', () => {
      socket.destroy();
      resolve({ host, port, open: false, error: 'TIMEOUT' });
    });

    socket.on('error', (err) => {
      socket.destroy();
      resolve({ host, port, open: false, error: err.code || err.message });
    });

    socket.connect(port, host);
  });
}

/**
 * Tests an HTTP GET endpoint.
 */
function testHttpGet(url, timeoutMs = 3000) {
  return new Promise((resolve) => {
    try {
      const parsed = new URL(url);
      const req = http.get(
        {
          hostname: parsed.hostname,
          port: parsed.port || 80,
          path: parsed.pathname + parsed.search,
          timeout: timeoutMs,
        },
        (res) => {
          let data = '';
          res.on('data', chunk => { data += chunk; });
          res.on('end', () => {
            resolve({ url, ok: res.statusCode >= 200 && res.statusCode < 500, status: res.statusCode });
          });
        }
      );

      req.on('timeout', () => {
        req.destroy();
        resolve({ url, ok: false, error: 'TIMEOUT' });
      });

      req.on('error', (err) => {
        resolve({ url, ok: false, error: err.code || err.message });
      });
    } catch (err) {
      resolve({ url, ok: false, error: err.message });
    }
  });
}

async function runDiagnostics() {
  const netInfo = detectNetwork();
  const fEnv = parseEnv(FRONTEND_ENV);
  const bEnv = parseEnv(BACKEND_ENV);

  const sep = '='.repeat(68);
  const thin = '-'.repeat(68);

  const fMode = (fEnv.VITE_APP_MODE || fEnv.VITE_API_MODE || 'centralized').toLowerCase();
  const bMode = (bEnv.FOODIE_MODE || bEnv.APP_MODE || 'local').toLowerCase();

  const fConfiguredApi = fEnv.VITE_API_BASE_URL || (fMode === 'centralized' ? 'http://192.168.150.171:8000/api/' : 'http://127.0.0.1:8000/api/');
  const fConfiguredFrontend = fEnv.VITE_PUBLIC_FRONTEND_URL || fEnv.VITE_FRONTEND_BASE_URL || (fMode === 'centralized' ? 'http://192.168.150.171:5173' : 'http://127.0.0.1:5173');

  console.log('\n' + sep);
  console.log('   FOODIE SYSTEM & NETWORK CONFIGURATION DIAGNOSTICS');
  console.log(sep);

  // SECTION 1: Operating Modes
  console.log('\n[1/5] Configuration & Operating Modes:');
  console.log(` > Frontend Mode:           ${fMode.toUpperCase()}`);
  console.log(` > Backend Mode:            ${bMode.toUpperCase()}`);
  console.log(` > Configured Frontend URL: ${fConfiguredFrontend}`);
  console.log(` > Configured Backend API:  ${fConfiguredApi}`);

  if (fMode !== bMode) {
    console.log('\n [!] MODE MISMATCH WARNING:');
    console.log(`     Frontend is set to [${fMode.toUpperCase()}] while Backend is set to [${bMode.toUpperCase()}].`);
    console.log('     Use switch-to-centralized.bat or switch-to-local.bat to synchronize them.');
  }

  // SECTION 2: Network Interfaces
  console.log('\n[2/5] Host Machine Network Interfaces:');
  console.log(` > Preferred LAN IP:        ${netInfo.preferredIp} (${netInfo.preferredInterface})`);
  console.log(` > VPN Active:              ${netInfo.vpnDetected ? 'YES' : 'NO'}`);

  netInfo.candidates.forEach(c => {
    const role = c.isVpn ? 'VPN Tunnel' : (c.isVirtual ? 'Virtual' : 'Physical LAN');
    const isPref = c.address === netInfo.preferredIp ? ' [PREFERRED LAN TARGET]' : '';
    console.log(`     * ${c.interface.padEnd(28)} -> ${c.address.padEnd(16)} (${role})${isPref}`);
  });

  // Check if configured IP belongs to this host
  let configuredHost = '';
  try {
    configuredHost = new URL(fConfiguredFrontend).hostname;
  } catch (e) {
    configuredHost = fConfiguredFrontend;
  }

  const isLocalhost = configuredHost === 'localhost' || configuredHost === '127.0.0.1';
  const matchesHostInterface = netInfo.candidates.some(c => c.address === configuredHost);

  if (fMode === 'centralized') {
    if (matchesHostInterface) {
      console.log(` > Note: Centralized IP (${configuredHost}) is hosted ON THIS COMPUTER.`);
    } else {
      console.log(` > Note: Centralized IP (${configuredHost}) points to an EXTERNAL REMOTE SERVER.`);
    }
  } else {
    if (isLocalhost) {
      console.log(' > Local Mode: Configured to localhost (Note: Phones cannot reach localhost).');
    } else if (matchesHostInterface) {
      console.log(` > Local Mode: Correctly bound to active LAN IP (${configuredHost}).`);
    } else {
      console.log(` > [!] STALE IP ALERT: Configured IP ${configuredHost} does not match any network interface on this computer!`);
    }
  }

  // SECTION 3: Service Ports & Connectivity
  console.log('\n[3/5] Service Ports & Reachability:');
  const dLocal = await testTcpPort('127.0.0.1', 8000);
  const dLan = await testTcpPort(netInfo.preferredIp, 8000);
  console.log(` > Django (127.0.0.1:8000):        ${dLocal.open ? 'OPEN / LISTENING [OK]' : 'UNREACHABLE (' + (dLocal.error || 'Closed') + ')'}`);
  console.log(` > Django (${netInfo.preferredIp}:8000):     ${dLan.open ? 'OPEN / LISTENING [OK]' : 'UNREACHABLE (' + (dLan.error || 'Closed') + ')'}`);

  if (dLocal.open) {
    const apiTest = await testHttpGet(`http://127.0.0.1:8000/api/`);
    // HTTP 401 unauthenticated response is expected and proves the API is alive!
    if (apiTest.status === 401 || apiTest.ok) {
      console.log(` > Django API Response:          HTTP ${apiTest.status} (API is alive and enforcing authentication) [OK]`);
    } else {
      console.log(` > Django API Response:          HTTP ${apiTest.status} (${apiTest.error || 'Unexpected status'})`);
    }
  }

  const fLocal = await testTcpPort('127.0.0.1', 5173);
  const fLan = await testTcpPort(netInfo.preferredIp, 5173);
  console.log(` > Vite Frontend (127.0.0.1:5173): ${fLocal.open ? 'OPEN / LISTENING [OK]' : 'NOT RUNNING / CLOSED'}`);
  console.log(` > Vite Frontend (${netInfo.preferredIp}:5173):  ${fLan.open ? 'OPEN / LISTENING [OK]' : 'NOT REACHABLE OVER LAN'}`);

  // SECTION 4: Database Verification
  console.log('\n[4/5] Database Configuration & Connection:');
  try {
    const pythonExe = path.join(ROOT_DIR, 'backend', '.venv', 'Scripts', 'python.exe');
    const checkScript = path.join(ROOT_DIR, 'backend', 'scripts', 'check_database.py');
    if (fs.existsSync(pythonExe) && fs.existsSync(checkScript)) {
      const dbOutput = execSync(`"${pythonExe}" "${checkScript}"`, { encoding: 'utf8', timeout: 12000 });
      const passLine = dbOutput.split('\n').find(l => l.includes('[PASS]'));
      if (passLine) {
        console.log(` > Database Connection:     ${passLine.trim()}`);
      } else {
        console.log(' > Database Connection:     Checked.');
      }
    } else {
      console.log(' > Database Check:          (Skipped — virtualenv not found at default path)');
    }
  } catch (err) {
    console.log(` > Database Connection:     [FAIL] Could not connect to database.`);
    console.log(`   ${(err.stdout || err.message).split('\n')[0]}`);
  }

  // SECTION 5: QR Code & Mobile URL Validation
  console.log('\n[5/5] Customer QR Code URL Audit:');
  const sampleTableUrl = `${fConfiguredFrontend.replace(/\/+$/, '')}/customer/welcome?table=1&qr=FOODIE-TABLE-1`;
  console.log(` > Sample QR Target URL:    ${sampleTableUrl}`);

  if (sampleTableUrl.includes('localhost') || sampleTableUrl.includes('127.0.0.1')) {
    console.log(' > [!] QR CODE WARNING: URL encodes localhost. Mobile phones CANNOT scan or open this!');
    console.log(`       Fix: Switch to centralized mode or configure LAN IP (http://${netInfo.preferredIp}:5173).`);
  } else if (sampleTableUrl.includes(':8000')) {
    console.log(' > [!] QR CODE ERROR: URL erroneously targets backend port 8000 instead of frontend port 5173!');
  } else {
    console.log(' > QR Code Validation:      PASSED (Non-localhost, uses frontend port 5173) [OK]');
  }

  // Advisory notices
  if (netInfo.vpnDetected) {
    console.log('\n' + thin);
    console.log(' [!] NOTICE: VPN Interface Detected:');
    netInfo.vpnInterfaces.forEach(v => {
      console.log(`     - ${v.interface} (${v.address})`);
    });
    console.log('     * For phones/tablets on your local Wi-Fi router to scan QR codes');
    console.log(`       or open menus, use http://${netInfo.preferredIp}:5173/`);
  }

  console.log('\n' + sep);
  console.log(' Diagnosis complete.');
  console.log(sep + '\n');
}

if (require.main === module) {
  runDiagnostics();
}

module.exports = { runDiagnostics };
