import { env, applyD1Migrations } from 'cloudflare:test';
import type { D1Migration } from 'cloudflare:test';
import { describe, it, expect, beforeEach } from 'vitest';
import {
  insertMemoryEvent,
  getMemoryEventsByIds,
  hasRecentlyPostedOnTopic,
} from '@arguon/shared';
import type { AgentMemory } from '@arguon/shared';
import { formatMemoryBlock } from '@arguon/shared';

function seedUser(db: D1Database, id: string) {
  return db
    .prepare(
      "INSERT INTO users (id, clerk_user_id, handle, name, is_ai, created_at) VALUES (?, ?, ?, ?, 1, ?)",
    )
    .bind(id, `clerk_${id}`, id, id, new Date().toISOString())
    .run();
}

function makeMemory(overrides: Partial<AgentMemory> = {}): AgentMemory {
  return {
    id: overrides.id ?? crypto.randomUUID(),
    agent_id: overrides.agent_id ?? 'agent1',
    event_type: overrides.event_type ?? 'posted',
    ref_type: overrides.ref_type ?? 'post',
    ref_id: overrides.ref_id ?? 'post_1',
    summary: overrides.summary ?? 'Test memory summary',
    topics_json: overrides.topics_json ?? '["technology"]',
    initial_weight: overrides.initial_weight ?? 1.0,
    created_at: overrides.created_at ?? new Date().toISOString(),
  };
}

describe('memory-d1', () => {
  beforeEach(async () => {
    const migrations = env.D1_MIGRATIONS as D1Migration[];
    await applyD1Migrations(env.DB, migrations);
    await env.DB.exec('PRAGMA foreign_keys = OFF');
    for (const table of ['agent_memory', 'users']) {
      await env.DB.exec(`DELETE FROM ${table}`);
    }
    await env.DB.exec('PRAGMA foreign_keys = ON');
    await seedUser(env.DB, 'agent1');
  });

  it('inserts a memory event into D1', async () => {
    const memory = makeMemory();
    await insertMemoryEvent(memory, env.DB);

    const row = await env.DB
      .prepare('SELECT * FROM agent_memory WHERE id = ?')
      .bind(memory.id)
      .first<AgentMemory>();

    expect(row).toBeDefined();
    expect(row!.agent_id).toBe('agent1');
    expect(row!.event_type).toBe('posted');
    expect(row!.summary).toBe('Test memory summary');
    expect(row!.initial_weight).toBe(1.0);
  });

  it('retrieves memory events by IDs', async () => {
    const m1 = makeMemory({ id: 'mem1' });
    const m2 = makeMemory({ id: 'mem2', event_type: 'commented', ref_type: 'comment' });
    await insertMemoryEvent(m1, env.DB);
    await insertMemoryEvent(m2, env.DB);

    const results = await getMemoryEventsByIds(['mem1', 'mem2'], env.DB);
    expect(results).toHaveLength(2);
  });

  it('returns empty array for no matching IDs', async () => {
    const results = await getMemoryEventsByIds([], env.DB);
    expect(results).toEqual([]);
  });
});

describe('hasRecentlyPostedOnTopic', () => {
  beforeEach(async () => {
    const migrations = env.D1_MIGRATIONS as D1Migration[];
    await applyD1Migrations(env.DB, migrations);
    await env.DB.exec('PRAGMA foreign_keys = OFF');
    for (const table of ['agent_memory', 'users']) {
      await env.DB.exec(`DELETE FROM ${table}`);
    }
    await env.DB.exec('PRAGMA foreign_keys = ON');
    await seedUser(env.DB, 'agent1');
  });

  it('returns true when matching post exists in window', async () => {
    const memory = makeMemory({
      event_type: 'posted',
      topics_json: '["technology","science"]',
      created_at: new Date().toISOString(),
    });
    await insertMemoryEvent(memory, env.DB);

    const result = await hasRecentlyPostedOnTopic('agent1', 'technology', 2, env.DB);
    expect(result).toBe(true);
  });

  it('returns false when no matching post', async () => {
    const result = await hasRecentlyPostedOnTopic('agent1', 'sports', 2, env.DB);
    expect(result).toBe(false);
  });

  it('returns false when post is outside time window', async () => {
    const oldDate = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString();
    const memory = makeMemory({
      event_type: 'posted',
      topics_json: '["economy"]',
      created_at: oldDate,
    });
    await insertMemoryEvent(memory, env.DB);

    const result = await hasRecentlyPostedOnTopic('agent1', 'economy', 2, env.DB);
    expect(result).toBe(false);
  });

  it('returns false when event is read_article, not posted', async () => {
    const memory = makeMemory({
      event_type: 'read_article',
      ref_type: 'article',
      topics_json: '["geopolitics"]',
    });
    await insertMemoryEvent(memory, env.DB);

    const result = await hasRecentlyPostedOnTopic('agent1', 'geopolitics', 2, env.DB);
    expect(result).toBe(false);
  });
});

describe('decay-formula', () => {
  it('lambda=0.10, days=7 → current_weight ≈ 0.496', () => {
    const weight = 1.0 * Math.exp(-0.10 * 7);
    expect(weight).toBeCloseTo(0.4966, 3);
  });

  it('lambda=0.10, days=30 → current_weight ≈ 0.050', () => {
    const weight = 1.0 * Math.exp(-0.10 * 30);
    expect(weight).toBeCloseTo(0.0498, 3);
  });

  it('lambda=0.05, days=14 → current_weight ≈ 0.497 (long memory)', () => {
    const weight = 1.0 * Math.exp(-0.05 * 14);
    expect(weight).toBeCloseTo(0.4966, 3);
  });

  it('lambda=0.20, days=3.5 → current_weight ≈ 0.497 (short memory)', () => {
    const weight = 1.0 * Math.exp(-0.20 * 3.5);
    expect(weight).toBeCloseTo(0.4966, 3);
  });
});

describe('formatMemoryBlock', () => {
  it('formats memories with weight labels', () => {
    const now = new Date().toISOString();
    const twoDaysAgo = new Date(Date.now() - 2 * 86_400_000).toISOString();

    const memories = [
      {
        id: '1',
        event_type: 'posted' as const,
        summary: 'Posted about climate change legislation',
        current_weight: 0.85,
        cosine_similarity: 0.9,
        created_at: now,
      },
      {
        id: '2',
        event_type: 'read_article' as const,
        summary: 'Read article: "WHO pledges $12B" (economy, health)',
        current_weight: 0.2,
        cosine_similarity: 0.7,
        created_at: twoDaysAgo,
      },
    ];

    const block = formatMemoryBlock(memories);
    expect(block).toContain('[posted]');
    expect(block).toContain('(memory: vivid)');
    expect(block).toContain('[read_article]');
    expect(block).toContain('(memory: faint)');
  });

  it('returns empty string for no memories', () => {
    expect(formatMemoryBlock([])).toBe('');
  });
});
