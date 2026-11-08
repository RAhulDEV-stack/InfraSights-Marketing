/**
 * Adversarial Empirical Stress Test Suite for Infrasights v2.10
 * Requirement R1 & R4 Verification: Authenticated Qualification Funnel & Data Persistence
 * 
 * Scope:
 * 1. Unauthenticated Submissions & Access Guardrails (POST/GET /api/deployments, GET /api/auth/me) -> 401
 * 2. Malformed Payloads:
 *    - Registration: missing email, invalid email, weak passwords, short names -> 400
 *    - Login: missing email, missing password -> 400
 *    - Deployment Qualification: invalid businessEmail format -> 400 (Vulnerability Check)
 * 3. Duplicate Registration & Case-Insensitive Email Collision -> 409 Conflict
 * 4. Session Revocation & Token Invalidation (POST /api/auth/logout -> 401 on old token)
 * 5. High-Concurrency Qualification Race & Tracking Ref Entropy (20 concurrent requests -> 0 collisions, INF-REQ-YYYYMMDD-XXXX)
 * 6. Database Persistence & Entity Integrity (1-to-1 verification of each tracking reference and user list)
 */

const crypto = require('crypto');

const BASE_URL = process.env.API_BASE_URL || 'http://localhost:3000';

const TRACKING_REF_REGEX = /^INF-REQ-\d{8}-[A-Z0-9]{4}$/;

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;
const failures = [];

