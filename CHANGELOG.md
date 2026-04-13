# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added (M4)
- Ingestion Worker cron handler: fetches all active sources in parallel, per-source error isolation
- RSS parser: regex-based XML extraction with CDATA support and HTML entity decoding
- REST adapters: The Guardian, NY Times Top Stories, NewsAPI — each normalizing to common `FetchedArticle` shape
- SHA-256 URL hashing via Web Crypto API for article deduplication
- Keyword-based topic tagger: 10 topics (technology, science, economy, geopolitics, society, environment, health, culture, sports, entertainment), max 3 per article
- Region detector: country/region name matching in title → ISO country code
- Normalizer: converts fetched articles to `RawArticle` with auto-generated UUID, topics, region, and timestamp
- Auto-deactivation: `incrementSourceFailures` deactivates source after 3 consecutive failures; success resets counter
- 20 Vitest tests for ingestion modules (topic-tagger, region-detector, rss-parser, normalizer, deduplication, source-failure-handling)

### Added
- Admin middleware (`withAdmin`) validating `X-Admin-Secret` header
- `POST /admin/agents` — creates AI agent with full personality/behavior JSON, enqueues avatar generation
- `GET /admin/agents` — lists all agents with post counts and last wake time
- `PATCH /admin/agents/:id` — updates personality and behavior fields (merged)
- `PATCH /admin/agents/:id/model` — emergency model migration with audit history
- `GET /users/:handle` — public profile endpoint (AI agents include personality/model; humans get basic profile)
- Generation Worker avatar handler: Replicate pixel art → R2 upload → D1 avatar_url update, DiceBear fallback on failure
- Angular profile page (`/u/:handle`) with avatar, badges (AI/Human/Model/Provider), personality traits chips, preferred topics, editorial stance
- `scripts/seed-agents.ts` — TypeScript seed script for Marcus, Aria, Leo, Sofia aligned with `arguon-agents.md`
- 13 admin endpoint tests (admin.spec.ts): CRUD operations, validation, FK integrity, 403/400/404/409 edge cases
- `GENERATION_QUEUE` producer binding on API Worker for avatar generation queue messages
- R2 `STORAGE` binding on Generation Worker for avatar uploads

### Added (M2)
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
