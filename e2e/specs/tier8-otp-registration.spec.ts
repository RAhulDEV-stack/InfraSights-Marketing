import { test, expect } from '@playwright/test';

/**
 * Tier 8: Streamlined User Registration & Domain Welcome Email Flow (Zero-OTP, Zero-Investment)
 * Tests:
 * 1. Opening registration tab in auth modal
 * 2. Entering contact details including optional mobile phone without OTP friction
 * 3. Completing instant account registration and receiving welcome email from admin@infrasights.in
 * 4. Programmatic backend verification of optional OTP and mail dispatch endpoints
 */

test.describe('Tier 8: Streamlined Registration & Domain Email Suite', () => {
  test('Complete instant user registration with optional mobile phone and welcome email', async ({ page }) => {
    // 1. Visit homepage
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');

    // 2. Open Account modal via footer link
    const authLink = page.locator('#footer-auth-link');
    await authLink.scrollIntoViewIfNeeded();
    await authLink.click();

    // Verify modal is visible
    const authModal = page.locator('#auth-modal');
    await expect(authModal).toBeVisible();

    // Switch to Register tab
    const registerTab = page.locator('#tab-btn-register');
    await registerTab.click();
    await expect(page.locator('#form-register')).toBeVisible();

    // Fill registration details
    const testTimestamp = Date.now();
    const testEmail = `lead.architect.${testTimestamp}@infrasights.in`;
    const testPhone = `+9198765${String(testTimestamp).slice(-5)}`;

    await page.locator('#reg-name').fill('Vikram Malhotra');
    await page.locator('#reg-email').fill(testEmail);
    await page.locator('#reg-org').fill('OmniCloud Fibre Fabrics');
    await page.locator('#reg-password').fill('StrongPass2026!');
    await page.locator('#reg-phone').fill(testPhone);

    // Consent to terms
    await page.locator('#reg-terms').check();

    // Submit registration directly (zero OTP friction)
    const submitBtn = page.locator('#register-submit-btn');
    await submitBtn.click();

    // Wait for success indication
    const successNotice = page.locator('#register-success');
    await expect(successNotice).toBeVisible({ timeout: 6000 });
    await expect(successNotice).toContainText('admin@infrasights.in');

    // Verify transactional welcome email exists in mail outbox
    const historyRes = await page.request.get('/api/mail/history');
    const history = await historyRes.json();
    const welcomeEmail = history.data.find((m: any) => m.type === 'REGISTRATION_WELCOME' && m.to === testEmail);

    expect(welcomeEmail).toBeDefined();
    expect(welcomeEmail.from).toBe('admin@infrasights.in');
    expect(welcomeEmail.subject).toContain('Welcome to Infrasights v2.10');
    expect(welcomeEmail.metadata.phoneNumber).toBe(testPhone);
  });
});
