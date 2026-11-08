import { test, expect } from '@playwright/test';

/**
 * Tier 2: Guardrails & Content Compliance Test Suite
 * Validates strict adherence to R2:
 * 1. Zero occurrences of AI/ML buzzwords across DOM and metadata.
 * 2. Zero occurrences of switch vendor names / models across DOM and metadata.
 * 3. Network payload interceptor verifying zero vendor leaks in JSON responses.
 */

const FORBIDDEN_AI_REGEX = /\b(AI|ML|machine\s*learning|neural|deep\s*learning|LLM|artificial\s*intelligence)\b/i;
const FORBIDDEN_VENDOR_REGEX = /\b(Brocade|Cisco|MDS|SANnav|Fabric\s*OS|NX-OS|X7|G620|9710)\b/i;

test.describe('Tier 2: Content & Positioning Guardrails', () => {
  test('Zero-AI & ML buzzwords across all rendered DOM text and metadata', async ({ page }) => {
    await page.goto('/', { waitUntil: 'networkidle' });

    // 1. Scan <title>
    const title = await page.title();
    expect(title).not.toMatch(FORBIDDEN_AI_REGEX);

    // 2. Scan all <meta> tags
    const metaViolations = await page.evaluate((patternStr) => {
      const regex = new RegExp(patternStr, 'i');
      const violations: { tag: string; attribute: string; value: string }[] = [];
      const metas = document.querySelectorAll('meta');
      metas.forEach((m) => {
        const content = m.getAttribute('content');
        if (content && regex.test(content)) {
          violations.push({
            tag: m.outerHTML,
            attribute: 'content',
            value: content,
          });
        }
      });
      return violations;
    }, FORBIDDEN_AI_REGEX.source);

    expect(
      metaViolations,
      `Forbidden AI/ML keywords found in <meta> tags: ${JSON.stringify(metaViolations, null, 2)}`
    ).toHaveLength(0);

    // 3. Scan all rendered text across content tags
    const domViolations = await page.evaluate((patternStr) => {
      const regex = new RegExp(patternStr, 'i');
      const targetTags = 'h1, h2, h3, h4, h5, h6, p, span, a, button, li, td, th, label';
      const elements = document.querySelectorAll(targetTags);
      const violations: { selector: string; text: string }[] = [];

      elements.forEach((el) => {
        // Only evaluate direct/leaf or non-empty text content
        const text = el.textContent?.trim();
        if (text && regex.test(text)) {
          // Verify if children also contain it or if it's the immediate node
          const match = text.match(regex);
          violations.push({
            selector: `${el.tagName.toLowerCase()}${el.id ? '#' + el.id : ''}${el.className ? '.' + el.className.split(' ').join('.') : ''}`,
            text: match ? `...${match[0]}... (full: ${text.substring(0, 100)})` : text,
          });
        }
      });

      return violations;
    }, FORBIDDEN_AI_REGEX.source);

    expect(
      domViolations,
      `Forbidden AI/ML keywords found in rendered DOM: ${JSON.stringify(domViolations, null, 2)}`
    ).toHaveLength(0);
  });

  test('Zero switch vendor and model names across all rendered DOM text and metadata', async ({ page }) => {
    await page.goto('/', { waitUntil: 'networkidle' });

    // 1. Scan <title>
    const title = await page.title();
    expect(title).not.toMatch(FORBIDDEN_VENDOR_REGEX);

    // 2. Scan all <meta> tags
    const metaViolations = await page.evaluate((patternStr) => {
      const regex = new RegExp(patternStr, 'i');
      const violations: { tag: string; attribute: string; value: string }[] = [];
      const metas = document.querySelectorAll('meta');
      metas.forEach((m) => {
        const content = m.getAttribute('content');
        if (content && regex.test(content)) {
          violations.push({
            tag: m.outerHTML,
            attribute: 'content',
            value: content,
          });
        }
      });
      return violations;
    }, FORBIDDEN_VENDOR_REGEX.source);

    expect(
      metaViolations,
      `Forbidden switch vendor keywords found in <meta> tags: ${JSON.stringify(metaViolations, null, 2)}`
    ).toHaveLength(0);

    // 3. Scan rendered text nodes
    const domViolations = await page.evaluate((patternStr) => {
      const regex = new RegExp(patternStr, 'i');
      const targetTags = 'h1, h2, h3, h4, h5, h6, p, span, a, button, li, td, th, label, option';
      const elements = document.querySelectorAll(targetTags);
      const violations: { selector: string; text: string }[] = [];

      elements.forEach((el) => {
        const text = el.textContent?.trim();
        if (text && regex.test(text)) {
          const match = text.match(regex);
          violations.push({
            selector: `${el.tagName.toLowerCase()}${el.id ? '#' + el.id : ''}${el.className ? '.' + el.className.split(' ').join('.') : ''}`,
            text: match ? `...${match[0]}... (full: ${text.substring(0, 100)})` : text,
          });
        }
      });

      return violations;
    }, FORBIDDEN_VENDOR_REGEX.source);

    expect(
      domViolations,
      `Forbidden switch vendor keywords found in rendered DOM: ${JSON.stringify(domViolations, null, 2)}`
    ).toHaveLength(0);
  });

  test('Network payload interceptor: zero vendor leaks in JSON responses', async ({ page }) => {
    const interceptedLeakedPayloads: { url: string; match: string }[] = [];

    // Intercept network responses
    page.on('response', async (response) => {
      const url = response.url();
      if (url.includes('/api/')) {
        try {
          const contentType = response.headers()['content-type'] || '';
          if (contentType.includes('application/json')) {
            const text = await response.text();
            const match = text.match(FORBIDDEN_VENDOR_REGEX);
            if (match) {
              interceptedLeakedPayloads.push({
                url,
                match: match[0],
              });
            }
          }
        } catch {
          // Ignore responses that cannot be converted to text
        }
      }
    });

    await page.goto('/', { waitUntil: 'networkidle' });

    // Explicitly trigger health probe and observe response
    await page.evaluate(async () => {
      try {
        await fetch('/api/health');
      } catch {
        // Ignore
      }
    });

    await page.waitForTimeout(500);

    expect(
      interceptedLeakedPayloads,
      `Forbidden vendor names leaked in API network responses: ${JSON.stringify(interceptedLeakedPayloads, null, 2)}`
    ).toHaveLength(0);
  });
});
