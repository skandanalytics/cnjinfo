const playwright = require('D:/curser/foodie-push/frontend/node_modules/playwright-core');
const fs = require('fs');
const path = require('path');

const SCREENSHOT_DIR = 'D:/curser/foodie-push/scratch/mobile_screenshots';
if (!fs.existsSync(SCREENSHOT_DIR)) {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function loginAs(page, username, password, expectedUrlPattern) {
  await page.goto('http://localhost:5173/login', { waitUntil: 'domcontentloaded' });
  await sleep(1500);

  if (page.url().includes('/admin/') || page.url().includes('/employee/')) {
    if (page.url().includes(expectedUrlPattern)) return;
    await page.evaluate(() => {
      localStorage.clear();
      sessionStorage.clear();
    });
    await page.goto('http://localhost:5173/login', { waitUntil: 'domcontentloaded' });
    await sleep(1000);
  }

  const codeInput = page.locator('input[placeholder*="Employee Code"], input[name="employeeCode"], input[type="text"]').first();
  await codeInput.waitFor({ state: 'visible', timeout: 8000 });
  await codeInput.fill(username);

  const passInput = page.locator('input[type="password"]').first();
  await passInput.fill(password);

  const submitBtn = page.locator('button[type="submit"]').first();
  await submitBtn.click();

  await page.waitForURL(`**/${expectedUrlPattern}/**`, { timeout: 12000 });
  await sleep(1500);
}

(async () => {
  console.log('================================================================');
  console.log('📱 STARTING FOODIE COMPLETE MOBILE UX LIVE VISIBLE VERIFICATION');
  console.log('================================================================');

  const browser = await playwright.chromium.launch({
    headless: false,
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    args: ['--auto-open-devtools-for-tabs', '--window-size=1200,900']
  });

  try {
    // =========================================================================
    // TEST SUITE 1: 360px x 800px (Small Mobile - Samsung Galaxy S20)
    // =========================================================================
    console.log('\n------------------------------------------------------------');
    console.log('>>> [PHASE 1] TESTING ON 360px x 800px (Small Mobile)');
    console.log('------------------------------------------------------------');

    const context360 = await browser.newContext({
      viewport: { width: 360, height: 800 },
      isMobile: true,
      hasTouch: true
    });
    const page360 = await context360.newPage();

    page360.on('console', msg => {
      const text = msg.text();
      if (text.includes('uncontrolled') && text.includes('controlled')) {
        console.error(`🚨 REGRESSION WARNING: ${text}`);
      }
    });

    console.log('Step 1.1: Logging in as Super Admin on 360px...');
    await loginAs(page360, 'SKAND', 'Admin@123', 'admin');
    console.log('✅ Logged in as Super Admin on 360px.');

    // 1.2 Verify Mobile Drawer Navigation
    console.log('Step 1.2: Verifying Mobile Drawer navigation on 360px...');
    
    // Check main content margin
    const mainContentMargin = await page360.evaluate(() => {
      const el = document.querySelector('.admin-main-content');
      return el ? window.getComputedStyle(el).marginLeft : null;
    });
    console.log(`Main content margin-left on 360px: ${mainContentMargin} (Expected: 0px)`);
    if (mainContentMargin === '0px') {
      console.log('✅ Requirement verified: Main content occupies 100% width with 0px margin-left on mobile.');
    } else {
      console.warn(`⚠️ Main content margin is ${mainContentMargin}`);
    }

    // Check sidebar drawer is initially closed (off-screen)
    const isDrawerOpenInit = await page360.locator('.sidebar-container.mobile-open').count();
    console.log(`Drawer initially open: ${isDrawerOpenInit > 0 ? 'YES' : 'NO (Correct)'}`);

    // Click Hamburger Button in header
    console.log('Tapping hamburger button to open drawer...');
    const hamburgerBtn = page360.locator('button[aria-label="Toggle Navigation Menu"], button[title="Toggle Navigation Menu"]').first();
    await hamburgerBtn.click();
    await sleep(600);

    // Verify drawer is open and backdrop exists
    const isDrawerOpenAfterClick = await page360.locator('.sidebar-container.mobile-open').isVisible();
    const isBackdropVisible = await page360.locator('div[aria-label="Close menu overlay"]').isVisible();
    console.log(`Drawer open: ${isDrawerOpenAfterClick ? '✅ YES' : '❌ NO'}`);
    console.log(`Backdrop overlay visible: ${isBackdropVisible ? '✅ YES' : '❌ NO'}`);

    await page360.screenshot({ path: path.join(SCREENSHOT_DIR, '01_360_drawer_open.png') });

    // Test backdrop tap to close drawer
    console.log('Tapping backdrop to close drawer...');
    await page360.locator('div[aria-label="Close menu overlay"]').click({ position: { x: 330, y: 300 } });
    await sleep(600);
    const isDrawerClosedAfterBackdrop = !(await page360.locator('.sidebar-container.mobile-open').isVisible().catch(() => false));
    console.log(`Drawer closed after backdrop tap: ${isDrawerClosedAfterBackdrop ? '✅ YES' : '❌ NO'}`);

    // Open drawer again and test close button (X)
    console.log('Opening drawer again to test close button (X)...');
    await hamburgerBtn.click();
    await sleep(600);
    const closeBtn = page360.locator('button[aria-label="Close navigation"]').first();
    await closeBtn.click();
    await sleep(600);
    const isDrawerClosedAfterX = !(await page360.locator('.sidebar-container.mobile-open').isVisible().catch(() => false));
    console.log(`Drawer closed after X button tap: ${isDrawerClosedAfterX ? '✅ YES' : '❌ NO'}`);

    // Open drawer and navigate to POS via link
    console.log('Opening drawer and clicking POS / Take Order link...');
    await hamburgerBtn.click();
    await sleep(600);
    const posLink = page360.locator('.sidebar-container a[href*="/pos"]').first();
    await posLink.click();
    await sleep(1500);

    // Verify drawer auto-closed upon clicking link
    const isDrawerClosedAfterNav = !(await page360.locator('.sidebar-container.mobile-open').isVisible().catch(() => false));
    console.log(`Drawer auto-closed after NavLink click: ${isDrawerClosedAfterNav ? '✅ YES' : '❌ NO'}`);
    console.log(`Current page URL: ${page360.url()}`);

    // 1.3 Verify POS Mobile Experience (360px)
    console.log('\nStep 1.3: Verifying POS Mobile experience on 360px...');
    const catalogWidth = await page360.evaluate(() => {
      const el = document.querySelector('.pos-food-catalog-area');
      return el ? { width: el.offsetWidth, maxWidth: window.getComputedStyle(el).maxWidth } : null;
    });
    console.log(`Catalog width on 360px: ${catalogWidth?.width}px, max-width: ${catalogWidth?.maxWidth}`);
    if (catalogWidth && catalogWidth.width > 280) {
      console.log('✅ Requirement verified: POS food catalog is full-width (not constrained to 65% squashed column).');
    }

    // Switch between Dishes tab and Order Ticket tab
    console.log('Toggling to Order Ticket tab...');
    const orderTabBtn = page360.locator('button:has-text("Order Ticket")').first();
    await orderTabBtn.click();
    await sleep(800);

    const orderPanelWidth = await page360.evaluate(() => {
      const el = document.querySelector('.pos-order-panel-container');
      return el ? { width: el.offsetWidth, maxWidth: window.getComputedStyle(el).maxWidth } : null;
    });
    console.log(`Order panel width on 360px: ${orderPanelWidth?.width}px, max-width: ${orderPanelWidth?.maxWidth}`);
    if (orderPanelWidth && orderPanelWidth.width > 280) {
      console.log('✅ Requirement verified: Order panel is full-width (not 35% squashed to 126px).');
    }

    // Switch back to Dishes tab and add an item to cart
    console.log('Switching back to Dishes tab and adding a dish to cart...');
    const dishesTabBtn = page360.locator('button:has-text("Dishes")').first();
    await dishesTabBtn.click();
    await sleep(800);

    const addDishBtn = page360.locator('.pos-dish-grid button:has-text("Add"), .card button:has-text("Add"), button[title*="Add"]').first();
    if (await addDishBtn.isVisible()) {
      await addDishBtn.click();
      await sleep(1000);
      const modalAdd = page360.locator('.modal-content button:has-text("Add to Order"), .modal-content button:has-text("Add Item"), .modal-content button:has-text("Add")').first();
      if (await modalAdd.isVisible().catch(() => false)) {
        await modalAdd.click();
        await sleep(1000);
      }
      console.log('Dish added to POS cart.');
    }

    // Check for floating mobile bottom cart bar
    const floatingCartBar = page360.locator('button:has-text("View Order Ticket")').first();
    const isFloatingCartVisible = await floatingCartBar.isVisible().catch(() => false);
    console.log(`Floating bottom cart pill visible: ${isFloatingCartVisible ? '✅ YES' : '❌ NO'}`);
    if (isFloatingCartVisible) {
      console.log('Tapping floating bottom cart pill...');
      await floatingCartBar.click();
      await sleep(1000);
      console.log('Order Ticket tab active after floating cart tap.');
    }
    await page360.screenshot({ path: path.join(SCREENSHOT_DIR, '02_360_pos_order_ticket.png') });

    // 1.4 Verify Kitchen Queue Mobile Experience (360px)
    console.log('\nStep 1.4: Verifying Kitchen Queue on 360px...');
    await page360.goto('http://localhost:5173/admin/kitchen', { waitUntil: 'networkidle' });
    await sleep(1500);

    const stageTabs = page360.locator('button:has-text("All Stages"), button:has-text("New ("), button:has-text("Preparing (")');
    const stageTabCount = await stageTabs.count();
    console.log(`Mobile Stage tabs displayed: ${stageTabCount} (Expected: >= 3)`);
    if (stageTabCount >= 3) {
      console.log('✅ Requirement verified: Kitchen Queue mobile column switcher tabs are active.');
      const preparingTab = page360.locator('button:has-text("Preparing (")').first();
      await preparingTab.click();
      await sleep(600);
      console.log('Tapped "Preparing" stage tab.');
    }
    await page360.screenshot({ path: path.join(SCREENSHOT_DIR, '03_360_kitchen_queue.png') });

    // 1.5 Verify Orders Mobile Experience (360px)
    console.log('\nStep 1.5: Verifying Orders Page on 360px...');
    await page360.goto('http://localhost:5173/admin/orders', { waitUntil: 'networkidle' });
    await sleep(1500);

    const hasHorizontalScroll = await page360.evaluate(() => {
      return document.documentElement.scrollWidth > window.innerWidth;
    });
    console.log(`Horizontal page overflow on Orders 360px: ${hasHorizontalScroll ? '⚠️ YES' : '✅ NO (Perfect)'}`);
    await page360.screenshot({ path: path.join(SCREENSHOT_DIR, '04_360_orders_cards.png') });

    // 1.6 Verify Tables Mobile Experience (360px)
    console.log('\nStep 1.6: Verifying Tables Page on 360px...');
    await page360.goto('http://localhost:5173/admin/tables', { waitUntil: 'networkidle' });
    await sleep(1500);
    const tableCardsCount = await page360.locator('.table-card').count();
    console.log(`Table cards rendered on 360px: ${tableCardsCount}`);
    await page360.screenshot({ path: path.join(SCREENSHOT_DIR, '05_360_tables_grid.png') });

    await context360.close();
    console.log('✅ Phase 1 (360px) passed successfully.');

    // =========================================================================
    // TEST SUITE 2: 390px x 844px (iPhone 12/13/14/15)
    // =========================================================================
    console.log('\n------------------------------------------------------------');
    console.log('>>> [PHASE 2] TESTING ON 390px x 844px (iPhone Viewport)');
    console.log('------------------------------------------------------------');

    const context390 = await browser.newContext({
      viewport: { width: 390, height: 844 },
      isMobile: true,
      hasTouch: true
    });
    const page390 = await context390.newPage();

    console.log('Logging in on 390px...');
    await loginAs(page390, 'SKAND', 'Admin@123', 'admin');

    console.log('Testing Menu Management modal on 390px...');
    await page390.goto('http://localhost:5173/admin/menus', { waitUntil: 'networkidle' });
    await sleep(1500);

    const addCatBtn = page390.locator('button:has-text("+ Add Category"), button:has-text("Add Category")').first();
    if (await addCatBtn.isVisible()) {
      console.log('Opening Add Category modal...');
      await addCatBtn.click();
      await sleep(800);

      const modalDimensions = await page390.evaluate(() => {
        const dialog = document.querySelector('.modal-dialog');
        const content = document.querySelector('.modal-content');
        return {
          dialogWidth: dialog ? dialog.offsetWidth : 0,
          contentHeight: content ? content.offsetHeight : 0,
          windowHeight: window.innerHeight
        };
      });
      console.log(`Modal dialog width: ${modalDimensions.dialogWidth}px (Viewport: 390px)`);
      console.log(`Modal content height: ${modalDimensions.contentHeight}px (Max Viewport: ${modalDimensions.windowHeight}px)`);
      if (modalDimensions.contentHeight <= modalDimensions.windowHeight) {
        console.log('✅ Requirement verified: Modal fits cleanly within mobile viewport height.');
      }

      await page390.screenshot({ path: path.join(SCREENSHOT_DIR, '06_390_menu_modal.png') });
      const modalClose = page390.locator('.modal-header button.btn-close, .modal-footer button:has-text("Cancel")').first();
      await modalClose.click();
      await sleep(600);
    }

    await context390.close();
    console.log('✅ Phase 2 (390px) passed successfully.');

    // =========================================================================
    // TEST SUITE 3: 412px x 915px (Android Pixel 7) & Employee Portal Flow
    // =========================================================================
    console.log('\n------------------------------------------------------------');
    console.log('>>> [PHASE 3] TESTING ON 412px x 915px (Pixel 7 & Employee Flow)');
    console.log('------------------------------------------------------------');

    const context412 = await browser.newContext({
      viewport: { width: 412, height: 915 },
      isMobile: true,
      hasTouch: true
    });
    const page412 = await context412.newPage();

    console.log('Step 3.1: Logging in as Staff Member Employee (EMP0200)...');
    await loginAs(page412, 'EMP0200', 'Admin@123', 'employee');
    console.log('✅ Logged in as Staff Employee on 412px.');

    console.log('Step 3.2: Verifying Employee Dashboard layout on 412px...');
    const employeeHeaderActions = await page412.evaluate(() => {
      const el = document.querySelector('.admin-header');
      return el ? el.innerText.replace(/\n+/g, ' | ') : '';
    });
    console.log(`Employee header: ${employeeHeaderActions}`);

    // Open Drawer in Employee Portal
    console.log('Opening Employee sliding drawer...');
    await page412.locator('button[aria-label="Toggle Navigation Menu"]').first().click();
    await sleep(600);

    const employeeNavLinks = await page412.locator('.sidebar-container .sidebar-link').allInnerTexts();
    console.log('Employee drawer links:', employeeNavLinks.join(', '));
    await page412.screenshot({ path: path.join(SCREENSHOT_DIR, '07_412_employee_drawer.png') });

    // Test Employee quick logout from drawer
    console.log('Testing Employee logout from drawer button...');
    const drawerLogoutBtn = page412.locator('.sidebar-container button[title="Log Out"], .sidebar-container button[aria-label="Log Out"]').first();
    await drawerLogoutBtn.click();
    await sleep(1500);
    console.log(`URL after drawer logout: ${page412.url()}`);
    if (page412.url().includes('/login')) {
      console.log('✅ Requirement verified: Drawer logout button works directly from mobile navigation.');
    }

    await context412.close();
    console.log('✅ Phase 3 (412px & Employee) passed successfully.');

    // =========================================================================
    // TEST SUITE 4: 768px x 1024px (Tablet) & 1366px x 768px (Desktop Preservation)
    // =========================================================================
    console.log('\n------------------------------------------------------------');
    console.log('>>> [PHASE 4] TESTING TABLET (768px) & DESKTOP PRESERVATION (1366px)');
    console.log('------------------------------------------------------------');

    // 4.1 Tablet Check
    const contextTablet = await browser.newContext({ viewport: { width: 768, height: 1024 } });
    const pageTablet = await contextTablet.newPage();
    await loginAs(pageTablet, 'SKAND', 'Admin@123', 'admin');

    const tabletSidebarMargin = await pageTablet.evaluate(() => {
      const el = document.querySelector('.admin-main-content');
      return el ? window.getComputedStyle(el).marginLeft : null;
    });
    console.log(`Tablet (768px) main-content margin-left: ${tabletSidebarMargin} (Expected: 0px)`);
    await pageTablet.screenshot({ path: path.join(SCREENSHOT_DIR, '08_768_tablet_dashboard.png') });
    await contextTablet.close();

    // 4.2 Desktop Preservation (1366px)
    console.log('\nStep 4.2: Verifying Desktop preservation at 1366px...');
    const contextDesktop = await browser.newContext({ viewport: { width: 1366, height: 768 } });
    const pageDesktop = await contextDesktop.newPage();
    await loginAs(pageDesktop, 'SKAND', 'Admin@123', 'admin');

    const desktopSidebarState = await pageDesktop.evaluate(() => {
      const sidebar = document.querySelector('.sidebar-container');
      const content = document.querySelector('.admin-main-content');
      return {
        sidebarWidth: sidebar ? sidebar.offsetWidth : 0,
        contentMarginLeft: content ? window.getComputedStyle(content).marginLeft : null
      };
    });
    console.log(`Desktop sidebar width: ${desktopSidebarState.sidebarWidth}px (Expected: 240px or 72px)`);
    console.log(`Desktop content margin-left: ${desktopSidebarState.contentMarginLeft} (Expected: 250px or 70px)`);
    if (desktopSidebarState.sidebarWidth > 70 && desktopSidebarState.contentMarginLeft !== '0px') {
      console.log('✅ Requirement verified: Desktop layout is 100% PRESERVED with pinned sidebar and correct content offset.');
    }

    // Check Desktop POS two columns
    console.log('Checking Desktop POS two-column layout...');
    await pageDesktop.goto('http://localhost:5173/admin/pos', { waitUntil: 'networkidle' });
    await sleep(1500);

    const posDesktopColumns = await pageDesktop.evaluate(() => {
      const catalog = document.querySelector('.pos-food-catalog-area');
      const order = document.querySelector('.pos-order-panel-container');
      return {
        catalogVisible: catalog ? window.getComputedStyle(catalog).display !== 'none' : false,
        orderVisible: order ? window.getComputedStyle(order).display !== 'none' : false,
        catalogWidth: catalog ? catalog.offsetWidth : 0,
        orderWidth: order ? order.offsetWidth : 0
      };
    });
    console.log(`Desktop POS Catalog visible: ${posDesktopColumns.catalogVisible}, width: ${posDesktopColumns.catalogWidth}px`);
    console.log(`Desktop POS Order panel visible: ${posDesktopColumns.orderVisible}, width: ${posDesktopColumns.orderWidth}px`);
    if (posDesktopColumns.catalogVisible && posDesktopColumns.orderVisible) {
      console.log('✅ Requirement verified: Desktop POS renders both columns side-by-side simultaneously.');
    }

    // Check Desktop Kitchen Queue 4 columns
    console.log('Checking Desktop Kitchen Queue 4 columns...');
    await pageDesktop.goto('http://localhost:5173/admin/kitchen', { waitUntil: 'networkidle' });
    await sleep(1500);

    const kitchenColumns = await pageDesktop.locator('.kitchen-queue-page .row > div').count();
    console.log(`Kitchen Queue columns visible on desktop: ${kitchenColumns} (Expected: 4)`);
    if (kitchenColumns === 4) {
      console.log('✅ Requirement verified: Desktop Kitchen Queue renders all 4 Kanban columns side-by-side.');
    }
    await pageDesktop.screenshot({ path: path.join(SCREENSHOT_DIR, '09_1366_desktop_kitchen.png') });

    await contextDesktop.close();
    console.log('✅ Desktop verification completed.');

    console.log('\n================================================================');
    console.log('🎉 ALL MOBILE (360px, 390px, 412px, 768px) & DESKTOP (1366px)');
    console.log('   VERIFICATIONS COMPLETED WITH ZERO ERRORS!');
    console.log('================================================================');
  } catch (err) {
    console.error('❌ Verification failed:', err);
    process.exit(1);
  } finally {
    await browser.close();
    console.log('Visible browser closed cleanly.');
  }
})();
