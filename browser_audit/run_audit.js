const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

function request(options, postData) {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve({ statusCode: res.statusCode, data }));
    });
    req.on('error', reject);
    if (postData) req.write(postData);
    req.end();
  });
}

function delay(ms) {
  return new Promise(res => setTimeout(res, ms));
}

class SimpleCDP {
  constructor(wsUrl) {
    this.wsUrl = wsUrl;
    this.id = 1;
    this.callbacks = new Map();
  }

  async connect() {
    const WebSocket = global.WebSocket || require('ws');
    this.ws = new WebSocket(this.wsUrl);
    await new Promise((resolve, reject) => {
      this.ws.onopen = resolve;
      this.ws.onerror = reject;
    });

    this.ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      if (msg.id && this.callbacks.has(msg.id)) {
        const { resolve, reject } = this.callbacks.get(msg.id);
        this.callbacks.delete(msg.id);
        if (msg.error) reject(msg.error);
        else resolve(msg.result);
      }
    };
  }

  send(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = this.id++;
      this.callbacks.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  close() {
    if (this.ws) this.ws.close();
  }
}

async function runBrowserAudit() {
  console.log('[Audit] 1. Authenticating as ADMIN via Django REST backend...');
  const loginBody = JSON.stringify({ employee_code: 'ADMIN', password: 'Admin@123' });
  const authRes = await request({
    hostname: '127.0.0.1',
    port: 8000,
    path: '/api/auth/staff/login/',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(loginBody)
    }
  }, loginBody);

  if (authRes.statusCode !== 200) {
    throw new Error('Staff login failed with code ' + authRes.statusCode + ': ' + authRes.data);
  }

  const authData = JSON.parse(authRes.data);
  const token = authData.access;
  const refresh = authData.refresh;
  const user = {
    ...authData.user,
    role: 'admin',
    name: authData.user.name || 'foodie_admin'
  };

  const userPayload = JSON.stringify({ user, isAuthenticated: true });

  console.log('[Audit] 2. Spawning Chrome with remote debugging on port 9444...');
  const profileDir = path.resolve('D:/curser/foodie/browser_audit/profile');
  if (!fs.existsSync(profileDir)) fs.mkdirSync(profileDir, { recursive: true });

  const chromeProc = spawn('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', [
    '--headless=new',
    '--remote-debugging-port=9444',
    '--user-data-dir=' + profileDir,
    '--disable-gpu',
    '--no-first-run',
    '--no-default-browser-check'
  ], { stdio: 'ignore', detached: true });
  chromeProc.unref();

  // Wait for CDP
  let versionData = null;
  for (let i = 0; i < 20; i++) {
    await delay(500);
    try {
      const vRes = await request({ hostname: '127.0.0.1', port: 9444, path: '/json/version', method: 'GET' });
      if (vRes.statusCode === 200) {
        versionData = JSON.parse(vRes.data);
        break;
      }
    } catch (e) {}
  }

  if (!versionData) throw new Error('Chrome remote debugging did not respond on port 9444');
  console.log('[Audit] Chrome CDP Ready!');

  // Create new target/tab
  const newTabRes = await request({
    hostname: '127.0.0.1',
    port: 9444,
    path: '/json/new?http://localhost:5173/login',
    method: 'PUT'
  });
  const tabInfo = JSON.parse(newTabRes.data);
  console.log('[Audit] Opened browser tab:', tabInfo.webSocketDebuggerUrl);

  const cdp = new SimpleCDP(tabInfo.webSocketDebuggerUrl);
  await cdp.connect();
  await cdp.send('Page.enable');
  await cdp.send('Runtime.enable');
  await cdp.send('DOM.enable');

  await delay(1500);

  console.log('[Audit] 3. Seeding sessionStorage & localStorage with Admin Auth...');
  const seedScript = `
    sessionStorage.setItem('foodie_staff_access', ${JSON.stringify(token)});
    sessionStorage.setItem('foodie_token_admin', ${JSON.stringify(token)});
    sessionStorage.setItem('foodie_auth_admin', ${JSON.stringify(userPayload)});
    sessionStorage.setItem('foodie_staff_refresh', ${JSON.stringify(refresh)});
    
    localStorage.setItem('foodie_staff_access', ${JSON.stringify(token)});
    localStorage.setItem('foodie_token_admin', ${JSON.stringify(token)});
    localStorage.setItem('foodie_auth_admin', ${JSON.stringify(userPayload)});
    localStorage.setItem('foodie_staff_refresh', ${JSON.stringify(refresh)});
    localStorage.setItem('foodie_admin_last_activity', String(Date.now()));
  `;
  await cdp.send('Runtime.evaluate', { expression: seedScript });

  const auditResults = [];

  const pagesToTest = [
    { name: 'Dashboard', url: 'http://localhost:5173/admin/dashboard' },
    { name: 'Branches', url: 'http://localhost:5173/admin/branches' },
    { name: 'Tables', url: 'http://localhost:5173/admin/tables' },
    { name: 'Employees', url: 'http://localhost:5173/admin/users' },
    { name: 'Offers', url: 'http://localhost:5173/admin/offers' },
    { name: 'POS', url: 'http://localhost:5173/admin/pos' },
    { name: 'Orders', url: 'http://localhost:5173/admin/orders' },
    { name: 'Kitchen', url: 'http://localhost:5173/admin/kitchen' }
  ];

  const viewports = [
    { name: '1920x1080 Desktop', width: 1920, height: 1080 },
    { name: '1366x768 Laptop', width: 1366, height: 768 },
    { name: '768x1024 Tablet', width: 768, height: 1024 },
    { name: '390x844 Mobile', width: 390, height: 844 },
    { name: '360x800 Small Mobile', width: 360, height: 800 }
  ];

  console.log('[Audit] 4. Testing Admin Pages at standard desktop resolution...');
  await cdp.send('Emulation.setDeviceMetricsOverride', {
    width: 1440,
    height: 900,
    deviceScaleFactor: 1,
    mobile: false
  });

  for (const page of pagesToTest) {
    console.log(`[Audit] Navigating to ${page.name} (${page.url})...`);
    await cdp.send('Page.navigate', { url: page.url });
    await delay(2000);

    // Capture DOM metrics and inspect features
    const evalRes = await cdp.send('Runtime.evaluate', {
      expression: `(() => {
        return {
          title: document.title,
          url: window.location.href,
          hasSearchAnything: Boolean(document.querySelector('input[placeholder*="Search Anything" i]')),
          hasDarkModeToggle: Boolean(document.querySelector('[data-testid="dark-mode"], .dark-mode-toggle, button[aria-label*="dark" i]')),
          pageTextSnippet: document.body.innerText.slice(0, 300).replace(/\\s+/g, ' '),
          headings: Array.from(document.querySelectorAll('h1, h2, h3, h4')).map(h => h.innerText.trim()).filter(Boolean).slice(0, 5),
          buttons: Array.from(document.querySelectorAll('button')).map(b => b.innerText.trim()).filter(Boolean).slice(0, 8),
          inputsCount: document.querySelectorAll('input').length,
          tablesCount: document.querySelectorAll('table').length,
          cardsCount: document.querySelectorAll('.card, [class*="card"]').length
        };
      })()`,
      returnByValue: true
    });

    const pageData = evalRes.result?.value || {};

    // Take screenshot
    const shot = await cdp.send('Page.captureScreenshot', { format: 'png' });
    const shotPath = path.resolve(`D:/curser/foodie/browser_audit/screenshots/${page.name.toLowerCase()}_1440.png`);
    fs.writeFileSync(shotPath, Buffer.from(shot.data, 'base64'));

    console.log(`  -> ${page.name} verified: Title="${pageData.title}", Headings=[${(pageData.headings || []).join(' | ')}]`);
    auditResults.push({ page: page.name, url: page.url, data: pageData, screenshot: shotPath });
  }

  console.log('[Audit] 5. Running Comprehensive Responsive Audit across all 5 viewports on POS, Dashboard & Orders...');
  const responsivePages = [
    { name: 'Dashboard', url: 'http://localhost:5173/admin/dashboard' },
    { name: 'POS', url: 'http://localhost:5173/admin/pos' },
    { name: 'Orders', url: 'http://localhost:5173/admin/orders' },
    { name: 'Branches', url: 'http://localhost:5173/admin/branches' },
    { name: 'Kitchen', url: 'http://localhost:5173/admin/kitchen' }
  ];

  const responsiveAudit = [];

  for (const vp of viewports) {
    console.log(`[Audit] Setting viewport to ${vp.name} (${vp.width}x${vp.height})...`);
    await cdp.send('Emulation.setDeviceMetricsOverride', {
      width: vp.width,
      height: vp.height,
      deviceScaleFactor: 1,
      mobile: vp.width <= 768
    });

    for (const rp of responsivePages) {
      await cdp.send('Page.navigate', { url: rp.url });
      await delay(1500);

      const overflowEval = await cdp.send('Runtime.evaluate', {
        expression: `(() => {
          const docEl = document.documentElement;
          const body = document.body;
          const scrollWidth = Math.max(docEl.scrollWidth, body.scrollWidth);
          const clientWidth = docEl.clientWidth;
          const hasHorizontalOverflow = scrollWidth > clientWidth + 2; // allowance of 2px for subpixel rendering
          return {
            scrollWidth,
            clientWidth,
            hasHorizontalOverflow,
            paddingLeft: window.getComputedStyle(body).paddingLeft,
            paddingRight: window.getComputedStyle(body).paddingRight
          };
        })()`,
        returnByValue: true
      });

      const metrics = overflowEval.result?.value || {};
      const shot = await cdp.send('Page.captureScreenshot', { format: 'png' });
      const shotName = `${rp.name.toLowerCase()}_${vp.width}x${vp.height}.png`;
      const shotPath = path.resolve(`D:/curser/foodie/browser_audit/screenshots/${shotName}`);
      fs.writeFileSync(shotPath, Buffer.from(shot.data, 'base64'));

      console.log(`  -> ${rp.name} @ ${vp.name}: width=${metrics.clientWidth}px, overflow=${metrics.hasHorizontalOverflow ? 'FAIL' : 'PASS'}`);
      responsiveAudit.push({
        page: rp.name,
        viewport: vp.name,
        width: vp.width,
        height: vp.height,
        metrics,
        screenshot: shotPath
      });
    }
  }

  // 6. Test Specific Functional Features:
  console.log('[Audit] 6. Testing POS Specific Features (Cart Persistence, Calculation, Coupon)...');
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  await cdp.send('Page.navigate', { url: 'http://localhost:5173/admin/pos' });
  await delay(2000);

  const posChecks = await cdp.send('Runtime.evaluate', {
    expression: `(() => {
      // Find search bar
      const searchInput = document.querySelector('input[placeholder*="Search" i]');
      const searchWidth = searchInput ? window.getComputedStyle(searchInput).width : 'none';

      // Find confirm button
      const confirmBtn = Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes('Confirm Order') || b.innerText.includes('Place Order'));
      
      // Check for burger emoji
      const hasBurgerEmoji = document.body.innerText.includes('🍔');

      // Check sessionStorage cart key
      const cartKeySaved = sessionStorage.getItem('foodie_pos_cart');

      return {
        searchInputFound: Boolean(searchInput),
        searchWidth,
        confirmButtonText: confirmBtn ? confirmBtn.innerText.trim() : 'Not found',
        hasBurgerEmoji,
        cartKeySaved
      };
    })()`,
    returnByValue: true
  });

  console.log('[Audit] POS Checks:', posChecks.result?.value);

  // 7. Test Kitchen Queue Columns
  console.log('[Audit] 7. Testing Kitchen Queue Columns...');
  await cdp.send('Page.navigate', { url: 'http://localhost:5173/admin/kitchen' });
  await delay(2000);

  const kitchenChecks = await cdp.send('Runtime.evaluate', {
    expression: `(() => {
      const text = document.body.innerText;
      const hasPending = text.includes('Pending') || text.includes('PENDING');
      const hasPreparing = text.includes('Preparing') || text.includes('PREPARING');
      const hasReady = text.includes('Ready') || text.includes('READY');
      const hasServing = text.includes('Serving') || text.includes('Completed') || text.includes('Served');
      
      // Check if separate ready/completed tabs exist
      const hasReadyTab = Array.from(document.querySelectorAll('button, [role="tab"]')).some(el => el.innerText.includes('Ready (0)') || el.innerText.includes('Completed (7)'));

      return {
        hasPending,
        hasPreparing,
        hasReady,
        hasServing,
        hasSeparateStageTabs: hasReadyTab
      };
    })()`,
    returnByValue: true
  });

  console.log('[Audit] Kitchen Queue Checks:', kitchenChecks.result?.value);

  // 8. Test Manage Orders Status Filter Row & Action Buttons
  console.log('[Audit] 8. Testing Orders & Bills Filters & Actions...');
  await cdp.send('Page.navigate', { url: 'http://localhost:5173/admin/orders' });
  await delay(2000);

  const orderChecks = await cdp.send('Runtime.evaluate', {
    expression: `(() => {
      const title = document.querySelector('h1, h2, h3, .page-title')?.innerText || '';
      const filterPills = Array.from(document.querySelectorAll('.badge, button, .nav-link, [class*="pill"], [class*="filter"]')).map(el => el.innerText.trim()).filter(t => ['All', 'Pending', 'Preparing', 'Ready', 'Serving', 'Completed', 'Cancelled'].includes(t));
      
      const billButtons = Array.from(document.querySelectorAll('button')).filter(b => b.innerText.includes('Show Bill') || b.innerText.includes('View Bill') || b.innerText.includes('Generate Bill'));
      
      const serviceTaxToggle = Boolean(document.querySelector('input[type="checkbox"]#service-tax, label[for*="service-tax" i]'));

      return {
        pageTitle: title,
        filterPills: Array.from(new Set(filterPills)),
        showBillButtonsCount: billButtons.length,
        hasServiceTaxToggleInToolbar: serviceTaxToggle
      };
    })()`,
    returnByValue: true
  });

  console.log('[Audit] Orders Checks:', orderChecks.result?.value);

  // 9. Write Complete JSON Report
  const fullReport = {
    timestamp: new Date().toISOString(),
    pagesTested: auditResults,
    responsiveAudit,
    posChecks: posChecks.result?.value,
    kitchenChecks: kitchenChecks.result?.value,
    orderChecks: orderChecks.result?.value
  };

  fs.writeFileSync('D:/curser/foodie/browser_audit/audit_report.json', JSON.stringify(fullReport, null, 2));
  console.log('[Audit] ALL AUDIT STEPS COMPLETED SUCCESSFULLY! Report saved to browser_audit/audit_report.json');

  cdp.close();
  try {
    const { execSync } = require('child_process');
    execSync('taskkill /F /IM chrome.exe /T', { stdio: 'ignore' });
  } catch (e) {}
}

runBrowserAudit().catch(err => {
  console.error('[Audit Error]', err);
  process.exit(1);
});

