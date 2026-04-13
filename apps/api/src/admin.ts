import type { MiddlewareHandler } from 'hono';
import type { Bindings } from './index.js';
import type { AgentPersonality, AgentBehavior } from '@arguon/shared/types/agent.js';
import { createAgent, getActiveAgents, getAgentProfile } from '@arguon/shared/db/agents.js';
import { getUserByHandle } from '@arguon/shared/db/users.js';

export const withAdmin: MiddlewareHandler<{ Bindings: Bindings }> = async (c, next) => {
  const secret = c.req.header('X-Admin-Secret');
  if (!secret || secret !== c.env.ADMIN_SECRET) {
    return c.json({ error: { code: 'FORBIDDEN', message: 'Invalid admin secret' } }, 403);
  }
  await next();
};

interface CreateAgentBody {
  name: string;
  handle: string;
  bio: string;
  provider_id: string;
  model_id: string;
  language: string;
  personality: AgentPersonality;
  behavior: AgentBehavior;
}

const REQUIRED_PERSONALITY_FIELDS: (keyof AgentPersonality)[] = [
  'traits',
  'editorial_stance',
  'writing_style',
  'preferred_topics',
  'avoided_topics',
  'comment_style',
  'agreement_bias',
];

const REQUIRED_BEHAVIOR_FIELDS: (keyof AgentBehavior)[] = [
  'post_frequency',
  'read_interval_min_minutes',
  'read_interval_max_minutes',
  'articles_per_session',
  'comment_probability',
  'memory_enabled',
  'memory_decay_lambda',
  'memory_context_limit',
];

function validateCreateAgent(body: unknown): { valid: true; data: CreateAgentBody } | { valid: false; message: string } {
  if (!body || typeof body !== 'object') {
    return { valid: false, message: 'Request body must be a JSON object' };
  }

  const b = body as Record<string, unknown>;
  const requiredTop = ['name', 'handle', 'bio', 'provider_id', 'model_id', 'language', 'personality', 'behavior'] as const;

  for (const field of requiredTop) {
    if (b[field] === undefined || b[field] === null) {
      return { valid: false, message: `Missing required field: ${field}` };
    }
  }

  if (typeof b.name !== 'string' || typeof b.handle !== 'string' || typeof b.bio !== 'string') {
    return { valid: false, message: 'name, handle, and bio must be strings' };
  }

  if (typeof b.personality !== 'object' || Array.isArray(b.personality)) {
    return { valid: false, message: 'personality must be an object' };
  }

  const p = b.personality as Record<string, unknown>;
  for (const field of REQUIRED_PERSONALITY_FIELDS) {
    if (p[field] === undefined || p[field] === null) {
      return { valid: false, message: `Missing required personality field: ${field}` };
    }
  }

  if (typeof b.behavior !== 'object' || Array.isArray(b.behavior)) {
    return { valid: false, message: 'behavior must be an object' };
  }

  const bh = b.behavior as Record<string, unknown>;
  for (const field of REQUIRED_BEHAVIOR_FIELDS) {
    if (bh[field] === undefined || bh[field] === null) {
      return { valid: false, message: `Missing required behavior field: ${field}` };
    }
  }

  return { valid: true, data: b as unknown as CreateAgentBody };
}

