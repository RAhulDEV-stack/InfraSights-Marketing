/**
 * Database Configuration & Connection Pool Manager
 * Connects to Microsoft SQL Server via tedious (TDS protocol) over TCP Port 1433.
 * Automatically runs migrations.sql on startup.
 * Automatically activates resilient in-memory transactional store if Port 1433 is unreachable.
 */

const fs = require('fs');
const path = require('path');
const sql = require('mssql');
const dbFallback = require('../db/dbFallback');

class DatabaseManager {
  constructor() {
    this.pool = null;
    this.activeEngine = 'INITIALIZING';
    this.isFallback = false;
    this.initPromise = null;
  }

  async init() {
    if (this.initPromise) return this.initPromise;
    this.initPromise = this._connect();
    return this.initPromise;
  }

  async _connect() {
    const config = {
      user: process.env.MSSQL_USER || 'sa',
      password: process.env.MSSQL_PASSWORD || 'Infrasights2026!',
      server: process.env.MSSQL_HOST || '127.0.0.1',
      port: parseInt(process.env.MSSQL_PORT || '1433', 10),
      database: process.env.MSSQL_DATABASE || 'infrasights_db',
      options: {
        encrypt: process.env.MSSQL_ENCRYPT === 'true',
        trustServerCertificate: true,
        connectTimeout: parseInt(process.env.MSSQL_CONNECT_TIMEOUT || '2000', 10)
      },
      pool: {
        max: 10,
        min: 0,
        idleTimeoutMillis: 30000
      }
    };

    try {
      console.log(`[Database] Attempting connection to Microsoft SQL Server at ${config.server}:${config.port}...`);
      this.pool = await new sql.ConnectionPool(config).connect();
      this.activeEngine = 'MSSQL';
      this.isFallback = false;
      console.log('[Database] Connected successfully to Microsoft SQL Server.');

      // Execute migrations.sql
      await this._runMigrations();
    } catch (err) {
      console.warn(`[Database] Port 1433 MSSQL connection unavailable (${err.message}). Activating resilient in-memory transactional fallback store.`);
      await dbFallback.init();
      this.activeEngine = 'IN_MEMORY_FALLBACK';
      this.isFallback = true;
    }

    return this;
  }

  async _runMigrations() {
    try {
      const migrationPath = path.join(__dirname, '..', 'db', 'migrations.sql');
      if (fs.existsSync(migrationPath)) {
        const sqlContent = fs.readFileSync(migrationPath, 'utf8');
        // Split by statement or execute as a batch
        const request = this.pool.request();
        await request.batch(sqlContent);
        console.log('[Database] migrations.sql executed successfully.');
      }
    } catch (migErr) {
      console.error('[Database] Migration warning:', migErr.message);
    }
  }

  // =========================================================================
  // Repository Methods (Seamlessly routed to MSSQL or Fallback Store)
  // =========================================================================

  async findUserByEmail(email) {
    if (!email) return null;
    const normalized = String(email).trim().toLowerCase();

    if (this.isFallback) {
      return dbFallback.findUserByEmail(normalized);
    }

    const request = this.pool.request();
    request.input('email', sql.NVarChar(255), normalized);
    const result = await request.query(`
      SELECT TOP 1 id, email, password_hash, full_name, organization, department_role, is_active, is_verified, created_at, updated_at
      FROM dbo.Users
      WHERE email = @email
    `);
    return result.recordset[0] || null;
  }

  async findUserById(id) {
    if (!id) return null;

    if (this.isFallback) {
      return dbFallback.findUserById(id);
    }

    const request = this.pool.request();
    request.input('id', sql.UniqueIdentifier, id);
    const result = await request.query(`
      SELECT TOP 1 id, email, password_hash, full_name, organization, department_role, is_active, is_verified, created_at, updated_at
      FROM dbo.Users
      WHERE id = @id
    `);
    return result.recordset[0] || null;
  }

