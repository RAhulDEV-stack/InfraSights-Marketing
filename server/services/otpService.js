/**
 * Infrasights v2.10 - Enterprise Mobile Number & OTP Verification Service
 * Handles cryptographic 6-digit OTP generation, rate limiting, attempt tracking,
 * verification token generation, and multi-channel dispatch (SMS log & domain email).
 * Dispatched via official domain address: admin@infrasights.in
 */

const crypto = require('crypto');
const https = require('https');
const querystring = require('querystring');
const emailService = require('./emailService');

// Phone normalization regex: supports E.164 (+91..., +1...) and standard national formats
const PHONE_CLEAN_REGEX = /[^\d+]/g;
const VALID_PHONE_REGEX = /^\+?[1-9]\d{6,14}$/;

// OTP Store: phoneNumber -> { code, email, expiresAt, attempts, lastRequestedAt }
const otpStore = new Map();

// Verified Phone Tokens: verificationToken -> { phoneNumber, expiresAt }
const verifiedTokens = new Map();

// Configuration Constants
const OTP_EXPIRY_MS = 5 * 60 * 1000; // 5 minutes
const RATE_LIMIT_COOLDOWN_MS = 60 * 1000; // 60 seconds between resends
const MAX_ATTEMPTS = 3; // Maximum failed attempts
const TOKEN_EXPIRY_MS = 15 * 60 * 1000; // 15 minutes to complete registration

/**
 * Clean and normalize phone number
 */
function normalizePhoneNumber(rawPhone) {
  if (!rawPhone || typeof rawPhone !== 'string') return '';
  const cleaned = rawPhone.replace(PHONE_CLEAN_REGEX, '');
  return cleaned;
}

/**
 * Validate phone number structure
 */
function isValidPhoneNumber(phone) {
  const normalized = normalizePhoneNumber(phone);
  return VALID_PHONE_REGEX.test(normalized);
}

/**
 * Generate 6-digit cryptographic OTP code
 */
function generateCode() {
  return String(crypto.randomInt(100000, 1000000));
}

/**
 * Generate cryptographic verification token
 */
function generateVerificationToken(phone) {
  const nonce = crypto.randomBytes(24).toString('hex');
  const token = `vtok_${Date.now()}_${nonce}`;
  verifiedTokens.set(token, {
    phoneNumber: phone,
    expiresAt: Date.now() + TOKEN_EXPIRY_MS
  });
  return token;
}

/**
 * Dispatch real SMS to mobile device via configured carrier gateway
 * Supports: 2Factor.in (Zero-DLT India), Fast2SMS (Route 'q' Zero-DLT), Twilio, MSG91, or console simulation fallback
 */
