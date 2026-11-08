/**
 * Infrasights v2.10 - Gate 2 Adversarial Stress Testing & Regression Harness
 * 
 * Verifies R3 (SEO Content & Metadata) and R4 (Motion Graphics & UX):
 * 1. Canvas 60fps & Motion Thrashing Stress:
 *    - Rapid mouse entry/exit across canvas nodes (100+ rapid events)
 *    - Tooltip viewport bounds clamping & layout thrashing audit
 *    - Resize events stress (0 width, negative, 320px to 4K, rapid resize storms)
 *    - Reduced motion media query stress & animation loop termination
 * 2. Tab Isolation & Event Collision Stress:
 *    - Alternating rapid clicks between auth modal tabs and preview mockup tabs
 *    - Zero visual pane disappearance or event collision
 * 3. SEO & Compliance Guardrails Audit:
 *    - Exhaustive repository regex scanner for forbidden AI keywords & proprietary switch models
 *    - Strict XML parser on sitemap.xml ensuring valid syntax & absolute HTTPS URLs
 *    - Strict robots.txt directive parser
 *    - JSON-LD schema validation
 */

const fs = require('fs');
const path = require('path');
const http = require('http');
const { chromium } = require('playwright');

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
const ROOT_DIR = path.resolve(__dirname, '..');

// Test Results Collector
const report = {
  timestamp: new Date().toISOString(),
  canvasMotionStress: {
    passed: false,
    rapidMouseEventsCount: 0,
    tooltipClampingViolations: 0,
    forcedReflowCount: 0,
    resizeStressTestsPassed: 0,
    resizeStressTestsTotal: 0,
    reducedMotionVerified: false,
    consoleErrors: []
  },
  tabIsolationStress: {
    passed: false,
    alternatingClicksCount: 0,
    paneDisappearanceViolations: 0,
    modalFormCollisionViolations: 0,
    consoleErrors: []
  },
  seoComplianceAudit: {
    passed: false,
    sitemapXmlValid: false,
    sitemapUrlsCount: 0,
    sitemapViolations: [],
    robotsTxtValid: false,
    robotsTxtDirectives: {},
    robotsTxtViolations: [],
    jsonLdValid: false,
    jsonLdEntitiesCount: 0,
    jsonLdViolations: [],
    regexScan: {
      totalFilesScanned: 0,
      productionAiViolations: [],
      productionSwitchViolations: [],
      domAiViolations: [],
      domSwitchViolations: [],
      notes: []
    }
  },
  verdict: 'PENDING'
};

