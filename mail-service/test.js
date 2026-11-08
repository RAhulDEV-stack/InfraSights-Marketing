/**
 * Infrasights v2.10 - Mail Service Unit & Integration Tests
 */

const http = require('http');
const { app, startServer, emailOutbox } = require('./index');

let testServer;
const TEST_PORT = 4567;
const BASE_URL = `http://127.0.0.1:${TEST_PORT}`;

function makeRequest(path, options = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE_URL);
    const reqOptions = {
      method: options.method || 'GET',
      headers: options.headers || {}
    };

    if (options.body) {
      if (!reqOptions.headers['Content-Type']) {
        reqOptions.headers['Content-Type'] = 'application/json';
      }
    }

    const req = http.request(url, reqOptions, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        let json = null;
        try { json = JSON.parse(data); } catch (e) { json = data; }
        resolve({ status: res.statusCode, headers: res.headers, body: json });
      });
    });

    req.on('error', reject);

    if (options.body) {
      req.write(typeof options.body === 'string' ? options.body : JSON.stringify(options.body));
    }
    req.end();
  });
}

async function runTests() {
  console.log('====================================================');
  console.log(' Starting Mail Service Verification');
  console.log('====================================================');

  testServer = startServer(TEST_PORT);
  let passed = 0;
  let failed = 0;

  function assert(condition, message) {
    if (condition) {
      console.log(`• ${message}... PASS`);
      passed++;
    } else {
      console.error(`• ${message}... FAIL`);
      failed++;
    }
  }

  try {
    // 1. Health Probe
    const health = await makeRequest('/health');
    assert(health.status === 200, 'GET /health returns 200 OK');
    assert(health.body.status === 'HEALTHY', 'Health status is HEALTHY');
    assert(health.body.service === 'infrasights-mail-service', 'Service name matches');

    // 2. Secondary Health Probe (/api/health)
    const apiHealth = await makeRequest('/api/health');
    assert(apiHealth.status === 200, 'GET /api/health returns 200 OK');

    // 3. Send Email Endpoint - Validation Failure (missing fields)
    const invalidSend = await makeRequest('/api/mail/send', {
      method: 'POST',
      body: { to: 'invalid-email' }
    });
    assert(invalidSend.status === 400, 'POST /api/mail/send rejects missing subject with 400');

    // 4. Send Email Endpoint - Success
    const validSend = await makeRequest('/api/mail/send', {
      method: 'POST',
      body: {
        to: 'storage.admin@example.com',
        subject: 'Infrasights Platform Notice',
        text: 'Telemetry streaming test notification.'
      }
    });
    assert(validSend.status === 200, 'POST /api/mail/send succeeds with 200');
    assert(validSend.body.success === true, 'Response indicates success');
    assert(validSend.body.data.messageId.startsWith('msg-'), 'Valid messageId generated');

    // 5. Deployment Qualification Email Endpoint
    const qualRes = await makeRequest('/api/mail/deployment-qualification', {
      method: 'POST',
      body: {
        trackingRef: 'INF-REQ-20261108-ABCD',
        businessEmail: 'san.lead@enterprise.org',
        organizationName: 'Global Logistics SAN',
        departmentRole: 'Storage Architecture',
        countryRegion: 'Europe',
        sanVendor: 'Heterogeneous Multi-Vendor Fabric',
        switchCount: '31-75 Switches',
        fabricCount: '2 (Dual Fabric A/B)',
        deploymentModel: 'Virtual Appliance',
        timeline: 'Immediate (Next 30 Days)',
        notes: 'Monitoring 32G ISL buffer credits and transceiver optics'
      }
    });
    assert(qualRes.status === 200, 'POST /api/mail/deployment-qualification returns 200');
    assert(qualRes.body.success === true, 'Qualification email dispatch succeeded');
    assert(qualRes.body.emails.confirmation.to === 'san.lead@enterprise.org', 'Confirmation email sent to requester');
    assert(qualRes.body.emails.notification.status === 'DISPATCHED', 'Ops notification email dispatched');

    // 6. Outbox / History Inspection
    const historyRes = await makeRequest('/api/mail/history');
    assert(historyRes.status === 200, 'GET /api/mail/history returns 200');
    assert(historyRes.body.count >= 3, 'Outbox recorded dispatched emails');

    // 7. Guardrail keyword rejection
    const guardrailReject = await makeRequest('/api/mail/send', {
      method: 'POST',
      body: {
        to: 'user@example.com',
        subject: 'Cisco MDS integration',
        text: 'Testing vendor rejection'
      }
    });
    assert(guardrailReject.status === 400, 'POST /api/mail/send enforces vendor-neutral guardrails');

  } catch (err) {
    console.error('Fatal test error:', err);
    failed++;
  } finally {
    testServer.close();
  }

  console.log('====================================================');
  console.log(` Results: ${passed} passed, ${failed} failed`);
  console.log('====================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

if (require.main === module) {
  runTests();
}

module.exports = { runTests };
