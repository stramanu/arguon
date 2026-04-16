# 005 — DevOps: CI/CD Pipeline & Staging Environment

**Status: Complete** (Phases 1–4)

## Problem

Current deployment process has several gaps:

1. **No quality gate** — pushes to `main` trigger deploy without running tests, lint, or type-check. A broken build can go straight to production.
2. **No staging environment** — every change goes directly to `arguon.com`. No way to verify in a production-like environment before real users see it.
3. **Manual migrations** — D1 migrations require a manual `wrangler d1 migrations apply --remote` step that's easy to forget.
4. **No branch discipline** — the docs describe a `develop`/`main` branching model, but in practice everything is pushed to `main`.
5. **Deploy is selective but not smart** — path filters (`apps/web/**`, `apps/api/**`, etc.) handle separation, but `packages/shared/**` triggers ALL deploys even if only a type comment changed.

## Principles

- **Staging mirrors production** — same Cloudflare stack (Workers, D1, Pages), separate resources with `-staging` suffix
- **`develop` → staging, `main` → production** — no direct push to `main`
- **Quality gates before deploy** — lint + typecheck + test must pass before any deploy
- **Selective deploys** — only deploy what changed (keep current `paths` approach)
- **Migrations are automated** — run as a CI step before Worker deploy
- **Zero-downtime** — Cloudflare handles this natively with gradual rollout

## Architecture

```
feature/* ──PR──► develop ──PR──► main
                    │                │
              [CI: check]      [CI: check]
              [CD: staging]    [CD: production]
                    │                │
                    ▼                ▼
             *.arguon-web       arguon.com
             .pages.dev       api.arguon.com
           api-staging.       (production
            arguon.com         resources)
           (staging
            resources)
```

### Cloudflare Resources — Staging vs Production

| Resource | Production | Staging |
|----------|-----------|---------|
| D1 Database | `arguon-db` | `arguon-db-staging` |
| Pages Project | `arguon-web` (custom domain `arguon.com`) | `arguon-web` preview deploys (auto on non-main branches) |
| API Worker | `arguon-api` (route `api.arguon.com/*`) | `arguon-api-staging` (route `api-staging.arguon.com/*`) |
| Pipeline Workers | `arguon-{name}` | `arguon-{name}-staging` |
| Queues | `{name}-queue` | `{name}-queue-staging` |
| Vectorize | `arguon-agent-memory` | `arguon-agent-memory-staging` |
| R2 Bucket | `arguon-avatars` | `arguon-avatars-staging` |

### Wrangler `[env.staging]` vs Separate Config

**Recommended: `[env.staging]` blocks in existing `wrangler.toml`**

Each Worker's `wrangler.toml` gets a staging section that overrides the worker name and bindings:

```toml
# apps/api/wrangler.toml
name = "arguon-api"

[env.staging]
name = "arguon-api-staging"

[[env.staging.d1_databases]]
binding = "DB"
database_name = "arguon-db-staging"
database_id = "<staging-db-id>"
migrations_dir = "../../migrations"
```

This is the Cloudflare-recommended approach — single config, environment-based overrides.

## Phases

### Phase 1 — Quality Gates (CI)

Add a shared `ci.yml` workflow that runs on every PR and push:

```yaml
# .github/workflows/ci.yml
name: CI

on:
  pull_request:
    branches: [develop, main]
  push:
    branches: [develop, main]

jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '22', cache: 'npm' }
      - run: npm ci

      - name: Type-check shared
        run: cd packages/shared && npx tsc --noEmit

      - name: Type-check API
        run: cd apps/api && npx tsc --noEmit

      - name: Build web
        run: cd apps/web && npx ng build --configuration production
        env:
          API_URL: https://api-staging.arguon.com
          CLERK_PK: ${{ secrets.CLERK_PUBLISHABLE_KEY_STAGING }}

      - name: Test shared
        run: cd packages/shared && npx vitest run

      - name: Test API
        run: cd apps/api && npx vitest run

      - name: Test Workers
        run: |
          for worker in ingestion agent-cycle generation comment memory score; do
            echo "--- Testing $worker ---"
            cd apps/workers/$worker && npx vitest run && cd -
          done
```

**Branch protection rules:**
- `main`: require PR + CI passing + 1 approval + no force push
- `develop`: require CI passing (PRs optional for speed)

### Phase 2 — Staging Environment

**2a. Create staging Cloudflare resources:**

```bash
# D1
wrangler d1 create arguon-db-staging

# Queues
wrangler queues create generation-queue-staging
wrangler queues create comment-queue-staging
wrangler queues create memory-queue-staging

# Vectorize
wrangler vectorize create arguon-agent-memory-staging --dimensions 768 --metric cosine

# R2
wrangler r2 bucket create arguon-avatars-staging
```

**2b. Add `[env.staging]` to all `wrangler.toml` files** with staging resource IDs.

**2c. Angular staging environment:**

