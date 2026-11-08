/**
 * Authentication Controller
 * Handles user registration, login, profile retrieval, logout, and password reset requests.
 */

const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../config/database');
const { hashToken, JWT_SECRET } = require('../middleware/authMiddleware');
const emailService = require('../services/emailService');
const otpService = require('../services/otpService');

// RFC 5322 compliant email regex
const RFC_5322_EMAIL_REGEX = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;

/**
 * Generate cryptographically distinct JWT with unique jti nonce
 */
function generateToken(user, durationDays = 7) {
  return jwt.sign(
    {
      id: user.id,
      email: user.email,
      fullName: user.full_name || user.fullName,
      organization: user.organization,
      jti: crypto.randomBytes(16).toString('hex')
    },
    JWT_SECRET,
    { expiresIn: `${durationDays}d` }
  );
}

/**
 * Register a new enterprise user account
 * POST /api/auth/register
 */
async function register(req, res) {
  try {
    const {
      fullName,
      name,
      email,
      organization,
      departmentRole,
      password,
      phoneNumber,
      phone,
      otp,
      verificationToken
    } = req.body;

    const userFullName = (fullName || name || '').trim();
    const userEmail = (email || '').trim().toLowerCase();
    const userOrg = (organization || '').trim();
    const userRole = (departmentRole || '').trim();
    const userPass = String(password || '');
    const rawPhone = phoneNumber || phone || '';

    // Validation
    if (!userFullName || userFullName.length < 2) {
      return res.status(400).json({
        success: false,
        error: 'Full name must be at least 2 characters.'
      });
    }

    if (!userEmail || !RFC_5322_EMAIL_REGEX.test(userEmail)) {
      return res.status(400).json({
        success: false,
        error: 'A valid business email address conforming to standard RFC 5322 format is required.'
      });
    }

    if (!userOrg || userOrg.length < 2) {
      return res.status(400).json({
        success: false,
        error: 'Organization name must be at least 2 characters.'
      });
    }

    if (!userPass || userPass.length < 8) {
      return res.status(400).json({
        success: false,
        error: 'Password must be at least 8 characters long.'
      });
    }

    // Mobile Number & OTP Verification (if provided or required)
    let validatedPhone = null;
    let isPhoneVerified = 0;

    if (rawPhone) {
      if (!otpService.isValidPhoneNumber(rawPhone)) {
        return res.status(400).json({
          success: false,
          error: 'Please enter a valid mobile number (10 to 15 digits, e.g. +91 98765 43210).'
        });
      }
      validatedPhone = otpService.normalizePhoneNumber(rawPhone);

      if (otp) {
        try {
          await otpService.verifyOtp({ phoneNumber: validatedPhone, otp });
          isPhoneVerified = 1;
        } catch (otpErr) {
          return res.status(400).json({
            success: false,
            error: `OTP Verification Failed: ${otpErr.message}`
          });
        }
      } else if (verificationToken) {
        if (otpService.isTokenValid(validatedPhone, verificationToken)) {
          isPhoneVerified = 1;
          otpService.consumeToken(verificationToken);
        } else {
          return res.status(400).json({
            success: false,
            error: 'Invalid or expired phone verification token. Please verify OTP again.'
          });
        }
      }
    }

    // Check for existing account
    const existing = await db.findUserByEmail(userEmail);
    if (existing) {
      return res.status(409).json({
        success: false,
        error: 'An account with this business email already exists. Please sign in.'
      });
    }

    // Hash password with bcrypt
    const passwordHash = await bcrypt.hash(userPass, 10);

    // Persist user record
    const created = await db.createUser({
      email: userEmail,
      password_hash: passwordHash,
      full_name: userFullName,
      organization: userOrg,
      department_role: userRole || null,
      phone_number: validatedPhone,
      phone_verified: isPhoneVerified
    });

    // Generate JWT token (7-day validity)
    const token = generateToken(created, 7);

    // Save session
    const tokenH = hashToken(token);
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    const clientIp = req.ip || req.connection?.remoteAddress || null;
    const userAgent = req.headers['user-agent'] || null;

    await db.createSession({
      user_id: created.id,
      token_hash: tokenH,
      ip_address: clientIp,
      user_agent: userAgent,
      expires_at: expiresAt
    });

    // Record audit log
    await db.createAuditLog({
      user_id: created.id,
      event_type: 'USER_REGISTERED',
      event_description: `User account created for ${created.email} (${created.organization}) with mobile ${created.phone_number || 'N/A'}`,
      ip_address: clientIp
    });

    // Dispatch official registration welcome email from admin@infrasights.in
    try {
      await emailService.sendRegistrationWelcomeEmail({
        email: created.email,
        fullName: created.full_name,
        organization: created.organization,
        phoneNumber: created.phone_number
      });
      console.log(`[AuthController] Registration welcome email triggered for ${created.email} from admin@infrasights.in`);
    } catch (mailErr) {
      console.warn(`[AuthController] Warning: Welcome email dispatch encountered: ${mailErr.message}`);
    }

    const sanitizedUser = {
      id: created.id,
      email: created.email,
      fullName: created.full_name,
      organization: created.organization,
      departmentRole: created.department_role || userRole,
      phoneNumber: created.phone_number || validatedPhone,
      phoneVerified: Boolean(created.phone_verified || isPhoneVerified)
    };

    return res.status(201).json({
      success: true,
      data: {
        user: sanitizedUser,
        token
      }
    });
  } catch (error) {
    console.error('[AuthController.register] Error:', error);
    return res.status(500).json({
      success: false,
      error: 'Registration failed due to an unexpected server error.'
    });
  }
}

