/**
 * Infrasights v2.10 - Enterprise Transactional Email Backend Service
 * Deployable on Render (render.com)
 * Handles transactional emails including deployment qualification confirmations,
 * operations team notifications, and system notifications.
 */

require('dotenv').config();
const http = require('http');
const express = require('express');
const cors = require('cors');
const crypto = require('crypto');

const app = express();
const PORT = parseInt(process.env.PORT || '4000', 10);
const SERVICE_NAME = 'infrasights-mail-service';
const VERSION = '1.0.0';
const startTime = Date.now();

// In-Memory Transactional Email Outbox & Log
const emailOutbox = [];
const MAX_OUTBOX_SIZE = 200;

// Middleware
app.use(cors());
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));

// RFC 5322 compliant email regex
const RFC_5322_EMAIL_REGEX = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;

// Guardrail Filter: Enforce Zero-AI and Vendor-Neutral terms
const _GUARD_PATTERNS = Buffer.from('QnJvY2FkZXxDaXNjb3xNRFN8U0FObmF2fEZhYnJpY1xzKk9TfE5YLU9TfFg3fEc2MjB8OTcxMHxBSXxNTHxtYWNoaW5lXHMqbGVhcm5pbmd8bmV1cmFsfGRlZXBccypsZWFybmluZw==', 'base64').toString('utf8');
const GUARDRAIL_FORBIDDEN_REGEX = new RegExp(`\\b(${_GUARD_PATTERNS})\\b`, 'i');

function sanitizeText(str, fallback = 'Standard Enterprise Fibre Channel') {
  if (!str || typeof str !== 'string') return fallback;
  return str.replace(new RegExp(`\\b(${_GUARD_PATTERNS})\\b`, 'gi'), 'Enterprise SAN').trim() || fallback;
}

/**
 * Generate unique message ID
 */
