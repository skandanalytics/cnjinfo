import { chromium } from 'playwright-core';
import fs from 'fs';
import path from 'path';

async function main() {
  const browser = await chromium.launch({
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    headless: true,
  });

  const outDir = path.resolve('../docs/screenshots_actual');
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }

  // Admin Context
  const adminContext = await browser.newContext({
    viewport: { width: 1440, height: 900 },
  });
  const adminPage = await adminContext.newPage();

  console.log('Logging in as ADMIN...');
  await adminPage.goto('http://localhost:5173/login', { waitUntil: 'networkidle' });
  await adminPage.fill('input[type="text"]', 'ADMIN');
  await adminPage.fill('input[type="password"]', 'Foodie-Dev-2026!');
  await adminPage.click('button[type="submit"]');

  await adminPage.waitForURL('**/admin/**', { timeout: 15000 });
  await adminPage.waitForTimeout(2500);

  // 01 Admin Dashboard Light
  console.log('Capturing 01_admin_dashboard...');
  await adminPage.goto('http://localhost:5173/admin/dashboard', { waitUntil: 'networkidle' });
  await adminPage.waitForTimeout(2000);
  await adminPage.screenshot({ path: path.join(outDir, '01_admin_dashboard.png'), fullPage: false });

  // 02 Admin Dashboard Dark
  console.log('Capturing 02_admin_dashboard_dark...');
  await adminPage.evaluate(() => {
    localStorage.setItem('foodie_theme', 'dark');
    document.documentElement.setAttribute('data-theme', 'dark');
    document.documentElement.setAttribute('data-bs-theme', 'dark');
  });
  await adminPage.reload({ waitUntil: 'networkidle' });
  await adminPage.waitForTimeout(2000);
  await adminPage.screenshot({ path: path.join(outDir, '02_admin_dashboard_dark.png'), fullPage: false });

  // Reset theme back to light for adminPage
  await adminPage.evaluate(() => {
    localStorage.setItem('foodie_theme', 'light');
    document.documentElement.removeAttribute('data-theme');
    document.documentElement.removeAttribute('data-bs-theme');
  });

  // Customer Context
  const customerContext = await browser.newContext({
    viewport: { width: 1440, height: 900 },
  });
  await customerContext.addInitScript(() => {
    sessionStorage.setItem('foodie_order_type', 'TAKEAWAY');
    localStorage.setItem('foodie_order_type', 'TAKEAWAY');
    sessionStorage.setItem('foodie_table', JSON.stringify({ tableNumber: 'Takeaway', tableId: 'Takeaway', orderType: 'TAKEAWAY' }));
    
    // Customer Auth
    const custAuth = JSON.stringify({ user: { id: 1, name: 'Customer', phone: '+919248157423', role: 'customer' }, isAuthenticated: true });
    sessionStorage.setItem('foodie_auth_customer', custAuth);
    localStorage.setItem('foodie_auth_customer', custAuth);
    sessionStorage.setItem('foodie_token_customer', 'valid-customer-token-123');
    localStorage.setItem('foodie_token_customer', 'valid-customer-token-123');
    
    // Pre-populate cart items for Cart page
    const sampleCart = [
      {
        id: 1,
        lineId: 'dish_1',
        foodId: 1,
        name: 'pani puri',
        price: 47.50,
        sellingPrice: 47.50,
        originalPrice: 50.00,
        quantity: 2,
        image: 'https://images.unsplash.com/photo-1601050690597-df0568f70950?w=320&auto=format&fit=crop&q=80',
        foodType: 'veg',
        customizations: []
      }
    ];
    sessionStorage.setItem('foodie_cart', JSON.stringify(sampleCart));
    sessionStorage.setItem('foodie_guest_cart', JSON.stringify(sampleCart));
    sessionStorage.setItem('foodie_guest_cart_temp', JSON.stringify(sampleCart));
    sessionStorage.setItem('foodie_guest_cart_unmerged', JSON.stringify(sampleCart));
    localStorage.setItem('foodie_cart', JSON.stringify(sampleCart));
  });

  const customerPage = await customerContext.newPage();

  // 13 Customer Menu Light
  console.log('Capturing 13_customer_menu...');
  await customerPage.goto('http://localhost:5173/customer/home', { waitUntil: 'networkidle', timeout: 15000 });
  await customerPage.waitForTimeout(2500);
  await customerPage.screenshot({ path: path.join(outDir, '13_customer_menu.png'), fullPage: false });

  // 14 Customer Cart
  console.log('Capturing 14_customer_cart_checkout...');
  await customerPage.goto('http://localhost:5173/customer/cart', { waitUntil: 'networkidle', timeout: 15000 });
  await customerPage.waitForTimeout(2500);
  await customerPage.screenshot({ path: path.join(outDir, '14_customer_cart.png'), fullPage: false });

  // 15 Order Confirmation Web
  console.log('Capturing 15_order_confirmation_web...');
  await customerPage.goto('http://localhost:5173/customer/order-confirmation?order=101', { waitUntil: 'networkidle', timeout: 15000 });
  await customerPage.waitForTimeout(2500);
  await customerPage.screenshot({ path: path.join(outDir, '15_order_confirmation_web.png'), fullPage: false });

  // 16 Order Confirmation Mobile
  console.log('Capturing 16_order_confirmation_mobile...');
  const mobileContext = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
  });
  await mobileContext.addInitScript(() => {
    sessionStorage.setItem('foodie_order_type', 'TAKEAWAY');
    localStorage.setItem('foodie_order_type', 'TAKEAWAY');
    sessionStorage.setItem('foodie_table', JSON.stringify({ tableNumber: 'Takeaway', tableId: 'Takeaway', orderType: 'TAKEAWAY' }));
    const custAuth = JSON.stringify({ user: { id: 1, name: 'Customer', phone: '+919248157423', role: 'customer' }, isAuthenticated: true });
    sessionStorage.setItem('foodie_auth_customer', custAuth);
    localStorage.setItem('foodie_auth_customer', custAuth);
    sessionStorage.setItem('foodie_token_customer', 'valid-customer-token-123');
    localStorage.setItem('foodie_token_customer', 'valid-customer-token-123');
  });
  const mobilePage = await mobileContext.newPage();
  await mobilePage.goto('http://localhost:5173/customer/order-confirmation?order=101', { waitUntil: 'networkidle', timeout: 15000 });
  await mobilePage.waitForTimeout(2500);
  await mobilePage.screenshot({ path: path.join(outDir, '16_order_confirmation_mobile.png'), fullPage: false });

  await browser.close();
  console.log('All remaining screenshots captured successfully!');
}

main().catch(console.error);