async function sendSmsViaCarrier(phoneNumber, code) {
  const normalizedDigits = phoneNumber.replace(/[^\d]/g, '');
  const tenDigitPhone = normalizedDigits.length > 10 ? normalizedDigits.slice(-10) : normalizedDigits;

  // 1. 2Factor.in Integration (Instant Indian mobile OTP dispatch - ZERO DLT REQUIRED)
  // Uses 2Factor's pre-approved banking header (TFCTOR) so developers don't need DLT/GST registration.
  const twoFactorKey = (process.env.TWOFACTOR_API_KEY || process.env['2FACTOR_API_KEY'] || '').trim();
  if (twoFactorKey) {
    try {
      console.log(`[SMS Gateway] Dispatched via 2Factor.in (Zero-DLT) to ${phoneNumber}...`);
      await new Promise((resolve, reject) => {
        const path = `/API/V1/${encodeURIComponent(twoFactorKey)}/SMS/${encodeURIComponent(tenDigitPhone)}/${encodeURIComponent(code)}/Infrasights+OTP`;
        const req = https.request({
          hostname: '2factor.in',
          path,
          method: 'GET',
          timeout: 6000
        }, res => {
          let data = '';
          res.on('data', chunk => data += chunk);
          res.on('end', () => {
            console.log(`[SMS Gateway:2Factor] Provider response (${res.statusCode}): ${data}`);
            resolve(data);
          });
        });

        req.on('error', reject);
        req.on('timeout', () => { req.destroy(); reject(new Error('2Factor timeout')); });
        req.end();
      });

      return { provider: '2FACTOR', status: 'SENT' };
    } catch (e) {
      console.warn(`[SMS Gateway] Warning: 2Factor dispatch failed: ${e.message}`);
    }
  }

  // 2. Fast2SMS Integration (Instant Indian mobile OTP dispatch)
  // Supports Route 'q' (Quick SMS - ZERO DLT REQUIRED) and Route 'otp'
  const fast2smsKey = (process.env.FAST2SMS_API_KEY || '').trim();
  if (fast2smsKey) {
    try {
      const route = (process.env.FAST2SMS_ROUTE || 'q').toLowerCase().trim();
      console.log(`[SMS Gateway] Dispatched via Fast2SMS (Route: ${route}) to ${phoneNumber}...`);

      const payload = route === 'otp'
        ? {
            route: 'otp',
            variables_values: code,
            numbers: tenDigitPhone
          }
        : {
            route: 'q',
            message: `Your Infrasights security verification code is: ${code}. Valid for 5 minutes. Do not share.`,
            language: 'english',
            flash: 0,
            numbers: tenDigitPhone
          };

      const postData = JSON.stringify(payload);

      await new Promise((resolve, reject) => {
        const req = https.request({
          hostname: 'www.fast2sms.com',
          path: '/dev/bulkV2',
          method: 'POST',
          headers: {
            'authorization': fast2smsKey,
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(postData)
          },
          timeout: 6000
        }, res => {
          let data = '';
          res.on('data', chunk => data += chunk);
          res.on('end', () => {
            console.log(`[SMS Gateway:Fast2SMS] Provider response (${res.statusCode}): ${data}`);
            resolve(data);
          });
        });

        req.on('error', reject);
        req.on('timeout', () => { req.destroy(); reject(new Error('Fast2SMS timeout')); });
        req.write(postData);
        req.end();
      });

      return { provider: 'FAST2SMS', status: 'SENT', route };
    } catch (e) {
      console.warn(`[SMS Gateway] Warning: Fast2SMS dispatch failed: ${e.message}`);
    }
  }

  // 2. Twilio Integration (Global E.164 SMS dispatch)
  const twilioSid = (process.env.TWILIO_ACCOUNT_SID || '').trim();
  const twilioToken = (process.env.TWILIO_AUTH_TOKEN || '').trim();
  const twilioFrom = (process.env.TWILIO_PHONE_NUMBER || '').trim();

  if (twilioSid && twilioToken && twilioFrom) {
    try {
      console.log(`[SMS Gateway] Dispatched via Twilio to ${phoneNumber}...`);
      const auth = Buffer.from(`${twilioSid}:${twilioToken}`).toString('base64');
      const body = querystring.stringify({
        To: phoneNumber.startsWith('+') ? phoneNumber : `+${phoneNumber}`,
        From: twilioFrom,
        Body: `Infrasights v2.10 Security Code: ${code}. Valid for 5 minutes. Do not share.`
      });

      await new Promise((resolve, reject) => {
        const req = https.request({
          hostname: 'api.twilio.com',
          path: `/2010-04-01/Accounts/${twilioSid}/Messages.json`,
          method: 'POST',
          headers: {
            'Authorization': `Basic ${auth}`,
            'Content-Type': 'application/x-www-form-urlencoded',
            'Content-Length': Buffer.byteLength(body)
          },
          timeout: 5000
        }, res => {
          let data = '';
          res.on('data', chunk => data += chunk);
          res.on('end', () => {
            console.log(`[SMS Gateway:Twilio] Provider response (${res.statusCode}): ${data}`);
            resolve(data);
          });
        });

        req.on('error', reject);
        req.on('timeout', () => { req.destroy(); reject(new Error('Twilio timeout')); });
        req.write(body);
        req.end();
      });

      return { provider: 'TWILIO', status: 'SENT' };
    } catch (e) {
      console.warn(`[SMS Gateway] Warning: Twilio dispatch failed: ${e.message}`);
    }
  }

  // 3. MSG91 Integration (Indian Enterprise DLT Gateway)
  const msg91Auth = (process.env.MSG91_AUTH_KEY || '').trim();
  const msg91Template = (process.env.MSG91_TEMPLATE_ID || '').trim();
  if (msg91Auth && msg91Template) {
    try {
      console.log(`[SMS Gateway] Dispatched via MSG91 to ${phoneNumber}...`);
      await new Promise((resolve, reject) => {
        const path = `/api/v5/otp?template_id=${encodeURIComponent(msg91Template)}&mobile=${encodeURIComponent(tenDigitPhone)}&authkey=${encodeURIComponent(msg91Auth)}&otp=${encodeURIComponent(code)}`;
        const req = https.request({
          hostname: 'control.msg91.com',
          path,
          method: 'POST',
          timeout: 5000
        }, res => {
          let data = '';
          res.on('data', chunk => data += chunk);
          res.on('end', () => resolve(data));
        });
        req.on('error', reject);
        req.on('timeout', () => { req.destroy(); reject(new Error('MSG91 timeout')); });
        req.end();
      });
      return { provider: 'MSG91', status: 'SENT' };
    } catch (e) {
      console.warn(`[SMS Gateway] Warning: MSG91 dispatch failed: ${e.message}`);
    }
  }

  // 4. Zero-Cost Local Development / Outbox Fallback Mode
  console.log(`=======================================================`);
  console.log(`[SMS-GATEWAY] Secure OTP Dispatch to ${phoneNumber}`);
  console.log(`[SMS-GATEWAY] Verification Code: [ ${code} ]`);
  console.log(`[SMS-GATEWAY] Status: DELIVERED (Console / Mail Service Outbox)`);
  console.log(`=======================================================`);
  return { provider: 'LOCAL_LOGGER', status: 'LOGGED' };
}

/**
 * Send OTP to mobile phone (and email if provided)
 */
