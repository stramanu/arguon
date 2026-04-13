---
description: Cloudflare Workers coding patterns, D1 database access, Queues, Vectorize, and Workers AI for the Arguon backend and pipeline Workers.
applyTo: "apps/api/**,apps/workers/**"
---

# Cloudflare Workers Best Practices

## Worker Structure

Each Worker has its own entry point and `wrangler.toml`. Never share a single config across multiple Workers with different triggers.

### HTTP Worker (API)

```ts
import { Hono } from 'hono';
import { cors } from 'hono/cors';

type Bindings = {
  DB: D1Database;
  STORAGE: R2Bucket;
  MEMORY_INDEX: VectorizeIndex;
  AI: Ai;
  CLERK_SECRET_KEY: string;
  CLERK_JWKS_URL: string;
  ADMIN_SECRET: string;
  MODERATOR_MODEL: string;
};

const app = new Hono<{ Bindings: Bindings }>();

app.use('*', cors({
  origin: ['https://arguon.com', 'http://localhost:4200'],
  allowMethods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization', 'X-Admin-Secret'],
}));

export default app;
```

### Scheduled Worker (Cron)

```ts
export default {
  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    // Cron logic here
  },
};
```

### Queue Consumer Worker

```ts
export default {
  async queue(batch: MessageBatch<QueueMessage>, env: Env, ctx: ExecutionContext): Promise<void> {
    for (const message of batch.messages) {
      try {
        await processMessage(message.body, env);
        message.ack();
      } catch (error) {
        console.error(`Failed to process message: ${error}`);
        message.retry();
      }
    }
  },
};
```

## D1 Database (SQLite)

- **Always use parameterized queries** — never interpolate values into SQL strings
- Use `db.prepare(...).bind(...)` for all queries
- Use `.first<T>()` for single row, `.all<T>()` for multiple rows, `.run()` for writes
- D1 is synchronous per-request — no connection pooling needed
- Keep query helpers in `packages/shared/src/db/` — Workers import from there

```ts
// CORRECT
const user = await db.prepare('SELECT * FROM users WHERE id = ?').bind(userId).first<User>();

// WRONG — SQL injection risk
const user = await db.prepare(`SELECT * FROM users WHERE id = '${userId}'`).first();
```

### Batch Operations

```ts
const batch = [
  db.prepare('INSERT INTO posts (id, headline) VALUES (?, ?)').bind(id, headline),
  db.prepare('INSERT INTO post_sources (post_id, url) VALUES (?, ?)').bind(id, sourceUrl),
];
await db.batch(batch);
```

## Queues

- Queue producers: `await env.QUEUE_NAME.send(payload)`
- Queue consumers: process each message in a try/catch, ack on success, retry on failure
- Configure dead-letter queues in `wrangler.toml` for every consumer
- Never throw from a queue handler — catch and write to DLQ table instead
- Queue messages are JSON-serializable objects

```ts
// Producer
await env.GENERATION_QUEUE.send({
  agent_id: agent.id,
  article_id: article.id,
});

// Consumer — always handle errors per message
for (const message of batch.messages) {
  try {
    await handleGeneration(message.body, env);
    message.ack();
  } catch (error) {
    await insertDlqEntry(env.DB, 'generation-queue', message.body, error);
    message.ack(); // Ack to prevent infinite retry — DLQ table is the record
  }
}
```

## Vectorize

- Embedding model: `@cf/baai/bge-base-en-v1.5` (768 dimensions, free via Workers AI)
- Always store `agent_id` in vector metadata for filtered queries
- Use `filter: { agent_id }` in queries — Vectorize supports metadata filtering
- Upsert vectors with all required metadata at creation time

```ts
// Generate embedding
const embeddingResult = await env.AI.run('@cf/baai/bge-base-en-v1.5', { text: [summary] });
const values = Array.from(embeddingResult.data[0]);

// Upsert with metadata
await env.MEMORY_INDEX.upsert([{
  id: memoryId,
  values,
  metadata: { agent_id: agentId, event_type, ref_id, created_at, initial_weight },
}]);

// Query with agent filter
const results = await env.MEMORY_INDEX.query(contextEmbedding, {
  topK: 20,
  filter: { agent_id: agentId },
  returnMetadata: true,
});
```

## R2 Storage

- Use for binary objects (avatars, cached articles)
- Set appropriate `Content-Type` and `Cache-Control` headers on put
- Avatar URLs: `arguon-avatars/{agent_id}.png`

```ts
await env.STORAGE.put(`${agentId}.png`, imageBuffer, {
  httpMetadata: {
    contentType: 'image/png',
    cacheControl: 'public, max-age=31536000, immutable',
  },
});
```

## Error Handling

- Return structured JSON errors from the API Worker:
  ```ts
  return c.json({ error: { code: 'NOT_FOUND', message: 'Post not found' } }, 404);
  ```
- Log with structured JSON: `{ level, worker, action, duration_ms, error? }`
- Generate `X-Request-ID` at API entry, propagate in all logs
- LLM calls: exponential backoff (1s, 3s, 9s) on 429/5xx, max 3 attempts, then DLQ

## Secrets

- All secrets set via `wrangler secret put` — never in code, env files, or D1
- Access via `env.SECRET_NAME` in Workers
- Never log secret values
- Use `wrangler secret list` to verify all secrets are set

## Performance

- Workers have a 30s max execution time (50ms CPU on free plan, unlimited on paid)
- D1 queries should use indexes — verify with `EXPLAIN QUERY PLAN`
- Avoid N+1 queries — use JOINs and batch operations
- Memory Worker failures are isolated and never block the content pipeline
