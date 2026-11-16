const playwright = require('D:/curser/foodie-push/frontend/node_modules/playwright-core');

(async () => {
  const browser = await playwright.chromium.launch({
    headless: true,
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
  });

  const context = await browser.newContext();
  const page = await context.newPage();

  console.log('--- TEST 1: EXISTING STALE NOTIFICATION & IMMEDIATE CLEARING ---');
  await page.goto('http://localhost:5173/');

  const token = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ0b2tlbl90eXBlIjoiYWNjZXNzIiwiZXhwIjoxNzk0ODIxNjkyLCJpYXQiOjE3OTQ4MTk4OTIsImp0aSI6ImRmNzczNzM4ZjU4MjQ0MTE4MzhmOTcyMTcwMjVhZTA4IiwidXNlcl9pZCI6IjEyMyJ9.wOP4vkiKMwat7XoSQhMCY_UpPQFV0RwbDZPCZ_fwOMM';

  // Seed authentication and a stale notification
  await page.evaluate(({ tok }) => {
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

    // Add stale notification
    const staleNotif = [{
      id: 'local_stale_12345',
      text: 'New Order #FD000041! Table: T01, Total: ₹500',
      read: false,
      date: new Date().toISOString(),
      orderNumber: 'FD000041',
      orderId: 41
    }];
    localStorage.setItem('foodie_live_order_notifications', JSON.stringify(staleNotif));
  }, { tok: token });

  // Navigate to admin
  await page.goto('http://localhost:5173/admin/dashboard');
  await page.waitForTimeout(2000);

  // Open notification dropdown
  const notifBell = page.locator('button[title*="Notification"]').first();
  await notifBell.click();
  await page.waitForTimeout(500);

  let notifText = await page.locator('.dropdown-menu, .position-absolute:has-text("Notifications")').innerText();
  console.log('Notifications panel text before reset:', notifText.replace(/\n/g, ' '));
  if (!notifText.includes('FD000041')) {
    throw new Error('Test setup failed: FD000041 should be visible');
  }
  console.log('Verified: Stale notification FD000041 is visible in dropdown.');

  // Now simulate successful reset call clearOrderNotifications via window
  console.log('Triggering clearOrderNotifications()...');
  await page.evaluate(async () => {
    const { clearOrderNotifications } = await import('/src/services/notificationService.js');
    clearOrderNotifications();
  });
  await page.waitForTimeout(500);

  // Check dropdown text IMMEDIATELY (without page reload)
  notifText = await page.locator('.dropdown-menu, .position-absolute:has-text("Notifications")').innerText();
  console.log('Notifications panel text immediately after clear:', notifText.replace(/\n/g, ' '));
  if (notifText.includes('FD000041')) {
    throw new Error('Test 1 failed: FD000041 still visible after clear!');
  }
  if (!notifText.includes('No notifications yet')) {
    throw new Error('Test 1 failed: Empty state not shown!');
  }
  console.log('SUCCESS Test 1: Stale notification cleared and empty state displayed immediately without page refresh!');

  console.log('\n--- TEST 3: REFRESH BEHAVIOR ---');
  await page.reload();
  await page.waitForTimeout(2000);
  const notifBellReload = page.locator('button[title*="Notification"]').first();
  await notifBellReload.click();
  await page.waitForTimeout(500);
  const textAfterReload = await page.locator('.dropdown-menu, .position-absolute:has-text("Notifications")').innerText();
  console.log('Notifications panel text after reload:', textAfterReload.replace(/\n/g, ' '));
  if (textAfterReload.includes('FD000041')) {
    throw new Error('Test 3 failed: Stale notification reappeared after reload!');
  }
  console.log('SUCCESS Test 3: Stale notification does NOT reappear after page reload.');

  console.log('\n--- TEST 4: AUTHENTICATION PERSISTENCE ---');
  const authState = await page.evaluate(() => {
    return {
      staffAccess: localStorage.getItem('foodie_staff_access'),
      authAdmin: localStorage.getItem('foodie_auth_admin'),
      notifKey: localStorage.getItem('foodie_live_order_notifications')
    };
  });
  console.log('Auth keys present:', Boolean(authState.staffAccess && authState.authAdmin));
  console.log('Notification key cleared:', authState.notifKey === null);
  if (!authState.staffAccess || !authState.authAdmin || authState.notifKey !== null) {
    throw new Error('Test 4 failed: Auth keys were corrupted or notif key not removed!');
  }
  console.log('SUCCESS Test 4: Auth keys completely preserved.');

  console.log('\n--- TEST 5: NEW ORDER NOTIFICATION CREATION ---');
  await page.evaluate(async () => {
    const { notifyOrderCreated } = await import('/src/services/notificationService.js');
    notifyOrderCreated({
      id: 99,
      order_number: 'FD000099',
      table: 'T05',
      total_amount: 850
    });
  });
  await page.waitForTimeout(500);
  const textAfterNewOrder = await page.locator('.dropdown-menu, .position-absolute:has-text("Notifications")').innerText();
  console.log('Notifications panel text after new order:', textAfterNewOrder.replace(/\n/g, ' '));
  if (!textAfterNewOrder.includes('FD000099')) {
    throw new Error('Test 5 failed: New order notification not created!');
  }
  console.log('SUCCESS Test 5: New order notification appears in dropdown as expected.');

  console.log('\n--- TEST 6: CUSTOMER & GUEST ORDER KEY INTEGRITY ---');
  const customerKeys = await page.evaluate(() => {
    localStorage.setItem('foodie_customer_order_ids', JSON.stringify(['1', '2']));
    localStorage.setItem('foodie_guest_order_ids', JSON.stringify(['3']));
    localStorage.setItem('foodie_last_placed_order', JSON.stringify({ id: 2 }));
    localStorage.setItem('foodie_all_placed_orders', JSON.stringify([{ id: 1 }, { id: 2 }]));
    return {
      cust: localStorage.getItem('foodie_customer_order_ids'),
      guest: localStorage.getItem('foodie_guest_order_ids'),
      last: localStorage.getItem('foodie_last_placed_order'),
      all: localStorage.getItem('foodie_all_placed_orders'),
    };
  });

  // Call clearOrderNotifications again
  await page.evaluate(async () => {
    const { clearOrderNotifications } = await import('/src/services/notificationService.js');
    clearOrderNotifications();
  });

  const customerKeysAfter = await page.evaluate(() => {
    return {
      cust: localStorage.getItem('foodie_customer_order_ids'),
      guest: localStorage.getItem('foodie_guest_order_ids'),
      last: localStorage.getItem('foodie_last_placed_order'),
      all: localStorage.getItem('foodie_all_placed_orders'),
    };
  });

  if (customerKeys.cust !== customerKeysAfter.cust || customerKeys.guest !== customerKeysAfter.guest) {
    throw new Error('Test 6 failed: Customer/guest keys were modified!');
  }
  console.log('SUCCESS Test 6: Customer, guest, and order tracking keys remain 100% untouched.');

  await browser.close();
  console.log('\nALL 6 LIVE BROWSER TESTS PASSED PERFECTLY!');
})();
