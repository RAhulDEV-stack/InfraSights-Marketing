import { test, expect } from '@playwright/test';

/**
 * Tier 5: Transactional Email Backend Service & Render Integration Spec
 * Validates Requirement R1 & Acceptance Criteria:
 * 1. Email backend service is configured and deployable on Render with functional health check
 * 2. General email dispatch endpoint handles transactional emails
 * 3. Deployment qualification endpoint handles user confirmation and ops notification
 * 4. Submitting a qualification request triggers transactional email handling
 * 5. Strict Zero-AI and Vendor-Neutral guardrails on email subjects and templates
 */

const TRACKING_REF_REGEX = /^INF-REQ-\d{8}-[A-Z0-9]{4}$/;
const FORBIDDEN_AI_REGEX = /\b(AI|ML|machine[\s-]*learning|neural|deep[\s-]*learning|copilot|predictive)\b/i;
const FORBIDDEN_VENDOR_REGEX = /\b(Brocade|Cisco|MDS|SANnav|Fabric[\s-]*OS|NX[\s-]*OS|X7|G620|9710)\b/i;

test.describe('Tier 5: Transactional Email Service & Render Integration', () => {

  test('Mail Service Health Check Probe (/api/mail/health)', async ({ request }) => {
    const res = await request.get('/api/mail/health');
    expect(res.status()).toBe(200);

    const body = await res.json();
    expect(body.status).toBe('HEALTHY');
    expect(body.service).toBe('infrasights-mail-service');
    expect(body.version).toBe('1.0.0');
    expect(body.outboxStats).toBeDefined();
  });

  test('Transactional Mail Dispatch Endpoint (/api/mail/send)', async ({ request }) => {
    // 1. Validation error when required fields are missing
    const invalidRes = await request.post('/api/mail/send', {
      data: { to: 'admin@datacenter.org' }
    });
    expect(invalidRes.status()).toBe(400);

    // 2. Successful dispatch
    const validRes = await request.post('/api/mail/send', {
      data: {
        to: 'san.ops@datacenter.org',
        subject: 'Infrasights Telemetry Notification',
        text: 'Direct switch polling alert notification.'
      }
    });
    expect(validRes.status()).toBe(200);

    const body = await validRes.json();
    expect(body.success).toBe(true);
    expect(body.data.messageId).toMatch(/^msg-\d+-[a-f0-9]+$/);
    expect(body.data.status).toBe('DISPATCHED');
  });

  test('Deployment Qualification Email Handler (/api/mail/deployment-qualification)', async ({ request }) => {
    const qualPayload = {
      trackingRef: 'INF-REQ-20261108-E2E1',
      businessEmail: 'lead.architect@enterprisestorage.net',
      organizationName: 'Global Cloud Systems',
      departmentRole: 'Storage Architecture',
      countryRegion: 'North America',
      sanVendor: 'Multi-Vendor Enterprise Fibre Channel',
      switchCount: '31-75 Switches',
      fabricCount: '2 (Standard Dual Fabric A/B)',
      deploymentModel: 'On-Premises Virtual Appliance',
      timeline: '1-3 Months',
      notes: 'Direct switch telemetry and buffer credit starvation monitoring.'
    };

    const res = await request.post('/api/mail/deployment-qualification', {
      data: qualPayload
    });
    expect(res.status()).toBe(200);

    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.trackingRef).toBe('INF-REQ-20261108-E2E1');
    expect(body.emails.confirmation.to).toBe(qualPayload.businessEmail.toLowerCase());
    expect(body.emails.confirmation.status).toBe('DISPATCHED');
    expect(body.emails.notification.status).toBe('DISPATCHED');
  });

  test('End-to-End Funnel: Deployment Submission Automatically Triggers Render Mail Dispatch', async ({ request }) => {
    const timestamp = Date.now();
    const testUser = {
      fullName: 'Devon Vance',
      email: `devon.vance.${timestamp}@storageops.org`,
      organization: 'Apex SAN Networks',
      departmentRole: 'SAN Infrastructure Lead',
      password: 'EnterprisePassword2026!',
    };

    // 1. Register user
    const regRes = await request.post('/api/auth/register', { data: testUser });
    expect(regRes.status()).toBe(201);
    const regBody = await regRes.json();
    const token = regBody.data.token;

    // 2. Submit deployment qualification
    const qualData = {
      organizationName: testUser.organization,
      businessEmail: testUser.email,
      countryRegion: 'Europe / Frankfurt',
      departmentRole: testUser.departmentRole,
      sanVendor: 'Heterogeneous Multi-Vendor Fabric',
      switchCount: '11-30 Switches',
      fabricCount: '2 (Dual Fabric A/B)',
      deploymentModel: 'On-Premises Virtual Appliance (VMware/KVM)',
      timeline: '1-3 Months',
      notes: 'Testing email dispatch trigger from qualification submission.'
    };

    const deployRes = await request.post('/api/deployments', {
      headers: { Authorization: `Bearer ${token}` },
      data: qualData
    });
    expect(deployRes.status()).toBe(201);

    const deployBody = await deployRes.json();
    expect(deployBody.success).toBe(true);
    expect(deployBody.data.trackingRef).toMatch(TRACKING_REF_REGEX);
    expect(deployBody.data.emailNotification).toBeDefined();
    expect(deployBody.data.emailNotification.dispatched).toBe(true);

    const ref = deployBody.data.trackingRef;

    // 3. Inspect transactional mail outbox to confirm email was handled
    const historyRes = await request.get('/api/mail/history?limit=10');
    expect(historyRes.status()).toBe(200);

    const historyBody = await historyRes.json();
    expect(historyBody.success).toBe(true);
    expect(Array.isArray(historyBody.data)).toBe(true);

    const matchingConfirmation = historyBody.data.find(
      (m: { to: string; type: string; subject: string }) =>
        m.to === testUser.email.toLowerCase() &&
        m.type === 'DEPLOYMENT_CONFIRMATION' &&
        m.subject.includes(ref)
    );
    expect(matchingConfirmation).toBeDefined();
    expect(matchingConfirmation.status).toBe('DISPATCHED');

    // 4. Content Guardrail Audit: Dispatched email must contain zero forbidden buzzwords
    expect(matchingConfirmation.subject).not.toMatch(FORBIDDEN_AI_REGEX);
    expect(matchingConfirmation.subject).not.toMatch(FORBIDDEN_VENDOR_REGEX);
    if (matchingConfirmation.text) {
      expect(matchingConfirmation.text).not.toMatch(FORBIDDEN_AI_REGEX);
      expect(matchingConfirmation.text).not.toMatch(FORBIDDEN_VENDOR_REGEX);
    }
  });

});
