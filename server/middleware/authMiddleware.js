/**
 * Authentication Middleware / Guard
 * Validates JWT Bearer tokens and attaches the verified user to req.user.
 */

const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const db = require('../config/database');

const JWT_SECRET = process.env.JWT_SECRET || 'infrasights_v210_enterprise_secure_token_secret_2026';

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

async function authenticateToken(req, res, next) {
  try {
    const authHeader = req.headers['authorization'] || req.headers['Authorization'];
    if (!authHeader) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required. Authorization header missing.'
      });
    }

    const parts = authHeader.split(' ');
    if (parts.length !== 2 || parts[0] !== 'Bearer') {
      return res.status(401).json({
        success: false,
        error: 'Invalid authorization format. Bearer token required.'
      });
    }

    const token = parts[1];

    let decoded;
    try {
      decoded = jwt.verify(token, JWT_SECRET);
    } catch (err) {
      return res.status(401).json({
        success: false,
        error: 'Invalid or expired session token.'
      });
    }

    const tokenHash = hashToken(token);
    const session = await db.findSessionByTokenHash(tokenHash);

    // If session was revoked or expired, block access
    if (!session || session.revoked_at) {
      return res.status(401).json({
        success: false,
        error: 'Session has expired or been signed out. Please log in again.'
      });
    }

    if (session.expires_at && new Date(session.expires_at).getTime() < Date.now()) {
      return res.status(401).json({
        success: false,
        error: 'Session has expired. Please log in again.'
      });
    }

    const userId = decoded.id || decoded.userId;
    const user = await db.findUserById(userId);

    if (!user || user.is_active === 0) {
      return res.status(401).json({
        success: false,
        error: 'User account not found or deactivated.'
      });
    }

    // Attach sanitized user context
    req.user = {
      id: user.id,
      email: user.email,
      fullName: user.full_name || user.fullName,
      organization: user.organization,
      departmentRole: user.department_role || user.departmentRole
    };
    req.token = token;
    req.tokenHash = tokenHash;

    next();
  } catch (error) {
    console.error('[AuthMiddleware] Error validating token:', error);
    return res.status(500).json({
      success: false,
      error: 'Internal authentication validation error.'
    });
  }
}

module.exports = {
  authenticateToken,
  hashToken,
  JWT_SECRET
};
