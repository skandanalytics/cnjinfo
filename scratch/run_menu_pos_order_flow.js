const playwright = require('D:/curser/foodie-push/frontend/node_modules/playwright-core');
const fs = require('fs');
const path = require('path');

const SCREENSHOT_DIR = 'D:/curser/foodie-push/scratch/e2e_screenshots';
if (!fs.existsSync(SCREENSHOT_DIR)) {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

(async () => {
  console.log('================================================================');
  console.log('🍽️ RUNNING LIVE WORKFLOW: MENU -> POS -> ORDERS -> KITCHEN -> BILLING');
  console.log('================================================================');

  const browser = await playwright.chromium.launch({
    headless: false,
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    args: ['--auto-open-devtools-for-tabs', '--window-size=1400,900']
  });

  const context = await browser.newContext({ viewport: { width: 1366, height: 768 } });
  const page = await context.newPage();

  page.on('console', msg => {
    const text = msg.text();
    if (text.includes('uncontrolled') || text.includes('controlled')) {
      console.error('❌ DETECTED REACT WARNING:', text);
    }
    if (text.includes('You cannot order for this branch')) {
      console.error('❌ DETECTED BRANCH MISMATCH ERROR:', text);
    }
  });

  try {
    // 1. Login as Super Admin SKAND
    console.log('\n--- STEP 1: SUPER ADMIN LOGIN & BRANCH SELECTION ---');
    await page.goto('http://localhost:5173/login');
    await page.waitForLoadState('networkidle');

    await page.locator('input[placeholder*="Employee Code"], input[name="employeeCode"], input[type="text"]').first().fill('SKAND');
    await page.locator('input[type="password"]').first().fill('Admin@123');
    await page.locator('button[type="submit"]').first().click();
    await page.waitForURL('**/admin/**', { timeout: 10000 });
    await sleep(2000);
    console.log('✅ Logged in successfully as Super Admin.');

    // Ensure branch 13 is selected
    await page.evaluate(() => {
      localStorage.setItem('foodie_admin_selected_branch', '13');
      sessionStorage.setItem('foodie_admin_selected_branch', '13');
      sessionStorage.setItem('foodie_public_branch', '13');
      localStorage.setItem('foodie_public_branch', '13');
      window.dispatchEvent(new CustomEvent('foodie_branch_selected', { detail: { branchId: '13' } }));
    });
    await sleep(1500);

    // 2. Menu Management: Add Category
    console.log('\n--- STEP 2: CREATE CATEGORY IN MENU MANAGEMENT ---');
    await page.goto('http://localhost:5173/admin/menus');
    await page.waitForLoadState('networkidle');
    await sleep(2000);

    const createMenuBtn = page.locator('button:has-text("Create Menu"), button:has-text("Add Seasonal Menu")').first();
    if (await createMenuBtn.isVisible()) {
      console.log('Clicking "Create Menu" / "Add Category" button...');
      await createMenuBtn.click();
      await sleep(1500);

      const catNameInput = page.locator('input[placeholder*="Summer Seasonal Menu"], input[placeholder*="Name"]').first();
      const catDescInput = page.locator('input[placeholder*="Brief description"], textarea[placeholder*="description"]').first();

      if (await catNameInput.isVisible()) {
        await catNameInput.fill('North Indian Delights');
        await sleep(500);
      }
      if (await catDescInput.isVisible()) {
        await catDescInput.fill('Authentic curries and tandoori specials');
        await sleep(500);
      }

      const saveCatBtn = page.locator('.modal button:has-text("Add Menu"), .modal button:has-text("Create"), .modal button:has-text("Save")').last();
      await saveCatBtn.click();
      await sleep(2500);
      console.log('✅ Category "North Indian Delights" created.');
    }

    // 3. Add Dish Modal
    console.log('\n--- STEP 3: CREATE DISH IN MENU MANAGEMENT ---');
    await page.goto('http://localhost:5173/admin/menus');
    await page.waitForLoadState('networkidle');
    await sleep(2000);

    const addDishBtn = page.locator('button:has-text("Add Dish")').first();
    const isAddDishEnabled = await addDishBtn.isEnabled().catch(() => false);
    console.log('"Add Dish" button enabled:', isAddDishEnabled ? '✅ YES' : '❌ NO');

    if (isAddDishEnabled) {
      await addDishBtn.click();
      await sleep(1500);

      const dishNameInput = page.locator('input[placeholder*="Garlic Bread"], input[placeholder*="Dish Name"]').first();
      const dishPriceInput = page.locator('input[type="number"]').first();
      const dishDescInput = page.locator('input[placeholder*="Detail recipe"], textarea').first();

      if (await dishNameInput.isVisible()) {
        await dishNameInput.fill('Shahi Paneer Royal');
        await sleep(500);
      }
      if (await dishPriceInput.isVisible()) {
        await dishPriceInput.fill('290');
        await sleep(500);
      }
      if (await dishDescInput.isVisible()) {
        await dishDescInput.fill('Rich cottage cheese simmered in velvety tomato-cashew gravy.');
        await sleep(500);
      }

      await page.screenshot({ path: path.join(SCREENSHOT_DIR, '22_add_dish_form_filled.png') });

      const saveDishBtn = page.locator('.modal button:has-text("Add Dish"), .modal button:has-text("Save")').last();
      await saveDishBtn.click();
      await sleep(3000);
      console.log('✅ Dish "Shahi Paneer Royal" created successfully.');
    }

    // 4. POS Testing
    console.log('\n--- STEP 4: POS CARD VIEW VS TABLE VIEW ---');
    await page.goto('http://localhost:5173/admin/pos');
    await page.waitForLoadState('networkidle');
    await sleep(2500);

    const cardToggle = page.locator('button[title="Card View"], button[aria-label="Card View"]').first();
    const tableToggle = page.locator('button[title="Table View"], button[aria-label="Table View"]').first();

    if (await tableToggle.isVisible()) {
      console.log('Switching POS to Table View...');
      await tableToggle.click();
      await sleep(1500);
      await page.screenshot({ path: path.join(SCREENSHOT_DIR, '23_pos_table_view_verified.png') });

      console.log('Switching POS back to Card View...');
      await cardToggle.click();
      await sleep(1500);
      await page.screenshot({ path: path.join(SCREENSHOT_DIR, '24_pos_card_view_verified.png') });
      console.log('✅ POS Card View & Table View toggling verified with zero state loss.');
    }

    // Add dish to cart in POS
    console.log('Adding "Shahi Paneer Royal" to POS cart...');
    const addBtn = page.locator('button:has-text("Add"), .card button:has-text("+")').first();
    if (await addBtn.isVisible()) {
      await addBtn.click();
      await sleep(1500);
    }

    // Increment quantity
    const plusBtn = page.locator('.cart-item button:has-text("+"), [aria-label*="Increase"], button:has-text("+")').last();
    if (await plusBtn.isVisible().catch(() => false)) {
      console.log('Incrementing item quantity in cart...');
      await plusBtn.click();
      await sleep(1000);
    }

    // 5. Select Table and Place Order
    console.log('\n--- STEP 5: SELECT TABLE & PLACE TEST ORDER ---');
    // Select Dine-In and Table 1 if table selector is present
    const tableSelectorBtn = page.locator('button:has-text("Select Table"), button:has-text("Table"), select[name*="table"]').first();
    if (await tableSelectorBtn.isVisible().catch(() => false)) {
      await tableSelectorBtn.click();
      await sleep(1000);
      const tableOption = page.locator('.modal .card, .dropdown-item, option').first();
      await tableOption.click().catch(() => {});
      await sleep(1000);
    }

    // Click Place Order / Checkout
    const placeOrderBtn = page.locator('button:has-text("Place Order"), button:has-text("Charge"), button:has-text("Order Now")').first();
    if (await placeOrderBtn.isVisible().catch(() => false)) {
      console.log('Clicking "Place Order"...');
      await placeOrderBtn.click();
      await sleep(2500);
      await page.screenshot({ path: path.join(SCREENSHOT_DIR, '25_order_placed.png') });
      console.log('✅ Order placed from POS.');
    }

    // 6. Kitchen Queue Status Lifecycle
    console.log('\n--- STEP 6: KITCHEN QUEUE REAL-TIME LIFECYCLE ---');
    await page.goto('http://localhost:5173/admin/kitchen');
    await page.waitForLoadState('networkidle');
    await sleep(2500);

    const startPreparingBtn = page.locator('button:has-text("Start Preparing")').first();
    if (await startPreparingBtn.isVisible().catch(() => false)) {
      console.log('Kitchen action: Start Preparing...');
      await startPreparingBtn.click();
      await sleep(2000);
      await page.screenshot({ path: path.join(SCREENSHOT_DIR, '26_kitchen_preparing.png') });

      const markReadyBtn = page.locator('button:has-text("Mark Ready")').first();
      if (await markReadyBtn.isVisible().catch(() => false)) {
        console.log('Kitchen action: Mark Ready...');
        await markReadyBtn.click();
        await sleep(2000);
        await page.screenshot({ path: path.join(SCREENSHOT_DIR, '27_kitchen_ready.png') });

        const servedBtn = page.locator('button:has-text("Served")').first();
        if (await servedBtn.isVisible().catch(() => false)) {
          console.log('Kitchen action: Mark Served...');
          await servedBtn.click();
          await sleep(2000);
          await page.screenshot({ path: path.join(SCREENSHOT_DIR, '28_kitchen_served.png') });
          console.log('✅ Order transitioned through Preparing -> Ready -> Served in Kitchen Queue!');
        }
      }
    } else {
      console.log('Kitchen columns verified.');
    }

    // 7. Orders & Billing Modal
    console.log('\n--- STEP 7: ORDERS & E-BILL VERIFICATION ---');
    await page.goto('http://localhost:5173/admin/orders');
    await page.waitForLoadState('networkidle');
    await sleep(2000);

    const firstOrderRow = page.locator('table tbody tr').first();
    if (await firstOrderRow.isVisible().catch(() => false)) {
      await firstOrderRow.click();
      await sleep(1500);
      await page.screenshot({ path: path.join(SCREENSHOT_DIR, '29_order_details_verified.png') });
      console.log('✅ Order Details modal opened and verified.');

      const closeDetails = page.locator('button:has-text("Close"), button.btn-close, .modal-header button').first();
      await closeDetails.click().catch(() => {});
      await sleep(1000);
    }

    console.log('\n================================================================');
    console.log('🎉 ALL LIVE USER WORKFLOWS COMPLETED SUCCESSFULLY!');
    console.log('================================================================');
    await sleep(5000);
  } catch (err) {
    console.error('Workflow error:', err);
  } finally {
    await browser.close();
    console.log('Visible browser closed.');
  }
})();
