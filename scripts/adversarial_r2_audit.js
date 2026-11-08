/**
 * Infrasights v2.10 - Requirement R2 Adversarial Empirical Test Suite
 * Exhaustively scans repository files and live HTTP runtime for:
 * 1. AI buzzwords (AI, ML, machine learning, neural, deep learning, LLM, artificial intelligence, copilot, predictive, etc.)
 * 2. Switch vendor brand/model names (Brocade, Cisco, MDS, SANnav, Fabric OS, FOS, NX-OS, X7, G620, 9710, 9148, Broadcom, etc.)
 * 3. Product naming consistency ("Infrasights", "Infrasights v2.10", and former name "InsightOps")
 * 4. Runtime API response bodies and HTTP network headers
 * 5. Static file leakage and backend exposure
 */

const fs = require('fs');
const path = require('path');
const http = require('http');

// Configuration
const BASE_URL = 'http://localhost:3000';
const ROOT_DIR = path.resolve(__dirname, '..');

// Regex Rules
const REGEX_AI = /\b(AI|ML|machine[\s-]*learning|neural|deep[\s-]*learning|LLM|LLMs|artificial[\s-]*intelligence|copilot|co-pilot|predictive|prediction|generative[\s-]*ai|genai|gpt|large[\s-]*language[\s-]*model)\b/i;
const REGEX_VENDOR = /\b(Brocade|Cisco|MDS|SANnav|Fabric[\s-]*OS|FOS|NX[\s-]*OS|X7|G620|G630|G610|9710|9148|9706|9718|9396|9250i|9132T|9124|Broadcom|DCX)\b/i;
const REGEX_LEGACY_NAME = /\bInsightOps\b/i;
const REGEX_INCONSISTENT_NAME = /\b(InfraSights|Infrasight(?!s)|Infrasights\s+2\.10\b|Infrasight\s+v2\.10\b)/;

// Categories for static scan
const EXCLUDE_DIRS = new Set([
  'node_modules',
  '.playwright-mcp',
  '.git',
  'playwright-report',
  'test-results'
]);

const results = {
  timestamp: new Date().toISOString(),
  staticScan: {
    totalFilesScanned: 0,
    categories: {
      frontend: { files: 0, violations: [] },
      backend: { files: 0, violations: [] },
      manifests_and_docs: { files: 0, violations: [] },
      e2e_tests: { files: 0, violations: [] },
      legacy_archive: { files: 0, violations: [] },
      teamwork_metadata: { files: 0, violations: [] },
      other: { files: 0, violations: [] }
    }
  },
  htmlDeepScan: {
    htmlCommentsViolations: [],
    hiddenInputsViolations: [],
    scriptTagsViolations: [],
    metaTagsViolations: [],
    attributeViolations: [],
    textNodesViolations: []
  },
  runtimeApiScan: {
    totalEndpointsTested: 0,
    headerViolations: [],
    bodyViolations: [],
    endpointResults: []
  },
  staticExposureLeakScan: {
    probes: []
  }
};

// Helper: Determine file category
function categorizeFile(relPath) {
  const norm = relPath.replace(/\\/g, '/');
  if (norm.startsWith('InsightOps---San-Path-Monitoring-for-DC-main/')) return 'legacy_archive';
  if (norm.startsWith('.agents/')) return 'teamwork_metadata';
  if (norm.startsWith('server/')) return 'backend';
  if (norm.startsWith('e2e/')) return 'e2e_tests';
  if (norm === 'index.html' || norm.startsWith('css/') || norm.startsWith('js/') || norm.startsWith('assets/')) return 'frontend';
  if (norm.endsWith('.md') || norm === 'package.json' || norm === 'package-lock.json' || norm.startsWith('.env')) return 'manifests_and_docs';
  return 'other';
}

