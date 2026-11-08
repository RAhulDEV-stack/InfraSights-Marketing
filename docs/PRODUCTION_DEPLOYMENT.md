# Infrasights v2.10 — Production Deployment & Custom Domain Architecture Guide

This guide details the complete production deployment architecture, DNS routing, TLS/SSL certificate lifecycle, reverse proxy configuration, and health monitoring for **Infrasights v2.10 Enterprise SAN Infrastructure Observability Platform** hosted on Render Cloud PaaS.

---

## 1. Architecture Overview

Infrasights is architected as a decoupled, multi-service production topology deployed across Render Cloud PaaS with custom apex and subdomain mapping:

```
                      Internet Traffic
                             │
                             ▼
              [ Cloudflare / Authoritative DNS ]
             infrasights.in (A) / www (CNAME)
                             │
                             ▼
                 [ Render Edge Load Balancer ]
             - TLS 1.3 Termination (Let's Encrypt)
             - Automatic HTTP -> HTTPS 301 Redirect
             - Reverse Proxy Header Injection (X-Forwarded-*)
                             │
             ┌───────────────┴───────────────┐
             │                               │
             ▼                               ▼
  [ infrasights-platform ]        [ infrasights-mail-service ]
     Node.js Express (Port 3000)      Node.js Microservice (Port 10000)
     - Marketing SPA & Static Assets  - Transactional Email Dispatcher
     - REST API (/api/*)             - Requester Confirmations
     - Vendor Portal (/vendor/*)     - Internal Ops Notifications
     - Health Endpoint (/api/health) - Health Check (/health)
     - SEO Endpoints (sitemap/robots)
             │                               ▲
             │       Internal Private Mesh   │
             └───────────────────────────────┘
               (http://infrasights-mail-service:10000)
             │
             ▼
    [ Microsoft SQL Server ]
    (TDS Port 1433 / Azure SQL)
    * Automatic in-memory fallback
```

---

## 2. Custom Domain & DNS Configuration

Render provides edge Anycast IPs and automated TLS certificate issuance for custom apex domains and subdomains.

### Required DNS Records

Configure the following records with your authoritative DNS provider (e.g., Cloudflare, Route53, Namecheap, GoDaddy):

| Host / Name | Type | Target / Value | TTL | Purpose |
|---|---|---|---|---|
| `@` (Apex) | `A` | `216.24.57.1` | 300 / Auto | Apex domain resolution (`infrasights.in`) |
| `@` (Alternative) | `ANAME` / `ALIAS` | `infrasights-platform.onrender.com` | 300 / Auto | Flattened CNAME if supported by DNS provider |
| `www` | `CNAME` | `infrasights-platform.onrender.com` | 300 / Auto | Subdomain routing (`www.infrasights.in`) |

> **Note on Cloudflare Users:** If managing DNS through Cloudflare, set proxy status to **DNS Only (Gray Cloud)** during initial domain verification on Render. Once Render confirms the SSL certificate issuance, you may re-enable Cloudflare proxying in "Full (Strict)" SSL mode.

### PaaS Specification (`render.yaml`)

Custom domains are declared directly in the Blueprint specification:

```yaml
services:
  - type: web
    name: infrasights-platform
    env: node
    plan: standard
    buildCommand: npm install
    startCommand: npm start
    healthCheckPath: /api/health
    domains:
      - infrasights.in
      - www.infrasights.in
```

---

## 3. Automated SSL/TLS Management via Let's Encrypt

Render manages the end-to-end TLS lifecycle for all domains listed in `render.yaml`:

1. **Automated Provisioning:** Upon DNS propagation of the A and CNAME records, Render initiates the ACME HTTP-01 or ALPN challenge with Let's Encrypt.
2. **Modern Cipher Suites:** Edge listeners enforce TLS 1.2 and TLS 1.3 with forward secrecy (ECDHE-ECDSA/RSA).
3. **Automated 90-Day Renewal:** Certificates are automatically renewed 30 days prior to expiration without service interruption.
4. **HTTPS Enforcement:** Render automatically redirects unencrypted HTTP traffic (`http://infrasights.in/*`) to HTTPS (`https://infrasights.in/*`) with HTTP 301 Moved Permanently.

---

## 4. Reverse Proxy Header Handling & Express Configuration

Because the Node.js application runs behind Render's edge reverse proxy, Express must be explicitly configured to trust upstream proxy headers.

### Express Configuration (`server/index.js`)

```javascript
// Trust reverse proxy for accurate IP and HTTPS protocol detection
app.enable('trust proxy');
```

### Injected Proxy Headers Handled

