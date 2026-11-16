const playwright = require('D:/curser/foodie-push/frontend/node_modules/playwright-core');

(async () => {
  const browser = await playwright.chromium.launch({
    headless: true,
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
  });

  const context = await browser.newContext();
  const page = await context.newPage();

  const warnings = [];
  const errors = [];

  page.on('console', msg => {
    const text = msg.text();
    if (msg.type() === 'warning' || text.toLowerCase().includes('warning')) {
      warnings.push(text);
    }
    if (msg.type() === 'error' || text.toLowerCase().includes('error')) {
      errors.push(text);
    }
    if (text.includes('uncontrolled') || text.includes('controlled')) {
      console.log('TARGET WARNING DETECTED:', text);
    }
  });

  // Navigate to base
  await page.goto('http://localhost:5173/');

  const token = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ0b2tlbl90eXBlIjoiYWNjZXNzIiwiZXhwIjoxNzk0ODIxNjkyLCJpYXQiOjE3OTQ4MTk4OTIsImp0aSI6ImRmNzczNzM4ZjU4MjQ0MTE4MzhmOTcyMTcwMjVhZTA4IiwidXNlcl9pZCI6IjEyMyJ9.wOP4vkiKMwat7XoSQhMCY_UpPQFV0RwbDZPCZ_fwOMM';

  // Set auth credentials for admin
  await page.evaluate((tok) => {
    const adminUser = {
      token: tok,
      isAuthenticated: true,
      user: {
        id: 13,
        email: 'bypreddy10@gmail.com',
        name: 'Yamini Prasanna Reddy',
        role: 'admin',
        backendRole: 'SUPER_ADMIN',
        branchId: 12
      }
    };
    sessionStorage.setItem('foodie_staff_access', tok);
    localStorage.setItem('foodie_staff_access', tok);
    sessionStorage.setItem('foodie_auth_admin', JSON.stringify(adminUser));
    localStorage.setItem('foodie_auth_admin', JSON.stringify(adminUser));
    localStorage.setItem('foodie_admin_selected_branch', '12');
  }, token);

  // Go to menu editor for all items
  await page.goto('http://localhost:5173/admin/menus/all');
  await page.waitForTimeout(2500);

  console.log('Page loaded URL:', page.url());

  // Find Edit button on any dish card
  const editBtn = page.locator('button:has-text("Edit"), button[title*="Edit"]').first();
  const editCount = await editBtn.count();
  console.log('Found edit buttons:', editCount);

  if (editCount > 0) {
    console.log('Clicking Edit Dish button...');
    await editBtn.click();
    await page.waitForTimeout(1000);

    const urlBtn = page.locator('button:has-text("URL"), button:has-text("🔗 URL")').first();
    const fileBtn = page.locator('button:has-text("File"), button:has-text("📁 File")').first();

    if (await urlBtn.count() > 0) {
      console.log('Toggling URL in Edit Dish...');
      await urlBtn.click();
      await page.waitForTimeout(500);
      console.log('Toggling File in Edit Dish...');
      await fileBtn.click();
      await page.waitForTimeout(500);
      await urlBtn.click();
      await page.waitForTimeout(500);
    }

    const closeBtn = page.locator('button:has-text("Cancel"), button:has-text("Close")').first();
    if (await closeBtn.count() > 0) {
      console.log('Closing Edit modal...');
      await closeBtn.click();
      await page.waitForTimeout(500);
    }
  }

  // Also test Add Dish modal from this page
  const addDishBtn = page.locator('button:has-text("Add Dish"), button:has-text("Add New Dish")').first();
  if (await addDishBtn.count() > 0) {
    console.log('Clicking Add Dish from menu editor...');
    await addDishBtn.click();
    await page.waitForTimeout(1000);

    const urlBtn = page.locator('button:has-text("URL"), button:has-text("🔗 URL")').first();
    const fileBtn = page.locator('button:has-text("File"), button:has-text("📁 File")').first();
    if (await urlBtn.count() > 0) {
      await urlBtn.click();
      await page.waitForTimeout(500);
      await fileBtn.click();
      await page.waitForTimeout(500);
    }
    const closeBtn = page.locator('button:has-text("Cancel"), button:has-text("Close")').first();
    if (await closeBtn.count() > 0) {
      await closeBtn.click();
      await page.waitForTimeout(500);
    }
  }

  const uncontrolledWarnings = warnings.filter(w => w.toLowerCase().includes('uncontrolled'));
  console.log('--- TEST SUMMARY ---');
  console.log('Total console warnings captured:', warnings.length);
  console.log('Uncontrolled-to-controlled warnings count:', uncontrolledWarnings.length);
  if (uncontrolledWarnings.length > 0) {
    console.log('Warnings:', uncontrolledWarnings);
  } else {
    console.log('SUCCESS: ZERO uncontrolled-to-controlled warnings observed across Add and Edit Dish modals!');
  }

  await browser.close();
  process.exit(uncontrolledWarnings.length === 0 ? 0 : 1);
})();
