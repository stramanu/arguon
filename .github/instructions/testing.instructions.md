---
description: Testing conventions and patterns for the Arguon project. Covers Vitest setup for Workers and Angular, mocking patterns, and E2E testing with Playwright.
applyTo: "**/*.spec.ts,**/*.test.ts,**/vitest*,**/playwright*"
---

# Testing Conventions

## Test Runner

**Vitest** is the only test runner for the entire monorepo — no Jasmine, no Karma, no Jest.

| Layer | Setup | Notes |
|---|---|---|
| Workers + Shared | `vitest` + `@cloudflare/vitest-pool-workers` | Tests run in the Workers runtime with real D1/R2/Queues bindings |
| Angular | `vitest` via `@analogjs/vitest-angular` | Component and service testing with TestBed |
| E2E | Playwright | Cross-browser, runs against a deployed or local environment |

## File Naming

- Unit/integration tests: `*.spec.ts` (co-located with source file)
- E2E tests: `e2e/**/*.spec.ts`

## Workers Testing

Use `@cloudflare/vitest-pool-workers` to get a real miniflare environment with D1, Queues, etc.

```ts
// vitest.config.ts (per worker)
import { defineWorkersConfig } from '@cloudflare/vitest-pool-workers/config';

export default defineWorkersConfig({
  test: {
    poolOptions: {
      workers: {
        wrangler: { configPath: './wrangler.toml' },
      },
    },
  },
});
```

### D1 Testing Pattern

```ts
import { env } from 'cloudflare:test';
import { describe, it, expect, beforeEach } from 'vitest';

describe('getUserByHandle', () => {
  beforeEach(async () => {
    // Apply migrations or seed data
    await env.DB.exec(`INSERT INTO users (id, handle, name, is_ai, created_at)
      VALUES ('u1', 'marcus', 'Marcus', 1, '2025-01-01T00:00:00Z')`);
  });

  it('returns user when handle exists', async () => {
    const user = await getUserByHandle('marcus', env.DB);
    expect(user).toBeDefined();
    expect(user!.name).toBe('Marcus');
  });

  it('returns null when handle does not exist', async () => {
    const user = await getUserByHandle('unknown', env.DB);
    expect(user).toBeNull();
  });
});
```

### Queue Testing Pattern

```ts
import { env } from 'cloudflare:test';

it('enqueues memory event after post generation', async () => {
  const messages: unknown[] = [];
  // spy on queue send
  vi.spyOn(env.MEMORY_QUEUE, 'send').mockImplementation(async (msg) => {
    messages.push(msg);
  });

  await generatePost(agentId, articleId, env);

  expect(messages).toHaveLength(1);
  expect(messages[0]).toMatchObject({ event_type: 'posted' });
});
```

## Angular Testing

Use `@analogjs/vitest-angular` for Angular component and service tests.

```ts
import { TestBed } from '@angular/core/testing';
import { describe, it, expect } from 'vitest';

describe('ConfidenceBadgeComponent', () => {
  it('displays green for score >= 90', async () => {
    await TestBed.configureTestingModule({
      imports: [ConfidenceBadgeComponent],
    }).compileComponents();

    const fixture = TestBed.createComponent(ConfidenceBadgeComponent);
    fixture.componentRef.setInput('score', 95);
    fixture.detectChanges();

    const badge = fixture.nativeElement.querySelector('.badge');
    expect(badge.classList).toContain('badge--green');
    expect(badge.textContent).toContain('Highly verified');
  });
});
```

## E2E Testing (Playwright)

```ts
import { test, expect } from '@playwright/test';

test('feed loads with posts', async ({ page }) => {
  await page.goto('/explore');
  await expect(page.locator('[data-testid="post-card"]').first()).toBeVisible();
});

test('sign in flow', async ({ page }) => {
  await page.goto('/sign-in');
  // Clerk sign-in flow
  await page.fill('[name="identifier"]', 'test@example.com');
  await page.click('button[type="submit"]');
  // ... complete auth flow
  await expect(page).toHaveURL('/');
});
```

## Testing Principles

- Every D1 query helper must have tests
- Every API endpoint must have request/response tests
- Every queue consumer must have happy path + error handling tests
- Test memory decay formula with known values
- Test anti-loop rule with edge cases (exactly N, N+1 consecutive AI comments)
- Use `data-testid` attributes for E2E selectors — never CSS classes
- Mock LLM providers at the HTTP level (intercept fetch), not at the provider level
- Never test implementation details — test behavior and outcomes
