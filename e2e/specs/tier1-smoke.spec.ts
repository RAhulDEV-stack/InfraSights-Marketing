import { test, expect } from '@playwright/test';

/**
 * Tier 1: Smoke & Availability Test Suite
 * Validates HTTP 200 availability, zero console/runtime exceptions,
 * living SAN topology canvas initialization & 2D context, and brand consistency.
 */

test.describe('Tier 1: Smoke & Availability', () => {
  test('Landing page loads with HTTP 200 and zero console errors', async ({ page }) => {
    const consoleErrors: string[] = [];
    const pageErrors: Error[] = [];

    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });

    page.on('pageerror', (err) => {
      pageErrors.push(err);
    });

    const response = await page.goto('/', { waitUntil: 'networkidle' });
    expect(response).not.toBeNull();
    expect(response!.status()).toBe(200);

    // Assert zero uncaught exceptions and console errors
    expect(pageErrors, `Uncaught page errors detected: ${pageErrors.map(e => e.message).join('; ')}`).toHaveLength(0);
    expect(consoleErrors, `Console errors detected: ${consoleErrors.join('; ')}`).toHaveLength(0);
  });

  test('Living SAN topology canvas initializes with valid 2D context', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });

    const canvas = page.locator('#san-topology-canvas');
    await expect(canvas).toBeVisible();

    // Verify canvas dimensions and 2D context in browser runtime
    const canvasDetails = await canvas.evaluate((el: HTMLCanvasElement) => {
      const ctx = el.getContext('2d');
      const rect = el.getBoundingClientRect();
      return {
        hasContext2d: ctx !== null,
        clientWidth: el.clientWidth,
        clientHeight: el.clientHeight,
        rectWidth: rect.width,
        rectHeight: rect.height,
      };
    });

    expect(canvasDetails.hasContext2d).toBe(true);
    expect(canvasDetails.clientWidth).toBeGreaterThan(0);
    expect(canvasDetails.clientHeight).toBeGreaterThan(0);

    // Verify telemetry HUD elements
    const hud = page.locator('.canvas-hud');
    await expect(hud).toBeVisible();

    const congestionBtn = page.locator('#toggle-congestion-btn');
    await expect(congestionBtn).toBeVisible();
    await congestionBtn.click();
  });

  test('Product title, metadata, and branding consistently state "Infrasights v2.10"', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });

    // Validate Page Title
    const title = await page.title();
    expect(title).toMatch(/Infrasights\s+v2\.10/i);

    // Validate Meta Tags
    const metaDesc = await page.locator('meta[name="description"]').getAttribute('content');
    expect(metaDesc).not.toBeNull();
    expect(metaDesc).toMatch(/Infrasights\s+v2\.10/i);

    const ogTitle = await page.locator('meta[property="og:title"]').getAttribute('content');
    expect(ogTitle).not.toBeNull();
    expect(ogTitle).toMatch(/Infrasights\s+v2\.10/i);

    // Validate Header Branding Elements
    const brandName = page.locator('.brand-logo span').first();
    await expect(brandName).toHaveText('Infrasights');

    const brandBadge = page.locator('.brand-logo .brand-badge').first();
    await expect(brandBadge).toHaveText('v2.10');

    // Validate Hero Version Pill
    const heroPill = page.locator('.hero-version-pill');
    await expect(heroPill).toBeVisible();
    await expect(heroPill).toContainText('v2.10');

    // Validate Footer Version Stamp
    const footerBadge = page.locator('.footer-badge');
    await expect(footerBadge).toBeVisible();
    await expect(footerBadge).toContainText('v2.10');
  });

  test('Backend health probe (/api/health) returns 200 HEALTHY with Infrasights version', async ({ request }) => {
    const response = await request.get('/api/health');
    expect(response.status()).toBe(200);

    const body = await response.json();
    expect(body.status).toBe('HEALTHY');
    expect(body.product).toBe('Infrasights');
    expect(body.version).toMatch(/^2\.10/);
    expect(body.database).toBeDefined();
    expect(body.database.connected).toBe(true);
  });
});
