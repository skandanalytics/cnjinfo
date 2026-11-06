const puppeteer = require('D:/curser/foodie-push/node_modules/puppeteer-core');
const fs = require('fs');

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

(async () => {
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 412, height: 915 }); // Mobile viewport
  await page.goto('http://localhost:5173/customer/login', { waitUntil: 'networkidle2' });

  // Take screenshot before focus
  await page.screenshot({ path: 'scratch/customer_login_init.png' });

  // Focus on phone input
  const input = await page.$('input[type="tel"]');
  if (input) {
    await input.focus();
    await new Promise(r => setTimeout(r, 500));
    await page.screenshot({ path: 'scratch/customer_login_focused.png' });

    // Evaluate computed styles
    const styles = await page.evaluate(() => {
      const inp = document.querySelector('input[type="tel"]');
      const parent = inp.closest('.d-flex');
      const inpStyle = window.getComputedStyle(inp);
      const parentStyle = window.getComputedStyle(parent);
      return {
        input: {
          border: inpStyle.border,
          borderColor: inpStyle.borderColor,
          outline: inpStyle.outline,
          boxShadow: inpStyle.boxShadow
        },
        parent: {
          border: parentStyle.border,
          borderColor: parentStyle.borderColor,
          outline: parentStyle.outline,
          boxShadow: parentStyle.boxShadow
        }
      };
    });
    console.log('Styles:', JSON.stringify(styles, null, 2));
  } else {
    console.log('No phone input found');
  }

  await browser.close();
})();

