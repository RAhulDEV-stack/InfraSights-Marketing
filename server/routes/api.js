/**
 * Infrasights v2.10 REST API Router
 * Mounts health, authentication, and deployment endpoints under /api.
 */

const express = require('express');
const router = express.Router();

const healthController = require('../controllers/healthController');
const authController = require('../controllers/authController');
const deploymentController = require('../controllers/deploymentController');
const mailController = require('../controllers/mailController');
const { authenticateToken } = require('../middleware/authMiddleware');

// Health Check Probe
router.get('/health', healthController.getHealth);

// Authentication Routes
router.post('/auth/register', authController.register);
router.post('/auth/login', authController.login);
router.post('/auth/send-otp', authController.sendOtp);
router.post('/auth/verify-otp', authController.verifyOtp);
router.get('/auth/me', authenticateToken, authController.me);
router.post('/auth/logout', authenticateToken, authController.logout);
router.post('/auth/forgot-password', authController.forgotPassword);

// Deployment Qualification Routes
router.post('/deployments', authenticateToken, deploymentController.createDeployment);
router.get('/deployments', authenticateToken, deploymentController.getDeployments);
router.get('/deployments/:tracking_ref', deploymentController.getDeploymentByRef);

// Mail Service Endpoints
router.get('/mail/health', mailController.getHealth);
router.post('/mail/send', mailController.sendMail);
router.post('/mail/deployment-qualification', mailController.qualificationMail);
router.get('/mail/history', mailController.getHistory);

module.exports = router;