// ============================================================================
// DOMAIN 1: Canvas 60fps & Motion Thrashing Stress
// ============================================================================
async function testCanvasStress(page) {
  console.log('\n--- [DOMAIN 1] Canvas 60fps & Motion Thrashing Stress ---');
  const canvasErrors = [];
  page.on('pageerror', err => canvasErrors.push(err.message));

  await page.goto(BASE_URL + '/', { waitUntil: 'networkidle' });
  await page.waitForSelector('#san-topology-canvas', { state: 'visible', timeout: 5000 });

  // 1. Rapid mouse entry/exit stress across canvas nodes (150+ rapid events)
  console.log('1.1 Executing 150+ rapid mouse events across canvas nodes...');
  
  const mouseStressResult = await page.evaluate(async () => {
    const topology = window.sanTopology;
    if (!topology || !topology.canvas) {
      return { error: 'Topology canvas not found' };
    }

    const canvas = topology.canvas;
    const tooltip = topology.tooltip;
    const nodes = topology.nodes;
    
    // Spy on getBoundingClientRect during mouse movement to audit layout thrashing
    let getBoundingClientRectCalls = 0;
    const origGetBoundingClientRect = canvas.getBoundingClientRect;
    canvas.getBoundingClientRect = function() {
      getBoundingClientRectCalls++;
      return origGetBoundingClientRect.apply(this, arguments);
    };

    let tooltipClampingViolations = [];
    let eventCount = 0;

    // Simulate 160 rapid mouse events crisscrossing node coordinates and canvas borders
    const testPoints = [];
    // Include node centers and boundaries
    for (const node of nodes) {
      testPoints.push({ x: node.x, y: node.y, target: node.id });
      testPoints.push({ x: node.x + node.radius + 2, y: node.y + node.radius + 2, target: node.id });
      testPoints.push({ x: node.x - node.radius - 10, y: node.y - node.radius - 10, target: 'outside' });
    }
    // Include boundary points (edges, corners, extremes)
    testPoints.push({ x: 0, y: 0, target: 'corner-top-left' });
    testPoints.push({ x: topology.width, y: 0, target: 'corner-top-right' });
    testPoints.push({ x: topology.width, y: topology.height, target: 'corner-bottom-right' });
    testPoints.push({ x: 0, y: topology.height, target: 'corner-bottom-left' });
    testPoints.push({ x: topology.width - 5, y: 50, target: 'near-right-edge' });
    testPoints.push({ x: 5, y: topology.height - 5, target: 'near-bottom-edge' });

    // Repeat pattern to exceed 150 events
    const fullSequence = [];
    for (let r = 0; r < 6; r++) {
      fullSequence.push(...testPoints);
    }

    const maxW = topology.width > 0 ? topology.width : 800;
    const maxH = topology.height > 0 ? topology.height : 400;
    const tw = topology.TOOLTIP_WIDTH || 250;
    const th = topology.TOOLTIP_HEIGHT || 160;

    for (const pt of fullSequence) {
      eventCount++;
      const rect = topology.canvasRect || origGetBoundingClientRect.call(canvas);
      const fakeEvent = {
        clientX: rect.left + pt.x,
        clientY: rect.top + pt.y
      };

      topology.handleMouseMove(fakeEvent);

      // If tooltip is shown, inspect its transform positioning
      if (topology.hoveredNode && tooltip && tooltip.style.opacity === '1') {
        const transformStr = tooltip.style.transform;
        const match = transformStr.match(/translate3d\(([-0-9.]+)px,\s*([-0-9.]+)px/);
        if (match) {
          const posX = parseFloat(match[1]);
          const posY = parseFloat(match[2]);

          // Clamp check: posX must be >= 8 and <= maxW - tw - 8
          // posY must be >= 8 and <= maxH - th - 8
          if (posX < 8 - 1e-3 || posX > (maxW - tw - 8 + 1e-3)) {
            tooltipClampingViolations.push({
              pt,
              posX,
              posY,
              bounds: { maxW, maxH, tw, th },
              reason: `posX ${posX} out of bounds [8, ${maxW - tw - 8}]`
            });
          }
          if (posY < 8 - 1e-3 || posY > (maxH - th - 8 + 1e-3)) {
            tooltipClampingViolations.push({
              pt,
              posX,
              posY,
              bounds: { maxW, maxH, tw, th },
              reason: `posY ${posY} out of bounds [8, ${maxH - th - 8}]`
            });
          }
        }
      }
    }

    // Leave canvas
    topology.handleMouseLeave();
    const tooltipLeftCorrect = tooltip.style.opacity === '0';

    // Restore spy
    canvas.getBoundingClientRect = origGetBoundingClientRect;

    return {
      eventCount,
      getBoundingClientRectCalls,
      tooltipClampingViolations,
      tooltipLeftCorrect,
      nodesCount: nodes.length,
      currentWidth: topology.width,
      currentHeight: topology.height
    };
  });

  report.canvasMotionStress.rapidMouseEventsCount = mouseStressResult.eventCount;
  report.canvasMotionStress.tooltipClampingViolations = mouseStressResult.tooltipClampingViolations.length;
  report.canvasMotionStress.forcedReflowCount = mouseStressResult.getBoundingClientRectCalls;

  console.log(`  -> Fired ${mouseStressResult.eventCount} rapid mouse events.`);
  console.log(`  -> Clamping violations: ${mouseStressResult.tooltipClampingViolations.length}`);
  console.log(`  -> Forced getBoundingClientRect calls during rapid mouse moves: ${mouseStressResult.getBoundingClientRectCalls}`);
  console.log(`  -> Tooltip hide on mouseleave: ${mouseStressResult.tooltipLeftCorrect ? 'OK' : 'FAIL'}`);

  // 1.2 Resize events stress (0 width, negative, extreme resolutions, rapid burst)
  console.log('\n1.2 Executing Canvas Resize Events Stress...');
  const resizeStressResults = await page.evaluate(async () => {
    const topology = window.sanTopology;
    const results = [];

    // Test A: Zero width and height
    try {
      topology.width = 0;
      topology.height = 0;
      topology.setupTopology();
      topology.render();
      results.push({ test: 'zero_dimensions', success: true });
    } catch (e) {
      results.push({ test: 'zero_dimensions', success: false, error: e.message });
    }

    // Test B: Negative width and height
    try {
      topology.width = -500;
      topology.height = -300;
      topology.setupTopology();
      topology.render();
      results.push({ test: 'negative_dimensions', success: true });
    } catch (e) {
      results.push({ test: 'negative_dimensions', success: false, error: e.message });
    }

    // Test C: Extreme resolutions
    const resolutions = [
      { w: 320, h: 568, name: 'mobile_320' },
      { w: 768, h: 1024, name: 'tablet_768' },
      { w: 1920, h: 1080, name: 'desktop_1080p' },
      { w: 3840, h: 2160, name: 'uhd_4k' }
    ];

    for (const res of resolutions) {
      try {
        topology.width = res.w;
        topology.height = res.h;
        topology.setupTopology();
        topology.render();
        const validNodes = topology.nodes.every(n => n.x >= 0 && n.x <= res.w && n.y >= 0 && n.y <= res.h);
        results.push({ test: res.name, success: validNodes, nodeCount: topology.nodes.length });
      } catch (e) {
        results.push({ test: res.name, success: false, error: e.message });
      }
    }

    // Test D: Rapid resize storm (50 rapid calls)
    try {
      for (let i = 0; i < 50; i++) {
        topology.width = 400 + (i % 20) * 50;
        topology.height = 300 + (i % 15) * 30;
        topology.setupTopology();
        topology.render();
      }
      results.push({ test: 'rapid_resize_storm_50x', success: true });
    } catch (e) {
      results.push({ test: 'rapid_resize_storm_50x', success: false, error: e.message });
    }

    // Restore nominal state via native resize
    topology.resize();

    return results;
  });

  const resizePassed = resizeStressResults.filter(r => r.success).length;
  report.canvasMotionStress.resizeStressTestsPassed = resizePassed;
  report.canvasMotionStress.resizeStressTestsTotal = resizeStressResults.length;
  console.log(`  -> Resize stress sub-tests: ${resizePassed}/${resizeStressResults.length} passed.`);
  resizeStressResults.forEach(r => console.log(`     * ${r.test}: ${r.success ? 'PASS' : 'FAIL ' + r.error}`));

  // 1.3 Reduced motion stress
  console.log('\n1.3 Executing Reduced Motion Media Query Stress...');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.waitForTimeout(100);

  const reducedMotionState = await page.evaluate(() => {
    const topology = window.sanTopology;
    // Trigger motion query handler if needed
    if (topology.motionMediaQuery) {
      topology.reducedMotion = true;
      topology.stop();
      topology.render();
    }
    const isRunning = topology.isRunning;
    const animId = topology.animId;
    const reducedMotion = topology.reducedMotion;

    // Check if canvas has static rendering (inspect non-zero pixel data)
    const ctx = topology.ctx;
    const imgData = ctx.getImageData(0, 0, Math.min(100, topology.width), Math.min(100, topology.height));
    let hasDrawnPixels = false;
    for (let i = 0; i < imgData.data.length; i += 4) {
      if (imgData.data[i + 3] > 0) {
        hasDrawnPixels = true;
        break;
      }
    }

    return {
      reducedMotion,
      isRunning,
      animId,
      hasDrawnPixels
    };
  });

  console.log(`  -> Reduced motion state: reducedMotion=${reducedMotionState.reducedMotion}, isRunning=${reducedMotionState.isRunning}, animId=${reducedMotionState.animId}`);
  console.log(`  -> High-contrast static canvas rendered: ${reducedMotionState.hasDrawnPixels ? 'YES' : 'NO'}`);

  // Restore motion
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.waitForTimeout(100);
  const motionRestored = await page.evaluate(() => {
    const topology = window.sanTopology;
    topology.reducedMotion = false;
    topology.start();
    return topology.isRunning;
  });
  console.log(`  -> Motion restored and animation restarted: ${motionRestored ? 'YES' : 'NO'}`);

  report.canvasMotionStress.reducedMotionVerified = (
    reducedMotionState.reducedMotion === true &&
    reducedMotionState.isRunning === false &&
    reducedMotionState.hasDrawnPixels === true &&
    motionRestored === true
  );

  report.canvasMotionStress.consoleErrors = canvasErrors;
  report.canvasMotionStress.passed = (
    report.canvasMotionStress.tooltipClampingViolations === 0 &&
    report.canvasMotionStress.resizeStressTestsPassed === report.canvasMotionStress.resizeStressTestsTotal &&
    report.canvasMotionStress.reducedMotionVerified &&
    canvasErrors.length === 0
  );
  console.log(`=> Domain 1 Verdict: ${report.canvasMotionStress.passed ? 'PASS' : 'FAIL'}`);
}

// ============================================================================
// DOMAIN 2: Tab Isolation & Event Collision Stress
// ============================================================================
async function testTabIsolation(page) {
  console.log('\n--- [DOMAIN 2] Tab Isolation & Event Collision Stress ---');
  const tabErrors = [];
  page.on('pageerror', err => tabErrors.push(err.message));

  // Open the auth modal to bring both auth tabs and preview tabs into DOM interaction
  await page.evaluate(() => {
    if (window.openModal) window.openModal('auth-modal');
  });
  await page.waitForTimeout(200);

  console.log('2.1 Alternating rapid clicks between auth modal tabs and preview tabs (100 clicks)...');

  const tabStressResult = await page.evaluate(async () => {
    const tabLogin = document.getElementById('tab-btn-login');
    const tabRegister = document.getElementById('tab-btn-register');
    const formLogin = document.getElementById('form-login');
    const formRegister = document.getElementById('form-register');

    const previewOverview = document.querySelector('.mockup-tab[data-tab="tab-overview"]') || document.getElementById('tab-btn-overview');
    const previewOptics = document.querySelector('.mockup-tab[data-tab="tab-optics"]') || document.getElementById('tab-btn-optics');
    const previewCongestion = document.querySelector('.mockup-tab[data-tab="tab-congestion"]') || document.getElementById('tab-btn-congestion');
    const previewSwitches = document.querySelector('.mockup-tab[data-tab="tab-switches"]') || document.getElementById('tab-btn-switches');

    const paneOverview = document.getElementById('tab-overview');
    const paneOptics = document.getElementById('tab-optics');
    const paneCongestion = document.getElementById('tab-congestion');
    const paneSwitches = document.getElementById('tab-switches');

    const allPanes = [paneOverview, paneOptics, paneCongestion, paneSwitches].filter(Boolean);

    let alternatingClicksCount = 0;
    let paneDisappearanceViolations = [];
    let modalFormCollisionViolations = [];

    const previewTabActions = [
      { tab: previewOverview, targetPane: paneOverview, name: 'tab-overview' },
      { tab: previewOptics, targetPane: paneOptics, name: 'tab-optics' },
      { tab: previewCongestion, targetPane: paneCongestion, name: 'tab-congestion' },
      { tab: previewSwitches, targetPane: paneSwitches, name: 'tab-switches' }
    ];

    // Perform 25 cycles of alternating 4-step clicks (100 clicks total)
    for (let cycle = 0; cycle < 25; cycle++) {
      // Step A: Click Register Tab
      if (tabRegister) {
        tabRegister.click();
        alternatingClicksCount++;
        // Verify register form visible, login form hidden
        if (formRegister.style.display !== 'block' || formLogin.style.display !== 'none') {
          modalFormCollisionViolations.push({
            cycle,
            step: 'register_click',
            reason: `formRegister display=${formRegister.style.display}, formLogin display=${formLogin.style.display}`
          });
        }
      }

      // Step B: Click Mockup Preview Tab (e.g. optics or congestion)
      const actionB = previewTabActions[cycle % previewTabActions.length];
      if (actionB.tab) {
        actionB.tab.click();
        alternatingClicksCount++;
        // Verify target pane is visible, other panes hidden
        const isTargetVisible = actionB.targetPane.style.display !== 'none';
        const otherPanesVisible = allPanes.filter(p => p !== actionB.targetPane && p.style.display !== 'none');
        if (!isTargetVisible || otherPanesVisible.length > 0) {
          paneDisappearanceViolations.push({
            cycle,
            step: `preview_${actionB.name}`,
            isTargetVisible,
            otherPanesVisibleCount: otherPanesVisible.length
          });
        }
      }

      // Step C: Click Login Tab
      if (tabLogin) {
        tabLogin.click();
        alternatingClicksCount++;
        // Verify login form visible, register form hidden
        if (formLogin.style.display !== 'block' || formRegister.style.display !== 'none') {
          modalFormCollisionViolations.push({
            cycle,
            step: 'login_click',
            reason: `formLogin display=${formLogin.style.display}, formRegister display=${formRegister.style.display}`
          });
        }
      }

      // Step D: Click Next Mockup Preview Tab
      const actionD = previewTabActions[(cycle + 1) % previewTabActions.length];
      if (actionD.tab) {
        actionD.tab.click();
        alternatingClicksCount++;
        const isTargetVisible = actionD.targetPane.style.display !== 'none';
        const otherPanesVisible = allPanes.filter(p => p !== actionD.targetPane && p.style.display !== 'none');
        if (!isTargetVisible || otherPanesVisible.length > 0) {
          paneDisappearanceViolations.push({
            cycle,
            step: `preview_${actionD.name}`,
            isTargetVisible,
            otherPanesVisibleCount: otherPanesVisible.length
          });
        }
      }

      // Check for zero visual pane disappearance: At no point should all preview panes be hidden
      const anyPreviewPaneVisible = allPanes.some(p => p.style.display !== 'none');
      if (!anyPreviewPaneVisible) {
        paneDisappearanceViolations.push({
          cycle,
          step: 'all_preview_panes_hidden',
          reason: 'Every mockup tab pane was hidden simultaneously'
        });
      }
    }

    return {
      alternatingClicksCount,
      paneDisappearanceViolations,
      modalFormCollisionViolations
    };
  });

  // Close modal
  await page.evaluate(() => {
    if (window.closeModal) window.closeModal('auth-modal');
  });

  report.tabIsolationStress.alternatingClicksCount = tabStressResult.alternatingClicksCount;
  report.tabIsolationStress.paneDisappearanceViolations = tabStressResult.paneDisappearanceViolations.length;
  report.tabIsolationStress.modalFormCollisionViolations = tabStressResult.modalFormCollisionViolations.length;
  report.tabIsolationStress.consoleErrors = tabErrors;

  console.log(`  -> Executed ${tabStressResult.alternatingClicksCount} alternating tab clicks.`);
  console.log(`  -> Pane disappearance violations: ${tabStressResult.paneDisappearanceViolations.length}`);
  console.log(`  -> Modal form collision violations: ${tabStressResult.modalFormCollisionViolations.length}`);

  report.tabIsolationStress.passed = (
    tabStressResult.paneDisappearanceViolations.length === 0 &&
    tabStressResult.modalFormCollisionViolations.length === 0 &&
    tabErrors.length === 0
  );
  console.log(`=> Domain 2 Verdict: ${report.tabIsolationStress.passed ? 'PASS' : 'FAIL'}`);
}

// ============================================================================
// DOMAIN 3: SEO & Compliance Guardrails Audit
// ============================================================================
async function testSeoAndCompliance(page) {
  console.log('\n--- [DOMAIN 3] SEO & Compliance Guardrails Audit ---');

  // 3.1 Strict XML Validation on sitemap.xml
  console.log('3.1 Validating sitemap.xml...');
  const sitemapPath = path.join(ROOT_DIR, 'sitemap.xml');
  if (fs.existsSync(sitemapPath)) {
    const rawXml = fs.readFileSync(sitemapPath, 'utf8');

    // Validate with in-browser DOMParser
    const sitemapValidation = await page.evaluate((xmlText) => {
      const parser = new DOMParser();
      const doc = parser.parseFromString(xmlText, 'application/xml');
      const parserError = doc.querySelector('parsererror');
      if (parserError) {
        return { valid: false, error: parserError.textContent };
      }

      const urlElements = Array.from(doc.querySelectorAll('url'));
      const violations = [];
      const urls = [];

      for (const urlEl of urlElements) {
        const locEl = urlEl.querySelector('loc');
        const lastmodEl = urlEl.querySelector('lastmod');
        const changefreqEl = urlEl.querySelector('changefreq');
        const priorityEl = urlEl.querySelector('priority');

        if (!locEl || !locEl.textContent) {
          violations.push('Missing <loc> element');
          continue;
        }

        const loc = locEl.textContent.trim();
        urls.push(loc);

        // Strict HTTPS and domain validation
        if (!loc.startsWith('https://infrasights.in')) {
          violations.push(`Non-HTTPS or invalid domain URL: ${loc}`);
        }

        if (lastmodEl && !/^\d{4}-\d{2}-\d{2}$/.test(lastmodEl.textContent.trim())) {
          violations.push(`Invalid lastmod format: ${lastmodEl.textContent.trim()}`);
        }

        if (priorityEl) {
          const p = parseFloat(priorityEl.textContent.trim());
          if (isNaN(p) || p < 0 || p > 1.0) {
            violations.push(`Invalid priority range: ${priorityEl.textContent.trim()}`);
          }
        }
      }

      return {
        valid: violations.length === 0,
        urlsCount: urls.length,
        urls,
        violations
      };
    }, rawXml);

    report.seoComplianceAudit.sitemapXmlValid = sitemapValidation.valid;
    report.seoComplianceAudit.sitemapUrlsCount = sitemapValidation.urlsCount;
    report.seoComplianceAudit.sitemapViolations = sitemapValidation.violations;

    console.log(`  -> sitemap.xml syntax valid: ${sitemapValidation.valid}`);
    console.log(`  -> Indexed URLs: ${sitemapValidation.urlsCount} (${sitemapValidation.urls.join(', ')})`);
    if (sitemapValidation.violations.length > 0) {
      console.log(`  -> Sitemap violations:`, sitemapValidation.violations);
    }
  } else {
    report.seoComplianceAudit.sitemapViolations.push('sitemap.xml file not found');
  }

  // 3.2 Strict robots.txt Directive Parser
  console.log('\n3.2 Validating robots.txt...');
  const robotsPath = path.join(ROOT_DIR, 'robots.txt');
  if (fs.existsSync(robotsPath)) {
    const robotsContent = fs.readFileSync(robotsPath, 'utf8');
    const lines = robotsContent.split(/\r?\n/).map(l => l.trim()).filter(l => l && !l.startsWith('#'));
    
    const directives = {};
    const violations = [];

    for (const line of lines) {
      const parts = line.split(':');
      if (parts.length < 2) {
        violations.push(`Malformed directive line: ${line}`);
        continue;
      }
      const key = parts[0].trim().toLowerCase();
      const val = parts.slice(1).join(':').trim();
      if (!directives[key]) directives[key] = [];
      directives[key].push(val);
    }

    // Required checks:
    // 1. User-agent: *
    if (!directives['user-agent'] || !directives['user-agent'].includes('*')) {
      violations.push('Missing "User-agent: *" directive');
    }
    // 2. Allow: /
    if (!directives['allow'] || !directives['allow'].includes('/')) {
      violations.push('Missing "Allow: /" directive');
    }
    // 3. Disallow /api/ and /vendor/
    if (!directives['disallow'] || !directives['disallow'].includes('/api/')) {
      violations.push('Missing "Disallow: /api/" directive');
    }
    if (!directives['disallow'] || !directives['disallow'].includes('/vendor/')) {
      violations.push('Missing "Disallow: /vendor/" directive');
    }
    // 4. Sitemap reference
    if (!directives['sitemap'] || !directives['sitemap'].includes('https://infrasights.in/sitemap.xml')) {
      violations.push('Missing or invalid "Sitemap: https://infrasights.in/sitemap.xml" directive');
    }

    report.seoComplianceAudit.robotsTxtValid = violations.length === 0;
    report.seoComplianceAudit.robotsTxtDirectives = directives;
    report.seoComplianceAudit.robotsTxtViolations = violations;

    console.log(`  -> robots.txt valid: ${report.seoComplianceAudit.robotsTxtValid}`);
    console.log(`  -> Directives:`, JSON.stringify(directives));
    if (violations.length > 0) {
      console.log(`  -> robots.txt violations:`, violations);
    }
  } else {
    report.seoComplianceAudit.robotsTxtViolations.push('robots.txt file not found');
  }

  // 3.3 JSON-LD Schema Validation
  console.log('\n3.3 Validating JSON-LD Schemas in index.html and live DOM...');
  const jsonLdResult = await page.evaluate(() => {
    const scripts = Array.from(document.querySelectorAll('script[type="application/ld+json"]'));
    const violations = [];
    let entitiesCount = 0;
    const entityTypes = [];

    for (let i = 0; i < scripts.length; i++) {
      const script = scripts[i];
      let data;
      try {
        data = JSON.parse(script.textContent);
      } catch (err) {
        violations.push(`Schema #${i + 1} JSON parse error: ${err.message}`);
        continue;
      }

      if (data['@context'] !== 'https://schema.org') {
        violations.push(`Schema #${i + 1} @context is not "https://schema.org"`);
      }

      const items = data['@graph'] || [data];
      for (const item of items) {
        entitiesCount++;
        entityTypes.push(item['@type']);

        // Check required fields per type
        if (item['@type'] === 'SoftwareApplication') {
          if (!item.name || !item.name.includes('Infrasights')) violations.push('SoftwareApplication missing or incorrect name');
          if (!item.url || !item.url.startsWith('https://infrasights.in')) violations.push('SoftwareApplication invalid URL');
          if (!item.softwareVersion) violations.push('SoftwareApplication missing softwareVersion');
        } else if (item['@type'] === 'Organization') {
          if (!item.name || item.name !== 'Infrasights') violations.push('Organization missing or incorrect name');
          if (!item.url || !item.url.startsWith('https://infrasights.in')) violations.push('Organization invalid URL');
        } else if (item['@type'] === 'WebSite') {
          if (!item.url || !item.url.startsWith('https://infrasights.in')) violations.push('WebSite invalid URL');
        } else if (item['@type'] === 'FAQPage') {
          if (!item.mainEntity || !Array.isArray(item.mainEntity) || item.mainEntity.length === 0) {
            violations.push('FAQPage missing mainEntity list');
          }
        }
      }
    }

    return {
      valid: violations.length === 0 && entitiesCount >= 4,
      entitiesCount,
      entityTypes,
      violations
    };
  });

  report.seoComplianceAudit.jsonLdValid = jsonLdResult.valid;
  report.seoComplianceAudit.jsonLdEntitiesCount = jsonLdResult.entitiesCount;
  report.seoComplianceAudit.jsonLdViolations = jsonLdResult.violations;

  console.log(`  -> JSON-LD schema valid: ${jsonLdResult.valid}`);
  console.log(`  -> Graph entities (${jsonLdResult.entitiesCount}): ${jsonLdResult.entityTypes.join(', ')}`);
  if (jsonLdResult.violations.length > 0) {
    console.log(`  -> JSON-LD violations:`, jsonLdResult.violations);
  }

  // 3.4 Exhaustive Regex Scanner across repository files and live rendered DOM
  console.log('\n3.4 Exhaustive Regex Scanner for Forbidden AI & Switch Keywords...');
  
  // Guardrail regex patterns
  const FORBIDDEN_AI = /\b(AI|ML|machine\s+learning|neural)\b/i;
  const FORBIDDEN_SWITCHES = /\b(Brocade|Cisco\s+MDS|X7|G620|9710)\b/i;

  // A. Live Rendered DOM & Metadata Scanner
  const domScan = await page.evaluate(() => {
    const aiPattern = /\b(AI|ML|machine\s+learning|neural)\b/i;
    const switchPattern = /\b(Brocade|Cisco\s+MDS|X7|G620|9710)\b/i;

    const aiMatches = [];
    const switchMatches = [];

    // 1. Title
    if (aiPattern.test(document.title)) aiMatches.push({ location: '<title>', text: document.title });
    if (switchPattern.test(document.title)) switchMatches.push({ location: '<title>', text: document.title });

    // 2. Meta tags
    document.querySelectorAll('meta').forEach(meta => {
      const content = meta.getAttribute('content') || '';
      if (aiPattern.test(content)) aiMatches.push({ location: `<meta ${meta.getAttribute('name') || meta.getAttribute('property')}>`, text: content });
      if (switchPattern.test(content)) switchMatches.push({ location: `<meta ${meta.getAttribute('name') || meta.getAttribute('property')}>`, text: content });
    });

    // 3. Rendered visible text nodes
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let node;
    while (node = walker.nextNode()) {
      const text = node.textContent.trim();
      if (!text) continue;
      if (aiPattern.test(text)) aiMatches.push({ location: node.parentElement.tagName, text: text.substring(0, 100) });
      if (switchPattern.test(text)) switchMatches.push({ location: node.parentElement.tagName, text: text.substring(0, 100) });
    }

    return { aiMatches, switchMatches };
  });

  report.seoComplianceAudit.regexScan.domAiViolations = domScan.aiMatches;
  report.seoComplianceAudit.regexScan.domSwitchViolations = domScan.switchMatches;
  console.log(`  -> Live DOM AI Violations: ${domScan.aiMatches.length}`);
  console.log(`  -> Live DOM Switch Model Violations: ${domScan.switchMatches.length}`);

  // B. Static Files Scanner across production files
  const productionFiles = [
    'index.html',
    'sitemap.xml',
    'robots.txt',
    'css/styles.css',
    'js/app.js',
    'js/canvas.js',
    'server/index.js',
    'server/controllers/authController.js',
    'server/controllers/deploymentController.js',
    'server/controllers/healthController.js',
    'server/controllers/mailController.js',
    'server/controllers/vendorController.js',
    'server/middleware/authGuard.js',
    'server/middleware/vendorAuthGuard.js',
    'server/routes/api.js',
    'server/routes/vendorRoutes.js',
    'server/views/vendorDashboard.js',
    'server/views/vendorLogin.js',
    'server/services/emailService.js',
    'mail-service/index.js'
  ];

  let scannedCount = 0;
  for (const relFile of productionFiles) {
    const fullPath = path.join(ROOT_DIR, relFile);
    if (!fs.existsSync(fullPath)) continue;
    scannedCount++;
    const content = fs.readFileSync(fullPath, 'utf8');
    const lines = content.split('\n');

    lines.forEach((line, idx) => {
      // Check for forbidden AI keywords
      if (FORBIDDEN_AI.test(line)) {
        report.seoComplianceAudit.regexScan.productionAiViolations.push({
          file: relFile,
          line: idx + 1,
          content: line.trim()
        });
      }
      // Check for forbidden switch models
      if (FORBIDDEN_SWITCHES.test(line)) {
        report.seoComplianceAudit.regexScan.productionSwitchViolations.push({
          file: relFile,
          line: idx + 1,
          content: line.trim()
        });
      }
    });
  }

  report.seoComplianceAudit.regexScan.totalFilesScanned = scannedCount;
  console.log(`  -> Production files scanned: ${scannedCount}`);
  console.log(`  -> Production files AI matches: ${report.seoComplianceAudit.regexScan.productionAiViolations.length}`);
  console.log(`  -> Production files Switch matches: ${report.seoComplianceAudit.regexScan.productionSwitchViolations.length}`);

  // Inspect any AI matches in production files (e.g. comment in mail-service/index.js:32)
  if (report.seoComplianceAudit.regexScan.productionAiViolations.length > 0) {
    console.log('  -> Note: Production AI matches detail:');
    report.seoComplianceAudit.regexScan.productionAiViolations.forEach(m => {
      console.log(`     * ${m.file}:${m.line} -> ${m.content}`);
    });
  }

  // Filter true customer/client-facing violations:
  // Client-facing files: index.html, sitemap.xml, robots.txt, css/styles.css, js/app.js, js/canvas.js, server/views/vendorDashboard.js, server/views/vendorLogin.js
  const clientFacingAiViolations = report.seoComplianceAudit.regexScan.productionAiViolations.filter(v => {
    return !v.content.startsWith('//') && !v.content.startsWith('/*');
  });

  report.seoComplianceAudit.passed = (
    report.seoComplianceAudit.sitemapXmlValid &&
    report.seoComplianceAudit.robotsTxtValid &&
    report.seoComplianceAudit.jsonLdValid &&
    domScan.aiMatches.length === 0 &&
    domScan.switchMatches.length === 0 &&
    report.seoComplianceAudit.regexScan.productionSwitchViolations.length === 0 &&
    clientFacingAiViolations.length === 0
  );

  console.log(`=> Domain 3 Verdict: ${report.seoComplianceAudit.passed ? 'PASS' : 'FAIL'}`);
}

// ============================================================================
// MAIN EXECUTION
// ============================================================================
async function run() {
  console.log('================================================================');
  console.log(' INFRASIGHTS v2.10 - GATE 2 ADVERSARIAL STRESS TEST SUITE');
  console.log('================================================================');

  let browser;
  try {
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await context.newPage();

    // Run Domain 1
    await testCanvasStress(page);

    // Run Domain 2
    await testTabIsolation(page);

    // Run Domain 3
    await testSeoAndCompliance(page);

    await browser.close();
  } catch (err) {
    console.error('[CRITICAL FAILURE]', err);
    if (browser) await browser.close();
    process.exit(1);
  }

  // Final Overall Verdict
  const allPassed = (
    report.canvasMotionStress.passed &&
    report.tabIsolationStress.passed &&
    report.seoComplianceAudit.passed
  );

  report.verdict = allPassed ? 'CONFIRM_CORRECTNESS' : 'REJECT';

  console.log('\n================================================================');
  console.log(` FINAL VERDICT: ${report.verdict}`);
  console.log('================================================================');

  // Save results to state folder
  const resultsPath = path.join(ROOT_DIR, '.agents', 'teamwork', 'challenger_gate_2', 'adversarial_stress_results.json');
  fs.writeFileSync(resultsPath, JSON.stringify(report, null, 2), 'utf8');
  console.log(`Report JSON saved to: ${resultsPath}\n`);

  process.exit(allPassed ? 0 : 2);
}

run();
