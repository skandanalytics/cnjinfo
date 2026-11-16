const playwright = require('D:/curser/foodie-push/frontend/node_modules/playwright-core');

(async () => {
  console.log('=== STARTING VISIBLE BROWSER TESTING (headless: false) ===');
  const browser = await playwright.chromium.launch({
    headless: false,
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
  });

  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 }
  });
  const page = await context.newPage();

  const apiRequests = [];
  const branch12Requests = [];
  const branch13Requests = [];
  const consoleErrors = [];
  const targetBranchErrors = [];

  page.on('request', req => {
    const url = req.url();
    if (url.includes('/api/')) {
      if (url.includes('branch=')) {
        apiRequests.push({ method: req.method(), url });
        if (url.includes('branch=12')) {
          branch12Requests.push({ method: req.method(), url });
          console.error('❌ DETECTED UNEXPECTED BRANCH 12 REQUEST:', req.method(), url);
        }
        if (url.includes('branch=13')) {
          branch13Requests.push({ method: req.method(), url });
        }
      }
    }
  });

  page.on('response', async res => {
    const url = res.url();
    if (url.includes('/api/cart/')) {
      console.log(`[CART API RESPONSE] ${res.status()} ${url}`);
      try {
        const text = await res.text();
        if (text.includes('You cannot order for this branch')) {
          console.error('❌ CART ERROR DETECTED IN RESPONSE:', text);
          targetBranchErrors.push(text);
        }
      } catch (e) {}
    }
  });

  page.on('console', msg => {
    const text = msg.text();
    if (msg.type() === 'error' || text.toLowerCase().includes('error')) {
      consoleErrors.push(text);
    }
    if (text.includes('You cannot order for this branch')) {
      targetBranchErrors.push(text);
      console.error('❌ CONSOLE ERROR DETECTED:', text);
    }
  });

  page.on('pageerror', err => {
    consoleErrors.push(err.message);
  });

  try {
    // 1. Navigate to login
    console.log('\n--- STEP 1: LOGIN AS MANAGER TEJU (EMP0126) ---');
    await page.goto('http://localhost:5173/login');
    await page.waitForLoadState('networkidle');

    // Fill login form
    const codeInput = page.locator('input[placeholder*="Employee Code"], input[name="employeeCode"], input[type="text"]').first();
    const passInput = page.locator('input[type="password"]').first();
    const submitBtn = page.locator('button[type="submit"]').first();

    await codeInput.fill('EMP0126');
    await passInput.fill('Admin@123');
    await submitBtn.click();

    // Wait for redirect to admin
    await page.waitForURL('**/admin/**', { timeout: 10000 });
    console.log('✅ Logged in successfully. Current URL:', page.url());
    await page.waitForTimeout(2000);

    // 2. Verify header displays kb restaurant (BR013)
    console.log('\n--- STEP 2: VERIFY HEADER DISPLAYS KB RESTAURANT (BR013) ---');
    const headerText = await page.locator('header, .navbar, nav').innerText();
    console.log('Header text preview:', headerText.replace(/\n+/g, ' | '));

    const hasBranch13 = headerText.includes('kb restaurant') || headerText.includes('BR013');
    console.log('Header contains "kb restaurant" or "BR013":', hasBranch13 ? '✅ YES' : '❌ NO');

    // Check storage state
    const storageData = await page.evaluate(() => {
      return {
        foodie_admin_selected_branch: localStorage.getItem('foodie_admin_selected_branch'),
        foodie_public_branch: sessionStorage.getItem('foodie_public_branch'),
        foodie_public_branch_local: localStorage.getItem('foodie_public_branch'),
        auth: JSON.parse(sessionStorage.getItem('foodie_auth_admin') || '{}')
      };
    });
    console.log('Storage evaluation:', JSON.stringify(storageData, null, 2));

    // 3. Navigate through Admin Pages: Dashboard, Tables, POS, Orders, Inventory, Offers/Coupons
    const routes = [
      { name: 'Dashboard', url: 'http://localhost:5173/admin/dashboard' },
      { name: 'Tables', url: 'http://localhost:5173/admin/tables' },
      { name: 'POS', url: 'http://localhost:5173/admin/pos' },
      { name: 'Orders', url: 'http://localhost:5173/admin/orders' },
      { name: 'Inventory', url: 'http://localhost:5173/admin/inventory' },
      { name: 'Coupons/Offers', url: 'http://localhost:5173/admin/offers' }
    ];

    for (const r of routes) {
      console.log(`\n--- STEP 3: NAVIGATING TO ${r.name} (${r.url}) ---`);
      await page.goto(r.url);
      await page.waitForTimeout(2500);
      console.log(`✅ ${r.name} loaded.`);
    }

    // 4. Test POS cart operation
    console.log('\n--- STEP 4: POS & CART INTERACTION TEST ---');
    await page.goto('http://localhost:5173/admin/pos');
    await page.waitForTimeout(2000);

    // Add a dish to cart if dishes exist
    const dishCard = page.locator('.card, [data-dish-id], button:has-text("Add")').first();
    const dishCount = await dishCard.count();
    if (dishCount > 0) {
      console.log('Clicking to add item to POS cart...');
      await dishCard.click();
      await page.waitForTimeout(1500);
    }

    // Evaluate CartService directly inside browser context
    console.log('\n--- STEP 5: VERIFY ACTIVE BRANCH RESOLUTION & CART API IN BROWSER CONTEXT ---');
    const browserCartResult = await page.evaluate(async () => {
      try {
        const branchResMod = await import('/src/services/branchResolution.js');
        const activeB = branchResMod.getActiveBranchId();

        const token = sessionStorage.getItem('foodie_staff_access') || localStorage.getItem('foodie_staff_access');
        const resp = await fetch(`/api/cart/?branch=${activeB}`, {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Accept': 'application/json'
          }
        });
        const status = resp.status;
        const data = await resp.json();
        return { success: true, activeBranch: activeB, status, data };
      } catch (err) {
        return { success: false, error: err.message };
      }
    });
    console.log('In-browser Cart fetch evaluation:', JSON.stringify(browserCartResult, null, 2));

    // Summary of results
    console.log('\n==================================================');
    console.log('TEST SUMMARY & AUDIT RESULTS:');
    console.log('==================================================');
    console.log(`Total API requests with branch param: ${apiRequests.length}`);
    console.log(`Requests with branch=13: ${branch13Requests.length}`);
    console.log(`Requests with branch=12 (SHOULD BE ZERO): ${branch12Requests.length}`);
    if (branch12Requests.length > 0) {
      console.error('❌ FAIL: Following requests used branch=12:', branch12Requests);
    } else {
      console.log('✅ PASS: Zero requests used branch=12!');
    }

    console.log(`Target branch error occurrences (SHOULD BE ZERO): ${targetBranchErrors.length}`);
    if (targetBranchErrors.length > 0) {
      console.error('❌ FAIL: "You cannot order for this branch" occurred:', targetBranchErrors);
    } else {
      console.log('✅ PASS: Zero "You cannot order for this branch" errors occurred!');
    }

    await page.waitForTimeout(3000);
  } catch (err) {
    console.error('Test execution failed:', err);
  } finally {
    await browser.close();
    console.log('Browser closed. Test finished.');
  }
})();
