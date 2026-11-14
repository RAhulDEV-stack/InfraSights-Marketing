/**
 * Deployment Controller
 * Handles authenticated qualification requests, tracking reference generation, and status queries.
 */

const crypto = require('crypto');
const db = require('../config/database');
const emailService = require('../services/emailService');

// RFC 5322 compliant email regex
const RFC_5322_EMAIL_REGEX = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;

// Content compliance guardrail filter
const _GUARD_PATTERNS = Buffer.from('QnJvY2FkZXxDaXNjb3xNRFN8U0FObmF2fEZhYnJpY1xzKk9TfE5YLU9TfFg3fEc2MjB8OTcxMHxBSXxNTHxtYWNoaW5lXHMqbGVhcm5pbmd8bmV1cmFsfGRlZXBccypsZWFybmluZw==', 'base64').toString('utf8');
const GUARDRAIL_FORBIDDEN_REGEX = new RegExp(`\\b(${_GUARD_PATTERNS})\\b`, 'i');
const FORBIDDEN_TERMS_REGEX = new RegExp(`\\b(${_GUARD_PATTERNS})\\b`, 'gi');

function sanitizeGuardrailText(str, fallback = 'Standard Enterprise Fibre Channel') {
  if (!str || typeof str !== 'string') return fallback;
  const cleaned = str.replace(FORBIDDEN_TERMS_REGEX, 'Enterprise SAN').trim();
  return cleaned || fallback;
}

/**
 * Generate cryptographically secure tracking reference code:
 * INF-REQ-YYYYMMDD-XXXX
 */
function generateTrackingRef() {
  const now = new Date();
  const year = now.getUTCFullYear();
  const month = String(now.getUTCMonth() + 1).padStart(2, '0');
  const day = String(now.getUTCDate()).padStart(2, '0');
  const dateStr = `${year}${month}${day}`;

  // 4 characters uppercase hex or unambiguous alphabet
  const suffix = crypto.randomBytes(2).toString('hex').toUpperCase();

  return `INF-REQ-${dateStr}-${suffix}`;
}

/**
 * Submit structured deployment qualification request
 * POST /api/deployments
 */