/**
 * Authenticate existing user
 * POST /api/auth/login
 */
async function login(req, res) {
  try {
    const { email, password, rememberMe } = req.body;

    const userEmail = (email || '').trim().toLowerCase();
    const userPass = String(password || '');

    if (!userEmail || !userPass) {
      return res.status(400).json({
        success: false,
        error: 'Both business email and password are required.'
      });
    }

    const user = await db.findUserByEmail(userEmail);
    if (!user) {
      return res.status(401).json({
        success: false,
        error: 'Invalid credentials. Please verify your business email and password.'
      });
    }

    if (user.is_active === 0) {
      return res.status(401).json({
        success: false,
        error: 'This account has been deactivated. Contact your SAN administrator.'
      });
    }

    // Compare bcrypt hash
    const match = await bcrypt.compare(userPass, user.password_hash);
    if (!match) {
      return res.status(401).json({
        success: false,
        error: 'Invalid credentials. Please verify your business email and password.'
      });
    }

    // Determine session lifetime
    const durationDays = rememberMe ? 30 : 7;
    const token = generateToken(user, durationDays);

    const tokenH = hashToken(token);
    const expiresAt = new Date(Date.now() + durationDays * 24 * 60 * 60 * 1000);
    const clientIp = req.ip || req.connection?.remoteAddress || null;
    const userAgent = req.headers['user-agent'] || null;

    await db.createSession({
      user_id: user.id,
      token_hash: tokenH,
      ip_address: clientIp,
      user_agent: userAgent,
      expires_at: expiresAt
    });

    await db.createAuditLog({
      user_id: user.id,
      event_type: 'USER_LOGIN',
      event_description: `User ${user.email} authenticated successfully`,
      ip_address: clientIp
    });

    const sanitizedUser = {
      id: user.id,
      email: user.email,
      fullName: user.full_name,
      organization: user.organization,
      departmentRole: user.department_role
    };

    return res.status(200).json({
      success: true,
      data: {
        user: sanitizedUser,
        token
      }
    });
  } catch (error) {
    console.error('[AuthController.login] Error:', error);
    return res.status(500).json({
      success: false,
      error: 'Authentication failed due to an unexpected server error.'
    });
  }
}

/**
 * Retrieve authenticated user profile
 * GET /api/auth/me
 */
async function me(req, res) {
  try {
    return res.status(200).json({
      success: true,
      data: {
        user: req.user
      }
    });
  } catch (error) {
    console.error('[AuthController.me] Error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to retrieve profile.'
    });
  }
}

/**
 * Sign out and revoke session token
 * POST /api/auth/logout
 */