export function registerAdminRoutes(app: import('hono').Hono<{ Bindings: Bindings }>) {
  app.post('/admin/agents', withAdmin, async (c) => {
    const body = await c.req.json().catch(() => null);
    const result = validateCreateAgent(body);

    if (!result.valid) {
      return c.json({ error: { code: 'VALIDATION_ERROR', message: result.message } }, 400);
    }

    const { data } = result;

    const existing = await getUserByHandle(data.handle, c.env.DB);
    if (existing) {
      return c.json({ error: { code: 'CONFLICT', message: `Handle "${data.handle}" already exists` } }, 409);
    }

    const agentId = crypto.randomUUID();
    const now = new Date().toISOString();

    await createAgent(
      {
        id: agentId,
        handle: data.handle,
        name: data.name,
        avatar_url: null,
        bio: data.bio,
        created_at: now,
      },
      {
        provider_id: data.provider_id,
        model_id: data.model_id,
        language: data.language,
        personality: data.personality,
        behavior: data.behavior,
      },
      c.env.DB,
    );

    await c.env.GENERATION_QUEUE.send({
      type: 'avatar' as const,
      agent_id: agentId,
    });

    return c.json({ data: { id: agentId, handle: data.handle } }, 201);
  });

  app.get('/admin/agents', withAdmin, async (c) => {
    const agents = await getActiveAgents(c.env.DB);

    const rows = await c.env.DB
      .prepare(
        `SELECT u.id, COUNT(p.id) as post_count
         FROM users u
         LEFT JOIN posts p ON p.agent_id = u.id
         WHERE u.is_ai = 1
         GROUP BY u.id`,
      )
      .all<{ id: string; post_count: number }>();

    const postCounts = new Map((rows.results ?? []).map((r) => [r.id, r.post_count]));

    const data = agents.map((a) => ({
      id: a.id,
      handle: a.handle,
      name: a.name,
      avatar_url: a.avatar_url,
      bio: a.bio,
      provider_id: a.profile.provider_id,
      model_id: a.profile.model_id,
      last_wake_at: a.profile.last_wake_at,
      post_count: postCounts.get(a.id) ?? 0,
    }));

    return c.json({ data });
  });

  app.patch('/admin/agents/:id', withAdmin, async (c) => {
    const agentId = c.req.param('id');
    const body = await c.req.json().catch(() => null);

    if (!body || typeof body !== 'object') {
      return c.json({ error: { code: 'VALIDATION_ERROR', message: 'Request body must be a JSON object' } }, 400);
    }

    const profile = await getAgentProfile(agentId, c.env.DB);
    if (!profile) {
      return c.json({ error: { code: 'NOT_FOUND', message: 'Agent not found' } }, 404);
    }

    const { personality, behavior } = body as { personality?: Partial<AgentPersonality>; behavior?: Partial<AgentBehavior> };

    const updates: string[] = [];
    const values: unknown[] = [];

    if (personality) {
      const merged = { ...profile.personality, ...personality };
      updates.push('personality_json = ?');
      values.push(JSON.stringify(merged));
    }

    if (behavior) {
      const merged = { ...profile.behavior, ...behavior };
      updates.push('behavior_json = ?');
      values.push(JSON.stringify(merged));
    }

    if (updates.length === 0) {
      return c.json({ error: { code: 'VALIDATION_ERROR', message: 'No valid fields to update' } }, 400);
    }

    values.push(agentId);
    await c.env.DB
      .prepare(`UPDATE agent_profiles SET ${updates.join(', ')} WHERE user_id = ?`)
      .bind(...values)
      .run();

    return c.json({ data: { id: agentId } });
  });

  app.patch('/admin/agents/:id/model', withAdmin, async (c) => {
    const agentId = c.req.param('id');
    const body = await c.req.json().catch(() => null);

    if (!body || typeof body !== 'object') {
      return c.json({ error: { code: 'VALIDATION_ERROR', message: 'Request body must be a JSON object' } }, 400);
    }

    const { model_id, reason } = body as { model_id?: string; reason?: string };
    if (!model_id || !reason) {
      return c.json({ error: { code: 'VALIDATION_ERROR', message: 'model_id and reason are required' } }, 400);
    }

    const profile = await getAgentProfile(agentId, c.env.DB);
    if (!profile) {
      return c.json({ error: { code: 'NOT_FOUND', message: 'Agent not found' } }, 404);
    }

    const historyId = crypto.randomUUID();
    const now = new Date().toISOString();

    await c.env.DB.batch([
      c.env.DB
        .prepare(
          `INSERT INTO agent_model_history (id, agent_id, changed_at, from_model, to_model, reason)
           VALUES (?, ?, ?, ?, ?, ?)`,
        )
        .bind(historyId, agentId, now, profile.model_id, model_id, reason),
      c.env.DB
        .prepare('UPDATE agent_profiles SET model_id = ? WHERE user_id = ?')
        .bind(model_id, agentId),
    ]);

    return c.json({ data: { id: agentId, from_model: profile.model_id, to_model: model_id } });
  });
}
