/**
 * Infrasights v2.10 - Enterprise Platform & REST Service Entry Point
 * Serves static marketing frontend assets and /api REST services.
 */

require('dotenv').config();
const path = require('path');
const express = require('express');
const cors = require('cors');
const db = require('./config/database');
const apiRoutes = require('./routes/api');
const vendorRoutes = require('./routes/vendorRoutes');

const app = express();
const PORT = process.env.PORT || 3000;
const rootDir = path.resolve(__dirname, '..');

// Trust reverse proxy for accurate IP and HTTPS protocol detection behind PaaS load balancers
app.enable('trust proxy');

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Request logging in development
if (process.env.NODE_ENV !== 'production') {
  app.use((req, res, next) => {
    const start = Date.now();
    res.on('finish', () => {
      const duration = Date.now() - start;
      if (req.path.startsWith('/api')) {
        console.log(`[HTTP] ${req.method} ${req.originalUrl} -> ${res.statusCode} (${duration}ms)`);
      }
    });
    next();
  });
}

// Mount REST API routes
app.use('/api/vendor', vendorRoutes.apiRouter);
app.use('/api', apiRoutes);

// Catch-all for unmapped API routes across all HTTP methods
app.all('/api/*', (req, res) => {
  res.status(404).json({
    success: false,
    error: `API route not found: ${req.method} ${req.path}`
  });
});

// Explicitly block sensitive / legacy paths (return 404)
const _LEGACY_DIR = Buffer.from('SW5zaWdodE9wcy0tLVNhbi1QYXRoLU1vbml0b3JpbmctZm9yLURDLW1haW4=', 'base64').toString('utf8');
const BLOCKED_PATHS_REGEX = new RegExp(`^\\/(server|\\.agents|\\.git|${_LEGACY_DIR})(\\/|$)`, 'i');
app.all(BLOCKED_PATHS_REGEX, (req, res) => {
  res.status(404).send('Not Found');
});

// Mount vendor web interface (/vendor, /vendor/login, /vendor/logout)
app.use(vendorRoutes.webRouter);

// Serve strictly allowed frontend assets
app.use('/css', express.static(path.join(rootDir, 'css'), { maxAge: '1h' }));
app.use('/js', express.static(path.join(rootDir, 'js'), { maxAge: '1h' }));
app.use('/assets', express.static(path.join(rootDir, 'assets'), { maxAge: '1h' }));

// Serve main landing page
app.get('/', (req, res) => {
  res.sendFile(path.join(rootDir, 'index.html'));
});
app.get('/index.html', (req, res) => {
  res.sendFile(path.join(rootDir, 'index.html'));
});

// SEO and Web Crawler Directives
app.get('/sitemap.xml', (req, res) => {
  res.type('application/xml').sendFile(path.join(rootDir, 'sitemap.xml'));
});

app.get('/robots.txt', (req, res) => {
  res.type('text/plain').sendFile(path.join(rootDir, 'robots.txt'));
});

app.get('/favicon.ico', (req, res) => {
  res.sendFile(path.join(rootDir, 'favicon.ico'));
});

app.get('/favicon.svg', (req, res) => {
  res.type('image/svg+xml').sendFile(path.join(rootDir, 'favicon.svg'));
});

// Catch-all for non-whitelisted routes across all HTTP methods
app.use((req, res) => {
  if (req.path.startsWith('/api')) {
    return res.status(404).json({
      success: false,
      error: `API route not found: ${req.method} ${req.path}`
    });
  }
  res.status(404).send('Not Found');
});

// Centralized JSON Error Handler
app.use((err, req, res, next) => {
  console.error('[ServerError]', err.stack || err.message);
  res.status(err.status || 500).json({
    success: false,
    error: err.message || 'Internal Server Error'
  });
});

// Initialize database and start listening
let server;

async function start() {
  try {
    console.log('[Infrasights] Initializing persistence tier...');
    await db.init();

    server = app.listen(PORT, () => {
      console.log(`=======================================================`);
      console.log(` Infrasights v2.10 Server listening on port ${PORT}`);
      console.log(` Web Interface:   http://localhost:${PORT}`);
      console.log(` Health Endpoint: http://localhost:${PORT}/api/health`);
      console.log(` Database Engine: ${db.activeEngine}`);
      console.log(`=======================================================`);
    });

    return server;
  } catch (error) {
    console.error('[Infrasights] Fatal startup error:', error);
    process.exit(1);
  }
}

// Auto-start if invoked directly via node server/index.js
if (require.main === module) {
  start();
}

module.exports = {
  app,
  start,
  getDatabase: () => db
};
