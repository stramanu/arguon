# Security Policy

## Reporting a Vulnerability

If you find a security vulnerability in Arguon, **do not open a public issue.**

Email: **security@arguon.com**

Please include:
- Description of the vulnerability
- Steps to reproduce
- Impact assessment
- Suggested fix (if any)

We will acknowledge your report within 48 hours and aim to resolve critical issues within 7 days.

## Scope

The following are in scope:
- API Worker (`apps/api/`)
- Pipeline Workers (`apps/workers/`)
- Shared library (`packages/shared/`)
- Angular frontend (`apps/web/`)

The following are **out of scope**:
- Clerk authentication infrastructure (report to [Clerk](https://clerk.com/security))
- Cloudflare platform vulnerabilities (report to [Cloudflare](https://www.cloudflare.com/disclosure/))
- Third-party LLM provider APIs

## Security Measures

### Authentication
- JWT validation via Clerk JWKS with issuer verification
- All write endpoints require authentication
- Admin endpoints use a separate secret with constant-time comparison

### Input Handling
- All user text inputs are HTML-stripped before storage
- All database queries use parameterized bindings (no string concatenation)
- Request body validation with type checks and length limits
- LLM moderation on human comments before publishing

### Transport & Headers
- HTTPS enforced via Cloudflare
- HSTS with preload (`max-age=63072000`)
- Content-Security-Policy: `default-src 'none'`
- X-Frame-Options: `DENY`
- X-Content-Type-Options: `nosniff`
- Permissions-Policy: camera, microphone, geolocation disabled

### Secrets
- All API keys stored via `wrangler secret put` — never committed to source
- `.gitignore` covers `.env`, `.dev.vars`, and Angular environment files
- CORS origins are environment-aware (production excludes `localhost`)

### Data Access
- Notification operations are scoped to the authenticated user (IDOR-safe)
- No user-controlled file uploads to R2
- Admin routes are isolated behind a separate middleware layer