async function sendOtp({ phoneNumber, email = null }) {
  const normalized = normalizePhoneNumber(phoneNumber);

  if (!isValidPhoneNumber(normalized)) {
    throw new Error('Invalid mobile phone number format. Please provide an international or 10-15 digit number (e.g., +91 98765 43210).');
  }

  const now = Date.now();
  const existing = otpStore.get(normalized);

  // Rate Limiting Check: 60-second cooldown
  if (existing && (now - existing.lastRequestedAt) < RATE_LIMIT_COOLDOWN_MS) {
    const remainingSec = Math.ceil((RATE_LIMIT_COOLDOWN_MS - (now - existing.lastRequestedAt)) / 1000);
    const err = new Error(`Please wait ${remainingSec} seconds before requesting a new verification code.`);
    err.code = 'RATE_LIMITED';
    err.retryAfterSeconds = remainingSec;
    throw err;
  }

  const code = generateCode();
  const expiresAt = now + OTP_EXPIRY_MS;

  otpStore.set(normalized, {
    code,
    email: email ? String(email).trim().toLowerCase() : null,
    expiresAt,
    attempts: 0,
    lastRequestedAt: now
  });

  // 1. Dispatch SMS via real carrier gateway or console logger
  const carrierResult = await sendSmsViaCarrier(normalized, code);

  // 2. Multi-channel dispatch: Send OTP via domain email (admin@infrasights.in) if user provided email
  let emailDispatched = false;
  if (email && String(email).includes('@')) {
    try {
      await emailService.sendOtpEmail({
        email,
        phoneNumber: normalized,
        otpCode: code
      });
      emailDispatched = true;
      console.log(`[OtpService] Backup OTP email dispatched to ${email} from admin@infrasights.in`);
    } catch (mailErr) {
      console.warn(`[OtpService] Warning: Failed to dispatch backup OTP email: ${mailErr.message}`);
    }
  }

  return {
    success: true,
    phoneNumber: normalized,
    carrierProvider: carrierResult.provider,
    expiresInSeconds: Math.floor(OTP_EXPIRY_MS / 1000),
    cooldownSeconds: Math.floor(RATE_LIMIT_COOLDOWN_MS / 1000),
    emailDispatched,
    // Debug code returned in development/test for automated E2E verification
    debugOtp: process.env.NODE_ENV !== 'production' ? code : undefined
  };
}

/**
 * Verify submitted OTP code
 */
async function verifyOtp({ phoneNumber, otp }) {
  const normalized = normalizePhoneNumber(phoneNumber);
  const code = String(otp || '').trim();

  if (!normalized) {
    throw new Error('Mobile phone number is required.');
  }

  if (!code || code.length !== 6) {
    throw new Error('Please enter a valid 6-digit verification code.');
  }

  const record = otpStore.get(normalized);
  if (!record) {
    throw new Error('No active verification code found for this mobile number. Please request a new code.');
  }

  const now = Date.now();
  if (now > record.expiresAt) {
    otpStore.delete(normalized);
    throw new Error('Verification code has expired. Please request a new code.');
  }

  if (record.attempts >= MAX_ATTEMPTS) {
    otpStore.delete(normalized);
    throw new Error('Maximum verification attempts exceeded. Please request a new code.');
  }

  if (record.code !== code) {
    record.attempts += 1;
    const remaining = MAX_ATTEMPTS - record.attempts;
    if (remaining <= 0) {
      otpStore.delete(normalized);
      throw new Error('Maximum verification attempts exceeded. Please request a new code.');
    }
    throw new Error(`Invalid verification code. ${remaining} attempt${remaining === 1 ? '' : 's'} remaining.`);
  }

  // Verification successful! Clean up OTP and issue verification token
  otpStore.delete(normalized);
  const verificationToken = generateVerificationToken(normalized);

  console.log(`[OtpService] Phone number ${normalized} successfully verified. Token issued.`);

  return {
    success: true,
    verified: true,
    phoneNumber: normalized,
    verificationToken
  };
}

/**
 * Validate verification token or phone verified status
 */
function isTokenValid(phoneNumber, token) {
  if (!token) return false;
  const entry = verifiedTokens.get(token);
  if (!entry) return false;

  if (Date.now() > entry.expiresAt) {
    verifiedTokens.delete(token);
    return false;
  }

  const normalized = normalizePhoneNumber(phoneNumber);
  return entry.phoneNumber === normalized;
}

/**
 * Consume verification token after successful registration
 */
function consumeToken(token) {
  if (token) {
    verifiedTokens.delete(token);
  }
}

/**
 * Cleanup expired in-memory items periodically
 */
setInterval(() => {
  const now = Date.now();
  for (const [phone, record] of otpStore.entries()) {
    if (now > record.expiresAt + 60000) {
      otpStore.delete(phone);
    }
  }
  for (const [tok, record] of verifiedTokens.entries()) {
    if (now > record.expiresAt) {
      verifiedTokens.delete(tok);
    }
  }
}, 5 * 60 * 1000).unref();

module.exports = {
  sendOtp,
  verifyOtp,
  sendSmsViaCarrier,
  isTokenValid,
  consumeToken,
  normalizePhoneNumber,
  isValidPhoneNumber,
  _otpStore: otpStore,
  _verifiedTokens: verifiedTokens
};
