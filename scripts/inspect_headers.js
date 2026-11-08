const http = require('http');

const endpoints = [
  '/',
  '/css/styles.css',
  '/js/app.js',
  '/js/canvas.js',
  '/api/health',
  '/api/auth/register',
  '/api/auth/login',
  '/api/auth/me',
  '/api/deployments',
  '/api/nonexistent'
];

async function inspectHeaders() {
  console.log('=== Inspecting All Response Headers ===\n');

  for (const ep of endpoints) {
    await new Promise((resolve) => {
      const req = http.request(`http://localhost:3000${ep}`, { method: 'GET' }, (res) => {
        console.log(`Endpoint: GET ${ep} -> Status: ${res.statusCode}`);
        for (const [k, v] of Object.entries(res.headers)) {
          console.log(`  ${k}: ${v}`);
        }
        console.log('');
        res.on('data', () => {});
        res.on('end', resolve);
      });
      req.on('error', (err) => {
        console.log(`Endpoint: GET ${ep} -> Error: ${err.message}`);
        resolve();
      });
      req.end();
    });
  }
}

inspectHeaders();
