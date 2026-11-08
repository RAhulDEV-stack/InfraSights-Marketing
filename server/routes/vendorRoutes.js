/**
 * Vendor Routes
 * Express routers for Vendor REST API (/api/vendor/*) and SSR Web Views (/vendor, /vendor/login).
 */

const express = require('express');
const vendorController = require('../controllers/vendorController');
const { requireVendorApi, requireVendorWeb } = require('../middleware/vendorAuthGuard');

// API Router (/api/vendor)
const apiRouter = express.Router();

// Public vendor authentication endpoints (supports both /auth/login and /login)
apiRouter.post('/auth/login', vendorController.login);
apiRouter.post('/login', vendorController.login);
apiRouter.post('/auth/logout', vendorController.logout);
apiRouter.post('/logout', vendorController.logout);

// Protected vendor operational endpoints
apiRouter.get('/deployments', requireVendorApi, vendorController.listDeployments);
apiRouter.get('/deployments/:tracking_ref', requireVendorApi, vendorController.getDeploymentDetails);
apiRouter.patch('/deployments/:tracking_ref/status', requireVendorApi, vendorController.updateStatus);
apiRouter.get('/stats', requireVendorApi, vendorController.getStats);

// Web Router (/vendor, /vendor/login)
const webRouter = express.Router();

webRouter.get('/vendor', requireVendorWeb, vendorController.renderDashboard);
webRouter.get('/vendor/login', vendorController.renderLogin);
webRouter.post('/vendor/login', vendorController.handleWebLogin);
webRouter.get('/vendor/logout', vendorController.handleWebLogout);

// Attach webRouter to apiRouter for flexible importing
apiRouter.apiRouter = apiRouter;
apiRouter.webRouter = webRouter;

module.exports = apiRouter;
