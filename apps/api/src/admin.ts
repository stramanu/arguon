import type { MiddlewareHandler } from 'hono';
import type { Bindings } from './index.js';
import { createAgent, getActiveAgents, getAgentProfile } from '@arguon/shared/db/agents.js';
import { getUserByHandle } from '@arguon/shared/db/users.js';
import { getBudgetWithProviders, updateBudgetCap, setBudgetPaused } from '@arguon/shared/db/budget.js';
import { getAllSources, getSourceById, upsertSource, deleteSource } from '@arguon/shared/db/sources.js';
import { getModerationLogs } from '@arguon/shared/db/moderation.js';
import { getDlqEntries } from '@arguon/shared/db/dlq.js';
import {
  createAgentBody,
  updateAgentBody,
  migrateAgentModelBody,
  updateBudgetBody,
  createSourceBody,
  updateSourceBody,
  paginationQuery,
} from './schemas.js';
import { parseBody, parseQuery } from './validate.js';

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

export const withAdmin: MiddlewareHandler<{ Bindings: Bindings }> = async (c, next) => {
  const secret = c.req.header('X-Admin-Secret');
  if (!secret || !timingSafeEqual(secret, c.env.ADMIN_SECRET)) {
    return c.json({ error: { code: 'FORBIDDEN', message: 'Invalid admin secret' } }, 403);
  }
  await next();
};

export function registerAdminRoutes(app: import('hono').Hono<{ Bindings: Bindings }>) {
  app.post('/admin/agents', withAdmin, async (c) => {
    const body = await c.req.json().catch(() => null);
    const data = parseBody(createAgentBody, body, c);
    if (data instanceof Response) return data;

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

    const parsed = parseBody(updateAgentBody, body, c);
    if (parsed instanceof Response) return parsed;

    const profile = await getAgentProfile(agentId, c.env.DB);
    if (!profile) {
      return c.json({ error: { code: 'NOT_FOUND', message: 'Agent not found' } }, 404);
    }

    const updates: string[] = [];
    const values: unknown[] = [];

    if (parsed.personality) {
      const merged = { ...profile.personality, ...parsed.personality };
      updates.push('personality_json = ?');
      values.push(JSON.stringify(merged));
    }

    if (parsed.behavior) {
      const merged = { ...profile.behavior, ...parsed.behavior };
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

    const parsed = parseBody(migrateAgentModelBody, body, c);
    if (parsed instanceof Response) return parsed;

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
        .bind(historyId, agentId, now, profile.model_id, parsed.model_id, parsed.reason),
      c.env.DB
        .prepare('UPDATE agent_profiles SET model_id = ? WHERE user_id = ?')
        .bind(parsed.model_id, agentId),
    ]);

    return c.json({ data: { id: agentId, from_model: profile.model_id, to_model: parsed.model_id } });
  });

  // --- Budget endpoints ---

  app.get('/admin/budget', withAdmin, async (c) => {
    const date = new Date().toISOString().slice(0, 10);
    const data = await getBudgetWithProviders(date, c.env.DB);
    return c.json({ data });
  });

  app.patch('/admin/budget/:provider_id', withAdmin, async (c) => {
    const providerId = c.req.param('provider_id');
    const body = await c.req.json().catch(() => null);

    const parsed = parseBody(updateBudgetBody, body, c);
    if (parsed instanceof Response) return parsed;

    const date = new Date().toISOString().slice(0, 10);

    if (parsed.cap_usd !== undefined) {
      await updateBudgetCap(providerId, date, parsed.cap_usd, c.env.DB);
    }

    if (parsed.is_paused !== undefined) {
      await setBudgetPaused(providerId, date, parsed.is_paused, c.env.DB);
    }

    return c.json({ data: { provider_id: providerId } });
  });

  // --- Source endpoints ---

  app.get('/admin/sources', withAdmin, async (c) => {
    const data = await getAllSources(c.env.DB);
    return c.json({ data });
  });

  app.post('/admin/sources', withAdmin, async (c) => {
    const body = await c.req.json().catch(() => null);

    const parsed = parseBody(createSourceBody, body, c);
    if (parsed instanceof Response) return parsed;

    const source = {
      id: crypto.randomUUID(),
      name: parsed.name,
      url: parsed.url,
      type: parsed.type,
      language: parsed.language,
      reliability_score: parsed.reliability_score,
      is_active: 1,
      consecutive_failures: 0,
      topics_json: parsed.topics_json ?? null,
    };

    await upsertSource(source, c.env.DB);
    return c.json({ data: { id: source.id } }, 201);
  });

  app.patch('/admin/sources/:id', withAdmin, async (c) => {
    const id = c.req.param('id');
    const existing = await getSourceById(id, c.env.DB);
    if (!existing) {
      return c.json({ error: { code: 'NOT_FOUND', message: 'Source not found' } }, 404);
    }

    const body = await c.req.json().catch(() => null);
    const parsed = parseBody(updateSourceBody, body, c);
    if (parsed instanceof Response) return parsed;

    const updated = {
      ...existing,
      name: parsed.name ?? existing.name,
      url: parsed.url ?? existing.url,
      type: parsed.type ?? existing.type,
      language: parsed.language ?? existing.language,
      reliability_score: parsed.reliability_score ?? existing.reliability_score,
      is_active: parsed.is_active ?? existing.is_active,
      topics_json: parsed.topics_json !== undefined ? parsed.topics_json : existing.topics_json,
    };

    await upsertSource(updated, c.env.DB);
    return c.json({ data: { id } });
  });

  app.delete('/admin/sources/:id', withAdmin, async (c) => {
    const id = c.req.param('id');
    const deleted = await deleteSource(id, c.env.DB);
    if (!deleted) {
      return c.json({ error: { code: 'NOT_FOUND', message: 'Source not found' } }, 404);
    }
    return c.json({ data: { id } });
  });

  // --- Moderation & DLQ endpoints ---

  app.get('/admin/moderation', withAdmin, async (c) => {
    const query = parseQuery(paginationQuery, c.req.query(), c);
    if (query instanceof Response) return query;
    const decision = c.req.query('decision') || undefined;
    const result = await getModerationLogs(query.limit, query.cursor, decision, c.env.DB);
    return c.json({ data: result.logs, next_cursor: result.next_cursor });
  });

  app.get('/admin/dlq', withAdmin, async (c) => {
    const query = parseQuery(paginationQuery, c.req.query(), c);
    if (query instanceof Response) return query;
    const result = await getDlqEntries(query.limit, query.cursor, c.env.DB);
    return c.json({ data: result.entries, next_cursor: result.next_cursor });
  });
}
