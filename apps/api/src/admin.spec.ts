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
  for (const table of ['agent_model_history', 'agent_profiles', 'posts', 'users', 'providers']) {
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
