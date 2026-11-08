/**
 * Server-Side Rendered Vendor Management Dashboard View
 * Pure Node.js zero-dependency HTML generator with enterprise dark theme.
 */

function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function getStatusBadge(status) {
  const s = String(status || 'PENDING_REVIEW').toUpperCase();
  let bg = 'rgba(245, 158, 11, 0.15)';
  let border = '#f59e0b';
  let color = '#fbbf24';
  let label = s;

  switch (s) {
    case 'PENDING_REVIEW':
      bg = 'rgba(245, 158, 11, 0.15)';
      border = '#f59e0b';
      color = '#fbbf24';
      label = 'Pending Review';
      break;
    case 'UNDER_EVALUATION':
      bg = 'rgba(6, 182, 212, 0.15)';
      border = '#06b6d4';
      color = '#38bdf8';
      label = 'Under Evaluation';
      break;
    case 'QUALIFIED':
      bg = 'rgba(16, 185, 129, 0.15)';
      border = '#10b981';
      color = '#34d399';
      label = 'Qualified';
      break;
    case 'DEPLOYED':
    case 'DEPLOYMENT_SCHEDULED':
      bg = 'rgba(139, 92, 246, 0.15)';
      border = '#8b5cf6';
      color = '#a78bfa';
      label = s === 'DEPLOYED' ? 'Deployed' : 'Scheduled';
      break;
    case 'REJECTED':
      bg = 'rgba(239, 68, 68, 0.15)';
      border = '#ef4444';
      color = '#f87171';
      label = 'Rejected';
      break;
    case 'ARCHIVED':
      bg = 'rgba(148, 163, 184, 0.15)';
      border = '#64748b';
      color = '#94a3b8';
      label = 'Archived';
      break;
  }

  return `<span class="badge" style="background:${bg};border-color:${border};color:${color};">${label}</span>`;
}