  async createUser({ email, password_hash, full_name, organization, department_role, phone_number = null, phone_verified = 0 }) {
    const normalizedEmail = String(email).trim().toLowerCase();

    if (this.isFallback) {
      return dbFallback.createUser({
        email: normalizedEmail,
        password_hash,
        full_name,
        organization,
        department_role,
        phone_number,
        phone_verified
      });
    }

    const request = this.pool.request();
    request.input('email', sql.NVarChar(255), normalizedEmail);
    request.input('password_hash', sql.NVarChar(255), password_hash);
    request.input('full_name', sql.NVarChar(150), full_name.trim());
    request.input('organization', sql.NVarChar(150), organization.trim());
    request.input('department_role', sql.NVarChar(100), department_role ? department_role.trim() : null);
    request.input('phone_number', sql.NVarChar(50), phone_number ? String(phone_number).trim() : null);
    request.input('phone_verified', sql.Bit, phone_verified ? 1 : 0);

    const result = await request.query(`
      INSERT INTO dbo.Users (email, password_hash, full_name, organization, department_role, phone_number, phone_verified)
      OUTPUT INSERTED.id, INSERTED.email, INSERTED.full_name, INSERTED.organization, INSERTED.department_role, INSERTED.phone_number, INSERTED.phone_verified, INSERTED.created_at
      VALUES (@email, @password_hash, @full_name, @organization, @department_role, @phone_number, @phone_verified)
    `);

    return result.recordset[0];
  }

  async createSession({ user_id, token_hash, ip_address = null, user_agent = null, expires_at }) {
    if (this.isFallback) {
      return dbFallback.createSession({ user_id, token_hash, ip_address, user_agent, expires_at });
    }

    const request = this.pool.request();
    request.input('user_id', sql.UniqueIdentifier, user_id);
    request.input('token_hash', sql.NVarChar(255), token_hash);
    request.input('ip_address', sql.NVarChar(45), ip_address);
    request.input('user_agent', sql.NVarChar(500), user_agent);
    request.input('expires_at', sql.DateTime2(7), expires_at instanceof Date ? expires_at : new Date(expires_at));

    const result = await request.query(`
      INSERT INTO dbo.UserSessions (user_id, token_hash, ip_address, user_agent, expires_at)
      OUTPUT INSERTED.id, INSERTED.user_id, INSERTED.token_hash, INSERTED.expires_at, INSERTED.created_at
      VALUES (@user_id, @token_hash, @ip_address, @user_agent, @expires_at)
    `);

    return result.recordset[0];
  }

  async findSessionByTokenHash(token_hash) {
    if (!token_hash) return null;

    if (this.isFallback) {
      return dbFallback.findSessionByTokenHash(token_hash);
    }

    const request = this.pool.request();
    request.input('token_hash', sql.NVarChar(255), token_hash);
    const result = await request.query(`
      SELECT TOP 1 id, user_id, token_hash, expires_at, created_at, revoked_at
      FROM dbo.UserSessions
      WHERE token_hash = @token_hash
      ORDER BY created_at DESC
    `);

    return result.recordset[0] || null;
  }

  async revokeSession(token_hash) {
    if (this.isFallback) {
      return dbFallback.revokeSession(token_hash);
    }

    const request = this.pool.request();
    request.input('token_hash', sql.NVarChar(255), token_hash);
    await request.query(`
      UPDATE dbo.UserSessions
      SET revoked_at = GETUTCDATE()
      WHERE token_hash = @token_hash
    `);
    return true;
  }

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
    if (this.isFallback) {
      return dbFallback.createDeploymentRequest({
        tracking_ref,
        user_id,
        organization_name,
        business_email,
        contact_phone,
        country_region,
        department_role,
        san_vendor,
        switch_count_range,
        fabric_count,
        deployment_model,
        target_timeline,
        objectives_notes,
        qualification_payload_json,
        status
      });
    }

    const request = this.pool.request();
    request.input('tracking_ref', sql.NVarChar(32), tracking_ref);
    request.input('user_id', sql.UniqueIdentifier, user_id);
    request.input('organization_name', sql.NVarChar(200), organization_name);
    request.input('business_email', sql.NVarChar(255), business_email);
    request.input('country_region', sql.NVarChar(100), country_region);
    request.input('department_role', sql.NVarChar(100), department_role);
    request.input('san_vendor', sql.NVarChar(100), san_vendor);
    request.input('switch_count_range', sql.NVarChar(50), switch_count_range);
    request.input('fabric_count', sql.NVarChar(50), fabric_count);
    request.input('deployment_model', sql.NVarChar(100), deployment_model);
    request.input('target_timeline', sql.NVarChar(50), target_timeline);
    request.input('objectives_notes', sql.NVarChar(sql.MAX), objectives_notes);
    request.input('qualification_payload_json', sql.NVarChar(sql.MAX), qualification_payload_json);
    request.input('status', sql.NVarChar(50), status);

