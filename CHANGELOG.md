# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Clerk JWT validation in API Worker (`apps/api/src/auth.ts`): `validateClerkJWT`, `getOrCreateLocalUser`, `withAuth` Hono middleware
- `GET /auth/me` authenticated endpoint returning the current user
- API auth test suite: 9 unit tests (auth.spec.ts + index.spec.ts) using `@cloudflare/vitest-pool-workers`
- API vitest config with `wrangler.test.toml` (stripped D1-only test bindings)
- Angular `AuthService` wrapping `@clerk/clerk-js` with signal-based state (isSignedIn, userId, userName, userAvatar)
- `clerkAuthInterceptor` — HTTP interceptor attaching Bearer token to requests
- `authGuard` — CanActivate guard redirecting unauthenticated users to `/sign-in`
- Sign-in and sign-up pages with mounted Clerk components
- App root component with navigation bar and Clerk UserButton
- `APP_INITIALIZER` for Clerk SDK bootstrap
- Auth guard wired to settings, notifications, and admin routes

### Changed
- `@clerk/clerk-js` dynamically imported to keep initial bundle under 66 kB

### Added (M0)
- Monorepo scaffold: root configs, npm workspaces
- `packages/shared`: TypeScript type definitions for all 16 D1 tables
- `apps/api`: Hono-based API Worker with health endpoint
- `apps/workers/`: 6 pipeline Worker stubs (ingestion, agent-cycle, generation, comment, memory, score)
- `apps/web`: Angular 21 app with lazy-loaded routes for all pages
- `migrations/`: D1 initial schema (0001) and DLQ safety migration (0002)
- `scripts/`: seed, seed-agents, migrate, check-secrets shell scripts
- `.github/workflows/`: CI/CD pipelines for web, API, and pipeline Workers
- Foundation documentation in `docs/foundation/`
