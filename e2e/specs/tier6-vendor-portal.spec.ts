import { test, expect } from '@playwright/test';

/**
 * Tier 6: Server-Side Vendor Management Portal & Authenticated API Test Suite
 * Validates Requirement R1 & Acceptance Criteria:
 * 1. Vendor authentication tests:
 *    - Unauthenticated access to /vendor redirects (302) to /vendor/login
 *    - Unauthenticated access to /api/vendor/deployments returns 401 Unauthorized
 *    - Customer Bearer JWT accessing /api/vendor/deployments returns 403 Forbidden ("Vendor administrative privileges required")
 *    - Direct API call with X-Vendor-Key or X-Admin-Key succeeds (200 OK)
 *    - UI login with secret key (infrasights-vendor-secret-2026) sets cookie and accesses /vendor
 *    - UI login with admin credentials (admin@infrasights.in / InfrasightsAdmin2026!) sets cookie and accesses /vendor
 *    - Invalid credentials or secret key display error message
 *    - Vendor logout terminates session and redirects to /vendor/login
 * 2. Vendor dashboard UI & Management tests:
 *    - Dashboard displays top KPI cards (Total Requests, Pending Review, Under Evaluation, Qualified, Deployed)
 *    - Dashboard displays submitted qualification requests in responsive table with tracking ref badge (INF-REQ-YYYYMMDD-XXXX)
 *    - Search input filters table rows by organization name, email, or tracking reference
 *    - Status dropdown filters table rows by lifecycle state (e.g. PENDING_REVIEW, QUALIFIED)
 *    - Clicking "Inspect" button opens detail inspection drawer showing full customer SAN configuration, switch counts, fabric counts, deployment model, and raw payload
 *    - Status updater in detail drawer updates request status (e.g. to UNDER_EVALUATION or QUALIFIED) and reflects updated status badge in UI
 */

const VENDOR_SECRET = process.env.VENDOR_SECRET_KEY || 'infrasights-vendor-secret-2026';
const ADMIN_EMAIL = process.env.VENDOR_ADMIN_EMAIL || 'admin@infrasights.in';
const ADMIN_PASSWORD = process.env.VENDOR_ADMIN_PASSWORD || 'InfrasightsVendorAdmin2026!';
const TRACKING_REF_REGEX = /^INF-REQ-\d{8}-[A-Z0-9]{4}$/;