function renderVendorDashboard({
  stats = {},
  deployments = [],
  total = 0,
  page = 1,
  totalPages = 1,
  search = '',
  status = 'ALL',
  user = {}
} = {}) {
  const safeSearch = escapeHtml(search);
  const safeStatus = escapeHtml(status);
  const userEmail = escapeHtml(user.email || 'admin@infrasights.in');

  const rowsHtml = deployments.length > 0 ? deployments.map(d => {
    const ref = escapeHtml(d.tracking_ref || d.trackingRef);
    const org = escapeHtml(d.organization_name || d.organizationName || 'N/A');
    const email = escapeHtml(d.business_email || d.businessEmail || 'N/A');
    const phone = d.contact_phone || d.contactPhone ? escapeHtml(d.contact_phone || d.contactPhone) : null;
    const vendor = escapeHtml(d.san_vendor || d.sanVendor || 'Standard Fibre Channel');
    const switches = escapeHtml(d.switch_count_range || d.switchCount || 'N/A');
    const currentStatus = d.status || 'PENDING_REVIEW';
    const date = new Date(d.created_at || d.createdAt).toISOString().split('T')[0];

    return `
      <tr id="row-${ref}">
        <td><span class="mono-ref">${ref}</span></td>
        <td><strong>${org}</strong></td>
        <td>
          <a href="mailto:${email}" class="table-link">${email}</a>
          ${phone ? `<div style="font-size:11px;color:#94a3b8;margin-top:2px;">📞 ${phone}</div>` : ''}
        </td>
        <td>${vendor}</td>
        <td>${switches}</td>
        <td id="badge-${ref}">${getStatusBadge(currentStatus)}</td>
        <td class="text-muted">${date}</td>
        <td>
          <button class="action-btn" onclick="inspectDeployment('${ref}')">Inspect &rarr;</button>
        </td>
      </tr>
    `;
  }).join('') : `
    <tr>
      <td colspan="8" class="empty-state">
        <p>No deployment qualification requests match the specified criteria.</p>
      </td>
    </tr>
  `;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Vendor Management Console | Infrasights v2.10</title>
  <style>
    :root {
      --bg-body: #080e1a;
      --bg-surface: #0b1329;
      --bg-card: #131e3a;
      --bg-card-hover: #1e293b;
      --border-color: #334155;
      --border-focus: #06b6d4;
      --text-main: #f8fafc;
      --text-muted: #94a3b8;
      --accent-cyan: #06b6d4;
      --accent-blue: #3b82f6;
      --accent-green: #10b981;
      --accent-amber: #f59e0b;
      --accent-red: #ef4444;
      --accent-purple: #8b5cf6;
    }

    * { box-sizing: border-box; margin: 0; padding: 0; }

    body {
      background-color: var(--bg-body);
      color: var(--text-main);
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      min-height: 100vh;
      display: flex;
      flex-direction: column;
    }

    /* Top Navigation */
    .navbar {
      background: var(--bg-surface);
      border-bottom: 1px solid var(--border-color);
      padding: 14px 24px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      position: sticky;
      top: 0;
      z-index: 40;
    }

    .nav-brand {
      display: flex;
      align-items: center;
      gap: 12px;
    }

    .brand-mark {
      background: linear-gradient(135deg, #0284c7 0%, #06b6d4 100%);
      width: 28px;
      height: 28px;
      border-radius: 6px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: 800;
      font-size: 14px;
      color: #fff;
    }

    .brand-title {
      font-size: 16px;
      font-weight: 700;
      letter-spacing: -0.01em;
    }

    .brand-badge {
      font-size: 11px;
      background: rgba(6, 182, 212, 0.15);
      border: 1px solid rgba(6, 182, 212, 0.4);
      color: var(--accent-cyan);
      padding: 2px 8px;
      border-radius: 4px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }

    .nav-actions {
      display: flex;
      align-items: center;
      gap: 16px;
    }

    .user-tag {
      font-size: 13px;
      color: var(--text-muted);
    }

    .user-tag strong {
      color: var(--text-main);
    }

    .nav-btn {
      background: transparent;
      border: 1px solid var(--border-color);
      color: var(--text-muted);
      padding: 6px 14px;
      border-radius: 6px;
      font-size: 13px;
      font-weight: 600;
      cursor: pointer;
      text-decoration: none;
      transition: all 0.15s ease;
    }

    .nav-btn:hover {
      background: var(--bg-card);
      color: var(--text-main);
      border-color: var(--text-muted);
    }

    .logout-btn {
      background: rgba(239, 68, 68, 0.1);
      border: 1px solid rgba(239, 68, 68, 0.3);
      color: #fca5a5;
    }

    .logout-btn:hover {
      background: rgba(239, 68, 68, 0.2);
      border-color: var(--accent-red);
      color: #fff;
    }

    /* Container */
    .container {
      max-width: 1400px;
      margin: 0 auto;
      padding: 24px;
      width: 100%;
      flex: 1;
    }

    .page-header {
      margin-bottom: 24px;
    }

    .page-title {
      font-size: 24px;
      font-weight: 700;
      margin-bottom: 4px;
    }

    .page-desc {
      color: var(--text-muted);
      font-size: 14px;
    }

    /* KPI Metric Cards */
    .stats-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 16px;
      margin-bottom: 28px;
    }

    .stat-card {
      background: var(--bg-card);
      border: 1px solid var(--border-color);
      border-radius: 8px;
      padding: 18px 20px;
      position: relative;
      overflow: hidden;
    }

    .stat-card::after {
      content: '';
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      height: 3px;
    }

    .stat-card.total::after { background: var(--accent-cyan); }
    .stat-card.pending::after { background: var(--accent-amber); }
    .stat-card.evaluating::after { background: var(--accent-blue); }
    .stat-card.qualified::after { background: var(--accent-green); }
    .stat-card.scheduled::after { background: var(--accent-purple); }

    .stat-label {
      font-size: 12px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: var(--text-muted);
      margin-bottom: 8px;
    }

    .stat-value {
      font-size: 28px;
      font-weight: 700;
      color: #fff;
    }

    /* Filters Bar */
    .filters-bar {
      background: var(--bg-surface);
      border: 1px solid var(--border-color);
      border-radius: 8px;
      padding: 14px 18px;
      margin-bottom: 20px;
      display: flex;
      flex-wrap: wrap;
      gap: 14px;
      align-items: center;
      justify-content: space-between;
    }

    .filters-left {
      display: flex;
      flex-wrap: wrap;
      gap: 12px;
      align-items: center;
      flex: 1;
    }

    .search-input {
      background: var(--bg-card);
      border: 1px solid var(--border-color);
      border-radius: 6px;
      padding: 8px 14px;
      color: #fff;
      font-size: 13px;
      min-width: 280px;
      flex: 1;
      max-width: 450px;
    }

    .search-input:focus {
      outline: none;
      border-color: var(--border-focus);
    }

    .select-filter {
      background: var(--bg-card);
      border: 1px solid var(--border-color);
      border-radius: 6px;
      padding: 8px 12px;
      color: #fff;
      font-size: 13px;
      cursor: pointer;
    }

    .select-filter:focus {
      outline: none;
      border-color: var(--border-focus);
    }

    .filter-btn {
      background: var(--accent-blue);
      color: #fff;
      border: none;
      border-radius: 6px;
      padding: 8px 16px;
      font-size: 13px;
      font-weight: 600;
      cursor: pointer;
    }

    .filter-btn:hover {
      opacity: 0.9;
    }

    /* Table */
    .table-container {
      background: var(--bg-card);
      border: 1px solid var(--border-color);
      border-radius: 8px;
      overflow-x: auto;
      box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.2);
    }

    table {
      width: 100%;
      border-collapse: collapse;
      text-align: left;
      font-size: 13px;
    }

    th {
      background: var(--bg-surface);
      color: var(--text-muted);
      font-weight: 600;
      text-transform: uppercase;
      font-size: 11px;
      letter-spacing: 0.05em;
      padding: 12px 16px;
      border-bottom: 1px solid var(--border-color);
      white-space: nowrap;
    }

    td {
      padding: 14px 16px;
      border-bottom: 1px solid rgba(51, 65, 85, 0.5);
      vertical-align: middle;
    }

    tr:hover td {
      background: rgba(255, 255, 255, 0.02);
    }

    .mono-ref {
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      font-size: 12px;
      background: rgba(6, 182, 212, 0.1);
      color: var(--accent-cyan);
      padding: 2px 6px;
      border-radius: 4px;
      border: 1px solid rgba(6, 182, 212, 0.25);
    }

    .table-link {
      color: var(--text-main);
      text-decoration: none;
    }

    .table-link:hover {
      color: var(--accent-cyan);
      text-decoration: underline;
    }

    .badge {
      display: inline-block;
      font-size: 11px;
      font-weight: 600;
      padding: 3px 8px;
      border-radius: 9999px;
      border: 1px solid transparent;
      white-space: nowrap;
    }

    .action-btn {
      background: rgba(6, 182, 212, 0.1);
      border: 1px solid rgba(6, 182, 212, 0.3);
      color: var(--accent-cyan);
      padding: 6px 12px;
      border-radius: 6px;
      font-size: 12px;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.15s ease;
    }

    .action-btn:hover {
      background: var(--accent-cyan);
      color: #000;
    }

    .empty-state {
      text-align: center;
      padding: 48px !important;
      color: var(--text-muted);
    }

    /* Modal / Drawer */
    .modal-overlay {
      position: fixed;
      top: 0; left: 0; right: 0; bottom: 0;
      background: rgba(0, 0, 0, 0.75);
      backdrop-filter: blur(4px);
      z-index: 50;
      display: none;
      align-items: center;
      justify-content: center;
      padding: 20px;
    }

    .modal-overlay.active {
      display: flex;
    }

    .modal-dialog {
      background: var(--bg-card);
      border: 1px solid var(--border-color);
      border-radius: 12px;
      max-width: 900px;
      width: 100%;
      max-height: 90vh;
      overflow-y: auto;
      box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.7);
      display: flex;
      flex-direction: column;
    }

    .modal-header {
      padding: 20px 24px;
      border-bottom: 1px solid var(--border-color);
      display: flex;
      justify-content: space-between;
      align-items: center;
      position: sticky;
      top: 0;
      background: var(--bg-card);
      z-index: 10;
    }

    .modal-title {
      font-size: 18px;
      font-weight: 700;
    }

    .modal-close {
      background: transparent;
      border: none;
      color: var(--text-muted);
      font-size: 24px;
      cursor: pointer;
      line-height: 1;
    }

    .modal-close:hover {
      color: #fff;
    }

    .modal-body {
      padding: 24px;
      display: flex;
      flex-direction: column;
      gap: 24px;
    }

    .info-section {
      background: var(--bg-surface);
      border: 1px solid var(--border-color);
      border-radius: 8px;
      padding: 16px;
    }

    .section-title {
      font-size: 13px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: var(--accent-cyan);
      margin-bottom: 14px;
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .param-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
      gap: 14px;
    }

    .param-item {
      display: flex;
      flex-direction: column;
      gap: 4px;
    }

    .param-label {
      font-size: 11px;
      color: var(--text-muted);
      text-transform: uppercase;
      font-weight: 600;
    }

    .param-val {
      font-size: 14px;
      color: #fff;
      word-break: break-word;
    }

    /* JSON Viewer */
    .json-pre {
      background: #050914;
      border: 1px solid var(--border-color);
      border-radius: 6px;
      padding: 14px;
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      font-size: 12px;
      color: #38bdf8;
      max-height: 200px;
      overflow: auto;
      white-space: pre-wrap;
    }

    /* Status Update Form */
    .update-form {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 14px;
      align-items: end;
    }

    .modal-label {
      display: block;
      font-size: 12px;
      font-weight: 600;
      color: var(--text-muted);
      margin-bottom: 6px;
    }

    .modal-input, .modal-select {
      width: 100%;
      background: var(--bg-card);
      border: 1px solid var(--border-color);
      border-radius: 6px;
      padding: 8px 12px;
      color: #fff;
      font-size: 13px;
    }

    .modal-input:focus, .modal-select:focus {
      outline: none;
      border-color: var(--border-focus);
    }

    .save-btn {
      background: var(--accent-green);
      color: #000;
      border: none;
      border-radius: 6px;
      padding: 9px 18px;
      font-size: 13px;
      font-weight: 700;
      cursor: pointer;
      height: 38px;
      transition: opacity 0.15s ease;
    }

    .save-btn:hover {
      opacity: 0.9;
    }

    .toast-msg {
      padding: 10px 14px;
      border-radius: 6px;
      font-size: 13px;
      display: none;
      margin-top: 10px;
    }

    .toast-success {
      background: rgba(16, 185, 129, 0.15);
      border: 1px solid var(--accent-green);
      color: #34d399;
    }

    .toast-error {
      background: rgba(239, 68, 68, 0.15);
      border: 1px solid var(--accent-red);
      color: #fca5a5;
    }

    /* Audit Logs */
    .audit-list {
      list-style: none;
      display: flex;
      flex-direction: column;
      gap: 8px;
      max-height: 160px;
      overflow-y: auto;
    }

    .audit-item {
      font-size: 12px;
      color: var(--text-muted);
      padding: 6px 10px;
      background: var(--bg-card);
      border-radius: 4px;
      display: flex;
      justify-content: space-between;
      gap: 12px;
    }

    .audit-time {
      font-family: monospace;
      color: var(--accent-cyan);
      white-space: nowrap;
    }
  </style>
