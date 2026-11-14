# Infrasights v2.10 — Netlify Production Deployment & Custom Domain Guide

This document provides step-by-step instructions for hosting the **Infrasights v2.10 Enterprise Platform** on **Netlify** with the custom domain **`infrasights.in`** and **`www.infrasights.in`**.

---

## 1. Architecture on Netlify

```
                           Internet Traffic
                                  │
                                  ▼
               [ Authoritative DNS / Domain Registrar ]
                   (GoDaddy, Cloudflare, Namecheap)
                  A: @   -> 75.2.60.5 (Netlify IP)
                  CNAME: www -> <site-name>.netlify.app
                                  │
                                  ▼
                    [ Netlify Global Edge CDN ]
            - Anycast Edge CDN across 6 continents
            - Automated Let's Encrypt TLS/SSL Certificate
            - Canonical 301 Redirect: www.infrasights.in -> infrasights.in
            - Immutable caching on CSS/JS/Assets (365 days)
            - No-cache on HTML & dynamic assets (must-revalidate)
                                  │
                  ┌───────────────┴───────────────┐
                  │                               │
                  ▼                               ▼
       [ Static Frontend Assets ]      [ Reverse Proxy /api/* ]
       - index.html (SPA)              - Routes to Render/Node backend:
       - css/styles.css                  https://infrasights-platform.onrender.com
       - js/app.js & js/canvas.js      - Transparent proxy (no CORS issues)
       - assets/ & SEO files           - Handles Auth, Deployments, Email
```

---

## 2. Netlify Configuration File (`netlify.toml`)

The repository includes a production-ready `netlify.toml` file in the root directory:

```toml
[build]
  publish = "."
  command = "npm run build"

[build.environment]
  NODE_VERSION = "20"

[[headers]]
  for = "/*"
  [headers.values]
    X-Frame-Options = "SAMEORIGIN"
    X-Content-Type-Options = "nosniff"
    X-XSS-Protection = "1; mode=block"
    Referrer-Policy = "strict-origin-when-cross-origin"
    Permissions-Policy = "camera=(), microphone=(), geolocation=()"
    Strict-Transport-Security = "max-age=31536000; includeSubDomains; preload"

[[redirects]]
  from = "https://www.infrasights.in/*"
  to = "https://infrasights.in/:splat"
  status = 301
  force = true

[[redirects]]
  from = "/api/*"
  to = "https://infrasights-platform.onrender.com/api/:splat"
  status = 200
  force = false

[[redirects]]
  from = "/*"
  to = "/index.html"
  status = 200
```

---

## 3. Step-by-Step Deployment Instructions

### Step 1: Connect GitHub Repository to Netlify
1. Log in to your [Netlify Dashboard](https://app.netlify.com).
2. Click **Add new site** > **Import an existing project**.
3. Select **GitHub** as the Git provider and authorize Netlify.
4. Select the repository: **`RAhulDEV-stack/InfraSights-Marketing`**.
5. Netlify will auto-detect settings from `netlify.toml`:
   - **Branch to deploy**: `main`
   - **Base directory**: `.` (leave default)
   - **Build command**: `npm run build`
   - **Publish directory**: `.`
6. Click **Deploy site**.
7. Netlify will assign a temporary subdomain (e.g., `infrasights-marketing.netlify.app`).

---

### Step 2: Add Custom Domain (`infrasights.in`)
1. In your Netlify site dashboard, navigate to **Site configuration** > **Domain management**.
2. Click **Add a domain**.
3. Enter: `infrasights.in` and click **Verify**.
4. Confirm by clicking **Add domain**.
5. Netlify will automatically add:
   - Primary domain: `infrasights.in`
   - Domain alias / redirect: `www.infrasights.in`

---

### Step 3: Configure DNS Records at Domain Registrar

Log in to the DNS management panel where `infrasights.in` was registered (GoDaddy, Namecheap, Cloudflare, BigRock, Hostinger, etc.) and add the following records:

#### Option A: External DNS (Recommended if you have other DNS records like MX emails)

| Type | Name / Host | Target / Value | TTL | Note |
| :--- | :--- | :--- | :--- | :--- |
| **A** | `@` (or `infrasights.in`) | `75.2.60.5` | `300` / `Auto` | Netlify Load Balancer Anycast IP |
| **CNAME** | `www` | `<your-site-name>.netlify.app` | `300` / `Auto` | Point to your Netlify site subdomain |

> **Cloudflare note:** If using Cloudflare DNS, set the Proxy status to **DNS only** (Gray Cloud) during certificate verification. After SSL is issued, you can optionally enable the proxy.

#### Option B: Netlify DNS (Full Delegation)
Alternatively, point your domain's Nameservers (NS) to Netlify:
- `dns1.p01.nsone.net`
- `dns2.p01.nsone.net`
- `dns3.p01.nsone.net`
- `dns4.p01.nsone.net`

---

### Step 4: Automatic SSL/TLS Certificate Provisioning
1. Once DNS records propagate (typically 5–30 minutes), scroll down to **SSL/TLS certificate** under **Domain management**.
2. Click **Verify DNS configuration** (if not already verified automatically).
3. Netlify will automatically request and issue a free **Let's Encrypt SSL/TLS Certificate** covering both `infrasights.in` and `www.infrasights.in`.
4. Enable **Force HTTPS** to guarantee all HTTP traffic is redirected to HTTPS with HSTS preloaded.

---

### Step 5: Transactional Email Environment Variables

In Netlify under **Site configuration** > **Environment variables**, configure your email delivery provider to deliver live confirmation and admin alert emails:

- `SMTP_HOST`: `smtpout.secureserver.net` (GoDaddy) or your provider
- `SMTP_PORT`: `465` (SSL)
- `SMTP_SECURE`: `true`
- `SMTP_USER`: `admin@infrasights.in`
- `SMTP_PASS`: `[your-email-password]`
- `FROM_EMAIL`: `admin@infrasights.in`
- `ADMIN_NOTIFICATION_EMAIL`: `admin@infrasights.in`

*(Alternatively, use `RESEND_API_KEY` for instant HTTP-based serverless email delivery).*

---

## 4. Verification Checklist

- [ ] `https://infrasights.in` loads the Infrasights v2.10 platform.
- [ ] `https://www.infrasights.in` permanently redirects (301) to `https://infrasights.in`.
- [ ] SSL padlock icon is green / valid with Let's Encrypt certificate.
- [ ] SAN Fabric Canvas HUD animations render smoothly.
- [ ] Navigation tabs (Platform, Telemetry, Architecture, Deployments) route cleanly.
- [ ] Form and Auth modals load with interactive state management.
- [ ] `https://infrasights.in/sitemap.xml` and `https://infrasights.in/robots.txt` return correct XML/plain text.
