/**
 * Vendor Authentication Guard & RBAC Middleware
 * Enforces dual-mode vendor authentication:
 *  1. Secret Key header: X-Vendor-Key or X-Admin-Key matching VENDOR_SECRET_KEY
 *  2. Vendor JWT token via Authorization Bearer or secure HTTP-only cookie 'infrasights_vendor_token'
 *
 * Rejects standard customer JWT tokens with HTTP 403 Forbidden ("Vendor administrative privileges required").
 * Rejects unauthenticated web requests with 302 redirect to /vendor/login.
 * Rejects unauthenticated API requests with HTTP 401 Unauthorized.
 */

const jwt = require('jsonwebtoken');

const VENDOR_SECRET_KEY = process.env.VENDOR_SECRET_KEY || 'infrasights-vendor-secret-2026';
const VENDOR_ADMIN_EMAIL = (process.env.VENDOR_ADMIN_EMAIL || 'admin@infrasights.in').toLowerCase();
const ALLOWED_VENDOR_EMAILS = [VENDOR_ADMIN_EMAIL, 'admin@infrasights.in', 'admin@infrasights.io'];
const VENDOR_ADMIN_PASSWORD = process.env.VENDOR_ADMIN_PASSWORD || 'InfrasightsVendorAdmin2026!';
const JWT_SECRET = process.env.JWT_SECRET || 'infrasights_v210_enterprise_secure_token_secret_2026';
const VENDOR_COOKIE_NAME = 'infrasights_vendor_token';

/**
 * Lightweight cookie parser
 */
function parseCookies(cookieHeader) {
  const cookies = {};
  if (!cookieHeader || typeof cookieHeader !== 'string') return cookies;
  const items = cookieHeader.split(';');
  for (const item of items) {
    const idx = item.indexOf('=');
    if (idx !== -1) {
      const key = item.substring(0, idx).trim();
      const val = item.substring(idx + 1).trim();
      try {
        cookies[key] = decodeURIComponent(val);
      } catch (e) {
        cookies[key] = val;
      }
    }
  }
  return cookies;
}

/**
 * Detect whether incoming request is targeted at the REST API
 */
function isApiRequest(req) {
  const url = req.originalUrl || req.url || '';
  if (url.startsWith('/api/') || url === '/api') return true;
  if (req.baseUrl && req.baseUrl.startsWith('/api')) return true;
  if (req.path && req.path.startsWith('/api')) return true;
  const accept = req.headers['accept'] || '';
  if (accept.includes('application/json')) return true;
  return false;
}

/**
 * Core vendor authentication validator
 */
function evaluateVendorAuth(req) {
  const cookies = parseCookies(req.headers['cookie']);

  // 1. Check explicit vendor secret key headers
  const headerKey = req.headers['x-vendor-key'] || req.headers['x-admin-key'];
  if (headerKey !== undefined && headerKey !== null) {
    if (headerKey === VENDOR_SECRET_KEY) {
      return {
        authenticated: true,
        isCustomer: false,
        vendor: {
          id: 'vendor-admin',
          email: VENDOR_ADMIN_EMAIL,
          role: 'VENDOR_ADMIN',
          authMethod: 'SECRET_KEY'
        }
      };
    }
    // Key was supplied but invalid
    return {
      authenticated: false,
      isCustomer: false,
      error: 'Invalid vendor secret key.'
    };
  }

  // 2. Check Authorization Bearer header or cookie
  let token = null;
  const authHeader = req.headers['authorization'] || req.headers['Authorization'];
  if (authHeader) {
    const parts = authHeader.split(' ');
    if (parts.length === 2 && parts[0].toLowerCase() === 'bearer') {
      token = parts[1].trim();
    }
  }

  if (!token && cookies[VENDOR_COOKIE_NAME]) {
    token = cookies[VENDOR_COOKIE_NAME].trim();
  }

  // Fallback: If token itself matches secret key directly
  if (token && token === VENDOR_SECRET_KEY) {
    return {
      authenticated: true,
      isCustomer: false,
      vendor: {
        id: 'vendor-admin',
        email: VENDOR_ADMIN_EMAIL,
        role: 'VENDOR_ADMIN',
        authMethod: 'SECRET_KEY'
      }
    };
  }

  // 3. Verify JWT token
  if (token) {
    try {
      const decoded = jwt.verify(token, JWT_SECRET);

      const isVendor =
        decoded.role === 'VENDOR_ADMIN' ||
        decoded.isVendor === true ||
        (decoded.email && ALLOWED_VENDOR_EMAILS.includes(decoded.email.toLowerCase()));

      if (isVendor) {
        return {
          authenticated: true,
          isCustomer: false,
          vendor: {
            id: decoded.id || 'vendor-admin',
            email: decoded.email || VENDOR_ADMIN_EMAIL,
            role: 'VENDOR_ADMIN',
            authMethod: 'JWT'
          }
        };
      }

      // Valid JWT token, but customer role without vendor administrative privileges
      return {
        authenticated: false,
        isCustomer: true,
        error: 'Vendor administrative privileges required.'
      };
    } catch (err) {
      return {
        authenticated: false,
        isCustomer: false,
        error: 'Invalid or expired vendor token.'
      };
    }
  }

  // No authentication provided
  return {
    authenticated: false,
    isCustomer: false,
    error: 'Vendor authentication required.'
  };
}

