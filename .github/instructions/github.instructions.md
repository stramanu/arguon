---
description: GitHub workflow, branching strategy, commit conventions, CI/CD, and gh CLI usage for the Arguon project.
applyTo: ".github/**,**/.github/**"
---

# GitHub Workflow & CI/CD

## Branching Strategy

- `main` — production branch, always deployable
- `develop` — integration branch, deploys to staging
- `feature/<name>` — feature branches, created from `develop`
- `fix/<name>` — bug fix branches, created from `develop`
- `hotfix/<name>` — urgent production fixes, created from `main`, merged to both `main` and `develop`

## Commit Conventions

Follow [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>(<scope>): <short description>

[optional body]

[optional footer]
```

Types: `feat`, `fix`, `docs`, `style`, `refactor`, `test`, `chore`, `ci`, `perf`

Scopes: `web`, `api`, `workers`, `shared`, `infra`, `docs`

Examples:
```
feat(api): add feed endpoint with cursor pagination
fix(workers): handle Vectorize timeout in memory worker
docs(foundation): update schema with missing columns
ci: add matrix deployment for pipeline workers
test(shared): add D1 query helper unit tests
```

## Pull Request Conventions

- PR title follows the same commit convention format
- Description must include: what changed, why, and how to test
- Link to relevant milestone or issue
- All checks must pass before merge
- Squash merge into `develop`, merge commit into `main`

## CI/CD Pipelines

Three GitHub Actions workflows deploy independently based on changed paths:

| Workflow | Trigger paths | Deploys |
|---|---|---|
| `deploy-web.yml` | `apps/web/**`, `packages/shared/**` | Angular to Cloudflare Pages |
| `deploy-api.yml` | `apps/api/**`, `packages/shared/**` | API Worker to Cloudflare |
| `deploy-workers.yml` | `apps/workers/**`, `packages/shared/**` | Pipeline Workers (matrix strategy, one job per worker) |

### Required GitHub Secrets

| Secret | Purpose |
|---|---|
| `CLOUDFLARE_API_TOKEN` | CF API token (Workers, D1, R2, Pages edit permissions) |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare account ID |
| `CLERK_PUBLISHABLE_KEY_PROD` | Clerk live publishable key for Angular build |

## GitHub CLI (`gh`) Usage

```bash
# Create a feature branch and PR
gh repo clone <owner>/arguon
cd arguon
git checkout -b feature/feed-api develop
# ... make changes ...
git push -u origin feature/feed-api
gh pr create --base develop --title "feat(api): add feed endpoint" --body "..."

# Check CI status
gh pr checks

# Merge when ready
gh pr merge --squash

# Create a release
gh release create v0.1.0 --title "Milestone 1 — Database" --notes "..."

# View workflow runs
gh run list --workflow deploy-api.yml
gh run view <run-id> --log
```

## Issue Templates

Use GitHub Issues for tracking bugs and features. Reference milestones from `arguon-roadmap.md`.

```bash
# Create an issue linked to a milestone
gh issue create --title "feat: implement feed pagination" --label "enhancement" --milestone "M7 — Feed API"

# List open issues for a milestone
gh issue list --milestone "M7 — Feed API"
```

## Repository Settings

- Branch protection on `main`: require PR reviews, require CI passing, no force push
- Branch protection on `develop`: require CI passing
- Enable "Automatically delete head branches" after merge
- Enable Dependabot for security updates
