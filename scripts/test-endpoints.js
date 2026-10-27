const http = require('http');

async function testUrl(url) {
  return new Promise((resolve) => {
    const req = http.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve({ url, status: res.statusCode, body: data.slice(0, 120) }));
    });
    req.on('error', (err) => resolve({ url, error: err.message }));
    req.setTimeout(5000, () => {
      req.destroy();
      resolve({ url, error: 'Connection timeout after 5000ms' });
    });
  });
}

(async () => {
  const urls = [
    'http://127.0.0.1:8000/api/',
    'http://127.0.0.1:8000/api/categories/',
    'http://127.0.0.1:8000/api/foods/',
    'http://127.0.0.1:8000/api/public/branches/1/menu/',
    'http://127.0.0.1:8000/api/branches/',
    'http://127.0.0.1:8000/api/tables/',
    'http://127.0.0.1:8000/api/orders/',
    'http://192.168.68.104:8000/api/public/branches/1/menu/',
    'http://127.0.0.1:5173/',
    'http://192.168.68.104:5173/'
  ];
  for (const u of urls) {
    const r = await testUrl(u);
    if (r.status) {
      console.log(`[HTTP ${r.status}] ${r.url} -> ${r.body.replace(/\s+/g, ' ')}`);
    } else {
      console.log(`[CONN ERR] ${r.url} -> ${r.error}`);
    }
  }
})();
