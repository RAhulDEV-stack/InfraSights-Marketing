/**
 * Mail Controller
 * Bridges main API routes to the transactional email service
 */

const mailService = require('../../mail-service/index');

async function getHealth(req, res) {
  return res.status(200).json({
    status: 'HEALTHY',
    service: 'infrasights-mail-service',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    outboxStats: {
      totalDispatched: mailService.emailOutbox ? mailService.emailOutbox.length : 0
    }
  });
}

async function sendMail(req, res) {
  try {
    const { to, subject, html, text, type, metadata } = req.body;
    if (!to || !subject) {
      return res.status(400).json({
        success: false,
        error: 'Both "to" and "subject" fields are required.'
      });
    }

    const result = await mailService.dispatchEmail({ to, subject, html, text, type, metadata });
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
    return res.status(500).json({
      success: false,
      error: err.message || 'Failed to dispatch email.'
    });
  }
}

async function qualificationMail(req, res) {
  // Pass directly to the mail-service handler logic
  const mockReq = { body: req.body };
  return mailService.app._router.handle(
    { ...req, url: '/api/mail/deployment-qualification', method: 'POST' },
    res,
    () => {}
  );
}

async function getHistory(req, res) {
  const limit = Math.min(parseInt(req.query.limit || '50', 10), 200);
  const outbox = mailService.emailOutbox || [];
  return res.status(200).json({
    success: true,
    count: Math.min(outbox.length, limit),
    total: outbox.length,
    data: outbox.slice(0, limit)
  });
}

module.exports = {
  getHealth,
  sendMail,
  qualificationMail,
  getHistory
};
