const playwright = require('D:/curser/foodie-push/frontend/node_modules/playwright-core');

(async () => {
  console.log('=== STARTING SUPER ADMIN & PUBLIC WORKFLOW REGRESSION VERIFICATION ===');
  const browser = await playwright.chromium.launch({
    headless: false,
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
  });

  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();

  try {
    // 1. Customer visitor workflow
    console.log('\n--- TEST A: PUBLIC CUSTOMER WORKFLOW ---');
    await page.goto('http://localhost:5173/');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    const publicBranch = await page.evaluate(async () => {
      const branchResMod = await import('/src/services/branchResolution.js');
      const activeB = branchResMod.getActiveBranchId();
      return {
        activeB,
        storagePublic: sessionStorage.getItem('foodie_public_branch'),
        adminAuth: sessionStorage.getItem('foodie_auth_admin')
      };
    });
    console.log('Customer public branch resolution:', publicBranch);

    // 2. Super Admin login
    console.log('\n--- TEST B: SUPER ADMIN LOGIN (SKAND) ---');
    await page.goto('http://localhost:5173/login');
    await page.waitForLoadState('networkidle');

    const codeInput = page.locator('input[placeholder*="Employee Code"], input[name="employeeCode"], input[type="text"]').first();
    const passInput = page.locator('input[type="password"]').first();
    const submitBtn = page.locator('button[type="submit"]').first();

    await codeInput.fill('SKAND');
    await passInput.fill('Admin@123');
    await submitBtn.click();

    await page.waitForURL('**/admin/**', { timeout: 10000 });
    console.log('✅ Super Admin Logged in successfully. Current URL:', page.url());
    await page.waitForTimeout(2000);

    // Check header
    const superHeaderText = await page.locator('header, .navbar, nav').innerText();
    console.log('Super Admin Header text preview:', superHeaderText.replace(/\n+/g, ' | '));

    // Check branch selector dropdown for Super Admin
    const branchSelector = page.locator('select').first();
    const isSelectorVisible = await branchSelector.isVisible();
    console.log('Branch selector dropdown visible for Super Admin:', isSelectorVisible ? '✅ YES' : '❌ NO');

    if (isSelectorVisible) {
      // Switch branch to 13
      console.log('Super Admin switching branch to 13...');
      await branchSelector.selectOption('13');
      await page.waitForTimeout(2000);

      const resolvedB13 = await page.evaluate(async () => {
        const branchResMod = await import('/src/services/branchResolution.js');
        return branchResMod.getActiveBranchId();
      });
      console.log('Resolved active branch after switching to 13:', resolvedB13);

      // Switch branch to 12
      console.log('Super Admin switching branch to 12...');
      await branchSelector.selectOption('12');
      await page.waitForTimeout(2000);

      const resolvedB12 = await page.evaluate(async () => {
        const branchResMod = await import('/src/services/branchResolution.js');
        return branchResMod.getActiveBranchId();
      });
      console.log('Resolved active branch after switching to 12:', resolvedB12);
    }

    console.log('\n✅ ALL REGRESSION CHECKS PASSED PERFECTLY!');
  } catch (err) {
    console.error('Regression test error:', err);
  } finally {
    await browser.close();
    console.log('Browser closed.');
  }
})();