// Helper: Scan text for matches
function checkContent(content, filePath, fileCategory) {
  const lines = content.split(/\r?\n/);
  const fileViolations = [];

  lines.forEach((line, idx) => {
    const lineNum = idx + 1;

    // 1. AI Buzzwords
    const matchAi = line.match(REGEX_AI);
    if (matchAi) {
      // In CSS, exclude 'ml-1', 'ml-2' or units
      const word = matchAi[0];
      const isCssMargin = fileCategory === 'frontend' && filePath.endsWith('.css') && /ml-\d+/.test(line);
      if (!isCssMargin) {
        fileViolations.push({
          type: 'AI_BUZZWORD',
          keyword: word,
          line: lineNum,
          snippet: line.trim().substring(0, 160)
        });
      }
    }

    // 2. Vendor Brands/Models
    const matchVendor = line.match(REGEX_VENDOR);
    if (matchVendor) {
      fileViolations.push({
        type: 'SWITCH_VENDOR',
        keyword: matchVendor[0],
        line: lineNum,
        snippet: line.trim().substring(0, 160)
      });
    }

    // 3. Product Naming
    const matchLegacy = line.match(REGEX_LEGACY_NAME);
    if (matchLegacy) {
      // Check if it is the explicitly allowed legacy reference: "Formerly known as InsightOps."
      const isAllowedMigrationRef = /Formerly known as InsightOps/i.test(line) || /legacy-name migration/i.test(line) || /former name/i.test(line);
      fileViolations.push({
        type: 'LEGACY_NAME',
        keyword: matchLegacy[0],
        line: lineNum,
        snippet: line.trim().substring(0, 160),
        allowedMigrationRef: isAllowedMigrationRef
      });
    }

    const matchInconsistent = line.match(REGEX_INCONSISTENT_NAME);
    if (matchInconsistent) {
      fileViolations.push({
        type: 'INCONSISTENT_PRODUCT_NAME',
        keyword: matchInconsistent[0],
        line: lineNum,
        snippet: line.trim().substring(0, 160)
      });
    }
  });

  return fileViolations;
}

// 1. Recursive Static Scan
function scanDirectory(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    if (entry.isDirectory()) {
      if (!EXCLUDE_DIRS.has(entry.name)) {
        scanDirectory(path.join(dir, entry.name));
      }
    } else if (entry.isFile()) {
      const fullPath = path.join(dir, entry.name);
      const relPath = path.relative(ROOT_DIR, fullPath);
      const category = categorizeFile(relPath);

      // Skip binary files
      const ext = path.extname(entry.name).toLowerCase();
      const binaryExts = ['.png', '.jpg', '.jpeg', '.gif', '.ico', '.pdf', '.zip', '.tar', '.gz'];
      if (binaryExts.includes(ext)) {
        continue;
      }

      try {
        const content = fs.readFileSync(fullPath, 'utf8');
        results.staticScan.totalFilesScanned++;
        results.staticScan.categories[category].files++;

        const violations = checkContent(content, relPath, category);
        if (violations.length > 0) {
          results.staticScan.categories[category].violations.push({
            file: relPath,
            violations
          });
        }
      } catch (err) {
        // Skip unreadable files
      }
    }
  }
}

