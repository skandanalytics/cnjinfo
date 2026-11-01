import { chromium } from 'playwright-core';
import fs from 'fs';
import path from 'path';

async function main() {
  const browser = await chromium.launch({
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    headless: true,
  });

  const outDir = path.resolve('../docs/customer_redesign_screenshots');
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }

  // 1. Customer Login & Welcome
  const loginContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const loginPage = await loginContext.newPage();
  console.log('Capturing 01_customer_login...');
  await loginPage.goto('http://localhost:5173/customer/login', { waitUntil: 'networkidle', timeout: 15000 });
  await loginPage.waitForTimeout(1000);
  await loginPage.screenshot({ path: path.join(outDir, '01_customer_login.png') });

  console.log('Capturing 01b_customer_welcome_dining...');
  await loginPage.goto('http://localhost:5173/customer/welcome', { waitUntil: 'networkidle', timeout: 15000 });
  await loginPage.waitForTimeout(1000);
  await loginPage.screenshot({ path: path.join(outDir, '01b_customer_welcome_dining.png') });

  // 2. Customer Context with items and customer details populated
  const customerContext = await browser.newContext({
    viewport: { width: 1440, height: 900 },
  });

  await customerContext.addInitScript(() => {
    sessionStorage.setItem('foodie_order_type', 'DINE_IN');
    localStorage.setItem('foodie_order_type', 'DINE_IN');
    sessionStorage.setItem('foodie_selected_table', '5');
    localStorage.setItem('foodie_selected_table', '5');
    sessionStorage.setItem('customer_name', 'Ravi Kumar');
    localStorage.setItem('customer_name', 'Ravi Kumar');
    sessionStorage.setItem('customer_mobile', '9876543210');
    localStorage.setItem('customer_mobile', '9876543210');
    sessionStorage.setItem('customer_email', 'ravi@gmail.com');
    localStorage.setItem('customer_email', 'ravi@gmail.com');
    sessionStorage.setItem('customer_notes', 'Extra chutney and less spicy.');
    localStorage.setItem('customer_notes', 'Extra chutney and less spicy.');
    
    // Auth
    const custAuth = JSON.stringify({ user: { id: 1, name: 'Ravi Kumar', phone: '+919876543210', role: 'customer' }, isAuthenticated: true });
    sessionStorage.setItem('foodie_auth_customer', custAuth);
    localStorage.setItem('foodie_auth_customer', custAuth);
    
    // Cart Items
    const sampleCart = [
      {
        id: 1,
        lineId: 'dish_1',
        foodId: 1,
        name: 'Pani Puri',
        price: 47.50,
        sellingPrice: 47.50,
        originalPrice: 60.00,
        quantity: 2,
        image: 'https://images.unsplash.com/photo-1601050690597-df0568f70950?w=320&auto=format&fit=crop&q=80',
        foodType: 'veg',
        is_veg: true,
        customizations: []
      },
      {
        id: 2,
        lineId: 'dish_2',
        foodId: 2,
        name: 'Masala Dosa',
        price: 85.00,
        sellingPrice: 85.00,
        originalPrice: 85.00,
        quantity: 1,
        image: 'https://images.unsplash.com/photo-1668236543090-82eba5ee5976?w=320&auto=format&fit=crop&q=80',
        foodType: 'veg',
        is_veg: true,
        customizations: []
      }
    ];
    sessionStorage.setItem('foodie_cart', JSON.stringify(sampleCart));
    sessionStorage.setItem('foodie_guest_cart', JSON.stringify(sampleCart));
    sessionStorage.setItem('foodie_guest_cart_temp', JSON.stringify(sampleCart));
    sessionStorage.setItem('foodie_guest_cart_unmerged', JSON.stringify(sampleCart));
    localStorage.setItem('foodie_cart', JSON.stringify(sampleCart));
    localStorage.setItem('cart', JSON.stringify(sampleCart));
  });

  const page = await customerContext.newPage();

  // 2. Customer Menu
  console.log('Capturing 02_customer_menu...');
  await page.goto('http://localhost:5173/customer/home', { waitUntil: 'networkidle', timeout: 15000 });
  await page.waitForTimeout(2000);
  await page.screenshot({ path: path.join(outDir, '02_customer_menu.png') });

  // 3. Customer Cart
  console.log('Capturing 03_customer_cart...');
  await page.goto('http://localhost:5173/customer/cart', { waitUntil: 'networkidle', timeout: 15000 });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: path.join(outDir, '03_customer_cart.png') });

  // 4. Customer Details (Checkout)
  console.log('Capturing 04_customer_details...');
  await page.goto('http://localhost:5173/customer/checkout', { waitUntil: 'networkidle', timeout: 15000 });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: path.join(outDir, '04_customer_details.png') });

  // 5. Payment
  console.log('Capturing 05_customer_payment...');
  await page.goto('http://localhost:5173/customer/payment', { waitUntil: 'networkidle', timeout: 15000 });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: path.join(outDir, '05_customer_payment.png') });

  // 6. Order Confirmation Web
  console.log('Capturing 06_order_confirmation_web...');
  await page.goto('http://localhost:5173/customer/order-confirmation?order=1', { waitUntil: 'networkidle', timeout: 15000 });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: path.join(outDir, '06_order_confirmation_web.png') });

  // 7. Order Confirmation Mobile
  console.log('Capturing 07_order_confirmation_mobile...');
  const mobileContext = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
  });
  await mobileContext.addInitScript(() => {
    sessionStorage.setItem('foodie_order_type', 'DINE_IN');
    localStorage.setItem('foodie_order_type', 'DINE_IN');
    sessionStorage.setItem('foodie_selected_table', '5');
    const custAuth = JSON.stringify({ user: { id: 1, name: 'Ravi Kumar', phone: '+919876543210', role: 'customer' }, isAuthenticated: true });
    sessionStorage.setItem('foodie_auth_customer', custAuth);
    localStorage.setItem('foodie_auth_customer', custAuth);
  });
  const mobilePage = await mobileContext.newPage();
  await mobilePage.goto('http://localhost:5173/customer/order-confirmation?order=1', { waitUntil: 'networkidle', timeout: 15000 });
  await mobilePage.waitForTimeout(1500);
  await mobilePage.screenshot({ path: path.join(outDir, '07_order_confirmation_mobile.png') });

  // 8. Order Tracking
  console.log('Capturing 08_order_tracking...');
  await page.goto('http://localhost:5173/customer/order-tracking/1', { waitUntil: 'networkidle', timeout: 15000 });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: path.join(outDir, '08_order_tracking.png') });

  // 9. My Orders
  console.log('Capturing 09_my_orders...');
  await page.goto('http://localhost:5173/customer/orders', { waitUntil: 'networkidle', timeout: 15000 });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: path.join(outDir, '09_my_orders.png') });

  await browser.close();
  console.log('All customer screenshots captured successfully!');
}

main().catch(console.error);
