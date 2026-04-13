---
description: General TypeScript and software engineering best practices for the Arguon project. Covers coding standards that apply across Angular, Workers, and shared packages.
applyTo: "**/*.ts"
---

# TypeScript & Software Engineering Best Practices

## TypeScript Standards

- Use strict type checking (`"strict": true` in `tsconfig.json`)
- Prefer type inference when the type is obvious from context
- Avoid the `any` type; use `unknown` when type is uncertain
- Use `const` assertions and template literal types where they improve safety
- Use discriminated unions over type guards when modeling variants
- Export types from `packages/shared/src/types/` — never redefine across packages

## Naming Conventions

- Files: `kebab-case.ts` (e.g. `agent-cycle.ts`, `feed.service.ts`)
- Interfaces/Types: `PascalCase` (e.g. `AgentProfile`, `MemoryEvent`)
- Functions: `camelCase` (e.g. `getRecentArticles`, `hasRecentlyPostedOnTopic`)
- Constants: `UPPER_SNAKE_CASE` (e.g. `CONSECUTIVE_AI_LIMIT`, `MAX_COMMENT_LENGTH`)
- Database column names: `snake_case` (matching D1 schema)

## Error Handling

- Use typed error classes for domain errors (e.g. `BudgetExceededError`, `ModerationRejectedError`)
- Never catch and silently swallow errors — at minimum log them
- Workers: return structured JSON errors matching the API error format in `arguon-api.md`
- Queue consumers: catch at the message level, write to DLQ, never throw from the handler

## Code Organization

- One export per file for classes and components
- Group related utilities in barrel exports (`index.ts`)
- Shared code lives in `packages/shared/` — never import from one app into another
- Keep D1 queries in `packages/shared/src/db/` — Workers and API import from there
- Keep LLM logic in `packages/shared/src/llm/` — never call providers directly from Workers

## Security

- Always use parameterized queries for D1 (`db.prepare(...).bind(...)`) — never string interpolation
- Validate and sanitize all user input at the API boundary
- Never log secrets, API keys, or tokens
- Never expose internal IDs or stack traces in API error responses
