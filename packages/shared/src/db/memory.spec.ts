import { env } from 'cloudflare:test';
import { describe, it, expect, beforeEach } from 'vitest';
import { insertMemoryEvent, getMemoryEventsByIds, pruneOldMemories } from '../db/memory.js';
import { applyMigrations } from '../db/test-helpers.js';
import type { AgentMemory } from '../types/memory.js';

function makeMemory(overrides: Partial<AgentMemory> = {}): AgentMemory {
  return {
    id: 'm1',
    agent_id: 'u1',
    event_type: 'posted',
    ref_type: 'post',
    ref_id: 'p1',
    summary: 'Discussed climate change',
    topics_json: '["climate","environment"]',
    initial_weight: 1.0,
    created_at: '2025-06-01T12:00:00Z',
    ...overrides,
  };
}

describe('memory', () => {
  beforeEach(async () => {
    await applyMigrations(env.DB);
    await env.DB.exec(
      "INSERT INTO users (id, handle, name, is_ai, created_at) VALUES ('u1', 'agent1', 'Agent One', 1, '2025-01-01T00:00:00Z')",
    );
  });

  describe('insertMemoryEvent', () => {
    it('inserts a memory event', async () => {
      await insertMemoryEvent(makeMemory(), env.DB);
      const events = await getMemoryEventsByIds(['m1'], env.DB);
      expect(events).toHaveLength(1);
      expect(events[0].summary).toBe('Discussed climate change');
    });
  });

  describe('getMemoryEventsByIds', () => {
    it('returns empty array for empty ids', async () => {
      const events = await getMemoryEventsByIds([], env.DB);
      expect(events).toHaveLength(0);
    });

    it('retrieves multiple events by ids', async () => {
      await insertMemoryEvent(makeMemory({ id: 'm1' }), env.DB);
      await insertMemoryEvent(makeMemory({ id: 'm2', ref_id: 'p2' }), env.DB);

      const events = await getMemoryEventsByIds(['m1', 'm2'], env.DB);
      expect(events).toHaveLength(2);
    });
  });

  describe('pruneOldMemories', () => {
    it('keeps only the most recent N memories', async () => {
      await insertMemoryEvent(makeMemory({ id: 'm1', created_at: '2025-06-01T10:00:00Z' }), env.DB);
      await insertMemoryEvent(makeMemory({ id: 'm2', created_at: '2025-06-01T11:00:00Z' }), env.DB);
      await insertMemoryEvent(makeMemory({ id: 'm3', created_at: '2025-06-01T12:00:00Z' }), env.DB);

      await pruneOldMemories('u1', 2, env.DB);

      const remaining = await getMemoryEventsByIds(['m1', 'm2', 'm3'], env.DB);
      expect(remaining).toHaveLength(2);
      expect(remaining.map((r) => r.id).sort()).toEqual(['m2', 'm3']);
    });
  });
});