// 2. HTML Deep Scan for index.html
function deepScanHtml() {
  const htmlPath = path.join(ROOT_DIR, 'index.html');
  if (!fs.existsSync(htmlPath)) return;
  const content = fs.readFileSync(htmlPath, 'utf8');

  // A. Comments <!-- ... -->
  const commentRegex = /<!--([\s\S]*?)-->/g;
  let match;
  while ((match = commentRegex.exec(content)) !== null) {
    const commentText = match[1];
    const aiMatch = commentText.match(REGEX_AI);
    const vendorMatch = commentText.match(REGEX_VENDOR);
    const legacyMatch = commentText.match(REGEX_LEGACY_NAME);
    if (aiMatch || vendorMatch || (legacyMatch && !/Formerly known as InsightOps/i.test(commentText))) {
      results.htmlDeepScan.htmlCommentsViolations.push({
        snippet: commentText.trim().substring(0, 200),
        ai: aiMatch ? aiMatch[0] : null,
        vendor: vendorMatch ? vendorMatch[0] : null,
        legacy: legacyMatch ? legacyMatch[0] : null
      });
    }
  }

  // B. Hidden inputs
  const hiddenInputRegex = /<input[^>]*type=["']hidden["'][^>]*>/gi;
  while ((match = hiddenInputRegex.exec(content)) !== null) {
    const tag = match[0];
    const aiMatch = tag.match(REGEX_AI);
    const vendorMatch = tag.match(REGEX_VENDOR);
    if (aiMatch || vendorMatch) {
      results.htmlDeepScan.hiddenInputsViolations.push({
        tag,
        ai: aiMatch ? aiMatch[0] : null,
        vendor: vendorMatch ? vendorMatch[0] : null
      });
    }
  }

  // C. Script tags
  const scriptRegex = /<script\b[^>]*>([\s\S]*?)<\/script>/gi;
  while ((match = scriptRegex.exec(content)) !== null) {
    const scriptBody = match[1];
    if (scriptBody && scriptBody.trim().length > 0) {
      const aiMatch = scriptBody.match(REGEX_AI);
      const vendorMatch = scriptBody.match(REGEX_VENDOR);
      if (aiMatch || vendorMatch) {
        results.htmlDeepScan.scriptTagsViolations.push({
          snippet: scriptBody.trim().substring(0, 150),
          ai: aiMatch ? aiMatch[0] : null,
          vendor: vendorMatch ? vendorMatch[0] : null
        });
      }
    }
  }

  // D. Meta tags
  const metaRegex = /<meta\b[^>]*>/gi;
  while ((match = metaRegex.exec(content)) !== null) {
    const metaTag = match[0];
    const aiMatch = metaTag.match(REGEX_AI);
    const vendorMatch = metaTag.match(REGEX_VENDOR);
    if (aiMatch || vendorMatch) {
      results.htmlDeepScan.metaTagsViolations.push({
        tag: metaTag,
        ai: aiMatch ? aiMatch[0] : null,
        vendor: vendorMatch ? vendorMatch[0] : null
      });
    }
  }

  // E. Attributes (aria-label, placeholder, title, value)
  const attrRegex = /\b(placeholder|title|aria-label|value)=["']([^"']+)["']/gi;
  while ((match = attrRegex.exec(content)) !== null) {
    const attrName = match[1];
    const attrVal = match[2];
    const aiMatch = attrVal.match(REGEX_AI);
    const vendorMatch = attrVal.match(REGEX_VENDOR);
    if (aiMatch || vendorMatch) {
      results.htmlDeepScan.attributeViolations.push({
        attr: attrName,
        value: attrVal,
        ai: aiMatch ? aiMatch[0] : null,
        vendor: vendorMatch ? vendorMatch[0] : null
      });
    }
  }
}

// 3. HTTP Client Helper
function makeRequest(method, urlPath, headers = {}, postData = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(urlPath, BASE_URL);
    const reqOptions = {
      method,
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      headers: { ...headers }
    };

    if (postData) {
      const bodyStr = typeof postData === 'string' ? postData : JSON.stringify(postData);
      if (!reqOptions.headers['Content-Type']) {
        reqOptions.headers['Content-Type'] = 'application/json';
      }
      reqOptions.headers['Content-Length'] = Buffer.byteLength(bodyStr);
    }

    const req = http.request(reqOptions, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          body: data
        });
      });
    });

    req.on('error', (err) => reject(err));

    if (postData) {
      req.write(typeof postData === 'string' ? postData : JSON.stringify(postData));
    }
    req.end();
  });
}

