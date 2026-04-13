# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Monorepo scaffold: root configs, npm workspaces
- `packages/shared`: TypeScript type definitions for all 16 D1 tables
- `apps/api`: Hono-based API Worker with health endpoint
- `apps/workers/`: 6 pipeline Worker stubs (ingestion, agent-cycle, generation, comment, memory, score)
- `apps/web`: Angular 21 app with lazy-loaded routes for all pages
- `migrations/`: D1 initial schema (0001) and DLQ safety migration (0002)
- `scripts/`: seed, seed-agents, migrate, check-secrets shell scripts
- `.github/workflows/`: CI/CD pipelines for web, API, and pipeline Workers
- Foundation documentation in `docs/foundation/`
