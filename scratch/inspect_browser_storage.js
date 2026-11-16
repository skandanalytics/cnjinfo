const playwright = require('D:/curser/foodie-push/frontend/node_modules/playwright-core');

(async () => {
  const browser = await playwright.chromium.launch({
    headless: true,
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
  });

  const context = await browser.newContext();
  const page = await context.newPage();

  await page.goto('http://localhost:5173/');

  const storage = await page.evaluate(() => {
    const items = {};
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      items[key] = localStorage.getItem(key);
    }
    return items;
  });

  console.log('Current localStorage keys:');
  for (const [k, v] of Object.entries(storage)) {
    if (k.includes('notif') || k.includes('order') || v.includes('FD000041') || v.includes('41')) {
      console.log(`Key: "${k}" -> Value: ${v.slice(0, 150)}...`);
    }
  }

  await browser.close();
})();