function assert(condition, message) {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

async function testStep(name, fn) {
  totalTests++;
  process.stdout.write(`[TEST ${totalTests}] ${name} ... `);
  try {
    const start = Date.now();
    await fn();
    const duration = Date.now() - start;
    console.log(`PASSED (${duration}ms)`);
    passedTests++;
  } catch (err) {
    console.log(`FAILED: ${err.message}`);
    failedTests++;
    failures.push({ name, error: err.message });
  }
}

async function request(path, options = {}) {
  const url = `${BASE_URL}${path}`;
  const response = await fetch(url, {
    method: options.method || 'GET',
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {})
    },
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined
  });

  const contentType = response.headers.get('content-type') || '';
  let body;
  if (contentType.includes('application/json')) {
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

// Shannon Entropy Calculation for Hex/Alpha Suffix Distribution
function calculateEntropy(strings) {
  const charCounts = {};
  let totalChars = 0;

  for (const str of strings) {
    for (const char of str) {
      charCounts[char] = (charCounts[char] || 0) + 1;
      totalChars++;
    }
  }

  let entropy = 0;
  for (const char in charCounts) {
    const p = charCounts[char] / totalChars;
    entropy -= p * Math.log2(p);
  }

  return { entropy, uniqueChars: Object.keys(charCounts).length, totalChars };
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function main() {
  console.log('=============================================================================');
  console.log('  INFRASIGHTS v2.10 — ADVERSARIAL STRESS TEST SUITE (R1 & R4)');
  console.log(`  Target: ${BASE_URL} | Timestamp: ${new Date().toISOString()}`);
  console.log('=============================================================================\n');

  // Verify server readiness
  const healthRes = await request('/api/health');
  assert(healthRes.status === 200, `Backend health probe failed: ${healthRes.status}`);
  console.log(`[Target Service Status] Engine: ${healthRes.body.database.engine}, Version: ${healthRes.body.version}, Mode: ${healthRes.body.database.mode}\n`);

  // =========================================================================
  // SECTION 1: Unauthenticated Submissions & Access Guardrails
  // =========================================================================
  console.log('--- SECTION 1: Unauthenticated Submissions & Token Guardrails ---');

  await testStep('POST /api/deployments with NO Authorization header returns 401', async () => {
    const res = await request('/api/deployments', {
      method: 'POST',
      body: {
        organizationName: 'Unauthorized Corp',
        businessEmail: 'intruder@corp.org'
      }
    });
    assert(res.status === 401, `Expected 401, got ${res.status}`);
    assert(res.body.success === false, 'Body success must be false');
    assert(res.body.error.includes('Authentication required') || res.body.error.includes('missing'), 'Error message must specify auth required');
  });

  await testStep('POST /api/deployments with invalid Bearer token returns 401', async () => {
    const res = await request('/api/deployments', {
      method: 'POST',
      headers: { Authorization: 'Bearer this.is.an.invalid.jwt.token' },
      body: { organizationName: 'Unauthorized Corp' }
    });
    assert(res.status === 401, `Expected 401, got ${res.status}`);
    assert(res.body.success === false, 'Body success must be false');
  });

  await testStep('POST /api/deployments with malformed Authorization header (non-Bearer) returns 401', async () => {
    const res = await request('/api/deployments', {
      method: 'POST',
      headers: { Authorization: 'Basic dXNlcjpwYXNzd29yZA==' },
      body: { organizationName: 'Unauthorized Corp' }
    });
    assert(res.status === 401, `Expected 401, got ${res.status}`);
    assert(res.body.success === false, 'Body success must be false');
  });

  await testStep('GET /api/deployments with NO Authorization header returns 401', async () => {
    const res = await request('/api/deployments');
    assert(res.status === 401, `Expected 401, got ${res.status}`);
  });

  await testStep('GET /api/auth/me with NO Authorization header returns 401', async () => {
    const res = await request('/api/auth/me');
    assert(res.status === 401, `Expected 401, got ${res.status}`);
  });

  // =========================================================================
  // SECTION 2: Malformed Payloads & Server-Side Input Validation
  // =========================================================================
  console.log('\n--- SECTION 2: Malformed Payloads & Server-Side Input Validation ---');

  await testStep('POST /api/auth/register with empty body returns 400', async () => {
    const res = await request('/api/auth/register', {
      method: 'POST',
      body: {}
    });
    assert(res.status === 400, `Expected 400, got ${res.status}`);
    assert(res.body.success === false, 'Body success must be false');
  });

  await testStep('POST /api/auth/register with missing email returns 400', async () => {
    const res = await request('/api/auth/register', {
      method: 'POST',
      body: {
        fullName: 'Valid Name',
        organization: 'Acme SAN Corp',
        password: 'ValidPassword2026!'
      }
    });
    assert(res.status === 400, `Expected 400, got ${res.status}`);
    assert(res.body.error.includes('email'), 'Error must specify email requirement');
  });

  const invalidEmails = [
    'plainaddress',
    '@missingusername.com',
    'username@.com',
    'username@com',
    'user name@enterprise.org',
    'user@domain..com'
  ];

  for (const invEmail of invalidEmails) {
    await testStep(`POST /api/auth/register rejects invalid email "${invEmail}" with 400`, async () => {
      const res = await request('/api/auth/register', {
        method: 'POST',
        body: {
          fullName: 'Test User',
          email: invEmail,
          organization: 'SAN Enterprise',
          password: 'ValidPassword2026!'
        }
      });
      assert(res.status === 400, `Expected 400 for ${invEmail}, got ${res.status}`);
    });
  }

  const weakPasswords = [
    'short',
    '1234567',
    '',
    'a'
  ];

  for (const weakPass of weakPasswords) {
    await testStep(`POST /api/auth/register rejects weak password length "${weakPass.length}" with 400`, async () => {
      const res = await request('/api/auth/register', {
        method: 'POST',
        body: {
          fullName: 'Test User',
          email: `valid.${Date.now()}.${Math.random().toString(36).substring(7)}@datacenter.org`,
          organization: 'SAN Enterprise',
          password: weakPass
        }
      });
      assert(res.status === 400, `Expected 400 for password length ${weakPass.length}, got ${res.status}`);
      assert(res.body.error.includes('8 characters'), 'Error must state password length requirement');
    });
  }

  await testStep('POST /api/auth/login with missing email returns 400', async () => {
    const res = await request('/api/auth/login', {
      method: 'POST',
      body: { password: 'Password123!' }
    });
    assert(res.status === 400, `Expected 400, got ${res.status}`);
  });

  await testStep('POST /api/auth/login with missing password returns 400', async () => {
    const res = await request('/api/auth/login', {
      method: 'POST',
      body: { email: 'user@example.com' }
    });
    assert(res.status === 400, `Expected 400, got ${res.status}`);
  });

  // =========================================================================
  // SECTION 3: Duplicate Registration & Collision Resistance
  // =========================================================================
  console.log('\n--- SECTION 3: Duplicate Registration & Case-Insensitive Collision Resistance ---');

  const duplicateTestEmail = `stress.dup.${Date.now()}@infrasights-san.net`;
  let user1Token;

  await testStep('Initial registration of new user returns 201 Created', async () => {
    const res = await request('/api/auth/register', {
      method: 'POST',
      body: {
        fullName: 'Morgan Stanley',
        email: duplicateTestEmail,
        organization: 'Enterprise SAN Storage Group',
        departmentRole: 'Principal SAN Architect',
        password: 'SecureStoragePassword2026!'
      }
    });
    assert(res.status === 201, `Expected 201, got ${res.status}`);
    assert(res.body.success === true, 'Registration must succeed');
    assert(res.body.data.token, 'Token must be provided');
    user1Token = res.body.data.token;
  });

  await testStep('Second registration with exact duplicate email returns 409 Conflict', async () => {
    const res = await request('/api/auth/register', {
      method: 'POST',
      body: {
        fullName: 'Morgan Stanley Impersonator',
        email: duplicateTestEmail,
        organization: 'Competitor Corp',
        departmentRole: 'Hacker',
        password: 'AnotherPassword2026!'
      }
    });
    assert(res.status === 409, `Expected 409 Conflict, got ${res.status}`);
    assert(res.body.success === false, 'Body success must be false');
    assert(res.body.error.includes('already exists'), 'Error message must note existing account');
  });

  await testStep('Third registration with UPPERCASE variant of email returns 409 Conflict', async () => {
    const uppercaseVariant = duplicateTestEmail.toUpperCase();
    const res = await request('/api/auth/register', {
      method: 'POST',
      body: {
        fullName: 'Morgan Stanley Uppercase',
        email: uppercaseVariant,
        organization: 'Case Sensitivity Corp',
        departmentRole: 'Architect',
        password: 'AnotherPassword2026!'
      }
    });
    assert(res.status === 409, `Expected 409 Conflict for uppercase duplicate, got ${res.status}`);
    assert(res.body.success === false, 'Body success must be false');
    assert(res.body.error.includes('already exists'), 'Error message must note existing account');
  });

  // =========================================================================
  // SECTION 4: Session Revocation & Token Lifecycle
  // =========================================================================
  console.log('\n--- SECTION 4: Session Revocation & Token Invalidation ---');

  await testStep('Active token successfully accesses GET /api/auth/me (pre-logout)', async () => {
    const res = await request('/api/auth/me', {
      headers: { Authorization: `Bearer ${user1Token}` }
    });
    assert(res.status === 200, `Expected 200, got ${res.status}`);
    assert(res.body.data.user.email === duplicateTestEmail.toLowerCase(), 'Returned email must match');
  });

  await testStep('POST /api/auth/logout successfully revokes active session', async () => {
    const res = await request('/api/auth/logout', {
      method: 'POST',
      headers: { Authorization: `Bearer ${user1Token}` }
    });
    assert(res.status === 200, `Expected 200, got ${res.status}`);
    assert(res.body.success === true, 'Logout response must indicate success');
  });

  await testStep('Revoked token is rejected on GET /api/auth/me with 401', async () => {
    const res = await request('/api/auth/me', {
      headers: { Authorization: `Bearer ${user1Token}` }
    });
    assert(res.status === 401, `Expected 401 after logout, got ${res.status}`);
    assert(res.body.error.includes('expired') || res.body.error.includes('signed out'), 'Error must specify session revocation/expiration');
  });

  await testStep('Revoked token is rejected on POST /api/deployments with 401', async () => {
    const res = await request('/api/deployments', {
      method: 'POST',
      headers: { Authorization: `Bearer ${user1Token}` },
      body: {
        organizationName: 'Post-Logout Corp',
        businessEmail: duplicateTestEmail
      }
    });
    assert(res.status === 401, `Expected 401 after logout, got ${res.status}`);
  });

  await testStep('Revoked token is rejected on GET /api/deployments with 401', async () => {
    const res = await request('/api/deployments', {
      headers: { Authorization: `Bearer ${user1Token}` }
    });
    assert(res.status === 401, `Expected 401 after logout, got ${res.status}`);
  });

  // Ensure clock ticks past 1 second boundary to obtain fresh distinct session token
  await sleep(1100);

  let activeToken;
  await testStep('POST /api/auth/login re-authenticates user with fresh distinct token', async () => {
    const res = await request('/api/auth/login', {
      method: 'POST',
      body: {
        email: duplicateTestEmail,
        password: 'SecureStoragePassword2026!'
      }
    });
    assert(res.status === 200, `Expected 200, got ${res.status}`);
    assert(res.body.data.token, 'Must return token');
    activeToken = res.body.data.token;
  });

  await testStep('New token works on GET /api/auth/me while revoked token STILL fails', async () => {
    // New token works
    const resNew = await request('/api/auth/me', {
      headers: { Authorization: `Bearer ${activeToken}` }
    });
    assert(resNew.status === 200, `Expected 200 for new token, got ${resNew.status}`);

    // Old token still rejected
    const resOld = await request('/api/auth/me', {
      headers: { Authorization: `Bearer ${user1Token}` }
    });
    assert(resOld.status === 401, `Expected 401 for old revoked token, got ${resOld.status}`);
  });

  // Adversarial Probe: Qualification Payload Validation
  await testStep('Adversarial probe: POST /api/deployments with invalid businessEmail format', async () => {
    const res = await request('/api/deployments', {
      method: 'POST',
      headers: { Authorization: `Bearer ${activeToken}` },
      body: {
        organizationName: 'Enterprise Fabric Corp',
        businessEmail: 'not-a-valid-email-format'
      }
    });
    if (res.status === 201) {
      throw new Error('VULNERABILITY: POST /api/deployments accepted malformed businessEmail ("not-a-valid-email-format") with HTTP 201 Created instead of rejecting with HTTP 400 Bad Request.');
    }
    assert(res.status === 400, `Expected 400, got ${res.status}`);
  });

  // =========================================================================
  // SECTION 5: High-Concurrency Qualification Race & Tracking Ref Entropy
  // =========================================================================
  console.log('\n--- SECTION 5: High-Concurrency Qualification Race & Tracking Ref Entropy ---');

  const CONCURRENCY_COUNT = 20;
  const concurrentResults = [];

  await testStep(`Generate ${CONCURRENCY_COUNT} concurrent qualification requests via Promise.all`, async () => {
    const today = new Date();
    const expectedDatePrefix = `${today.getUTCFullYear()}${String(today.getUTCMonth() + 1).padStart(2, '0')}${String(today.getUTCDate()).padStart(2, '0')}`;

    const promises = [];
    for (let i = 1; i <= CONCURRENCY_COUNT; i++) {
      const payload = {
        organizationName: `Enterprise SAN Fabric Node ${i}`,
        businessEmail: duplicateTestEmail,
        countryRegion: 'Global Storage Operations',
        departmentRole: `Lead Storage Engineer Node ${i}`,
        sanVendor: 'Multi-Vendor Fibre Channel Fabric',
        switchCount: `${10 * i}-${10 * i + 10} Switches`,
        fabricCount: '2 (Dual Fabric A/B)',
        deploymentModel: 'Virtual Appliance (VMware/KVM)',
        timeline: '1-3 Months',
        notes: `Automated stress harness benchmark test sequence id #${i} with high-frequency telemetry`
      };

      promises.push(
        request('/api/deployments', {
          method: 'POST',
          headers: { Authorization: `Bearer ${activeToken}` },
          body: payload
        }).then(res => ({ index: i, res, payload }))
      );
    }

    const settled = await Promise.all(promises);

    for (const item of settled) {
      assert(item.res.status === 201, `Request #${item.index} failed with status ${item.res.status}: ${JSON.stringify(item.res.body)}`);
      assert(item.res.body.success === true, `Request #${item.index} success was false`);
      const trackingRef = item.res.body.data.trackingRef;
      assert(trackingRef, `Request #${item.index} returned undefined trackingRef`);
      assert(TRACKING_REF_REGEX.test(trackingRef), `Tracking ref "${trackingRef}" does not match INF-REQ-YYYYMMDD-XXXX`);
      assert(trackingRef.includes(expectedDatePrefix), `Tracking ref "${trackingRef}" does not contain expected UTC date prefix "${expectedDatePrefix}"`);

      concurrentResults.push({
        index: item.index,
        trackingRef,
        payload: item.payload,
        createdAt: item.res.body.data.createdAt
      });
    }

    console.log(`\n    Successfully received ${concurrentResults.length} tracking references.`);
  });

  await testStep(`Verify ZERO collisions across all ${CONCURRENCY_COUNT} generated tracking references`, async () => {
    const refSet = new Set(concurrentResults.map(r => r.trackingRef));
    assert(refSet.size === CONCURRENCY_COUNT, `Collision detected! Expected ${CONCURRENCY_COUNT} unique references, got ${refSet.size}`);
    console.log(`    Unique count: ${refSet.size} / ${CONCURRENCY_COUNT} (0 collisions detected)`);
  });

  await testStep('Analyze entropy and character dispersion of tracking reference suffixes', async () => {
    const suffixes = concurrentResults.map(r => r.trackingRef.split('-')[3]);
    const { entropy, uniqueChars, totalChars } = calculateEntropy(suffixes);

    console.log(`    Suffix sample: ${suffixes.slice(0, 5).join(', ')} ...`);
    console.log(`    Total suffix characters: ${totalChars}, Unique glyphs: ${uniqueChars}`);
    console.log(`    Shannon Entropy: ${entropy.toFixed(3)} bits/char (theoretical max for 16-hex alphabet is 4.0 bits)`);
    assert(entropy > 2.0, `Entropy too low (${entropy.toFixed(3)} bits/char), suggests pseudo-random generator deficiency`);
  });

  // =========================================================================
  // SECTION 6: Database Persistence & Entity Integrity
  // =========================================================================
  console.log('\n--- SECTION 6: Database Persistence & Entity Integrity Verification ---');

  for (let idx = 0; idx < concurrentResults.length; idx++) {
    const item = concurrentResults[idx];
    await testStep(`Query GET /api/deployments/${item.trackingRef} and verify entity persistence [${idx + 1}/${CONCURRENCY_COUNT}]`, async () => {
      const res = await request(`/api/deployments/${item.trackingRef}`);
      assert(res.status === 200, `Expected 200, got ${res.status}`);
      assert(res.body.success === true, 'Success must be true');

      const reqData = res.body.data.request;
      assert(reqData.trackingRef === item.trackingRef, `Reference mismatch: ${reqData.trackingRef} vs ${item.trackingRef}`);
      assert(reqData.organizationName === item.payload.organizationName, `Org mismatch: ${reqData.organizationName} vs ${item.payload.organizationName}`);
      assert(reqData.switchCount === item.payload.switchCount, `Switch count mismatch: ${reqData.switchCount} vs ${item.payload.switchCount}`);
      assert(reqData.fabricCount === item.payload.fabricCount, `Fabric count mismatch: ${reqData.fabricCount} vs ${item.payload.fabricCount}`);
      assert(reqData.deploymentModel === item.payload.deploymentModel, `Deployment model mismatch`);
      assert(reqData.timeline === item.payload.timeline, `Timeline mismatch`);
      assert(reqData.status === 'PENDING_REVIEW', `Status must be PENDING_REVIEW, got ${reqData.status}`);
    });
  }

  await testStep('Query GET /api/deployments for authenticated user and verify all 20 records present', async () => {
    const res = await request('/api/deployments', {
      headers: { Authorization: `Bearer ${activeToken}` }
    });
    assert(res.status === 200, `Expected 200, got ${res.status}`);
    assert(Array.isArray(res.body.data.requests), 'Returned requests must be an array');

    const returnedRefs = new Set(res.body.data.requests.map(r => r.trackingRef));
    for (const item of concurrentResults) {
      assert(returnedRefs.has(item.trackingRef), `User deployments list missing tracking reference: ${item.trackingRef}`);
    }
    console.log(`    All ${concurrentResults.length} records verified present in user deployment list.`);
  });

  await testStep('Query non-existent tracking reference returns 404 Not Found', async () => {
    const bogusRef = 'INF-REQ-20261107-BOGUS';
    const res = await request(`/api/deployments/${bogusRef}`);
    assert(res.status === 404, `Expected 404, got ${res.status}`);
    assert(res.body.success === false, 'Body success must be false');
    assert(res.body.error.includes('not found'), 'Error message must specify not found');
  });

  // =========================================================================
  // SUMMARY
  // =========================================================================
  console.log('\n=============================================================================');
  console.log(`  ADVERSARIAL STRESS TEST SUMMARY`);
  console.log(`  Total Executed Tests: ${totalTests}`);
  console.log(`  Passed Tests:         ${passedTests}`);
  console.log(`  Failed Tests:         ${failedTests}`);
  console.log(`  Final Verdict:        ${failedTests === 0 ? 'APPROVE' : 'REQUEST_CHANGES'}`);
  console.log('=============================================================================\n');

  if (failedTests > 0) {
    console.error('Failure Details:');
    for (const f of failures) {
      console.error(`- ${f.name}: ${f.error}`);
    }
    process.exit(1);
  } else {
    process.exit(0);
  }
}

main().catch(err => {
  console.error('Fatal stress suite execution crash:', err);
  process.exit(1);
});
