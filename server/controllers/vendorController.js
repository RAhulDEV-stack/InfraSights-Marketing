/**
 * Vendor Controller
 * Handles vendor authentication, deployment listing, inspection, status updates, and stats.
 */

const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const db = require('../config/database');
const {
  VENDOR_SECRET_KEY,
  VENDOR_ADMIN_EMAIL,
  VENDOR_ADMIN_PASSWORD,
  VENDOR_COOKIE_NAME,
  JWT_SECRET,
  evaluateVendorAuth
} = require('../middleware/vendorAuthGuard');
const { renderVendorDashboard } = require('../views/vendorDashboard');
const { renderVendorLogin } = require('../views/vendorLogin');

const VALID_STATUSES = [
  'PENDING_REVIEW',
  'UNDER_EVALUATION',
  'QUALIFIED',
  'DEPLOYED',
  'DEPLOYMENT_SCHEDULED',
  'REJECTED',
  'ARCHIVED'
];

/**
 * Generate vendor JWT token with 24h duration
 */
function generateVendorToken(email = VENDOR_ADMIN_EMAIL) {
  return jwt.sign(
    {
      id: 'vendor-admin',
      email: email.toLowerCase(),
      fullName: 'Infrasights Vendor Administrator',
      role: 'VENDOR_ADMIN',
      isVendor: true,
      jti: crypto.randomBytes(16).toString('hex')
    },
    JWT_SECRET,
    { expiresIn: '24h' }
  );
}

/**
 * API: Authenticate vendor staff via admin credentials or secret key
 * POST /api/vendor/auth/login
 */
async function login(req, res) {
  try {
    const { email, password, secretKey } = req.body;

    // Check Secret Key
    if (secretKey) {
      if (secretKey === VENDOR_SECRET_KEY) {
        const token = generateVendorToken(VENDOR_ADMIN_EMAIL);
        res.cookie(VENDOR_COOKIE_NAME, token, {
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production',
          sameSite: 'lax',
          path: '/',
          maxAge: 24 * 60 * 60 * 1000
        });

        return res.status(200).json({
          success: true,
          token,
          role: 'VENDOR_ADMIN',
          message: 'Vendor authentication successful'
        });
      }

      return res.status(401).json({
        success: false,
        error: 'Invalid vendor secret key.'
      });
    }

    // Check Admin Credentials
    const userEmail = (email || '').trim().toLowerCase();
    const userPass = String(password || '');

    if (!userEmail || !userPass) {
      return res.status(400).json({
        success: false,
        error: 'Vendor credentials or secret key required.'
      });
    }

    const matchesEmail = userEmail === VENDOR_ADMIN_EMAIL || userEmail === 'admin@infrasights.in' || userEmail === 'admin@infrasights.io';
    const matchesPass = userPass === VENDOR_ADMIN_PASSWORD || userPass === VENDOR_SECRET_KEY;

    if (matchesEmail && matchesPass) {
      const token = generateVendorToken(userEmail);
      res.cookie(VENDOR_COOKIE_NAME, token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/',
        maxAge: 24 * 60 * 60 * 1000
      });

      return res.status(200).json({
        success: true,
        token,
        role: 'VENDOR_ADMIN',
        message: 'Vendor authentication successful'
      });
    }

    return res.status(401).json({
      success: false,
      error: 'Invalid vendor administrator credentials.'
    });
  } catch (error) {
    console.error('[VendorController.login] Error:', error);
    return res.status(500).json({
      success: false,
      error: 'Vendor authentication processing encountered an error.'
    });
  }
}

/**
 * API: Terminate vendor session
 * POST /api/vendor/auth/logout
 */
async function logout(req, res) {
  try {
    res.clearCookie(VENDOR_COOKIE_NAME, { path: '/' });
    return res.status(200).json({
      success: true,
      message: 'Vendor session terminated'
    });
  } catch (error) {
    console.error('[VendorController.logout] Error:', error);
    return res.status(500).json({
      success: false,
      error: 'Vendor logout encountered an error.'
    });
  }
}

/**
 * API: Cross-tenant deployment list with search, filter, and pagination
 * GET /api/vendor/deployments
 */
async function listDeployments(req, res) {
  try {
    const {
      search = '',
      status = 'ALL',
      page = 1,
      limit = 25,
      sortBy = 'created_at',
      sortOrder = 'DESC'
    } = req.query;

    const result = await db.findAllDeployments({
      search,
      status,
      page,
      limit,
      sortBy,
      sortOrder
    });

    return res.status(200).json({
      success: true,
      total: result.total,
      count: result.count,
      page: result.page,
      limit: result.limit,
      totalPages: result.totalPages,
      data: result.data
    });
  } catch (error) {
    console.error('[VendorController.listDeployments] Error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to retrieve qualification requests.'
    });
  }
}

/**
 * API: Retrieve complete unredacted deployment specification and audit logs
 * GET /api/vendor/deployments/:tracking_ref
 */
async function getDeploymentDetails(req, res) {
  try {
    const { tracking_ref } = req.params;

    if (!tracking_ref) {
      return res.status(400).json({
        success: false,
        error: 'Tracking reference parameter required.'
      });
    }

    const record = await db.findDeploymentByTrackingRef(tracking_ref);
    if (!record) {
      return res.status(404).json({
        success: false,
        error: `Deployment request ${tracking_ref} not found.`
      });
    }

    return res.status(200).json({
      success: true,
      data: record
    });
  } catch (error) {
    console.error('[VendorController.getDeploymentDetails] Error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to inspect deployment qualification record.'
    });
  }
}

