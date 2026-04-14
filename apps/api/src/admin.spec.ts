import {
  createExecutionContext,
  env,
  applyD1Migrations,
  waitOnExecutionContext,
} from 'cloudflare:test';
import type { D1Migration } from 'cloudflare:test';
import { describe, it, expect, beforeEach } from 'vitest';
import app from './index.js';

async function request(path: string, init?: RequestInit): Promise<Response> {
  const req = new Request(`http://localhost${path}`, init);
  const ctx = createExecutionContext();
  const res = await app.fetch(req, env, ctx);
  await waitOnExecutionContext(ctx);
  return res;
}

const ADMIN_SECRET = 'test-admin-secret';

const validAgent = {
  name: 'TestBot',
  handle: 'testbot',
  bio: 'A test agent',
  provider_id: 'anthropic',
  model_id: 'claude-haiku-4-5',
  language: 'en',
  personality: {
    traits: ['analytical', 'calm'],
    editorial_stance: 'centrist',
    writing_style: 'concise',
    preferred_topics: ['technology'],
    avoided_topics: ['sports'],
    comment_style: 'constructive',
    agreement_bias: 0.0,
  },
  behavior: {
    post_frequency: 'medium',
    read_interval_min_minutes: 30,
    read_interval_max_minutes: 90,
    articles_per_session: 3,
    comment_probability: 0.5,
    memory_enabled: true,
    memory_decay_lambda: 0.1,
    memory_context_limit: 5,
  },
};

beforeEach(async () => {
  const migrations = env.D1_MIGRATIONS as D1Migration[];
  await applyD1Migrations(env.DB, migrations);
  await env.DB.exec('PRAGMA foreign_keys = OFF');
  for (const table of ['daily_budget', 'moderation_log', 'dlq_log', 'news_sources', 'agent_model_history', 'agent_profiles', 'posts', 'users', 'providers']) {
    await env.DB.exec(`DELETE FROM ${table}`);
  }
  await env.DB.exec('PRAGMA foreign_keys = ON');

  // Seed required provider for FK constraint
  await env.DB.exec(
    `INSERT INTO providers (id, name, api_base) VALUES ('anthropic', 'Anthropic', 'https://api.anthropic.com')`,
  );
});

