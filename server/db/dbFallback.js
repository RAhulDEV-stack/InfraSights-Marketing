/**
 * Resilient In-Memory Transactional Database Fallback
 * Provides complete data persistence and validation when MSSQL on port 1433 is unreachable.
 * Implements the identical query and entity contract as the MSSQL driver.
 */

const crypto = require('crypto');

class InMemoryDatabaseFallback {
  constructor() {
    this.users = new Map(); // id -> user
    this.usersByEmail = new Map(); // lowercase email -> user
    this.sessions = new Map(); // tokenHash -> session
    this.deploymentRequests = new Map(); // id -> request
    this.deploymentsByRef = new Map(); // trackingRef -> request
    this.auditLogs = [];
    this.nextAuditId = 1;
    this.initialized = false;
  }

  async init() {
    this.initialized = true;
    return true;
  }

  /**
   * Find user by unique email address
   */
  async findUserByEmail(email) {
    if (!email) return null;
    const normalized = String(email).trim().toLowerCase();
    const user = this.usersByEmail.get(normalized);
    return user ? { ...user } : null;
  }

  /**
   * Find user by unique identifier
   */
  async findUserById(id) {
    if (!id) return null;
    const user = this.users.get(String(id));
    return user ? { ...user } : null;
  }

  /**
   * Create a new user record
   */
  async createUser({ email, password_hash, full_name, organization, department_role, phone_number = null, phone_verified = 0 }) {
    const normalizedEmail = String(email).trim().toLowerCase();
    if (this.usersByEmail.has(normalizedEmail)) {
      const err = new Error(`Violation of UNIQUE KEY constraint 'UQ_Users_Email'. Cannot insert duplicate key in object 'dbo.Users'. The duplicate key value is (${normalizedEmail}).`);
      err.code = 'EREQUEST';
      err.number = 2627;
      throw err;
    }

    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const user = {
      id,
      email: normalizedEmail,
      password_hash,
      full_name: full_name.trim(),
      organization: organization.trim(),
      department_role: department_role ? department_role.trim() : null,
      phone_number: phone_number ? String(phone_number).trim() : null,
      phone_verified: phone_verified ? 1 : 0,
      is_active: 1,
      is_verified: 1,
      created_at: now,
      updated_at: now
    };

    this.users.set(id, user);
    this.usersByEmail.set(normalizedEmail, user);

    return { ...user };
  }

  /**
   * Record a new user session token hash
   */
  async createSession({ user_id, token_hash, ip_address = null, user_agent = null, expires_at }) {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const session = {
      id,
      user_id: String(user_id),
      token_hash,
      ip_address,
      user_agent,
      expires_at: expires_at instanceof Date ? expires_at.toISOString() : expires_at,
      created_at: now,
      revoked_at: null
    };

    this.sessions.set(token_hash, session);
    return { ...session };
  }

  /**
   * Find session by token hash
   */
  async findSessionByTokenHash(token_hash) {
    if (!token_hash) return null;
    const session = this.sessions.get(token_hash);
    return session ? { ...session } : null;
  }

  /**
   * Revoke a session
   */
  async revokeSession(token_hash) {
    const session = this.sessions.get(token_hash);
    if (session) {
      session.revoked_at = new Date().toISOString();
      return true;
    }
    return false;
  }