/**
 * Universal Vendor Guard middleware
 */
function vendorAuthGuard(req, res, next) {
  const result = evaluateVendorAuth(req);

  if (result.authenticated) {
    req.isVendor = true;
    req.vendor = result.vendor;
    return next();
  }

  const isApi = isApiRequest(req);

  // Standard customer token presented to vendor endpoint -> HTTP 403 Forbidden
  if (result.isCustomer) {
    if (isApi) {
      return res.status(403).json({
        success: false,
        error: 'Vendor administrative privileges required.'
      });
    }
    return res.status(403).send(`
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <title>403 Forbidden - Infrasights Vendor Console</title>
        <style>
          body { background: #080e1a; color: #f8fafc; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; }
          .card { background: #131e3a; border: 1px solid #ef4444; border-radius: 8px; padding: 32px; max-width: 480px; text-align: center; }
          h1 { color: #ef4444; margin-top: 0; font-size: 24px; }
          p { color: #94a3b8; font-size: 14px; line-height: 1.6; }
          a { display: inline-block; margin-top: 16px; color: #06b6d4; text-decoration: none; font-weight: 600; }
        </style>
      </head>
      <body>
        <div class="card">
          <h1>403 Forbidden</h1>
          <p>Vendor administrative privileges required. Customer sessions do not have access to the Vendor Management Portal.</p>
          <a href="/vendor/login">Sign in with Vendor Credentials &rarr;</a>
        </div>
      </body>
      </html>
    `);
  }

  // Unauthenticated request
  if (isApi) {
    return res.status(401).json({
      success: false,
      error: result.error || 'Vendor authentication required.'
    });
  }

  // Web request: redirect to vendor login
  const returnTo = encodeURIComponent(req.originalUrl || '/vendor');
  return res.redirect(`/vendor/login?returnTo=${returnTo}`);
}

/**
 * Specifically enforces API JSON responses
 */
function requireVendorApi(req, res, next) {
  const result = evaluateVendorAuth(req);

  if (result.authenticated) {
    req.isVendor = true;
    req.vendor = result.vendor;
    return next();
  }

  if (result.isCustomer) {
    return res.status(403).json({
      success: false,
      error: 'Vendor administrative privileges required.'
    });
  }

  return res.status(401).json({
    success: false,
    error: result.error || 'Vendor authentication required.'
  });
}

/**
 * Specifically enforces Web redirects
 */
function requireVendorWeb(req, res, next) {
  const result = evaluateVendorAuth(req);

  if (result.authenticated) {
    req.isVendor = true;
    req.vendor = result.vendor;
    return next();
  }

  if (result.isCustomer) {
    return res.status(403).send(`
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <title>403 Forbidden - Infrasights Vendor Console</title>
        <style>
          body { background: #080e1a; color: #f8fafc; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; }
          .card { background: #131e3a; border: 1px solid #ef4444; border-radius: 8px; padding: 32px; max-width: 480px; text-align: center; }
          h1 { color: #ef4444; margin-top: 0; font-size: 24px; }
          p { color: #94a3b8; font-size: 14px; line-height: 1.6; }
          a { display: inline-block; margin-top: 16px; color: #06b6d4; text-decoration: none; font-weight: 600; }
        </style>
      </head>
      <body>
        <div class="card">
          <h1>403 Forbidden</h1>
          <p>Vendor administrative privileges required. Customer sessions do not have access to the Vendor Management Portal.</p>
          <a href="/vendor/login">Sign in with Vendor Credentials &rarr;</a>
        </div>
      </body>
      </html>
    `);
  }

  const returnTo = encodeURIComponent(req.originalUrl || '/vendor');
  return res.redirect(`/vendor/login?returnTo=${returnTo}`);
}

module.exports = {
  vendorAuthGuard,
  requireVendorApi,
  requireVendorWeb,
  evaluateVendorAuth,
  parseCookies,
  VENDOR_SECRET_KEY,
  VENDOR_ADMIN_EMAIL,
  VENDOR_ADMIN_PASSWORD,
  VENDOR_COOKIE_NAME,
  JWT_SECRET
};