When `trust proxy` is active, Express correctly processes:
- `X-Forwarded-Proto`: Accurately detects `https` vs `http`. `req.secure` evaluates to `true`, ensuring secure session cookies and canonical redirects function as intended.
- `X-Forwarded-For`: Resolves the real client IP address (`req.ip`) for audit logging (`dbo.AuditLogs`) and rate limiting rather than logging the edge proxy IP.
- `X-Forwarded-Host`: Preserves the original requested host header (`infrasights.in`).

### Cookie Security Settings

In production, authentication cookies must be configured with strict security flags:

```javascript
res.cookie('infrasights_vendor_token', token, {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production', // Requires HTTPS
  sameSite: 'lax',
  maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
  path: '/'
});
```

---

## 5. Production Health Monitoring & Uptime Probes

Render and external monitoring systems use the health check endpoint to detect container failures and manage zero-downtime rolling deploys.

### Health Endpoint Specification

- **Path:** `GET /api/health`
- **Port:** `3000` (or `process.env.PORT`)
- **Success Status Code:** `200 OK`
- **Content-Type:** `application/json`

### Sample Response Payload

```json
{
  "status": "HEALTHY",
  "product": "Infrasights",
  "version": "2.10.4",
  "timestamp": "2026-11-08T03:15:00.000Z",
  "database": {
    "engine": "MSSQL",
    "connected": true,
    "fallbackActive": false
  },
  "uptime": 86420.15
}
```

### High-Availability & Fallback Resilience

If the primary Microsoft SQL Server database (port 1433) experiences temporary network partition or maintenance, Infrasights automatically activates the in-memory transactional fallback store:

```json
{
  "status": "HEALTHY",
  "product": "Infrasights",
  "version": "2.10.4",
  "timestamp": "2026-11-08T03:15:00.000Z",
  "database": {
    "engine": "IN_MEMORY_FALLBACK",
    "connected": true,
    "fallbackActive": true
  },
  "uptime": 86425.80
}
```

Because the service remains responsive and resilient, the PaaS container is **not** prematurely restarted by orchestrator health check probes during database restarts.

### External Monitoring Integration

Configure synthetic HTTP uptime monitoring (UptimeRobot, BetterStack, Datadog, or New Relic):
- **URL:** `https://infrasights.in/api/health`
- **Interval:** 60 seconds
- **Assertion:** HTTP status equals `200` AND response body contains `"status":"HEALTHY"`

---

## 6. Environment Secrets Provisioning Checklist

Ensure all required production secrets are configured in Render's **Environment Variables** dashboard:

| Variable | Description | Example / Value |
|---|---|---|
| `NODE_ENV` | Runtime environment mode | `production` |
| `PORT` | Listening port for web server | `3000` |
| `JWT_SECRET` | 256-bit secret for signing user tokens | `(Generate random 64-char string)` |
| `VENDOR_SECRET_KEY` | Secret key for programmatic API & vendor login | `(Generate strong random secret)` |
| `VENDOR_ADMIN_EMAIL` | Vendor administrator email address | `admin@infrasights.in` |
| `VENDOR_ADMIN_PASSWORD` | Vendor administrator login password | `(Strong enterprise password)` |
| `DB_SERVER` | Azure SQL or managed MSSQL host | `infrasights-sql.database.windows.net` |
| `DB_PORT` | MSSQL TDS port | `1433` |
| `DB_NAME` | Relational database name | `infrasights_prod` |
| `DB_USER` | SQL authentication user | `infrasights_sa` |
| `DB_PASSWORD` | SQL authentication password | `(Protected SQL Password)` |
| `DB_ENCRYPT` | Enable TDS TLS transport encryption | `true` |
| `MAIL_SERVICE_URL` | Internal Render private mesh URL | `http://infrasights-mail-service:10000` |

---

## 7. Zero-Downtime Deployment Runbook

1. **Push Changes to Repository:**
   ```bash
   git push origin main
   ```
2. **PaaS Build Execution:**
   - Render detects webhook and triggers `npm install` followed by `npm run build`.
   - Node verifies syntax and builds static asset pipeline (`Build completed`).
3. **Container Launch & Health Verification:**
   - New container spins up on internal port `3000`.
   - Render probes `GET /api/health` until HTTP `200 OK` is returned.
4. **Traffic Cutover:**
   - Render edge proxy routes incoming requests from `infrasights.in` to the new container.
   - Old container drains existing connections and terminates cleanly.
5. **Post-Deployment Verification:**
   - Execute verification suite against production:
     ```bash
     curl -sI https://infrasights.in/api/health
     curl -sI https://infrasights.in/sitemap.xml
     curl -sI https://infrasights.in/robots.txt
     ```