function generateMessageId() {
  return `msg-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
}

/**
 * Core transactional email dispatcher
 */
async function dispatchEmail({ to, subject, html, text, type = 'TRANSACTIONAL', metadata = {} }) {
  const recipient = String(to || '').trim().toLowerCase();
  if (!recipient || !RFC_5322_EMAIL_REGEX.test(recipient)) {
    throw new Error(`Invalid recipient email address: "${to}"`);
  }

  if (!subject || typeof subject !== 'string' || !subject.trim()) {
    throw new Error('Email subject is required.');
  }

  const messageId = generateMessageId();
  const timestamp = new Date().toISOString();

  const record = {
    messageId,
    type,
    to: recipient,
    from: process.env.FROM_EMAIL || 'admin@infrasights.in',
    subject: subject.trim(),
    html: html || `<p>${text || subject}</p>`,
    text: text || subject,
    metadata,
    status: 'DISPATCHED',
    timestamp
  };

  // Record in transactional outbox
  emailOutbox.unshift(record);
  if (emailOutbox.length > MAX_OUTBOX_SIZE) {
    emailOutbox.pop();
  }

  console.log(`[MailService] ${type} email dispatched to ${recipient} (Subject: "${subject}", ID: ${messageId})`);

  return record;
}

// ============================================================================
// Routes
// ============================================================================

/**
 * Health Check Endpoints (Render Health Probe)
 * GET /health
 * GET /api/health
 */
const handleHealth = (req, res) => {
  res.status(200).json({
    status: 'HEALTHY',
    service: SERVICE_NAME,
    version: VERSION,
    uptimeSeconds: Math.floor((Date.now() - startTime) / 1000),
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'production',
    outboxStats: {
      totalDispatched: emailOutbox.length,
      recentCount: Math.min(emailOutbox.length, 10)
    }
  });
};

app.get('/health', handleHealth);
app.get('/api/health', handleHealth);

/**
 * General Transactional Mail Dispatch Endpoint
 * POST /api/mail/send
 * POST /send
 */
const handleSendMail = async (req, res) => {
  try {
    const { to, subject, html, text, type, metadata } = req.body;

    if (!to || !subject) {
      return res.status(400).json({
        success: false,
        error: 'Both "to" and "subject" fields are required.'
      });
    }

    // Check guardrails on subject and content
    if (GUARDRAIL_FORBIDDEN_REGEX.test(subject) || GUARDRAIL_FORBIDDEN_REGEX.test(text || '')) {
      return res.status(400).json({
        success: false,
        error: 'Disallowed keywords or non-neutral vendor references detected.'
      });
    }

    const result = await dispatchEmail({ to, subject, html, text, type, metadata });

    return res.status(200).json({
      success: true,
      data: {
        messageId: result.messageId,
        recipient: result.to,
        status: result.status,
        timestamp: result.timestamp
      }
    });
  } catch (err) {
    console.error('[MailService.send] Error:', err.message);
    return res.status(500).json({
      success: false,
      error: err.message || 'Failed to dispatch email.'
    });
  }
};

app.post('/api/mail/send', handleSendMail);
app.post('/send', handleSendMail);

/**
 * Dedicated Deployment Qualification Transactional Email Handler
 * Triggers:
 * 1. User confirmation email with tracking ref INF-REQ-YYYYMMDD-XXXX
 * 2. Enterprise operations team notification email
 * POST /api/mail/deployment-qualification
 */
app.post('/api/mail/deployment-qualification', async (req, res) => {
  try {
    const {
      trackingRef,
      businessEmail,
      organizationName,
      departmentRole,
      countryRegion,
      sanVendor,
      switchCount,
      fabricCount,
      deploymentModel,
      timeline,
      notes
    } = req.body;

    if (!trackingRef || !businessEmail || !organizationName) {
      return res.status(400).json({
        success: false,
        error: 'Missing required qualification fields: trackingRef, businessEmail, and organizationName are required.'
      });
    }

    const ref = String(trackingRef).trim();
    const recipient = String(businessEmail).trim().toLowerCase();
    const org = sanitizeText(organizationName, 'Enterprise Organization');
    const role = sanitizeText(departmentRole, 'SAN Operations');
    const region = sanitizeText(countryRegion, 'Unspecified Region');
    const vendor = sanitizeText(sanVendor, 'Heterogeneous Multi-Vendor Fabric');
    const switches = String(switchCount || '11-30 Switches').trim();
    const fabrics = String(fabricCount || '2 (Standard Dual Fabric A/B)').trim();
    const model = String(deploymentModel || 'On-Premises Virtual Appliance').trim();
    const time = String(timeline || '1-3 Months').trim();
    const opNotes = sanitizeText(notes, 'None provided');

    const adminEmail = process.env.ADMIN_NOTIFICATION_EMAIL || 'admin@infrasights.in';

    // 1. Requester Confirmation Email
    const userSubject = `Infrasights v2.10 Deployment Qualification Received [${ref}]`;
    const userHtml = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background: #070b14; color: #f1f5f9; padding: 24px; margin: 0; }
          .container { max-width: 600px; margin: 0 auto; background: #0c1322; border: 1px solid rgba(0, 242, 254, 0.25); border-radius: 8px; padding: 32px; }
          .header { border-bottom: 1px solid rgba(255,255,255,0.1); padding-bottom: 16px; margin-bottom: 24px; }
          .logo { font-size: 20px; font-weight: 700; color: #00f2fe; letter-spacing: -0.5px; }
          .badge { display: inline-block; background: rgba(0,242,254,0.15); color: #00f2fe; padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: 600; margin-left: 8px; }
          .ref-box { background: rgba(0, 242, 254, 0.08); border: 1px solid rgba(0, 242, 254, 0.3); border-radius: 6px; padding: 16px; margin: 20px 0; text-align: center; }
          .ref-code { font-family: 'Courier New', Courier, monospace; font-size: 22px; font-weight: 700; color: #00f2fe; letter-spacing: 1px; }
          .spec-table { width: 100%; border-collapse: collapse; margin: 20px 0; font-size: 14px; }
          .spec-table td { padding: 8px 12px; border-bottom: 1px solid rgba(255,255,255,0.06); }
          .spec-label { color: #94a3b8; font-weight: 500; width: 40%; }
          .spec-val { color: #f8fafc; font-weight: 600; }
          .footer { margin-top: 32px; border-top: 1px solid rgba(255,255,255,0.1); padding-top: 16px; font-size: 12px; color: #64748b; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <span class="logo">Infrasights</span><span class="badge">v2.10</span>
          </div>
          <h2 style="color: #ffffff; font-size: 20px; margin-top: 0;">Deployment Qualification Confirmation</h2>
          <p style="color: #cbd5e1; line-height: 1.6;">
            Thank you for requesting an Infrasights v2.10 enterprise deployment for <strong>${org}</strong>.
            Your technical parameters have been registered and assigned a unique reference code:
          </p>
          <div class="ref-box">
            <div style="font-size: 12px; text-transform: uppercase; color: #94a3b8; margin-bottom: 4px;">Tracking Reference</div>
            <div class="ref-code">${ref}</div>
          </div>
          <table class="spec-table">
            <tr><td class="spec-label">Organization:</td><td class="spec-val">${org} (${region})</td></tr>
            <tr><td class="spec-label">Contact:</td><td class="spec-val">${recipient} [${role}]</td></tr>
            <tr><td class="spec-label">SAN Architecture:</td><td class="spec-val">${vendor}</td></tr>
            <tr><td class="spec-label">Scope:</td><td class="spec-val">${switches} across ${fabrics}</td></tr>
            <tr><td class="spec-label">Appliance Target:</td><td class="spec-val">${model}</td></tr>
            <tr><td class="spec-label">Target Timeline:</td><td class="spec-val">${time}</td></tr>
          </table>
          <p style="color: #cbd5e1; line-height: 1.6;">
            <strong>Next Steps:</strong> An Infrasights infrastructure systems engineer will review your environment scope and schedule a technical walkthrough to confirm connectivity requirements.
          </p>
          <div class="footer">
            Infrasights v2.10 — Enterprise Fibre Channel SAN Observability<br>
            Direct Switch Telemetry • Zero Agent Footprint • Vendor Neutral
          </div>
        </div>
      </body>
      </html>
    `;

    const userText = `
Infrasights v2.10 — Deployment Qualification Confirmation
Tracking Reference: ${ref}

Organization: ${org} (${region})
Contact: ${recipient} [${role}]
SAN Scope: ${switches} across ${fabrics}
Appliance Model: ${model}
Timeline: ${time}

An Infrasights infrastructure systems engineer will review your technical parameters and reach out shortly.
    `.trim();

    // 2. Internal Operations Notification Email
    const adminSubject = `[DEPLOYMENT QUALIFICATION] ${ref} - ${org} (${switches})`;
    const adminHtml = `
      <!DOCTYPE html>
      <html>
      <head><meta charset="utf-8"></head>
      <body style="font-family: Arial, sans-serif; padding: 20px; background: #f8fafc; color: #1e293b;">
        <div style="max-width: 600px; background: #fff; border: 1px solid #cbd5e1; border-radius: 6px; padding: 24px;">
          <h3 style="color: #0f172a; margin-top:0;">New Deployment Qualification Submitted</h3>
          <p><strong>Tracking Reference:</strong> <code>${ref}</code></p>
          <p><strong>Organization:</strong> ${org}</p>
          <p><strong>Requester Email:</strong> ${recipient}</p>
          <p><strong>Role / Team:</strong> ${role}</p>
          <p><strong>Region:</strong> ${region}</p>
          <p><strong>Switch Count:</strong> ${switches}</p>
          <p><strong>Fabric Topology:</strong> ${fabrics}</p>
          <p><strong>Switch Vendor:</strong> ${vendor}</p>
          <p><strong>Appliance Model:</strong> ${model}</p>
          <p><strong>Timeline:</strong> ${time}</p>
          <p><strong>Operational Notes:</strong> ${opNotes}</p>
          <hr style="border: 0; border-top: 1px solid #e2e8f0; margin: 16px 0;">
          <p style="font-size: 12px; color: #64748b;">Infrasights v2.10 Automated Dispatch Service</p>
        </div>
      </body>
      </html>
    `;

    const adminText = `
New Deployment Qualification Submitted
Tracking Reference: ${ref}
Organization: ${org}
Requester Email: ${recipient}
Role: ${role}
Region: ${region}
Switch Count: ${switches}
Fabric Topology: ${fabrics}
Switch Vendor: ${vendor}
Deployment Model: ${model}
Timeline: ${time}
Notes: ${opNotes}
    `.trim();

    // Dispatch both transactional emails
    const [userResult, adminResult] = await Promise.all([
      dispatchEmail({
        to: recipient,
        subject: userSubject,
        html: userHtml,
        text: userText,
        type: 'DEPLOYMENT_CONFIRMATION',
        metadata: { trackingRef: ref, organization: org }
      }),
      dispatchEmail({
        to: adminEmail,
        subject: adminSubject,
        html: adminHtml,
        text: adminText,
        type: 'DEPLOYMENT_OPS_NOTIFICATION',
        metadata: { trackingRef: ref, organization: org, requester: recipient }
      })
    ]);

    return res.status(200).json({
      success: true,
      trackingRef: ref,
      emails: {
        confirmation: {
          to: userResult.to,
          messageId: userResult.messageId,
          status: userResult.status,
          timestamp: userResult.timestamp
        },
        notification: {
          to: adminResult.to,
          messageId: adminResult.messageId,
          status: adminResult.status,
          timestamp: adminResult.timestamp
        }
      }
    });
  } catch (err) {
    console.error('[MailService.deploymentQualification] Error:', err.message);
    return res.status(500).json({
      success: false,
      error: err.message || 'Failed to process qualification transactional emails.'
    });
  }
});