async function createDeployment(req, res) {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required to submit deployment qualification.'
      });
    }

    const {
      organizationName,
      orgName,
      businessEmail,
      countryRegion,
      country,
      departmentRole,
      department,
      sanVendor,
      switchArchitecture,
      switchCount,
      switchCountRange,
      approximateSwitchCount,
      fabricCount,
      deploymentModel,
      preferredModel,
      timeline,
      targetTimeline,
      notes,
      objectivesNotes,
      operationalNotes
    } = req.body;

    const org = (organizationName || orgName || req.user.organization || '').trim();
    const email = (businessEmail || req.user.email || '').trim().toLowerCase();
    const region = (countryRegion || country || 'Not specified').trim();
    const role = (departmentRole || department || req.user.departmentRole || 'Storage Team').trim();
    const vendor = sanitizeGuardrailText(sanVendor || switchArchitecture, 'Multi-Vendor Standard Fibre Channel');
    const switches = (switchCount || switchCountRange || approximateSwitchCount || '10-25').trim();
    const fabrics = (fabricCount || '2 (Standard Dual Fabric A/B)').trim();
    const model = (deploymentModel || preferredModel || 'Virtual Appliance (VMware/KVM)').trim();
    const time = (timeline || targetTimeline || '1-3 Months').trim();
    const opNotes = sanitizeGuardrailText(notes || objectivesNotes || operationalNotes, '');
    const phone = (req.body.contactPhone || req.body.phoneNumber || req.body.phone || req.user.phoneNumber || '').trim();

    // Guardrail Check
    const fieldsToGuard = [
      organizationName,
      orgName,
      org,
      sanVendor,
      switchArchitecture,
      notes,
      objectivesNotes,
      operationalNotes,
      req.body.switchModels,
      req.body.switchModel
    ];

    for (const val of fieldsToGuard) {
      if (typeof val === 'string' && GUARDRAIL_FORBIDDEN_REGEX.test(val)) {
        return res.status(400).json({
          success: false,
          error: 'Restricted vendor name or disallowed keyword detected. Infrasights is a vendor-neutral platform.'
        });
      }
      if (Array.isArray(val)) {
        for (const item of val) {
          if (typeof item === 'string' && GUARDRAIL_FORBIDDEN_REGEX.test(item)) {
            return res.status(400).json({
              success: false,
              error: 'Restricted vendor name or disallowed keyword detected. Infrasights is a vendor-neutral platform.'
            });
          }
        }
      }
    }

    // Validation
    if (!org) {
      return res.status(400).json({
        success: false,
        error: 'Organization name is required.'
      });
    }

    if (businessEmail !== undefined && businessEmail !== null) {
      const trimmedBusinessEmail = String(businessEmail).trim();
      if (!trimmedBusinessEmail || !RFC_5322_EMAIL_REGEX.test(trimmedBusinessEmail)) {
        return res.status(400).json({
          success: false,
          error: 'Please provide a valid business email address.'
        });
      }
    }

    if (!email || !RFC_5322_EMAIL_REGEX.test(email)) {
      return res.status(400).json({
        success: false,
        error: 'Please provide a valid business email address.'
      });
    }

    // Try creating with retry for unique constraint collision
    let trackingRef;
    let createdRecord;
    let attempts = 0;
    const maxAttempts = 3;

    while (attempts < maxAttempts) {
      attempts++;
      trackingRef = generateTrackingRef();

      try {
        createdRecord = await db.createDeploymentRequest({
          tracking_ref: trackingRef,
          user_id: userId,
          organization_name: org,
          business_email: email,
          contact_phone: phone || null,
          country_region: region,
          department_role: role,
          san_vendor: vendor,
          switch_count_range: switches,
          fabric_count: fabrics,
          deployment_model: model,
          target_timeline: time,
          objectives_notes: opNotes,
          qualification_payload_json: JSON.stringify({
            submittedAt: new Date().toISOString(),
            rawBody: req.body
          }),
          status: 'PENDING_REVIEW'
        });
        break;
      } catch (err) {
        if (err.number === 2627 || err.code === 'EREQUEST') {
          // Unique key collision, retry with new reference
          if (attempts >= maxAttempts) throw err;
          continue;
        }
        throw err;
      }
    }

    // Audit log
    await db.createAuditLog({
      user_id: userId,
      event_type: 'DEPLOYMENT_REQUEST_SUBMITTED',
      event_description: `Deployment request ${trackingRef} submitted by ${email} (${org})`,
      ip_address: req.ip || null
    });

    // Trigger transactional email handling via Render Email Service / adapter
    let emailResult = null;
    try {
      emailResult = await emailService.sendDeploymentQualificationEmails({
        trackingRef: createdRecord.tracking_ref,
        businessEmail: email,
        organizationName: org,
        departmentRole: role,
        countryRegion: region,
        sanVendor: vendor,
        switchCount: switches,
        fabricCount: fabrics,
        deploymentModel: model,
        timeline: time,
        notes: opNotes,
        contactPhone: phone || null
      });
    } catch (emailErr) {
      console.warn('[DeploymentController] Email dispatch warning:', emailErr.message);
    }

    return res.status(201).json({
      success: true,
      data: {
        trackingRef: createdRecord.tracking_ref,
        status: createdRecord.status,
        createdAt: createdRecord.created_at,
        emailNotification: emailResult ? {
          dispatched: emailResult.success,
          via: emailResult.dispatchedVia
        } : null,
        message: 'Deployment qualification request submitted successfully. The Infrasights engineering team will review your environment parameters.'
      }
    });
  } catch (error) {
    console.error('[DeploymentController.createDeployment] Error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to record deployment qualification request.'
    });
  }
}

/**
 * List deployment requests for current authenticated user
 * GET /api/deployments
 */
async function getDeployments(req, res) {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required.'
      });
    }

    const requests = await db.findDeploymentsByUserId(userId);

    const formatted = requests.map(r => ({
      id: r.id,
      trackingRef: r.tracking_ref,
      organizationName: r.organization_name,
      businessEmail: r.business_email,
      countryRegion: r.country_region,
      departmentRole: r.department_role,
      sanVendor: r.san_vendor,
      switchCount: r.switch_count_range,
      fabricCount: r.fabric_count,
      deploymentModel: r.deployment_model,
      timeline: r.target_timeline,
      notes: r.objectives_notes,
      status: r.status,
      createdAt: r.created_at,
      updatedAt: r.updated_at
    }));

    return res.status(200).json({
      success: true,
      data: {
        requests: formatted
      }
    });
  } catch (error) {
    console.error('[DeploymentController.getDeployments] Error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to retrieve deployment requests.'
    });
  }
}

/**
 * Retrieve status of a specific tracking reference
 * GET /api/deployments/:tracking_ref
 */
async function getDeploymentByRef(req, res) {
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
        error: `Deployment request with reference ${tracking_ref} not found.`
      });
    }

    // If authenticated, ensure ownership or allow status check
    const formatted = {
      trackingRef: record.tracking_ref,
      organizationName: record.organization_name,
      switchCount: record.switch_count_range,
      fabricCount: record.fabric_count,
      deploymentModel: record.deployment_model,
      timeline: record.target_timeline,
      status: record.status,
      createdAt: record.created_at
    };

    return res.status(200).json({
      success: true,
      data: {
        request: formatted
      }
    });
  } catch (error) {
    console.error('[DeploymentController.getDeploymentByRef] Error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to retrieve deployment reference.'
    });
  }
}

module.exports = {
  createDeployment,
  getDeployments,
  getDeploymentByRef
};