    const result = await request.query(`
      INSERT INTO dbo.DeploymentRequests (
        tracking_ref, user_id, organization_name, business_email,
        country_region, department_role, san_vendor, switch_count_range,
        fabric_count, deployment_model, target_timeline, objectives_notes,
        qualification_payload_json, status
      )
      OUTPUT INSERTED.id, INSERTED.tracking_ref, INSERTED.status, INSERTED.created_at
      VALUES (
        @tracking_ref, @user_id, @organization_name, @business_email,
        @country_region, @department_role, @san_vendor, @switch_count_range,
        @fabric_count, @deployment_model, @target_timeline, @objectives_notes,
        @qualification_payload_json, @status
      )
    `);

    return result.recordset[0];
  }

  async findDeploymentsByUserId(user_id) {
    if (this.isFallback) {
      return dbFallback.findDeploymentsByUserId(user_id);
    }

    const request = this.pool.request();
    request.input('user_id', sql.UniqueIdentifier, user_id);
    const result = await request.query(`
      SELECT id, tracking_ref, organization_name, business_email, country_region, department_role,
             san_vendor, switch_count_range, fabric_count, deployment_model, target_timeline,
             objectives_notes, status, created_at, updated_at
      FROM dbo.DeploymentRequests
      WHERE user_id = @user_id
      ORDER BY created_at DESC
    `);

    return result.recordset;
  }

  async findDeploymentByTrackingRef(tracking_ref) {
    if (!tracking_ref) return null;

    if (this.isFallback) {
      return dbFallback.findDeploymentByTrackingRef(tracking_ref);
    }

    const request = this.pool.request();
    request.input('tracking_ref', sql.NVarChar(32), tracking_ref);
    const result = await request.query(`
      SELECT TOP 1 id, tracking_ref, user_id, organization_name, business_email, country_region,
                   department_role, san_vendor, switch_count_range, fabric_count, deployment_model,
                   target_timeline, objectives_notes, qualification_payload_json, status, assigned_engineer, created_at, updated_at
      FROM dbo.DeploymentRequests
      WHERE tracking_ref = @tracking_ref
    `);

    const record = result.recordset[0] || null;
    if (!record) return null;

    try {
      const auditReq = this.pool.request();
      auditReq.input('pattern', sql.NVarChar(100), `%${tracking_ref}%`);
      const auditRes = await auditReq.query(`
        SELECT id, user_id, event_type, event_description, ip_address, created_at
        FROM dbo.AuditLogs
        WHERE event_description LIKE @pattern
        ORDER BY created_at DESC
      `);
      record.auditLogs = auditRes.recordset || [];
    } catch (e) {
      record.auditLogs = [];
    }

    return record;
  }

  async findAllDeployments({
    search = '',
    status = 'ALL',
    page = 1,
    limit = 25,
    sortBy = 'created_at',
    sortOrder = 'DESC'
  } = {}) {
    if (this.isFallback) {
      return dbFallback.findAllDeployments({ search, status, page, limit, sortBy, sortOrder });
    }

    const allowedSort = ['created_at', 'updated_at', 'organization_name', 'status', 'tracking_ref'];
    const cleanSort = allowedSort.includes(sortBy) ? sortBy : 'created_at';
    const cleanOrder = String(sortOrder).toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

    const p = Math.max(1, parseInt(page, 10) || 1);
    const l = Math.max(1, parseInt(limit, 10) || 25);
    const offset = (p - 1) * l;

    const request = this.pool.request();
    let whereClauses = [];

    if (status && status.toUpperCase() !== 'ALL') {
      request.input('status', sql.NVarChar(50), status.trim().toUpperCase());
      whereClauses.push('status = @status');
    }

    if (search && search.trim()) {
      request.input('searchPattern', sql.NVarChar(255), `%${search.trim()}%`);
      whereClauses.push('(tracking_ref LIKE @searchPattern OR organization_name LIKE @searchPattern OR business_email LIKE @searchPattern OR san_vendor LIKE @searchPattern OR country_region LIKE @searchPattern)');
    }

    const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

    // Count query
    const countResult = await request.query(`
      SELECT COUNT(*) AS total
      FROM dbo.DeploymentRequests
      ${whereSql}
    `);
    const total = countResult.recordset[0]?.total || 0;

    // Data query
    request.input('offset', sql.Int, offset);
    request.input('limit', sql.Int, l);
    const dataResult = await request.query(`
      SELECT id, tracking_ref, user_id, organization_name, business_email, country_region,
             department_role, san_vendor, switch_count_range, fabric_count, deployment_model,
             target_timeline, objectives_notes, status, assigned_engineer, created_at, updated_at
      FROM dbo.DeploymentRequests
      ${whereSql}
      ORDER BY ${cleanSort} ${cleanOrder}
      OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY
    `);

    return {
      total,
      count: dataResult.recordset.length,
      page: p,
      limit: l,
      totalPages: Math.ceil(total / l) || 1,
      data: dataResult.recordset
    };
  }

  async updateDeploymentStatus(trackingRef, { status, assignedEngineer, internalNotes, userId = null, ipAddress = null } = {}) {
    if (this.isFallback) {
      return dbFallback.updateDeploymentStatus(trackingRef, { status, assignedEngineer, internalNotes, userId, ipAddress });
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
    const request = this.pool.request();
    request.input('tracking_ref', sql.NVarChar(32), trackingRef);
    request.input('status', sql.NVarChar(50), normalizedStatus);
    request.input('assigned_engineer', sql.NVarChar(150), assignedEngineer ? String(assignedEngineer).trim() : null);

    const result = await request.query(`
      UPDATE dbo.DeploymentRequests
      SET status = @status,
          assigned_engineer = CASE WHEN @assigned_engineer IS NOT NULL THEN @assigned_engineer ELSE assigned_engineer END,
          updated_at = GETUTCDATE()
      OUTPUT INSERTED.*
      WHERE tracking_ref = @tracking_ref
    `);

    const updated = result.recordset[0] || null;
    if (!updated) return null;

    const notesStr = internalNotes ? `. Notes: ${internalNotes}` : '';
    const engineerStr = updated.assigned_engineer ? ` (Assigned: ${updated.assigned_engineer})` : '';
    await this.createAuditLog({
      user_id: userId,
      event_type: 'DEPLOYMENT_STATUS_UPDATED',
      event_description: `Status for ${trackingRef} updated to ${normalizedStatus}${engineerStr}${notesStr}`,
      ip_address: ipAddress
    });

    return updated;
  }

  async getDeploymentStats() {
    if (this.isFallback) {
      return dbFallback.getDeploymentStats();
    }

    const request = this.pool.request();
    const statusResult = await request.query(`
      SELECT status, COUNT(*) AS count
      FROM dbo.DeploymentRequests
      GROUP BY status
    `);

    const archResult = await request.query(`
      SELECT COALESCE(san_vendor, 'Multi-Vendor Standard Fibre Channel') AS vendor, COUNT(*) AS count
      FROM dbo.DeploymentRequests
      GROUP BY san_vendor
    `);

    let total = 0;
    let pending = 0;
    let evaluating = 0;
    let qualified = 0;
    let scheduled = 0;
    let rejected = 0;
    let archived = 0;

    for (const row of statusResult.recordset) {
      const s = (row.status || '').toUpperCase();
      const c = parseInt(row.count, 10) || 0;
      total += c;
      if (s === 'PENDING_REVIEW') pending += c;
      else if (s === 'UNDER_EVALUATION') evaluating += c;
      else if (s === 'QUALIFIED') qualified += c;
      else if (s === 'DEPLOYED' || s === 'DEPLOYMENT_SCHEDULED') scheduled += c;
      else if (s === 'REJECTED') rejected += c;
      else if (s === 'ARCHIVED') archived += c;
    }

    const architectures = {};
    for (const row of archResult.recordset) {
      architectures[row.vendor] = parseInt(row.count, 10) || 0;
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

  async createAuditLog({ user_id = null, event_type, event_description, ip_address = null }) {
    if (this.isFallback) {
      return dbFallback.createAuditLog({ user_id, event_type, event_description, ip_address });
    }

    const request = this.pool.request();
    request.input('user_id', user_id ? sql.UniqueIdentifier : sql.Null, user_id);
    request.input('event_type', sql.NVarChar(50), event_type);
    request.input('event_description', sql.NVarChar(500), event_description);
    request.input('ip_address', sql.NVarChar(45), ip_address);

    const result = await request.query(`
      INSERT INTO dbo.AuditLogs (user_id, event_type, event_description, ip_address)
      OUTPUT INSERTED.id, INSERTED.event_type, INSERTED.created_at
      VALUES (@user_id, @event_type, @event_description, @ip_address)
    `);

    return result.recordset[0];
  }

  getHealth() {
    if (this.isFallback) {
      return {
        engine: 'IN_MEMORY_FALLBACK',
        connected: true,
        fallbackActive: true,
        ...dbFallback.getHealth()
      };
    }

    return {
      engine: 'MSSQL',
      connected: this.pool ? this.pool.connected : false,
      fallbackActive: false,
      poolSize: this.pool ? this.pool.size : 0,
      poolAvailable: this.pool ? this.pool.available : 0
    };
  }
}

module.exports = new DatabaseManager();
