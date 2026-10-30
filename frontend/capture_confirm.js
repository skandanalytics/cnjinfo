import { chromium } from 'playwright-core';
import path from 'path';

async function main() {
  const browser = await chromium.launch({
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    headless: true,
  });

  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto('http://localhost:5173/login', { waitUntil: 'networkidle' });
  await page.fill('input[type="text"]', 'ADMIN');
  await page.fill('input[type="password"]', 'Foodie-Dev-2026!');
  await page.click('button[type="submit"]');
  await page.waitForURL('**/admin/**', { timeout: 15000 });
  await page.waitForTimeout(2000);

  // Set staff ordering flag so customer routes accept the staff session
  await page.evaluate(() => {
    sessionStorage.setItem('foodie_staff_ordering', '1');
  });

  console.log('Navigating to order-confirmation on web...');
  await page.goto('http://localhost:5173/customer/order-confirmation?order=101', { waitUntil: 'networkidle' });
  await page.waitForTimeout(3000);
  await page.screenshot({ path: path.resolve('../docs/screenshots_actual/15_order_confirmation_web.png'), fullPage: false });
  console.log('Saved 15_order_confirmation_web.png');

  console.log('Navigating to order-confirmation on mobile...');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(1000);
  await page.screenshot({ path: path.resolve('../docs/screenshots_actual/16_order_confirmation_mobile.png'), fullPage: false });
  console.log('Saved 16_order_confirmation_mobile.png');

  await browser.close();
  console.log('Done!');
}

main().catch(console.error);