</head>
<body>
  <!-- Top Navigation -->
  <header class="navbar">
    <div class="nav-brand">
      <div class="brand-mark">IS</div>
      <span class="brand-title">Infrasights Vendor Console</span>
      <span class="brand-badge">ADMIN</span>
    </div>
    <div class="nav-actions">
      <span class="user-tag">Staff: <strong>${userEmail}</strong></span>
      <a href="/" class="nav-btn" target="_blank">&larr; Live Platform</a>
      <a href="/api/health" class="nav-btn" target="_blank">Health</a>
      <button class="nav-btn logout-btn" onclick="handleLogout()">Sign Out</button>
    </div>
  </header>

  <main class="container">
    <div class="page-header">
      <h1 class="page-title">Deployment Qualification Management</h1>
      <p class="page-desc">Triage, inspect customer SAN specifications, and update qualification lifecycles.</p>
    </div>

    <!-- KPI Metric Cards -->
    <div class="stats-grid">
      <div class="stat-card total">
        <div class="stat-label">Total Requests</div>
        <div class="stat-value" id="stat-total">${stats.total || 0}</div>
      </div>
      <div class="stat-card pending">
        <div class="stat-label">Pending Review</div>
        <div class="stat-value" id="stat-pending">${stats.pendingReview || stats.pending || 0}</div>
      </div>
      <div class="stat-card evaluating">
        <div class="stat-label">Under Evaluation</div>
        <div class="stat-value" id="stat-evaluating">${stats.underEvaluation || stats.evaluating || 0}</div>
      </div>
      <div class="stat-card qualified">
        <div class="stat-label">Qualified</div>
        <div class="stat-value" id="stat-qualified">${stats.qualified || 0}</div>
      </div>
      <div class="stat-card scheduled">
        <div class="stat-label">Deployed / Scheduled</div>
        <div class="stat-value" id="stat-scheduled">${stats.deployed || stats.scheduled || 0}</div>
      </div>
    </div>

    <!-- Search & Filter Controls -->
    <form class="filters-bar" method="GET" action="/vendor">
      <div class="filters-left">
        <input type="text" id="search-input" name="search" class="search-input" placeholder="Search tracking ref, org, email..." value="${safeSearch}">
        <select id="status-filter" name="status" class="select-filter">
          <option value="ALL" ${safeStatus === 'ALL' ? 'selected' : ''}>All Statuses</option>
          <option value="PENDING_REVIEW" ${safeStatus === 'PENDING_REVIEW' ? 'selected' : ''}>Pending Review</option>
          <option value="UNDER_EVALUATION" ${safeStatus === 'UNDER_EVALUATION' ? 'selected' : ''}>Under Evaluation</option>
          <option value="QUALIFIED" ${safeStatus === 'QUALIFIED' ? 'selected' : ''}>Qualified</option>
          <option value="DEPLOYED" ${safeStatus === 'DEPLOYED' ? 'selected' : ''}>Deployed</option>
          <option value="DEPLOYMENT_SCHEDULED" ${safeStatus === 'DEPLOYMENT_SCHEDULED' ? 'selected' : ''}>Scheduled</option>
          <option value="REJECTED" ${safeStatus === 'REJECTED' ? 'selected' : ''}>Rejected</option>
          <option value="ARCHIVED" ${safeStatus === 'ARCHIVED' ? 'selected' : ''}>Archived</option>
        </select>
        <button type="submit" class="filter-btn">Apply Filter</button>
      </div>
      <div>
        <span class="user-tag">Total records: <strong>${total}</strong></span>
      </div>
    </form>

    <!-- Deployments Table -->
    <div class="table-container">
      <table>
        <thead>
          <tr>
            <th>Tracking Reference</th>
            <th>Organization</th>
            <th>Business Email</th>
            <th>SAN Architecture</th>
            <th>Switches</th>
            <th>Lifecycle Status</th>
            <th>Submitted</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody id="deployments-table-body">
          ${rowsHtml}
        </tbody>
      </table>
    </div>
  </main>

  <!-- Inspection Modal Drawer -->
  <div class="modal-overlay" id="inspect-modal">
    <div class="modal-dialog">
      <div class="modal-header">
        <div style="display:flex; align-items:center; gap:10px;">
          <h2 class="modal-title">Deployment Qualification Inspection</h2>
          <span class="mono-ref" id="modal-ref">INF-REQ-XXXX</span>
        </div>
        <button type="button" class="modal-close" onclick="closeInspectModal()">&times;</button>
      </div>
      <div class="modal-body">
        <!-- Customer & Org Info -->
        <div class="info-section">
          <div class="section-title">Customer Organization Details</div>
          <div class="param-grid">
            <div class="param-item">
              <span class="param-label">Organization Name</span>
              <span class="param-val" id="modal-org">-</span>
            </div>
            <div class="param-item">
              <span class="param-label">Business Email</span>
              <span class="param-val" id="modal-email">-</span>
            </div>
            <div class="param-item">
              <span class="param-label">Country / Region</span>
              <span class="param-val" id="modal-region">-</span>
            </div>
            <div class="param-item">
              <span class="param-label">Department / Role</span>
              <span class="param-val" id="modal-role">-</span>
            </div>
            <div class="param-item">
              <span class="param-label">Mobile Contact</span>
              <span class="param-val" id="modal-phone">-</span>
            </div>
          </div>
        </div>

        <!-- SAN Architecture Specs -->
        <div class="info-section">
          <div class="section-title">Fibre Channel SAN Architecture</div>
          <div class="param-grid">
            <div class="param-item">
              <span class="param-label">Switch Architecture / Vendor</span>
              <span class="param-val" id="modal-vendor">-</span>
            </div>
            <div class="param-item">
              <span class="param-label">Switch Count</span>
              <span class="param-val" id="modal-switches">-</span>
            </div>
            <div class="param-item">
              <span class="param-label">Fabric Topology</span>
              <span class="param-val" id="modal-fabrics">-</span>
            </div>
            <div class="param-item">
              <span class="param-label">Deployment Model</span>
              <span class="param-val" id="modal-model">-</span>
            </div>
            <div class="param-item">
              <span class="param-label">Target Timeline</span>
              <span class="param-val" id="modal-timeline">-</span>
            </div>
          </div>
          <div style="margin-top:14px;">
            <span class="param-label">Customer Operational Notes</span>
            <p style="margin-top:4px; font-size:13px; color:#e2e8f0; line-height:1.5;" id="modal-notes-display">None provided.</p>
          </div>
        </div>

        <!-- Lifecycle Status Modifier -->
        <div class="info-section">
          <div class="section-title">Lifecycle & Engineer Assignment</div>
          <form id="status-update-form" onsubmit="handleStatusUpdate(event)">
            <div class="update-form">
              <div>
                <label class="modal-label" for="modal-status-select">Qualification Status</label>
                <select id="modal-status-select" class="modal-select">
                  <option value="PENDING_REVIEW">Pending Review</option>
                  <option value="UNDER_EVALUATION">Under Evaluation</option>
                  <option value="QUALIFIED">Qualified</option>
                  <option value="DEPLOYED">Deployed</option>
                  <option value="DEPLOYMENT_SCHEDULED">Deployment Scheduled</option>
                  <option value="REJECTED">Rejected</option>
                  <option value="ARCHIVED">Archived</option>
                </select>
              </div>
              <div>
                <label class="modal-label" for="modal-engineer-input">Assigned Lead Engineer</label>
                <input type="text" id="modal-engineer-input" class="modal-input" placeholder="e.g. Lead SAN Architect">
              </div>
              <div>
                <label class="modal-label" for="modal-internal-notes">Internal Engineering Notes</label>
                <input type="text" id="modal-internal-notes" class="modal-input" placeholder="Triage comments...">
              </div>
              <div>
                <button type="submit" class="save-btn" id="btn-save-status">Save Changes</button>
              </div>
            </div>
            <div id="toast-msg" class="toast-msg"></div>
          </form>
        </div>

        <!-- Raw Qualification Payload JSON -->
        <div class="info-section">
          <div class="section-title">Raw Qualification Payload JSON</div>
          <pre class="json-pre" id="modal-raw-json">Loading payload...</pre>
        </div>

        <!-- Audit Trail -->
        <div class="info-section">
          <div class="section-title">Audit Trail & History</div>
          <ul class="audit-list" id="modal-audit-list">
            <li class="audit-item">No audit logs recorded.</li>
          </ul>
        </div>
      </div>
    </div>
  </div>

  <script>
    let activeTrackingRef = null;

    function getStatusBadge(status) {
      const s = String(status || 'PENDING_REVIEW').toUpperCase();
      let bg = 'rgba(245, 158, 11, 0.15)';
      let border = '#f59e0b';
      let color = '#fbbf24';
      let label = s;

      switch (s) {
        case 'PENDING_REVIEW':
          bg = 'rgba(245, 158, 11, 0.15)';
          border = '#f59e0b';
          color = '#fbbf24';
          label = 'Pending Review';
          break;
        case 'UNDER_EVALUATION':
          bg = 'rgba(6, 182, 212, 0.15)';
          border = '#06b6d4';
          color = '#38bdf8';
          label = 'Under Evaluation';
          break;
        case 'QUALIFIED':
          bg = 'rgba(16, 185, 129, 0.15)';
          border = '#10b981';
          color = '#34d399';
          label = 'Qualified';
          break;
        case 'DEPLOYED':
        case 'DEPLOYMENT_SCHEDULED':
          bg = 'rgba(139, 92, 246, 0.15)';
          border = '#8b5cf6';
          color = '#a78bfa';
          label = s === 'DEPLOYED' ? 'Deployed' : 'Scheduled';
          break;
        case 'REJECTED':
          bg = 'rgba(239, 68, 68, 0.15)';
          border = '#ef4444';
          color = '#f87171';
          label = 'Rejected';
          break;
        case 'ARCHIVED':
          bg = 'rgba(148, 163, 184, 0.15)';
          border = '#64748b';
          color = '#94a3b8';
          label = 'Archived';
          break;
      }

      return '<span class="badge" style="background:' + bg + ';border-color:' + border + ';color:' + color + ';">' + label + '</span>';
    }

    async function inspectDeployment(ref) {
      activeTrackingRef = ref;
      const modal = document.getElementById('inspect-modal');
      const toast = document.getElementById('toast-msg');
      toast.style.display = 'none';

      document.getElementById('modal-ref').textContent = ref;
      modal.classList.add('active');

      try {
        const res = await fetch('/api/vendor/deployments/' + encodeURIComponent(ref));
        if (!res.ok) {
          throw new Error('Failed to retrieve deployment details (' + res.status + ')');
        }
        const body = await res.json();
        const d = body.data;

        document.getElementById('modal-org').textContent = d.organization_name || d.organizationName || 'N/A';
        document.getElementById('modal-email').textContent = d.business_email || d.businessEmail || 'N/A';
        document.getElementById('modal-phone').textContent = d.contact_phone || d.contactPhone || d.phone || d.phoneNumber || 'Not provided';
        document.getElementById('modal-region').textContent = d.country_region || 'Not specified';
        document.getElementById('modal-role').textContent = d.department_role || 'Not specified';
        document.getElementById('modal-vendor').textContent = d.san_vendor || 'Standard Fibre Channel';
        document.getElementById('modal-switches').textContent = d.switch_count_range || 'N/A';
        document.getElementById('modal-fabrics').textContent = d.fabric_count || 'N/A';
        document.getElementById('modal-model').textContent = d.deployment_model || 'N/A';
        document.getElementById('modal-timeline').textContent = d.target_timeline || 'N/A';
        document.getElementById('modal-notes-display').textContent = d.objectives_notes || 'None provided.';

        // Set status and engineer
        document.getElementById('modal-status-select').value = d.status || 'PENDING_REVIEW';
        document.getElementById('modal-engineer-input').value = d.assigned_engineer || '';
        document.getElementById('modal-internal-notes').value = '';

        // Raw JSON
        let parsed = null;
        try {
          parsed = d.qualification_payload_json ? JSON.parse(d.qualification_payload_json) : d;
        } catch (e) {
          parsed = d;
        }
        document.getElementById('modal-raw-json').textContent = JSON.stringify(parsed, null, 2);

        // Audit logs
        const auditList = document.getElementById('modal-audit-list');
        if (d.auditLogs && d.auditLogs.length > 0) {
          auditList.innerHTML = d.auditLogs.map(function(log) {
            const time = new Date(log.created_at).toISOString().replace('T', ' ').substring(0, 19);
            return '<li class="audit-item"><span>' + escapeHtml(log.event_description || log.event_type) + '</span><span class="audit-time">' + time + ' UTC</span></li>';
          }).join('');
        } else {
          auditList.innerHTML = '<li class="audit-item">No audit logs recorded for this record.</li>';
        }
      } catch (err) {
        document.getElementById('modal-raw-json').textContent = 'Error loading payload: ' + err.message;
      }
    }

    function closeInspectModal() {
      document.getElementById('inspect-modal').classList.remove('active');
      activeTrackingRef = null;
    }

    // Close on Escape or click outside dialog
    document.getElementById('inspect-modal').addEventListener('click', function(e) {
      if (e.target === this) {
        closeInspectModal();
      }
    });

    document.addEventListener('keydown', function(e) {
      if (e.key === 'Escape') {
        closeInspectModal();
      }
    });

    async function handleStatusUpdate(e) {
      e.preventDefault();
      if (!activeTrackingRef) return;

      const newStatus = document.getElementById('modal-status-select').value;
      const engineer = document.getElementById('modal-engineer-input').value;
      const notes = document.getElementById('modal-internal-notes').value;
      const toast = document.getElementById('toast-msg');
      const saveBtn = document.getElementById('btn-save-status');

      saveBtn.disabled = true;
      saveBtn.textContent = 'Saving...';
      toast.style.display = 'none';

      try {
        const res = await fetch('/api/vendor/deployments/' + encodeURIComponent(activeTrackingRef) + '/status', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            status: newStatus,
            assignedEngineer: engineer,
            internalNotes: notes
          })
        });

        const body = await res.json();
        if (res.ok && body.success) {
          toast.className = 'toast-msg toast-success';
          toast.textContent = 'Status updated to ' + newStatus + ' successfully.';
          toast.style.display = 'block';

          // Update badge in table row
          const tableBadge = document.getElementById('badge-' + activeTrackingRef);
          if (tableBadge) {
            tableBadge.innerHTML = getStatusBadge(newStatus);
          }

          // Append audit item
          const auditList = document.getElementById('modal-audit-list');
          const time = new Date().toISOString().replace('T', ' ').substring(0, 19);
          const newItem = '<li class="audit-item"><span>Status for ' + activeTrackingRef + ' updated to ' + newStatus + (engineer ? ' (Assigned: ' + escapeHtml(engineer) + ')' : '') + '</span><span class="audit-time">' + time + ' UTC</span></li>';
          auditList.innerHTML = newItem + auditList.innerHTML;
        } else {
          toast.className = 'toast-msg toast-error';
          toast.textContent = body.error || 'Failed to update status.';
          toast.style.display = 'block';
        }
      } catch (err) {
        toast.className = 'toast-msg toast-error';
        toast.textContent = 'Network communication error: ' + err.message;
        toast.style.display = 'block';
      } finally {
        saveBtn.disabled = false;
        saveBtn.textContent = 'Save Changes';
      }
    }

    async function handleLogout() {
      try {
        await fetch('/api/vendor/auth/logout', { method: 'POST' });
      } catch (e) {}
      window.location.href = '/vendor/login';
    }

    function escapeHtml(str) {
      if (!str) return '';
      return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }
  </script>
</body>
</html>`;
}

module.exports = {
  renderVendorDashboard,
  getStatusBadge,
  escapeHtml
};