// 4. Runtime API & Headers Inspection
async function runRuntimeApiScan() {
  console.log('[Adversarial Scanner] Starting runtime API and header scan...');

  // Setup test user
  const uniqueId = Date.now();
  const testUser = {
    fullName: 'Empirical Tester',
    email: `adversary.${uniqueId}@enterprise-test.internal`,
    organization: 'Adversary Quality Group',
    departmentRole: 'Verification Lead',
    password: 'SecurePassword2026!'
  };

  let authToken = null;
  let testTrackingRef = null;

  const testCalls = [
    // Health probe
    { name: 'GET /api/health', method: 'GET', path: '/api/health' },

    // Registration valid
    {
      name: 'POST /api/auth/register (Success)',
      method: 'POST',
      path: '/api/auth/register',
      data: testUser,
      extract: (res) => {
        try {
          const json = JSON.parse(res.body);
          authToken = json.data?.token;
        } catch {}
      }
    },

    // Registration duplicate
    {
      name: 'POST /api/auth/register (Duplicate)',
      method: 'POST',
      path: '/api/auth/register',
      data: testUser
    },

    // Registration invalid
    {
      name: 'POST /api/auth/register (Validation Error)',
      method: 'POST',
      path: '/api/auth/register',
      data: { email: 'bad-email' }
    },

    // Login valid
    {
      name: 'POST /api/auth/login (Success)',
      method: 'POST',
      path: '/api/auth/login',
      data: { email: testUser.email, password: testUser.password },
      extract: (res) => {
        try {
          const json = JSON.parse(res.body);
          if (!authToken) authToken = json.data?.token;
        } catch {}
      }
    },

    // Login invalid
    {
      name: 'POST /api/auth/login (Bad Credentials)',
      method: 'POST',
      path: '/api/auth/login',
      data: { email: testUser.email, password: 'WrongPassword999!' }
    },

    // Session Me (Authenticated)
    {
      name: 'GET /api/auth/me (Authenticated)',
      method: 'GET',
      path: '/api/auth/me',
      getHeaders: () => ({ Authorization: `Bearer ${authToken}` })
    },

    // Session Me (Unauthenticated)
    {
      name: 'GET /api/auth/me (Unauthenticated)',
      method: 'GET',
      path: '/api/auth/me'
    },

    // Password reset (Existing)
    {
      name: 'POST /api/auth/forgot-password (Existing User)',
      method: 'POST',
      path: '/api/auth/forgot-password',
      data: { email: testUser.email }
    },

    // Password reset (Non-existing)
    {
      name: 'POST /api/auth/forgot-password (Unknown User)',
      method: 'POST',
      path: '/api/auth/forgot-password',
      data: { email: 'ghost.user@doesnotexist.void' }
    },

    // Create deployment (Authenticated)
    {
      name: 'POST /api/deployments (Authenticated Valid)',
      method: 'POST',
      path: '/api/deployments',
      getHeaders: () => ({ Authorization: `Bearer ${authToken}` }),
      data: {
        organizationName: 'Enterprise Storage Core',
        businessEmail: testUser.email,
        countryRegion: 'United States',
        departmentRole: 'SAN Infrastructure',
        sanVendor: 'Heterogeneous Multi-Vendor Fabric',
        switchCount: '11-30 Switches',
        fabricCount: 'Dual Fabric (Fabric A / Fabric B)',
        deploymentModel: 'Virtual Appliance (VMware / KVM)',
        timeline: 'Immediate (1-3 months)',
        notes: 'Deterministic hardware telemetry collection directly from switches.'
      },
      extract: (res) => {
        try {
          const json = JSON.parse(res.body);
          testTrackingRef = json.data?.trackingRef;
        } catch {}
      }
    },

    // Create deployment (Unauthenticated)
    {
      name: 'POST /api/deployments (Unauthenticated)',
      method: 'POST',
      path: '/api/deployments',
      data: { organizationName: 'Hack Attempt' }
    },

    // Create deployment (Validation Error)
    {
      name: 'POST /api/deployments (Validation Failure)',
      method: 'POST',
      path: '/api/deployments',
      getHeaders: () => ({ Authorization: `Bearer ${authToken}` }),
      data: { organizationName: '' }
    },

    // List deployments (Authenticated)
    {
      name: 'GET /api/deployments (Authenticated)',
      method: 'GET',
      path: '/api/deployments',
      getHeaders: () => ({ Authorization: `Bearer ${authToken}` })
    },

    // List deployments (Unauthenticated)
    {
      name: 'GET /api/deployments (Unauthenticated)',
      method: 'GET',
      path: '/api/deployments'
    },

    // Single deployment by ref
    {
      name: 'GET /api/deployments/:ref (Valid Ref)',
      method: 'GET',
      getPath: () => testTrackingRef ? `/api/deployments/${testTrackingRef}` : '/api/deployments/INF-FALLBACK',
      getHeaders: () => ({ Authorization: `Bearer ${authToken}` })
    },

    // Single deployment by 404 ref
    {
      name: 'GET /api/deployments/INF-NONEXISTENT (404 Ref)',
      method: 'GET',
      path: '/api/deployments/INF-REQ-99999999-VOID',
      getHeaders: () => ({ Authorization: `Bearer ${authToken}` })
    },

    // 404 API Route
    {
      name: 'GET /api/unsupported-endpoint (Route 404)',
      method: 'GET',
      path: '/api/unsupported-endpoint'
    },

    // Logout
    {
      name: 'POST /api/auth/logout (Authenticated)',
      method: 'POST',
      path: '/api/auth/logout',
      getHeaders: () => ({ Authorization: `Bearer ${authToken}` })
    },

    // Static Assets
    { name: 'GET / (Landing HTML)', method: 'GET', path: '/' },
    { name: 'GET /css/styles.css', method: 'GET', path: '/css/styles.css' },
    { name: 'GET /js/app.js', method: 'GET', path: '/js/app.js' },
    { name: 'GET /js/canvas.js', method: 'GET', path: '/js/canvas.js' }
  ];

  for (const call of testCalls) {
    const callPath = call.getPath ? call.getPath() : call.path;
    const callHeaders = call.getHeaders ? call.getHeaders() : {};

    try {
      const res = await makeRequest(call.method, callPath, callHeaders, call.data);
      if (call.extract) call.extract(res);

      results.runtimeApiScan.totalEndpointsTested++;

      // Check Headers for Violations
      const headerKeys = Object.keys(res.headers);
      for (const hKey of headerKeys) {
        const hVal = String(res.headers[hKey]);
        const aiMatch = hVal.match(REGEX_AI);
        const vendorMatch = hVal.match(REGEX_VENDOR);
        if (aiMatch || vendorMatch) {
          results.runtimeApiScan.headerViolations.push({
            endpoint: `${call.method} ${callPath}`,
            header: `${hKey}: ${hVal}`,
            ai: aiMatch ? aiMatch[0] : null,
            vendor: vendorMatch ? vendorMatch[0] : null
          });
        }
      }

      // Check Body for Violations
      const bodyAi = res.body.match(REGEX_AI);
      const bodyVendor = res.body.match(REGEX_VENDOR);
      const bodyLegacy = res.body.match(REGEX_LEGACY_NAME);
      const isAllowedMigrationRef = res.body.includes('Formerly known as InsightOps');

      const endpointResult = {
        name: call.name,
        endpoint: `${call.method} ${callPath}`,
        status: res.statusCode,
        bodyViolations: []
      };

      if (bodyAi) {
        endpointResult.bodyViolations.push({ type: 'AI_BUZZWORD', match: bodyAi[0] });
        results.runtimeApiScan.bodyViolations.push({
          endpoint: `${call.method} ${callPath}`,
          type: 'AI_BUZZWORD',
          match: bodyAi[0],
          bodySnippet: res.body.substring(0, 200)
        });
      }

      if (bodyVendor) {
        endpointResult.bodyViolations.push({ type: 'SWITCH_VENDOR', match: bodyVendor[0] });
        results.runtimeApiScan.bodyViolations.push({
          endpoint: `${call.method} ${callPath}`,
          type: 'SWITCH_VENDOR',
          match: bodyVendor[0],
          bodySnippet: res.body.substring(0, 200)
        });
      }

      if (bodyLegacy && !isAllowedMigrationRef) {
        endpointResult.bodyViolations.push({ type: 'LEGACY_NAME', match: bodyLegacy[0] });
        results.runtimeApiScan.bodyViolations.push({
          endpoint: `${call.method} ${callPath}`,
          type: 'LEGACY_NAME',
          match: bodyLegacy[0],
          bodySnippet: res.body.substring(0, 200)
        });
      }

      results.runtimeApiScan.endpointResults.push(endpointResult);
    } catch (err) {
      results.runtimeApiScan.endpointResults.push({
        name: call.name,
        endpoint: `${call.method} ${callPath}`,
        status: 'ERROR',
        error: err.message
      });
    }
  }
}

