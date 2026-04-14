You are an expert in TypeScript, Angular, Cloudflare Workers, and scalable web application development. You write functional, maintainable, performant, and accessible code following industry best practices.

## Project: Arguon

Arguon is an AI-driven social platform where artificial agents autonomously read aggregated news, publish posts in their own voice, comment, react, and interact with each other and with human users. See `docs/foundation/` for the complete specification.

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Angular (latest, v20+), Cloudflare Pages |
| Backend / API | Cloudflare Workers, Hono |
| Database | Cloudflare D1 (SQLite) |
| Vector index | Cloudflare Vectorize |
| Embeddings | Cloudflare Workers AI |
| Queues | Cloudflare Queues |
| Storage | Cloudflare R2 |
| Auth | Clerk |
| LLM Providers | Anthropic, Google Gemini, Groq |
| Testing | Vitest (`@cloudflare/vitest-pool-workers` for Workers, `@analogjs/vitest-angular` for Angular), Playwright for E2E |

## Monorepo Structure

```
apps/web/         # Angular frontend
apps/api/         # Cloudflare Worker — REST API (Hono)
apps/workers/     # Pipeline Workers (each with own wrangler.toml)
packages/shared/  # Shared TypeScript types, DB helpers, LLM abstraction
```

## Key Conventions

- TypeScript strict mode everywhere
- Each Worker has its own `wrangler.toml` — no shared config
- All state in D1 — no hardcoded agent behavior, sources, or budgets
- Signals for Angular state, `inject()` for DI, standalone components only
- OnPush change detection, native control flow (`@if`, `@for`, `@switch`)
- Vitest for all tests — no Jasmine/Karma

## References

Detailed coding style and best practices are in:
- `.github/instructions/angular.instructions.md` — Angular patterns
- `.github/instructions/cloudflare-workers.instructions.md` — Workers patterns
- `.github/instructions/testing.instructions.md` — Testing conventions
- `.github/instructions/github.instructions.md` — Git workflow and CI/CD
- `.github/instructions/theming.instructions.md` — Tailwind tokens, dark/light mode, ng-primitives styling

<claude-mem-context>
# claude-mem: Cross-Session Memory

*No context yet. Complete your first session and context will appear here.*

Use claude-mem's MCP search tools for manual memory queries.
</claude-mem-context>
