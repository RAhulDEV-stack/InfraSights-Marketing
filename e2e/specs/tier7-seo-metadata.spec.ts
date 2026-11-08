import { test, expect } from '@playwright/test';

/**
 * Tier 7: Production SEO, Social Metadata & Infrastructure Probes Test Suite
 * Validates Requirements R2 & R3 and Acceptance Criteria:
 * 1. Metadata & Social Sharing tests:
 *    - Validates <link rel="canonical" href="https://infrasights.in/">
 *    - Validates complete OpenGraph tags: og:title, og:description, og:url, og:image, og:image:width, og:image:height, og:site_name, og:locale
 *    - Validates complete Twitter card tags: twitter:card, twitter:title, twitter:description, twitter:image
 *    - Validates JSON-LD schema markup: script tag with application/ld+json contains SoftwareApplication, Organization, WebSite, and FAQPage with correct attributes
 * 2. SEO Files & Probes tests:
 *    - Validates GET /sitemap.xml returns 200 OK, Content-Type: application/xml, valid XML structure containing https://infrasights.in/
 *    - Validates GET /robots.txt returns 200 OK, Content-Type: text/plain, contains Allow: /, Disallow: /api/, Disallow: /vendor/, Sitemap: https://infrasights.in/sitemap.xml
 *    - Validates GET /api/health returns 200 OK, status: "HEALTHY", version: "2.10.4"
 */

test.describe('Tier 7: Metadata & Social Sharing Tags', () => {

  test('Validates canonical URL link tag', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });

    const canonical = page.locator('link[rel="canonical"]');
    await expect(canonical).toHaveCount(1);
    const href = await canonical.getAttribute('href');
    expect(href).toBe('https://infrasights.in/');
  });

  test('Validates complete OpenGraph metadata suite', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });

    // og:type
    const ogType = await page.locator('meta[property="og:type"]').getAttribute('content');
    expect(ogType).toBe('website');

    // og:title
    const ogTitle = await page.locator('meta[property="og:title"]').getAttribute('content');
    expect(ogTitle).not.toBeNull();
    expect(ogTitle).toMatch(/Infrasights\s+v2\.10/i);

    // og:description
    const ogDesc = await page.locator('meta[property="og:description"]').getAttribute('content');
    expect(ogDesc).not.toBeNull();
    expect(ogDesc).toMatch(/SAN|telemetry|Fibre Channel|storage/i);

    // og:url
    const ogUrl = await page.locator('meta[property="og:url"]').getAttribute('content');
    expect(ogUrl).toBe('https://infrasights.in/');

    // og:image
    const ogImage = await page.locator('meta[property="og:image"]').getAttribute('content');
    expect(ogImage).toBe('https://infrasights.in/assets/og-image.png');

    // og:image:width & og:image:height
    const ogWidth = await page.locator('meta[property="og:image:width"]').getAttribute('content');
    expect(ogWidth).toBe('1200');

    const ogHeight = await page.locator('meta[property="og:image:height"]').getAttribute('content');
    expect(ogHeight).toBe('630');

    // og:site_name
    const ogSiteName = await page.locator('meta[property="og:site_name"]').getAttribute('content');
    expect(ogSiteName).toBe('Infrasights');

    // og:locale
    const ogLocale = await page.locator('meta[property="og:locale"]').getAttribute('content');
    expect(ogLocale).toBe('en_US');
  });

  test('Validates complete Twitter card tags', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });

    // twitter:card
    const twitterCard = await page.locator('meta[name="twitter:card"]').getAttribute('content');
    expect(twitterCard).toBe('summary_large_image');

    // twitter:title
    const twitterTitle = await page.locator('meta[name="twitter:title"]').getAttribute('content');
    expect(twitterTitle).not.toBeNull();
    expect(twitterTitle).toMatch(/Infrasights\s+v2\.10/i);

    // twitter:description
    const twitterDesc = await page.locator('meta[name="twitter:description"]').getAttribute('content');
    expect(twitterDesc).not.toBeNull();
    expect(twitterDesc).toMatch(/SAN|telemetry|optics|observability/i);

    // twitter:image
    const twitterImage = await page.locator('meta[name="twitter:image"]').getAttribute('content');
    expect(twitterImage).toBe('https://infrasights.in/assets/og-image.png');
  });

  test('Validates JSON-LD schema markup (SoftwareApplication, Organization, WebSite, FAQPage)', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });

    const schemaScript = page.locator('script[type="application/ld+json"]');
    await expect(schemaScript).toHaveCount(1);

    const schemaContent = await schemaScript.textContent();
    expect(schemaContent).not.toBeNull();

    const schema = JSON.parse(schemaContent!);
    expect(schema['@context']).toBe('https://schema.org');
    expect(Array.isArray(schema['@graph'])).toBe(true);

    const graph = schema['@graph'];
    const types = graph.map((item: any) => item['@type']);

    // 1. Verify SoftwareApplication entity
    expect(types).toContain('SoftwareApplication');
    const softwareApp = graph.find((item: any) => item['@type'] === 'SoftwareApplication');
    expect(softwareApp.name).toBe('Infrasights v2.10');
    expect(softwareApp.softwareVersion).toBe('2.10.4');
    expect(softwareApp.applicationCategory).toBe('BusinessApplication');
    expect(softwareApp.operatingSystem).toMatch(/All|Appliance|Browser/i);

    // 2. Verify Organization entity
    expect(types).toContain('Organization');
    const org = graph.find((item: any) => item['@type'] === 'Organization');
    expect(org.name).toBe('Infrasights');
    expect(org.url).toMatch(/^https:\/\/infrasights\.in\/?$/);
    expect(org.contactPoint).toBeDefined();

    // 3. Verify WebSite entity
    expect(types).toContain('WebSite');
    const website = graph.find((item: any) => item['@type'] === 'WebSite');
    expect(website.name).toBe('Infrasights');
    expect(website.url).toMatch(/^https:\/\/infrasights\.in\/?$/);

    // 4. Verify FAQPage entity with questions and answers
    expect(types).toContain('FAQPage');
    const faqPage = graph.find((item: any) => item['@type'] === 'FAQPage');
    expect(Array.isArray(faqPage.mainEntity)).toBe(true);
    expect(faqPage.mainEntity.length).toBeGreaterThanOrEqual(4);

    for (const q of faqPage.mainEntity) {
      expect(q['@type']).toBe('Question');
      expect(q.name.length).toBeGreaterThan(10);
      expect(q.acceptedAnswer).toBeDefined();
      expect(q.acceptedAnswer['@type']).toBe('Answer');
      expect(q.acceptedAnswer.text.length).toBeGreaterThan(15);
    }
  });
});