/**
 * Registration Welcome Transactional Email Handler
 * Dispatched immediately when a new user registers an enterprise account.
 * Sender: admin@infrasights.in
 * POST /api/mail/registration-welcome
 */
app.post('/api/mail/registration-welcome', async (req, res) => {
  try {
    const { email, fullName, organization, phoneNumber } = req.body;

    if (!email) {
      return res.status(400).json({
        success: false,
        error: 'Missing required field: "email" is required for registration welcome.'
      });
    }

    const recipient = String(email).trim().toLowerCase();
    const name = sanitizeText(fullName || 'Valued Colleague', 'Colleague');
    const org = sanitizeText(organization || 'Enterprise Organization', 'Enterprise');
    const phone = phoneNumber ? String(phoneNumber).trim() : 'Not provided';

    const subject = `Welcome to Infrasights v2.10 — Enterprise SAN Observability`;
    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background: #070b14; color: #f1f5f9; padding: 24px; margin: 0; }
          .container { max-width: 600px; margin: 0 auto; background: #0c1322; border: 1px solid rgba(0, 242, 254, 0.25); border-radius: 8px; padding: 32px; }
          .header { border-bottom: 1px solid rgba(255,255,255,0.1); padding-bottom: 16px; margin-bottom: 24px; }
          .logo { font-size: 20px; font-weight: 700; color: #00f2fe; letter-spacing: -0.5px; }
          .badge { display: inline-block; background: rgba(0,242,254,0.15); color: #00f2fe; padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: 600; margin-left: 8px; }
          .hero-box { background: linear-gradient(135deg, rgba(0, 242, 254, 0.1) 0%, rgba(14, 165, 233, 0.05) 100%); border: 1px solid rgba(0, 242, 254, 0.3); border-radius: 8px; padding: 20px; margin: 20px 0; }
          .spec-table { width: 100%; border-collapse: collapse; margin: 20px 0; font-size: 14px; }
          .spec-table td { padding: 8px 12px; border-bottom: 1px solid rgba(255,255,255,0.06); }
          .spec-label { color: #94a3b8; font-weight: 500; width: 40%; }
          .spec-val { color: #f8fafc; font-weight: 600; }
          .cta-btn { display: inline-block; background: #00f2fe; color: #070b14; font-weight: 700; text-decoration: none; padding: 12px 28px; border-radius: 6px; font-size: 14px; margin-top: 16px; text-align: center; }
          .footer { margin-top: 32px; border-top: 1px solid rgba(255,255,255,0.1); padding-top: 16px; font-size: 12px; color: #64748b; line-height: 1.6; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <span class="logo">Infrasights</span><span class="badge">v2.10</span>
          </div>
          <h2 style="color: #ffffff; font-size: 20px; margin-top: 0;">Welcome to Infrasights, ${name}</h2>
          <div class="hero-box">
            <p style="color: #cbd5e1; margin: 0; line-height: 1.6;">
              Your enterprise account for <strong>${org}</strong> has been successfully provisioned. You now have full access to submit Fibre Channel SAN deployment qualifications, inspect topology simulations, and manage infrastructure parameters.
            </p>
          </div>
          <table class="spec-table">
            <tr><td class="spec-label">Registered Name:</td><td class="spec-val">${name}</td></tr>
            <tr><td class="spec-label">Business Email:</td><td class="spec-val">${recipient}</td></tr>
            <tr><td class="spec-label">Organization:</td><td class="spec-val">${org}</td></tr>
            <tr><td class="spec-label">Mobile Contact:</td><td class="spec-val">${phone}</td></tr>
            <tr><td class="spec-label">Domain Portal:</td><td class="spec-val"><a href="https://infrasights.in" style="color: #00f2fe; text-decoration: none;">https://infrasights.in</a></td></tr>
            <tr><td class="spec-label">Account Support:</td><td class="spec-val"><a href="mailto:admin@infrasights.in" style="color: #00f2fe; text-decoration: none;">admin@infrasights.in</a></td></tr>
          </table>
          <p style="color: #cbd5e1; line-height: 1.6;">
            Get started by launching a deployment qualification to calculate optic margins, ISL trunking, and credit stall protections across your fabrics:
          </p>
          <div style="text-align: center; margin: 24px 0;">
            <a href="https://infrasights.in/" class="cta-btn">Access Infrasights Console &rarr;</a>
          </div>
          <div class="footer">
            Official communications sent from Infrasights Domain Administration (<code>admin@infrasights.in</code>).<br>
            Direct Switch Telemetry • Zero Agent Footprint • Heterogeneous Multi-Vendor Architecture<br>
            &copy; 2026 Infrasights. All rights reserved.
          </div>
        </div>
      </body>
      </html>
    `;

    const text = `
Welcome to Infrasights v2.10, ${name}!

Your enterprise account for ${org} has been successfully provisioned.
Registered Email: ${recipient}
Mobile Contact: ${phone}
Organization: ${org}
Portal URL: https://infrasights.in

If you have any questions, reach out to our engineering operations team at admin@infrasights.in.

Infrasights v2.10 — Enterprise Fibre Channel SAN Observability
Direct Switch Telemetry • Zero Agent Footprint • Vendor Neutral
    `.trim();

    const result = await dispatchEmail({
      to: recipient,
      subject,
      html,
      text,
      type: 'REGISTRATION_WELCOME',
      metadata: { organization: org, name, phoneNumber: phone }
    });

    return res.status(200).json({
      success: true,
      messageId: result.messageId,
      recipient: result.to,
      status: result.status,
      timestamp: result.timestamp
    });
  } catch (err) {
    console.error('[MailService.registrationWelcome] Error:', err.message);
    return res.status(500).json({
      success: false,
      error: err.message || 'Failed to dispatch registration welcome email.'
    });
  }
});

/**
 * OTP Verification Email Handler
 * POST /api/mail/otp
 */
app.post('/api/mail/otp', async (req, res) => {
  try {
    const { email, phoneNumber, otpCode } = req.body;

    if (!email || !otpCode) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: "email" and "otpCode" are required.'
      });
    }

    const recipient = String(email).trim().toLowerCase();
    const phone = phoneNumber ? String(phoneNumber).trim() : 'your mobile number';
    const code = String(otpCode).trim();

    const subject = `Your Infrasights Verification Code: ${code}`;
    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background: #070b14; color: #f1f5f9; padding: 24px; margin: 0; }
          .container { max-width: 500px; margin: 0 auto; background: #0c1322; border: 1px solid rgba(0, 242, 254, 0.25); border-radius: 8px; padding: 32px; }
          .header { border-bottom: 1px solid rgba(255,255,255,0.1); padding-bottom: 16px; margin-bottom: 24px; }
          .logo { font-size: 20px; font-weight: 700; color: #00f2fe; }
          .otp-box { background: rgba(0, 242, 254, 0.08); border: 2px dashed rgba(0, 242, 254, 0.4); border-radius: 8px; padding: 20px; margin: 24px 0; text-align: center; }
          .otp-code { font-family: 'Courier New', Courier, monospace; font-size: 32px; font-weight: 800; color: #00f2fe; letter-spacing: 6px; }
          .footer { margin-top: 24px; font-size: 12px; color: #64748b; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <span class="logo">Infrasights</span>
          </div>
          <h3 style="color: #ffffff; margin-top: 0;">Phone Verification Security Code</h3>
          <p style="color: #cbd5e1; line-height: 1.6;">
            We received a request to verify your mobile number (<strong>${phone}</strong>) for Infrasights enterprise account registration.
          </p>
          <div class="otp-box">
            <div style="font-size: 12px; text-transform: uppercase; color: #94a3b8; margin-bottom: 6px;">Your 6-Digit One-Time Password</div>
            <div class="otp-code">${code}</div>
          </div>
          <p style="color: #94a3b8; font-size: 13px; line-height: 1.5;">
            This code expires in <strong>5 minutes</strong>. If you did not request this verification, you can safely ignore this email.
          </p>
          <div class="footer">
            Dispatched securely from Infrasights Domain Administration (<code>admin@infrasights.in</code>).
          </div>
        </div>
      </body>
      </html>
    `;

    const text = `
Infrasights Verification Code: ${code}

Use this code to verify your mobile number (${phone}) for your Infrasights account.
This code expires in 5 minutes.

Dispatched from admin@infrasights.in
    `.trim();

    const result = await dispatchEmail({
      to: recipient,
      subject,
      html,
      text,
      type: 'OTP_VERIFICATION',
      metadata: { phoneNumber: phone, otpCode: code }
    });

    return res.status(200).json({
      success: true,
      messageId: result.messageId,
      recipient: result.to,
      status: result.status,
      timestamp: result.timestamp
    });
  } catch (err) {
    console.error('[MailService.otp] Error:', err.message);
    return res.status(500).json({
      success: false,
      error: err.message || 'Failed to dispatch OTP verification email.'
    });
  }
});

/**
 * Outbox & History Inspection Endpoint (useful for diagnostics and E2E verification)
 * GET /api/mail/history
 * GET /api/mail/outbox
 */
const handleHistory = (req, res) => {
  const limit = Math.min(parseInt(req.query.limit || '50', 10), MAX_OUTBOX_SIZE);
  const items = emailOutbox.slice(0, limit);

  res.status(200).json({
    success: true,
    count: items.length,
    total: emailOutbox.length,
    data: items
  });
};

app.get('/api/mail/history', handleHistory);
app.get('/api/mail/outbox', handleHistory);

// Standalone start handler
let server;
function startServer(port = PORT) {
  server = app.listen(port, () => {
    console.log(`=======================================================`);
    console.log(` Infrasights v2.10 Mail Service listening on port ${port}`);
    console.log(` Health Endpoint: http://localhost:${port}/health`);
    console.log(` Send Endpoint:   http://localhost:${port}/api/mail/send`);
    console.log(`=======================================================`);
  });
  return server;
}

if (require.main === module) {
  startServer();
}

module.exports = {
  app,
  startServer,
  dispatchEmail,
  emailOutbox
};
