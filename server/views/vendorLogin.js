/**
 * Server-Side Rendered Vendor Login View
 * Pure Node.js zero-dependency HTML generator with enterprise dark theme.
 */

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function renderVendorLogin({ error = null, returnTo = '/vendor' } = {}) {
  const safeError = escapeHtml(error);
  const safeReturnTo = escapeHtml(returnTo);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Vendor Authentication | Infrasights Enterprise Console</title>
  <style>
    :root {
      --bg-body: #080e1a;
      --bg-surface: #0f172a;
      --bg-card: #131e3a;
      --bg-card-hover: #1e293b;
      --border-color: #334155;
      --border-focus: #06b6d4;
      --text-main: #f8fafc;
      --text-muted: #94a3b8;
      --accent-cyan: #06b6d4;
      --accent-blue: #3b82f6;
      --accent-red: #ef4444;
      --accent-green: #10b981;
    }

    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }

    body {
      background-color: var(--bg-body);
      color: var(--text-main);
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 24px;
    }

    .brand-header {
      text-align: center;
      margin-bottom: 28px;
    }

    .brand-badge {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      background: rgba(6, 182, 212, 0.1);
      border: 1px solid rgba(6, 182, 212, 0.3);
      color: var(--accent-cyan);
      padding: 4px 12px;
      border-radius: 9999px;
      font-size: 11px;
      font-weight: 600;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      margin-bottom: 12px;
    }

    .brand-title {
      font-size: 26px;
      font-weight: 700;
      letter-spacing: -0.02em;
      color: #ffffff;
      margin-bottom: 6px;
    }

    .brand-subtitle {
      color: var(--text-muted);
      font-size: 14px;
    }

    .login-card {
      background: var(--bg-card);
      border: 1px solid var(--border-color);
      border-radius: 12px;
      width: 100%;
      max-width: 440px;
      padding: 32px;
      box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.5), 0 8px 10px -6px rgba(0, 0, 0, 0.5);
    }

    .card-title {
      font-size: 18px;
      font-weight: 600;
      margin-bottom: 8px;
    }

    .card-desc {
      color: var(--text-muted);
      font-size: 13px;
      margin-bottom: 24px;
      line-height: 1.5;
    }

    .tab-nav {
      display: flex;
      background: var(--bg-surface);
      border: 1px solid var(--border-color);
      border-radius: 8px;
      padding: 4px;
      margin-bottom: 24px;
    }

    .tab-btn {
      flex: 1;
      padding: 8px 12px;
      font-size: 13px;
      font-weight: 600;
      color: var(--text-muted);
      background: transparent;
      border: none;
      border-radius: 6px;
      cursor: pointer;
      transition: all 0.15s ease;
    }

    .tab-btn.active {
      background: var(--bg-card);
      color: #ffffff;
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.3);
    }

    .error-banner {
      background: rgba(239, 68, 68, 0.15);
      border: 1px solid var(--accent-red);
      color: #fca5a5;
      padding: 12px 14px;
      border-radius: 6px;
      font-size: 13px;
      margin-bottom: 20px;
      display: ${safeError ? 'block' : 'none'};
      line-height: 1.4;
    }

    .form-group {
      margin-bottom: 18px;
    }

    .form-label {
      display: block;
      font-size: 12px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      color: var(--text-muted);
      margin-bottom: 8px;
    }

    .form-input {
      width: 100%;
      background: var(--bg-surface);
      border: 1px solid var(--border-color);
      border-radius: 6px;
      padding: 10px 14px;
      color: #ffffff;
      font-size: 14px;
      transition: border-color 0.15s ease, box-shadow 0.15s ease;
    }

    .form-input:focus {
      outline: none;
      border-color: var(--border-focus);
      box-shadow: 0 0 0 3px rgba(6, 182, 212, 0.2);
    }

    .submit-btn {
      width: 100%;
      background: linear-gradient(135deg, #0284c7 0%, #06b6d4 100%);
      color: #ffffff;
      border: none;
      border-radius: 6px;
      padding: 12px 18px;
      font-size: 14px;
      font-weight: 600;
      cursor: pointer;
      transition: opacity 0.15s ease, transform 0.1s ease;
      margin-top: 8px;
    }

    .submit-btn:hover {
      opacity: 0.95;
    }

    .submit-btn:active {
      transform: scale(0.99);
    }

    .back-link {
      display: block;
      text-align: center;
      margin-top: 24px;
      color: var(--text-muted);
      font-size: 13px;
      text-decoration: none;
      transition: color 0.15s ease;
    }

    .back-link:hover {
      color: var(--accent-cyan);
    }
  </style>
</head>
<body>
  <div class="brand-header">
    <div class="brand-badge">Administrative Access</div>
    <h1 class="brand-title">Infrasights Vendor Console</h1>
    <p class="brand-subtitle">Enterprise SAN Infrastructure Observability Management</p>
  </div>

  <div class="login-card">
    <h2 class="card-title">Authentication Required</h2>
    <p class="card-desc">Authenticate with your vendor secret key or administrator credentials to access cross-tenant qualification records.</p>

    <div class="tab-nav">
      <button type="button" class="tab-btn active" id="tab-secret" onclick="switchTab('secret')">Vendor Secret Key</button>
      <button type="button" class="tab-btn" id="tab-admin" onclick="switchTab('admin')">Admin Credentials</button>
    </div>

    <div id="error-banner" class="error-banner">${safeError}</div>

    <!-- Secret Key Form -->
    <form id="secret-form" method="POST" action="/vendor/login">
      <input type="hidden" name="authType" value="secretKey">
      <input type="hidden" name="returnTo" value="${safeReturnTo}">
      <div class="form-group">
        <label class="form-label" for="secretKey">Vendor Secret Key</label>
        <input class="form-input" type="password" id="secretKey" name="secretKey" placeholder="Enter X-Vendor-Key..." required autocomplete="current-password">
      </div>
      <button type="submit" class="submit-btn" id="btn-submit-secret">Authenticate with Key &rarr;</button>
    </form>

    <!-- Admin Credentials Form (hidden by default) -->
    <form id="admin-form" method="POST" action="/vendor/login" style="display: none;">
      <input type="hidden" name="authType" value="credentials">
      <input type="hidden" name="returnTo" value="${safeReturnTo}">
      <div class="form-group">
        <label class="form-label" for="email">Admin Email</label>
        <input class="form-input" type="email" id="email" name="email" placeholder="admin@infrasights.in" autocomplete="email">
      </div>
      <div class="form-group">
        <label class="form-label" for="password">Admin Password</label>
        <input class="form-input" type="password" id="password" name="password" placeholder="••••••••••••" autocomplete="current-password">
      </div>
      <button type="submit" class="submit-btn" id="btn-submit-admin">Sign In as Admin &rarr;</button>
    </form>
  </div>

  <a href="/" class="back-link">&larr; Return to Infrasights Platform</a>

  <script>
    function switchTab(mode) {
      const tabSecret = document.getElementById('tab-secret');
      const tabAdmin = document.getElementById('tab-admin');
      const formSecret = document.getElementById('secret-form');
      const formAdmin = document.getElementById('admin-form');
      const errorBanner = document.getElementById('error-banner');

      errorBanner.style.display = 'none';

      if (mode === 'secret') {
        tabSecret.classList.add('active');
        tabAdmin.classList.remove('active');
        formSecret.style.display = 'block';
        formAdmin.style.display = 'none';
        document.getElementById('secretKey').focus();
      } else {
        tabAdmin.classList.add('active');
        tabSecret.classList.remove('active');
        formSecret.style.display = 'none';
        formAdmin.style.display = 'block';
        document.getElementById('email').focus();
      }
    }

    // Progressive enhancement: Intercept AJAX submit for instant feedback
    async function handleAjaxLogin(event, payload) {
      event.preventDefault();
      const errorBanner = document.getElementById('error-banner');
      errorBanner.style.display = 'none';

      try {
        const response = await fetch('/api/vendor/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });

        const data = await response.json();

        if (response.ok && data.success) {
          const returnTo = new URLSearchParams(window.location.search).get('returnTo') || '/vendor';
          window.location.href = returnTo;
        } else {
          errorBanner.textContent = data.error || 'Authentication failed. Please verify credentials.';
          errorBanner.style.display = 'block';
        }
      } catch (err) {
        errorBanner.textContent = 'Network communication error. Please try again.';
        errorBanner.style.display = 'block';
      }
    }

    document.getElementById('secret-form').addEventListener('submit', function(e) {
      const secretKey = document.getElementById('secretKey').value;
      handleAjaxLogin(e, { secretKey });
    });

    document.getElementById('admin-form').addEventListener('submit', function(e) {
      const email = document.getElementById('email').value;
      const password = document.getElementById('password').value;
      handleAjaxLogin(e, { email, password });
    });
  </script>
</body>
</html>`;
}

module.exports = {
  renderVendorLogin,
  escapeHtml
};
