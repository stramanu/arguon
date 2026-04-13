import { env } from 'cloudflare:test';
import { describe, it, expect, beforeEach } from 'vitest';
import { upsertReaction, deleteReaction, getReactionCounts, getUserReaction } from '../db/reactions.js';
import { applyMigrations } from '../db/test-helpers.js';

describe('reactions', () => {
  beforeEach(async () => {
    await applyMigrations(env.DB);
    await env.DB.exec(
      "INSERT INTO users (id, handle, name, is_ai, created_at) VALUES ('u1', 'john', 'John', 0, '2025-01-01T00:00:00Z')",
    );
    await env.DB.exec(
      "INSERT INTO posts (id, agent_id, headline, summary, created_at) VALUES ('p1', 'u1', 'Test', 'Summary', '2025-06-01T00:00:00Z')",
    );
  });

  describe('upsertReaction', () => {
    it('inserts a new reaction', async () => {
      await upsertReaction(
        { id: 'r1', user_id: 'u1', target_type: 'post', target_id: 'p1', reaction_type: 'agree', created_at: '2025-06-01T12:00:00Z' },
        env.DB,
      );
      const reaction = await getUserReaction('u1', 'post', 'p1', env.DB);
      expect(reaction).toBeDefined();
      expect(reaction!.reaction_type).toBe('agree');
    });

    it('updates reaction type on conflict', async () => {
      await upsertReaction(
        { id: 'r1', user_id: 'u1', target_type: 'post', target_id: 'p1', reaction_type: 'agree', created_at: '2025-06-01T12:00:00Z' },
        env.DB,
      );
      await upsertReaction(
        { id: 'r2', user_id: 'u1', target_type: 'post', target_id: 'p1', reaction_type: 'doubtful', created_at: '2025-06-01T13:00:00Z' },
        env.DB,
      );
      const reaction = await getUserReaction('u1', 'post', 'p1', env.DB);
      expect(reaction!.reaction_type).toBe('doubtful');
    });
  });

  describe('deleteReaction', () => {
    it('removes a reaction', async () => {
      await upsertReaction(
        { id: 'r1', user_id: 'u1', target_type: 'post', target_id: 'p1', reaction_type: 'agree', created_at: '2025-06-01T12:00:00Z' },
        env.DB,
      );
      await deleteReaction('u1', 'post', 'p1', env.DB);
      const reaction = await getUserReaction('u1', 'post', 'p1', env.DB);
      expect(reaction).toBeNull();
    });
  });

  describe('getReactionCounts', () => {
    it('returns counts grouped by type', async () => {
      await env.DB.exec(
        "INSERT INTO users (id, handle, name, is_ai, created_at) VALUES ('u2', 'jane', 'Jane', 0, '2025-01-01T00:00:00Z')",
      );
      await upsertReaction(
        { id: 'r1', user_id: 'u1', target_type: 'post', target_id: 'p1', reaction_type: 'agree', created_at: '2025-06-01T12:00:00Z' },
        env.DB,
      );
      await upsertReaction(
        { id: 'r2', user_id: 'u2', target_type: 'post', target_id: 'p1', reaction_type: 'agree', created_at: '2025-06-01T12:00:00Z' },
        env.DB,
      );

      const counts = await getReactionCounts('post', 'p1', env.DB);
      expect(counts.agree).toBe(2);
      expect(counts.interesting).toBe(0);
      expect(counts.doubtful).toBe(0);
      expect(counts.insightful).toBe(0);
    });
  });
});
