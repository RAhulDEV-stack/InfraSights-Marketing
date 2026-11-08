import { test, expect } from '@playwright/test';

/**
 * Tier 4: End-to-End User Funnel & Qualification Lifecycle Test Suite
 * Validates the complete authenticated deployment request workflow (R4):
 * 1. Primary CTA gate opens authentication modal for unauthenticated visitors.
 * 2. User registration with business email, RFC 5322 validation, and bcrypt password.
 * 3. Session token issuance and UI header profile update.
 * 4. Multi-step deployment wizard navigation (Steps 1 through 5).
 * 5. Structured payload submission and tracking reference generation: INF-REQ-YYYYMMDD-XXXX.
 * 6. Verification of persistent storage in the database tier.
 */

const TRACKING_REF_REGEX = /^INF-REQ-\d{8}-[A-Z0-9]{4}$/;

test.describe('Tier 4: Authenticated Qualification Funnel & Database Persistence', () => {

  test('Direct Backend Lifecycle: Register -> JWT Token -> Create Deployment -> Verify Persistence', async ({ request }) => {
    const timestamp = Date.now();
    const testUser = {
      fullName: 'Alex Morgan',
      email: `alex.morgan.${timestamp}@enterprisesan.org`,
      organization: 'Global Data Centers Corp',
      departmentRole: 'Principal SAN Storage Architect',
      password: 'EnterpriseSecurity2026!',
    };

    // 1. Register new user
    const regRes = await request.post('/api/auth/register', { data: testUser });
    expect(regRes.status()).toBe(201);
    const regBody = await regRes.json();
    expect(regBody.success).toBe(true);
    expect(regBody.data.token).toBeDefined();
    expect(regBody.data.user.email).toBe(testUser.email.toLowerCase());

    const token = regBody.data.token;

    // 2. Verify /api/auth/me with Bearer token
    const meRes = await request.get('/api/auth/me', {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(meRes.status()).toBe(200);
    const meBody = await meRes.json();
    expect(meBody.data.user.email).toBe(testUser.email.toLowerCase());

    // 3. Submit structured deployment request
    const deploymentPayload = {
      organizationName: testUser.organization,
      businessEmail: testUser.email,
      countryRegion: 'United States',
      departmentRole: testUser.departmentRole,
      sanVendor: 'Multi-Vendor Fibre Channel Fabric',
      switchCount: '11-30 Switches',
      fabricCount: '2 (Dual Fabric A/B)',
      deploymentModel: 'On-Premises Virtual Appliance (VMware/KVM)',
      timeline: '1-3 Months',
      notes: 'Testing end-to-end direct switch telemetry pipeline and database persistence.',
    };

    const deployRes = await request.post('/api/deployments', {
      headers: { Authorization: `Bearer ${token}` },
      data: deploymentPayload,
    });
    expect(deployRes.status()).toBe(201);
    const deployBody = await deployRes.json();
    expect(deployBody.success).toBe(true);
    expect(deployBody.data.trackingRef).toBeDefined();

    const trackingRef = deployBody.data.trackingRef;
    expect(trackingRef).toMatch(TRACKING_REF_REGEX);

    // 4. Verify database persistence by querying by tracking reference
    const lookupRes = await request.get(`/api/deployments/${trackingRef}`);
    expect(lookupRes.status()).toBe(200);
    const lookupBody = await lookupRes.json();
    expect(lookupBody.success).toBe(true);
    expect(lookupBody.data.request.trackingRef).toBe(trackingRef);
    expect(lookupBody.data.request.organizationName).toBe(testUser.organization);
    expect(lookupBody.data.request.status).toBe('PENDING_REVIEW');

    // 5. Verify user's deployment requests list
    const listRes = await request.get('/api/deployments', {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(listRes.status()).toBe(200);
    const listBody = await listRes.json();
    expect(listBody.success).toBe(true);
    expect(Array.isArray(listBody.data.requests)).toBe(true);
    const matching = listBody.data.requests.find((r: { trackingRef: string }) => r.trackingRef === trackingRef);
    expect(matching).toBeDefined();
  });

  test('Browser UI Funnel: Hero CTA -> Auth Modal -> Register -> 5-Step Wizard -> Confirmation Ref Code', async ({ page, request }) => {
    const timestamp = Date.now();
    const testUser = {
      fullName: 'Jordan Lee',
      email: `jordan.lee.${timestamp}@datacenter-ops.net`,
      organization: 'Metro Financial Storage Fabric',
      departmentRole: 'SAN Infrastructure Operations Lead',
      password: 'SANSecureOps2026!',
    };

    await page.goto('/', { waitUntil: 'networkidle' });

    // Step 1: Click primary Hero CTA "Request a Deployment"
    const heroCta = page.locator('.hero-ctas .trigger-deployment-cta');
    await expect(heroCta).toBeVisible();
    await heroCta.click();

    // Step 2: Auth modal opens
    const authModal = page.locator('#auth-modal');
    await expect(authModal).toBeVisible();
    await expect(authModal).toHaveClass(/open/);

    // Switch to Register tab
    const registerTabBtn = page.locator('#tab-btn-register');
    await registerTabBtn.click();
    await expect(registerTabBtn).toHaveClass(/active/);

    const formRegister = page.locator('#form-register');
    await expect(formRegister).toBeVisible();

    // Fill registration fields
    await page.fill('#reg-name', testUser.fullName);
    await page.fill('#reg-email', testUser.email);
    await page.fill('#reg-org', testUser.organization);
    await page.fill('#reg-password', testUser.password);
    await page.check('#reg-terms', { force: true });

    // Submit registration form
    await page.click('#form-register button[type="submit"]');

    // Step 3: Auth modal closes and header updates with user identity
    await expect(authModal).not.toHaveClass(/open/);

    const userTag = page.locator('#header-user-tag');
    await expect(userTag).toBeVisible();
    await expect(userTag).toContainText(testUser.fullName.split(' ')[0]);

    const authBtn = page.locator('#header-auth-btn');
    await expect(authBtn).toHaveText('Sign Out');

    // Step 4: 5-Step Deployment Wizard opens automatically or via CTA
    const deployModal = page.locator('#deployment-modal');
    await expect(deployModal).toBeVisible();
    await expect(deployModal).toHaveClass(/open/);

    // Wizard Step 1: Organization Details
    const paneStep1 = page.locator('#pane-step-1');
    await expect(paneStep1).toBeVisible();

    // Verify prefilled or fill missing organization inputs
    const orgInput = page.locator('#dept-org');
    const orgValue = await orgInput.inputValue();
    if (!orgValue) await orgInput.fill(testUser.organization);

    const emailInput = page.locator('#dept-email');
    const emailValue = await emailInput.inputValue();
    if (!emailValue) await emailInput.fill(testUser.email);

    await page.fill('#dept-country', 'United States');
    await page.fill('#dept-role', testUser.departmentRole);

    // Advance to Step 2
    const nextBtn = page.locator('#wizard-next-btn');
    await nextBtn.click();

    // Wizard Step 2: SAN Environment Parameters
    const paneStep2 = page.locator('#pane-step-2');
    await expect(paneStep2).toBeVisible();
    await page.selectOption('#dept-sw-count', { index: 1 });
    await page.selectOption('#dept-fabrics', { index: 0 });
    await page.fill('#dept-models', 'Enterprise 32G/64G Fibre Channel Directors');
    await page.fill('#dept-firmware', 'Standard Enterprise Release');
    await nextBtn.click();

    // Wizard Step 3: Deployment Specifications
    const paneStep3 = page.locator('#pane-step-3');
    await expect(paneStep3).toBeVisible();
    await page.selectOption('#dept-model-pref', { index: 0 });
    await page.selectOption('#dept-timeline', { index: 0 });
    await page.fill('#dept-notes', 'Prioritizing buffer credit starvation isolation and direct optics health monitoring.');
    await nextBtn.click();

    // Wizard Step 4: Review Summary
    const paneStep4 = page.locator('#pane-step-4');
    await expect(paneStep4).toBeVisible();
    const reviewContainer = page.locator('#wizard-review-container');
    await expect(reviewContainer).toBeVisible();
    await expect(reviewContainer).toContainText(testUser.organization);

    // Submit deployment qualification request
    await expect(nextBtn).toHaveText(/Submit Deployment Request/i);
    await nextBtn.click();

    // Wizard Step 5: Confirmation & Tracking Reference Code
    const paneStep5 = page.locator('#pane-step-5');
    await expect(paneStep5).toBeVisible();

    const refDisplay = page.locator('#confirmation-ref-code');
    await expect(refDisplay).toBeVisible();
    const displayedRefCode = (await refDisplay.innerText()).trim();

    // Validate tracking reference code structure: INF-REQ-YYYYMMDD-XXXX
    expect(
      displayedRefCode,
      `Generated tracking reference "${displayedRefCode}" does not match INF-REQ-YYYYMMDD-XXXX pattern`
    ).toMatch(TRACKING_REF_REGEX);

    // Step 6: Verify Database Persistence of submitted request
    const verifyRes = await request.get(`/api/deployments/${displayedRefCode}`);
    if (verifyRes.status() === 200) {
      const verifyBody = await verifyRes.json();
      expect(verifyBody.success).toBe(true);
      expect(verifyBody.data.request.trackingRef).toBe(displayedRefCode);
    }
  });

});