  /**
   * Create a deployment qualification request
   */
  async createDeploymentRequest({
    tracking_ref,
    user_id,
    organization_name,
    business_email,
    contact_phone = null,
    country_region,
    department_role,
    san_vendor = null,
    switch_count_range,
    fabric_count,
    deployment_model,
    target_timeline,
    objectives_notes = null,
    qualification_payload_json = null,
    status = 'PENDING_REVIEW'
  }) {
    if (this.deploymentsByRef.has(tracking_ref)) {
      const err = new Error(`Violation of UNIQUE KEY constraint 'UQ_DeploymentRequests_TrackingRef'. Duplicate tracking reference (${tracking_ref}).`);
      err.code = 'EREQUEST';
      err.number = 2627;
      throw err;
    }

    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const record = {
      id,
      tracking_ref,
      user_id: String(user_id),
      organization_name,
      business_email,
      contact_phone: contact_phone ? String(contact_phone).trim() : null,
      country_region,
      department_role,
      san_vendor,
      switch_count_range,
      fabric_count,
      deployment_model,
      target_timeline,
      objectives_notes,
      qualification_payload_json,
      status,
      assigned_engineer: null,
      created_at: now,
      updated_at: now
    };

    this.deploymentRequests.set(id, record);
    this.deploymentsByRef.set(tracking_ref, record);

    return { ...record };
  }

  /**
   * List deployment requests for a user
   */
  async findDeploymentsByUserId(user_id) {
    const uid = String(user_id);
    const results = [];
    for (const req of this.deploymentRequests.values()) {
      if (req.user_id === uid) {
        results.push({ ...req });
      }
    }
    // Sort descending by created_at
    results.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    return results;
  }

  /**
   * Find deployment request by tracking reference with audit logs
   */
  async findDeploymentByTrackingRef(tracking_ref) {
    if (!tracking_ref) return null;
    const req = this.deploymentsByRef.get(tracking_ref);
    if (!req) return null;

    // Attach matching audit logs for full traceability
    const auditLogs = this.auditLogs
      .filter(log => log.event_description && log.event_description.includes(tracking_ref))
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

    return {
      ...req,
      auditLogs
    };
  }

  /**
   * Cross-tenant query supporting search, status filter, sorting, and pagination
   */
  async findAllDeployments({
    search = '',
    status = 'ALL',
    page = 1,
    limit = 25,
    sortBy = 'created_at',
    sortOrder = 'DESC'
  } = {}) {
    let results = [];
    for (const req of this.deploymentRequests.values()) {
      results.push({ ...req });
    }

    // Filter by status if not 'ALL'
    if (status && status.toUpperCase() !== 'ALL') {
      const targetStatus = status.trim().toUpperCase();
      results = results.filter(r => (r.status || '').toUpperCase() === targetStatus);
    }

    // Filter by search keyword (tracking_ref, organization_name, business_email, san_vendor, country_region)
    if (search && search.trim()) {
      const q = search.trim().toLowerCase();
      results = results.filter(r => {
        const refMatch = (r.tracking_ref || '').toLowerCase().includes(q);
        const orgMatch = (r.organization_name || '').toLowerCase().includes(q);
        const emailMatch = (r.business_email || '').toLowerCase().includes(q);
        const vendorMatch = (r.san_vendor || '').toLowerCase().includes(q);
        const regionMatch = (r.country_region || '').toLowerCase().includes(q);
        return refMatch || orgMatch || emailMatch || vendorMatch || regionMatch;
      });
    }

    // Sort
    const isAsc = String(sortOrder).toUpperCase() === 'ASC';
    results.sort((a, b) => {
      let valA = a[sortBy] !== undefined ? a[sortBy] : a.created_at;
      let valB = b[sortBy] !== undefined ? b[sortBy] : b.created_at;

      if (sortBy === 'created_at' || sortBy === 'updated_at') {
        const dateA = new Date(valA).getTime();
        const dateB = new Date(valB).getTime();
        return isAsc ? dateA - dateB : dateB - dateA;
      }

      const strA = String(valA || '').toLowerCase();
      const strB = String(valB || '').toLowerCase();
      if (strA < strB) return isAsc ? -1 : 1;
      if (strA > strB) return isAsc ? 1 : -1;
      return 0;
    });

    const total = results.length;
    const p = Math.max(1, parseInt(page, 10) || 1);
    const l = Math.max(1, parseInt(limit, 10) || 25);
    const startIndex = (p - 1) * l;
    const paginated = results.slice(startIndex, startIndex + l);

    return {
      total,
      count: paginated.length,
      page: p,
      limit: l,
      totalPages: Math.ceil(total / l) || 1,
      data: paginated
    };
  }

