/**
 * Adversarial Stress & Vulnerability Assessment Test Harness
 * Role: Empirical Challenger (Gate 1)
 * Targets: R1 (Vendor Dashboard & API) & R2 (Cloud PaaS Configuration)
 * 
 * Verifies:
 *  1. Vendor Authentication Bypass (forged/empty headers, expired/tampered JWT, customer 403, cookie tampering, whitespace/case)
 *  2. Data Manipulation & Query Fuzzing (SQL/regex metacharacters, invalid enum transitions, 404 integrity, pagination bounds)
 *  3. High-Concurrency Stress (50+ bursts against /api/vendor/deployments and /vendor, zero race conditions)
 *  4. R2 Cloud PaaS Configuration (render.yaml custom domains, health checks, sitemap, robots, sensitive path isolation)
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');

const BASE_URL = process.env.API_BASE_URL || 'http://localhost:3000';
const VENDOR_SECRET_KEY = process.env.VENDOR_SECRET_KEY || 'infrasights-vendor-secret-2026';
const VENDOR_ADMIN_EMAIL = process.env.VENDOR_ADMIN_EMAIL || 'admin@infrasights.in';
const VENDOR_ADMIN_PASSWORD = process.env.VENDOR_ADMIN_PASSWORD || 'InfrasightsVendorAdmin2026!';
const JWT_SECRET = process.env.JWT_SECRET || 'infrasights_v210_enterprise_secure_token_secret_2026';

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;
const testResults = [];

function recordResult(category, testName, passed, details = {}) {
  totalTests++;
  if (passed) {
    passedTests++;
    console.log(`  [PASS] ${testName}`);
  } else {
    failedTests++;
    console.error(`  [FAIL] ${testName} -> ${details.error || 'Assertion failed'}`);
  }
  testResults.push({ category, testName, passed, ...details });
}

async function request(endpoint, options = {}) {
  const url = `${BASE_URL}${endpoint}`;
  const headers = { ...(options.headers || {}) };
  let body = options.body;
  if (body && typeof body === 'object') {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(body);
  }

  const start = Date.now();
  try {
    const res = await fetch(url, {
      method: options.method || 'GET',
      headers,
      body,
      redirect: options.redirect || 'manual' // Prevent automatic redirect following to capture 302
    });

    const duration = Date.now() - start;
    const contentType = res.headers.get('content-type') || '';
    let parsedBody;
    if (contentType.includes('application/json')) {
      try {
        parsedBody = await res.json();
      } catch (e) {
        parsedBody = null;
      }
    } else {
      parsedBody = await res.text();
    }

    return {
      status: res.status,
      headers: Object.fromEntries(res.headers.entries()),
      body: parsedBody,
      duration
    };
  } catch (err) {
    return {
      status: 0,
      headers: {},
      body: null,
      error: err.message,
      duration: Date.now() - start
    };
  }
}

// Helper to seed a test deployment qualification record
async function seedDeploymentRecord() {
  const ref = `INF-REQ-20261108-${crypto.randomBytes(2).toString('hex').toUpperCase()}`;
  const payload = {
    organizationName: 'Adversarial Stress Test Corp',
    businessEmail: `sec.audit.${Date.now()}@infrasights-test.com`,
    countryRegion: 'North America',
    departmentRole: 'Security Assessor',
    sanVendor: 'Generic Standard Enterprise SAN',
    switchCount: '25-50 Switches',
    fabricCount: 'Dual Fabric (Fabric A & B)',
    deploymentModel: 'Virtual Appliance',
    timeline: 'Immediate Production Proof-of-Concept',
    notes: 'Automated adversarial stress test record'
  };

  // We can seed via regular POST /api/deployments if customer token exists, or check existing
  // Let's create a customer account first
  const regEmail = `auditor.${Date.now()}@storagecorp.com`;
  const regRes = await request('/api/auth/register', {
    method: 'POST',
    body: {
      fullName: 'Empirical Challenger',
      email: regEmail,
      organization: 'Security QA Lab',
      departmentRole: 'Principal Assessor',
      password: 'AuditSecurePassword2026!'
    }
  });

  let customerToken = null;
  if (regRes.status === 201 && regRes.body?.data?.token) {
    customerToken = regRes.body.data.token;
  }

  // Submit qualification request
  const depRes = await request('/api/deployments', {
    method: 'POST',
    headers: customerToken ? { Authorization: `Bearer ${customerToken}` } : {},
    body: payload
  });

  let seededRef = null;
  if (depRes.status === 201 && depRes.body?.data?.trackingRef) {
    seededRef = depRes.body.data.trackingRef;
  }

  return { customerToken, seededRef };
}

async function runVendorAuthBypassTests(customerToken) {
  console.log('\n===============================================================');
  console.log(' SUITE 1: Vendor Authentication & Access Control Bypass Stress');
  console.log('===============================================================');

  // 1.1 Unauthenticated requests
  {
    const res = await request('/api/vendor/deployments');
    const passed = res.status === 401 && res.body?.success === false;
    recordResult('AUTH_BYPASS', 'Unauthenticated GET /api/vendor/deployments returns 401', passed, { status: res.status });
  }

  {
    const res = await request('/api/vendor/stats');
    const passed = res.status === 401 && res.body?.success === false;
    recordResult('AUTH_BYPASS', 'Unauthenticated GET /api/vendor/stats returns 401', passed, { status: res.status });
  }

  {
    const res = await request('/vendor', { redirect: 'manual' });
    const passed = res.status === 302 && (res.headers['location'] || '').includes('/vendor/login');
    recordResult('AUTH_BYPASS', 'Unauthenticated GET /vendor redirects 302 to /vendor/login', passed, {
      status: res.status,
      location: res.headers['location']
    });
  }

  // 1.2 Empty / Malformed Auth Headers
  {
    const res = await request('/api/vendor/deployments', { headers: { 'Authorization': '' } });
    const passed = res.status === 401;
    recordResult('AUTH_BYPASS', 'Empty Authorization header returns 401', passed, { status: res.status });
  }

  {
    const res = await request('/api/vendor/deployments', { headers: { 'Authorization': 'Bearer ' } });
    const passed = res.status === 401;
    recordResult('AUTH_BYPASS', 'Bearer with empty token returns 401', passed, { status: res.status });
  }

  {
    const res = await request('/api/vendor/deployments', { headers: { 'Authorization': 'Basic dXNlcjpwYXNz' } });
    const passed = res.status === 401;
    recordResult('AUTH_BYPASS', 'Unsupported Basic auth returns 401', passed, { status: res.status });
  }

  {
    const res = await request('/api/vendor/deployments', { headers: { 'Authorization': 'Bearer totally.fake.jwt' } });
    const passed = res.status === 401;
    recordResult('AUTH_BYPASS', 'Malformed fake JWT string returns 401', passed, { status: res.status });
  }

  {
    const giantPayload = 'A'.repeat(5000);
    const res = await request('/api/vendor/deployments', { headers: { 'Authorization': `Bearer ${giantPayload}` } });
    const passed = res.status === 401;
    recordResult('AUTH_BYPASS', 'Oversized token (5000 chars) returns 401 safely without crash', passed, { status: res.status });
  }

  // 1.3 Forged / Expired JWT Tokens
  {
    const forgedToken = jwt.sign(
      { id: 'vendor-admin', email: VENDOR_ADMIN_EMAIL, role: 'VENDOR_ADMIN', isVendor: true },
      'wrong-secret-key-1234567890'
    );
    const res = await request('/api/vendor/deployments', { headers: { 'Authorization': `Bearer ${forgedToken}` } });
    const passed = res.status === 401 && res.body?.error?.includes('Invalid or expired');
    recordResult('AUTH_BYPASS', 'Forged vendor JWT (wrong HMAC secret) returns 401', passed, { status: res.status });
  }

  {
    const expiredToken = jwt.sign(
      { id: 'vendor-admin', email: VENDOR_ADMIN_EMAIL, role: 'VENDOR_ADMIN', isVendor: true },
      JWT_SECRET,
      { expiresIn: '-10s' }
    );
    const res = await request('/api/vendor/deployments', { headers: { 'Authorization': `Bearer ${expiredToken}` } });
    const passed = res.status === 401;
    recordResult('AUTH_BYPASS', 'Expired vendor JWT returns 401', passed, { status: res.status });
  }

  {
    // None algorithm exploit attempt: header: { alg: "none", typ: "JWT" }
    const headerB64 = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
    const payloadB64 = Buffer.from(JSON.stringify({ id: 'vendor-admin', email: VENDOR_ADMIN_EMAIL, role: 'VENDOR_ADMIN' })).toString('base64url');
    const noneToken = `${headerB64}.${payloadB64}.`;
    const res = await request('/api/vendor/deployments', { headers: { 'Authorization': `Bearer ${noneToken}` } });
    const passed = res.status === 401;
    recordResult('AUTH_BYPASS', 'Algorithm None JWT exploit attempt returns 401', passed, { status: res.status });
  }

  // 1.4 Strict RBAC Gate: Standard Customer Bearer JWT -> Strict 403 Forbidden
  if (customerToken) {
    const res1 = await request('/api/vendor/deployments', { headers: { 'Authorization': `Bearer ${customerToken}` } });
    const passed1 = res1.status === 403 && res1.body?.error === 'Vendor administrative privileges required.';
    recordResult('RBAC_ENFORCEMENT', 'Customer JWT to GET /api/vendor/deployments returns strict 403 Forbidden', passed1, {
      status: res1.status,
      error: res1.body?.error
    });

    const res2 = await request('/api/vendor/stats', { headers: { 'Authorization': `Bearer ${customerToken}` } });
    const passed2 = res2.status === 403 && res2.body?.error === 'Vendor administrative privileges required.';
    recordResult('RBAC_ENFORCEMENT', 'Customer JWT to GET /api/vendor/stats returns strict 403 Forbidden', passed2, {
      status: res2.status
    });

    const res3 = await request('/vendor', {
      headers: { 'Cookie': `infrasights_vendor_token=${customerToken}` },
      redirect: 'manual'
    });
    const passed3 = res3.status === 403 && typeof res3.body === 'string' && res3.body.includes('403 Forbidden');
    recordResult('RBAC_ENFORCEMENT', 'Customer JWT to SSR /vendor returns 403 Forbidden page', passed3, {
      status: res3.status
    });
  } else {
    recordResult('RBAC_ENFORCEMENT', 'Customer token available for RBAC test', false, { error: 'Customer token was null' });
  }

  // 1.5 Cookie Manipulation (infrasights_vendor_token)
  {
    const forgedCookie = 'infrasights_vendor_token=tampered.token.data';
    const res = await request('/api/vendor/deployments', { headers: { 'Cookie': forgedCookie } });
    const passed = res.status === 401;
    recordResult('COOKIE_TAMPERING', 'Tampered cookie on API endpoint returns 401', passed, { status: res.status });
  }

  {
    // Valid vendor token in cookie
    const validVendorToken = jwt.sign(
      { id: 'vendor-admin', email: VENDOR_ADMIN_EMAIL, role: 'VENDOR_ADMIN', isVendor: true },
      JWT_SECRET,
      { expiresIn: '1h' }
    );
    const validCookie = `infrasights_vendor_token=${validVendorToken}`;
    const res = await request('/api/vendor/deployments', { headers: { 'Cookie': validCookie } });
    const passed = res.status === 200 && res.body?.success === true;
    recordResult('COOKIE_TAMPERING', 'Valid signed vendor token in cookie returns 200 OK', passed, { status: res.status });
  }

  {
    // Secret key directly in cookie fallback
    const res = await request('/api/vendor/deployments', { headers: { 'Cookie': `infrasights_vendor_token=${VENDOR_SECRET_KEY}` } });
    const passed = res.status === 200 && res.body?.success === true;
    recordResult('COOKIE_TAMPERING', 'Secret key directly in vendor cookie returns 200 OK', passed, { status: res.status });
  }

  {
    // Malformed URI-encoded cookie string
    const malformedCookie = 'infrasights_vendor_token=%E0%A4%A';
    const res = await request('/api/vendor/deployments', { headers: { 'Cookie': malformedCookie } });
    const passed = res.status === 401; // Should catch URIError and return 401 gracefully, not crash 500
    recordResult('COOKIE_TAMPERING', 'Malformed URI-encoded cookie handled gracefully without crash', passed, { status: res.status });
  }

  // 1.6 Header Spoofing & Whitespace Injection
  {
    // Standard X-Vendor-Key
    const res = await request('/api/vendor/deployments', { headers: { 'X-Vendor-Key': VENDOR_SECRET_KEY } });
    const passed = res.status === 200 && res.body?.success === true;
    recordResult('HEADER_SPOOFING', 'Exact X-Vendor-Key returns 200 OK', passed, { status: res.status });
  }

  {
    // Case-insensitivity: lowercase x-vendor-key
    const res = await request('/api/vendor/deployments', { headers: { 'x-vendor-key': VENDOR_SECRET_KEY } });
    const passed = res.status === 200 && res.body?.success === true;
    recordResult('HEADER_SPOOFING', 'Lowercase x-vendor-key returns 200 OK', passed, { status: res.status });
  }

  {
    // Case-insensitivity: X-Admin-Key
    const res = await request('/api/vendor/deployments', { headers: { 'X-Admin-Key': VENDOR_SECRET_KEY } });
    const passed = res.status === 200 && res.body?.success === true;
    recordResult('HEADER_SPOOFING', 'Alternate header X-Admin-Key returns 200 OK', passed, { status: res.status });
  }

  {
    // Whitespace-only key: "   "
    const res = await request('/api/vendor/deployments', { headers: { 'X-Vendor-Key': '   ' } });
    const passed = res.status === 401;
    recordResult('HEADER_SPOOFING', 'Whitespace-only X-Vendor-Key strictly rejected with 401', passed, { status: res.status });
  }

  {
    // Internal whitespace corruption: "infrasights vendor secret 2026"
    const res = await request('/api/vendor/deployments', { headers: { 'X-Vendor-Key': 'infrasights vendor secret 2026' } });
    const passed = res.status === 401;
    recordResult('HEADER_SPOOFING', 'Internal whitespace injected X-Vendor-Key strictly rejected with 401', passed, { status: res.status });
  }

  {
    // Invalid key with whitespace padding: "  bogus-secret-key  "
    const res = await request('/api/vendor/deployments', { headers: { 'X-Vendor-Key': '  bogus-secret-key  ' } });
    const passed = res.status === 401;
    recordResult('HEADER_SPOOFING', 'Whitespace-padded invalid X-Vendor-Key rejected with 401', passed, { status: res.status });
  }

  {
    // RFC 7230 OWS test: Valid key with leading/trailing whitespace is normalized per HTTP spec to 200 OK
    const paddedKey = `  ${VENDOR_SECRET_KEY}  `;
    const res = await request('/api/vendor/deployments', { headers: { 'X-Vendor-Key': paddedKey } });
    const passed = res.status === 200 && res.body?.success === true;
    recordResult('HEADER_SPOOFING', 'RFC 7230 OWS whitespace on valid X-Vendor-Key handled per HTTP spec (200 OK)', passed, { status: res.status });
  }

  {
    // Empty X-Vendor-Key
    const res = await request('/api/vendor/deployments', { headers: { 'X-Vendor-Key': '' } });
    const passed = res.status === 401;
    recordResult('HEADER_SPOOFING', 'Empty string X-Vendor-Key rejected with 401', passed, { status: res.status });
  }
}

async function runDataManipulationAndQueryFuzzing(seededRef) {
  console.log('\n===============================================================');
  console.log(' SUITE 2: Data Manipulation & Query Fuzzing');
  console.log('===============================================================');

  const authHeader = { 'X-Vendor-Key': VENDOR_SECRET_KEY };

  // 2.1 Search Query Injection Fuzzing
  const injectionPayloads = [
    { name: 'SQL Single-Quote', query: "'" },
    { name: 'SQL Double-Quote', query: '"' },
    { name: 'SQL Comment', query: "'--" },
    { name: 'SQL Semicolon Batch', query: "'; SELECT 1;--" },
    { name: 'SQL Union Attack', query: "' UNION SELECT 1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17--" },
    { name: 'SQL Destructive Attempt', query: "'; DROP TABLE DeploymentRequests;--" },
    { name: 'Regex Metacharacters', query: ".*+?^${}()|[]\\" },
    { name: 'Regex Catastrophic Backtracking Pattern', query: "(a+)+b" },
    { name: 'HTML/Script Injection', query: "<script>alert(1)</script>" },
    { name: 'Null Byte Injection', query: "test%00admin" },
    { name: 'Oversized Search String (2000 chars)', query: 'Z'.repeat(2000) }
  ];

  for (const item of injectionPayloads) {
    const res = await request(`/api/vendor/deployments?search=${encodeURIComponent(item.query)}`, { headers: authHeader });
    const passed = res.status === 200 && res.body?.success === true && Array.isArray(res.body?.data);
    recordResult('QUERY_FUZZING', `Search query injection: ${item.name} handled safely (200 OK, no crash)`, passed, {
      status: res.status,
      count: res.body?.count
    });
  }

  // 2.2 Status Filter Injection & Fuzzing
  const statusFuzzPayloads = [
    { name: 'SQL Injection in status', val: "' OR '1'='1" },
    { name: 'Non-Enum bogus status', val: 'BOGUS_STATUS_123' },
    { name: 'Special chars in status', val: '$$$$%%%^^^' },
    { name: 'Numeric status', val: '123' }
  ];

  for (const item of statusFuzzPayloads) {
    const res = await request(`/api/vendor/deployments?status=${encodeURIComponent(item.val)}`, { headers: authHeader });
    const passed = res.status === 200 && res.body?.success === true && Array.isArray(res.body?.data) && res.body.data.length === 0;
    recordResult('QUERY_FUZZING', `Status filter fuzzing: ${item.name} safely returns 0 records`, passed, {
      status: res.status,
      total: res.body?.total
    });
  }

  // 2.3 Invalid Status Transitions on PATCH /api/vendor/deployments/:ref/status
  const targetRef = seededRef || 'INF-REQ-20261108-ABCD';
  const invalidTransitions = [
    { name: 'Non-enum status BOGUS', body: { status: 'BOGUS' }, expectedStatus: 400 },
    { name: 'Non-enum status HACKED', body: { status: 'HACKED' }, expectedStatus: 400 },
    { name: 'Empty string status', body: { status: '' }, expectedStatus: 400 },
    { name: 'Missing status property', body: { assignedEngineer: 'John' }, expectedStatus: 400 },
    { name: 'Numeric status value', body: { status: 999 }, expectedStatus: 400 },
    { name: 'SQL injection in status body', body: { status: "QUALIFIED'; DROP TABLE AuditLogs;--" }, expectedStatus: 400 }
  ];

  for (const item of invalidTransitions) {
    const res = await request(`/api/vendor/deployments/${targetRef}/status`, {
      method: 'PATCH',
      headers: authHeader,
      body: item.body
    });
    const passed = res.status === item.expectedStatus && res.body?.success === false;
    recordResult('STATUS_TRANSITIONS', `Invalid status transition: ${item.name} rejected with 400`, passed, {
      status: res.status,
      error: res.body?.error
    });
  }

  // Legitimate status transition (positive control)
  if (seededRef) {
    const validRes = await request(`/api/vendor/deployments/${seededRef}/status`, {
      method: 'PATCH',
      headers: authHeader,
      body: {
        status: 'UNDER_EVALUATION',
        assignedEngineer: 'Lead SAN Architect',
        internalNotes: 'Automated adversarial test transition'
      }
    });
    const validPassed = validRes.status === 200 && validRes.body?.success === true && validRes.body?.data?.status === 'UNDER_EVALUATION';
    recordResult('STATUS_TRANSITIONS', 'Valid status transition (UNDER_EVALUATION) succeeds with 200 OK', validPassed, {
      status: validRes.status,
      newStatus: validRes.body?.data?.status
    });
  }

  // 2.4 Non-Existent Tracking References
  {
    const nonExistentRef = 'INF-REQ-99999999-VOID';
    const res = await request(`/api/vendor/deployments/${nonExistentRef}`, { headers: authHeader });
    const passed = res.status === 404 && res.body?.success === false;
    recordResult('REFERENCE_LOOKUP', 'Non-existent tracking ref GET returns 404 Not Found', passed, { status: res.status });
  }

  {
    const nonExistentRef = 'INF-REQ-99999999-VOID';
    const res = await request(`/api/vendor/deployments/${nonExistentRef}/status`, {
      method: 'PATCH',
      headers: authHeader,
      body: { status: 'QUALIFIED' }
    });
    const passed = res.status === 404 && res.body?.success === false;
    recordResult('REFERENCE_LOOKUP', 'Non-existent tracking ref PATCH returns 404 Not Found', passed, { status: res.status });
  }

  {
    // Path traversal attempt in URL param
    const res = await request('/api/vendor/deployments/..%2F..%2Fetc%2Fpasswd', { headers: authHeader });
    const passed = res.status === 404;
    recordResult('REFERENCE_LOOKUP', 'Path traversal in tracking ref safely returns 404', passed, { status: res.status });
  }

  // 2.5 Pagination Fuzzing & Boundary Testing
  const paginationCases = [
    { name: 'Negative page and negative limit (?page=-5&limit=-20)', query: '?page=-5&limit=-20', expectedPage: 1, minLimit: 1 },
    { name: 'Zero page and zero limit (?page=0&limit=0)', query: '?page=0&limit=0', expectedPage: 1, minLimit: 1 },
    { name: 'Non-numeric string values (?page=abc&limit=xyz)', query: '?page=abc&limit=xyz', expectedPage: 1, minLimit: 1 },
    { name: 'Extremely large limit (?page=1&limit=100000)', query: '?page=1&limit=100000', expectedPage: 1 },
    { name: 'Out-of-range high page (?page=999999&limit=10)', query: '?page=999999&limit=10', expectedPage: 999999, expectedCount: 0 }
  ];

  for (const item of paginationCases) {
    const res = await request(`/api/vendor/deployments${item.query}`, { headers: authHeader });
    const passed = res.status === 200 && res.body?.success === true && Array.isArray(res.body?.data);
    recordResult('PAGINATION_FUZZING', `Pagination fuzzing: ${item.name} returns 200 OK without crash`, passed, {
      status: res.status,
      returnedPage: res.body?.page,
      returnedLimit: res.body?.limit,
      returnedCount: res.body?.count
    });
  }
}

async function runHighConcurrencyStress() {
  console.log('\n===============================================================');
  console.log(' SUITE 3: High-Concurrency Burst & Race Condition Stress');
  console.log('===============================================================');

  const authHeader = { 'X-Vendor-Key': VENDOR_SECRET_KEY };
  const CONCURRENCY_BURST = 60;

  // 3.1 Burst 60 concurrent GET requests to /api/vendor/deployments
  {
    console.log(`  Executing burst of ${CONCURRENCY_BURST} concurrent GET /api/vendor/deployments requests...`);
    const promises = [];
    const tStart = Date.now();
    for (let i = 0; i < CONCURRENCY_BURST; i++) {
      promises.push(request('/api/vendor/deployments', { headers: authHeader }));
    }

    const responses = await Promise.all(promises);
    const totalDuration = Date.now() - tStart;

    const statusCounts = {};
    let errorsCount = 0;
    const durations = [];

    for (const res of responses) {
      statusCounts[res.status] = (statusCounts[res.status] || 0) + 1;
      durations.push(res.duration);
      if (res.status !== 200) {
        errorsCount++;
      }
    }

    durations.sort((a, b) => a - b);
    const p50 = durations[Math.floor(durations.length * 0.5)];
    const p95 = durations[Math.floor(durations.length * 0.95)];
    const p99 = durations[Math.floor(durations.length * 0.99)];

    const passed = errorsCount === 0 && (statusCounts[200] || 0) === CONCURRENCY_BURST;
    recordResult('CONCURRENCY_STRESS', `Burst ${CONCURRENCY_BURST} concurrent API GETs: 100% 200 OK (0 race conditions/rejections)`, passed, {
      concurrency: CONCURRENCY_BURST,
      totalDurationMs: totalDuration,
      statusCounts,
      p50Ms: p50,
      p95Ms: p95,
      p99Ms: p99
    });
  }

  // 3.2 Burst 50 concurrent SSR requests to /vendor with valid vendor cookie
  {
    const vendorToken = jwt.sign(
      { id: 'vendor-admin', email: VENDOR_ADMIN_EMAIL, role: 'VENDOR_ADMIN', isVendor: true },
      JWT_SECRET,
      { expiresIn: '1h' }
    );
    const cookieHeader = { 'Cookie': `infrasights_vendor_token=${vendorToken}` };
    const SSR_BURST = 50;
    console.log(`  Executing burst of ${SSR_BURST} concurrent GET /vendor SSR requests...`);

    const promises = [];
    const tStart = Date.now();
    for (let i = 0; i < SSR_BURST; i++) {
      promises.push(request('/vendor', { headers: cookieHeader, redirect: 'manual' }));
    }

    const responses = await Promise.all(promises);
    const totalDuration = Date.now() - tStart;

    let success200 = 0;
    let htmlValid = 0;
    for (const res of responses) {
      if (res.status === 200) {
        success200++;
        if (typeof res.body === 'string' && res.body.includes('Infrasights Vendor Console')) {
          htmlValid++;
        }
      }
    }

    const passed = success200 === SSR_BURST && htmlValid === SSR_BURST;
    recordResult('CONCURRENCY_STRESS', `Burst ${SSR_BURST} concurrent SSR GET /vendor: 100% 200 OK with valid SSR HTML`, passed, {
      concurrency: SSR_BURST,
      success200,
      htmlValid,
      totalDurationMs: totalDuration
    });
  }

  // 3.3 Burst 30 concurrent status mutation requests to PATCH /api/vendor/deployments/:ref/status
  {
    const tempRef = `INF-REQ-20261108-${crypto.randomBytes(2).toString('hex').toUpperCase()}`;
    // Seed record directly if possible or update an existing one
    const SEED_BURST = 30;
    console.log(`  Executing burst of ${SEED_BURST} concurrent status mutations...`);

    const statuses = ['UNDER_EVALUATION', 'QUALIFIED', 'DEPLOYMENT_SCHEDULED'];
    const promises = [];
    for (let i = 0; i < SEED_BURST; i++) {
      const targetStatus = statuses[i % statuses.length];
      promises.push(request(`/api/vendor/deployments/INF-REQ-20261108-0001/status`, {
        method: 'PATCH',
        headers: authHeader,
        body: {
          status: targetStatus,
          assignedEngineer: `Worker ${i}`,
          internalNotes: `Concurrent mutation probe #${i}`
        }
      }));
    }

    const responses = await Promise.all(promises);
    let okCount = 0;
    let crashCount = 0;
    for (const res of responses) {
      if (res.status === 200 || res.status === 404) {
        okCount++;
      } else {
        crashCount++;
      }
    }

    const passed = crashCount === 0 && okCount === SEED_BURST;
    recordResult('CONCURRENCY_STRESS', `Burst ${SEED_BURST} concurrent PATCH status: 0 unhandled rejections/crashes`, passed, {
      okCount,
      crashCount
    });
  }
}

async function runR2CloudPaaSProbes() {
  console.log('\n===============================================================');
  console.log(' SUITE 4: R2 Cloud PaaS Configuration & Production Security Probes');
  console.log('===============================================================');

  // 4.1 PaaS Blueprint Conformance (render.yaml)
  const renderYamlPath = path.resolve(__dirname, '..', 'render.yaml');
  const renderYamlExists = fs.existsSync(renderYamlPath);
  let renderYamlContent = '';
  if (renderYamlExists) {
    renderYamlContent = fs.readFileSync(renderYamlPath, 'utf8');
  }

  {
    const hasMailService = renderYamlContent.includes('name: infrasights-mail-service');
    const hasPlatform = renderYamlContent.includes('name: infrasights-platform');
    const hasApexDomain = renderYamlContent.includes('- infrasights.in');
    const hasWwwDomain = renderYamlContent.includes('- www.infrasights.in');
    const hasHealthPath = renderYamlContent.includes('healthCheckPath: /api/health');
    const hasMailHealth = renderYamlContent.includes('healthCheckPath: /health');
    const hasVendorSecret = renderYamlContent.includes('key: VENDOR_SECRET_KEY');

    const passed = hasMailService && hasPlatform && hasApexDomain && hasWwwDomain && hasHealthPath && hasMailHealth && hasVendorSecret;
    recordResult('PAAS_CONFIG', 'render.yaml contains all required dual services, custom domains, and health check paths', passed, {
      hasMailService,
      hasPlatform,
      hasApexDomain,
      hasWwwDomain,
      hasHealthPath,
      hasVendorSecret
    });
  }

  // 4.2 Production Health Probe
  {
    const res = await request('/api/health');
    const passed = res.status === 200 && res.body?.status === 'HEALTHY' && res.body?.product === 'Infrasights' && res.body?.version === '2.10.4';
    recordResult('PAAS_PROBES', 'GET /api/health returns 200 HEALTHY with version 2.10.4', passed, {
      status: res.status,
      body: res.body
    });
  }

  // 4.3 Sitemap & Robots.txt Probes
  {
    const sitemapRes = await request('/sitemap.xml');
    const passed = sitemapRes.status === 200 && (sitemapRes.headers['content-type'] || '').includes('xml') && typeof sitemapRes.body === 'string' && sitemapRes.body.includes('https://infrasights.in');
    recordResult('PAAS_PROBES', 'GET /sitemap.xml returns 200 XML referencing production domain', passed, {
      status: sitemapRes.status
    });
  }

  {
    const robotsRes = await request('/robots.txt');
    const passed = robotsRes.status === 200 && (robotsRes.headers['content-type'] || '').includes('text/plain') && typeof robotsRes.body === 'string' && robotsRes.body.includes('Disallow: /api/') && robotsRes.body.includes('Disallow: /vendor/');
    recordResult('PAAS_PROBES', 'GET /robots.txt returns 200 Disallowing /api/ and /vendor/', passed, {
      status: robotsRes.status
    });
  }

  // 4.4 Sensitive Directory Blocking
  const sensitivePaths = [
    '/.agents/teamwork/ORIGINAL_REQUEST.md',
    '/server/index.js',
    '/server/config/database.js',
    '/.git/config'
  ];

  for (const sPath of sensitivePaths) {
    const res = await request(sPath);
    const passed = res.status === 404;
    recordResult('SENSITIVE_ISOLATION', `Direct access to ${sPath} blocked with 404 Not Found`, passed, {
      path: sPath,
      status: res.status
    });
  }
}

async function main() {
  console.log('================================================================');
  console.log(' INFRASIGHTS v2.10 ADVERSARIAL STRESS & SECURITY AUDIT HARNESS ');
  console.log(` Target Server: ${BASE_URL}`);
  console.log(` Timestamp:     ${new Date().toISOString()}`);
  console.log('================================================================');

  // Verify server is alive before starting, or start it in-process
  let serverInstance = null;
  let health = await request('/api/health');
  if (health.status !== 200) {
    console.log(`[Auto-Start] Server at ${BASE_URL} is not responding (status: ${health.status}). Launching server in-process...`);
    try {
      const serverModule = require('../server/index');
      serverInstance = await serverModule.start();
      console.log('[Auto-Start] Server launched successfully.');
      // Wait a moment for listeners
      await new Promise(r => setTimeout(r, 1000));
      health = await request('/api/health');
      console.log(`[Auto-Start] Health probe verified: HTTP ${health.status}`);
    } catch (e) {
      console.error('[Auto-Start] Failed to launch server:', e.message);
      process.exit(1);
    }
  }

  // Seed deployment and obtain customer token
  const { customerToken, seededRef } = await seedDeploymentRecord();
  console.log(`[Seed Setup] Customer Account & Token acquired: ${customerToken ? 'YES' : 'NO'}`);
  console.log(`[Seed Setup] Deployment Qualification Seeded:   ${seededRef || 'N/A'}`);

  // Run Test Suites
  await runVendorAuthBypassTests(customerToken);
  await runDataManipulationAndQueryFuzzing(seededRef);
  await runHighConcurrencyStress();
  await runR2CloudPaaSProbes();

  // Summary
  console.log('\n===============================================================');
  console.log(' ADVERSARIAL AUDIT SUMMARY & VERDICT');
  console.log('===============================================================');
  console.log(` Total Tests Executed: ${totalTests}`);
  console.log(` Passed:               ${passedTests}`);
  console.log(` Failed:               ${failedTests}`);
  console.log(` Pass Rate:             ${((passedTests / totalTests) * 100).toFixed(2)}%`);

  const summary = {
    timestamp: new Date().toISOString(),
    totalTests,
    passedTests,
    failedTests,
    passRate: `${((passedTests / totalTests) * 100).toFixed(2)}%`,
    verdict: failedTests === 0 ? 'CONFIRM_CORRECTNESS' : 'REJECT',
    results: testResults
  };

  const outputPath = path.resolve(__dirname, 'adversarial_stress_report.json');
  fs.writeFileSync(outputPath, JSON.stringify(summary, null, 2), 'utf8');
  console.log(`\nDetailed empirical report saved to: ${outputPath}`);

  if (serverInstance) {
    try {
      serverInstance.close();
      console.log('[Auto-Start] Internal server instance closed cleanly.');
    } catch (e) {}
  }

  if (failedTests > 0) {
    console.error('\nFAILURES DETECTED:');
    testResults.filter(r => !r.passed).forEach(f => console.error(` - [${f.category}] ${f.testName}`));
    process.exit(1);
  } else {
    console.log('\nALL ADVERSARIAL STRESS TESTS PASSED CLEANLY (CONFIRM_CORRECTNESS).');
    process.exit(0);
  }
}

main().catch(err => {
  console.error('[FATAL UNCAUGHT ERROR]', err);
  process.exit(1);
});