/**
 * API: Update deployment lifecycle status and assign engineer
 * PATCH /api/vendor/deployments/:tracking_ref/status
 */
async function updateStatus(req, res) {
  try {
    const { tracking_ref } = req.params;
    const { status, assignedEngineer, internalNotes } = req.body;

    if (!tracking_ref) {
      return res.status(400).json({
        success: false,
        error: 'Tracking reference parameter required.'
      });
    }

    if (!status) {
      return res.status(400).json({
        success: false,
        error: 'Status parameter required.'
      });
    }

    const normalizedStatus = String(status).trim().toUpperCase();
    if (!VALID_STATUSES.includes(normalizedStatus)) {
      return res.status(400).json({
        success: false,
        error: `Invalid deployment status. Must be one of: ${VALID_STATUSES.join(', ')}`
      });
    }

    const updated = await db.updateDeploymentStatus(tracking_ref, {
      status: normalizedStatus,
      assignedEngineer,
      internalNotes,
      userId: req.vendor?.id,
      ipAddress: req.ip || null
    });

    if (!updated) {
      return res.status(404).json({
        success: false,
        error: `Deployment request ${tracking_ref} not found.`
      });
    }

    return res.status(200).json({
      success: true,
      data: {
        trackingRef: updated.tracking_ref,
        status: updated.status,
        assignedEngineer: updated.assigned_engineer,
        updatedAt: updated.updated_at
      },
      message: 'Deployment status updated successfully'
    });
  } catch (error) {
    console.error('[VendorController.updateStatus] Error:', error);
    return res.status(error.statusCode || 500).json({
      success: false,
      error: error.message || 'Failed to update qualification status.'
    });
  }
}

/**
 * API: Aggregate deployment pipeline KPI statistics
 * GET /api/vendor/stats
 */
async function getStats(req, res) {
  try {
    const stats = await db.getDeploymentStats();
    return res.status(200).json({
      success: true,
      data: stats
    });
  } catch (error) {
    console.error('[VendorController.getStats] Error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to retrieve vendor stats.'
    });
  }
}

/**
 * Web SSR: Render Vendor Management Dashboard
 * GET /vendor
 */
async function renderDashboard(req, res) {
  try {
    const search = req.query.search || '';
    const status = req.query.status || 'ALL';
    const page = parseInt(req.query.page, 10) || 1;
    const limit = 50;

    const [stats, deploymentsResult] = await Promise.all([
      db.getDeploymentStats(),
      db.findAllDeployments({ search, status, page, limit })
    ]);

    const html = renderVendorDashboard({
      stats,
      deployments: deploymentsResult.data,
      total: deploymentsResult.total,
      page: deploymentsResult.page,
      totalPages: deploymentsResult.totalPages,
      search,
      status,
      user: req.vendor || { email: VENDOR_ADMIN_EMAIL }
    });

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.send(html);
  } catch (error) {
    console.error('[VendorController.renderDashboard] Error:', error);
    return res.status(500).send(`
      <!DOCTYPE html>
      <html><body><h1>Vendor Dashboard Error</h1><p>${error.message}</p></body></html>
    `);
  }
}

/**
 * Web SSR: Render Vendor Login Page
 * GET /vendor/login
 */
async function renderLogin(req, res) {
  try {
    // If already authenticated, redirect to /vendor
    const auth = evaluateVendorAuth(req);
    if (auth.authenticated) {
      return res.redirect('/vendor');
    }

    const html = renderVendorLogin({
      error: req.query.error || null,
      returnTo: req.query.returnTo || '/vendor'
    });

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.send(html);
  } catch (error) {
    console.error('[VendorController.renderLogin] Error:', error);
    return res.status(500).send('Login rendering error');
  }
}

/**
 * Web Form Handler: Handle standard POST login from /vendor/login
 * POST /vendor/login
 */
async function handleWebLogin(req, res) {
  try {
    const { secretKey, email, password, returnTo = '/vendor' } = req.body;

    let authenticated = false;
    let authEmail = VENDOR_ADMIN_EMAIL;

    if (secretKey && secretKey === VENDOR_SECRET_KEY) {
      authenticated = true;
    } else if (email && password) {
      const normalizedEmail = String(email).trim().toLowerCase();
      const matchesEmail = normalizedEmail === VENDOR_ADMIN_EMAIL || normalizedEmail === 'admin@infrasights.in' || normalizedEmail === 'admin@infrasights.io';
      const matchesPass = password === VENDOR_ADMIN_PASSWORD || password === VENDOR_SECRET_KEY;
      if (matchesEmail && matchesPass) {
        authenticated = true;
        authEmail = normalizedEmail;
      }
    }

    if (authenticated) {
      const token = generateVendorToken(authEmail);
      res.cookie(VENDOR_COOKIE_NAME, token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/',
        maxAge: 24 * 60 * 60 * 1000
      });
      return res.redirect(returnTo || '/vendor');
    }

    const html = renderVendorLogin({
      error: 'Invalid vendor credentials or secret key.',
      returnTo
    });
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.status(401).send(html);
  } catch (error) {
    console.error('[VendorController.handleWebLogin] Error:', error);
    return res.status(500).send('Login processing error');
  }
}

/**
 * Web Handler: Sign out from web session
 * GET /vendor/logout
 */
async function handleWebLogout(req, res) {
  res.clearCookie(VENDOR_COOKIE_NAME, { path: '/' });
  return res.redirect('/vendor/login');
}

module.exports = {
  login,
  logout,
  listDeployments,
  getDeploymentDetails,
  updateStatus,
  getStats,
  renderDashboard,
  renderLogin,
  handleWebLogin,
  handleWebLogout,
  generateVendorToken
};