test.describe('Tier 7: SEO Files & Cloud Health Probes', () => {

  test('GET /sitemap.xml returns 200 OK, Content-Type application/xml, and canonical URLs', async ({ request }) => {
    const res = await request.get('/sitemap.xml');
    expect(res.status()).toBe(200);

    const contentType = res.headers()['content-type'];
    expect(contentType).toMatch(/application\/xml|text\/xml/i);

    const text = await res.text();
    // Validate valid XML declaration and sitemap protocol namespace
    expect(text).toContain('<?xml version="1.0" encoding="UTF-8"?>');
    expect(text).toContain('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">');

    // Validate contains canonical production URL
    expect(text).toContain('<loc>https://infrasights.in/</loc>');
    expect(text).toContain('<changefreq>weekly</changefreq>');
    expect(text).toContain('<priority>1.0</priority>');
  });

  test('GET /robots.txt returns 200 OK, Content-Type text/plain, and correct crawler directives', async ({ request }) => {
    const res = await request.get('/robots.txt');
    expect(res.status()).toBe(200);

    const contentType = res.headers()['content-type'];
    expect(contentType).toMatch(/text\/plain/i);

    const text = await res.text();
    expect(text).toContain('User-agent: *');
    expect(text).toContain('Allow: /');
    expect(text).toContain('Disallow: /api/');
    expect(text).toContain('Disallow: /vendor/');
    expect(text).toContain('Sitemap: https://infrasights.in/sitemap.xml');
  });

  test('GET /api/health returns 200 OK, status: "HEALTHY", version: "2.10.4"', async ({ request }) => {
    const res = await request.get('/api/health');
    expect(res.status()).toBe(200);

    const body = await res.json();
    expect(body.status).toBe('HEALTHY');
    expect(body.product).toBe('Infrasights');
    expect(body.version).toBe('2.10.4');
    expect(body.database).toBeDefined();
    expect(body.database.connected).toBe(true);
  });
});