describe('Admin endpoints', () => {
  describe('POST /admin/agents', () => {
    it('returns 403 without X-Admin-Secret', async () => {
      const res = await request('/admin/agents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(validAgent),
      });
      expect(res.status).toBe(403);
    });

    it('returns 403 with wrong secret', async () => {
      const res = await request('/admin/agents', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Admin-Secret': 'wrong-secret',
        },
        body: JSON.stringify(validAgent),
      });
      expect(res.status).toBe(403);
    });

    it('returns 400 with missing required fields', async () => {
      const res = await request('/admin/agents', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Admin-Secret': ADMIN_SECRET,
        },
        body: JSON.stringify({ name: 'Incomplete' }),
      });
      expect(res.status).toBe(400);
      const data = await res.json() as { error: { code: string } };
      expect(data.error.code).toBe('VALIDATION_ERROR');
    });

    it('creates agent with valid payload', async () => {
      const res = await request('/admin/agents', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Admin-Secret': ADMIN_SECRET,
        },
        body: JSON.stringify(validAgent),
      });
      expect(res.status).toBe(201);
      const data = await res.json() as { data: { id: string; handle: string } };
      expect(data.data.handle).toBe('testbot');
      expect(data.data.id).toBeTruthy();
    });

    it('returns 409 for duplicate handle', async () => {
      // First create
      await request('/admin/agents', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Admin-Secret': ADMIN_SECRET,
        },
        body: JSON.stringify({ ...validAgent, handle: 'dupebot' }),
      });

      // Second create with same handle
      const res = await request('/admin/agents', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Admin-Secret': ADMIN_SECRET,
        },
        body: JSON.stringify({ ...validAgent, handle: 'dupebot' }),
      });
      expect(res.status).toBe(409);
    });
  });

  describe('GET /admin/agents', () => {
    it('returns 403 without admin secret', async () => {
      const res = await request('/admin/agents');
      expect(res.status).toBe(403);
    });

    it('returns list of agents', async () => {
      // Create an agent first
      await request('/admin/agents', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Admin-Secret': ADMIN_SECRET,
        },
        body: JSON.stringify({ ...validAgent, handle: 'listbot' }),
      });

      const res = await request('/admin/agents', {
        headers: { 'X-Admin-Secret': ADMIN_SECRET },
      });
      expect(res.status).toBe(200);
      const data = await res.json() as { data: { handle: string }[] };
      expect(data.data.length).toBeGreaterThan(0);
      expect(data.data.some((a) => a.handle === 'listbot')).toBe(true);
    });
  });

  describe('PATCH /admin/agents/:id', () => {
    it('returns 404 for non-existent agent', async () => {
      const res = await request('/admin/agents/nonexistent', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'X-Admin-Secret': ADMIN_SECRET,
        },
        body: JSON.stringify({ personality: { traits: ['updated'] } }),
      });
      expect(res.status).toBe(404);
    });

    it('updates personality fields', async () => {
      const createRes = await request('/admin/agents', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Admin-Secret': ADMIN_SECRET,
        },
        body: JSON.stringify({ ...validAgent, handle: 'patchbot' }),
      });
      const { data: created } = await createRes.json() as { data: { id: string } };

      const res = await request(`/admin/agents/${created.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'X-Admin-Secret': ADMIN_SECRET,
        },
        body: JSON.stringify({ personality: { traits: ['updated', 'trait'] } }),
      });
      expect(res.status).toBe(200);
    });
  });

  describe('PATCH /admin/agents/:id/model', () => {
    it('returns 400 without model_id or reason', async () => {
      const createRes = await request('/admin/agents', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Admin-Secret': ADMIN_SECRET,
        },
        body: JSON.stringify({ ...validAgent, handle: 'modelbot' }),
      });
      const { data: created } = await createRes.json() as { data: { id: string } };

      const res = await request(`/admin/agents/${created.id}/model`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'X-Admin-Secret': ADMIN_SECRET,
        },
        body: JSON.stringify({ model_id: 'new-model' }),
      });
      expect(res.status).toBe(400);
    });

    it('updates model and logs history', async () => {
      const createRes = await request('/admin/agents', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Admin-Secret': ADMIN_SECRET,
        },
        body: JSON.stringify({ ...validAgent, handle: 'modelbot2' }),
      });
      const { data: created } = await createRes.json() as { data: { id: string } };

      const res = await request(`/admin/agents/${created.id}/model`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'X-Admin-Secret': ADMIN_SECRET,
        },
        body: JSON.stringify({ model_id: 'gemini-flash', reason: 'Testing migration' }),
      });
      expect(res.status).toBe(200);
      const data = await res.json() as { data: { from_model: string; to_model: string } };
      expect(data.data.from_model).toBe('claude-haiku-4-5');
      expect(data.data.to_model).toBe('gemini-flash');
    });
  });
});

describe('Admin budget endpoints', () => {
  describe('GET /admin/budget', () => {
    it('returns 403 without admin secret', async () => {
      const res = await request('/admin/budget');
      expect(res.status).toBe(403);
    });

    it('returns providers with budget data', async () => {
      const res = await request('/admin/budget', {
        headers: { 'X-Admin-Secret': ADMIN_SECRET },
      });
      expect(res.status).toBe(200);
      const data = await res.json() as { data: { provider_id: string; provider_name: string }[] };
      expect(Array.isArray(data.data)).toBe(true);
      expect(data.data.some((p) => p.provider_id === 'anthropic')).toBe(true);
    });
  });

  describe('PATCH /admin/budget/:provider_id', () => {
    it('returns 403 without admin secret', async () => {
      const res = await request('/admin/budget/anthropic', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cap_usd: 5.0 }),
      });
      expect(res.status).toBe(403);
    });

    it('updates cap_usd', async () => {
      const res = await request('/admin/budget/anthropic', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'X-Admin-Secret': ADMIN_SECRET,
        },
        body: JSON.stringify({ cap_usd: 5.0 }),
      });
      expect(res.status).toBe(200);

      // Verify in DB
      const budget = await request('/admin/budget', {
        headers: { 'X-Admin-Secret': ADMIN_SECRET },
      });
      const data = await budget.json() as { data: { provider_id: string; cap_usd: number }[] };
      const anthropic = data.data.find((p) => p.provider_id === 'anthropic');
      expect(anthropic?.cap_usd).toBe(5.0);
    });

    it('pauses and resumes a provider', async () => {
      // Pause
      let res = await request('/admin/budget/anthropic', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'X-Admin-Secret': ADMIN_SECRET,
        },
        body: JSON.stringify({ is_paused: true }),
      });
      expect(res.status).toBe(200);

      let budget = await request('/admin/budget', {
        headers: { 'X-Admin-Secret': ADMIN_SECRET },
      });
      let data = await budget.json() as { data: { provider_id: string; is_paused: number }[] };
      expect(data.data.find((p) => p.provider_id === 'anthropic')?.is_paused).toBe(1);

      // Resume
      res = await request('/admin/budget/anthropic', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'X-Admin-Secret': ADMIN_SECRET,
        },
        body: JSON.stringify({ is_paused: false }),
      });
      expect(res.status).toBe(200);

      budget = await request('/admin/budget', {
        headers: { 'X-Admin-Secret': ADMIN_SECRET },
      });
      data = await budget.json() as { data: { provider_id: string; is_paused: number }[] };
      expect(data.data.find((p) => p.provider_id === 'anthropic')?.is_paused).toBe(0);
    });

    it('returns 400 with no valid fields', async () => {
      const res = await request('/admin/budget/anthropic', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'X-Admin-Secret': ADMIN_SECRET,
        },
        body: JSON.stringify({}),
      });
      expect(res.status).toBe(400);
    });
  });
});

describe('Admin source endpoints', () => {
  describe('GET /admin/sources', () => {
    it('returns 403 without admin secret', async () => {
      const res = await request('/admin/sources');
      expect(res.status).toBe(403);
    });

    it('returns all sources', async () => {
      // Seed a source
      await env.DB.exec(
        `INSERT INTO news_sources (id, name, url, type, language, reliability_score, is_active, consecutive_failures) VALUES ('src-1', 'Test RSS', 'https://rss.example.com', 'rss', 'en', 0.8, 1, 0)`,
      );

      const res = await request('/admin/sources', {
        headers: { 'X-Admin-Secret': ADMIN_SECRET },
      });
      expect(res.status).toBe(200);
      const data = await res.json() as { data: { id: string }[] };
      expect(data.data.some((s) => s.id === 'src-1')).toBe(true);
    });
  });

  describe('POST /admin/sources', () => {
    it('creates a new source', async () => {
      const res = await request('/admin/sources', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Admin-Secret': ADMIN_SECRET,
        },
        body: JSON.stringify({
          name: 'New Source',
          url: 'https://news.example.com/feed',
          type: 'rss',
          language: 'en',
          reliability_score: 0.9,
        }),
      });
      expect(res.status).toBe(201);
      const data = await res.json() as { data: { id: string } };
      expect(data.data.id).toBeTruthy();
    });

    it('returns 400 with missing fields', async () => {
      const res = await request('/admin/sources', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Admin-Secret': ADMIN_SECRET,
        },
        body: JSON.stringify({ name: 'Incomplete' }),
      });
      expect(res.status).toBe(400);
    });

    it('returns 400 with invalid type', async () => {
      const res = await request('/admin/sources', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Admin-Secret': ADMIN_SECRET,
        },
        body: JSON.stringify({
          name: 'Bad Type',
          url: 'https://example.com',
          type: 'invalid',
          language: 'en',
        }),
      });
      expect(res.status).toBe(400);
    });
  });

  describe('PATCH /admin/sources/:id', () => {
    it('updates an existing source', async () => {
      await env.DB.exec(
        `INSERT OR IGNORE INTO news_sources (id, name, url, type, language, reliability_score, is_active, consecutive_failures) VALUES ('src-patch', 'Patchable', 'https://patch.example.com', 'rss', 'en', 0.5, 1, 0)`,
      );

      const res = await request('/admin/sources/src-patch', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'X-Admin-Secret': ADMIN_SECRET,
        },
        body: JSON.stringify({ reliability_score: 0.95, is_active: 0 }),
      });
      expect(res.status).toBe(200);
    });

    it('returns 404 for non-existent source', async () => {
      const res = await request('/admin/sources/nonexistent', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'X-Admin-Secret': ADMIN_SECRET,
        },
        body: JSON.stringify({ name: 'Updated' }),
      });
      expect(res.status).toBe(404);
    });
  });

  describe('DELETE /admin/sources/:id', () => {
    it('deletes an existing source', async () => {
      await env.DB.exec(
        `INSERT OR IGNORE INTO news_sources (id, name, url, type, language, reliability_score, is_active, consecutive_failures) VALUES ('src-del', 'Deletable', 'https://delete.example.com', 'rss', 'en', 0.5, 1, 0)`,
      );

      const res = await request('/admin/sources/src-del', {
        method: 'DELETE',
        headers: { 'X-Admin-Secret': ADMIN_SECRET },
      });
      expect(res.status).toBe(200);

      // Verify deleted
      const check = await request('/admin/sources', {
        headers: { 'X-Admin-Secret': ADMIN_SECRET },
      });
      const data = await check.json() as { data: { id: string }[] };
      expect(data.data.some((s) => s.id === 'src-del')).toBe(false);
    });

    it('returns 404 for non-existent source', async () => {
      const res = await request('/admin/sources/nonexistent', {
        method: 'DELETE',
        headers: { 'X-Admin-Secret': ADMIN_SECRET },
      });
      expect(res.status).toBe(404);
    });
  });
});

describe('Admin moderation endpoint', () => {
  it('returns 403 without admin secret', async () => {
    const res = await request('/admin/moderation');
    expect(res.status).toBe(403);
  });

  it('returns moderation logs', async () => {
    await env.DB.exec(
      `INSERT INTO moderation_log (id, target_type, target_id, decision, reason, checked_at) VALUES ('mod-1', 'comment', 'c-1', 'approved', NULL, '2025-01-01T12:00:00Z')`,
    );
    await env.DB.exec(
      `INSERT INTO moderation_log (id, target_type, target_id, decision, reason, checked_at) VALUES ('mod-2', 'comment', 'c-2', 'rejected', 'Toxic', '2025-01-01T12:01:00Z')`,
    );

    const res = await request('/admin/moderation', {
      headers: { 'X-Admin-Secret': ADMIN_SECRET },
    });
    expect(res.status).toBe(200);
    const data = await res.json() as { data: { id: string; decision: string }[]; next_cursor: string | null };
    expect(data.data.length).toBe(2);
    // Should be sorted by checked_at DESC
    expect(data.data[0].id).toBe('mod-2');
  });

  it('filters by decision', async () => {
    await env.DB.exec(
      `INSERT OR IGNORE INTO moderation_log (id, target_type, target_id, decision, reason, checked_at) VALUES ('mod-3', 'comment', 'c-3', 'approved', NULL, '2025-01-01T12:02:00Z')`,
    );
    await env.DB.exec(
      `INSERT OR IGNORE INTO moderation_log (id, target_type, target_id, decision, reason, checked_at) VALUES ('mod-4', 'comment', 'c-4', 'rejected', 'Spam', '2025-01-01T12:03:00Z')`,
    );

    const res = await request('/admin/moderation?decision=rejected', {
      headers: { 'X-Admin-Secret': ADMIN_SECRET },
    });
    expect(res.status).toBe(200);
    const data = await res.json() as { data: { decision: string }[] };
    expect(data.data.every((m) => m.decision === 'rejected')).toBe(true);
  });
});

describe('Admin DLQ endpoint', () => {
  it('returns 403 without admin secret', async () => {
    const res = await request('/admin/dlq');
    expect(res.status).toBe(403);
  });

  it('returns DLQ entries', async () => {
    await env.DB.exec(
      `INSERT INTO dlq_log (id, queue_name, payload_json, error, failed_at, retry_count) VALUES ('dlq-1', 'generation', '{}', 'Timeout', '2025-01-01T12:00:00Z', 3)`,
    );
    await env.DB.exec(
      `INSERT INTO dlq_log (id, queue_name, payload_json, error, failed_at, retry_count) VALUES ('dlq-2', 'ingestion', '{}', 'Parse error', '2025-01-01T12:01:00Z', 1)`,
    );

    const res = await request('/admin/dlq', {
      headers: { 'X-Admin-Secret': ADMIN_SECRET },
    });
    expect(res.status).toBe(200);
    const data = await res.json() as { data: { id: string }[]; next_cursor: string | null };
    expect(data.data.length).toBe(2);
    // Should be sorted by failed_at DESC
    expect(data.data[0].id).toBe('dlq-2');
  });
});

describe('GET /users/:handle', () => {
  it('returns 404 for unknown handle', async () => {
    const res = await request('/users/unknown');
    expect(res.status).toBe(404);
  });

  it('returns agent profile for AI user', async () => {
    // Create agent
    const createRes = await request('/admin/agents', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Admin-Secret': ADMIN_SECRET,
      },
      body: JSON.stringify({ ...validAgent, handle: 'profilebot' }),
    });
    expect(createRes.status).toBe(201);

    const res = await request('/users/profilebot');
    expect(res.status).toBe(200);
    const data = await res.json() as {
      data: {
        handle: string;
        is_ai: boolean;
        personality: { traits: string[] };
        model_id: string;
      };
    };
    expect(data.data.handle).toBe('profilebot');
    expect(data.data.is_ai).toBe(true);
    expect(data.data.personality.traits).toContain('analytical');
    expect(data.data.model_id).toBe('claude-haiku-4-5');
  });
});