// 5. Static Exposure Security Probes
async function runExposureProbes() {
  console.log('[Adversarial Scanner] Probing static file exposure and leakage paths...');

  const probePaths = [
    { path: '/InsightOps---San-Path-Monitoring-for-DC-main/README.md', desc: 'Legacy source archive README' },
    { path: '/InsightOps---San-Path-Monitoring-for-DC-main/backend/collector.py', desc: 'Legacy backend python script' },
    { path: '/Infrasights_Marketing_Website_Brief_and_AI_Prompt.md', desc: 'Confidential prompt & marketing brief' },
    { path: '/server/config/database.js', desc: 'Backend DB pool source code with credentials' },
    { path: '/server/controllers/authController.js', desc: 'Backend auth controller source code' },
    { path: '/server/db/migrations.sql', desc: 'Raw Transact-SQL schema DDL' },
    { path: '/package.json', desc: 'Node package manifest' },
    { path: '/.agents/teamwork/ORIGINAL_REQUEST.md', desc: 'Teamwork confidential prompt' },
    { path: '/.env.example', desc: 'Environment configuration example' }
  ];

  for (const probe of probePaths) {
    try {
      const res = await makeRequest('GET', probe.path);
      const isExposed = res.statusCode === 200;
      const snippet = isExposed ? res.body.substring(0, 100).replace(/\r?\n/g, ' ') : '';
      const containsVendor = isExposed ? REGEX_VENDOR.test(res.body) : false;
      const containsAi = isExposed ? REGEX_AI.test(res.body) : false;

      results.staticExposureLeakScan.probes.push({
        path: probe.path,
        description: probe.desc,
        statusCode: res.statusCode,
        isExposed,
        containsVendor,
        containsAi,
        snippet
      });
    } catch (err) {
      results.staticExposureLeakScan.probes.push({
        path: probe.path,
        description: probe.desc,
        statusCode: 'ERROR',
        error: err.message
      });
    }
  }
}

