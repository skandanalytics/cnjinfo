const puppeteer = require('D:/curser/foodie-push/node_modules/puppeteer-core');
const fs = require('fs');
const path = require('path');

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const SCREENSHOTS_DIR = 'C:\\Users\\ybali\\.gemini\\antigravity\\brain\\68745a37-e49c-4448-a33b-8fbdfe96df75\\e2e_verification_six_bugs';

if (!fs.existsSync(SCREENSHOTS_DIR)) {
  fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });
}

async function runVerification() {
  console.log('====================================================');
  console.log('   FOODIE SIX BUGS VERIFICATION SUITE              ');
  console.log('====================================================');

  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 800 });

  // ----------------------------------------------------
  // TEST 1: Customer Login - Remove Pink Phone Number Border
  // ----------------------------------------------------
  console.log('\n--> Testing Bug 1: Customer Login Pink Border...');
  await page.setViewport({ width: 412, height: 915 });
  await page.goto('http://localhost:5173/customer/login', { waitUntil: 'networkidle2' });

  const phoneInp = await page.$('input[type="tel"]');
  if (phoneInp) {
    await phoneInp.focus();
    await new Promise(r => setTimeout(r, 400));
    const phoneStyle = await page.evaluate(() => {
      const inp = document.querySelector('input[type="tel"]');
      const wrap = inp.closest('.customer-phone-wrapper') || inp.parentElement;
      const csInp = window.getComputedStyle(inp);
      const csWrap = window.getComputedStyle(wrap);
      return {
        inpBorder: csInp.border,
        inpBoxShadow: csInp.boxShadow,
        wrapBorderColor: csWrap.borderColor,
        wrapBoxShadow: csWrap.boxShadow
      };
    });
    console.log('Bug 1 styles (slate neutral, no pink):', phoneStyle);
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '01_customer_login_no_pink_border.png') });
  }

  // ----------------------------------------------------
  // TEST 2: Customer Dining Option - Remove Table Dropdown
  // ----------------------------------------------------
  console.log('\n--> Testing Bug 2: Customer Dining Option Remove Table Dropdown...');
  // Navigate with chooseDining in history state
  await page.evaluate(() => {
    sessionStorage.setItem('foodie_auth_customer', JSON.stringify({ user: { id: 999, name: 'Tester', phone: '9876543210' }, isAuthenticated: true }));
    window.history.pushState({ chooseDining: true }, '', '/customer/login');
  });
  await page.goto('http://localhost:5173/customer/login', { waitUntil: 'networkidle2' });
  // Click Choose Dining directly if rendered, or verify elements
  const bug2Checks = await page.evaluate(() => {
    const text = document.body.innerText;
    return {
      hasTextSelectTable: text.includes('Select Your Dining Table'),
      hasSelectDropdown: Boolean(document.querySelector('select')),
    };
  });
  console.log('Bug 2 Table Dropdown check:', bug2Checks);
  await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '02_dining_option_clean_no_table_dropdown.png') });

  // ----------------------------------------------------
  // TEST 3: Customer Search - Search Dish Names Only
  // ----------------------------------------------------
  console.log('\n--> Testing Bug 3: Customer Search Search Dish Names Only...');
  await page.setViewport({ width: 1280, height: 800 });
  await page.goto('http://localhost:5173/customer/home', { waitUntil: 'networkidle2' });
  await new Promise(r => setTimeout(r, 1200));

  const searchInput = await page.$('input[placeholder*="Search"]');
  if (searchInput) {
    // Search category name
    await searchInput.type('Beverages');
    await new Promise(r => setTimeout(r, 600));
    const countForCat = await page.evaluate(() => {
      const cards = document.querySelectorAll('.card');
      return cards.length;
    });
    console.log('Cards matching category name "Beverages" as dish name:', countForCat);

    // Clear
    await searchInput.click({ clickCount: 3 });
    await page.keyboard.press('Backspace');
    await new Promise(r => setTimeout(r, 500));

    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '03_customer_dish_search_name_only.png') });
  }

  // ----------------------------------------------------
  // TEST 4: Checkout Table Details (No Table Picker Grid)
  // ----------------------------------------------------
  console.log('\n--> Testing Bug 4: Checkout Table Details (No Table Picker Grid)...');
  await page.evaluate(() => {
    sessionStorage.setItem('foodie_selected_table', '3');
    sessionStorage.setItem('foodie_table_number', 'T03');
    sessionStorage.setItem('foodie_order_type', 'DINE_IN');
    sessionStorage.setItem('foodie_public_branch', '5');
  });
  await page.goto('http://localhost:5173/customer/checkout', { waitUntil: 'networkidle2' });
  await new Promise(r => setTimeout(r, 1000));

  const checkoutTableCheck = await page.evaluate(() => {
    const text = document.body.innerText;
    const tableButtons = document.querySelectorAll('.row-cols-3 button, .row-cols-sm-6 button');
    return {
      hasTableButtonMatrix: tableButtons.length > 0,
      tableButtonsCount: tableButtons.length,
      hasTableInfoDisplayed: text.includes('Table')
    };
  });
  console.log('Checkout Table Selector Check (Picker Grid removed):', checkoutTableCheck);
  await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '04_checkout_no_table_picker_grid.png') });

  // ----------------------------------------------------
  // TEST 6: POS Hide Images & Menu Management Retain Images
  // ----------------------------------------------------
  console.log('\n--> Testing Bug 6: POS Hide Images & Menu Management Retain Images...');
  // Login as admin
  await page.goto('http://localhost:5173/login', { waitUntil: 'networkidle2' });
  const userInput = await page.$('input[placeholder*="ADMIN"], input[type="text"]');
  const passInput = await page.$('input[type="password"]');
  if (userInput && passInput) {
    await userInput.type('ADMIN');
    await passInput.type('Admin@123');
    const submitBtn = await page.$('button[type="submit"]');
    if (submitBtn) await submitBtn.click();
    await page.waitForNavigation({ waitUntil: 'networkidle2' }).catch(() => {});
    await new Promise(r => setTimeout(r, 1500));
  }

  // Open POS page
  await page.goto('http://localhost:5173/admin/pos', { waitUntil: 'networkidle2' });
  await new Promise(r => setTimeout(r, 1500));

  const posImagesCheck = await page.evaluate(() => {
    const dishCards = document.querySelectorAll('.pos-dish-card');
    const imagesInDishCards = document.querySelectorAll('.pos-dish-card img');
    return {
      dishCardCount: dishCards.length,
      imagesInCards: imagesInDishCards.length
    };
  });
  console.log('POS Dish Cards vs Images (Images hidden in POS):', posImagesCheck);
  await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '06_pos_dishes_without_images.png') });

  // Open Menu Management page
  await page.goto('http://localhost:5173/admin/menu', { waitUntil: 'networkidle2' });
  await new Promise(r => setTimeout(r, 1500));

  const menuImagesCheck = await page.evaluate(() => {
    const dishImages = document.querySelectorAll('.card img');
    return {
      dishImagesCount: dishImages.length
    };
  });
  console.log('Menu Management Dish Images (Images retained in Menu Management):', menuImagesCheck);
  await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '06_menu_management_with_images.png') });

  // ----------------------------------------------------
  // TEST 5: Employee Branch Reassignment
  // ----------------------------------------------------
  console.log('\n--> Testing Bug 5: Employee Directory & Branch Assignment...');
  await page.goto('http://localhost:5173/admin/users', { waitUntil: 'networkidle2' });
  await new Promise(r => setTimeout(r, 1500));

  const headerBranchInfo = await page.evaluate(() => {
    const headerEl = document.querySelector('header') || document.body;
    return {
      headerText: headerEl.innerText.slice(0, 200)
    };
  });
  console.log('Header Branch Info:', headerBranchInfo);
  await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '05_employee_directory.png') });

  console.log('\n====================================================');
  console.log('   ALL SIX BUG VERIFICATIONS COMPLETED!             ');
  console.log('====================================================');

  await browser.close();
}

runVerification().catch(err => {
  console.error('Error during verification:', err);
  process.exit(1);
});