test.describe('Tier 6: Vendor Portal Authentication & RBAC Gates', () => {

  test('Unauthenticated access to /vendor redirects (302) to /vendor/login', async ({ page, request }) => {
    // 1. Direct HTTP probe with manual redirect handling to verify 302 Foundation
    const rawRes = await request.get('/vendor', { maxRedirects: 0 });
    expect(rawRes.status()).toBe(302);
    const location = rawRes.headers()['location'];
    expect(location).toMatch(/\/vendor\/login/);

    // 2. Full browser navigation follows redirect to login page
    await page.goto('/vendor');
    await expect(page).toHaveURL(/\/vendor\/login(\?returnTo=.*)?/);
    await expect(page.locator('h1.brand-title')).toHaveText('Infrasights Vendor Console');
    await expect(page.locator('#tab-secret')).toBeVisible();
    await expect(page.locator('#tab-admin')).toBeVisible();
  });

  test('Unauthenticated access to /api/vendor/deployments returns 401 Unauthorized', async ({ request }) => {
    const res = await request.get('/api/vendor/deployments');
    expect(res.status()).toBe(401);

    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error).toMatch(/vendor authentication required/i);
  });

  test('Customer Bearer JWT accessing /api/vendor/deployments returns 403 Forbidden', async ({ request }) => {
    const timestamp = Date.now();
    const customerUser = {
      fullName: 'Standard Customer',
      email: `cust.${timestamp}@storagecorp.com`,
      organization: 'Storage Corp',
      departmentRole: 'SAN Admin',
      password: 'CustomerSecure2026!',
    };

    // 1. Register a standard non-vendor customer
    const regRes = await request.post('/api/auth/register', { data: customerUser });
    expect(regRes.status()).toBe(201);
    const regBody = await regRes.json();
    const customerToken = regBody.data.token;
    expect(customerToken).toBeDefined();

    // 2. Attempt to access vendor API endpoint using customer token
    const vendorRes = await request.get('/api/vendor/deployments', {
      headers: {
        Authorization: `Bearer ${customerToken}`,
      },
    });

    expect(vendorRes.status()).toBe(403);
    const vendorBody = await vendorRes.json();
    expect(vendorBody.success).toBe(false);
    expect(vendorBody.error).toBe('Vendor administrative privileges required.');
  });

  test('Direct API call with X-Vendor-Key or X-Admin-Key succeeds (200 OK)', async ({ request }) => {
    // 1. Authenticate with X-Vendor-Key
    const vendorKeyRes = await request.get('/api/vendor/deployments', {
      headers: {
        'X-Vendor-Key': VENDOR_SECRET,
      },
    });
    expect(vendorKeyRes.status()).toBe(200);
    const vendorKeyBody = await vendorKeyRes.json();
    expect(vendorKeyBody.success).toBe(true);
    expect(Array.isArray(vendorKeyBody.data)).toBe(true);

    // 2. Authenticate with X-Admin-Key
    const adminKeyRes = await request.get('/api/vendor/deployments', {
      headers: {
        'X-Admin-Key': VENDOR_SECRET,
      },
    });
    expect(adminKeyRes.status()).toBe(200);
    const adminKeyBody = await adminKeyRes.json();
    expect(adminKeyBody.success).toBe(true);
    expect(Array.isArray(adminKeyBody.data)).toBe(true);
  });

  test('UI login with secret key (infrasights-vendor-secret-2026) sets cookie and accesses /vendor', async ({ page }) => {
    await page.goto('/vendor/login');

    // Ensure secret key tab is active
    await page.locator('#tab-secret').click();
    await page.locator('#secretKey').fill(VENDOR_SECRET);
    await page.locator('#btn-submit-secret').click();

    // Wait for redirect to dashboard
    await page.waitForURL('**/vendor');
    await expect(page.locator('h1.page-title')).toHaveText('Deployment Qualification Management');

    // Verify session cookie was set
    const cookies = await page.context().cookies();
    const vendorCookie = cookies.find((c) => c.name === 'infrasights_vendor_token');
    expect(vendorCookie).toBeDefined();
    expect(vendorCookie!.value.length).toBeGreaterThan(20);
  });

  test('UI login with admin credentials (admin@infrasights.in) sets cookie and accesses /vendor', async ({ page }) => {
    await page.goto('/vendor/login');

    // Switch to admin credentials tab
    await page.locator('#tab-admin').click();
    await expect(page.locator('#admin-form')).toBeVisible();

    await page.locator('#email').fill(ADMIN_EMAIL);
    await page.locator('#password').fill(ADMIN_PASSWORD);
    await page.locator('#btn-submit-admin').click();

    // Wait for redirect to dashboard
    await page.waitForURL('**/vendor');
    await expect(page.locator('.navbar .brand-title')).toHaveText('Infrasights Vendor Console');
    await expect(page.locator('.navbar .user-tag')).toContainText(ADMIN_EMAIL);
  });

  test('Invalid credentials or secret key display error message', async ({ page }) => {
    await page.goto('/vendor/login');

    // 1. Invalid secret key
    await page.locator('#tab-secret').click();
    await page.locator('#secretKey').fill('completely-wrong-vendor-key');
    await page.locator('#btn-submit-secret').click();

    const errorBanner = page.locator('#error-banner');
    await expect(errorBanner).toBeVisible();
    await expect(errorBanner).toContainText(/invalid vendor secret key|failed/i);

    // 2. Invalid admin credentials
    await page.locator('#tab-admin').click();
    await page.locator('#email').fill('admin@infrasights.in');
    await page.locator('#password').fill('InvalidPassword2026!');
    await page.locator('#btn-submit-admin').click();

    await expect(errorBanner).toBeVisible();
    await expect(errorBanner).toContainText(/invalid vendor|failed/i);
  });

  test('Vendor logout terminates session and redirects to /vendor/login', async ({ page }) => {
    // 1. Log in first with secret key
    await page.goto('/vendor/login');
    await page.locator('#tab-secret').click();
    await page.locator('#secretKey').fill(VENDOR_SECRET);
    await page.locator('#btn-submit-secret').click();
    await page.waitForURL('**/vendor');

    // 2. Click sign out button
    const logoutBtn = page.locator('.logout-btn');
    await expect(logoutBtn).toBeVisible();
    await Promise.all([
      page.waitForURL(/\/vendor\/login/),
      logoutBtn.click({ force: true }),
    ]);

    // 3. Verify redirected to /vendor/login
    await expect(page.locator('h1.brand-title')).toHaveText('Infrasights Vendor Console');

    // 4. Verify accessing /vendor again redirects back to login
    await page.goto('/vendor');
    await expect(page).toHaveURL(/\/vendor\/login/);
  });
});