// Main Execution
async function main() {
  console.log('===============================================================');
  console.log(' INFRASIGHTS v2.10 — ADVERSARIAL R2 GUARDRAIL VERIFICATION     ');
  console.log('===============================================================');

  // Step 1: Scan all files
  console.log('[1/4] Scanning static repository files...');
  scanDirectory(ROOT_DIR);
  console.log(`Scanned ${results.staticScan.totalFilesScanned} total files.`);

  // Step 2: Deep scan HTML
  console.log('[2/4] Executing deep HTML structure & comments scan...');
  deepScanHtml();

  // Step 3: Runtime API Scan
  console.log('[3/4] Executing runtime API and HTTP header audit...');
  await runRuntimeApiScan();

  // Step 4: Static Exposure Probes
  console.log('[4/4] Executing static exposure leakage probes...');
  await runExposureProbes();

  // Write results JSON to scripts/adversarial_results.json
  const outputPath = path.join(__dirname, 'adversarial_results.json');
  fs.writeFileSync(outputPath, JSON.stringify(results, null, 2), 'utf8');
  console.log(`[Adversarial Scanner] Full empirical results written to ${outputPath}`);

  // Summary printout
  console.log('\n================== EMPIRICAL SUMMARY ==================');
  console.log(`Frontend Files Scanned: ${results.staticScan.categories.frontend.files}`);
  console.log(`Frontend Violations:    ${results.staticScan.categories.frontend.violations.length}`);
  console.log(`Backend Files Scanned:  ${results.staticScan.categories.backend.files}`);
  console.log(`Backend Violations:     ${results.staticScan.categories.backend.violations.length}`);
  console.log(`HTML Comments Violations: ${results.htmlDeepScan.htmlCommentsViolations.length}`);
  console.log(`Hidden Inputs Violations: ${results.htmlDeepScan.hiddenInputsViolations.length}`);
  console.log(`Runtime API Endpoints:  ${results.runtimeApiScan.totalEndpointsTested}`);
  console.log(`Runtime Header Leaks:   ${results.runtimeApiScan.headerViolations.length}`);
  console.log(`Runtime Body Leaks:     ${results.runtimeApiScan.bodyViolations.length}`);
  
  const exposedProbes = results.staticExposureLeakScan.probes.filter(p => p.isExposed);
  console.log(`Exposed Backend/Archive Probes: ${exposedProbes.length} / ${results.staticExposureLeakScan.probes.length}`);
  console.log('=======================================================\n');
}

main().catch(err => {
  console.error('Fatal execution error:', err);
  process.exit(1);
});
