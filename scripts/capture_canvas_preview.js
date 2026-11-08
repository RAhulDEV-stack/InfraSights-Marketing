const { chromium } = require('@playwright/test');

async function capture() {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  
  console.log('Navigating to http://localhost:8086 ...');
  await page.goto('http://localhost:8086', { waitUntil: 'networkidle' });
  
  // Wait 1.5 seconds for canvas animations to stabilize
  await page.waitForTimeout(1500);
  
  const canvasContainer = page.locator('.canvas-container');
  await canvasContainer.screenshot({ path: 'preview-canvas-fixed.png' });
  console.log('Saved preview-canvas-fixed.png');

  const heroSection = page.locator('.hero-section');
  await heroSection.screenshot({ path: 'preview-hero-fixed.png' });
  console.log('Saved preview-hero-fixed.png');

  await browser.close();
}

capture().catch(err => {
  console.error('Capture error:', err);
  process.exit(1);
});