test.describe('Tier 6: Vendor Dashboard UI, Inspection & Management', () => {

  test.beforeEach(async ({ page, request }) => {
    // Seed at least one fresh qualification request to ensure table and details have data
    const timestamp = Date.now();
    const seedPayload = {
      organizationName: `Enterprise Storage Node ${timestamp}`,
      businessEmail: `san.ops.${timestamp}@seed-datacenter.io`,
      countryRegion: 'Europe (Frankfurt)',
      departmentRole: 'Infrastructure Director',
      sanVendor: 'Enterprise Multi-Switch Fabric',
      switchCount: '76-150 Switches',
      fabricCount: '4 (Core-Edge Multi-Fabric)',
      deploymentModel: 'Air-Gapped On-Premises Appliance',
      timeline: 'Immediate (< 1 Month)',
      notes: 'Automated Tier 6 verification payload for end-to-end inspection.',
    };

    // Register a temp user to submit the request
    const userRes = await request.post('/api/auth/register', {
      data: {
        fullName: 'Seed User',
        email: seedPayload.businessEmail,
        organization: seedPayload.organizationName,
        departmentRole: seedPayload.departmentRole,
        password: 'PasswordSeed2026!',
      },
    });
    const userBody = await userRes.json();
    const token = userBody.data.token;

    // Submit deployment
    await request.post('/api/deployments', {
      headers: { Authorization: `Bearer ${token}` },
      data: seedPayload,
    });

    // Authenticate vendor session via UI
    await page.goto('/vendor/login');
    await page.locator('#tab-secret').click();
    await page.locator('#secretKey').fill(VENDOR_SECRET);
    await page.locator('#btn-submit-secret').click();
    await page.waitForURL('**/vendor');
  });

  test('Dashboard displays top KPI cards (Total Requests, Pending Review, Under Evaluation, Qualified, Deployed)', async ({ page }) => {
    // Verify stats grid visibility
    const statsGrid = page.locator('.stats-grid');
    await expect(statsGrid).toBeVisible();

    // Verify all 5 KPI cards
    const totalStat = page.locator('#stat-total');
    const pendingStat = page.locator('#stat-pending');
    const evalStat = page.locator('#stat-evaluating');
    const qualifiedStat = page.locator('#stat-qualified');
    const scheduledStat = page.locator('#stat-scheduled');

    await expect(totalStat).toBeVisible();
    await expect(pendingStat).toBeVisible();
    await expect(evalStat).toBeVisible();
    await expect(qualifiedStat).toBeVisible();
    await expect(scheduledStat).toBeVisible();

    // Check that values are numerical
    const totalVal = parseInt(await totalStat.innerText(), 10);
    expect(totalVal).toBeGreaterThan(0);

    const pendingVal = parseInt(await pendingStat.innerText(), 10);
    expect(pendingVal).toBeGreaterThanOrEqual(0);
  });

  test('Dashboard displays submitted qualification requests in responsive table with tracking ref badge', async ({ page }) => {
    const table = page.locator('.table-container table');
    await expect(table).toBeVisible();

    // Check headers
    const headers = page.locator('.table-container th');
    await expect(headers.nth(0)).toContainText('Tracking Reference');
    await expect(headers.nth(1)).toContainText('Organization');
    await expect(headers.nth(2)).toContainText('Business Email');
    await expect(headers.nth(5)).toContainText('Lifecycle Status');

    // Verify at least one row with valid tracking ref badge
    const firstRowRef = page.locator('#deployments-table-body tr .mono-ref').first();
    await expect(firstRowRef).toBeVisible();
    const refText = await firstRowRef.innerText();
    expect(refText).toMatch(TRACKING_REF_REGEX);
  });

  test('Search input filters table rows by organization name, email, or tracking reference', async ({ page }) => {
    // Get the first row's organization text to use as search keyword
    const firstOrgEl = page.locator('#deployments-table-body tr strong').first();
    const targetOrg = (await firstOrgEl.innerText()).trim();

    // Search by organization
    const searchInput = page.locator('#search-input');
    await searchInput.fill(targetOrg);
    await Promise.all([
      page.waitForURL(/search=/),
      searchInput.press('Enter'),
    ]);

    // Assert filtered table displays matching row
    const matchingRows = page.locator('#deployments-table-body tr strong');
    const count = await matchingRows.count();
    expect(count).toBeGreaterThanOrEqual(1);
    for (let i = 0; i < count; i++) {
      await expect(matchingRows.nth(i)).toContainText(targetOrg);
    }
  });

  test('Status dropdown filters table rows by lifecycle state', async ({ page }) => {
    // Filter by PENDING_REVIEW
    const statusSelect = page.locator('#status-filter');
    await statusSelect.selectOption('PENDING_REVIEW');
    await Promise.all([
      page.waitForURL(/status=PENDING_REVIEW/),
      page.locator('.filter-btn').click({ force: true }),
    ]);
    await expect(page).toHaveURL(/status=PENDING_REVIEW/);

    const badges = page.locator('#deployments-table-body tr .badge');
    const badgeCount = await badges.count();
    if (badgeCount > 0) {
      for (let i = 0; i < badgeCount; i++) {
        await expect(badges.nth(i)).toHaveText('Pending Review');
      }
    }
  });

  test('Clicking "Inspect" button opens detail inspection drawer showing full SAN configuration', async ({ page }) => {
    // Click inspect on the first row
    const inspectBtn = page.locator('#deployments-table-body tr .action-btn').first();
    await inspectBtn.click({ force: true });

    // Modal drawer becomes visible
    const modal = page.locator('#inspect-modal');
    await expect(modal).toHaveClass(/active/);

    // Verify modal elements are populated
    const modalRef = page.locator('#modal-ref');
    await expect(modalRef).toBeVisible();
    const refText = await modalRef.innerText();
    expect(refText).toMatch(TRACKING_REF_REGEX);

    await expect(page.locator('#modal-org')).not.toHaveText('-');
    await expect(page.locator('#modal-email')).not.toHaveText('-');
    await expect(page.locator('#modal-vendor')).not.toHaveText('-');
    await expect(page.locator('#modal-switches')).not.toHaveText('-');
    await expect(page.locator('#modal-fabrics')).not.toHaveText('-');
    await expect(page.locator('#modal-model')).not.toHaveText('-');

    // Verify raw JSON pre block contains valid parsed JSON
    const rawJsonEl = page.locator('#modal-raw-json');
    await expect(rawJsonEl).toBeVisible();
    const rawText = await rawJsonEl.innerText();
    const parsed = JSON.parse(rawText);
    expect(parsed).toBeDefined();
    expect(typeof parsed).toBe('object');

    // Close modal
    await page.locator('.modal-close').click({ force: true });
    await expect(modal).not.toHaveClass(/active/);
  });

  test('Status updater in detail drawer updates request status and reflects updated status badge in UI', async ({ page }) => {
    // 1. Get first row's tracking ref
    const firstRowRefEl = page.locator('#deployments-table-body tr .mono-ref').first();
    const ref = (await firstRowRefEl.innerText()).trim();

    // 2. Click inspect on that row
    const inspectBtn = page.locator(`#row-${ref} .action-btn`);
    await inspectBtn.click({ force: true });

    const modal = page.locator('#inspect-modal');
    await expect(modal).toHaveClass(/active/);

    // 3. Select QUALIFIED status and add engineer assignment
    const statusSelect = page.locator('#modal-status-select');
    await statusSelect.selectOption('QUALIFIED');

    const engineerInput = page.locator('#modal-engineer-input');
    await engineerInput.fill('Senior SAN Architect Alex');

    const notesInput = page.locator('#modal-internal-notes');
    await notesInput.fill('E2E qualification validated. Ready for deployment scheduling.');

    // 4. Submit update
    const saveBtn = page.locator('#btn-save-status');
    await saveBtn.click({ force: true });

    // 5. Verify success toast notification
    const toast = page.locator('#toast-msg');
    await expect(toast).toBeVisible();
    await expect(toast).toHaveClass(/toast-success/);
    await expect(toast).toContainText(/updated to QUALIFIED/i);

    // 6. Close modal
    await page.locator('.modal-close').click({ force: true });
    await expect(modal).not.toHaveClass(/active/);

    // 7. Verify table row badge updated dynamically to Qualified
    const tableBadge = page.locator(`#badge-${ref} .badge`);
    await expect(tableBadge).toHaveText('Qualified');
  });
});