async function logout(req, res) {
  try {
    let tokenHash = req.tokenHash;
    if (!tokenHash) {
      const authHeader = req.headers['authorization'] || req.headers['Authorization'];
      if (authHeader) {
        const parts = authHeader.split(' ');
        if (parts.length === 2 && parts[0].toLowerCase() === 'bearer') {
          tokenHash = hashToken(parts[1]);
        }
      }
    }

    if (tokenHash) {
      await db.revokeSession(tokenHash);
    }

    if (req.user && req.user.id) {
      await db.createAuditLog({
        user_id: req.user.id,
        event_type: 'USER_LOGOUT',
        event_description: `User ${req.user.email} signed out`,
        ip_address: req.ip || null
      });
    }

    return res.status(200).json({
      success: true,
      message: 'Signed out successfully.'
    });
  } catch (error) {
    console.error('[AuthController.logout] Error:', error);
    return res.status(500).json({
      success: false,
      error: 'Logout processing encountered an error.'
    });
  }
}

/**
 * Non-enumerating password reset request
 * POST /api/auth/forgot-password
 */
async function forgotPassword(req, res) {
  try {
    const { email } = req.body;
    const userEmail = (email || '').trim().toLowerCase();

    if (userEmail && RFC_5322_EMAIL_REGEX.test(userEmail)) {
      const user = await db.findUserByEmail(userEmail);
      if (user) {
        await db.createAuditLog({
          user_id: user.id,
          event_type: 'PASSWORD_RESET_REQUESTED',
          event_description: `Password recovery dispatched for ${user.email}`,
          ip_address: req.ip || null
        });
      }
    }

    // Always respond with identical non-enumerating message
    return res.status(200).json({
      success: true,
      message: 'If an account matches that business email, password reset instructions have been dispatched.'
    });
  } catch (error) {
    console.error('[AuthController.forgotPassword] Error:', error);
    return res.status(500).json({
      success: false,
      error: 'Unable to process password reset request.'
    });
  }
}

/**
 * Send OTP to user's mobile number
 * POST /api/auth/send-otp
 */
async function sendOtp(req, res) {
  try {
    const { phoneNumber, phone, email } = req.body;
    const targetPhone = phoneNumber || phone;

    if (!targetPhone) {
      return res.status(400).json({
        success: false,
        error: 'Mobile phone number is required.'
      });
    }

    const result = await otpService.sendOtp({
      phoneNumber: targetPhone,
      email
    });

    return res.status(200).json({
      success: true,
      message: `Verification code dispatched to ${result.phoneNumber}${result.emailDispatched ? ' and your email' : ''}.`,
      expiresInSeconds: result.expiresInSeconds,
      cooldownSeconds: result.cooldownSeconds,
      phoneNumber: result.phoneNumber,
      ...(result.debugOtp ? { debugOtp: result.debugOtp } : {})
    });
  } catch (err) {
    const status = err.code === 'RATE_LIMITED' ? 429 : 400;
    return res.status(status).json({
      success: false,
      error: err.message,
      retryAfterSeconds: err.retryAfterSeconds
    });
  }
}

/**
 * Verify OTP entered by user
 * POST /api/auth/verify-otp
 */
async function verifyOtp(req, res) {
  try {
    const { phoneNumber, phone, otp, code } = req.body;
    const targetPhone = phoneNumber || phone;
    const targetOtp = otp || code;

    if (!targetPhone || !targetOtp) {
      return res.status(400).json({
        success: false,
        error: 'Both mobile phone number and 6-digit verification code are required.'
      });
    }

    const result = await otpService.verifyOtp({
      phoneNumber: targetPhone,
      otp: targetOtp
    });

    return res.status(200).json({
      success: true,
      verified: true,
      message: 'Mobile number verified successfully.',
      verificationToken: result.verificationToken,
      phoneNumber: result.phoneNumber
    });
  } catch (err) {
    return res.status(400).json({
      success: false,
      error: err.message
    });
  }
}

module.exports = {
  generateToken,
  register,
  login,
  me,
  logout,
  forgotPassword,
  sendOtp,
  verifyOtp
};
