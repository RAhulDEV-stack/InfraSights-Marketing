# E2E Test Infra: Infrasights v2.10 Marketing Platform

## Test Philosophy
- Opaque-box, requirement-driven verification derived directly from `ORIGINAL_REQUEST.md` and user-facing specifications.
- Comprehensive automated verification across 4 tiers:
  1. **Tier 1 - Smoke & Availability**: Page load, asset 200s, 0 console/runtime errors, living canvas initialization.
  2. **Tier 2 - Guardrail & Content Compliance**: Automated recursive DOM text scanner and network payload inspector verifying 0 AI buzzwords and 0 switch vendor brand/model names.
  3. **Tier 3 - Multi-Device Responsive Matrix**: Desktop (1920x1080), Tablet (768x1024), Mobile (375x667), and `prefers-reduced-motion` compliance.
  4. **Tier 4 - End-to-End User Funnel**: Full authenticated qualification journey from hero CTA to registration, login, 5-step questionnaire, submission, tracking reference generation (`INF-REQ-YYYYMMDD-XXXX`), and persistent database verification.

## Feature Inventory & Test Coverage Mapping
| # | Feature | Source | Tier 1 | Tier 2 | Tier 3 | Tier 4 |
|---|---------|--------|:------:|:------:|:------:|:------:|
| 1 | Zero-AI & ML Buzzwords | R2 | - | ✓ (Regex DOM + Net) | - | - |
| 2 | No Switch Brand/Model Names | R2 | - | ✓ (Regex DOM + Net) | - | - |
| 3 | Direct Switch Collection (No SANnav) | R2 | - | ✓ (Copy Audit) | - | - |
| 4 | Consistent Product Naming (Infrasights v2.10) | R3 | ✓ | ✓ | ✓ | ✓ |
| 5 | Hero Section & Living Topology Animation | R1 | ✓ | ✓ | ✓ | ✓ |
| 6 | Challenge Comparison Matrix | R1 | ✓ | ✓ | ✓ | - |
| 7 | Platform Capabilities Cards | R1 | ✓ | ✓ | ✓ | - |
| 8 | How It Works Architecture Pipeline | R1 | ✓ | ✓ | ✓ | - |
| 9 | Product Interface Preview Tabs | R1 | ✓ | ✓ | ✓ | - |
| 10 | Technical FAQ Accordion | R1 | ✓ | ✓ | ✓ | - |
| 11 | Responsive Header & Mobile Drawer | R1 | ✓ | - | ✓ | - |
| 12 | Backend Health Probe (/api/health) | R1 | ✓ | - | - | - |
| 13 | User Registration (/api/auth/register) | R1, R4 | ✓ | - | - | ✓ |
| 14 | User Authentication (/api/auth/login) | R1, R4 | ✓ | - | - | ✓ |
| 15 | Primary CTA Authenticated Gate | R4 | ✓ | - | ✓ | ✓ |
| 16 | 5-Step Qualification Questionnaire | R4 | ✓ | - | ✓ | ✓ |
| 17 | Unique Tracking Ref Generation | R4 | - | - | - | ✓ |
| 18 | MSSQL Database Persistence | R1, R4 | - | - | - | ✓ |

## Test Architecture
- **Framework**: Playwright with TypeScript (`e2e/`)
- **Invocation**: `npx playwright test`
- **Reporters**: List reporter and HTML report in `test-results/html-report`
- **Automated WebServer**: Starts Node.js Express server on `http://localhost:3000`
- **Viewports Tested**:
  - Desktop Chrome: 1920x1080
  - Tablet Safari / iPad: 768x1024
  - Mobile Chrome / Pixel 5: 375x667

## Pass/Fail Criteria
- 100% test cases pass with exit code 0.
- Zero matches for forbidden AI keywords (`\b(AI|ML|machine\s*learning|neural|deep\s*learning|LLM|artificial\s*intelligence)\b`).
- Zero matches for forbidden vendor brand/model names (`\b(Brocade|Cisco|MDS|SANnav|Fabric\s*OS|NX-OS|X7|G620|9710)\b`).
- Generated tracking reference strictly matches `/^INF-REQ-\d{8}-[A-Z0-9]{4}$/`.
- Submission persists verified record in database.