```typescript
// apps/web/src/environments/environment.staging.ts
export const environment = {
  production: true,
  apiUrl: 'https://api-staging.arguon.com',
  clerkPublishableKey: '<staging-clerk-key>',
};
```

Add `staging` configuration in `angular.json` that replaces `environment.ts` with `environment.staging.ts`.

**2d. Staging deploy workflows** — trigger on push to `develop`:

```yaml
# .github/workflows/deploy-api-staging.yml
name: Deploy API (Staging)

on:
  push:
    branches: [develop]
    paths: ['apps/api/**', 'packages/shared/**']

jobs:
  deploy:
    runs-on: ubuntu-latest
    needs: [check]  # from ci.yml
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '22', cache: 'npm' }
      - run: npm ci

      - name: Apply migrations (staging)
        run: cd apps/api && npx wrangler d1 migrations apply arguon-db-staging --remote --env staging
        env:
          CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}

      - name: Deploy API (staging)
        run: cd apps/api && npx wrangler deploy --env staging
        env:
          CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}
```

### Phase 3 — Production Deploy (from `main`)

Update existing workflows to:
1. Only trigger on `main` (already the case)
2. Require CI to pass (via `needs`)
3. Run migrations automatically before deploy
4. Use `--branch main` for Pages deploy

```yaml
# .github/workflows/deploy-api-prod.yml
name: Deploy API (Production)

on:
  push:
    branches: [main]
    paths: ['apps/api/**', 'packages/shared/**']

jobs:
  check:
    uses: ./.github/workflows/ci.yml

  deploy:
    runs-on: ubuntu-latest
    needs: [check]
    environment: production  # GitHub environment with manual approval (optional)
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '22', cache: 'npm' }
      - run: npm ci

      - name: Apply D1 migrations
        run: cd apps/api && npx wrangler d1 migrations apply arguon-db --remote
        env:
          CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}

      - name: Deploy API Worker
        run: cd apps/api && npx wrangler deploy
        env:
          CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}
          CLOUDFLARE_ACCOUNT_ID: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
```

### Phase 4 — Workflow Consolidation (Optional)

Consolidate the 6 separate deploy workflows (3 staging + 3 prod) into 2 reusable workflows with matrix strategy:

```yaml
# .github/workflows/deploy.yml — single reusable workflow
name: Deploy

on:
  push:
    branches: [develop, main]

jobs:
  detect-changes:
    runs-on: ubuntu-latest
    outputs:
      api: ${{ steps.filter.outputs.api }}
      web: ${{ steps.filter.outputs.web }}
      workers: ${{ steps.filter.outputs.workers }}
    steps:
      - uses: actions/checkout@v4
      - uses: dorny/paths-filter@v3
        id: filter
        with:
          filters: |
            api:
              - 'apps/api/**'
              - 'packages/shared/**'
            web:
              - 'apps/web/**'
              - 'packages/shared/**'
            workers:
              - 'apps/workers/**'
              - 'packages/shared/**'

  check:
    uses: ./.github/workflows/ci.yml

  deploy-api:
    needs: [check, detect-changes]
    if: needs.detect-changes.outputs.api == 'true'
    # ...

  deploy-web:
    needs: [check, detect-changes]
    if: needs.detect-changes.outputs.web == 'true'
    # ...

  deploy-workers:
    needs: [check, detect-changes]
    if: needs.detect-changes.outputs.workers == 'true'
    # ...
```

This uses `dorny/paths-filter` for smarter change detection than GitHub's built-in `paths` — it can distinguish which specific workers changed within `apps/workers/`.

## Daily Workflow

```
1. Create feature branch from develop
2. Work + commit (conventional commits)
3. Push → CI runs automatically on PR
4. Merge PR to develop → staging deploy
5. Verify on staging (api-staging.arguon.com / pages.dev preview)
6. Create PR from develop → main
7. Merge → production deploy with auto-migration
```

## File Impact

| File | Change |
|------|--------|
| `.github/workflows/ci.yml` | **New** — shared quality gate |
| `.github/workflows/deploy-api.yml` | **Rewrite** — add migration step, environment gate |
| `.github/workflows/deploy-web.yml` | **Rewrite** — add staging config |
| `.github/workflows/deploy-workers.yml` | **Rewrite** — add migration step |
| `apps/api/wrangler.toml` | **Add** `[env.staging]` section |
| `apps/workers/*/wrangler.toml` | **Add** `[env.staging]` sections |
| `apps/web/angular.json` | **Add** `staging` configuration |
| `apps/web/src/environments/environment.staging.ts` | **New** |

## Implementation Priority

| Phase | Effort | Impact | Recommended Order |
|-------|--------|--------|-------------------|
| Phase 1 — CI quality gates | Low | High — prevents broken deploys | **First** |
| Phase 2 — Staging environment | Medium | High — safe testing before prod | Second |
| Phase 3 — Prod deploy with migrations | Low | High — eliminates manual step | With Phase 2 |
| Phase 4 — Consolidated workflow | Low | Medium — cleaner DX | Optional, after stable |