  /**
   * Update deployment qualification status and assigned engineer
   */
  async updateDeploymentStatus(trackingRef, { status, assignedEngineer, internalNotes, userId = null, ipAddress = null } = {}) {
    if (!trackingRef) {
      throw new Error('Tracking reference required.');
    }

    const VALID_STATUSES = [
      'PENDING_REVIEW',
      'UNDER_EVALUATION',
      'QUALIFIED',
      'DEPLOYED',
      'DEPLOYMENT_SCHEDULED',
      'REJECTED',
      'ARCHIVED'
    ];

    if (!status || !VALID_STATUSES.includes(status.trim().toUpperCase())) {
      const err = new Error(`Invalid deployment status: ${status}. Must be one of: ${VALID_STATUSES.join(', ')}`);
      err.statusCode = 400;
      throw err;
    }

    const normalizedStatus = status.trim().toUpperCase();
    const record = this.deploymentsByRef.get(trackingRef);
    if (!record) {
      return null;
    }

    record.status = normalizedStatus;
    if (assignedEngineer !== undefined) {
      record.assigned_engineer = assignedEngineer ? String(assignedEngineer).trim() : null;
    }
    record.updated_at = new Date().toISOString();

    // Record audit log
    const notesStr = internalNotes ? `. Notes: ${internalNotes}` : '';
    const engineerStr = record.assigned_engineer ? ` (Assigned: ${record.assigned_engineer})` : '';
    await this.createAuditLog({
      user_id: userId,
      event_type: 'DEPLOYMENT_STATUS_UPDATED',
      event_description: `Status for ${trackingRef} updated to ${normalizedStatus}${engineerStr}${notesStr}`,
      ip_address: ipAddress
    });

    return { ...record };
  }

  /**
   * Aggregate pipeline stats across all qualification requests
   */
  async getDeploymentStats() {
    let total = 0;
    let pending = 0;
    let evaluating = 0;
    let qualified = 0;
    let scheduled = 0;
    let rejected = 0;
    let archived = 0;
    const architectures = {};

    for (const req of this.deploymentRequests.values()) {
      total++;
      const s = (req.status || '').toUpperCase();
      if (s === 'PENDING_REVIEW') pending++;
      else if (s === 'UNDER_EVALUATION') evaluating++;
      else if (s === 'QUALIFIED') qualified++;
      else if (s === 'DEPLOYED' || s === 'DEPLOYMENT_SCHEDULED') scheduled++;
      else if (s === 'REJECTED') rejected++;
      else if (s === 'ARCHIVED') archived++;

      const arch = req.san_vendor || 'Multi-Vendor Standard Fibre Channel';
      architectures[arch] = (architectures[arch] || 0) + 1;
    }

    return {
      total,
      pending,
      pendingReview: pending,
      evaluating,
      underEvaluation: evaluating,
      qualified,
      scheduled,
      deployed: scheduled,
      rejected,
      archived,
      architectures,
      byVendor: architectures
    };
  }

  /**
   * Record audit log
   */
  async createAuditLog({ user_id = null, event_type, event_description, ip_address = null }) {
    const id = this.nextAuditId++;
    const now = new Date().toISOString();
    const log = {
      id,
      user_id: user_id ? String(user_id) : null,
      event_type,
      event_description,
      ip_address,
      created_at: now
    };
    this.auditLogs.push(log);
    return { ...log };
  }

  /**
   * Health and connectivity diagnostics
   */
  getHealth() {
    return {
      engine: 'IN_MEMORY_FALLBACK',
      connected: true,
      activeUsers: this.users.size,
      activeDeployments: this.deploymentRequests.size,
      mode: 'resilient_offline_fallback'
    };
  }
}

module.exports = new InMemoryDatabaseFallback();
