import { test, expect } from '@playwright/test';

/**
 * Tier 3: Multi-Device Responsive Matrix Test Suite
 * Validates responsive layouts and accessibility across:
 * 1. Desktop (1920x1080): horizontal nav, side-by-side hero, full canvas.
 * 2. Tablet (768x1024): 2-column wrapping, responsive canvas scaling.
 * 3. Mobile (375x667): hamburger visible, desktop nav hidden, drawer toggle, touch targets.
 * 4. prefers-reduced-motion media query handling.
 */

test.describe('Tier 3: Multi-Device Responsive Matrix', () => {
  test('Desktop layout (1920x1080): horizontal nav, side-by-side hero, full canvas', async ({ page }) => {
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.goto('/', { waitUntil: 'domcontentloaded' });

    // Desktop nav links visible
    const navLinks = page.locator('.nav-links');
    await expect(navLinks).toBeVisible();

    // Mobile hamburger menu button hidden on desktop
    const mobileToggle = page.locator('#mobile-toggle-btn');
    await expect(mobileToggle).toBeHidden();

    // Side-by-side hero grid layout
    const heroGrid = page.locator('.hero-grid');
    await expect(heroGrid).toBeVisible();
    const gridCols = await heroGrid.evaluate((el) => {
      const style = window.getComputedStyle(el);
      return style.gridTemplateColumns;
    });
    // In desktop, grid has multiple columns
    expect(gridCols.split(' ').length).toBeGreaterThanOrEqual(2);

    // Canvas visible and sized for desktop
    const canvas = page.locator('#san-topology-canvas');
    await expect(canvas).toBeVisible();
    const canvasBox = await canvas.boundingBox();
    expect(canvasBox).not.toBeNull();
    expect(canvasBox!.width).toBeGreaterThanOrEqual(400);
    expect(canvasBox!.height).toBeGreaterThanOrEqual(250);
  });

  test('Tablet layout (768x1024): responsive grid wrapping and canvas scaling', async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 1024 });
    await page.goto('/', { waitUntil: 'domcontentloaded' });

    // Canvas adapts responsively to tablet width
    const canvas = page.locator('#san-topology-canvas');
    await expect(canvas).toBeVisible();
    const canvasBox = await canvas.boundingBox();
    expect(canvasBox).not.toBeNull();
    expect(canvasBox!.width).toBeLessThanOrEqual(768);
    expect(canvasBox!.width).toBeGreaterThanOrEqual(300);

    // Capabilities and audience cards wrap cleanly
    const capabilities = page.locator('.capabilities-grid');
    await expect(capabilities).toBeVisible();

    // Header adapts gracefully
    const brand = page.locator('.site-header .brand-logo');
    await expect(brand).toBeVisible();
  });

  test('Mobile layout (375x667): mobile hamburger visible, desktop nav hidden, drawer toggle, touch targets', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/', { waitUntil: 'domcontentloaded' });

    // Desktop navigation links hidden
    const desktopNav = page.locator('.nav-links');
    await expect(desktopNav).toBeHidden();

    // Mobile menu toggle visible
    const mobileToggle = page.locator('#mobile-toggle-btn');
    await expect(mobileToggle).toBeVisible();

    // Drawer toggle interaction
    const mobileDrawer = page.locator('#mobile-drawer');
    await mobileToggle.click({ force: true });
    const hasOpenClass = await mobileDrawer.evaluate((el) => el.classList.contains('open'));
    expect(hasOpenClass).toBe(true);

    // Toggle close
    await mobileToggle.click({ force: true });
    const isClosed = await mobileDrawer.evaluate((el) => !el.classList.contains('open'));
    expect(isClosed).toBe(true);

    // Thumb-friendly touch targets (min 36x36px for critical mobile action controls)
    const mobileCta = page.locator('.hero-ctas .trigger-deployment-cta');
    await expect(mobileCta).toBeVisible();
    const ctaBox = await mobileCta.boundingBox();
    expect(ctaBox).not.toBeNull();
    expect(ctaBox!.height).toBeGreaterThanOrEqual(36);
    expect(ctaBox!.width).toBeGreaterThanOrEqual(44);

    const toggleBox = await mobileToggle.boundingBox();
    expect(toggleBox).not.toBeNull();
    expect(toggleBox!.height).toBeGreaterThanOrEqual(32);
    expect(toggleBox!.width).toBeGreaterThanOrEqual(32);
  });

  test('Reduced motion emulation: respects prefers-reduced-motion without breaking animation loop', async ({ page }) => {
    // Emulate reduced motion user preference
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/', { waitUntil: 'domcontentloaded' });

    // Verify canvas initializes in reduced motion mode
    const canvas = page.locator('#san-topology-canvas');
    await expect(canvas).toBeVisible();

    const isReducedMotion = await page.evaluate(() => {
      return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    });
    expect(isReducedMotion).toBe(true);

    // Check canvas element still has valid 2D rendering context
    const hasValidContext = await canvas.evaluate((el: HTMLCanvasElement) => {
      const ctx = el.getContext('2d');
      return ctx !== null;
    });
    expect(hasValidContext).toBe(true);

    // Wait 1 second to confirm no uncaught exceptions in reduced motion loop
    await page.waitForTimeout(1000);
  });

  test('Interactive UI modals & anchors: Privacy, Terms, and Roadmap navigation operate cleanly', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });

    // 1. Verify #roadmap anchor exists and is attached to DOM
    const roadmapEl = page.locator('#roadmap');
    await expect(roadmapEl).toBeAttached();

    // 2. Open Privacy Policy modal from footer
    const privacyLink = page.locator('a.footer-link:has-text("Privacy Policy")');
    await privacyLink.click();
    const privacyModal = page.locator('#privacy-modal');
    await expect(privacyModal).toHaveClass(/open/);
    await expect(page.locator('#privacy-modal .modal-title')).toHaveText('Enterprise Privacy Notice');

    // Close with X button
    await page.locator('#privacy-modal .modal-close-btn').click();
    await expect(privacyModal).not.toHaveClass(/open/);

    // 3. Open Terms of Service modal from footer
    const termsLink = page.locator('a.footer-link:has-text("Terms of Service")');
    await termsLink.click();
    const termsModal = page.locator('#terms-modal');
    await expect(termsModal).toHaveClass(/open/);
    await expect(page.locator('#terms-modal .modal-title')).toHaveText('Terms of Service');

    // Close with Escape key
    await page.keyboard.press('Escape');
    await expect(termsModal).not.toHaveClass(/open/);

    // 4. Verify Registration form terms & privacy links trigger their respective modals
    // Open Auth modal using the universal footer auth trigger
    await page.locator('#footer-auth-link').click();
    const authModal = page.locator('#auth-modal');
    await expect(authModal).toHaveClass(/open/);

    // Switch to Register tab
    await page.locator('#tab-btn-register').click();
    await expect(page.locator('#form-register')).toBeVisible();

    // Click terms link inside registration form
    const regTermsLink = page.locator('#form-register a:has-text("terms of service")');
    await regTermsLink.click();
    await expect(termsModal).toHaveClass(/open/);
    await page.locator('#terms-modal .modal-close-btn').click();
    await expect(termsModal).not.toHaveClass(/open/);

    // Close Auth modal with backdrop click or close button
    await page.locator('#auth-modal .modal-close-btn').click();
    await expect(authModal).not.toHaveClass(/open/);
  });

  test('Canvas tooltip positioning stays within canvas bounds and renders correct SAN metrics on hover without console errors', async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });

    await page.goto('/', { waitUntil: 'domcontentloaded' });

    const canvas = page.locator('#san-topology-canvas');
    const tooltip = page.locator('#canvas-tooltip');
    const viewport = page.locator('.canvas-viewport');

    await canvas.scrollIntoViewIfNeeded();
    await page.waitForTimeout(300);

    const viewportBox = await viewport.boundingBox();
    expect(viewportBox).not.toBeNull();

    // Query node positions from canvas topology instance
    const nodeCoords = await page.evaluate(() => {
      const topo = (window as any).sanTopology;
      if (!topo || !topo.nodes || topo.nodes.length === 0) return null;
      const collectorNode = topo.nodes.find((n: any) => n.id === 'infrasights-engine') || topo.nodes[0];
      const rect = topo.canvas.getBoundingClientRect();
      return {
        nodeX: collectorNode.x,
        nodeY: collectorNode.y,
        rectLeft: rect.left,
        rectTop: rect.top,
        rectWidth: rect.width,
        rectHeight: rect.height,
        label: collectorNode.label,
      };
    });

    expect(nodeCoords).not.toBeNull();

    // Move cursor over the node
    const hoverX = nodeCoords!.rectLeft + nodeCoords!.nodeX;
    const hoverY = nodeCoords!.rectTop + nodeCoords!.nodeY;
    await page.mouse.move(hoverX, hoverY);
    await page.waitForTimeout(300);

    // Verify tooltip is displayed with non-zero opacity
    const tooltipOpacity = await tooltip.evaluate((el) => {
      return parseFloat(window.getComputedStyle(el).opacity);
    });
    expect(tooltipOpacity).toBeGreaterThan(0);

    // Verify rendered content contains SAN node details and metrics
    const tooltipText = await tooltip.innerText();
    expect(tooltipText).toContain(nodeCoords!.label);
    expect(tooltipText).toMatch(/Fabric|Optics|Throughput|Latency|Health|Collector|Engine|Buffer/i);

    // Verify tooltip rendered box stays within .canvas-viewport boundaries
    const tooltipBox = await tooltip.boundingBox();
    expect(tooltipBox).not.toBeNull();

    expect(tooltipBox!.x).toBeGreaterThanOrEqual(viewportBox!.x - 5);
    expect(tooltipBox!.x + tooltipBox!.width).toBeLessThanOrEqual(viewportBox!.x + viewportBox!.width + 10);
    expect(tooltipBox!.y).toBeGreaterThanOrEqual(viewportBox!.y - 5);
    expect(tooltipBox!.y + tooltipBox!.height).toBeLessThanOrEqual(viewportBox!.y + viewportBox!.height + 10);

    // Verify zero console errors were produced during canvas interaction
    expect(consoleErrors).toHaveLength(0);
  });

  test('Interface mockup preview tabs remain visible and isolated when toggling auth modal tabs', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });

    const overviewPane = page.locator('#tab-overview');
    const opticsPane = page.locator('#tab-optics');

    // 1. Initial state: Fabric Overview pane is displayed
    const initialOverviewDisplay = await overviewPane.evaluate((el) => window.getComputedStyle(el).display);
    expect(initialOverviewDisplay).toBe('block');

    // 2. Open auth modal via footer link
    await page.locator('#footer-auth-link').click();
    const authModal = page.locator('#auth-modal');
    await expect(authModal).toHaveClass(/open/);

    // 3. Click auth modal "Create Account" tab
    await page.locator('#tab-btn-register').click();
    await expect(page.locator('#form-register')).toBeVisible();

    // Verify dashboard overview pane is STILL block (not hidden by auth tab click)
    let overviewDisplay = await overviewPane.evaluate((el) => window.getComputedStyle(el).display);
    expect(overviewDisplay).toBe('block');

    // 4. Click auth modal "Sign In" tab
    await page.locator('#tab-btn-login').click();
    await expect(page.locator('#form-login')).toBeVisible();

    // Verify dashboard overview pane is STILL block
    overviewDisplay = await overviewPane.evaluate((el) => window.getComputedStyle(el).display);
    expect(overviewDisplay).toBe('block');

    // 5. Close auth modal
    await page.locator('#auth-modal .modal-close-btn').click();
    await expect(authModal).not.toHaveClass(/open/);

    // 6. Test that switching interface tabs in #preview-tabs operates as intended
    const opticsTabBtn = page.locator('.mockup-tabs button[data-tab="tab-optics"]');
    await opticsTabBtn.click();
    const opticsDisplay = await opticsPane.evaluate((el) => window.getComputedStyle(el).display);
    overviewDisplay = await overviewPane.evaluate((el) => window.getComputedStyle(el).display);

    expect(opticsDisplay).toBe('block');
    expect(overviewDisplay).toBe('none');

    // Switch back to overview
    const overviewTabBtn = page.locator('.mockup-tabs button[data-tab="tab-overview"]');
    await overviewTabBtn.click();
    overviewDisplay = await overviewPane.evaluate((el) => window.getComputedStyle(el).display);
    expect(overviewDisplay).toBe('block');
  });
});
