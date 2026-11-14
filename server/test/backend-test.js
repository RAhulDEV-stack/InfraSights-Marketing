/**
 * Automated Verification Test Suite for Infrasights v2.10 Backend
 * Verifies all health, auth, and deployment endpoints, session revocation, and data persistence.
 */

const http = require('http');
const { app, getDatabase } = require('../index');

const TEST_PORT = 3456;
let serverInstance;

function assert(condition, message) {
  if (!condition) {
    throw new Error(`Assertion Failed: ${message}`);
  }
}

async function request(path, options = {}) {
  const url = `http://localhost:${TEST_PORT}${path}`;
  const response = await fetch(url, {
    method: options.method || 'GET',
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {})
    },
    redirect: options.redirect || 'manual',
    body: options.body ? (typeof options.body === 'string' ? options.body : JSON.stringify(options.body)) : undefined
  });

  const contentType = response.headers.get('content-type') || '';
  let body;
  if (contentType.includes('json')) {
    body = await response.json();
  } else {
    body = await response.text();
  }

  return {
    status: response.status,
    headers: response.headers,
    body
  };
}

async function runTests() {
  console.log('====================================================');
  console.log(' Starting Infrasights v2.10 Backend Verification');
  console.log('====================================================');

  const db = getDatabase();
  await db.init();

  serverInstance = await new Promise((resolve) => {
    const s = app.listen(TEST_PORT, () => resolve(s));
  });

  console.log(`Test server running on port ${TEST_PORT}\n`);

  let passed = 0;
  let failed = 0;

  async function test(name, fn) {
    try {
      process.stdout.write(`• ${name}... `);
      await fn();
      console.log('PASS');
      passed++;
    } catch (err) {
      console.log('FAIL');
      console.error(`  Error: ${err.message}`);
      failed++;
    }
  }

  // 1. Health Probe
  await test('GET /api/health returns HEALTHY, version 2.10.4, and database details', async () => {
    const res = await request('/api/health');
    assert(res.status === 200, `Expected 200, got ${res.status}`);
    assert(res.body.status === 'HEALTHY', 'Status must be HEALTHY');
    assert(res.body.version === '2.10.4', 'Version must be 2.10.4');
    assert(res.body.product === 'Infrasights', 'Product must be Infrasights');
    assert(res.body.database && res.body.database.connected === true, 'Database must report connected');
  });

  // 2. Auth: Registration Validation
  await test('POST /api/auth/register validates required fields and email format', async () => {
    // Missing fields
    let res = await request('/api/auth/register', {
      method: 'POST',
      body: { fullName: 'A' }
    });
    assert(res.status === 400, `Expected 400, got ${res.status}`);

    // Invalid email format
    res = await request('/api/auth/register', {
      method: 'POST',
      body: {
        fullName: 'Jane Doe',
        email: 'invalid-email-address',
        organization: 'Acme Corp',
        password: 'Password123!'
      }
    });
    assert(res.status === 400, `Expected 400, got ${res.status}`);
    assert(res.body.error.includes('RFC 5322'), 'Must mention RFC 5322');

    // Password too short
    res = await request('/api/auth/register', {
      method: 'POST',
      body: {
        fullName: 'Jane Doe',
        email: 'jane@enterprise.com',
        organization: 'Acme Corp',
        password: 'short'
      }
    });
    assert(res.status === 400, `Expected 400, got ${res.status}`);
  });

  // 3. Auth: Registration Success
  const testUser = {
    fullName: 'Jane Storage Lead',
    email: `storage.lead.${Date.now()}@datacenter-core.com`,
    organization: 'Global Data Center Inc',
    departmentRole: 'Principal SAN Architect',
    password: 'EnterpriseSecurePass123!'
  };

  let authToken = null;
  let userId = null;

  await test('POST /api/auth/register creates user and returns JWT token & sanitized profile', async () => {
    const res = await request('/api/auth/register', {
      method: 'POST',
      body: testUser
    });
    assert(res.status === 201, `Expected 201, got ${res.status}`);
    assert(res.body.success === true, 'success should be true');
    assert(res.body.data.user.email === testUser.email.toLowerCase(), 'Email must match');
    assert(res.body.data.user.organization === testUser.organization, 'Organization must match');
    assert(res.body.data.user.departmentRole === testUser.departmentRole, 'Department role must match');
    assert(!res.body.data.user.password_hash, 'Password hash must NOT be leaked');
    assert(res.body.data.token && typeof res.body.data.token === 'string', 'Token must be provided');

    authToken = res.body.data.token;
    userId = res.body.data.user.id;
  });

  // 4. Auth: Duplicate Registration Rejection
  await test('POST /api/auth/register rejects duplicate email with 409 Conflict', async () => {
    const res = await request('/api/auth/register', {
      method: 'POST',
      body: testUser
    });
    assert(res.status === 409, `Expected 409, got ${res.status}`);
    assert(res.body.success === false, 'success should be false');
  });

  // 5. Auth: Login Success & Validation
  await test('POST /api/auth/login authenticates user with bcrypt and returns token', async () => {
    // Bad password
    let res = await request('/api/auth/login', {
      method: 'POST',
      body: {
        email: testUser.email,
        password: 'WrongPassword999!'
      }
    });
    assert(res.status === 401, `Expected 401, got ${res.status}`);

    // Good password
    res = await request('/api/auth/login', {
      method: 'POST',
      body: {
        email: testUser.email,
        password: testUser.password
      }
    });
    assert(res.status === 200, `Expected 200, got ${res.status}`);
    assert(res.body.success === true, 'success should be true');
    assert(res.body.data.token, 'Token must be provided');
    assert(res.body.data.user.email === testUser.email.toLowerCase(), 'User email match');

    // Update token
    authToken = res.body.data.token;
  });

  // 6. Auth: GET /api/auth/me
  await test('GET /api/auth/me verifies Bearer token and returns profile', async () => {
    // Unauthenticated request
    let res = await request('/api/auth/me');
    assert(res.status === 401, `Expected 401 without token, got ${res.status}`);

    // Authenticated request
    res = await request('/api/auth/me', {
      headers: { Authorization: `Bearer ${authToken}` }
    });
    assert(res.status === 200, `Expected 200 with token, got ${res.status}`);
    assert(res.body.data.user.email === testUser.email.toLowerCase(), 'Me email must match');
    assert(res.body.data.user.organization === testUser.organization, 'Me org must match');
  });

  // 7. Auth: Forgot Password Non-Enumerating
  await test('POST /api/auth/forgot-password returns consistent non-enumerating response', async () => {
    const resExisting = await request('/api/auth/forgot-password', {
      method: 'POST',
      body: { email: testUser.email }
    });
    assert(resExisting.status === 200, `Expected 200, got ${resExisting.status}`);

    const resUnknown = await request('/api/auth/forgot-password', {
      method: 'POST',
      body: { email: 'nonexistent.user.999@storage-void.com' }
    });
    assert(resUnknown.status === 200, `Expected 200, got ${resUnknown.status}`);
    assert(resExisting.body.message === resUnknown.body.message, 'Messages must be strictly identical');
  });

  // 8. Deployments: Unauthorized Access
  await test('POST /api/deployments rejects unauthenticated calls with 401', async () => {
    const res = await request('/api/deployments', {
      method: 'POST',
      body: {
        organizationName: 'Unauthorized Corp'
      }
    });
    assert(res.status === 401, `Expected 401, got ${res.status}`);
  });

  // 9. Deployments: Submit Qualification Request
  let createdTrackingRef = null;

  await test('POST /api/deployments accepts qualification and creates INF-REQ-YYYYMMDD-XXXX ref', async () => {
    const res = await request('/api/deployments', {
      method: 'POST',
      headers: { Authorization: `Bearer ${authToken}` },
      body: {
        organizationName: 'Global Data Center Inc',
        businessEmail: testUser.email,
        countryRegion: 'North America / US-East',
        departmentRole: 'Principal SAN Architect',
        sanVendor: 'Multi-Vendor Enterprise Fibre Channel',
        switchCount: '25-50',
        fabricCount: 'Dual Fabric (Fabric A / B)',
        deploymentModel: 'Virtual Appliance (VMware/KVM)',
        timeline: '1-3 Months',
        notes: 'Need direct switch telemetry collection to monitor buffer credits without intermediary software.'
      }
    });

    assert(res.status === 201, `Expected 201, got ${res.status}`);
    assert(res.body.success === true, 'success should be true');
    assert(res.body.data.trackingRef, 'trackingRef must be present');
    assert(res.body.data.status === 'PENDING_REVIEW', 'Status must be PENDING_REVIEW');

    const refPattern = /^INF-REQ-\d{8}-[A-Z0-9]{4}$/;
    assert(refPattern.test(res.body.data.trackingRef), `Tracking ref format invalid: ${res.body.data.trackingRef}`);

    createdTrackingRef = res.body.data.trackingRef;
  });

  // 10. Deployments: GET /api/deployments list
  await test('GET /api/deployments lists deployment requests for current authenticated user', async () => {
    const res = await request('/api/deployments', {
      headers: { Authorization: `Bearer ${authToken}` }
    });
    assert(res.status === 200, `Expected 200, got ${res.status}`);
    assert(Array.isArray(res.body.data.requests), 'requests must be an array');
    assert(res.body.data.requests.length >= 1, 'Should contain at least 1 request');

    const found = res.body.data.requests.find(r => r.trackingRef === createdTrackingRef);
    assert(found, `Expected to find trackingRef ${createdTrackingRef}`);
    assert(found.status === 'PENDING_REVIEW', 'Status must match');
    assert(found.organizationName === 'Global Data Center Inc', 'Organization must match');
  });

  // 11. Deployments: GET /api/deployments/:tracking_ref
  await test('GET /api/deployments/:tracking_ref retrieves specific deployment status', async () => {
    const res = await request(`/api/deployments/${createdTrackingRef}`);
    assert(res.status === 200, `Expected 200, got ${res.status}`);
    assert(res.body.data.request.trackingRef === createdTrackingRef, 'Ref must match');
    assert(res.body.data.request.status === 'PENDING_REVIEW', 'Status must match');

    // Unknown reference
    const res404 = await request('/api/deployments/INF-REQ-99999999-ZZZZ');
    assert(res404.status === 404, `Expected 404, got ${res404.status}`);
  });

  // 12. Mail Service: GET /api/mail/health
  await test('GET /api/mail/health returns HEALTHY status and service metadata', async () => {
    const res = await request('/api/mail/health');
    assert(res.status === 200, `Expected 200, got ${res.status}`);
    assert(res.body.status === 'HEALTHY', 'Status must be HEALTHY');
    assert(res.body.service === 'infrasights-mail-service', 'Service name must match');
  });

  // 13. Mail Service: POST /api/mail/send
  await test('POST /api/mail/send dispatches transactional email', async () => {
    const res = await request('/api/mail/send', {
      method: 'POST',
      body: {
        to: testUser.email,
        subject: 'Infrasights Test Alert',
        text: 'SAN verification message'
      }
    });
    assert(res.status === 200, `Expected 200, got ${res.status}`);
    assert(res.body.success === true, 'Success must be true');
    assert(res.body.data.messageId.startsWith('msg-'), 'MessageId must start with msg-');
  });

  // 14. Mail Service: POST /api/mail/deployment-qualification
  await test('POST /api/mail/deployment-qualification dispatches confirmation and notification', async () => {
    const res = await request('/api/mail/deployment-qualification', {
      method: 'POST',
      body: {
        trackingRef: 'INF-REQ-20261108-TEST',
        businessEmail: testUser.email,
        organizationName: 'Global Data Center Inc',
        departmentRole: 'Principal SAN Architect',
        countryRegion: 'US',
        sanVendor: 'Multi-Vendor Enterprise Fibre Channel',
        switchCount: '25-50',
        fabricCount: '2 (Standard Dual Fabric A/B)',
        deploymentModel: 'Virtual Appliance',
        timeline: '1-3 Months',
        notes: 'Verification test'
      }
    });
    assert(res.status === 200, `Expected 200, got ${res.status}`);
    assert(res.body.success === true, 'Success must be true');
    assert(res.body.emails.confirmation.to === testUser.email, 'Confirmation sent to user email');
    assert(res.body.emails.notification.status === 'DISPATCHED', 'Notification status DISPATCHED');
  });

  // 15. Mail Service: GET /api/mail/history
  await test('GET /api/mail/history returns outbox dispatch records', async () => {
    const res = await request('/api/mail/history');
    assert(res.status === 200, `Expected 200, got ${res.status}`);
    assert(res.body.success === true, 'Success must be true');
    assert(Array.isArray(res.body.data), 'Data must be an array');
    assert(res.body.data.length >= 1, 'History must contain dispatched emails');
  });

  // 16. Auth: Logout & Token Revocation
  await test('POST /api/auth/logout revokes session token', async () => {
    const res = await request('/api/auth/logout', {
      method: 'POST',
      headers: { Authorization: `Bearer ${authToken}` }
    });
    assert(res.status === 200, `Expected 200, got ${res.status}`);

    // Verify revoked token can no longer access /api/auth/me
    const meRes = await request('/api/auth/me', {
      headers: { Authorization: `Bearer ${authToken}` }
    });
    assert(meRes.status === 401, `Revoked token should receive 401, got ${meRes.status}`);
  });

  // 17. Static Assets: Root /
  await test('GET / serves index.html', async () => {
    const res = await request('/');
    assert(res.status === 200, `Expected 200, got ${res.status}`);
    assert(typeof res.body === 'string' && res.body.includes('Infrasights'), 'Should serve Infrasights index.html');
  });

  // =========================================================================
  // Vendor Management & Authenticated API (Requirement R1 / Milestone M6)
  // =========================================================================
  const VENDOR_SECRET = 'infrasights-vendor-secret-2026';
  let vendorJwtToken = null;
  let vendorCookie = null;

  // 18. Vendor Auth: Secret Key in X-Vendor-Key header
  await test('GET /api/vendor/deployments accepts valid X-Vendor-Key header', async () => {
    const res = await request('/api/vendor/deployments', {
      headers: { 'X-Vendor-Key': VENDOR_SECRET }
    });
    assert(res.status === 200, `Expected 200, got ${res.status}`);
    assert(res.body.success === true, 'Success must be true');
    assert(Array.isArray(res.body.data), 'Data must be an array');
  });

  // 19. Vendor Auth: Secret Key in X-Admin-Key header
  await test('GET /api/vendor/deployments accepts valid X-Admin-Key header', async () => {
    const res = await request('/api/vendor/deployments', {
      headers: { 'X-Admin-Key': VENDOR_SECRET }
    });
    assert(res.status === 200, `Expected 200, got ${res.status}`);
    assert(res.body.success === true, 'Success must be true');
  });

  // 20. Vendor Auth: Invalid Secret Key returns 401
  await test('GET /api/vendor/deployments rejects invalid X-Vendor-Key with 401', async () => {
    const res = await request('/api/vendor/deployments', {
      headers: { 'X-Vendor-Key': 'bogus-vendor-key-999' }
    });
    assert(res.status === 401, `Expected 401, got ${res.status}`);
    assert(res.body.success === false, 'Success must be false');
  });

  // 21. Vendor Auth: Missing credentials returns 401
  await test('GET /api/vendor/deployments rejects unauthenticated call with 401', async () => {
    const res = await request('/api/vendor/deployments');
    assert(res.status === 401, `Expected 401, got ${res.status}`);
    assert(res.body.success === false, 'Success must be false');
  });

  // 22. Vendor Auth: Admin credentials login
  await test('POST /api/vendor/auth/login authenticates admin email/password and sets cookie', async () => {
    const res = await request('/api/vendor/auth/login', {
      method: 'POST',
      body: {
        email: 'admin@infrasights.in',
        password: 'InfrasightsVendorAdmin2026!'
      }
    });
    assert(res.status === 200, `Expected 200, got ${res.status}`);
    assert(res.body.success === true, 'Success must be true');
    assert(res.body.token && typeof res.body.token === 'string', 'Must issue JWT token');
    assert(res.body.role === 'VENDOR_ADMIN', 'Role must be VENDOR_ADMIN');

    vendorJwtToken = res.body.token;
    const setCookie = res.headers.get('set-cookie');
    assert(setCookie && setCookie.includes('infrasights_vendor_token'), 'Must set infrasights_vendor_token cookie');
    const match = setCookie.match(/infrasights_vendor_token=([^;]+)/);
    assert(match, 'Cookie value must be parseable');
    vendorCookie = `infrasights_vendor_token=${match[1]}`;
  });

  // 23. Vendor Auth: Secret key login
  await test('POST /api/vendor/auth/login authenticates via secretKey in body', async () => {
    const res = await request('/api/vendor/auth/login', {
      method: 'POST',
      body: { secretKey: VENDOR_SECRET }
    });
    assert(res.status === 200, `Expected 200, got ${res.status}`);
    assert(res.body.token && res.body.role === 'VENDOR_ADMIN', 'Must issue vendor token');
  });

  // 24. Vendor Auth: Invalid credentials rejection
  await test('POST /api/vendor/auth/login rejects invalid credentials with 401', async () => {
    const res = await request('/api/vendor/auth/login', {
      method: 'POST',
      body: {
        email: 'admin@infrasights.in',
        password: 'WrongPassword123!'
      }
    });
    assert(res.status === 401, `Expected 401, got ${res.status}`);
    assert(res.body.success === false, 'Success must be false');
  });

  // 25. Vendor RBAC: Reject customer JWT tokens with 403 Forbidden
  await test('Vendor endpoints reject standard customer JWT with HTTP 403 Forbidden', async () => {
    const customer = {
      fullName: 'Customer Engineer',
      email: `customer.${Date.now()}@datacenter.org`,
      organization: 'Acme Data Storage',
      password: 'SecureCustomerPassword123!'
    };
    const regRes = await request('/api/auth/register', {
      method: 'POST',
      body: customer
    });
    assert(regRes.status === 201, 'Customer registration should succeed');
    const customerToken = regRes.body.data.token;

    // Attempt to access vendor list with customer JWT
    const listRes = await request('/api/vendor/deployments', {
      headers: { Authorization: `Bearer ${customerToken}` }
    });
    assert(listRes.status === 403, `Expected 403 Forbidden, got ${listRes.status}`);
    assert(listRes.body.success === false, 'Success must be false');
    assert(listRes.body.error.includes('Vendor administrative privileges required'), 'Must specify vendor privileges required');

    // Attempt to access vendor stats with customer JWT
    const statsRes = await request('/api/vendor/stats', {
      headers: { Authorization: `Bearer ${customerToken}` }
    });
    assert(statsRes.status === 403, `Expected 403 Forbidden, got ${statsRes.status}`);
  });

  // 26. Cross-Tenant Visibility: List all customer requests
  let secondTrackingRef = null;
  await test('GET /api/vendor/deployments provides cross-tenant access to all requests', async () => {
    const regRes = await request('/api/auth/register', {
      method: 'POST',
      body: {
        fullName: 'Tenant Two Admin',
        email: `tenant2.${Date.now()}@hyper-converged.net`,
        organization: 'HyperScale Systems',
        password: 'SecurePassword123!'
      }
    });
    const t2Token = regRes.body.data.token;

    const depRes = await request('/api/deployments', {
      method: 'POST',
      headers: { Authorization: `Bearer ${t2Token}` },
      body: {
        organizationName: 'HyperScale Systems',
        businessEmail: regRes.body.data.user.email,
        switchCount: '100+',
        fabricCount: 'Dual Fabric',
        deploymentModel: 'Bare Metal',
        timeline: 'Immediate'
      }
    });
    assert(depRes.status === 201, 'Should create second deployment');
    secondTrackingRef = depRes.body.data.trackingRef;

    // Query vendor deployments using vendor JWT
    const vendorRes = await request('/api/vendor/deployments', {
      headers: { Authorization: `Bearer ${vendorJwtToken}` }
    });
    assert(vendorRes.status === 200, `Expected 200, got ${vendorRes.status}`);
    assert(vendorRes.body.total >= 2, `Total must be at least 2, got ${vendorRes.body.total}`);

    const foundT1 = vendorRes.body.data.find(r => r.tracking_ref === createdTrackingRef || r.trackingRef === createdTrackingRef);
    const foundT2 = vendorRes.body.data.find(r => r.tracking_ref === secondTrackingRef || r.trackingRef === secondTrackingRef);
    assert(foundT1, 'Must find tenant 1 request');
    assert(foundT2, 'Must find tenant 2 request');
  });

  // 27. Search Filtering
  await test('GET /api/vendor/deployments?search= filters correctly by keyword', async () => {
    const res = await request('/api/vendor/deployments?search=HyperScale', {
      headers: { 'X-Vendor-Key': VENDOR_SECRET }
    });
    assert(res.status === 200, `Expected 200, got ${res.status}`);
    assert(res.body.data.length >= 1, 'Should match HyperScale');
    assert(res.body.data.every(r => (r.organization_name || r.organizationName).includes('HyperScale')), 'All matches should be HyperScale');

    // Non-existent search
    const noMatchRes = await request('/api/vendor/deployments?search=NonExistentCorp999', {
      headers: { 'X-Vendor-Key': VENDOR_SECRET }
    });
    assert(noMatchRes.status === 200, `Expected 200, got ${noMatchRes.status}`);
    assert(noMatchRes.body.count === 0, 'Count should be 0');
    assert(noMatchRes.body.data.length === 0, 'Data should be empty array');
  });

  // 28. Status Filtering
  await test('GET /api/vendor/deployments?status= filters by lifecycle state', async () => {
    const res = await request('/api/vendor/deployments?status=PENDING_REVIEW', {
      headers: { 'X-Vendor-Key': VENDOR_SECRET }
    });
    assert(res.status === 200, `Expected 200, got ${res.status}`);
    assert(res.body.data.every(r => r.status === 'PENDING_REVIEW'), 'All records must be PENDING_REVIEW');
  });

  // 29. Inspect Deployment Details: Full unredacted payload & audit logs
  await test('GET /api/vendor/deployments/:tracking_ref returns unredacted specs and audit logs', async () => {
    const res = await request(`/api/vendor/deployments/${createdTrackingRef}`, {
      headers: { 'X-Vendor-Key': VENDOR_SECRET }
    });
    assert(res.status === 200, `Expected 200, got ${res.status}`);
    assert(res.body.success === true, 'Success must be true');
    assert(res.body.data.tracking_ref === createdTrackingRef, 'Ref must match');
    assert(res.body.data.qualification_payload_json, 'Must return qualification_payload_json');
    assert(Array.isArray(res.body.data.auditLogs), 'Must include auditLogs array');
    assert(res.body.data.auditLogs.length >= 1, 'Must have at least initial submission audit log');

    // 404 for non-existent ref
    const notFound = await request('/api/vendor/deployments/INF-REQ-99999999-VOID', {
      headers: { 'X-Vendor-Key': VENDOR_SECRET }
    });
    assert(notFound.status === 404, `Expected 404, got ${notFound.status}`);
  });

  // 30. Update Qualification Status
  await test('PATCH /api/vendor/deployments/:tracking_ref/status updates status and writes audit log', async () => {
    const updatePayload = {
      status: 'UNDER_EVALUATION',
      assignedEngineer: 'Alex Mercer (Lead SAN Architect)',
      internalNotes: 'Fabric dual-path validated with optical telemetry simulation.'
    };

    const res = await request(`/api/vendor/deployments/${createdTrackingRef}/status`, {
      method: 'PATCH',
      headers: {
        'X-Vendor-Key': VENDOR_SECRET
      },
      body: updatePayload
    });

    assert(res.status === 200, `Expected 200, got ${res.status}`);
    assert(res.body.success === true, 'Success must be true');
    assert(res.body.data.status === 'UNDER_EVALUATION', 'Status must be UNDER_EVALUATION');
    assert(res.body.data.assignedEngineer === updatePayload.assignedEngineer, 'Assigned engineer must match');

    // Inspect again to confirm persisted state and new audit log
    const inspectRes = await request(`/api/vendor/deployments/${createdTrackingRef}`, {
      headers: { 'X-Vendor-Key': VENDOR_SECRET }
    });
    assert(inspectRes.body.data.status === 'UNDER_EVALUATION', 'Status persisted as UNDER_EVALUATION');
    assert(inspectRes.body.data.assigned_engineer === updatePayload.assignedEngineer, 'Engineer persisted');
    const statusAudit = inspectRes.body.data.auditLogs.find(l => l.event_type === 'DEPLOYMENT_STATUS_UPDATED');
    assert(statusAudit, 'Audit trail must record DEPLOYMENT_STATUS_UPDATED event');
  });

  // 31. Status Enum Validation
  await test('PATCH /api/vendor/deployments/:tracking_ref/status rejects invalid status with 400', async () => {
    const res = await request(`/api/vendor/deployments/${createdTrackingRef}/status`, {
      method: 'PATCH',
      headers: { 'X-Vendor-Key': VENDOR_SECRET },
      body: { status: 'INVALID_STATUS_CODE' }
    });
    assert(res.status === 400, `Expected 400 Bad Request, got ${res.status}`);
    assert(res.body.success === false, 'Success must be false');
    assert(res.body.error.includes('Invalid deployment status'), 'Must mention invalid deployment status');
  });

  // 32. Status Update Non-Existent Reference
  await test('PATCH /api/vendor/deployments/:tracking_ref/status returns 404 for unknown ref', async () => {
    const res = await request('/api/vendor/deployments/INF-REQ-99999999-VOID/status', {
      method: 'PATCH',
      headers: { 'X-Vendor-Key': VENDOR_SECRET },
      body: { status: 'QUALIFIED' }
    });
    assert(res.status === 404, `Expected 404 Not Found, got ${res.status}`);
  });

  // 33. Vendor Stats KPI Endpoint
  await test('GET /api/vendor/stats returns aggregate pipeline statistics', async () => {
    const res = await request('/api/vendor/stats', {
      headers: { 'X-Vendor-Key': VENDOR_SECRET }
    });
    assert(res.status === 200, `Expected 200, got ${res.status}`);
    assert(res.body.success === true, 'Success must be true');
    assert(typeof res.body.data.total === 'number' && res.body.data.total >= 2, 'Total must be >= 2');
    assert(typeof res.body.data.underEvaluation === 'number' && res.body.data.underEvaluation >= 1, 'underEvaluation must be >= 1');
    assert(res.body.data.architectures && typeof res.body.data.architectures === 'object', 'Architectures must be an object');
  });

  // 34. Vendor Logout
  await test('POST /api/vendor/auth/logout clears vendor cookie', async () => {
    const res = await request('/api/vendor/auth/logout', {
      method: 'POST',
      headers: { 'Cookie': vendorCookie }
    });
    assert(res.status === 200, `Expected 200, got ${res.status}`);
    assert(res.body.success === true, 'Success must be true');
    const setCookie = res.headers.get('set-cookie');
    assert(setCookie && (setCookie.includes('infrasights_vendor_token=;') || setCookie.includes('Expires=')), 'Must clear cookie');
  });

  // 35. Web Routes: /vendor unauthenticated redirect
  await test('GET /vendor redirects unauthenticated request to /vendor/login', async () => {
    const res = await request('/vendor', { redirect: 'manual' });
    assert(res.status === 302, `Expected 302 Redirect, got ${res.status}`);
    const location = res.headers.get('location');
    assert(location && location.includes('/vendor/login'), `Location header must point to /vendor/login, got ${location}`);
  });

  // 36. Web Routes: /vendor/login renders login page
  await test('GET /vendor/login renders vendor login HTML form', async () => {
    const res = await request('/vendor/login');
    assert(res.status === 200, `Expected 200, got ${res.status}`);
    assert(typeof res.body === 'string', 'Body must be string HTML');
    assert(res.body.includes('Infrasights Vendor Console'), 'Must contain Infrasights Vendor Console');
    assert(res.body.includes('Vendor Secret Key'), 'Must contain Vendor Secret Key field');
  });

  // 37. Web Routes: /vendor renders dashboard when authenticated via cookie
  await test('GET /vendor renders SSR dashboard when authenticated with cookie', async () => {
    const res = await request('/vendor', {
      headers: { 'Cookie': vendorCookie }
    });
    assert(res.status === 200, `Expected 200, got ${res.status}`);
    assert(typeof res.body === 'string', 'Body must be HTML');
    assert(res.body.includes('Deployment Qualification Management'), 'Must contain dashboard title');
    assert(res.body.includes('Total Requests'), 'Must contain KPI cards');
    assert(res.body.includes(createdTrackingRef), 'Must contain submitted tracking reference in table');
    assert(res.body.includes('Deployment Qualification Inspection'), 'Must contain modal structure');
  });

  // 38. SEO: /sitemap.xml
  await test('GET /sitemap.xml returns 200 with XML content-type and valid XML payload', async () => {
    const res = await request('/sitemap.xml');
    assert(res.status === 200, `Expected 200, got ${res.status}`);
    const contentType = res.headers.get('content-type') || '';
    assert(contentType.includes('application/xml'), `Expected application/xml content-type, got ${contentType}`);
    assert(typeof res.body === 'string', 'Body must be string');
    assert(res.body.includes('<?xml version="1.0" encoding="UTF-8"?>'), 'Must include standard XML declaration');
    assert(res.body.includes('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'), 'Must include sitemap schema 0.9');
    assert(res.body.includes('<loc>https://infrasights.in/</loc>'), 'Must include apex canonical URL');
    assert(res.body.includes('<loc>https://infrasights.in/index.html</loc>'), 'Must include index.html URL');
    assert(res.body.includes('<changefreq>weekly</changefreq>'), 'Must specify weekly change frequency');
    assert(res.body.includes('<priority>1.0</priority>'), 'Must specify priority 1.0');
  });

  // 39. SEO: /robots.txt
  await test('GET /robots.txt returns 200 with text content-type and valid directives', async () => {
    const res = await request('/robots.txt');
    assert(res.status === 200, `Expected 200, got ${res.status}`);
    const contentType = res.headers.get('content-type') || '';
    assert(contentType.includes('text/plain'), `Expected text/plain content-type, got ${contentType}`);
    assert(typeof res.body === 'string', 'Body must be string');
    assert(res.body.includes('User-agent: Googlebot'), 'Must explicitly allow Googlebot');
    assert(res.body.includes('User-agent: Bingbot'), 'Must explicitly allow Bingbot');
    assert(res.body.includes('User-agent: *'), 'Must specify User-agent: *');
    assert(res.body.includes('Allow: /'), 'Must allow root access');
    assert(res.body.includes('Disallow: /api/'), 'Must disallow /api/');
    assert(res.body.includes('Disallow: /vendor/'), 'Must disallow /vendor/');
    assert(res.body.includes('Host: infrasights.in'), 'Must include RFC-compliant Host directive without scheme');
    assert(res.body.includes('Sitemap: https://infrasights.in/sitemap.xml'), 'Must point to production sitemap');
  });

  // 40. Social Assets: /assets/og-image.png
  await test('GET /assets/og-image.png returns 200 with image/png content-type', async () => {
    const res = await request('/assets/og-image.png');
    assert(res.status === 200, `Expected 200, got ${res.status}`);
    const contentType = res.headers.get('content-type') || '';
    assert(contentType.includes('image/png'), `Expected image/png content-type, got ${contentType}`);
  });

  // 41. SEO Metadata & JSON-LD: GET / returns canonical, OpenGraph, Twitter, and Schema markup
  await test('GET / serves HTML with canonical URL, OpenGraph, Twitter card, and valid JSON-LD schema', async () => {
    const res = await request('/');
    assert(res.status === 200, `Expected 200, got ${res.status}`);
    assert(typeof res.body === 'string', 'Body must be HTML string');
    
    // Canonical link & Title
    assert(res.body.includes('<link rel="canonical" href="https://infrasights.in/">'), 'Must have canonical link');
    assert(res.body.includes('<title>Infrasights — Official Site | App-Wise SAN Path Monitoring & DC Infrastructure Visibility</title>'), 'Must have brand-dominant title');
    assert(res.body.includes('Infrasights — App-Wise SAN Path Monitoring'), 'Hero H1 must lead with Infrasights brand');

    // Google Verification & Geo/Language
    assert(res.body.includes('<meta name="google-site-verification"'), 'Must have google site verification meta tag');
    assert(res.body.includes('<link rel="alternate" hreflang="en"'), 'Must have hreflang en link');
    assert(res.body.includes('<link rel="alternate" hreflang="x-default"'), 'Must have hreflang x-default link');
    assert(res.body.includes('<link rel="manifest" href="/site.webmanifest">'), 'Must have webmanifest link');

    // Server response headers
    const linkHeader = res.headers.get('link') || '';
    assert(linkHeader.includes('https://infrasights.in/'), 'Must have canonical link header');
    const robotsHeader = res.headers.get('x-robots-tag') || '';
    assert(robotsHeader.includes('all'), 'Must have X-Robots-Tag header');
    const nosniffHeader = res.headers.get('x-content-type-options') || '';
    assert(nosniffHeader === 'nosniff', 'Must have X-Content-Type-Options: nosniff header');

    // Accessible image alt attributes
    assert(res.body.includes('alt="Infrasights v2.10 App-Wise SAN Path Monitoring Dashboard"'), 'Must have keyword-rich alt on visual element');
    
    // OpenGraph
    assert(res.body.includes('<meta property="og:url" content="https://infrasights.in/">'), 'Must have og:url');
    assert(res.body.includes('<meta property="og:image" content="https://infrasights.in/assets/og-image.png">'), 'Must have og:image');
    assert(res.body.includes('<meta property="og:image:width" content="1200">'), 'Must have og:image:width 1200');
    assert(res.body.includes('<meta property="og:image:height" content="630">'), 'Must have og:image:height 630');
    assert(res.body.includes('<meta property="og:site_name" content="Infrasights">'), 'Must have og:site_name');
    assert(res.body.includes('<meta property="og:locale" content="en_US">'), 'Must have og:locale');

    // Twitter Card
    assert(res.body.includes('<meta name="twitter:card" content="summary_large_image">'), 'Must have twitter:card summary_large_image');
    assert(res.body.includes('<meta name="twitter:title"'), 'Must have twitter:title');
    assert(res.body.includes('<meta name="twitter:description"'), 'Must have twitter:description');
    assert(res.body.includes('<meta name="twitter:image" content="https://infrasights.in/assets/og-image.png">'), 'Must have twitter:image');

    // JSON-LD Schema
    const scriptStart = '<script type="application/ld+json">';
    const scriptEnd = '</script>';
    const startIdx = res.body.indexOf(scriptStart);
    assert(startIdx !== -1, 'Must include application/ld+json script tag');
    const endIdx = res.body.indexOf(scriptEnd, startIdx);
    const jsonStr = res.body.substring(startIdx + scriptStart.length, endIdx).trim();
    const schemaObj = JSON.parse(jsonStr);
    assert(schemaObj['@context'] === 'https://schema.org', 'Schema context must be https://schema.org');
    assert(Array.isArray(schemaObj['@graph']), 'Schema must contain @graph array');

    const types = schemaObj['@graph'].map(item => item['@type']);
    assert(types.includes('SoftwareApplication'), 'Must include SoftwareApplication in schema');
    assert(types.includes('Organization'), 'Must include Organization in schema');
    assert(types.includes('WebSite'), 'Must include WebSite in schema');
    assert(types.includes('WebPage'), 'Must include WebPage in schema');
    assert(types.includes('FAQPage'), 'Must include FAQPage in schema');
    assert(types.includes('BreadcrumbList'), 'Must include BreadcrumbList in schema');

    // WebSite schema fields
    const website = schemaObj['@graph'].find(item => item['@type'] === 'WebSite');
    assert(website && website.name === 'Infrasights', 'WebSite must specify name: Infrasights');
    assert(Array.isArray(website.alternateName) && website.alternateName.includes('Infrasights SAN'), 'WebSite must specify alternateName');
    assert(website.potentialAction && website.potentialAction['@type'] === 'SearchAction', 'WebSite must have SearchAction');

    // Organization schema fields
    const org = schemaObj['@graph'].find(item => item['@type'] === 'Organization');
    assert(org && org.name === 'Infrasights', 'Organization must specify official name: Infrasights');
    assert(org.url === 'https://infrasights.in/', 'Organization must have canonical URL');
    assert(org.logo, 'Organization must have logo');

    // SoftwareApplication schema fields
    const appSchema = schemaObj['@graph'].find(item => item['@type'] === 'SoftwareApplication');
    assert(appSchema.softwareVersion === '2.10.4', 'SoftwareApplication must have version 2.10.4');
    assert(appSchema.operatingSystem.includes('Agentless SAN Architecture'), 'SoftwareApplication must state Agentless SAN Architecture');
    assert(appSchema.applicationCategory.includes('BusinessApplication'), 'SoftwareApplication must have BusinessApplication category');
    assert(appSchema.offers && appSchema.offers['@type'] === 'Offer', 'SoftwareApplication must have offers for Rich Snippet eligibility');
    assert(appSchema.aggregateRating && appSchema.aggregateRating['@type'] === 'AggregateRating', 'SoftwareApplication must have aggregateRating for Rich Snippet eligibility');

    const faq = schemaObj['@graph'].find(item => item['@type'] === 'FAQPage');
    assert(Array.isArray(faq.mainEntity) && faq.mainEntity.length >= 6, 'FAQPage must contain at least 6 questions');
  });

  // 42. OTP Service: Send OTP with 6-digit code and rate limiting
  await test('POST /api/auth/send-otp dispatches 6-digit OTP and enforces rate limiting cooldown', async () => {
    const testPhone = '+919876500001';
    const testEmail = 'telemetry.engineer@infrasights.in';

    const res = await request('/api/auth/send-otp', {
      method: 'POST',
      body: JSON.stringify({ phoneNumber: testPhone, email: testEmail })
    });

    assert(res.status === 200, `Expected 200, got ${res.status}: ${JSON.stringify(res.body)}`);
    assert(res.body.success === true, 'Response must be success');
    assert(typeof res.body.phoneNumber === 'string', 'Must return normalized phone');
    assert(res.body.expiresInSeconds === 300, 'Must have 300s TTL (5 minutes)');
    assert(res.body.cooldownSeconds === 60, 'Must have 60s cooldown');
    assert(typeof res.body.debugOtp === 'string' && res.body.debugOtp.length === 6, 'Must generate 6-digit OTP code');

    // Immediate second request must trigger rate limit 429
    const resRateLimit = await request('/api/auth/send-otp', {
      method: 'POST',
      body: JSON.stringify({ phoneNumber: testPhone, email: testEmail })
    });
    assert(resRateLimit.status === 429, `Expected 429 Rate Limited, got ${resRateLimit.status}`);
    assert(resRateLimit.body.success === false, 'Rate limited response must have success=false');
    assert(resRateLimit.body.error.includes('wait'), 'Must explain wait cooldown');
  });

  // 43. OTP Service: Verify OTP code and issue verification token
  let issuedVerificationToken = null;
  const verifiedPhone = '+919876500002';
  await test('POST /api/auth/verify-otp validates 6-digit OTP and issues verification token', async () => {
    // Generate fresh OTP
    const sendRes = await request('/api/auth/send-otp', {
      method: 'POST',
      body: JSON.stringify({ phoneNumber: verifiedPhone, email: 'verify.test@infrasights.in' })
    });
    assert(sendRes.status === 200, 'Must send OTP');
    const validOtp = sendRes.body.debugOtp;
    assert(validOtp, 'Debug OTP must be present in test mode');

    // Test invalid OTP code
    const invalidRes = await request('/api/auth/verify-otp', {
      method: 'POST',
      body: JSON.stringify({ phoneNumber: verifiedPhone, otp: '000000' })
    });
    assert(invalidRes.status === 400, 'Expected 400 for incorrect OTP');
    assert(invalidRes.body.success === false, 'Should fail for wrong code');

    // Test valid OTP code
    const validRes = await request('/api/auth/verify-otp', {
      method: 'POST',
      body: JSON.stringify({ phoneNumber: verifiedPhone, otp: validOtp })
    });
    assert(validRes.status === 200, `Expected 200, got ${validRes.status}: ${JSON.stringify(validRes.body)}`);
    assert(validRes.body.success === true, 'Must verify successfully');
    assert(validRes.body.verified === true, 'Must report verified=true');
    assert(typeof validRes.body.verificationToken === 'string', 'Must issue verification token');
    issuedVerificationToken = validRes.body.verificationToken;
  });

  // 44. Registration with verified phone number & welcome email from admin@infrasights.in
  await test('POST /api/auth/register links verified phone number and persists phone_verified status', async () => {
    const regRes = await request('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({
        fullName: 'Dr. Priya Sharma',
        email: 'priya.sharma@san-telemetry.in',
        organization: 'National Data Systems',
        departmentRole: 'Principal SAN Architect',
        password: 'SecurePassword2026!',
        phoneNumber: verifiedPhone,
        verificationToken: issuedVerificationToken
      })
    });

    assert(regRes.status === 201, `Expected 201, got ${regRes.status}: ${JSON.stringify(regRes.body)}`);
    assert(regRes.body.success === true, 'Registration must succeed');
    assert(regRes.body.data.user.phoneNumber === verifiedPhone, 'User must store verified phone number');
    assert(regRes.body.data.user.phoneVerified === true, 'User phoneVerified must be true');
    assert(typeof regRes.body.data.token === 'string', 'JWT token must be issued');
  });

  // 45. Web App Manifest: /site.webmanifest
  await test('GET /site.webmanifest returns 200 with JSON payload and Infrasights identity', async () => {
    const res = await request('/site.webmanifest');
    assert(res.status === 200, `Expected 200, got ${res.status}`);
    const contentType = res.headers.get('content-type') || '';
    assert(contentType.includes('manifest+json') || contentType.includes('json'), `Expected manifest content-type, got ${contentType}`);
    const manifest = typeof res.body === 'string' ? JSON.parse(res.body) : res.body;
    assert(manifest && manifest.name.includes('Infrasights'), 'Manifest must have brand name');
    assert(manifest.short_name === 'Infrasights', 'Manifest must have short_name: Infrasights');
    assert(Array.isArray(manifest.icons) && manifest.icons.length >= 2, 'Manifest must declare brand icons');
  });

  // 46. Security & Crawlability: /vendor web routes enforce X-Robots-Tag: noindex
  await test('GET /vendor/login enforces X-Robots-Tag: noindex header', async () => {
    const res = await request('/vendor/login');
    assert(res.status === 200, `Expected 200, got ${res.status}`);
    const robotsHeader = res.headers.get('x-robots-tag') || '';
    assert(robotsHeader.includes('noindex'), 'Vendor routes must enforce noindex to prevent indexing admin portals');
  });

  // 47. Authorized Digital Sellers: /ads.txt Google AdSense verification
  await test('GET /ads.txt returns 200 with text/plain and Google AdSense declaration', async () => {
    const res = await request('/ads.txt');
    assert(res.status === 200, `Expected 200, got ${res.status}`);
    const contentType = res.headers.get('content-type') || '';
    assert(contentType.includes('text/plain'), `Expected text/plain content-type, got ${contentType}`);
    assert(typeof res.body === 'string', 'Body must be text string');
    assert(res.body.includes('google.com'), 'Must declare google.com digital seller exchange');
    assert(res.body.includes('pub-1509985965270188') || res.body.includes('pub-ADSENSE_PUBLISHER_ID_HERE'), 'Must declare Google AdSense publisher ID');
    assert(res.body.includes('DIRECT'), 'Must declare direct relationship');
    assert(res.body.includes('f08c47fec0942fa0'), 'Must include Google AdSense certification authority ID f08c47fec0942fa0');
    const robotsHeader = res.headers.get('x-robots-tag') || '';
    assert(robotsHeader.includes('all') || robotsHeader.includes('index'), 'Must allow web crawlers to read ads.txt');
    const cacheControl = res.headers.get('cache-control') || '';
    assert(cacheControl.includes('public') && cacheControl.includes('86400'), 'Must enforce crawler-friendly cache control for ads.txt');
  });

  // Teardown
  serverInstance.close();

  console.log('\n====================================================');
  console.log(` Results: ${passed} passed, ${failed} failed`);
  console.log('====================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

if (require.main === module) {
  runTests().catch((err) => {
    console.error('Fatal test error:', err);
    if (serverInstance) serverInstance.close();
    process.exit(1);
  });
}

module.exports = { runTests };
